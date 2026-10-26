#!/usr/bin/env python3
"""tpw_data.py -- read TPW's submissions Sheet and answer the questions TPW staff ask.

Used by the TPW ChatGPT skills (chatgpt-plugin/), and copied into each skill that needs it
by scripts/build_chatgpt_skills.py. Edit this file, never a copy. Standard library only, so
it runs inside ChatGPT and in this repo's tests without installing anything.

The counting rules are Python copies of the website's, so the skills and the Dashboard agree:

    team-form/receiver/Dashboard.gs           sheet rows -> submissions
    team-dashboard/js/data.js                 the latest submission for each program wins
    team-dashboard/js/rac.js                  credit-day and facility-cost upper limits
    team-dashboard/js/submission-tracker.js   which quarter a submission belongs to

Change one of those and this file must change too: chatgpt-plugin/tests/parity.mjs runs both
on the same rows and fails if they disagree.

    python3 tpw_data.py missing SHEET [--members FILE] [--quarter 2026-Q4]
    python3 tpw_data.py totals  SHEET [--quarter 2026-Q4 | --year 2026 | --dashboard]
    python3 tpw_data.py check   SHEET [--members FILE] [--since 2026-10-01]
    python3 tpw_data.py member  SHEET --org NAME [--quarter 2026-Q4 | --year 2026 | --all]
    python3 tpw_data.py json    SHEET          (the Dashboard's view of the Sheet, for tests)

SHEET is the workbook downloaded as .xlsx (the submissions tab is found by its headings, so the
tab order and Excel's shortened tab name don't matter) or that one tab saved as .csv. Rows marked
Yes in the Test data column are left out unless --include-test is given. --today YYYY-MM-DD
pretends it is another day, for testing.
"""

import argparse
import base64
import binascii
import csv
import datetime as dt
import difflib
import io
import json
import math
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree

HERE = Path(__file__).resolve().parent
# Next to this file inside a skill; in the repo, the build script's inputs.
REFERENCE = HERE.parent / 'reference'

# The submissions tab's headings, as team-form/receiver/Rows.gs writes them (HEADER).
HEADER = [
    'CDCR Facility', 'Yard', 'Organization Name', 'Program Name',
    'Schedule Status (Planned, In Progress, Completed)', 'Start Date', 'End Date',
    'Total Programming hours', 'Number of Participants', 'Number of Participants Completed',
    'CALC: Total Participant Programming hours (Participants Completed * Total Programming Hours',
    'CALC: Program Year (Year of Program Start Date)', 'Notes',
    'Submission ID', 'Submitted At', 'Submitted By', 'Sign-in Checked', 'Reporting Quarter',
]
REQUIRED = ['facility', 'yard', 'organization', 'program', 'participants', 'completed', 'reference']

# rac.js: 10 credit days per 52 course hours, at most 40 per completion, $59 a day.
DAILY_RATE = 59
SERIAL_EPOCH = dt.datetime(1899, 12, 30, tzinfo=dt.timezone.utc)


class SheetError(Exception):
    """A problem with the file itself, said in plain words for a non-technical reader."""


# ---------------------------------------------------------------- reading the file

def normalize_header(value):
    # Code.gs normalizeFormHeader_: trim, collapse spaces, lower case.
    return re.sub(r'\s+', ' ', str(value or '').strip()).lower()


def column_index(reference):
    letters = re.match(r'[A-Z]+', reference).group(0)
    number = 0
    for letter in letters:
        number = number * 26 + ord(letter) - 64
    return number - 1


def read_xlsx_tabs(path):
    """Every tab of an .xlsx as {name: rows}, with numbers as numbers and dates as day counts.

    A downloaded Google Sheet stores dates as day counts with a date style, the same values the
    receiver reads back with SERIAL_NUMBER, so no date conversion happens here.
    """
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
          'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
    try:
        book = zipfile.ZipFile(path)
    except zipfile.BadZipFile:
        raise SheetError('This file isn’t a readable Excel workbook. Download the Sheet again as .xlsx, or save the submissions tab as .csv.')
    names = set(book.namelist())
    shared = []
    if 'xl/sharedStrings.xml' in names:
        for item in ElementTree.fromstring(book.read('xl/sharedStrings.xml')).findall('m:si', ns):
            # Plain text is one <t>; formatted text is several runs, each with its own <t>.
            shared.append(''.join(node.text or '' for node in item.iter('{%s}t' % ns['m'])))
    rels = ElementTree.fromstring(book.read('xl/_rels/workbook.xml.rels'))
    targets = {rel.get('Id'): rel.get('Target') for rel in rels}
    tabs = {}
    workbook = ElementTree.fromstring(book.read('xl/workbook.xml'))
    for sheet in workbook.find('m:sheets', ns):
        target = targets[sheet.get('{%s}id' % ns['r'])].lstrip('/')
        target = target if target.startswith('xl/') else 'xl/' + target
        rows = []
        for row in ElementTree.fromstring(book.read(target)).iter('{%s}row' % ns['m']):
            index = int(row.get('r')) - 1
            while len(rows) < index:
                rows.append([])
            values = []
            for cell in row.findall('m:c', ns):
                at = column_index(cell.get('r'))
                while len(values) < at:
                    values.append('')
                kind = cell.get('t')
                raw = cell.find('m:v', ns)
                text = raw.text if raw is not None else None
                if kind == 's':
                    value = shared[int(text)] if text is not None else ''
                elif kind == 'inlineStr':
                    value = ''.join(node.text or '' for node in cell.iter('{%s}t' % ns['m']))
                elif kind in ('str', 'e'):
                    value = text or ''
                elif kind == 'b':
                    value = text == '1'
                elif text is None:
                    value = ''
                else:
                    number = float(text)
                    value = int(number) if number.is_integer() else number
                values.append(value)
            rows.append(values)
        tabs[sheet.get('name')] = rows
    return tabs


def read_csv_rows(path):
    with open(path, newline='', encoding='utf-8-sig') as handle:
        return [row for row in csv.reader(handle)]


def find_submission_rows(tabs):
    """The tab whose first row has the submissions headings, whatever it is called."""
    wanted = {normalize_header(heading) for heading in HEADER[:4] + ['Submission ID']}
    matches = [name for name, rows in tabs.items()
               if rows and wanted <= {normalize_header(cell) for cell in rows[0]}]
    if not matches:
        raise SheetError('None of the tabs in this file has the submissions headings. '
                         'Use the tab called “Submissions; comes from website form DO NOT RENAME”.')
    # Prefer the real tab if a copy of it was also made.
    matches.sort(key=lambda name: (not name.lower().startswith('submissions'), name))
    return tabs[matches[0]]


def load_rows(path):
    """The submissions tab's rows, from whatever form the Sheet arrived in.

    Looks at what's in the file, not its name, because assistants save downloads under all
    sorts of names:

    - an Excel workbook (.xlsx), however it was downloaded;
    - a Google Drive tool's reply saved as text: JSON whose "content" is the file in base64;
    - a Google Sheets tool's reply: JSON with "values", the tab's rows;
    - a plain JSON list of rows (what the tests use, so the website's JavaScript and this
      file read exactly the same input);
    - the submissions tab saved as .csv.
    """
    path = Path(path)
    if not path.exists():
        raise SheetError(f'There is no file at {path}.')
    data = path.read_bytes()
    if data[:2] == b'PK':
        return find_submission_rows(read_xlsx_tabs(path))
    stripped = data.lstrip()[:1]
    if stripped in (b'{', b'['):
        try:
            parsed = json.loads(data.decode('utf-8-sig'))
        except ValueError:
            raise SheetError('This file looks like JSON but can’t be read. Download the Sheet again as an Excel file (.xlsx).')
        return rows_from_json(parsed, path)
    return find_submission_rows({path.stem: read_csv_rows(path)})


def rows_from_json(parsed, path):
    if isinstance(parsed, list):
        return find_submission_rows({path.stem: parsed})
    if isinstance(parsed, dict) and isinstance(parsed.get('values'), list):
        return find_submission_rows({path.stem: parsed['values']})
    if isinstance(parsed, dict) and isinstance(parsed.get('content'), str):
        try:
            content = base64.b64decode(parsed['content'], validate=False)
        except (binascii.Error, ValueError):
            raise SheetError('The downloaded file inside this reply can’t be decoded. Download the Sheet again as an Excel file (.xlsx).')
        if content[:2] == b'PK':
            return find_submission_rows(read_xlsx_tabs(io.BytesIO(content)))
        text_content = content.decode('utf-8-sig', errors='replace')
        return find_submission_rows({path.stem: list(csv.reader(text_content.splitlines()))})
    raise SheetError('This JSON file isn’t a copy of the Sheet. Download the Sheet as an Excel file (.xlsx).')


# ---------------------------------------------------------------- Dashboard.gs, in Python

def text(value):
    # dashboardText_: anything as trimmed text with single spaces.
    if value is None:
        return ''
    if isinstance(value, bool):
        return 'TRUE' if value else 'FALSE'
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return re.sub(r'\s+', ' ', str(value)).strip()


def as_number(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    value = text(value).replace(',', '')
    try:
        return float(value) if value else None
    except ValueError:
        return None


def count(value):
    # dashboardCount_: a whole number from 0 up, anything else 0.
    number = as_number(value)
    if number is None or math.isnan(number) or math.isinf(number) or number < 0 or number != math.floor(number):
        return 0
    return int(number)


def hours_value(value):
    # dashboardNumber_: a number from 0 up, anything else 0.
    number = as_number(value)
    if number is None or math.isnan(number) or math.isinf(number) or number < 0:
        return 0
    return int(number) if float(number).is_integer() else number


def day(value):
    # dashboardDay_: yyyy-mm-dd from a day count, an ISO day or a US m/d/yyyy day.
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return (SERIAL_EPOCH + dt.timedelta(days=math.floor(value))).date().isoformat()
    value = text(value)
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        return value
    us = re.fullmatch(r'(\d{1,2})/(\d{1,2})/(\d{4})', value)
    if us:
        return f'{us.group(3)}-{int(us.group(1)):02d}-{int(us.group(2)):02d}'
    return ''


def moment(value):
    # dashboardMoment_: when a submission arrived, as an ISO timestamp in UTC.
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return iso(SERIAL_EPOCH + dt.timedelta(days=value))
    value = text(value)
    if not value:
        return ''
    try:
        parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        for form in ('%m/%d/%Y %H:%M:%S', '%m/%d/%Y %H:%M', '%m/%d/%Y'):
            try:
                parsed = dt.datetime.strptime(value, form)
                break
            except ValueError:
                parsed = None
        if parsed is None:
            return ''
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return iso(parsed)


def iso(moment_value):
    # JavaScript's toISOString(): UTC, milliseconds, Z.
    value = moment_value.astimezone(dt.timezone.utc)
    return value.strftime('%Y-%m-%dT%H:%M:%S.') + f'{value.microsecond // 1000:03d}Z'


def period(saved, cell):
    # dashboardPeriod_: the form's own record of the quarter, or a "2026 Q4" cell.
    if isinstance(saved, dict):
        quarter, year = as_number(saved.get('quarter')), as_number(saved.get('year'))
        if quarter is not None and year is not None and 1 <= quarter <= 4 and year > 1999:
            return {'quarter': int(quarter), 'year': int(year)}
    match = re.fullmatch(r'(\d{4})\s*Q([1-4])', text(cell), re.IGNORECASE)
    return {'quarter': int(match.group(2)), 'year': int(match.group(1))} if match else None


def snapshot(value):
    # dashboardSnapshot_: the Additional data (JSON) cell, or empty parts.
    empty = {'submission': {}, 'program': {}, 'site': {}}
    value = text(value)
    if not value:
        return empty
    try:
        parsed = json.loads(value)
    except ValueError:
        return empty
    if not isinstance(parsed, dict):
        return empty
    return {part: parsed[part] if isinstance(parsed.get(part), dict) else {} for part in empty}


def facility_codes():
    """Facility name -> code, from the receiver's own list (built into reference/facilities.json)."""
    try:
        listed = json.loads((REFERENCE / 'facilities.json').read_text())['facilities']
    except (OSError, ValueError, KeyError):
        return {}
    return {item['name']: item['code'] for item in listed}


def submissions_from_rows(rows):
    """Dashboard.gs dashboardData_, for every organization: one entry per Submission ID."""
    return read_sheet(rows)[0]


def read_sheet(rows):
    """Dashboard.gs dashboardData_, plus the rows it skips: (submissions, skipped rows).

    Each submission also keeps its rows (one per program per yard) under 'rows', which the
    Dashboard doesn't need but the checks and the facility breakdown do.
    """
    if not rows:
        return [], []
    headings = [normalize_header(cell) for cell in rows[0]]

    def col(heading):
        heading = normalize_header(heading)
        return headings.index(heading) if heading in headings else -1

    at = {
        'facility': col(HEADER[0]), 'yard': col(HEADER[1]), 'organization': col(HEADER[2]),
        'program': col(HEADER[3]), 'status': col(HEADER[4]), 'start': col(HEADER[5]),
        'end': col(HEADER[6]), 'hours': col(HEADER[7]), 'participants': col(HEADER[8]),
        'completed': col(HEADER[9]), 'notes': col('Notes'), 'reference': col('Submission ID'),
        'submittedAt': col('Submitted At'), 'signedIn': col('Sign-in Checked'),
        'quarter': col('Reporting Quarter'), 'extra': col('Additional data (JSON)'), 'test': col('Test data'),
    }
    missing = [key for key in REQUIRED if at[key] < 0]
    if missing:
        raise SheetError('TPW’s sheet is missing a column the dashboard needs. Check the heading row hasn’t been edited.')
    code_for = facility_codes()
    by_reference = {}
    order = []
    loose = []
    for number, row in enumerate(rows[1:], start=2):
        def cell(key):
            index = at[key]
            return row[index] if 0 <= index < len(row) else ''
        reference = text(cell('reference'))
        program_name = text(cell('program'))
        if not reference or not program_name:
            # Dashboard.gs skips these: a blank or hand-typed line, not a filing.
            if any(text(value) for value in row):
                loose.append({'row': number, 'reference': reference, 'program': program_name,
                              'organization': text(cell('organization'))})
            continue
        saved = snapshot(cell('extra'))
        submission = by_reference.get(reference)
        if submission is None:
            submission = by_reference[reference] = {
                'id': reference,
                'organization': text(cell('organization')),
                'orgId': text(saved['submission'].get('orgId')),
                'submittedAt': moment(cell('submittedAt')),
                'reportingPeriod': period(saved['submission'].get('reportingPeriod'), cell('quarter')),
                'previousSubmissionId': text(saved['submission'].get('previousSubmissionId')),
                'testData': False,
                'prisons': [],
                'programs': [],
                'rows': [],
                '_byProgram': {},
                '_byPrison': {},
            }
            order.append(reference)
        if re.fullmatch(r'yes', text(cell('test')), re.IGNORECASE):
            submission['testData'] = True
        facility = text(cell('facility'))
        code = text(saved['site'].get('facilityCode')) or code_for.get(facility) or facility
        yard = text(cell('yard'))
        program_id = text(saved['program'].get('id'))
        key = program_id or program_name.lower()
        program = submission['_byProgram'].get(key)
        if program is None:
            program = submission['_byProgram'][key] = {
                'name': program_name,
                'status': text(cell('status')),
                'startDate': day(cell('start')),
                'endDate': day(cell('end')),
                'courseHours': hours_value(cell('hours')),
                'notes': text(cell('notes')),
                'participants': 0,
                'participantsCompleted': 0,
                'assignments': [],
            }
            if program_id:
                program['id'] = program_id
            submission['programs'].append(program)
        participants, completed = count(cell('participants')), count(cell('completed'))
        program['participants'] += participants
        program['participantsCompleted'] += completed
        assignment = next((item for item in program['assignments'] if item['code'] == code), None)
        if assignment is None:
            assignment = {'code': code, 'yards': []}
            program['assignments'].append(assignment)
        if yard and yard not in assignment['yards']:
            assignment['yards'].append(yard)
        prison = submission['_byPrison'].get(code)
        if prison is None:
            prison = submission['_byPrison'][code] = {'code': code, 'name': facility or code, 'yards': []}
            submission['prisons'].append(prison)
        if yard and yard not in prison['yards']:
            prison['yards'].append(yard)
        submission['rows'].append({
            'row': number, 'facility': facility, 'code': code, 'yard': yard, 'program': program_name,
            'programKey': key, 'participants': participants, 'completed': completed,
            'rawParticipants': cell('participants'), 'rawCompleted': cell('completed'),
            'notes': text(cell('notes')), 'signedIn': text(cell('signedIn')),
        })
    submissions = []
    for reference in order:
        submission = by_reference[reference]
        del submission['_byProgram'], submission['_byPrison']
        submissions.append(submission)
    return submissions, loose


# ---------------------------------------------------------------- data.js and rac.js, in Python

def existing_programs(submissions):
    """data.js existingPrograms: the latest submission for each program wins."""
    latest = {}
    ordered = sorted(submissions, key=lambda item: (str(item.get('submittedAt') or ''), str(item['id'])))
    for submission in ordered:
        owner = submission.get('orgId') or submission.get('organization') or submission['id']
        for program in submission['programs']:
            key = json.dumps([owner, program.get('id') or program['name'].strip().lower()])
            entry = dict(program)
            entry.update({'organization': submission['organization'], 'orgId': submission.get('orgId'),
                          'submittedAt': submission.get('submittedAt'), 'submissionId': submission['id'],
                          'testData': submission.get('testData', False)})
            # Python dicts keep first-insertion order; JavaScript Maps do too, so delete first
            # is not needed: a later submission replaces the value at the same key.
            latest[key] = entry
    return sorted(latest.values(), key=lambda program: program['name'])


def estimate_rac(program):
    """rac.js estimateRac: an upper limit, assuming every completion earns credit."""
    hours = max(0, as_number(program.get('courseHours')) or 0)
    completed = max(0, math.floor(as_number(program.get('participantsCompleted')) or 0))
    per_enrollment = min(40, math.floor(hours / 52) * 10)
    return {'hours': hours, 'completed': completed, 'daysPerEnrollment': per_enrollment,
            'days': per_enrollment * completed}


# ---------------------------------------------------------------- quarters

def pacific_today(override=None):
    if override:
        return dt.date.fromisoformat(override)
    try:
        from zoneinfo import ZoneInfo
        return dt.datetime.now(ZoneInfo('America/Los_Angeles')).date()
    except Exception:
        # No time zone data: California is 7 or 8 hours behind UTC; 8 is close enough for a quarter.
        return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=8)).date()


def quarter_of_day(date):
    return (date.year, (date.month - 1) // 3 + 1)


def parse_quarter(value):
    match = re.fullmatch(r'\s*(\d{4})\s*[- ]?\s*Q([1-4])\s*', value or '', re.IGNORECASE)
    if not match:
        raise SheetError(f'“{value}” isn’t a quarter. Write it like 2026-Q4.')
    return (int(match.group(1)), int(match.group(2)))


def previous_quarter(quarter):
    year, number = quarter
    return (year - 1, 4) if number == 1 else (year, number - 1)


def quarter_label(quarter):
    return f'{quarter[0]} Q{quarter[1]}'


def quarter_start(quarter):
    return dt.date(quarter[0], 3 * quarter[1] - 2, 1)


def submission_quarter(submission):
    """submission-tracker.js: the reporting quarter, or the UTC quarter it was submitted in."""
    reporting = submission.get('reportingPeriod')
    if reporting:
        return (int(reporting['year']), int(reporting['quarter']))
    try:
        when = dt.datetime.fromisoformat(submission['submittedAt'].replace('Z', '+00:00'))
    except (ValueError, AttributeError, KeyError):
        return None
    return (when.year, (when.month - 1) // 3 + 1)


# ---------------------------------------------------------------- names

def name_key(name):
    """Organization names compared loosely: case, punctuation, "the", "inc" and "&" don't matter."""
    value = text(name).lower().replace('&', ' and ').replace('’', "'")
    value = re.sub(r"[^a-z0-9 ]+", ' ', value)
    words = [word for word in value.split() if word not in ('the', 'inc', 'incorporated', 'llc', 'org')]
    return ' '.join(words)


def load_members(path=None):
    """TPW's member list: a .csv with a member or organization column. The skill's own copy by default."""
    path = Path(path) if path else REFERENCE / 'tpw-members.csv'
    if path.suffix.lower() in ('.xlsx', '.xlsm'):
        tabs = read_xlsx_tabs(path)
        rows = next((rows for rows in tabs.values() if rows and member_column(rows[0]) is not None), None)
        if rows is None:
            raise SheetError('No tab in this file has an “Organization name” or “member” column.')
    else:
        rows = read_csv_rows(path)
    column = member_column(rows[0]) if rows else None
    if column is None:
        raise SheetError('The member list needs a column called “member”, “Organization name” or “Organization”.')
    names = []
    for row in rows[1:]:
        name = text(row[column]) if column < len(row) else ''
        if name and name_key(name) not in {name_key(known) for known in names}:
            names.append(name)
    return names


def member_column(heading_row):
    headings = [normalize_header(cell) for cell in heading_row]
    for wanted in ('member', 'organization name', 'organization'):
        if wanted in headings:
            return headings.index(wanted)
    return None


# Words so common in members' names that two names sharing them aren't alike.
COMMON_WORDS = {'project', 'program', 'programs', 'foundation', 'center', 'network', 'california',
                'coalition', 'institute', 'services', 'community', 'communities', 'of', 'for', 'and'}


def closest(name, candidates, limit=2):
    """Likely matches for a name, compared on its distinctive words only."""
    def distinctive(value):
        return ' '.join(word for word in name_key(value).split() if word not in COMMON_WORDS) or name_key(value)
    keys = {distinctive(candidate): candidate for candidate in candidates}
    found = difflib.get_close_matches(distinctive(name), list(keys), n=limit, cutoff=0.75)
    return [keys[key] for key in found]


# ---------------------------------------------------------------- shared helpers for the commands

def load(sheet, include_test):
    """(every submission, the ones to count, the test ones), plus the rows the website skips."""
    submissions, loose = read_sheet(load_rows(sheet))
    test = [item for item in submissions if item['testData']]
    kept = submissions if include_test else [item for item in submissions if not item['testData']]
    load.loose = loose
    return submissions, kept, test


load.loose = []


def only_test_data(kept, test, include_test):
    """True (after saying so) when there's nothing real to work with."""
    if kept or not test or include_test:
        return False
    print(f'Every submission in the Sheet ({len(test)}) is marked as test data (Yes under Test data), '
          'so there is nothing real to work with yet. Run again with --include-test to see how the '
          'answer would look using the test rows, and label every number in it as test data.')
    return True


def test_note(test, include_test):
    if not test:
        return ''
    if include_test:
        return f'Includes {len(test)} test submission{"s" if len(test) != 1 else ""} (marked Yes under Test data), as asked.'
    return (f'Left out {len(test)} test submission{"s" if len(test) != 1 else ""} '
            f'(marked Yes under Test data). Add --include-test to count them.')


def fmt(value):
    if isinstance(value, float):
        return f'{value:,.1f}'.rstrip('0').rstrip('.')
    return f'{value:,}'


def table(headings, rows):
    lines = ['| ' + ' | '.join(headings) + ' |', '|' + '|'.join(' --- ' for _ in headings) + '|']
    for row in rows:
        lines.append('| ' + ' | '.join(str(cell).replace('|', '/') for cell in row) + ' |')
    return '\n'.join(lines)


def latest_by_program_in(submissions, quarter):
    return existing_programs([item for item in submissions if submission_quarter(item) == quarter])


def program_cycles(submissions):
    """Each program cycle once, with its latest numbers.

    TPW's Data Glossary calls one run of one program a "program cycle". Here a cycle is the same
    organization, the same program name and the same start date. When a member reports a cycle
    again, in a later quarter or by submitting again on a blank form, its latest numbers replace
    the earlier ones, so its participants aren't counted twice. A new run of the program, with
    a new start date, counts on its own. (The Dashboard's rule, existing_programs, keys on the
    program's ID instead, which counts a resubmission on a blank form twice and keeps only the
    newest run of a program that repeats.)
    """
    latest = {}
    ordered = sorted(submissions, key=lambda item: (str(item.get('submittedAt') or ''), str(item['id'])))
    for submission in ordered:
        for program in submission['programs']:
            key = (name_key(submission['organization']), program['name'].strip().lower(), program['startDate'])
            entry = dict(program)
            entry.update({'organization': submission['organization'], 'orgId': submission.get('orgId'),
                          'submittedAt': submission.get('submittedAt'), 'submissionId': submission['id'],
                          'testData': submission.get('testData', False)})
            latest[key] = entry
    return sorted(latest.values(), key=lambda program: (program['organization'].lower(), program['name'].lower()))


def cycles_in(submissions, quarters):
    return program_cycles([item for item in submissions if submission_quarter(item) in quarters])


CYCLE_RULE = ('Each run of a program (the same organization, program and start date) counts once, with its '
              'latest numbers, even if the member reported it more than once.')


def program_sites(program, submissions_by_id):
    """The yards behind a program, from the submission that last reported it."""
    submission = submissions_by_id[program['submissionId']]
    key = program.get('id') or program['name'].lower()
    return [row for row in submission['rows'] if row['programKey'] == key]


def summarize(programs, submissions_by_id):
    facilities, yards, orgs = set(), set(), set()
    totals = {'participants': 0, 'completed': 0, 'hours': 0, 'days': 0}
    for program in programs:
        orgs.add(name_key(program['organization']) or program['orgId'])
        for row in program_sites(program, submissions_by_id):
            facilities.add(row['code'])
            yards.add((row['code'], row['yard'].lower()))
        totals['participants'] += program['participants']
        totals['completed'] += program['participantsCompleted']
        totals['hours'] += program['courseHours'] * program['participantsCompleted']
        totals['days'] += estimate_rac(program)['days']
    totals.update({'organizations': len(orgs), 'programs': len(programs),
                   'facilities': len(facilities), 'yards': len(yards)})
    return totals


# ---------------------------------------------------------------- commands

def cmd_missing(args):
    _, kept, test = load(args.sheet, args.include_test)
    if only_test_data(kept, test, args.include_test):
        return
    this = parse_quarter(args.quarter) if args.quarter else quarter_of_day(pacific_today(args.today))
    last = previous_quarter(this)
    members = load_members(args.members)
    submitted = {this: set(), last: set()}
    names_seen = {}
    for submission in kept:
        quarter = submission_quarter(submission)
        key = name_key(submission['organization'])
        if quarter in submitted:
            submitted[quarter].add(key)
            names_seen.setdefault(key, submission['organization'])
    rows = []
    for member in members:
        key = name_key(member)
        done_this, done_last = key in submitted[this], key in submitted[last]
        if not (done_this and done_last):
            rows.append((not done_this and not done_last, member,
                         'Submitted' if done_this else 'Not yet', 'Submitted' if done_last else 'Not submitted'))
    rows.sort(key=lambda row: (not row[0], row[1].lower()))
    member_keys = {name_key(member) for member in members}
    strangers = sorted((name for key, name in names_seen.items() if key not in member_keys), key=str.lower)

    out = [f'# Members who haven’t submitted for {quarter_label(this)} or {quarter_label(last)}', '']
    both = sum(1 for row in rows if row[0])
    out.append(f'{len(members)} members on the list. {len(members) - len(rows)} submitted for both quarters. '
               f'{both} submitted for neither. {len(rows) - both} submitted for one of the two.')
    out.append('')
    out.append('The form labels each submission with the quarter it was sent in (California time), '
               'so numbers sent in early October count as Q4.')
    note = test_note(test, args.include_test)
    if note:
        out += ['', note]
    out += ['', table(['Organization', quarter_label(this), quarter_label(last)],
                      [(row[1], row[2], row[3]) for row in rows]) if rows else 'Every member submitted for both quarters.']
    if strangers:
        out += ['', '## Submitted under a name that isn’t on the member list', '',
                'These may be a member typing its name differently, or a new member. Check before counting them as missing.', '']
        for name in strangers:
            near = closest(name, members)
            out.append(f'- {name}' + (f' (closest on the list: {", ".join(near)})' if near else ''))
    print('\n'.join(out))


def cmd_totals(args):
    submissions, kept, test = load(args.sheet, args.include_test)
    if only_test_data(kept, test, args.include_test):
        return
    by_id = {item['id']: item for item in submissions}
    out = []
    if args.dashboard:
        programs = existing_programs(kept)
        totals = summarize(programs, by_id)
        out += ['# Totals the way the website’s Dashboard counts them', '',
                'Every program’s latest submission, from any quarter. The Dashboard also adds the made-up '
                'sample organizations Org 1 and Org 2, which aren’t in the Sheet, so its tiles can be higher.', '']
        out += totals_block(totals, len(kept))
        quarters = []
    else:
        if args.year:
            quarters = [(int(args.year), number) for number in range(1, 5)]
        else:
            quarters = [parse_quarter(args.quarter) if args.quarter else quarter_of_day(pacific_today(args.today))]
        title = f'{args.year}' if args.year else quarter_label(quarters[0])
        out += [f'# TPW members’ combined numbers for {title}', '', CYCLE_RULE, '']
        for quarter in quarters:
            inside = [item for item in kept if submission_quarter(item) == quarter]
            programs = cycles_in(inside, [quarter])
            if len(quarters) > 1:
                out += [f'## {quarter_label(quarter)}', '']
            if not programs:
                out += [f'No submissions for {quarter_label(quarter)}.', '']
                continue
            out += totals_block(summarize(programs, by_id), len(inside))
            out += facility_table(programs, by_id)
        if len(quarters) > 1:
            inside = [item for item in kept if submission_quarter(item) in quarters]
            programs = cycles_in(inside, quarters)
            if programs:
                out += [f'## {args.year} as a whole', '',
                        'A run reported in more than one quarter counts once here, with its latest numbers, '
                        'so the year can be less than the quarters added together.', '']
                out += totals_block(summarize(programs, by_id), len(inside))
    note = test_note(test, args.include_test)
    if note:
        out += [note, '']
    out += ['These are combined figures for TPW’s own use. Before sharing outside TPW, keep them combined '
            'and don’t show any single organization’s numbers.']
    print('\n'.join(out).rstrip())


def totals_block(totals, submissions_count):
    rate = (totals['completed'] / totals['participants'] * 100) if totals['participants'] else None
    return [
        f'- Organizations: {fmt(totals["organizations"])}',
        f'- Submissions: {fmt(submissions_count)}',
        f'- Programs: {fmt(totals["programs"])}',
        f'- Facilities: {fmt(totals["facilities"])}, with {fmt(totals["yards"])} yards between them',
        f'- Participants: {fmt(totals["participants"])} (enrollments: someone in two programs counts twice)',
        f'- Completions: {fmt(totals["completed"])}' + (f' ({rate:.0f}% of participants)' if rate is not None else ''),
        f'- Participant hours (course hours × completions): {fmt(totals["hours"])}',
        f'- Credit days participants could have earned, upper limit: {fmt(totals["days"])}',
        f'- Facility costs avoided if every one of those days were applied, upper limit: ${fmt(totals["days"] * DAILY_RATE)}',
        '',
        'The two upper limits assume every program is approved for credit at its facility and every completion '
        'earns credit (10 days per 52 course hours, at most 40 a year), at $59 a day (the Legislative Analyst’s '
        'Office marginal cost, $21,534 a year ÷ 365). The real numbers are probably lower.',
        '',
    ]


def facility_table(programs, by_id):
    rows = {}
    for program in programs:
        for site in program_sites(program, by_id):
            entry = rows.setdefault(site['code'], {'name': site['facility'] or site['code'], 'orgs': set(),
                                                   'programs': set(), 'participants': 0, 'completed': 0})
            entry['orgs'].add(name_key(program['organization']))
            entry['programs'].add((name_key(program['organization']), program.get('id') or program['name'].lower()))
            entry['participants'] += site['participants']
            entry['completed'] += site['completed']
    if not rows:
        return []
    ordered = sorted(rows.values(), key=lambda entry: (-entry['participants'], entry['name']))
    return ['### By facility', '',
            table(['Facility', 'Organizations', 'Programs', 'Participants', 'Completions'],
                  [(entry['name'], len(entry['orgs']), len(entry['programs']),
                    fmt(entry['participants']), fmt(entry['completed'])) for entry in ordered]),
            '',
            'A facility with only one organization shows that organization’s numbers, so keep this table inside TPW.', '']


def cmd_check(args):
    submissions, kept, test = load(args.sheet, args.include_test)
    if only_test_data(kept, test, args.include_test):
        return
    loose = load.loose
    members = load_members(args.members)
    member_keys = {name_key(member) for member in members}
    known_facilities = set(facility_codes().values())
    since = dt.date.fromisoformat(args.since) if args.since else None
    today = pacific_today(args.today)

    def is_new(submission):
        if not since:
            return True
        return bool(submission['submittedAt']) and submission['submittedAt'][:10] >= since.isoformat()

    fresh = [item for item in kept if is_new(item)]
    problems = []

    def flag(title, why, todo, items):
        if items:
            problems.append((title, why, todo, items))

    # 1. Rows the Dashboard skips.
    flag('Rows the website ignores',
         'They have no Submission ID or no program name, so someone probably typed them into the Sheet by hand.',
         'Check them, and move any hand-made work to a copy of the Sheet.',
         [f'Row {item["row"]}: {item["organization"] or "no organization"}, {item["program"] or "no program name"}'
          + (f', reference {item["reference"]}' if item['reference'] else ', no reference code') for item in loose])

    # 2. The same program counted twice.
    seen = {}
    for submission in sorted(kept, key=lambda item: item['submittedAt']):
        quarter = submission_quarter(submission)
        for program in submission['programs']:
            key = (name_key(submission['organization']), quarter, program['name'].strip().lower())
            seen.setdefault(key, []).append((submission, program))
    doubles = []
    for (org, quarter, _), entries in seen.items():
        ids = {program.get('id') or '' for _, program in entries}
        if len(entries) > 1 and len(ids) > 1 and any(is_new(submission) for submission, _ in entries):
            first_sub, first_program = entries[0]
            references = ', '.join(submission['id'] for submission, _ in entries)
            doubles.append(f'{first_sub["organization"]}, “{first_program["name"]}”, {quarter_label(quarter) if quarter else "no quarter"}: '
                           f'submitted {len(entries)} times as separate programs (references {references})')
    flag('The same program submitted twice as two programs',
         'The website counts each one, so its participants are counted twice. This happens when a member submits again on a blank form.',
         'Ask the member which submission is right, then list the other reference code as “ignore” on a separate tab.',
         doubles)

    # 2b. A program that came back with a new ID in a later quarter.
    by_program = {}
    for submission in sorted(kept, key=lambda item: item['submittedAt']):
        for program in submission['programs']:
            key = (name_key(submission['organization']), program['name'].strip().lower())
            by_program.setdefault(key, {}).setdefault(program.get('id') or '', (submission, program['name']))
    renamed = []
    for ids in by_program.values():
        quarters = {submission_quarter(submission) for submission, _ in ids.values()}
        if len(ids) > 1 and len(quarters) > 1 and any(is_new(submission) for submission, _ in ids.values()):
            first, name = next(iter(ids.values()))
            renamed.append(f'{first["organization"]}, “{name}”: reported as {len(ids)} different programs '
                           f'(references {", ".join(item["id"] for item, _ in ids.values())})')
    flag('The same program under a new ID in a later quarter',
         'The website’s Dashboard shows each program’s latest numbers from any quarter, so it counts this program '
         'more than once. The quarterly totals from these skills are not affected.',
         'Nothing for the member to do. Bear it in mind when you read the Dashboard.', renamed)

    # 3. Completed, but the dates are still to come.
    future = []
    for submission in fresh:
        sent = submission['submittedAt'][:10] or today.isoformat()
        for program in submission['programs']:
            if program['status'] == 'Completed' and program['endDate'] and program['endDate'] > sent:
                future.append(f'{submission["organization"]}, “{program["name"]}”: marked Completed, but ends {program["endDate"]}, '
                              f'after it was submitted on {sent} (reference {submission["id"]})')
    flag('Completed programs that haven’t ended yet',
         'The form allows it, but a program can’t be complete before its end date.',
         'Ask the member whether the status or the end date is wrong.', future)

    # 4. Numbers that may belong to an earlier quarter.
    earlier = []
    for submission in fresh:
        quarter = submission_quarter(submission)
        if not quarter:
            continue
        begins = quarter_start(quarter).isoformat()
        for program in submission['programs']:
            if program['endDate'] and program['endDate'] < begins:
                earlier.append(f'{submission["organization"]}, “{program["name"]}”: ended {program["endDate"]}, '
                               f'but is counted in {quarter_label(quarter)} (reference {submission["id"]})')
    flag('Programs that ended before the quarter they’re counted in',
         'The form labels a submission with the quarter it was sent in, so numbers for July to September sent in October count as Q4.',
         'Decide which quarter these belong to when you add things up. The member doesn’t need to do anything.', earlier)

    # 5. Organization names that aren't on the member list.
    strangers = {}
    for submission in fresh:
        if name_key(submission['organization']) not in member_keys:
            strangers.setdefault(submission['organization'], []).append(submission['id'])
    flag('Organization names that aren’t on the member list',
         'Either a member typed its name differently, which splits its numbers, or this isn’t a member.',
         'If it’s a member, ask it to pick its name from the suggestions next time. If it isn’t, ignore those reference codes.',
         [f"{name} (reference{'s' if len(refs) != 1 else ''} {', '.join(refs)})"
          + (f'. Closest on the list: {", ".join(closest(name, members))}' if closest(name, members) else '')
          for name, refs in sorted(strangers.items(), key=lambda item: item[0].lower())])

    # 6. More completions than participants on a row (the form blocks this; a hand edit doesn't).
    flag('More completions than participants',
         'The form refuses this, so the row was probably changed by hand in the Sheet.',
         'Check the row against what the member sent.',
         [f'Row {row["row"]}: {submission["organization"]}, “{row["program"]}” at {row["code"]} {row["yard"]}: '
          f'{row["completed"]} completed of {row["participants"]}'
          for submission in fresh for row in submission['rows'] if row['completed'] > row['participants']])

    # 7. Big changes from the previous quarter.
    jumps = []
    for submission in fresh:
        quarter = submission_quarter(submission)
        if not quarter:
            continue
        before = {}
        for program in latest_by_program_in(kept, previous_quarter(quarter)):
            if name_key(program['organization']) == name_key(submission['organization']):
                before[program['name'].strip().lower()] = program
        for program in submission['programs']:
            old = before.get(program['name'].strip().lower())
            if not old or not old['participants']:
                continue
            new, previous = program['participants'], old['participants']
            if abs(new - previous) >= 10 and (new >= 3 * previous or new * 3 <= previous):
                jumps.append(f'{submission["organization"]}, “{program["name"]}”: {fmt(previous)} participants in '
                             f'{quarter_label(previous_quarter(quarter))}, {fmt(new)} in {quarter_label(quarter)} (reference {submission["id"]})')
    flag('Big changes from the quarter before',
         'Participants went up or down at least three times over (and by 10 or more). It may be real, or a typing slip.',
         'Ask the member if the number is right.', jumps)

    # 8. Notes that may name someone.
    personal = []
    pattern = re.compile(r'\b[A-Z]{1,2}-?\d{4,5}\b|\bCDCR\s*#|\bDOB\b|\bdate of birth\b|\bborn\b|\b\d{1,2}/\d{1,2}/(19|20)\d{2}\b', re.IGNORECASE)
    for submission in fresh:
        for row in submission['rows']:
            if row['notes'] and pattern.search(row['notes']):
                personal.append(f'Row {row["row"]}: {submission["organization"]}, “{row["program"]}”: “{row["notes"][:120]}”')
    flag('Notes that may contain a CDCR number or a birth date',
         'TPW never collects names, CDCR numbers or birth dates.',
         'If it is personal information, delete it from the note in the Sheet and let the member know.',
         sorted(set(personal)))

    # 9. Facilities the form doesn't know.
    if known_facilities:
        flag('Facilities that aren’t on the form’s list',
             'The form only offers its own list, so these were probably typed into the Sheet by hand.',
             'Check the row against what the member sent.',
             sorted({f'Row {row["row"]}: “{row["facility"]}” ({submission["organization"]})'
                     for submission in fresh for row in submission['rows'] if row['code'] not in known_facilities}))

    # 10. Completions with no course hours, so no credit estimate.
    flag('Completions with 0 course hours',
         'Without course hours the website can’t estimate credit days or participant hours.',
         'Ask the member for the course hours per participant.',
         [f'{submission["organization"]}, “{program["name"]}” (reference {submission["id"]})'
          for submission in fresh for program in submission['programs']
          if program['participantsCompleted'] and not program['courseHours']])

    scope = f'submitted since {since.isoformat()}' if since else 'in the Sheet'
    out = [f'# Check of the submissions {scope}', '',
           f'Looked at {len(fresh)} submission{"s" if len(fresh) != 1 else ""} '
           f'from {len({name_key(item["organization"]) for item in fresh})} organizations.']
    note = test_note(test, args.include_test)
    if note:
        out.append(note)
    unsigned = sum(1 for item in fresh if all(row['signedIn'] != 'Yes' for row in item['rows']))
    if unsigned:
        out.append(f'{unsigned} of them were sent without sign-in (Sign-in Checked says No), so anyone could have '
                   'sent them under any name. That stays true until real sign-in is turned on.')
    out.append('')
    if not fresh:
        out.append('There was nothing to check' + (': every submission is test data.' if test and not args.include_test else '.'))
    elif not problems:
        out.append('Nothing needs a look.')
    for number, (title, why, todo, items) in enumerate(problems, start=1):
        out += [f'## {number}. {title} ({len(items)})', '', f'Why it matters: {why}', f'What to do: {todo}', '']
        out += [f'- {item}' for item in items[:40]]
        if len(items) > 40:
            out.append(f'- …and {len(items) - 40} more')
        out.append('')
    print('\n'.join(out).rstrip())


def cmd_member(args):
    submissions, kept, test = load(args.sheet, args.include_test)
    if only_test_data(kept, test, args.include_test):
        return
    by_id = {item['id']: item for item in submissions}
    names = sorted({item['organization'] for item in kept}, key=str.lower)
    asked = name_key(args.org)
    exact = [name for name in names if name_key(name) == asked]
    # "evergreen peer wellness" finds "Evergreen Peer Wellness Project" when nothing else matches.
    partial = sorted({name_key(name) for name in names if asked and asked in name_key(name)})
    matched_note = ''
    if not exact and len(partial) == 1:
        exact = [name for name in names if name_key(name) == partial[0]]
        matched_note = f'Matched “{args.org}” to {exact[-1]}.'
    if not exact:
        near = closest(args.org, names, limit=5)
        near += [name for name in names if name_key(name) in partial and name not in near]
        message = f'No submissions from an organization called “{args.org}”.'
        if near:
            message += ' Did you mean: ' + '; '.join(near) + '?'
        elif test and not args.include_test:
            message += ' ' + test_note(test, args.include_test)
        raise SheetError(message)
    wanted = name_key(exact[-1])
    own = [item for item in kept if name_key(item['organization']) == wanted]
    # Show the name as the member wrote it most recently.
    display = max(own, key=lambda item: item['submittedAt'])['organization']
    if matched_note:
        matched_note = f'Matched “{args.org}” to {display}.'
    if args.all:
        quarters = sorted({submission_quarter(item) for item in own if submission_quarter(item)})
        title = 'everything it has submitted'
    elif args.quarter:
        quarters = [parse_quarter(args.quarter)]
        title = quarter_label(quarters[0])
    else:
        year = int(args.year) if args.year else pacific_today(args.today).year
        quarters = [(year, number) for number in range(1, 5)]
        title = str(year)
    out = [f'# {display}: what it reported for {title}', '']
    if matched_note:
        out += [matched_note, '']
    facilities = {}
    shown = 0
    for quarter in quarters:
        programs = cycles_in(own, [quarter])
        if not programs:
            continue
        shown += 1
        out += [f'## {quarter_label(quarter)}', '']
        rows = []
        for program in programs:
            sites = program_sites(program, by_id)
            for site in sites:
                facilities.setdefault(site['code'], site['facility'] or site['code'])
            places = sorted({site['facility'] or site['code'] for site in sites})
            yard_count = len({(site['code'], site['yard'].lower()) for site in sites})
            rows.append((program['name'], program['status'] or '—',
                         f'{program["startDate"] or "?"} to {program["endDate"] or "?"}',
                         '; '.join(places) + f' ({yard_count} yard{"s" if yard_count != 1 else ""})',
                         fmt(program['courseHours']), fmt(program['participants']),
                         fmt(program['participantsCompleted']),
                         fmt(program['courseHours'] * program['participantsCompleted'])))
        out += [table(['Program', 'Status', 'Dates', 'Facilities', 'Course hours', 'Participants', 'Completed',
                       'Participant hours'], rows), '']
    if not shown:
        out.append(f'No submissions from {display} for {title}.')
    else:
        grand = {'participants': 0, 'completed': 0, 'hours': 0}
        for program in cycles_in(own, quarters):
            grand['participants'] += program['participants']
            grand['completed'] += program['participantsCompleted']
            grand['hours'] += program['courseHours'] * program['participantsCompleted']
        rate = grand['completed'] / grand['participants'] * 100 if grand['participants'] else None
        out += ['## Added up', '',
                f'- Participants: {fmt(grand["participants"])}',
                f'- Completed: {fmt(grand["completed"])}' + (f' ({rate:.0f}%)' if rate is not None else ''),
                f'- Hours of programming delivered (course hours × completions): {fmt(grand["hours"])}',
                f'- Facilities reached: {len(facilities)} ({"; ".join(sorted(facilities.values()))})', '']
        out += [CYCLE_RULE + ' So a program reported in two quarters is counted once in this total. '
                'Someone in two different programs still counts twice.', '']
    out.append('Only for this organization. Don’t send it to anyone else.')
    own_test = [item for item in test if name_key(item['organization']) == wanted]
    if own_test:
        out.append(test_note(own_test, args.include_test))
    print('\n'.join(out).rstrip())


def cmd_json(args):
    submissions = submissions_from_rows(load_rows(args.sheet))
    public = [{key: value for key, value in item.items() if key != 'rows'} for item in submissions]
    programs = existing_programs(submissions)
    print(json.dumps({'submissions': public, 'programs': programs,
                      'rac': [estimate_rac(program) for program in programs]}, indent=1))


def main(argv=None):
    parser = argparse.ArgumentParser(description='Answer TPW staff questions from the submissions Sheet. '
                                     'SHEET is the Sheet downloaded as .xlsx, the submissions tab as .csv, '
                                     'or a Google Drive or Google Sheets tool reply saved as a file.')
    sub = parser.add_subparsers(dest='command', required=True)

    def add(name, function, summary, *extra):
        command = sub.add_parser(name, help=summary, description=summary)
        command.add_argument('sheet', help='the downloaded Sheet')
        command.add_argument('--include-test', action='store_true', help='count rows marked Yes under Test data')
        command.add_argument('--today', help='pretend today is YYYY-MM-DD (for testing)')
        for option in extra:
            option(command)
        command.set_defaults(run=function)

    members = lambda command: command.add_argument('--members', help='a member list (.csv or .xlsx) instead of the bundled one')
    quarter = lambda command: command.add_argument('--quarter', help='a quarter like 2026-Q3 instead of this quarter')
    year = lambda command: command.add_argument('--year', help='a whole year, like 2026')
    add('missing', cmd_missing, 'members with no submission this quarter or last quarter', members, quarter)
    add('totals', cmd_totals, 'combined numbers for a quarter (default: this one) or a year', quarter, year,
        lambda command: command.add_argument('--dashboard', action='store_true', help='count the way the website Dashboard does'))
    add('check', cmd_check, 'problems the form can’t catch', members,
        lambda command: command.add_argument('--since', help='only submissions on or after YYYY-MM-DD'))
    add('member', cmd_member, 'one member’s own numbers (default: this year)', quarter, year,
        lambda command: command.add_argument('--org', required=True, help='the organization, or part of its name'),
        lambda command: command.add_argument('--all', action='store_true', help='everything it has submitted'))
    add('json', cmd_json, 'the Dashboard’s view of the Sheet as JSON (for tests)')
    args = parser.parse_args(argv)
    try:
        args.run(args)
    except SheetError as error:
        print(f'Problem: {error}')
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())

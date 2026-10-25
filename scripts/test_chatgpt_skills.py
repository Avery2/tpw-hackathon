#!/usr/bin/env python3
"""Tests for the TPW ChatGPT skills' script (chatgpt-plugin/source/tpw_data.py).

Runs the copy built into a skill, so it tests what ChatGPT runs. Every row is made up
(chatgpt-plugin/tests/fixture-rows.json). Standard library only.

    python3 scripts/test_chatgpt_skills.py

chatgpt-plugin/tests/parity.mjs checks the counting matches the website's own JavaScript.
These tests check each command's answers, and that Excel and CSV downloads read the same.
"""

import csv
import datetime as dt
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'chatgpt-plugin/tpw/skills/tpw-check-submissions/scripts/tpw_data.py'
FIXTURE = ROOT / 'chatgpt-plugin/tests/fixture-rows.json'
MEMBERS = ROOT / 'chatgpt-plugin/tests/fixture-members.csv'
TODAY = '2026-11-03'  # so "this quarter" is 2026 Q4 and "last quarter" 2026 Q3


def run(*args, sheet=FIXTURE):
    result = subprocess.run([sys.executable, '-I', str(SCRIPT), args[0], str(sheet), '--today', TODAY, *args[1:]],
                            capture_output=True, text=True)
    return result.returncode, result.stdout


def column_letter(index):
    letters = ''
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def write_xlsx(path, tabs):
    """A minimal Excel file: {tab name: rows}, strings inline, numbers as numbers."""
    def sheet_xml(rows):
        lines = []
        for r, row in enumerate(rows, start=1):
            cells = []
            for c, value in enumerate(row):
                ref = f'{column_letter(c)}{r}'
                if value == '' or value is None:
                    continue
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    cells.append(f'<c r="{ref}"><v>{value}</v></c>')
                else:
                    cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>')
            lines.append(f'<row r="{r}">{"".join(cells)}</row>')
        return ('<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                f'<sheetData>{"".join(lines)}</sheetData></worksheet>')
    main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    with zipfile.ZipFile(path, 'w') as book:
        sheets, rels = [], []
        for number, (name, rows) in enumerate(tabs.items(), start=1):
            sheets.append(f'<sheet name="{escape(name)}" sheetId="{number}" r:id="rId{number}"/>')
            rels.append(f'<Relationship Id="rId{number}" Type="{rel}/worksheet" Target="worksheets/sheet{number}.xml"/>')
            book.writestr(f'xl/worksheets/sheet{number}.xml', sheet_xml(rows))
        book.writestr('xl/workbook.xml', f'<workbook xmlns="{main}" xmlns:r="{rel}"><sheets>{"".join(sheets)}</sheets></workbook>')
        book.writestr('xl/_rels/workbook.xml.rels',
                      f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{"".join(rels)}</Relationships>')


class Totals(unittest.TestCase):
    def test_this_quarter(self):
        code, out = run('totals')
        self.assertEqual(code, 0, out)
        self.assertIn('combined numbers for 2026 Q4', out)
        for line in ['Programs: 6', 'Facilities: 3', 'Participants: 78', 'Completions: 32',
                     '(course hours × completions): 2,952', 'upper limit: 460', 'upper limit: $27,140',
                     'Left out 1 test submission']:
            self.assertIn(line, out)

    def test_a_named_quarter(self):
        code, out = run('totals', '--quarter', '2026-Q3')
        self.assertEqual(code, 0, out)
        # Yards add up into their program; the quarter comes from the form's record, the
        # Reporting Quarter cell, or the submission date, whichever the row has.
        for line in ['Programs: 5', 'Participants: 45', 'Completions: 25']:
            self.assertIn(line, out)

    def test_a_year_adds_its_quarters(self):
        code, out = run('totals', '--year', '2026')
        self.assertEqual(code, 0, out)
        self.assertIn('No submissions for 2026 Q1.', out)
        self.assertIn('Participants reported, added across quarters: 123', out)

    def test_dashboard_way_counts_each_programs_latest_numbers(self):
        code, out = run('totals', '--dashboard')
        self.assertEqual(code, 0, out)
        self.assertIn('Programs: 9', out)

    def test_test_rows_on_request(self):
        code, out = run('totals', '--include-test')
        self.assertIn('Participants: 177', out)
        self.assertIn('Includes 1 test submission', out)


class Missing(unittest.TestCase):
    def test_lists_members_missing_either_quarter(self):
        code, out = run('missing', '--members', str(MEMBERS))
        self.assertEqual(code, 0, out)
        self.assertIn('| Quiet Waters Project | Not yet | Not submitted |', out)
        # "sample reading circle, inc." in Q3 counts for the member Sample Reading Circle.
        self.assertNotIn('| Sample Reading Circle', out)
        self.assertNotIn('| Harbor Light Arts', out)
        self.assertIn('- Riverside Peace Project', out)
        self.assertNotIn('Test Org', out)

    def test_bundled_member_list(self):
        code, out = run('missing')
        self.assertEqual(code, 0, out)
        self.assertIn('| 1,000 Mile Club | Not yet | Not submitted |', out)


class Check(unittest.TestCase):
    def setUp(self):
        code, self.out = run('check', '--members', str(MEMBERS))
        self.assertEqual(code, 0, self.out)

    def section(self, title):
        start = self.out.index(title)
        end = self.out.find('\n## ', start)
        return self.out[start:end if end > 0 else None]

    def test_finds_each_kind_of_problem(self):
        expected = {
            'Rows the website ignores': 'Hand-typed Program',
            'The same program submitted twice as two programs': 'Writing Lab',
            'The same program under a new ID in a later quarter': 'Poetry Circle',
            'Completed programs that haven’t ended yet': 'Book Club',
            'Programs that ended before the quarter they’re counted in': 'Peace Circle',
            'Organization names that aren’t on the member list': 'Riverside Peace Project',
            'More completions than participants': '5 completed of 2',
            'Big changes from the quarter before': '5 participants in 2026 Q3, 40 in 2026 Q4',
            'Notes that may contain a CDCR number or a birth date': 'AB1234',
            'Facilities that aren’t on the form’s list': 'Made Up Prison',
            'Completions with 0 course hours': 'Peace Circle',
        }
        for title, detail in expected.items():
            self.assertIn(detail, self.section(title), title)

    def test_leaves_out_test_rows_and_matches_name_variants(self):
        self.assertNotIn('Test Org', self.out)
        self.assertNotIn('sample reading circle, inc.', self.section('Organization names'))

    def test_since_narrows_to_recent_submissions(self):
        code, out = run('check', '--members', str(MEMBERS), '--since', '2026-10-21')
        self.assertIn('Looked at 2 submissions', out)
        self.assertNotIn('Drum Circle', out)


class Member(unittest.TestCase):
    def test_part_of_a_name_is_enough(self):
        code, out = run('member', '--org', 'reading circle')
        self.assertEqual(code, 0, out)
        self.assertIn('Matched “reading circle” to Sample Reading Circle.', out)
        self.assertIn('## 2026 Q3', out)
        self.assertIn('Gardening', out)
        self.assertIn('Book Club', out)
        self.assertNotIn('Harbor', out)
        self.assertNotIn('credit', out.lower())

    def test_unknown_name_says_so(self):
        code, out = run('member', '--org', 'Nobody At All')
        self.assertEqual(code, 2)
        self.assertTrue(out.startswith('Problem: No submissions from an organization called'), out)

    def test_one_quarter(self):
        code, out = run('member', '--org', 'Harbor Light Arts', '--quarter', '2026-Q4')
        self.assertIn('- Participants: 65', out)
        self.assertIn('- Completed: 19', out)


class Files(unittest.TestCase):
    def setUp(self):
        self.rows = json.loads(FIXTURE.read_text())
        self.folder = tempfile.TemporaryDirectory()
        self.dir = Path(self.folder.name)

    def tearDown(self):
        self.folder.cleanup()

    def test_excel_download_reads_like_the_sheet(self):
        # Excel shortens the tab's name to 31 characters and the tab isn't first.
        book = self.dir / 'download.xlsx'
        write_xlsx(book, {'Aggregates': [['TPW | Program participation & sessions']],
                          'Submissions; comes from website': self.rows})
        self.assertEqual(run('json', sheet=book), run('json'))

    def test_csv_with_us_dates_and_commas(self):
        sheet = self.dir / 'submissions.csv'
        epoch = dt.date(1899, 12, 30)
        with open(sheet, 'w', newline='') as handle:
            writer = csv.writer(handle)
            writer.writerow(self.rows[0])
            for row in self.rows[1:]:
                row = list(row)
                for index in (5, 6):  # start and end dates, as a US Sheet shows them
                    if isinstance(row[index], int):
                        day = epoch + dt.timedelta(days=row[index])
                        row[index] = f'{day.month}/{day.day}/{day.year}'
                row[10] = f'{row[10]:,}' if isinstance(row[10], int) else row[10]
                writer.writerow(row)
        self.assertEqual(run('totals', sheet=sheet), run('totals'))

    def test_wrong_tab_says_which_to_use(self):
        sheet = self.dir / 'aggregates.csv'
        sheet.write_text('TPW | Program participation & sessions\n')
        code, out = run('totals', sheet=sheet)
        self.assertEqual(code, 2)
        self.assertIn('Submissions; comes from website form DO NOT RENAME', out)


class Build(unittest.TestCase):
    def test_built_copies_are_current(self):
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/build_chatgpt_skills.py'), '--check'],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout)


if __name__ == '__main__':
    unittest.main()

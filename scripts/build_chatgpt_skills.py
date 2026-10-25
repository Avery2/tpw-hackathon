#!/usr/bin/env python3
"""build_chatgpt_skills.py -- fill the TPW ChatGPT skills with this repo's code and data.

Each skill in chatgpt-plugin/tpw/skills/ is a folder ChatGPT reads on its own, so it can't
reach files elsewhere in the repo. This script copies in what each skill needs, from the one
place each thing is kept:

    chatgpt-plugin/source/tpw_data.py        -> <skill>/scripts/tpw_data.py
    chatgpt-plugin/source/rules.md           -> <skill>/reference/rules.md
    chatgpt-plugin/source/tool-guide.md      -> tpw-tool-help/reference/tool-guide.md
    team-form/receiver/Rows.gs (FACILITIES)  -> <skill>/reference/facilities.json
    data/public/tpw-members.csv              -> <skill>/reference/tpw-members.csv
    docs/TPW Data Glossary Instructions.docx -> tpw-tool-help/reference/data-glossary.md
    docs/after-the-demo.md, docs/faq.md      -> tpw-tool-help/reference/

It also writes chatgpt-plugin/uploads/<skill>.zip, one file per skill for uploading by hand
in ChatGPT (Plugins, Skills, Create, Upload from your computer).

Edit the sources, never the copies, then run:

    python3 scripts/build_chatgpt_skills.py           # rebuild
    python3 scripts/build_chatgpt_skills.py --check   # fail if any copy is out of date (CI runs this)

Standard library only.
"""

import argparse
import io
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / 'chatgpt-plugin'
SOURCE = PLUGIN / 'source'
SKILLS = PLUGIN / 'tpw' / 'skills'
UPLOADS = PLUGIN / 'uploads'

DATA_FILES = {
    'scripts/tpw_data.py': lambda: (SOURCE / 'tpw_data.py').read_bytes(),
    'reference/rules.md': lambda: (SOURCE / 'rules.md').read_bytes(),
    'reference/facilities.json': lambda: facilities_json(),
}
MEMBERS = {'reference/tpw-members.csv': lambda: (ROOT / 'data/public/tpw-members.csv').read_bytes()}

# What goes into each skill, besides its own SKILL.md.
CONTENTS = {
    'tpw-missing-submissions': {**DATA_FILES, **MEMBERS},
    'tpw-quarter-numbers': dict(DATA_FILES),
    'tpw-check-submissions': {**DATA_FILES, **MEMBERS},
    'tpw-member-summary': dict(DATA_FILES),
    'tpw-tool-help': {
        'reference/rules.md': lambda: (SOURCE / 'rules.md').read_bytes(),
        'reference/tool-guide.md': lambda: (SOURCE / 'tool-guide.md').read_bytes(),
        'reference/data-glossary.md': lambda: glossary_markdown(),
        'reference/after-the-demo.md': lambda: (ROOT / 'docs/after-the-demo.md').read_bytes(),
        'reference/faq.md': lambda: (ROOT / 'docs/faq.md').read_bytes(),
    },
}


def facilities_json():
    """The facility names the receiver writes into the Sheet, with their codes."""
    source = (ROOT / 'team-form/receiver/Rows.gs').read_text(encoding='utf-8')
    start = source.index('var FACILITIES = {')
    block = source[start:source.index('};', start)]
    items = [{'code': code, 'name': name} for code, name in re.findall(r"(\w+): '([^']*)'", block)]
    if len(items) < 20:
        raise SystemExit('Could not read the FACILITIES list from team-form/receiver/Rows.gs.')
    document = {'source': 'team-form/receiver/Rows.gs (FACILITIES), built by scripts/build_chatgpt_skills.py',
                'facilities': items}
    return (json.dumps(document, ensure_ascii=False, indent=1) + '\n').encode('utf-8')


def glossary_markdown():
    """TPW's Data Glossary (a Word file) as plain Markdown, so ChatGPT reads it easily."""
    w = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    path = ROOT / 'docs/TPW Data Glossary Instructions.docx'
    body = ElementTree.fromstring(zipfile.ZipFile(path).read('word/document.xml')).find(w + 'body')
    lines = ['<!-- Built from docs/TPW Data Glossary Instructions.docx by scripts/build_chatgpt_skills.py. -->', '']

    def words(element):
        return re.sub(r'\s+', ' ', ''.join(node.text or '' for node in element.iter(w + 't'))).strip()

    for element in body:
        if element.tag == w + 'p':
            text = words(element)
            if not text:
                continue
            style = element.find(f'{w}pPr/{w}pStyle')
            level = re.search(r'(\d)$', style.get(w + 'val')) if style is not None else None
            is_heading = style is not None and ('Heading' in style.get(w + 'val') or 'Title' in style.get(w + 'val'))
            if is_heading:
                lines += ['#' * (int(level.group(1)) + 1 if level else 1) + ' ' + text, '']
            else:
                lines += [text, '']
        elif element.tag == w + 'tbl':
            rows = [[words(cell).replace('|', '/') for cell in row.iter(w + 'tc')] for row in element.iter(w + 'tr')]
            rows = [row for row in rows if any(row)]
            if not rows:
                continue
            width = max(len(row) for row in rows)
            rows = [row + [''] * (width - len(row)) for row in rows]
            lines.append('| ' + ' | '.join(rows[0]) + ' |')
            lines.append('|' + '|'.join(' --- ' for _ in range(width)) + '|')
            lines += ['| ' + ' | '.join(row) + ' |' for row in rows[1:]]
            lines.append('')
    return ('\n'.join(lines).rstrip() + '\n').encode('utf-8')


def expected_files():
    """{path in the repo: bytes} for every built file."""
    files = {}
    for skill, contents in CONTENTS.items():
        folder = SKILLS / skill
        if not (folder / 'SKILL.md').exists():
            raise SystemExit(f'{folder}/SKILL.md is missing.')
        for relative, make in contents.items():
            files[folder / relative] = make()
    return files


def zip_contents(skill, files):
    """{name inside the zip: bytes}: the skill's folder, SKILL.md and everything built into it."""
    folder = SKILLS / skill
    contents = {f'{skill}/SKILL.md': (folder / 'SKILL.md').read_bytes()}
    for path, data in files.items():
        if folder in path.parents:
            contents[f'{skill}/{path.relative_to(folder).as_posix()}'] = data
    return contents


def read_zip(path):
    try:
        with zipfile.ZipFile(path) as archive:
            return {name: archive.read(name) for name in archive.namelist()}
    except (OSError, zipfile.BadZipFile):
        return None


def write_zip(path, contents):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(contents):
            info = zipfile.ZipInfo(name, date_time=(2026, 10, 25, 0, 0, 0))
            info.external_attr = 0o644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, contents[name])
    path.write_bytes(buffer.getvalue())


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--check', action='store_true', help='fail if any built file is out of date')
    args = parser.parse_args()
    files = expected_files()
    stale = []
    for path, data in files.items():
        if not path.exists() or path.read_bytes() != data:
            stale.append(path)
            if not args.check:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
    # Compare zips by what's inside, not byte for byte: compression can differ between machines.
    for skill in CONTENTS:
        path = UPLOADS / f'{skill}.zip'
        contents = zip_contents(skill, files)
        if read_zip(path) != contents:
            stale.append(path)
            if not args.check:
                UPLOADS.mkdir(parents=True, exist_ok=True)
                write_zip(path, contents)
    if args.check:
        if stale:
            print('These ChatGPT skill files are out of date. Run python3 scripts/build_chatgpt_skills.py and commit:')
            for path in stale:
                print(f'  {path.relative_to(ROOT)}')
            return 1
        print(f'All {len(files) + len(CONTENTS)} ChatGPT skill files are up to date.')
        return 0
    print(f'Updated {len(stale)} file(s).' if stale else 'Nothing to update.')
    for path in stale:
        print(f'  {path.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())

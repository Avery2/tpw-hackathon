#!/usr/bin/env python3
"""Publish the static site, adding demo-login wiring to the *output* mirror only.

The captured site/ files remain unchanged. Pages must deploy this generated
artifact, not the raw branch, so original Squarespace account controls lead to
our member entry instead of an unavailable Squarespace account route.

Usage: python3 scripts/build_site.py --output /tmp/tpw-pages
Python standard library only. Output must be outside the repository.
"""
import argparse
import os
from pathlib import Path
import posixpath
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def wire_mirror(html: str, path: str) -> str:
    """Keep every captured byte except for one script inserted after <head>."""
    if 'data-tpw-mirror-nav' in html:
        return html
    script = posixpath.relpath('assets/mirror-nav.js', posixpath.dirname(path))
    tag = f'\n<script src="{script}" data-tpw-mirror-nav></script>'
    result, count = re.subn(r'<head(?:\s[^>]*)?>', lambda match: match[0] + tag, html, count=1, flags=re.I)
    if count != 1:
        raise ValueError(f'Missing HTML head: {path}')
    return result


def build(output: Path) -> int:
    output = output.resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError('Output must be outside the repository; source files must stay untouched.')
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError('Output directory must be empty.')
    tracked = subprocess.check_output(['git', '-C', str(ROOT), 'ls-files', '-z']).split(b'\0')
    mirrors = 0
    for item in tracked:
        if not item:
            continue
        relative = os.fsdecode(item)
        if relative.startswith('.github/'):
            continue
        source, target = ROOT / relative, output / relative
        if source.is_symlink():
            raise ValueError(f'Symlinks are not supported in Pages output: {relative}')
        target.parent.mkdir(parents=True, exist_ok=True)
        if relative.startswith('site/') and relative.endswith('.html'):
            html = source.read_bytes().decode('utf-8')
            target.write_bytes(wire_mirror(html, relative).encode('utf-8'))
            mirrors += 1
        else:
            shutil.copyfile(source, target)
    if not (output / 'assets/mirror-nav.js').is_file():
        raise ValueError('assets/mirror-nav.js must be tracked before building.')
    (output / '.nojekyll').touch()
    return mirrors


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    print(f'Built static site with login wiring on {build(args.output)} mirrored pages: {args.output}')

#!/usr/bin/env python3
"""Publish the validated additional-form contract as inert JSON, never JavaScript.

Uses the same compiler as the standalone receiver's offline Config.gs snapshot.
Run after changing a source contract, or with --output inside a Pages artifact.
No network, credentials, records, or working quarterly receiver are involved.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

from build_additional_forms import build

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'data/intake/additional_forms.runtime.json'
RECEIVER = ROOT / 'admin/additional-forms/LiveReceiver.gs'


def render_receiver():
    base = ROOT / 'admin/additional-forms'
    return ('// GENERATED standalone receiver: paste this whole file into a NEW project.\n'
            '// Do NOT install in the working guided-quarterly project.\n'
            '// Includes Code.gs + RemoteConfig.gs; do not add Config.gs as well.\n\n'
            + (base / 'Code.gs').read_text(encoding='utf-8').rstrip() + '\n\n'
            + (base / 'RemoteConfig.gs').read_text(encoding='utf-8').rstrip() + '\n')


def render():
    config = build()
    forbidden = re.compile(r'^(?:name|first_name|last_name|full_name|participant_name|cdcr_number|cdc_number|inmate_number|dob|date_of_birth|ssn|ein|fein|tin|itin|tax_id|signature|photo|image|pdf|files|authorization|password|secret)$')
    for form in config['forms'].values():
        for key in form['fields']:
            if forbidden.fullmatch(key):
                raise ValueError('A public contract cannot authorize a direct-identifier/raw-upload field: ' + key)
    canonical = json.dumps(config, sort_keys=True, ensure_ascii=True, separators=(',', ':'), allow_nan=False)
    config['revision'] = hashlib.sha256(canonical.encode('ascii')).hexdigest()
    return json.dumps(config, sort_keys=True, ensure_ascii=True, indent=2, allow_nan=False) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='override the generated output path')
    parser.add_argument('--apps-script', action='store_true', help='generate the one-paste live receiver instead of JSON')
    parser.add_argument('--check', action='store_true', help='check the generated snapshot without writing')
    parser.add_argument('--stdout', action='store_true', help='print the generated artifact without writing')
    args = parser.parse_args()
    try:
        content = render_receiver() if args.apps_script else render()
        output = args.output or (RECEIVER if args.apps_script else OUTPUT)
        if args.stdout:
            print(content, end='')
        elif args.check:
            if not output.exists() or output.read_text(encoding='utf-8') != content:
                raise ValueError('Generated artifact is stale; run this command without --check')
            print('Additional-forms artifact is current.')
        else:
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(content, encoding='utf-8')
            print('Wrote ' + str(output))
    except (ValueError, TypeError, KeyError, OSError) as exc:
        print('Additional-forms runtime configuration: ' + str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())

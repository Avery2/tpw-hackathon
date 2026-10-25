#!/usr/bin/env python3
"""Public contract + Pages build checks; no network, accounts or source mutations."""
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import build_additional_forms_runtime as runtime
from build_site import ROOT, build


class LiveContractTests(unittest.TestCase):
    def test_public_json_is_deterministic_and_revision_matches_content(self):
        content = runtime.render()
        self.assertEqual(content, runtime.render())
        config = json.loads(content)
        revision = config.pop('revision')
        canonical = json.dumps(config, sort_keys=True, ensure_ascii=True, separators=(',', ':'), allow_nan=False)
        self.assertEqual(revision, hashlib.sha256(canonical.encode('ascii')).hexdigest())
        self.assertEqual(config['service'], 'tpw.additional-forms')

    def test_bundle_is_exact_engine_plus_remote_adapter_not_static_config(self):
        content = runtime.render_receiver()
        base = ROOT / 'admin/additional-forms'
        self.assertIn((base / 'Code.gs').read_text(encoding='utf-8').strip(), content)
        self.assertIn((base / 'RemoteConfig.gs').read_text(encoding='utf-8').strip(), content)
        self.assertEqual(content.count('var ADDITIONAL_FORMS_CONFIG_ ='), 1)
        self.assertNotIn((base / 'Config.gs').read_text(encoding='utf-8').strip(), content)

    def test_remote_manifest_grants_only_sheets_and_external_fetch(self):
        manifest = json.loads((ROOT / 'admin/additional-forms/appsscript.remote.json').read_text(encoding='utf-8'))
        self.assertEqual(set(manifest['oauthScopes']), {
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/script.external_request',
        })
        self.assertEqual(manifest['dependencies']['enabledAdvancedServices'], [
            {'userSymbol': 'Sheets', 'version': 'v4', 'serviceId': 'sheets'},
        ])

    def test_new_question_changes_public_revision_without_receiver_code_changes(self):
        previous = json.loads(runtime.render())
        config = runtime.build()
        config['forms']['session']['fields']['context'] = {'type': 'textarea', 'max': 1000}
        with patch.object(runtime, 'build', return_value=config):
            updated = json.loads(runtime.render())
        self.assertNotEqual(updated['revision'], previous['revision'])
        self.assertEqual(updated['forms']['session']['fields']['context']['max'], 1000)

    def test_known_identifiers_cannot_be_authorized_accidentally(self):
        for key in ['participant_name', 'ssn', 'cdcr_number', 'files', 'photo', 'tax_id']:
            config = runtime.build()
            config['forms']['session']['fields'][key] = {'type': 'text'}
            with patch.object(runtime, 'build', return_value=config), self.assertRaisesRegex(ValueError, 'cannot authorize'):
                runtime.render()

    def test_pages_rebuilds_stale_snapshots_in_output_without_touching_sources(self):
        relative = 'data/intake/additional_forms.runtime.json'
        original = (ROOT / relative).read_bytes()
        real_copy = shutil.copyfile
        def stale_copy(source, target):
            if str(source).endswith(relative):
                Path(target).write_text('{"stale":true}', encoding='utf-8')
            else:
                real_copy(source, target)
        with tempfile.TemporaryDirectory(prefix='tpw-contract-build-') as directory:
            with patch('build_site.subprocess.check_output', return_value=b'assets/mirror-nav.js\0data/intake/additional_forms.runtime.json\0'), patch('build_site.shutil.copyfile', side_effect=stale_copy):
                build(Path(directory))
            self.assertEqual((Path(directory) / relative).read_text(encoding='utf-8'), runtime.render())
            self.assertEqual((Path(directory) / 'admin/additional-forms/LiveReceiver.gs').read_text(encoding='utf-8'), runtime.render_receiver())
        self.assertEqual((ROOT / relative).read_bytes(), original)

    def test_invalid_contract_stops_pages_build_instead_of_publishing_stale_json(self):
        with tempfile.TemporaryDirectory(prefix='tpw-bad-contract-') as directory:
            with patch('build_site.subprocess.check_output', return_value=b'assets/mirror-nav.js\0'), patch.object(runtime, 'render', side_effect=ValueError('invalid schema')):
                with self.assertRaisesRegex(ValueError, 'invalid schema'):
                    build(Path(directory))


if __name__ == '__main__':
    unittest.main()

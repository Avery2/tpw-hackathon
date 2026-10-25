#!/usr/bin/env python3
"""Offline policy/compiler regression tests. No Google or third-party packages."""
import copy
import unittest
from unittest.mock import patch
import build_additional_forms as builder


class AdditionalFormsPolicyTests(unittest.TestCase):
    def setUp(self):
        self.policy = builder.load(builder.POLICY)

    def test_generated_file_has_exact_source_parity(self):
        self.assertEqual(builder.OUTPUT.read_text(), builder.render(builder.build(self.policy)))

    def test_contract_schema_conditions_photo_counts_and_formats(self):
        config = builder.build(self.policy)
        self.assertEqual(config['forms']['session']['schema'], 'tpw.simple/1')
        self.assertEqual(config['forms']['followup']['fields']['days']['show_if'], {'status': 'new_conviction'})
        self.assertEqual(config['forms']['session']['fields']['gender_men'], {'type': 'integer', 'min': 0, 'max': 60})
        self.assertEqual(config['forms']['session']['fields']['roster']['format'], 'participantId')
        self.assertEqual(config['forms']['followup']['fields']['token']['format'], 'participantId')

    def test_future_kind_compiles_without_an_engine_change(self):
        future = copy.deepcopy(self.policy['forms']['session'])
        future.update(tab='Future visits', schema='tpw.future/1', sources=['future-form'])
        self.policy['forms']['future_visit'] = future
        config = builder.build(self.policy)
        self.assertEqual(config['forms']['future_visit']['tab'], 'Future visits')
        self.assertEqual(config['forms']['future_visit']['schema'], 'tpw.future/1')

    def test_reserved_duplicate_and_unsafe_tabs_reject(self):
        for tab in ['Submissions', 'submissions Quarterly', 'Members', 'Constants', 'Data Entry Sheet', 'Form Responses 1', 'Follow-ups', 'follow-UPS', "Bad'!A1", 'x' * 81]:
            with self.subTest(tab=tab):
                policy = copy.deepcopy(self.policy)
                policy['forms']['session']['tab'] = tab
                with self.assertRaises(ValueError):
                    builder.build(policy)

    def test_unknown_config_keys_and_field_types_reject(self):
        mutations = [
            lambda p: p.update(surprise=True),
            lambda p: p['forms']['session'].update(workbook='other'),
            lambda p: p['forms']['session']['fields'].update(secret={'type': 'upload'}),
            lambda p: p['forms']['session']['fields'].update(program={'type': 'text', 'unsupported': True}),
            lambda p: p['forms']['session']['rules'].append({'type': 'unknown', 'field': 'program', 'of': 'org'}),
            lambda p: p['forms']['session']['fields'].update(program={'format': 'unknownFormat'}),
            lambda p: p['forms']['session']['fields'].update(program={'show_if': {'missing_field': True}}),
        ]
        for mutate in mutations:
            policy = copy.deepcopy(self.policy)
            mutate(policy)
            with self.assertRaises(ValueError):
                builder.build(policy)

    def test_contract_type_changes_cannot_be_silently_ignored(self):
        source = builder.source
        def changed(path):
            result = source(path)
            if path == 'data/intake/simple_forms.json':
                result['forms'][0]['fields'][0]['type'] = 'file'
            return result
        with patch.object(builder, 'source', changed), self.assertRaises(ValueError):
            builder.build(self.policy)

    def test_source_contract_cannot_escape_repository(self):
        for path in ['/tmp/forms.json', '../forms.json']:
            policy = copy.deepcopy(self.policy)
            policy['forms']['session']['contract']['path'] = path
            with self.assertRaises(ValueError):
                builder.build(policy)


if __name__ == '__main__':
    unittest.main()

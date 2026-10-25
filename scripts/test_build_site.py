#!/usr/bin/env python3
"""Regression checks for published-mirror wiring; no network or source changes."""
import posixpath
import unittest
from pathlib import Path

from build_site import ROOT, build, wire_mirror


class MirrorBuildTests(unittest.TestCase):
    def test_only_adds_bridge_before_original_scripts(self):
        html = '<!doctype html>\n<html><head><script>original()</script></head><body>TPW’s original page</body></html>'
        output = wire_mirror(html, 'site/ourstory/index.html')
        tag = '\n<script src="../../assets/mirror-nav.js" data-tpw-mirror-nav></script>'
        self.assertEqual(output.replace(tag, '', 1), html)
        self.assertLess(output.index('data-tpw-mirror-nav'), output.index('original()'))
        self.assertEqual(wire_mirror(output, 'site/ourstory/index.html'), output)

    def test_relative_paths_at_every_mirror_depth(self):
        for path in ['site/index.html', 'site/ourstory/index.html', 'site/events/example/index.html']:
            relative = posixpath.relpath('assets/mirror-nav.js', posixpath.dirname(path))
            self.assertIn(f'src="{relative}"', wire_mirror('<HEAD></HEAD>', path))
            self.assertEqual(posixpath.normpath(posixpath.join(posixpath.dirname(path), relative)), 'assets/mirror-nav.js')

    def test_missing_head_fails_explicitly(self):
        with self.assertRaises(ValueError):
            wire_mirror('<body>not a complete page</body>', 'site/example.html')

    def test_cannot_write_into_source(self):
        for path in [ROOT, ROOT / '_site']:
            with self.assertRaisesRegex(ValueError, 'outside the repository'):
                build(path)

    def test_original_story_remains_a_capture(self):
        source = (ROOT / 'site/ourstory/index.html').read_bytes()
        output = wire_mirror(source.decode('utf-8'), 'site/ourstory/index.html')
        self.assertNotIn(b'data-tpw-mirror-nav', source)
        self.assertIn('data-tpw-mirror-nav', output)
        self.assertEqual((ROOT / 'site/ourstory/index.html').read_bytes(), source)


if __name__ == '__main__':
    unittest.main()

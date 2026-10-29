import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILDER = ROOT / 'work/localization/build-ui.py'
MARKER = ';\n/* Offline, UI-only Chinese fallback. No network, storage, cookies, user text collection or telemetry. */'


class BuildUiTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        directory = Path(self.temporary.name)
        self.source = directory / 'source'
        self.output = directory / 'translated'
        (self.source / 'assets').mkdir(parents=True)
        (self.source / 'assets/example.js').write_text(
            'const item={label:`Go to Customize`,value:`customize`};'
        )
        (self.source / 'index.html').write_text('<html lang="en"></html>')
        (self.source / 'first-paint-theme.js').write_text('globalThis.theme="dark";')

    def build(self, output=None):
        return subprocess.run([
            sys.executable, str(BUILDER),
            '--input-dir', str(self.source),
            '--output-dir', str(output or self.output),
        ], cwd=ROOT, capture_output=True, text=True)

    def test_build_uses_reviewed_dictionary_without_changing_sources(self):
        original_dictionary = (ROOT / 'work/localization/dictionary.json').read_bytes()
        source = (self.source / 'assets/example.js').read_bytes()
        result = self.build()
        self.assertEqual(result.returncode, 0, result.stderr)
        generated = (self.output / 'example.js').read_text()
        self.assertIn('前往自定义', generated)
        self.assertIn('value:`customize`', generated)
        self.assertEqual((self.source / 'assets/example.js').read_bytes(), source)
        self.assertEqual(
            (ROOT / 'work/localization/dictionary.json').read_bytes(),
            original_dictionary,
        )
        self.assertIn('lang="zh-CN"', (self.output / 'index.html').read_text())
        self.assertTrue((self.output / 'ast-audit-summary.json').is_file())
        self.assertTrue((self.output / 'surface-audit-summary.json').is_file())

    def test_recognized_old_bootstrap_is_replaced_instead_of_duplicated(self):
        theme = 'globalThis.theme="dark";'
        (self.source / 'first-paint-theme.js').write_text(
            theme + MARKER + '\nlet __zhNativeBusy=false;'
        )
        result = self.build()
        self.assertEqual(result.returncode, 0, result.stderr)
        generated = (self.output / 'first-paint-theme.js').read_text()
        self.assertTrue(generated.startswith(theme + MARKER))
        self.assertEqual(generated.count(MARKER), 1)
        self.assertEqual(generated.count('let __zhNativeBusy='), 1)

    def test_unknown_javascript_fails_instead_of_building_partial_translation(self):
        (self.source / 'assets/example.js').write_text('export {')
        result = self.build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('UI source parsing failed', result.stderr)
        self.assertFalse((self.output / 'first-paint-theme.js').exists())

    def test_input_output_overlap_is_rejected_without_deleting_source(self):
        source = (self.source / 'assets/example.js').read_bytes()
        result = self.build(self.source)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('must not overlap', result.stderr)
        self.assertEqual((self.source / 'assets/example.js').read_bytes(), source)


if __name__ == '__main__':
    unittest.main()

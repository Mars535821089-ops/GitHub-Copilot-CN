import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    'check_upstream', 'scripts/check-upstream.py'
)
check_upstream = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check_upstream)


class UpstreamCheckTest(unittest.TestCase):
    def test_resource_fingerprints_match_exactly(self):
        manifest = {'resources': [{'name': '/assets/app.js', 'sha256': 'abc'}]}
        self.assertEqual(
            check_upstream.resource_changes(manifest, manifest),
            {'added': [], 'removed': [], 'changed': []},
        )

    def test_resource_fingerprints_report_added_removed_and_changed(self):
        baseline = {'resources': [
            {'name': '/assets/changed.js', 'sha256': 'old'},
            {'name': '/assets/removed.js', 'sha256': 'same'},
            {'name': '/assets/opaque.bin', 'compressed_bytes': 3},
        ]}
        current = {'resources': [
            {'name': '/assets/changed.js', 'sha256': 'new'},
            {'name': '/assets/added.js', 'sha256': 'new'},
            {'name': '/assets/opaque.bin', 'compressed_bytes': 5},
        ]}
        self.assertEqual(check_upstream.resource_changes(baseline, current), {
            'added': ['/assets/added.js'],
            'removed': ['/assets/removed.js'],
            'changed': ['/assets/changed.js'],
        })

    def test_opaque_resources_are_not_mistaken_for_source_changes(self):
        baseline = {'resources': [{'name': '/assets/icon.bin', 'compressed_bytes': 1}]}
        current = {'resources': [{'name': '/assets/icon.bin', 'compressed_bytes': 2}]}
        self.assertEqual(
            check_upstream.resource_changes(baseline, current),
            {'added': [], 'removed': [], 'changed': []},
        )

    def test_preview_escapes_unpaired_surrogates_without_failing(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / 'candidate.diff'
            check_upstream.write_preview_text(target, 'text\udc71\n')
            self.assertEqual(target.read_text(), 'text\\udc71\n')


if __name__ == '__main__':
    unittest.main()

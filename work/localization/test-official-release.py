import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    'official', Path(__file__).resolve().parents[2] / 'scripts/check-official-release.py')
official = importlib.util.module_from_spec(spec)
spec.loader.exec_module(official)


class OfficialReleaseTests(unittest.TestCase):
    def setUp(self):
        self.url = 'https://github.com/github/app/releases/download/v1.1.33/GitHub-Copilot-darwin-arm64.tar.gz'
        self.release = {'tag_name': 'v1.1.33', 'draft': False, 'prerelease': False,
                        'html_url': 'https://github.com/github/app/releases/tag/v1.1.33',
                        'assets': [{'browser_download_url': self.url, 'digest': 'sha256:' + 'a' * 64}]}
        self.updater = {'version': '1.1.33', 'platforms': {
            'darwin-aarch64': {'url': self.url, 'signature': 'signature'}}}

    def test_equal_is_not_compatibility_approval(self):
        report = official.compare(self.release, self.updater, '1.1.33')
        self.assertEqual(report['version_status'], 'equal')
        self.assertFalse(report['compatibility_verified'])

    def test_numeric_version_order(self):
        for value, expected in [('1.1.9', 'behind'), ('1.1.34', 'ahead')]:
            self.assertEqual(official.compare(self.release, self.updater, value)['version_status'], expected)

    def test_manifest_disagreement_stops(self):
        self.updater['version'] = '1.1.34'
        with self.assertRaises(ValueError):
            official.compare(self.release, self.updater, '1.1.33')

    def test_wrong_archive_source_stops(self):
        self.updater['platforms']['darwin-aarch64']['url'] = 'https://example.com/archive'
        with self.assertRaises(ValueError):
            official.compare(self.release, self.updater, '1.1.33')

    def test_unverified_release_or_digest_stops(self):
        for key in ['draft', 'prerelease']:
            with self.subTest(key=key):
                invalid = dict(self.release, **{key: True})
                with self.assertRaises(ValueError):
                    official.compare(invalid, self.updater, '1.1.33')
        self.release['assets'][0]['digest'] = None
        with self.assertRaises(ValueError):
            official.compare(self.release, self.updater, '1.1.33')

    def test_unknown_version_format_stops(self):
        for value in ['v1.1.33', '1.1.33-beta', None]:
            with self.assertRaises(ValueError):
                official.compare(self.release, self.updater, value)


if __name__ == '__main__':
    unittest.main()

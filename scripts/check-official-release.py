#!/usr/bin/env python3
"""Read-only comparison with github/app's official stable release and updater manifest."""
import argparse
import json
import plistlib
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from importlib.util import module_from_spec, spec_from_file_location

spec = spec_from_file_location('upstream', Path(__file__).with_name('check-upstream.py'))
upstream = module_from_spec(spec)
spec.loader.exec_module(upstream)


def version(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d+\.\d+\.\d+', value):
        raise ValueError(f'不支持的版本格式：{value!r}')
    return tuple(map(int, value.split('.')))


def compare(release, updater, installed_version):
    tag = release.get('tag_name', '')
    latest = tag.removeprefix('v')
    version(latest)
    if release.get('draft') is not False or release.get('prerelease') is not False:
        raise ValueError('官方来源不是已发布的稳定版')
    root = 'https://github.com/github/app/releases/'
    if release.get('html_url') != root + 'tag/' + tag:
        raise ValueError('官方发布来源不匹配')
    if updater.get('version') != latest:
        raise ValueError('官方 Release 与更新器版本不一致；停止判断')
    expected = root + 'download/' + tag + '/GitHub-Copilot-darwin-arm64.tar.gz'
    assets = [a for a in release.get('assets', []) if a.get('browser_download_url') == expected]
    platform = updater.get('platforms', {}).get('darwin-aarch64', {})
    if len(assets) != 1 or platform.get('url') != expected or not platform.get('signature'):
        raise ValueError('官方 macOS arm64 发布资源与更新器不一致')
    digest = assets[0].get('digest', '')
    if not isinstance(digest, str) or not re.fullmatch(r'sha256:[a-f0-9]{64}', digest):
        raise ValueError('官方资源缺少有效 SHA-256')
    current = version(installed_version)
    target = version(latest)
    return {
        'installed_version': installed_version,
        'official_latest': latest,
        'version_status': 'behind' if current < target else 'equal' if current == target else 'ahead',
        'release_url': release['html_url'],
        'published_at': release.get('published_at'),
        'archive_url': expected,
        'archive_digest': digest,
        'compatibility_verified': False,
        'note': '版本相同不代表资源兼容；仍须提取 UI 并验证主程序、资源指纹和真实源码测试。不会安装、签名或更新白名单。',
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('app', nargs='?', type=Path, default=upstream.DEFAULT_APP)
    args = parser.parse_args()
    try:
        release = json.loads(subprocess.check_output(
            ['gh', 'api', 'repos/github/app/releases/latest'], text=True, timeout=60))
        with tempfile.TemporaryDirectory(prefix='copilot-official-release-') as temporary:
            tag = release.get('tag_name', '')
            version(tag.removeprefix('v'))
            subprocess.run(['gh', 'release', 'download', tag, '--repo', 'github/app',
                            '--pattern', 'latest.json', '--dir', temporary], check=True, timeout=60)
            updater = json.loads((Path(temporary) / 'latest.json').read_text())
        report = compare(release, updater, upstream.app_version(args.app))
        with (args.app / 'Contents/Info.plist').open('rb') as stream:
            report['installed_bundle_build'] = plistlib.load(stream).get('CFBundleVersion')
        report['installed_binary_sha256'] = upstream.sha256(upstream.executable_for(args.app))
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 3 if report['version_status'] != 'equal' else 0
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f'官方版本检查失败，未修改应用：{error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())

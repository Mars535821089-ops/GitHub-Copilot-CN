#!/usr/bin/env python3
"""Read-only Copilot update check and exact-dictionary localization preview."""
import argparse
import datetime
import difflib
import hashlib
import json
import plistlib
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / 'work/research/local-ui-manifest.json'
INSPECTOR = ROOT / 'work/research/inspect_embedded_ui.py'
LOCALIZER = ROOT / 'work/localization/localize.cjs'
DICTIONARY_LOADER = ROOT / 'work/localization/dictionary.cjs'
DEFAULT_APP = Path('/Applications/GitHub Copilot.app')


def executable_for(app):
    executable = app / 'Contents/MacOS/github'
    if not executable.is_file():
        raise ValueError(f'找不到应用主程序：{executable}')
    return executable


def app_version(app):
    info = app / 'Contents/Info.plist'
    if not info.is_file():
        raise ValueError(f'找不到应用版本信息：{info}')
    with info.open('rb') as stream:
        value = plistlib.load(stream).get('CFBundleShortVersionString')
    if not isinstance(value, str) or not value:
        raise ValueError(f'应用 Info.plist 缺少 CFBundleShortVersionString：{info}')
    return value


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def write_preview_text(path, text):
    path.write_bytes(text.encode('utf-8', errors='backslashreplace'))


def resource_changes(baseline, current):
    old = {item['name']: item.get('sha256') for item in baseline.get('resources', [])}
    new = {item['name']: item.get('sha256') for item in current.get('resources', [])}
    added = sorted(new.keys() - old.keys())
    removed = sorted(old.keys() - new.keys())
    changed = sorted(name for name in old.keys() & new.keys()
                     if old[name] is not None and new[name] is not None and old[name] != new[name])
    return {'added': added, 'removed': removed, 'changed': changed}


def preview(app, output_dir):
    executable = executable_for(app)
    version = app_version(app)
    app_hash = sha256(executable)
    baseline = json.loads(BASELINE.read_text())
    output_dir = output_dir.resolve()
    app_resolved = app.resolve()
    if output_dir == app_resolved or app_resolved in output_dir.parents:
        raise ValueError('预览目录不能位于 GitHub Copilot.app 内；应用只读且不会被修改。')
    if output_dir.exists():
        raise ValueError(f'预览目录已存在，拒绝覆盖：{output_dir}')

    with tempfile.TemporaryDirectory(prefix='copilot-upstream-') as temporary:
        temporary = Path(temporary)
        extracted = temporary / 'extracted'
        current_manifest_path = temporary / 'manifest.json'
        subprocess.run([
            sys.executable, str(INSPECTOR),
            '--app-executable', str(executable),
            '--output-dir', str(extracted),
            '--manifest', str(current_manifest_path),
        ], cwd=ROOT, check=True)
        current = json.loads(current_manifest_path.read_text())
        if current.get('errors'):
            raise ValueError('资源提取出现错误；未知应用结构，已停止：' +
                             json.dumps(current['errors'], ensure_ascii=False))

        changes = resource_changes(baseline, current)
        version_matches = version == baseline['app_version']
        binary_matches = app_hash == baseline['app_sha256']
        if version_matches and binary_matches and not any(changes.values()):
            print(f'已识别受支持版本 {version}；应用及文本资源指纹均与基线一致。')
            return 0

        output_dir.mkdir(parents=True)
        localized = output_dir / 'translated-assets'
        effective = temporary / 'effective-dictionary.json'
        effective.write_text(subprocess.check_output(
            ['node', str(DICTIONARY_LOADER)], cwd=ROOT, text=True
        ))
        run = subprocess.run([
            'node', str(LOCALIZER), str(extracted / 'assets'), str(localized), str(effective)
        ], cwd=ROOT, text=True, capture_output=True)
        if run.returncode:
            raise ValueError(f'候选译文生成失败：{run.stderr or run.stdout}')
        audit_path = localized / 'audit.json'
        audit = json.loads(audit_path.read_text())
        parse_errors = [item for item in audit if item.get('error')]
        if parse_errors:
            raise ValueError('发现无法解析的未知前端源码；没有生成可应用补丁：' +
                             json.dumps(parse_errors, ensure_ascii=False))

        changed_names = set(changes['added'] + changes['changed'])
        diff_lines = []
        for resource in sorted(changed_names):
            if not resource.startswith('/assets/') or not resource.endswith('.js'):
                continue
            source = extracted / resource.lstrip('/')
            candidate = localized / Path(resource).name
            if not source.is_file() or not candidate.is_file():
                continue
            diff_lines.extend(difflib.unified_diff(
                source.read_text().splitlines(keepends=True),
                candidate.read_text().splitlines(keepends=True),
                fromfile=f'upstream:{resource}',
                tofile=f'candidate:{resource}',
                n=3,
            ))
        report = {
            'status': 'review-required',
            'app_version': version,
            'baseline_version': baseline['app_version'],
            'app_sha256': app_hash,
            'baseline_app_sha256': baseline['app_sha256'],
            'resource_changes': changes,
            'localized_changed_files': sorted(
                item['file'] for item in audit if item.get('changed')
            ),
            'translation_audit': audit,
            'applied': False,
            'reason': 'No official UI language-pack interface exists; an unknown app/resource fingerprint requires review.',
        }
        write_preview_text(
            output_dir / 'upstream-review.json',
            json.dumps(report, ensure_ascii=False, indent=2) + '\n',
        )
        write_preview_text(output_dir / 'candidate.diff', ''.join(diff_lines))
        print(f'检测到未知上游版本/资源指纹：{version}（基线 {baseline["app_version"]}）。')
        print(f'已生成只读差异预览：{output_dir}')
        print('候选译文未应用；请先审查源码和 candidate.diff，再显式更新基线。')
        return 3


def main():
    parser = argparse.ArgumentParser(
        description='检查本机 GitHub Copilot 更新，并生成不会应用到应用包的本地化差异预览。'
    )
    parser.add_argument('app', nargs='?', type=Path, default=DEFAULT_APP,
                        help='Copilot .app 路径（默认：/Applications/GitHub Copilot.app）')
    parser.add_argument('--output-dir', type=Path,
                        help='预览输出目录；目录必须不存在，默认写入 outputs/')
    args = parser.parse_args()
    output = args.output_dir
    if output is None:
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        output = ROOT / 'outputs' / f'upstream-review-{stamp}'
    try:
        return preview(args.app, output)
    except (OSError, ValueError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        print(f'更新检查已停止：{error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())

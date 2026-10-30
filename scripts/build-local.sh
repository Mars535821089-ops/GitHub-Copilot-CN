#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 2 ]; then
  echo '用法：build-local.sh /path/to/original/GitHub Copilot.app LOCAL_SIGNING_IDENTITY' >&2
  exit 2
fi
root="$(cd "$(dirname "$0")/.." && pwd)"
py="$(printenv COPILOT_PYTHON 2>/dev/null || printf python3)"
cd "$root"
source_app="$1"
identity="$2"
backup='outputs/恢复原版/GitHub Copilot.app'
out='dist/GitHub Copilot 中文版.app'
if [ ! -f "$source_app/Contents/MacOS/github" ]; then
  echo '输入必须是完整的官方原版 .app' >&2
  exit 2
fi
if [ -e "$out" ]; then
  echo 'dist 中已有构建产物；请先自行处理，脚本不会覆盖' >&2
  exit 2
fi
"$py" -m venv --system-site-packages .venv
if ! .venv/bin/python -c 'import brotli; assert tuple(map(int, brotli.__version__.split(".")[:2])) >= (1, 1)' 2>/dev/null; then
  .venv/bin/python -m pip install -r requirements.txt
fi
if [ ! -d work/runtime/node_modules/acorn ]; then
  npm ci --prefix work/runtime
fi
.venv/bin/python scripts/check-upstream.py "$source_app"
mkdir -p 'outputs/恢复原版' dist
if [ ! -e "$backup" ]; then
  ditto "$source_app" "$backup"
fi
"$py" - "$backup/Contents/MacOS/github" <<'PY'
import hashlib,json,pathlib,sys
expected=json.loads(pathlib.Path('work/research/local-ui-manifest.json').read_text())['app_sha256']
actual=hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest()
if actual!=expected: raise SystemExit('本地原版副本与版本约束不一致；未覆盖已有副本')
PY
.venv/bin/python work/research/inspect_embedded_ui.py
.venv/bin/python work/localization/build-ui.py
node work/localization/verify-ui-structure.cjs
node work/localization/audit-ui.cjs work/research/local-ui-assets/assets work/localization/translated-assets work/localization/translated-assets/full-ui-audit.json
node --test work/localization/test-localize.cjs work/localization/test-runtime.cjs work/localization/test-native-menu.cjs work/localization/test-real-settings.cjs work/localization/test-ui-surfaces.cjs work/localization/test-real-source-surfaces.cjs work/localization/test-dictionary.cjs work/localization/test-audit-ui.cjs work/localization/test-univer-locale.cjs
.venv/bin/python work/localization/test-resource-pool.py
.venv/bin/python work/localization/test-upstream-check.py
.venv/bin/python work/localization/test-official-release.py
.venv/bin/python work/localization/test-build-ui.py
ditto "$backup" "$out"
.venv/bin/python work/localization/patch-app.py "$out/Contents/MacOS/github"
for name in Microsoft.AI.Foundry.Local.Core.dylib libonnxruntime.dylib libonnxruntime-genai.dylib CopilotMediaRemoteAdapter.dylib; do
  codesign --force --sign "$identity" --preserve-metadata=identifier,entitlements,flags,runtime --timestamp=none "$out/Contents/Frameworks/$name"
done
codesign --force --sign "$identity" --preserve-metadata=identifier,entitlements,flags,runtime --timestamp=none "$out"
codesign --verify --strict --verbose=2 "$out"
team_main="$(codesign -dv --verbose=4 "$out" 2>&1 | sed -n 's/^TeamIdentifier=//p' | head -1)"
if [ -z "$team_main" ] || [ "$team_main" = 'not set' ]; then
  echo '应用没有有效的签名团队' >&2
  exit 1
fi
for name in Microsoft.AI.Foundry.Local.Core.dylib libonnxruntime.dylib libonnxruntime-genai.dylib CopilotMediaRemoteAdapter.dylib; do
  team_lib="$(codesign -dv --verbose=4 "$out/Contents/Frameworks/$name" 2>&1 | sed -n 's/^TeamIdentifier=//p' | head -1)"
  if [ "$team_lib" != "$team_main" ]; then
    echo "模型库签名团队不一致：$name" >&2
    exit 1
  fi
done
echo "已生成并验证：$root/$out"

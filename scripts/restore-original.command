#!/bin/zsh
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET='/Applications/GitHub Copilot.app'
VERSION="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$TARGET/Contents/Info.plist" 2>/dev/null || true)"
BACKUP="$ROOT/outputs/恢复原版/$VERSION/GitHub Copilot.app"
if [[ "$VERSION" == '1.1.33' && ! -d "$BACKUP" ]]; then
  BACKUP="$ROOT/outputs/恢复原版/GitHub Copilot.app"
fi
[[ -d "$BACKUP" ]] || { echo "找不到版本 $VERSION 对应的官方原版副本；未修改应用。"; exit 1; }
EXPECTED="$(python3 - "$ROOT/work/research/local-ui-manifest.json" <<'PY'
import json,sys
print(json.load(open(sys.argv[1]))['app_sha256'])
PY
)"
ACTUAL="$(shasum -a 256 "$BACKUP/Contents/MacOS/github" | cut -d ' ' -f 1)"
[[ "$ACTUAL" == "$EXPECTED" ]] || { echo '备份指纹与当前支持基线不匹配；未修改应用。'; exit 1; }
codesign --verify --deep --strict "$BACKUP"
if pgrep -f '^/Applications/GitHub Copilot.app/Contents/MacOS/github' >/dev/null; then
  osascript -e 'tell application "/Applications/GitHub Copilot.app" to quit'
  for i in {1..30}; do
    pgrep -f '^/Applications/GitHub Copilot.app/Contents/MacOS/github' >/dev/null || break
    sleep 1
  done
  if pgrep -f '^/Applications/GitHub Copilot.app/Contents/MacOS/github' >/dev/null; then
    echo '应用尚未退出；未强制关闭，未修改安装。'
    exit 1
  fi
fi
if [[ -d "$TARGET" ]]; then
  SAVED="$ROOT/outputs/恢复原版/已保留的中文版-$(date +%Y%m%d-%H%M%S).app"
  mv "$TARGET" "$SAVED"
fi
ditto "$BACKUP" "$TARGET"
codesign --verify --deep --strict "$TARGET"
echo '官方原版已恢复；现有登录、会话、项目数据未删除。'

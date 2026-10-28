#!/bin/zsh
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP="$ROOT/outputs/恢复原版/GitHub Copilot.app"
TARGET='/Applications/GitHub Copilot.app'
[[ -d "$BACKUP" ]] || { echo '找不到官方原版副本；未修改应用。'; exit 1; }
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

#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
source_app="$root/dist/GitHub Copilot 中文版.app"
installed='/Applications/GitHub Copilot.app'
known_previous='cd09695c67ac6368894aad6c5c2fb4d74871d9972b864b3b724855762006481b'
if [ ! -f "$source_app/Contents/MacOS/github" ] || [ ! -f "$installed/Contents/MacOS/github" ]; then
  echo '需要已构建的中文版和已安装的受支持旧中文版；未修改安装。' >&2
  exit 2
fi
codesign --verify --deep --strict "$source_app"
new_sha="$(shasum -a 256 "$source_app/Contents/MacOS/github" | cut -d ' ' -f 1)"
old_sha="$(shasum -a 256 "$installed/Contents/MacOS/github" | cut -d ' ' -f 1)"
if [ "$new_sha" = "$old_sha" ]; then
  echo '安装目录已是本次构建；当前窗口如仍显示旧内容，请正常退出后重新打开。'
  exit 0
fi
if [ "$old_sha" != "$known_previous" ]; then
  echo "已安装应用不是已审查的旧中文版：$old_sha；未替换未知版本或官方原版。" >&2
  exit 3
fi
for app in "$source_app" "$installed"; do
  if [ "$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Contents/Info.plist")" != 'com.github.githubapp' ]; then
    echo '应用标识不匹配；未安装。' >&2
    exit 2
  fi
done
team_new="$(codesign -dv --verbose=4 "$source_app" 2>&1 | sed -n 's/^TeamIdentifier=//p')"
team_old="$(codesign -dv --verbose=4 "$installed" 2>&1 | sed -n 's/^TeamIdentifier=//p')"
if [ -z "$team_new" ] || [ "$team_new" = 'not set' ] || [ "$team_new" != "$team_old" ]; then
  echo '新旧本地签名团队不一致；未安装。' >&2
  exit 2
fi
stamp="$(date '+%Y%m%dT%H%M%S')"
backup="$root/outputs/installed-backups/$stamp/GitHub Copilot.app"
staged="/Applications/.GitHub Copilot-CN-$stamp.app"
if [ -e "$backup" ] || [ -e "$staged" ]; then
  echo '备份或暂存路径已存在；未安装。' >&2
  exit 2
fi
mkdir -p "$(dirname "$backup")"
ditto "$source_app" "$staged"
codesign --verify --deep --strict "$staged"
mv "$installed" "$backup"
if ! mv "$staged" "$installed"; then
  mv "$backup" "$installed"
  echo "安装失败，已恢复旧版；暂存副本保留于 $staged" >&2
  exit 1
fi
installed_sha="$(shasum -a 256 "$installed/Contents/MacOS/github" | cut -d ' ' -f 1)"
if [ "$installed_sha" != "$new_sha" ] || ! codesign --verify --deep --strict "$installed"; then
  mv "$installed" "$staged"
  mv "$backup" "$installed"
  echo "安装签名复核失败，已恢复旧版；新副本保留于 $staged" >&2
  exit 1
fi
printf '已安装：%s\n主程序 SHA-256：%s\n旧版完整备份：%s\n' "$installed" "$new_sha" "$backup"
echo '没有退出当前应用或修改用户数据。当前进程仍运行旧资源；正常退出并重新打开后生效。'

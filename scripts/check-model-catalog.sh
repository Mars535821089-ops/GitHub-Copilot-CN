#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 2 ]; then
  echo '用法：check-model-catalog.sh /path/to/signed/GitHub Copilot.app LOCAL_SIGNING_IDENTITY' >&2
  exit 2
fi
root="$(cd "$(dirname "$0")/.." && pwd)"
app="$(cd "$1" && pwd)"
identity="$2"
lib="$app/Contents/Frameworks/Microsoft.AI.Foundry.Local.Core.dylib"
if [ ! -f "$lib" ]; then
  echo '找不到 Foundry Local 模型库' >&2
  exit 2
fi
tmp="$(mktemp -d "$root/.build-catalog.XXXXXXXX")"
trap 'rm -rf "$tmp"' EXIT
clang -O2 -Wall -Wextra "$root/work/model-diagnosis/catalog-native.c" -o "$tmp/catalog-native"
codesign --force --sign "$identity" --options runtime --timestamp=none "$tmp/catalog-native"
team_harness="$(codesign -dv --verbose=4 "$tmp/catalog-native" 2>&1 | sed -n 's/^TeamIdentifier=//p' | head -1)"
team_lib="$(codesign -dv --verbose=4 "$lib" 2>&1 | sed -n 's/^TeamIdentifier=//p' | head -1)"
team_main="$(codesign -dv --verbose=4 "$app" 2>&1 | sed -n 's/^TeamIdentifier=//p' | head -1)"
if [ -z "$team_harness" ] || [ "$team_harness" != "$team_lib" ] || [ "$team_main" != "$team_lib" ]; then
  echo '测试程序与模型库签名团队不一致' >&2
  exit 1
fi
python3 - "$tmp/config.json" "$tmp" <<'PY'
import json,pathlib,sys
path=pathlib.Path(sys.argv[1]);root=pathlib.Path(sys.argv[2])
config={'Params':{'AppName':'GitHubCopilotVoiceCatalogCheck','AppDataDir':str(root/'app-data'),'ModelCacheDir':str(root/'models'),'LogsDir':str(root/'logs'),'LogLevel':'Warning'}}
path.write_text(json.dumps(config))
PY
"$tmp/catalog-native" "$lib" "$tmp/config.json" "$tmp/catalog.json"
python3 - "$tmp/catalog.json" <<'PY'
import json,sys
rows=json.load(open(sys.argv[1]))
asr=[row.get('alias') for row in rows if row.get('task')=='automatic-speech-recognition']
print('目录模型总数：',len(rows))
print('语音识别模型数：',len(asr))
print('默认模型存在：','nemotron-speech-streaming-en-0.6b' in asr)
PY

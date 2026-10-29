"""Build version-bound localized UI resources; never changes installed app or user data."""
import argparse,json,pathlib,subprocess
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input-dir',type=pathlib.Path,default=pathlib.Path('work/research/local-ui-assets'))
parser.add_argument('--output-dir',type=pathlib.Path,default=pathlib.Path('work/localization/translated-assets'))
args=parser.parse_args()
r=pathlib.Path('work/localization');assets=args.output_dir
source_root=args.input_dir.resolve();output_root=assets.resolve()
if source_root==output_root or source_root in output_root.parents or output_root in source_root.parents:
 raise ValueError('Input and output asset directories must not overlap')
assets.mkdir(parents=True,exist_ok=True)
d=json.loads(subprocess.check_output(['node',str(r/'dictionary.cjs')],text=True))
effective=assets/'effective-dictionary.json'
effective.write_text(json.dumps(d,ensure_ascii=False,indent=2))
for old in assets.glob('*.js'):old.unlink()
p=subprocess.run(['node',str(r/'localize.cjs'),str(args.input_dir/'assets'),str(assets),str(effective)],text=True,capture_output=True,check=True)
(assets/'ast-audit-summary.json').write_text(p.stdout);print(p.stdout)
if json.loads(p.stdout)['errors']:
 raise RuntimeError('UI source parsing failed; localized assets must not be applied')
for file in assets.glob('ExtensionsView-*.js'):
 s=file.read_text().replace('name:`Security`,description:','name:`安全`,description:');file.write_text(s)
# Native-supplied settings metadata is translated at the UI render boundary only.
for file in (args.input_dir/'assets').glob('SettingsRow-*.js'):
 target=assets/file.name;source=target.read_text() if target.exists() else file.read_text()
 for var in ['n','r']:
  old='children:'+var+'}'
  source=source.replace(old,'children:globalThis.__copilotZhNode?.('+var+')??'+var+'}')
 target.write_text(source)
for file in assets.glob('ExperimentalSettingsView-*.js'):
 source=file.read_text().replace('label:n.name,','label:globalThis.__copilotZhText?.(n.name)??n.name,');file.write_text(source)
q=subprocess.run(['node',str(r/'ui-surface-pass.cjs'),str(args.input_dir/'assets'),str(assets),str(effective)],text=True,capture_output=True,check=True)
(assets/'surface-audit-summary.json').write_text(q.stdout);print(q.stdout)
first=(args.input_dir/'first-paint-theme.js').read_text()
marker=';\n/* Offline, UI-only Chinese fallback. No network, storage, cookies, user text collection or telemetry. */'
if marker in first:
 if first.count(marker)!=1:
  raise ValueError('Multiple localization bootstraps found; stop instead of stacking runtimes')
 first=first.split(marker,1)[0]
fallback=(r/'ui-runtime.js').read_text().replace('__ZH_DICTIONARY__',json.dumps(d,ensure_ascii=False,separators=(',',':')))
native=(r/'native-menu.js').read_text().replace('__NATIVE_DICTIONARY__',json.dumps(d,ensure_ascii=False,separators=(',',':')))
univer_locale=json.loads((r/'vendor/univer/zh-CN.json').read_text())
univer_locale['button'].update({'update':'更新','delete':'删除'})
univer=(r/'univer-runtime.js').read_text().replace('__UNIVER_ZH_CN__',json.dumps(univer_locale,ensure_ascii=False,separators=(',',':')))
(assets/'first-paint-theme.js').write_text(first+';\n'+fallback+';\n'+native+';\n'+univer)
html=(args.input_dir/'index.html').read_text().replace('<html lang="en">','<html lang="zh-CN">');(assets/'index.html').write_text(html)
subprocess.run(['node','--check',str(assets/'first-paint-theme.js')],check=True)

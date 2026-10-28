"""Build version-bound localized UI resources; never changes installed app or user data."""
import json,pathlib,subprocess
r=pathlib.Path('work/localization');assets=r/'translated-assets';d=json.loads((r/'dictionary.json').read_text())
d.update({'Skill':'技能','Plugin':'插件','Canvas':'画布','Issue':'议题','Issues':'议题','Plan':'规划','menu bar':'菜单栏','system tray':'系统托盘','Automatically launch GitHub Copilot when you log in to your computer.':'登录电脑时自动启动 GitHub Copilot。','Show the GitHub Copilot icon in the ':'显示 GitHub Copilot 图标于'})
(r/'dictionary.json').write_text(json.dumps(d,ensure_ascii=False,indent=2))
for old in assets.glob('*.js'):old.unlink()
p=subprocess.run(['node',str(r/'localize.cjs'),'work/research/local-ui-assets/assets',str(assets),str(r/'dictionary.json')],text=True,capture_output=True,check=True)
(r/'ast-audit-summary.json').write_text(p.stdout);print(p.stdout)
for file in assets.glob('ExtensionsView-*.js'):
 s=file.read_text().replace('name:`Security`,description:','name:`安全`,description:');file.write_text(s)
# Native-supplied settings metadata is translated at the UI render boundary only.
for file in pathlib.Path('work/research/local-ui-assets/assets').glob('SettingsRow-*.js'):
 target=assets/file.name;source=target.read_text() if target.exists() else file.read_text()
 for var in ['n','r']:
  old='children:'+var+'}'
  source=source.replace(old,'children:globalThis.__copilotZhNode?.('+var+')??'+var+'}')
 target.write_text(source)
for file in assets.glob('ExperimentalSettingsView-*.js'):
 source=file.read_text().replace('label:n.name,','label:globalThis.__copilotZhText?.(n.name)??n.name,');file.write_text(source)
q=subprocess.run(['node',str(r/'ui-surface-pass.cjs'),'work/research/local-ui-assets/assets',str(assets),str(r/'dictionary.json')],text=True,capture_output=True,check=True)
(r/'surface-audit-summary.json').write_text(q.stdout);print(q.stdout)
first=pathlib.Path('work/research/local-ui-assets/first-paint-theme.js').read_text()
fallback=(r/'ui-runtime.js').read_text().replace('__ZH_DICTIONARY__',json.dumps(d,ensure_ascii=False,separators=(',',':')))
native=(r/'native-menu.js').read_text().replace('__NATIVE_DICTIONARY__',json.dumps(d,ensure_ascii=False,separators=(',',':')))
(assets/'first-paint-theme.js').write_text(first+';\n'+fallback+';\n'+native)
html=pathlib.Path('work/research/local-ui-assets/index.html').read_text().replace('<html lang="en">','<html lang="zh-CN">');(assets/'index.html').write_text(html)
subprocess.run(['node','--check',str(assets/'first-paint-theme.js')],check=True)

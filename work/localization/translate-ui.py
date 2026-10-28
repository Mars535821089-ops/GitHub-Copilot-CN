"""Translate allowlisted fixed UI build strings only. Never reads runtime/user content or credentials."""
import concurrent.futures,json,pathlib,re,time,urllib.parse,urllib.request
ROOT=pathlib.Path('work/localization'); source=json.loads((ROOT/'translated-assets/audit.json').read_text()); dictionary=json.loads((ROOT/'dictionary.json').read_text())
skip=re.compile(r'^(?:vendor-|dist-|rehype-|leva\.|invertocat)')
texts=[]
for row in source:
 if skip.search(row['file']):continue
 for m in row.get('missing',[]):
  t=m['text']
  if t in dictionary or t in texts:continue
  if not re.search('[A-Za-z]{2}',t) or re.search(r'^(?:https?://|[a-z0-9_./-]+|#[0-9a-fA-F]{3,8}$)',t):continue
  if len(t)>1100 or '\n' in t:continue
  if t in ['OpenAI','Azure OpenAI','Microsoft Foundry','Anthropic','Ollama (local)','Foundry Local','Copilot CLI','Git','GitHub','GitHub.com','GitHub Copilot','GitHub Enterprise Cloud','GitHub Enterprise Server','MCP','API','SSH','JSON','Markdown','CSV','HTTP','HTTPS','Chrome DevTools','Microsoft 365','React','Node.js','TypeScript','JavaScript','Python','SQL','PowerPoint','Word','Excel','OneDrive','Google Workspace','Linux','Windows','macOS']:continue
  texts.append(t)
import os
if os.environ.get('COPILOT_REMAINING_FILE'):
 candidate=json.loads(pathlib.Path(os.environ['COPILOT_REMAINING_FILE']).read_text())
 texts=[t for t in candidate if t not in dictionary and len(t)<650 and not re.search(r'^(https?://|[a-z0-9_./:#-]+$)|\n',t)]
(ROOT/'ui-translation-inputs.json').write_text(json.dumps(texts,ensure_ascii=False,indent=2))
cachepath=ROOT/'machine-ui-dictionary.json';cache=json.loads(cachepath.read_text()) if cachepath.exists() else {}
pending=[t for t in texts if t not in cache]; batches=[]; batch=[];length=0
for t in pending:
 if batch and length+len(t)>2000:batches.append(batch);batch=[];length=0
 batch.append(t);length+=len(t)+12
if batch:batches.append(batch)
print('fixed UI strings',len(texts),'pending',len(pending),'batches',len(batches),flush=True)

def translate(batch):
 lines=[]
 for i,t in enumerate(batch):
  t=re.sub(r'\$\{(\d+)\}',lambda m:'ZXQPH'+m[1]+'QXZ',t)
  lines.append(f'[{i:04d}] '+t)
 query=urllib.parse.urlencode({'client':'gtx','sl':'en','tl':'zh-CN','dt':'t','q':'\n'.join(lines)})
 for attempt in range(3):
  try:
   req=urllib.request.Request('https://translate.googleapis.com/translate_a/single?'+query,headers={'User-Agent':'Mozilla/5.0'})
   with urllib.request.urlopen(req,timeout=35) as response:raw=json.load(response)
   result=''.join(item[0] for item in raw[0]); found=list(re.finditer(r'\[\s*(\d{4})\s*\]',result));out={}
   for n,match in enumerate(found):
    idx=int(match[1]);end=found[n+1].start() if n+1<len(found) else len(result)
    if idx>=len(batch):continue
    tr=result[match.end():end].strip();t=batch[idx]
    tr=re.sub(r'ZXQPH\s*(\d+)\s*QXZ',lambda m:'${'+m[1]+'}',tr,flags=re.I)
    if sorted(re.findall(r'\$\{\d+\}',tr))!=sorted(re.findall(r'\$\{\d+\}',t)):continue
    if 'session' in t.lower():tr=tr.replace('会议','会话').replace('会期','会话')
    tr=tr.replace('拉动请求','拉取请求').replace('拉取要求','拉取请求').replace('副驾驶','Copilot')
    if tr and re.search(r'[\u3400-\u9fff]',tr):out[t]=tr
   return out
  except Exception as e:
   if attempt==2:return {'__error__':str(e)}
   time.sleep(attempt+1)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 futures=[pool.submit(translate,b) for b in batches]
 for i,f in enumerate(concurrent.futures.as_completed(futures),1):
  res=f.result();error=res.pop('__error__',None);cache.update(res)
  cachepath.write_text(json.dumps(cache,ensure_ascii=False,indent=2))
  if i%10==0 or error or i==len(batches):print('batches',i,'/',len(batches),'translations',len(cache),'error',error,flush=True)
print('done',len(cache),flush=True)

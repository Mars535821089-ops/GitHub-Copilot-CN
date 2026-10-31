"""Version-bound macOS Tauri UI patch. Writes only a staged app, never original/user data.
Reassigns embedded resource pointers inside their already-rebased table fields.
No Mach-O segment resizing, executable code patching, or OS policy changes.
"""
import concurrent.futures,hashlib,json,os,pathlib,struct,sys,time,brotli
from resource_pool import allocate
ORIGINAL=pathlib.Path(os.environ.get(
 'COPILOT_ORIGINAL_EXECUTABLE',
 'outputs/恢复原版/GitHub Copilot.app/Contents/MacOS/github'))
TARGET=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'work/localization/GitHub Copilot 中文版.app/Contents/MacOS/github')
ROOT=pathlib.Path('work/localization'); ASSETS=pathlib.Path('work/research/local-ui-assets'); TRANSLATED=ROOT/'translated-assets'
buf=ORIGINAL.read_bytes();assert hashlib.sha256(buf).hexdigest()==json.load(open('work/research/local-ui-manifest.json'))['app_sha256'],'Original version changed; stop'
assert TARGET.resolve()!=ORIGINAL.resolve()
# Reuse tested read-only geometry without its extraction side effects.
inspection=pathlib.Path('work/research/inspect_embedded_ui.py').read_text().split('rows=[]; errors=[]')[0]
ns={}
# The read-only inspector has its own CLI; do not pass it the patch target argument.
patch_arguments=sys.argv
try:
 sys.argv=['work/research/inspect_embedded_ui.py']
 exec(inspection,ns)
finally:
 sys.argv=patch_arguments
assert ns['APP'].resolve()==ORIGINAL.resolve(),'Resource geometry must use the original app'
start,end,entry,off,va=ns['start'],ns['end'],ns['entry'],ns['off_for_va'],ns['va_for_off']
entries=[];groups={};name_ranges=[]
for at in range(start,end+1,32):
 name,data_off,size=entry(at);np,nl,dp,dl=struct.unpack_from('<4Q',buf,at)
 e={'name':name,'off':data_off,'size':size,'table':at};entries.append(e)
 groups.setdefault((data_off,size),[]).append(e);name_ranges.append((off(np),off(np)+nl))
# All old blobs are disjoint or exact aliases. No names or unrelated bytes may be overwritten.
old_ranges=sorted(groups)
for (o,n),(o2,n2) in zip(old_ranges,old_ranges[1:]):assert o+n<=o2, 'Partial asset overlap; stop'
for o,n in old_ranges:
 assert not any(max(o,a)<min(o+n,b) for a,b in name_ranges),'Data overlaps a resource name'

CACHE=ROOT/'brotli-cache';CACHE.mkdir(exist_ok=True)
def compress_cached(plain):
 key=hashlib.sha256(plain).hexdigest();p=CACHE/(key+'.br')
 if p.exists():return p.read_bytes()
 blob=brotli.compress(plain,quality=11);p.write_bytes(blob);return blob

def build(item):
 (o,size),es=item;first=es[0];name=first['name'];original=buf[o:o+size]
 paths=[TRANSLATED/e['name'].lstrip('/') for e in es]
 changed=[p for p in paths if p.exists()]
 if not changed and name.startswith('/assets/'):
  changed=[TRANSLATED/pathlib.Path(e['name']).name for e in es if (TRANSLATED/pathlib.Path(e['name']).name).exists()]
 if changed:
  values=[p.read_bytes() for p in changed];assert len(set(values))==1,'Aliased resources diverge'
  plain=values[0];compressed=compress_cached(plain);modified=True
 elif name.endswith(('.js','.html','.css','.json')):
  plain=brotli.decompress(original);compressed=compress_cached(plain);modified=False
 else:return (o,size),original,False
 assert brotli.decompress(compressed)==plain
 if not modified and len(compressed)>=size:return (o,size),original,False
 return (o,size),compressed,modified
payloads={};modified=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for i,(key,blob,change) in enumerate(pool.map(build,groups.items()),1):
  payloads[key]=blob
  if change:modified.extend(e['name'] for e in groups[key])
  if i%250==0:print('compressed',i,'/',len(groups),flush=True)
print('Original payload bytes',sum(n for o,n in old_ranges),'new bytes',sum(map(len,payloads.values())),'modified resources',len(modified),flush=True)
# The asset arena is a contiguous range containing only asset names/payloads.
# Compact it safely instead of fragmenting into the original per-file slots.
ranges=sorted([(o,o+n) for o,n in old_ranges]+name_ranges);merged=[]
for a,b in ranges:
 if merged and a<=merged[-1][1]:merged[-1]=(merged[-1][0],max(merged[-1][1],b))
 else:merged.append((a,b))
assert len(merged)==1,'Resource arena has unrelated gaps; stop'
arena_start,arena_end=merged[0];cursor=arena_start;result=bytearray(buf);name_map={};data_map={};placements={}
for e in entries:
 old_np=struct.unpack_from('<Q',buf,e['table'])[0]
 if old_np not in name_map:
  name=e['name'].encode();result[cursor:cursor+len(name)]=name;name_map[old_np]=va(cursor);cursor+=len(name)
for key,blob in payloads.items():
 dest=cursor;assert dest+len(blob)<=arena_end,'Translated assets exceed original resource arena'
 result[dest:dest+len(blob)]=blob;placements[key]=dest;data_map[va(key[0])]=va(dest);cursor+=len(blob)
# Preserve any non-table references to resource names and payloads as well.
relocations=dict(name_map);relocations.update(data_map)
for seg_name,base,vs,fo,fs in ns['segments']:
 if seg_name not in ['__DATA_CONST','__DATA']:continue
 for o in range(fo,fo+fs-7,8):
  ptr=struct.unpack_from('<Q',buf,o)[0]
  if ptr in relocations:struct.pack_into('<Q',result,o,relocations[ptr])
for key,es in groups.items():
 for e in es:struct.pack_into('<Q',result,e['table']+24,len(payloads[key]))
# Old unused tail remains unreachable; do not resize the binary or touch executable code.
print('Packed resource arena; remaining bytes',arena_end-cursor,flush=True)
# Validate every mapped resource directly against intended payload.
for key,es in groups.items():
 for e in es:
  dp,dl=struct.unpack_from('<QQ',result,e['table']+16);got=bytes(result[off(dp):off(dp)+dl]);assert got==payloads[key]
TARGET.write_bytes(result)
report={'original_sha256':hashlib.sha256(buf).hexdigest(),'patched_unsigned_sha256':hashlib.sha256(result).hexdigest(),'resource_count':len(entries),'modified_resources':modified,'payload_bytes_old':sum(n for o,n in old_ranges),'payload_bytes_new':sum(map(len,payloads.values())),'all_payloads_verified':True}
(ROOT/'patch-manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('PATCHED staged executable:',TARGET,flush=True)

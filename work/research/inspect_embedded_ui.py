"""Read-only inventory/extraction of local Tauri frontend resources for localization review.
Never modifies or executes the app or extracted JavaScript.
"""
import hashlib,json,os,pathlib,struct
import brotli
APP=pathlib.Path(os.environ.get('COPILOT_ORIGINAL_EXECUTABLE','outputs/恢复原版/GitHub Copilot.app/Contents/MacOS/github'))
OUT=pathlib.Path('work/research/local-ui-assets'); OUT.mkdir(parents=True,exist_ok=True)
buf=APP.read_bytes()
assert struct.unpack_from('<I',buf)[0]==0xfeedfacf
ncmd=struct.unpack_from('<I',buf,16)[0]; pos=32; segments=[]
for _ in range(ncmd):
    cmd,size=struct.unpack_from('<II',buf,pos)
    if cmd==0x19:
        _,_,name,va,vs,fo,fs,*_=struct.unpack_from('<II16sQQQQiiII',buf,pos)
        segments.append((name.rstrip(b'\0').decode(),va,vs,fo,fs))
    pos+=size

def off_for_va(va):
    for _,start,_,fo,fs in segments:
        if start<=va<start+fs: return fo+va-start
    raise ValueError('unmapped address')

def va_for_off(off):
    for _,va,_,fo,fs in segments:
        if fo<=off<fo+fs: return va+off-fo
    raise ValueError('unmapped offset')

def entry(at):
    if at<0 or at+32>len(buf): return None
    np,nl,dp,dl=struct.unpack_from('<4Q',buf,at)
    if not 1<=nl<=500 or not 1<=dl<=50_000_000: return None
    try: no,do=off_for_va(np),off_for_va(dp)
    except ValueError: return None
    raw=buf[no:no+nl]
    if not raw.startswith(b'/') or any(c<32 or c>126 for c in raw): return None
    if do+dl>len(buf): return None
    return raw.decode(),do,dl
needle=b'/assets/ChatPanel-'; no=buf.find(needle)
assert no>=0
ptr=struct.pack('<Q',va_for_off(no)); candidate=buf.find(ptr)
assert candidate>=0 and entry(candidate)
start=candidate
while entry(start-32): start-=32
end=candidate
while entry(end+32): end+=32
rows=[]; errors=[]
for at in range(start,end+1,32):
    name,offset,length=entry(at)
    row={'name':name,'compressed_bytes':length}
    if name.endswith(('.js','.html','.css','.json')):
        try:
            decoded=brotli.decompress(buf[offset:offset+length])
            target=OUT/name.lstrip('/')
            assert target.resolve().is_relative_to(OUT.resolve())
            target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(decoded)
            row.update(decoded_bytes=len(decoded),sha256=hashlib.sha256(decoded).hexdigest())
        except Exception as e: errors.append({'name':name,'error':str(e)})
    rows.append(row)
manifest={'app_version':'1.1.33','app_sha256':hashlib.sha256(buf).hexdigest(),'resource_count':len(rows),'decoded_count':sum('decoded_bytes' in r for r in rows),'errors':errors,'resources':rows}
pathlib.Path('work/research/local-ui-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in manifest.items() if k!='resources'},ensure_ascii=False,indent=2))

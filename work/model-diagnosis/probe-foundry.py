import ctypes,json,pathlib,time,os,re
root=pathlib.Path('work/model-diagnosis/runtime').resolve();root.mkdir(parents=True,exist_ok=True)
class Request(ctypes.Structure):_fields_=[('Command',ctypes.c_void_p),('CommandLength',ctypes.c_int32),('Data',ctypes.c_void_p),('DataLength',ctypes.c_int32)]
class Response(ctypes.Structure):_fields_=[('Data',ctypes.c_void_p),('DataLength',ctypes.c_int32),('Error',ctypes.c_void_p),('ErrorLength',ctypes.c_int32)]
lib=ctypes.CDLL('/Applications/GitHub Copilot.app/Contents/Frameworks/Microsoft.AI.Foundry.Local.Core.dylib');lib.execute_command.argtypes=[ctypes.POINTER(Request),ctypes.POINTER(Response)];lib.execute_command.restype=None;lib.free_response.argtypes=[ctypes.POINTER(Response)];lib.free_response.restype=None
results=[]
def call(command,params=None):
 command_buf=ctypes.create_string_buffer(command.encode());data=json.dumps({'Params':params}).encode() if params else b'{}';data_buf=ctypes.create_string_buffer(data);req=Request(ctypes.cast(command_buf,ctypes.c_void_p),len(command.encode()),ctypes.cast(data_buf,ctypes.c_void_p),len(data));res=Response();started=time.time();lib.execute_command(ctypes.byref(req),ctypes.byref(res));row={'command':command,'seconds':round(time.time()-started,2)}
 for key,ptr,n in [('data',res.Data,res.DataLength),('error',res.Error,res.ErrorLength)]:
  if ptr and n:row[key]=ctypes.string_at(ptr,n).decode('utf-8',errors='replace')
 lib.free_response(ctypes.byref(res));
 if len(row.get('data',''))>1500:
  raw=row.pop('data');pathlib.Path('work/model-diagnosis/public-model-catalog.json').write_text(raw);
  try:
   parsed=json.loads(raw);row['model_count']=len(parsed) if isinstance(parsed,list) else None;row['data_kind']=type(parsed).__name__;row['sample_aliases']=[v.get('alias') for v in parsed[:8]] if isinstance(parsed,list) else list(parsed)[:8]
  except json.JSONDecodeError:row['data_bytes']=len(raw)
 results.append(row);print(json.dumps(row,ensure_ascii=False),flush=True);pathlib.Path('work/model-diagnosis/foundry-probe.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));return row
call('initialize',{'AppName':'GitHubCopilotVoiceDiagnostics','AppDataDir':str(root),'ModelCacheDir':str(root/'models'),'LogsDir':str(root/'logs'),'LogLevel':'Debug'})
call('get_catalog_name')
call('get_model_list')

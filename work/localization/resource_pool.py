"""Best-fit allocation exclusively in verified embedded-resource byte ranges."""
def allocate(items,slots):
 free=list(slots); result={}
 for key,blob in sorted(items.items(),key=lambda kv:-len(kv[1])):
  candidates=[(size,offset,i) for i,(offset,size) in enumerate(free) if size>=len(blob)]
  if not candidates:raise ValueError(f'No resource-only slot for {key}: {len(blob)} bytes; largest free {max((s for o,s in free),default=0)}')
  size,offset,i=min(candidates);result[key]=offset
  free[i]=(offset+len(blob),size-len(blob))
 return result

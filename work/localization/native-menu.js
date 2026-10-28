/* Localize existing menu objects through the app's own Tauri menu API. IDs and actions are untouched. */
async function localizeNativeMenu(Menu,D){
 let temporary,current,restored=false;const refs=[];
 try{
  temporary=await Menu.new({items:[]});
  try{current=await temporary.setAsAppMenu()}catch(e){await temporary.close().catch(()=>{});return false}
  if(!current)return false;
  // Restore original menu before changing any labels. Never recreate its actions or accelerators.
  await current.setAsAppMenu();restored=true;
  async function visit(parent){const items=await parent.items();for(const item of items){refs.push(item);try{if(typeof item.text==='function'){const text=await item.text();let translated=D[text];if(translated===undefined&&text.startsWith('Hide '))translated='隐藏 '+text.slice(5);if(translated!==undefined&&translated!==text)await item.setText(translated)}}catch(_){}if(item.kind==='Submenu')await visit(item)}}
  await visit(current);return true;
 }finally{if(current&&!restored)await current.setAsAppMenu().catch(()=>{});for(const r of refs.reverse())await r.close().catch(()=>{});if(current)await current.close().catch(()=>{});if(temporary)await temporary.close().catch(()=>{})}
}
let __zhNativeBusy=false;async function __zhNativeApply(){if(__zhNativeBusy)return;__zhNativeBusy=true;try{const m=await import('/assets/menu-vyPMZk-3.js');await localizeNativeMenu(m.Menu,__NATIVE_DICTIONARY__)}catch(_){}finally{__zhNativeBusy=false}}
setTimeout(__zhNativeApply,1200);setTimeout(__zhNativeApply,6000);

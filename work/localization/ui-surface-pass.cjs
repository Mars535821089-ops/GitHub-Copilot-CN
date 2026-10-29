const acorn=require('../runtime/node_modules/acorn'),walk=require('../runtime/node_modules/acorn-walk');
const {displayProperty}=require('./display-metadata.cjs');
const {localizeUniver}=require('./univer-ui.cjs');
const UI_PROPS=new Set(['placeholder','data-placeholder','aria-label','aria-description','title','tooltip','label','description','alt']);
const isUiProp=k=>UI_PROPS.has(k)||displayProperty(k);
const SCOPE=new Set(['Program','BlockStatement','FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','CatchClause']);
const calleeOf=n=>n?.type==='SequenceExpression'?n.expressions.at(-1):n;
const name=p=>p?.key?.name??p?.key?.value;const fixed=n=>n?.type==='Literal'&&typeof n.value==='string'?n.value:n?.type==='TemplateLiteral'?n.quasis.map((q,i)=>q.value.cooked+(i<n.expressions.length?'${'+i+'}':'')).join(''):null;
function transform(source,dictionary={},options={}){
 const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module',allowHashBang:true});const bindings=new Map();const edits=[];const audit={renderBindings:0,labelTupleBindings:0,builtinTemplateSeeds:0,unmapped:[]};
 function scopeOf(anc){return [...anc].reverse().find(n=>SCOPE.has(n.type))??ast}
 function add(scope,key,init,anc){if(!key)return;let map=bindings.get(scope);if(!map)bindings.set(scope,map=new Map());if(!map.has(key))map.set(key,[]);map.get(key).push({init,anc:[...anc],pos:init?.start??0})}
 function bindPattern(pattern,init,anc,scope){if(pattern.type==='Identifier')add(scope,pattern.name,init,anc);else if(pattern.type==='ArrayPattern')pattern.elements.forEach((p,i)=>{if(p)bindPattern(p,{type:'Projection',source:init,key:i,start:init?.start},anc,scope)});else if(pattern.type==='ObjectPattern')for(const p of pattern.properties)if(p.type==='Property')bindPattern(p.value,{type:'Projection',source:init,key:name(p),start:init?.start},anc,scope)}
 walk.fullAncestor(ast,(node,_s,anc)=>{
  if(node.type==='VariableDeclarator')bindPattern(node.id,node.init,anc,scopeOf(anc.slice(0,-1)));
  if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type)){
   const parent=anc[anc.length-2];const receiver=parent?.type==='CallExpression'&&parent.callee?.type==='MemberExpression'&&parent.callee.property?.name==='map'&&parent.arguments.includes(node)?parent.callee.object:null;
   node.params.forEach((p,i)=>bindPattern(p,i===0&&receiver?{type:'EachElement',source:receiver,start:receiver.start}:null,anc,node));
  }
 });
 function findBinding(id,anc){for(const s of [...anc].reverse().filter(n=>SCOPE.has(n.type))){const rows=bindings.get(s)?.get(id);if(rows){const eligible=rows.filter(r=>(r.pos??0)<=source.length);return eligible.at(-1)}}return null}
 function resolve(node,anc,depth=0,seen=new Set()){
  if(!node||depth>12)return [];if(seen.has(node))return [];seen=new Set(seen);seen.add(node);
  if(node.type==='CallExpression'&&calleeOf(node.callee)?.type==='Identifier'&&options.fixedFunctions?.[calleeOf(node.callee).name])return options.fixedFunctions[calleeOf(node.callee).name].map(value=>({node:{type:'Literal',value},anc}));
  if(node.type==='Identifier'){const b=findBinding(node.name,anc);return b?.init?resolve(b.init,b.anc,depth+1,seen):[]}
  if(node.type==='EachElement'){const out=[];for(const v of resolve(node.source,anc,depth+1,seen))if(v.node.type==='ArrayExpression')for(const el of v.node.elements)if(el)out.push(...resolve(el,v.anc,depth+1,seen));return out}
  if(node.type==='Projection'||node.type==='MemberExpression'){
   const base=node.type==='Projection'?node.source:node.object;const key=node.type==='Projection'?node.key:node.computed?(node.property.type==='Literal'?node.property.value:null):node.property.name;const out=[];
   for(const v of resolve(base,anc,depth+1,seen)){
    if(v.node.type==='ObjectExpression'){const ps=v.node.properties.filter(p=>p.type==='Property'&&(key===null||name(p)===key));for(const p of ps)out.push(...resolve(p.value,v.anc,depth+1,seen))}
    if(v.node.type==='ArrayExpression'){const els=key===null?v.node.elements:[v.node.elements[key]];for(const el of els)if(el)out.push(...resolve(el,v.anc,depth+1,seen))}
   }return node.type==='Projection'&&typeof key==='number'?out.map(v=>({...v,tupleDerived:true})):out;
  }
  if(node.type==='ConditionalExpression'){const a=resolve(node.consequent,anc,depth+1,seen),b=resolve(node.alternate,anc,depth+1,seen);return a.length&&b.length?[...a,...b]:[]}
  if(node.type==='LogicalExpression'){const a=resolve(node.left,anc,depth+1,seen),b=resolve(node.right,anc,depth+1,seen);return a.length&&b.length?[...a,...b]:[]}
  if(node.type==='SequenceExpression')return resolve(node.expressions.at(-1),anc,depth+1,seen);
  if(['Literal','TemplateLiteral','ObjectExpression','ArrayExpression'].includes(node.type))return[{node,anc}];return [];
 }
 function jsxCall(anc){const p=anc.at(-2),call=anc.at(-3);return p?.type==='ObjectExpression'&&call?.type==='CallExpression'&&call.arguments[1]===p&&calleeOf(call.callee)?.type==='MemberExpression'&&['jsx','jsxs','createElement'].includes(calleeOf(call.callee).property?.name)?call:null}
 function protectedRender(anc){for(const n of anc){if(n.type!=='CallExpression'||calleeOf(n.callee)?.type!=='MemberExpression'||!['jsx','jsxs'].includes(calleeOf(n.callee).property?.name))continue;const tag=fixed(n.arguments[0]);if(['pre','code','textarea','script','style'].includes(tag))return true;const props=n.arguments[1];if(props?.type==='ObjectExpression'&&props.properties.some(p=>p.type==='Property'&&/data-(?:user-message|markdown-root|task-content)|data-message-author/.test(String(name(p)))))return true}return false}
 walk.fullAncestor(ast,(node,_s,anc)=>{
  if(node.type!=='Property'||node.method||node.computed)return;const key=name(node),value=node.value;if(!value||value.type==='SpreadElement')return;
  // Only factory defaults of bundled, app-owned automation templates are localized.
  if(options.fileName?.startsWith('WorkflowTemplatesContent-')&&['name','prompt'].includes(key)){
   const owner=anc.at(-2),parentProp=anc.at(-3),record=anc.at(-4);const text=fixed(value);
   if(parentProp?.type==='Property'&&name(parentProp)==='values'&&record?.type==='ObjectExpression'&&record.properties.some(p=>name(p)==='title')&&text&&!text.startsWith('/')&&dictionary[text]&&dictionary[text]!==text){edits.push({start:value.start,end:value.end,text:value.type==='TemplateLiteral'?'`'+dictionary[text].replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$\{/g,'\\${')+'`':JSON.stringify(dictionary[text]),kind:'seed'});audit.builtinTemplateSeeds++}return;
  }
  const call=jsxCall(anc);if(!call&&key!=='data-placeholder')return;if(protectedRender(anc)&&key==='children')return;
  const forcedSchedule=options.fileName?.startsWith('WorkflowDialog-')&&anc.some(n=>n.type==='FunctionDeclaration'&&n.id?.name==='oi');
  let owned=false;const sources=resolve(value,anc);
  if(key==='children')owned=forcedSchedule||sources.length>0&&sources.every(s=>fixed(s.node)!==null);
  else owned=isUiProp(key)&&(['placeholder','data-placeholder','typeLabel','statusLabel','actionLabel','buttonLabel'].includes(key)||sources.length>0&&sources.every(s=>fixed(s.node)!==null));
  if(!owned||['ArrowFunctionExpression','FunctionExpression'].includes(value.type))return;
  for(const s of sources){const text=fixed(s.node);if(text&&/[A-Za-z]{2}/.test(text)&&/\s/.test(text)&&!dictionary[text]&&!/^https?:/.test(text))audit.unmapped.push({text,property:key,position:s.node.start})}
  const raw=source.slice(value.start,value.end);if(raw.includes('__copilotZh'))return;
  const method=['placeholder','data-placeholder','aria-label','aria-description','alt'].includes(key)?'__copilotZhText':'__copilotZhNode';
  edits.push({start:value.start,end:value.end,text:'((globalThis.'+method+'??(v=>v))(('+raw+')))',kind:'render'});audit.renderBindings++;if(sources.some(s=>s.tupleDerived))audit.labelTupleBindings++;
 });
 edits.sort((a,b)=>b.start-a.start);let code=source,last=source.length;const used=[];for(const edit of edits){if(edit.end>last)continue;code=code.slice(0,edit.start)+edit.text+code.slice(edit.end);last=edit.start;used.push(edit)}
 if(options.fileName?.startsWith('UniverWorkbookCanvas-')){code=localizeUniver(code);audit.univerLocale=1;}
 acorn.parse(code,{ecmaVersion:'latest',sourceType:'module',allowHashBang:true});audit.applied=used.length+(audit.univerLocale??0);return{code,audit};
}
module.exports={transform};
if(require.main===module){const fs=require('fs'),path=require('path');const [input,output,dictFile]=process.argv.slice(2);const dictionary=JSON.parse(fs.readFileSync(dictFile));const functionIndex=require('./fixed-render-functions.cjs').buildIndex(input);fs.writeFileSync(path.join(output,'fixed-render-functions.json'),JSON.stringify(functionIndex));const reports=[];for(const file of fs.readdirSync(input)){if(!file.endsWith('.js'))continue;const dest=path.join(output,file);const source=fs.existsSync(dest)?fs.readFileSync(dest,'utf8'):fs.readFileSync(path.join(input,file),'utf8');try{const r=transform(source,dictionary,{fileName:file,fixedFunctions:functionIndex[file]});if(r.audit.applied)fs.writeFileSync(dest,r.code);reports.push({file,...r.audit})}catch(e){reports.push({file,error:e.message})}}fs.writeFileSync(path.join(output,'surface-audit.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({scanned:reports.length,changed:reports.filter(r=>r.applied).length,renderBindings:reports.reduce((a,r)=>a+(r.renderBindings||0),0),templateSeeds:reports.reduce((a,r)=>a+(r.builtinTemplateSeeds||0),0),errors:reports.filter(r=>r.error)},null,2));if(reports.some(r=>r.error))process.exit(1)}

const acorn=require('../runtime/node_modules/acorn');
const walk=require('../runtime/node_modules/acorn-walk');
const {displayProperty,reviewedMapValue,toolDisplayValue,systemDisplayValue,tourErrorValue}=require('./display-metadata.cjs');
const DISPLAY=new Set(['children','label','title','description','placeholder','aria-label','aria-description','alt','tooltip','hint','caption','labelContext','emptyLabel','searchLabel','displayName','buttonLabel','confirmLabel','cancelLabel','header','subtitle','heading','helpText','text','messageText','contentDescription','accessibilityLabel']);
const NO=new Set(['prompt','systemPrompt','instructions','content','value','id','path','type','name','key','command','role','category','searchTerms','action','href','url','className','style']);
function propName(n){return n?.key?.name??n?.key?.value??''}
function displayContext(node,ancestors){
  if(modeDisplayValue(node,ancestors)||assistedBadgeValue(node,ancestors))return true;
  const raw=node.type==='Literal'?node.value:node.type==='TemplateLiteral'?node.quasis.map(q=>q.value.cooked).join(''):'';
  const safeUi=['Skill','Plugin','Canvas','MCP server','MCP servers','menu bar','system tray'];
  let returned=false;
  for(let i=ancestors.length-2;i>=0;i--){const a=ancestors[i],child=ancestors[i+1];
    if(a.type==='Property'){
      if(child===a.key)return false;
      const key=propName(a);if(NO.has(key))return false;if(DISPLAY.has(key)||displayProperty(key))return true;
    }
    if(a.type==='TemplateLiteral')return false;
    if(a.type==='MemberExpression'&&a.computed&&child===a.property)return false;
    if(a.type==='ReturnStatement')returned=true;
    if(a.type==='VariableDeclarator'){if(/prompt|instruction|content|source|code/i.test(a.id?.name??''))return false;returned=true;}
    if(['BinaryExpression','SwitchCase','ImportDeclaration','ExportNamedDeclaration','TaggedTemplateExpression'].includes(a.type))return false;
    if(a.type==='CallExpression'){
      const fn=a.callee;const name=fn.type==='Identifier'?fn.name:fn.property?.name;
      if(['Error','alert','confirm','setTitle','setLabel','setDescription'].includes(name))return true;
      return false;
    }
    if(a.type==='NewExpression')return a.callee?.name==='Error';
  }return typeof raw==='string'&&returned&&(safeUi.includes(raw)||raw.length>35&&/^[A-Z][A-Za-z ,.'’\-]*(?:[.!?]|\.\.\.)$/.test(raw));
}
function encode(s){return JSON.stringify(s)}
function literalText(n){return n?.type==='Literal'&&typeof n.value==='string'?n.value:n?.type==='TemplateLiteral'&&!n.expressions.length?n.quasis[0].value.cooked:null}
function modeDisplayValue(node,ancestors){
  const property=ancestors.at(-2),owner=ancestors.at(-3);
  if(property?.type!=='Property'||property.value!==node||owner?.type!=='ObjectExpression'||owner.properties.length!==3)return false;
  const maps=[
    {interactive:'Interactive',plan:'Plan',autopilot:'Autopilot'},
    {interactive:'Step-by-step collaboration',plan:'Plan first, execute when ready',autopilot:'End-to-end execution without interruption'},
  ];
  return maps.some(map=>owner.properties.every(p=>p.type==='Property'&&!p.computed&&!p.method&&Object.hasOwn(map,propName(p))&&literalText(p.value)===map[propName(p)])&&new Set(owner.properties.map(propName)).size===3);
}
function assistedBadgeValue(node,ancestors){
  const property=ancestors.at(-2),owner=ancestors.at(-3);
  if(property?.type!=='Property'||propName(property)!=='badge'||property.value!==node||literalText(node)!=='Experimental'||owner?.type!=='ObjectExpression')return false;
  const props=new Map(owner.properties.filter(p=>p.type==='Property'&&!p.computed).map(p=>[propName(p),literalText(p.value)]));
  return props.get('label')==='Assisted'&&props.get('description')==='Uses AI to reduce approval prompts.';
}
function emojiDescription(node,ancestors){
  const property=ancestors.at(-2),owner=ancestors.at(-3);
  if(property?.type!=='Property'||propName(property)!=='description'||property.value!==node||owner?.type!=='ObjectExpression')return false;
  const properties=new Map(owner.properties.filter(p=>p.type==='Property'&&!p.computed).map(p=>[propName(p),p.value]));
  return literalText(properties.get('emoji'))!==null&&properties.get('names')?.type==='ArrayExpression'&&properties.get('tags')?.type==='ArrayExpression'&&literalText(properties.get('category'))!==null;
}
function collectSentinels(ast){const set=new Set();walk.fullAncestor(ast,(n,_s,anc)=>{const text=literalText(n);if(text===null)return;const p=anc[anc.length-2];if(p?.type==='BinaryExpression'||p?.type==='SwitchCase'||p?.type==='CallExpression'&&p.callee?.type==='MemberExpression'&&['includes','startsWith','endsWith','indexOf','lastIndexOf','has'].includes(p.callee.property?.name))set.add(text)});return set;}
function localize(source,dict,options={}){
  const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module',allowHashBang:true});
  const protectedStrings=collectSentinels(ast);for(const str of options.protectedStrings??[])protectedStrings.add(str);
  const edits=[],missing=[];
  walk.fullAncestor(ast,(n,st,anc)=>{
    if(n.type!=='Literal'&&n.type!=='TemplateLiteral')return;
    if(anc.some(a=>a.type==='CallExpression'&&source.slice(a.callee.start,a.callee.end).includes('globalThis.__copilotZh')))return;
    const system=systemDisplayValue(n,options.fileName);
    const property=anc.at(-2);
    const reviewed=system||reviewedMapValue(n,anc,options.fileName)||toolDisplayValue(n,anc,options.fileName)||tourErrorValue(n,anc,options.fileName)
      ||property?.type==='Property'&&property.value===n&&!property.computed&&displayProperty(propName(property));
    if(!reviewed&&!displayContext(n,anc))return;
    let text,render;
    if(n.type==='Literal'){if(typeof n.value!=='string')return;text=n.value;render=v=>encode(v)}
    else {text=n.quasis.map((q,i)=>q.value.cooked+(i<n.expressions.length?'${'+i+'}':'')).join('');
      render=v=>'`'+v.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$\{(\d+)\}/g,(_,i)=>'${'+source.slice(n.expressions[+i].start,n.expressions[+i].end)+'}')+'`';}
    if(system&&['${0} message${1}','${0} (${1} sub-agent${2}, ${3} calls, ${4} hidden)'].includes(text)){
      const raw=source.slice(n.start,n.end);
      edits.push({start:n.start,end:n.end,text:'((globalThis.__copilotZhText??(v=>v))(('+raw+')))',from:text,to:'<localized count template>'});return;
    }
    const tr=protectedStrings.has(text)&&!reviewed&&!emojiDescription(n,anc)&&!modeDisplayValue(n,anc)&&!assistedBadgeValue(n,anc)?undefined:dict[text];
    if(tr!==undefined&&n.type==='TemplateLiteral'){const expected=n.expressions.map((_,i)=>String(i));const actual=[...tr.matchAll(/\$\{(\d+)\}/g)].map(m=>m[1]);if(expected.join(',')!==actual.join(','))throw Error('translation changed template expression order: '+text);}
    if(tr!==undefined&&tr!==text){edits.push({start:n.start,end:n.end,text:render(tr),from:text,to:tr})}
    else if(/[A-Za-z]{2}/.test(text)&&text.length<1500)missing.push({text,start:n.start,end:n.end,context:source.slice(Math.max(0,n.start-70),Math.min(source.length,n.end+50))});
  });
  edits.sort((a,b)=>b.start-a.start);let code=source,last=source.length;
  const applied=[];for(const e of edits){if(e.end>last)continue;code=code.slice(0,e.start)+e.text+code.slice(e.end);last=e.start;applied.push(e)}
  if(applied.length)acorn.parse(code,{ecmaVersion:'latest',sourceType:'module',allowHashBang:true});
  return {code,changed:applied.length,edits:applied,missing};
}
module.exports={localize,collectSentinels,displayContext};
if(require.main===module){const fs=require('fs'),path=require('path');const input=process.argv[2],output=process.argv[3],dict=JSON.parse(fs.readFileSync(process.argv[4]));fs.mkdirSync(output,{recursive:true});const globalSentinels=new Set();for(const f of fs.readdirSync(input)){if(!f.endsWith('.js'))continue;try{const a=acorn.parse(fs.readFileSync(path.join(input,f),'utf8'),{ecmaVersion:'latest',sourceType:'module'});for(const text of collectSentinels(a))globalSentinels.add(text)}catch{}}let result=[];for(const f of fs.readdirSync(input)){if(!f.endsWith('.js'))continue;const text=fs.readFileSync(path.join(input,f),'utf8');try{const r=localize(text,dict,{protectedStrings:globalSentinels,fileName:f});if(r.changed)fs.writeFileSync(path.join(output,f),r.code);result.push({file:f,changed:r.changed,missing:r.missing,edits:r.edits.map(e=>({from:e.from,to:e.to}))})}catch(e){result.push({file:f,error:e.message})}}fs.writeFileSync(path.join(output,'audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({bundles:result.length,changedBundles:result.filter(r=>r.changed).length,replacements:result.reduce((a,r)=>a+(r.changed||0),0),errors:result.filter(r=>r.error)},null,2))}

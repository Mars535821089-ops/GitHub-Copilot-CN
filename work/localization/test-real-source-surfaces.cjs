const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),acorn=require('../runtime/node_modules/acorn'),walk=require('../runtime/node_modules/acorn-walk');const {JSDOM}=require('../runtime/node_modules/jsdom');const d=require('./dictionary.cjs').loadDictionary();const dom=new JSDOM('<body></body>',{runScripts:'dangerously'});dom.window.eval(fs.readFileSync(__dirname+'/ui-runtime.js','utf8').replace('__ZH_DICTIONARY__',()=>JSON.stringify(d)));
const dir=process.env.COPILOT_TRANSLATED_ASSETS||__dirname+'/translated-assets';const file=fs.readdirSync(dir).find(f=>f.startsWith('App-')&&f.endsWith('.js'));const source=fs.readFileSync(dir+'/'+file,'utf8');let expression;walk.simple(acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'}),{CallExpression(n){if(n.callee.type==='MemberExpression'&&n.callee.property.name==='map'&&n.callee.object.type==='ArrayExpression'&&source.slice(n.callee.object.start,n.callee.object.end).includes('`needs-attention`,`Needs attention`'))expression=source.slice(n.start,n.end)}});
test('actual production sidebar status menu renders all four Chinese labels',()=>{assert.ok(expression,'real status map expression not found');const jsx=(type,props,key)=>({type,props,key});const context={Q:{jsx,jsxs:jsx},Kg:'status-menu-item',G_:'status-menu-item',g:[],x:()=>{},f:null,Z4:()=>[],globalThis:dom.window};const output=vm.runInNewContext(expression,context);assert.deepEqual(Array.from(output,v=>v.props.children),['需要关注','未读','处理中','已完成']);assert.deepEqual(Array.from(output,v=>v.key),['needs-attention','unread','working','done']);});
test('all factory templates keep trigger values and expose Chinese initial text',()=>{const f=fs.readdirSync(dir).find(f=>f.startsWith('WorkflowTemplatesContent-'));const s=fs.readFileSync(dir+'/'+f,'utf8');let rows=[];walk.simple(acorn.parse(s,{ecmaVersion:'latest',sourceType:'module'}),{Property(n){const key=n.key.name??n.key.value;if(!['name','prompt'].includes(key))return;if(n.value.type==='TemplateLiteral'&&!n.value.expressions.length){const text=n.value.quasis[0].value.cooked;if(!text.startsWith('/'))rows.push(text)}}});assert.ok(rows.length>=13);for(const text of rows)assert.match(text,/[\u3400-\u9fff]/);assert.match(s,/interval:`weekly`,schedule_day:1,schedule_hour:10/);assert.ok(s.includes('/chronicle cost-tips'))});
test('all known real composer placeholders translate including hidden modes and source variants',()=>{const originDir=process.env.COPILOT_SOURCE_ASSETS||__dirname+'/../research/local-ui-assets/assets';const transport=fs.readdirSync(originDir).find(name=>name.startsWith('useWebSocketTransport-')&&name.endsWith('.js'));assert.ok(transport,'transport bundle missing');const origin=fs.readFileSync(originDir+'/'+transport,'utf8');let phrases=[];walk.simple(acorn.parse(origin,{ecmaVersion:'latest',sourceType:'module'}),{TemplateLiteral(n){if(n.expressions.length)return;const text=n.quasis[0].value.cooked;if(/^(Ask anything|Plan a task|Delegate a task)/.test(text)&&text.includes('Use / for commands'))phrases.push(text)}});assert.ok(phrases.length>=6);for(const text of phrases)assert.match(dom.window.__copilotZhText(text),/[\u3400-\u9fff]/)});
test('every bundled emoji has a Chinese description while shortcodes, search tags and category IDs remain unchanged',()=>{
 const originDir=process.env.COPILOT_SOURCE_ASSETS||__dirname+'/../research/local-ui-assets/assets';
 const file=fs.readdirSync(originDir).find(name=>name.startsWith('gemoji-')&&name.endsWith('.js'));
 function rows(source){const found=[];const text=node=>node?.type==='TemplateLiteral'&&node.expressions.length===0?node.quasis[0].value.cooked:node?.type==='Literal'?node.value:undefined;
  walk.simple(acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'}),{ObjectExpression(node){const props=Object.fromEntries(node.properties.filter(p=>p.type==='Property').map(p=>[p.key.name??p.key.value,p.value]));if(!props.emoji||!props.description)return;found.push({emoji:text(props.emoji),description:text(props.description),names:props.names.elements.map(text),tags:props.tags.elements.map(text),category:text(props.category)})}});return found;}
 const before=rows(fs.readFileSync(originDir+'/'+file,'utf8')),after=rows(fs.readFileSync(dir+'/'+file,'utf8'));
 assert.ok(before.length>=1000,'bundled emoji inventory is missing');assert.equal(after.length,before.length);
 for(let i=0;i<before.length;i++){assert.match(after[i].description,/[\u3400-\u9fff]/,before[i].description);for(const key of ['emoji','names','tags','category'])assert.deepEqual(after[i][key],before[i][key],before[i].description+': '+key);}
});
test.after(()=>dom.window.close());
test('actual mode dropdown contains Chinese names and descriptions with unchanged enum keys',()=>{
 const file=fs.readdirSync(dir).find(name=>name.startsWith('useWebSocketTransport-')&&name.endsWith('.js'));
 const source=fs.readFileSync(dir+'/'+file,'utf8');const maps=[];
 walk.simple(acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'}),{ObjectExpression(node){
  if(node.properties.length!==3)return;
  const record=Object.fromEntries(node.properties.filter(p=>p.type==='Property').map(p=>[p.key.name??p.key.value,p.value.type==='TemplateLiteral'&&!p.value.expressions.length?p.value.quasis[0].value.cooked:p.value.type==='Literal'?p.value.value:null]));
  if(['interactive','plan','autopilot'].every(key=>typeof record[key]==='string'))maps.push(record);
 }});
 for(const label of ['交互式','规划','自动执行','逐步协作','先规划，就绪后执行','端到端执行不中断'])assert.ok(maps.some(map=>Object.values(map).includes(label)),label);
 assert.match(source,/badge:[`"]实验性[`"]/);
});
test('actual system event renderer localizes compaction counts but keeps supplied error details',()=>{
 const file=fs.readdirSync(dir).find(name=>name.startsWith('Conversation-')&&name.endsWith('.js'));
 const source=fs.readFileSync(dir+'/'+file,'utf8');let renderer;
 walk.simple(acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'}),{FunctionDeclaration(node){
  const body=source.slice(node.start,node.end);
  if(body.includes('messagesRemoved')&&(/Compacted conversation|已压缩对话/.test(body)))renderer=body;
 }});
 assert.ok(renderer,'production compaction renderer missing');
 const render=vm.runInNewContext('('+renderer+')',{globalThis:dom.window,zie:String,rce:value=>String(value)});
 assert.equal(render({messagesRemoved:1,tokensRemoved:120}),'已压缩对话，已移除 1 条消息, 约 120 个词元');
 assert.equal(render({messagesRemoved:2}),'已压缩对话，已移除 2 条消息');
 assert.equal(render({status:'failed',error:'Keep this server error'}),'压缩对话失败。Keep this server error');
 const reasoningFile=fs.readdirSync(dir).find(name=>name.startsWith('ReasoningProgress-')&&name.endsWith('.js'));
 const reasoning=fs.readFileSync(dir+'/'+reasoningFile,'utf8');
 assert.match(reasoning,/思考了 \$\{[^}]+\} 秒/);
 assert.doesNotMatch(reasoning,/Thought for \$\{/);
});
test('actual spreadsheet canvas overlays the official Chinese UI locale without changing workbook locale',()=>{
 const file=fs.readdirSync(dir).find(name=>name.startsWith('UniverWorkbookCanvas-'));
 const source=fs.readFileSync(dir+'/'+file,'utf8');
 assert.equal((source.match(/globalThis\.__copilotZhUniverLocale/g)||[]).length,1);
 assert.ok(source.includes('locale:Bc.EN_US,locales:{[Bc.EN_US]:'));
 const bootstrapPath=[dir+'/first-paint-theme.js',dir+'/../first-paint-theme.js'].find(file=>fs.existsSync(file));
 assert.ok(bootstrapPath,'generated or re-extracted bootstrap is missing');
 const bootstrap=fs.readFileSync(bootstrapPath,'utf8');
 assert.ok(bootstrap.includes('globalThis.__copilotZhUniverLocale'));
 assert.ok(bootstrap.includes('"undo":"撤销"'));
 assert.ok(bootstrap.includes('"update":"更新"'));
 assert.ok(bootstrap.includes('"delete":"删除"'));
});

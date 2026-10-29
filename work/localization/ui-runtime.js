/* Offline, UI-only Chinese fallback. No network, storage, cookies, user text collection or telemetry. */
(()=>{const D=__ZH_DICTIONARY__;document.documentElement.lang='zh-CN';
const editableArea='textarea,[contenteditable]:not([contenteditable="false"])';
const protectedArea='pre,code,'+editableArea+',.monaco-editor,.xterm,.markdown-body,.prose,[data-markdown-root],[data-task-content],[data-user-message-content],[data-user-message-bubble],[data-published-chat-update-message],[data-testid="conversation-content-renderer"],[data-message-author-role],[data-testid*="message-content"],[data-testid*="session-title"],[data-testid*="repository-name"]';
const control='button,[role="button"],[role="menuitem"],[role="tab"],[role="tooltip"],[role="alert"],label,h1,h2,h3,h4';
const translatedAttributes=['placeholder','data-placeholder','title','aria-label','aria-description','alt'];
const protectedTags=new Set(['pre','code','textarea','script','style']);
const protectedProps=['data-markdown-root','data-task-content','data-user-message-content','data-user-message-bubble','data-published-chat-update-message','data-message-author-role'];
let queued=false;
function shortcut(s){return s.replace(/Command/g,'⌘').replace(/Shift/g,'⇧').replace(/Control/g,'⌃').replace(/Alt|Option/g,'⌥').replace(/Comma/g,',').replace(/Left bracket/g,'[').replace(/Right bracket/g,']').replace(/Enter/g,'回车').replace(/Escape/g,'Esc').replace(/Space/g,'空格');}
const __zhEscape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const __zhPatterns=[];
for(const [key,target]of Object.entries(D)){
 const tokens=[...key.matchAll(/\$\{(\d+)\}/g)];if(!tokens.length||key.length<9||!/[\u3400-\u9fff]/.test(target))continue;
 let pattern='^',pos=0;for(const token of tokens){pattern+=__zhEscape(key.slice(pos,token.index))+'([\\s\\S]*?)';pos=token.index+token[0].length}pattern+=__zhEscape(key.slice(pos))+'$';
 try{__zhPatterns.push({prefix:key.slice(0,tokens[0].index),re:new RegExp(pattern),target,ids:tokens.map(t=>t[1])})}catch(_){}
}
function tr(s){
 if(typeof s!=='string')return s;
 if(Object.hasOwn(D,s))return D[s];const t=s.trim();if(Object.hasOwn(D,t))return s.replace(t,()=>D[t]);
 let m;if(m=/^(?:PR|拉取请求) #(\d+) · (open|closed|merged|draft)$/.exec(t))return '拉取请求 #'+m[1]+' · '+({open:'开放',closed:'已关闭',merged:'已合并',draft:'草稿'}[m[2]]);
 if(m=/^Search (\d+) skills?(…|\.\.\.)?$/.exec(t))return '搜索 '+m[1]+' 个技能'+(m[2]?'…':'');for(const p of __zhPatterns){if(p.prefix&&!t.startsWith(p.prefix))continue;const found=p.re.exec(t);if(found){const groups={};p.ids.forEach((id,i)=>{groups[id]=found[i+1]});return p.target.replace(/\$\{(\d+)\}/g,(_,id)=>groups[id]??'');}}
 if(m=/^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(t))return String((Number(m[1])%12)+(m[3]==='PM'?12:0)).padStart(2,'0')+':'+m[2];
 if(m=/^Up to date\. Last checked on (.+)$/.exec(t)){const date=new Date(m[1].replace(', at ',' '));return '已是最新版本。上次检查：'+(isNaN(date)?m[1]:new Intl.DateTimeFormat('zh-CN',{dateStyle:'long',timeStyle:'short'}).format(date));}
 if(m=/^(.*)\. Creates a sample (folder|project)\.$/.exec(t))return tr(m[1])+('。创建示例'+(m[2]==='folder'?'文件夹':'项目')+'。');
 if(m=/^Search (.+)$/.exec(t)){const translated=tr(m[1]);if(translated!==m[1])return '搜索'+translated;}
 if(m=/^(Filter by type|Enable|Repository|Mode): (.+)$/.exec(t)){const prefix={'Filter by type':'按类型筛选',Enable:'启用',Repository:'仓库',Mode:'模式'};return prefix[m[1]]+'：'+tr(m[2]);}
 if(m=/^([^,]+), (.+)$/.exec(t)){if(!Object.hasOwn(D,m[1])&&!/Command|Shift|Control|Alt|Option|Enter|Escape/.test(m[2]))return s;const first=Object.hasOwn(D,m[1])?D[m[1]]:m[1];const rest=m[2].replace('model and reasoning','模型与推理');return first+'，'+shortcut(rest);}
 return s;
}
// Pure UI-node localization: never mutates experiment data, IDs, values, or event handlers.
globalThis.__copilotZhText=tr;
const __zhNodeCache=new WeakMap();
globalThis.__copilotZhNode=function localizeNode(node){
 if(typeof node==='string')return tr(node);
 if(Array.isArray(node)){const changed=node.map(localizeNode);return changed.some((v,i)=>v!==node[i])?changed:node;}
 if(!node||typeof node!=='object'||!node.$$typeof||!node.props)return node;
 if(__zhNodeCache.has(node))return __zhNodeCache.get(node);
 const props=node.props;
 if(protectedTags.has(node.type)||props.contentEditable===true||['true','','plaintext-only'].includes(props.contentEditable)||protectedProps.some(key=>Object.hasOwn(props,key))||/monaco-editor|xterm|markdown-body|\bprose\b/.test(props.className??'')||/message-content|session-title|repository-name|conversation-content-renderer/.test(props['data-testid']??''))return node;
 const children=localizeNode(props.children);let changed=children!==props.children;
 const localizedProps={...props,children};
 for(const key of translatedAttributes){if(typeof props[key]!=='string')continue;const value=tr(props[key]);if(value!==props[key]){localizedProps[key]=value;changed=true;}}
 const result=changed?{...node,props:localizedProps}:node;
 __zhNodeCache.set(node,result);return result;
};
function apply(){queued=false;if(!document.body)return;let w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),n;while(n=w.nextNode()){let p=n.parentElement;if(!p||p.closest(protectedArea)||!p.closest(control))continue;let v=tr(n.nodeValue);if(v!==n.nodeValue)n.nodeValue=v}
for(const el of document.querySelectorAll(translatedAttributes.map(a=>'['+a+']').join(','))){const editable=el.matches(editableArea);if(el.closest(protectedArea)&&!(editable&&!el.parentElement?.closest(protectedArea)))continue;for(const a of translatedAttributes){const s=el.getAttribute(a);if(!s)continue;const v=tr(s);if(v!==s)el.setAttribute(a,v)}}}
function schedule(){if(queued)return;queued=true;setTimeout(apply,60)}
const start=()=>{apply();new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:translatedAttributes})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

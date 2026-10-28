const __zhEscape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const __zhPatterns=[];
for(const [key,target]of Object.entries(D)){
 const tokens=[...key.matchAll(/\$\{(\d+)\}/g)];if(!tokens.length||key.length<9||!/[\u3400-\u9fff]/.test(target))continue;
 let pattern='^',pos=0;for(const token of tokens){pattern+=__zhEscape(key.slice(pos,token.index))+'([\\s\\S]*?)';pos=token.index+token[0].length}pattern+=__zhEscape(key.slice(pos))+'$';
 try{__zhPatterns.push({prefix:key.slice(0,tokens[0].index),re:new RegExp(pattern),target,ids:tokens.map(t=>t[1])})}catch(_){}
}

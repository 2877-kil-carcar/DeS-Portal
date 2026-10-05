(function(root){
  'use strict';
  const sections=[{id:'toride',label:'砦 / 要請'},{id:'svs',label:'SvS'},{id:'shimryu',label:'霜竜の覇者'},{id:'imin',label:'移民',subs:[{id:'imin_futsuu',label:'普通移民'},{id:'imin_tokubetsu',label:'特別移民'}]}];
  const fields=sections.flatMap(s=>(s.subs||[s]).flatMap(x=>[x.id+'_form',x.id+'_sheet']));
  function safeUrl(value){
    const text=String(value??'').trim();
    if(!text)return '';
    const url=new URL(text);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('https:// または http:// の安全なURLを入力してください。');
    return url.href;
  }
  function linkPatch(field,value){
    if(!fields.includes(field))throw new Error('不明な設定項目です。');
    return {[field]:safeUrl(value)};
  }
  function readLinks(data){
    const result={};
    for(const field of fields)if(typeof data?.[field]==='string')result[field]=data[field];
    return result;
  }
  const api={sections,fields,safeUrl,linkPatch,readLinks,memoKey:id=>'2856_'+id+'_memo'};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.FormUtils=api;
})(globalThis);

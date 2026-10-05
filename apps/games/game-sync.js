// Persist a turn only if its source snapshot is still current. No game rules here.
(function(root){
  'use strict';
  function normalized(value){
    if(value==null)return null;
    if(typeof value!=='object')return value;
    const entries=Object.entries(value).map(([k,v])=>[k,normalized(v)]).filter(([,v])=>v!==null).sort(([a],[b])=>a.localeCompare(b));
    return entries.length?Object.fromEntries(entries):null;
  }
  const signature=value=>JSON.stringify(normalized(value));
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[char]);
  async function commit(transaction,reference,expected,patch){
    const expectedSignature=signature(expected);
    return transaction(reference,current=>{
      if(!current||signature(current)!==expectedSignature)return;
      const next=JSON.parse(JSON.stringify(current));
      for(const [path,value] of Object.entries(patch)){
        const keys=path.split('/');
        if(keys.some(k=>!k||['__proto__','prototype','constructor'].includes(k)))throw Error('Invalid state path');
        let node=next;for(const key of keys.slice(0,-1))node=node[key]??={};
        node[keys.at(-1)]=value;
      }
      return next;
    },{applyLocally:false});
  }
  async function createRoom(transaction,referenceForCode,generateCode,data){
    for(let attempt=0;attempt<8;attempt++){
      const code=generateCode();
      const result=await transaction(referenceForCode(code),current=>current==null?{...data,code}:undefined,{applyLocally:false});
      if(result.committed)return code;
    }
    throw Error('空いているルームコードを取得できませんでした。再試行してください。');
  }
  async function joinRoom(transaction,reference,pid,name,capacity){
    let reason='ルームを更新できませんでした。再試行してください。';
    const result=await transaction(reference,room=>{
      if(!room){reason='ルームが見つかりません';return;}
      if(room.status==='playing'){reason='そのルームはゲーム中です';return;}
      const players=room.players||{};
      if(!players[pid]&&Object.keys(players).length>=capacity){reason='ルームが満員です';return;}
      const index=players[pid]?.index??(Math.max(-1,...Object.values(players).map(p=>Number(p.index)||0))+1);
      return {...room,players:{...players,[pid]:{...players[pid],name,index,ready:true}}};
    },{applyLocally:false});
    if(!result.committed)throw Error(reason);
    return result.snapshot.val();
  }
  root.GameSync={commit,signature,escapeHtml,createRoom,joinRoom};
})(globalThis);

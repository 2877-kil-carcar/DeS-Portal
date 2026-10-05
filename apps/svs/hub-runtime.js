(() => {
  'use strict';
  window.svsConnectionReady = false;
  window.setSyncStatus = (message,state='loading') => {
    const node=document.getElementById('syncStatus');node.textContent=message;node.dataset.state=state;
    document.getElementById('retrySync').hidden=state!=='error';
  };
  // Preserve the original role policy; this is a UI guard, NOT server authorization.
  const writes=['attemptRegister','attemptAdminLogin','addHero','deleteHero','addGroup','renameGroup','deleteGroup','addAlliance','renameAlliance','deleteAlliance','addPlayer','togglePlayer','updatePlayerTime','updatePlayerGroup','updatePlayerPriority','updatePlayerFC','updatePlayerT11','deletePlayer','updatePlayerName','bulkChangeAlliance','savePlayerHeroes','addRally','updateRally','toggleRally','deleteRally','toggleUserAdmin','updateUserPassword','deleteUser','deleteAllLogs'];
  const pending=new Set();
  for(const name of writes){
    const original=window[name];if(typeof original!=='function')continue;
    window[name]=async function(...args){
      if(window.SVS_PREVIEW){alert('プレビューでは登録・更新・ログイン・通知送信は行いません。');return;}
      if(!window.svsConnectionReady){alert('データの接続完了後に操作してください。');return;}
      if(pending.has(name))return;
      pending.add(name);
      try{return await original.apply(this,args);}
      catch(error){console.error(name,error);alert('保存・操作に失敗しました。接続と権限を確認してください。');}
      finally{pending.delete(name);}
    };
  }
  // Wide tables remain complete, but do not force the entire phone viewport to scroll.
  const wrapTables=()=>document.querySelectorAll('.tab table').forEach(table=>{
    if(table.parentElement.classList.contains('table-wrap'))return;
    const wrap=document.createElement('div');wrap.className='table-wrap';wrap.tabIndex=0;
    wrap.setAttribute('aria-label','表：左右にスクロールできます');table.before(wrap);wrap.append(table);
  });
  const observer=new MutationObserver(wrapTables);
  document.querySelectorAll('.tab').forEach(tab=>observer.observe(tab,{childList:true,subtree:true}));wrapTables();
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hideLoginPopup();});
  window.addEventListener('pagehide',()=>{window.clearFirestoreListeners?.();window.usersUnsubscribe?.();window.logsUnsubscribe?.();});
})();

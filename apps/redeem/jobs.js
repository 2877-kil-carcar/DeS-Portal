(() => {
  'use strict';
  const base='https://des-giftcode-proxy.shunya3624716.workers.dev/api/gift-code/';
  async function request(path,body) {
    const token=await globalThis.WOS_REDEEM_CLOUD.getIdToken();
    const response=await fetch(base+path,{method:body?'POST':'GET',cache:'no-store',signal:AbortSignal.timeout(20000),
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'交換サーバーに接続できません。');
    return result;
  }
  async function available() {
    const response=await fetch(base+'capabilities',{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('交換サーバーの状態を確認できません。再接続してください。');
    const value=await response.json();
    if(value.batch===true)return true;
    if(value.batch===false||value.service==='des-giftcode-proxy')return false;
    throw Error('交換サーバーの状態を確認できません。');
  }
  globalThis.WOS_REDEEM_JOBS={available,
    start:(code,retry=false,acknowledgeUnknown=false)=>request('manual',{code,retry,acknowledgeUnknown}),
    list:()=>request('jobs'), get:code=>request('jobs?code='+encodeURIComponent(code)),
    cancel:code=>request('cancel',{code})};
})();

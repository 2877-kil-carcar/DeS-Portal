(() => {
  'use strict';
  const ENDPOINT='https://des-giftcode-proxy.shunya3624716.workers.dev/',SALT='tB87#kPtkxqOS2',CHECK_CDK='ZZCHECKONLY0';
  const {md5,signed,interpret}=globalThis.WOS_REDEEM_PROTOCOL;
  async function call(fid,kid,cdk){
    if(!/^\d+$/.test(String(fid))||!/^\d+$/.test(String(kid))||!cdk||String(cdk).length>256)throw Error('ID・王国・交換コードを確認してください。');
    const body=new FormData();Object.entries(signed({fid:String(fid),kid:String(kid),cdk:String(cdk),time:Math.floor(Date.now()/1000)})).forEach(([key,value])=>body.append(key,value));
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    try{const response=await fetch(ENDPOINT,{method:'POST',body,signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error(`公式交換APIが応答できません（HTTP ${response.status}）。`);return interpret(await response.json());}catch(error){if(error.name==='AbortError')throw Error('公式交換APIへの通信がタイムアウトしました。結果をゲーム内で確認してください。');throw error;}finally{clearTimeout(timer);}
  }
  async function checkPlayer(fid,kid){const result=await call(fid,kid,CHECK_CDK);return result.err_code===40014?{ok:true}:{ok:false,msg:result.msg};}
  window.WOS_REDEEM_API={redeem:call,checkPlayer,_md5:md5,_signed:signed};
})();

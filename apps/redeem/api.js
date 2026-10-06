(() => {
  'use strict';
  const ENDPOINT='https://des-giftcode-proxy.shunya3624716.workers.dev/',SALT='tB87#kPtkxqOS2',CHECK_CDK='ZZCHECKONLY0';
  const messages={20000:'交換成功',40004:'サーバービジー。しばらく待って再試行',40005:'交換回数上限に達しています',40006:'大溶鉱炉レベル不足',40007:'交換期限切れ',40008:'受取済み',40011:'同タイプのコードは一度しか使えません',40012:'アカウント登録期間が条件外',40014:'交換コードが存在しません（大文字小文字を確認）',40015:'交換コードが正しくありません',40016:'サーバー混雑中。報酬は後ほど送付',40017:'交換条件を満たしていません',40018:'領主バトラー利用中アカウント専用コード',40019:'操作頻度制限オーバー',40020:'IDまたは王国が正しくありません'};
  const doneCodes=new Set([20000,40008,40011,40016]),retryCodes=new Set([40004,40019]),badCodeCodes=new Set([40007,40014,40015]);
  const shifts=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const constants=Array.from({length:64},(_,index)=>(Math.floor(Math.abs(Math.sin(index+1))*0x100000000)|0));
  const add=(a,b)=>(a+b)|0,rotate=(value,bits)=>(value<<bits)|(value>>>(32-bits));
  function md5(text){
    const bytes=new TextEncoder().encode(text),bitLength=bytes.length*8,wordCount=(((bytes.length+8)>>>6)+1)*16,words=new Int32Array(wordCount);
    bytes.forEach((byte,index)=>{words[index>>>2]|=byte<<((index&3)*8);});words[bytes.length>>>2]|=0x80<<((bytes.length&3)*8);words[wordCount-2]=bitLength>>>0;words[wordCount-1]=Math.floor(bitLength/0x100000000);
    let h0=0x67452301|0,h1=0xefcdab89|0,h2=0x98badcfe|0,h3=0x10325476|0;
    for(let offset=0;offset<wordCount;offset+=16){let a=h0,b=h1,c=h2,d=h3;for(let index=0;index<64;index++){let f,g;if(index<16){f=(b&c)|(~b&d);g=index;}else if(index<32){f=(d&b)|(~d&c);g=(5*index+1)%16;}else if(index<48){f=b^c^d;g=(3*index+5)%16;}else{f=c^(b|~d);g=(7*index)%16;}const next=d;d=c;c=b;b=add(b,rotate(add(add(a,f),add(constants[index],words[offset+g])),shifts[index]));a=next;}h0=add(h0,a);h1=add(h1,b);h2=add(h2,c);h3=add(h3,d);}
    return [h0,h1,h2,h3].map(word=>[0,8,16,24].map(shift=>((word>>>shift)&255).toString(16).padStart(2,'0')).join('')).join('');
  }
  function signed(params){const query=Object.keys(params).sort().map(key=>`${key}=${encodeURIComponent(params[key])}`).join('&');return {sign:md5(query+SALT),...params};}
  async function call(fid,kid,cdk){
    if(!/^\d+$/.test(String(fid))||!/^\d+$/.test(String(kid))||!cdk||String(cdk).length>256)throw Error('ID・王国・交換コードを確認してください。');
    const body=new FormData();Object.entries(signed({fid:String(fid),kid:String(kid),cdk:String(cdk),time:Math.floor(Date.now()/1000)})).forEach(([key,value])=>body.append(key,value));
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    try{const response=await fetch(ENDPOINT,{method:'POST',body,signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error(`公式交換APIが応答できません（HTTP ${response.status}）。`);const value=await response.json(),code=Number(value.err_code);let message=messages[code]||value.msg||'不明なエラー';if(code===40006&&value.data?.tips)message+=`（Lv.${value.data.tips} 以上）`;return {err_code:code,msg:message,done:doneCodes.has(code),retry:retryCodes.has(code),bad_cdk:badCodeCodes.has(code)};}catch(error){if(error.name==='AbortError')throw Error('公式交換APIへの通信がタイムアウトしました。結果をゲーム内で確認してください。');throw error;}finally{clearTimeout(timer);}
  }
  async function checkPlayer(fid,kid){const result=await call(fid,kid,CHECK_CDK);return result.err_code===40014?{ok:true}:{ok:false,msg:result.msg};}
  window.WOS_REDEEM_API={redeem:call,checkPlayer,_md5:md5,_signed:signed};
})();

// No real Discord, Firebase or gift-code requests. Use real SQLite and WebCrypto.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {RedeemQueue,normalizeCode} from '../cloudflare-worker/batch-queue.mjs';
import worker from '../cloudflare-worker/automation-worker.mjs';
import {extractCodes,trustedMessage,notificationText} from '../cloudflare-worker/discord.mjs';
import {verifyFirebaseToken,secretMatches,loadTargets,writeHistory} from '../cloudflare-worker/services.mjs';

function fixture(overrides={}) {
  const db=new DatabaseSync(':memory:');let alarm=null;
  const ctx={storage:{sql:{exec(query,...args){return db.prepare(query).all(...args);}},
    getAlarm:async()=>alarm,setAlarm:async value=>{alarm=value;},deleteAlarm:async()=>{alarm=null;}}};
  const exchanges=[],history=[],notifications=[];
  const players=[{fid:'123',kid:'2856',name:'A',status:'pending',attempts:0},{fid:'456',kid:'2856',name:'B',status:'pending',attempts:0}];
  const queue=new RedeemQueue(ctx,{}, {
    loadTargets:async()=>structuredClone(players),
    redeemPlayer:async(_env,code,p)=>{exchanges.push([code,p.fid]);return {done:true,msg:'交換成功',retry:false};},
    writeHistory:async(_env,code,p,result)=>history.push([code,p.fid,result]),
    notifyDiscord:async(_env,job)=>notifications.push(notificationText(job)),...overrides
  });
  async function tick(){const row=queue.rows("SELECT code FROM gift_codes WHERE status IN ('pending','processing') LIMIT 1")[0];if(row){const job=queue.get(row.code);job.next_at=0;queue.save(job);}await queue.alarm();}
  async function drain(){for(let i=0;i<20;i++){if(!queue.rows("SELECT code FROM gift_codes WHERE status IN ('pending','processing') LIMIT 1").length)return;await tick();}throw Error('queue did not finish');}
  return {queue,ctx,db,exchanges,history,notifications,players,tick,drain,alarm:()=>alarm};
}

assert.equal(normalizeCode(' AbC_123 '),'AbC_123');
assert.throws(()=>normalizeCode('https://bad.example'));
const post={id:'11',channel_id:'channel',author:{id:'official'},content:'🎮 New Whiteout Survival Gift Code!\n**Code:** `ABC123`'};
assert.deepEqual(extractCodes(post),['ABC123']);
assert.deepEqual(extractCodes({...post,content:'Code: ABC123'}),[]);
assert.deepEqual(extractCodes({...post,content:'New Whiteout Survival Gift Code!\nCode: https://bad.example'}),[]);
assert.deepEqual(extractCodes({...post,content:'',embeds:[{title:'New Whiteout Survival Gift Code!',fields:[{name:'Gift Code',value:'`ABC123`'}]}]}),['ABC123']);
assert.equal(trustedMessage(post,{DISCORD_CHANNEL_ID:'channel',DISCORD_AUTHOR_IDS:'official'}),true);
assert.equal(trustedMessage({...post,author:{id:'imposter'}},{DISCORD_CHANNEL_ID:'channel',DISCORD_AUTHOR_IDS:'official'}),false);
assert.equal(trustedMessage({...post,webhook_id:'foreign'},{DISCORD_CHANNEL_ID:'channel',DISCORD_AUTHOR_IDS:'official'}),false);
assert.equal(globalThis.WOS_REDEEM_PROTOCOL.interpret({err_code:40007}).code_state,'expired');
assert.equal(globalThis.WOS_REDEEM_PROTOCOL.interpret({err_code:40014}).code_state,'invalid');
assert.equal(globalThis.WOS_REDEEM_PROTOCOL.interpret({err_code:40008}).done,true);
assert.equal(globalThis.WOS_REDEEM_PROTOCOL.interpret({err_code:40004}).failure_kind,'busy');
assert.equal(globalThis.WOS_REDEEM_PROTOCOL.interpret({err_code:40017}).failure_kind,'condition');

{
  const f=fixture();
  const receipts=await Promise.all(Array.from({length:20},(_,i)=>f.queue.submit('ABC123',{type:i%2?'discord':'manual'})));
  assert.equal(receipts.filter(r=>!r.duplicate).length,1);
  assert.equal(f.queue.rows('SELECT code FROM gift_codes').length,1);
  await f.drain();assert.equal(f.exchanges.length,2);assert.equal(f.history.length,2);
  assert.equal(f.queue.get('ABC123').status,'completed');
  await f.queue.submit('ABC123',{type:'discord'});await f.drain();assert.equal(f.exchanges.length,2);
  await f.queue.submit('OTHER123',{type:'manual'});await f.drain();assert.equal(f.exchanges.length,4);
}
{
  const f=fixture();
  await f.queue.submit('LATEUSER123',{type:'discord'});await f.drain();
  assert.equal(f.exchanges.length,2);assert.deepEqual(f.queue.get('LATEUSER123').summary,{total:2,success:2,failed:0,unknown:0,expired:0,invalid:0,unprocessed:0});
  f.players.push({fid:'789',kid:'2856',name:'C',status:'pending',attempts:0});
  const receipt=await f.queue.submit('LATEUSER123',{type:'manual'});
  assert.equal(receipt.duplicate,true);assert.equal(receipt.added,1);assert.equal(receipt.job.status,'pending');
  await f.drain();assert.deepEqual(f.exchanges,[['LATEUSER123','123'],['LATEUSER123','456'],['LATEUSER123','789']]);
  assert.deepEqual(f.queue.get('LATEUSER123').summary,{total:3,success:3,failed:0,unknown:0,expired:0,invalid:0,unprocessed:0});
  const unchanged=await f.queue.submit('LATEUSER123',{type:'manual'});assert.equal(unchanged.added,0);await f.drain();assert.equal(f.exchanges.length,3);
}
{
  const f=fixture();f.players[0].status='skipped';await f.queue.submit('CODE123',{type:'manual'});await f.drain();
  assert.deepEqual(f.exchanges,[['CODE123','456']]);
  f.players.push({fid:'789',kid:'2856',name:'C',status:'pending',attempts:0});
  await assert.rejects(f.queue.submit('CODE123',{type:'manual'},true),/再実行できません/);assert.deepEqual(f.exchanges,[['CODE123','456']]);
}
{
  let count=0;
  const f=fixture({redeemPlayer:async()=>{count++;return {done:false,retry:true,msg:'頻度制限'};}});
  await f.queue.submit('RATE123',{type:'discord'});await f.drain();assert.equal(count,6);assert.equal(f.queue.get('RATE123').status,'failed');
  const summary=f.queue.get('RATE123').summary;assert.deepEqual(summary,{total:2,success:0,failed:2,unknown:0,expired:0,invalid:0,unprocessed:0});
  await f.tick();assert.equal(f.notifications.length,1);assert.equal(f.notifications[0],'⚠️ RATE123：2人中0人成功、2人失敗\nサーバービジー：2人');
  await f.queue.submit('RATE123',{type:'manual'},true);await f.drain();await f.tick();assert.equal(f.notifications.length,1);
}
{
  let fail=true;
  const f=fixture({redeemPlayer:async(_env,code,p)=>{f.exchanges.push([code,p.fid]);return p.fid==='456'&&fail?{done:false,retry:false,msg:'条件未達：レベル不足'}:{done:true,retry:false,msg:'交換成功'};}});
  await f.queue.submit('PARTIAL123',{type:'manual'});await f.drain();
  let job=f.queue.get('PARTIAL123');assert.deepEqual(job.summary,{total:2,success:1,failed:1,unknown:0,expired:0,invalid:0,unprocessed:0});
  assert.equal((await (await f.queue.fetch(new Request('https://test/jobs'))).json()).unresolved,1);
  assert.equal(job.targets.find(p=>p.fid==='456').name,'B');await f.tick();
  assert.equal(f.notifications.length,0);assert.equal(f.queue.get('PARTIAL123').notification,null);
  fail=false;await f.queue.submit('PARTIAL123',{type:'manual'},true);
  assert.equal((await (await f.queue.fetch(new Request('https://test/jobs'))).json()).unresolved,1);
  await f.drain();job=f.queue.get('PARTIAL123');
  assert.deepEqual(job.summary,{total:2,success:2,failed:0,unknown:0,expired:0,invalid:0,unprocessed:0});
  assert.deepEqual(f.exchanges,[['PARTIAL123','123'],['PARTIAL123','456'],['PARTIAL123','456']]);
}
{
  let count=0;
  const f=fixture({redeemPlayer:async()=>{count++;return {done:false,bad_cdk:true,code_state:'expired',msg:'交換期限切れ'};}});
  await f.queue.submit('BAD123',{type:'discord'});await f.drain();assert.equal(count,1);
  const job=f.queue.get('BAD123');assert.equal(job.status,'expired');
  assert.deepEqual(job.summary,{total:2,success:0,failed:0,unknown:0,expired:1,invalid:0,unprocessed:1});
  assert.equal((await (await f.queue.fetch(new Request('https://test/jobs'))).json()).unresolved,0);
  await f.tick();assert.equal(f.notifications[0],'🎁 BAD123：交換受付終了\n成功0人／期限切れ確認1人／未実行1人');
  await assert.rejects(f.queue.submit('BAD123',{type:'manual'},true),/期限切れ/);
}
{
  const f=fixture({redeemPlayer:async()=>({done:false,bad_cdk:true,code_state:'invalid',msg:'交換コードが存在しません'})});
  await f.queue.submit('INVALID123',{type:'manual'});await f.drain();
  const job=f.queue.get('INVALID123');assert.equal(job.status,'invalid');
  assert.deepEqual(job.summary,{total:2,success:0,failed:0,unknown:0,expired:0,invalid:1,unprocessed:1});
  await f.tick();assert.equal(f.notifications.length,0);assert.equal(job.notification,null);
}
{
  const f=fixture();await f.queue.submit('LEGACYEXPIRED',{type:'manual'});await f.drain();
  const legacy=f.queue.get('LEGACYEXPIRED');legacy.status='failed';legacy.source={type:'discord'};
  legacy.targets=legacy.targets.map((player,index)=>({...player,status:'failed',attempts:index?0:1,msg:'交換期限切れ'}));
  legacy.notification={status:'pending',attempts:0,next_at:Date.now(),sent_at:null,last_error:''};f.queue.save(legacy);
  f.queue.sql.exec("DELETE FROM metadata WHERE key='migration.closed-codes-v2'");
  const migrated=new RedeemQueue(f.ctx,{},f.queue.services),job=migrated.get('LEGACYEXPIRED');
  assert.equal(job.status,'expired');assert.equal(job.summary.failed,0);assert.equal(job.summary.expired,1);assert.equal(job.summary.unprocessed,1);
  assert.equal(job.notification.status,'suppressed');
  assert.equal((await (await migrated.fetch(new Request('https://test/jobs'))).json()).unresolved,0);
}
{
  const f=fixture({redeemPlayer:async()=>{throw Error('timeout');}});
  await f.queue.submit('ERR123',{type:'manual'});await f.drain();
  const job=f.queue.get('ERR123');assert.equal(job.status,'failed');assert.ok(job.targets.every(p=>p.status==='unknown'));
  await assert.rejects(f.queue.submit('ERR123',{type:'manual'},true,false));
  await f.queue.submit('ERR123',{type:'discord'});assert.equal(f.queue.get('ERR123').status,'failed');
}
{
  let writes=0;
  const f=fixture({writeHistory:async()=>{if(++writes<3)throw Error('storage down');}});
  await f.queue.submit('SAVE123',{type:'manual'});await f.drain();assert.equal(f.exchanges.length,2);assert.equal(writes,4);assert.equal(f.queue.get('SAVE123').status,'completed');
}
{
  const f=fixture({loadTargets:async()=>{throw Error('offline');}});
  await f.queue.submit('INIT123',{type:'discord'});await f.drain();assert.equal(f.queue.get('INIT123').status,'failed');assert.equal(f.queue.get('INIT123').errors,5);
}
{
  const f=fixture();await f.queue.submit('CRASH123',{type:'manual'});
  const job=f.queue.get('CRASH123');job.initialized=true;job.status='processing';job.targets=[{...f.players[0],status:'sending',attempts:1}];f.queue.save(job);
  // Simulate object eviction/restart with the same SQLite and a fresh instance.
  const next=new RedeemQueue(f.ctx,{}, {redeemPlayer:async()=>{throw Error('must not retry uncertain send');}});
  await next.alarm();assert.equal(next.get('CRASH123').targets[0].status,'unknown');assert.equal(next.get('CRASH123').status,'failed');
}
{
  let release,entered;
  const started=new Promise(resolve=>entered=resolve);
  const f=fixture({redeemPlayer:async()=>{entered();return new Promise(resolve=>release=()=>resolve({done:true,msg:'ok'}));}});
  await f.queue.submit('STOP123',{type:'manual'});
  const executing=f.tick();await started;
  await f.queue.fetch(new Request('https://test/cancel',{method:'POST',body:JSON.stringify({code:'STOP123'})}));
  release();await executing;await f.tick();
  assert.equal(f.history.length,1);assert.equal(f.queue.get('STOP123').status,'cancelled');
}
{
  const f=fixture();let phase=0;
  f.queue.env={DISCORD_ENABLED:'true',DISCORD_BOT_TOKEN:'test',DISCORD_CHANNEL_ID:'channel',DISCORD_GUILD_ID:'guild',DISCORD_AUTHOR_IDS:'official'};
  globalThis.fetch=async url=>Response.json(String(url).endsWith('/channels/channel')?{guild_id:'guild'}:phase===0?[{...post,id:'10'}]:String(url).includes('after=10')?[{...post,id:'12'},{...post,id:'11'}]:[]);
  await f.queue.pollDiscord();assert.equal(f.queue.rows('SELECT code FROM gift_codes').length,0);
  phase=1;await f.queue.pollDiscord();assert.equal(f.queue.rows('SELECT code FROM gift_codes').length,1);assert.equal(f.queue.meta('discord_cursor'),'12');
  await f.drain();assert.equal(f.exchanges.length,2);
}
{
  const f=fixture();
  const env={AUTOMATION_ENABLED:'true',FIREBASE_API_KEY:'configured',GIFT_CODE_API_SECRET:'test-secret',
    REDEEM_QUEUE:{idFromName:s=>s,get:()=>({fetch:req=>f.queue.fetch(req)})}};
  const send=token=>worker.fetch(new Request('https://worker/api/gift-code/redeem',{method:'POST',headers:{Authorization:'Bearer '+token},body:'{"code":"AUTH123"}'}),env);
  assert.equal((await send('wrong')).status,401);assert.equal(f.queue.rows('SELECT code FROM gift_codes').length,0);
  assert.equal((await send('test-secret')).status,202);assert.equal((await send('test-secret')).status,202);
  assert.equal(f.queue.rows('SELECT code FROM gift_codes').length,1);
  assert.equal(await secretMatches('abc','abc'),true);assert.equal(await secretMatches('abc','xyz'),false);
  const origin='https://2877-kil-carcar.github.io';
  const bad=await worker.fetch(new Request('https://worker/api/gift-code/manual',{method:'POST',headers:{Origin:origin,Authorization:'Bearer invalid'},body:'{"code":"ABC123"}'}),env);
  assert.equal(bad.status,401);
  const legacyBody=new FormData();legacyBody.append('cdk','AUTH123');
  assert.equal((await worker.fetch(new Request('https://worker/',{method:'POST',headers:{Origin:origin},body:legacyBody}),env)).status,409);
  const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',hash:'SHA-256',modulusLength:2048,publicExponent:new Uint8Array([1,0,1])},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='test-key';jwk.alg='RS256';
  globalThis.fetch=async()=>Response.json({keys:[jwk]});
  const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const now=Math.floor(Date.now()/1000);
  async function token(aud){const body=b64({alg:'RS256',kid:'test-key'})+'.'+b64({aud,iss:'https://securetoken.google.com/des-portal-gift-code',sub:'anonymous-test',iat:now,auth_time:now,exp:now+3600});return body+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(body))).toString('base64url');}
  const valid=await token('des-portal-gift-code');assert.equal(await verifyFirebaseToken(valid),true);assert.equal(await verifyFirebaseToken(await token('other-project')),false);
  const manual=await worker.fetch(new Request('https://worker/api/gift-code/manual',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+valid},body:'{"code":"AUTH123"}'}),env);
  assert.equal(manual.status,202);assert.equal((await manual.json()).duplicate,true);await f.drain();assert.equal(f.exchanges.length,2);
}
{
  const env={FIREBASE_API_KEY:'test-api-key'};
  const doc=value=>({fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,{stringValue:v}]))});
  let saved;
  globalThis.fetch=async(url,options)=>{
    if(String(url).includes('identitytoolkit.googleapis.com'))return Response.json({idToken:'mock-anonymous-token',expiresIn:'3600'});
    assert.equal(options.headers.Authorization,'Bearer mock-anonymous-token');
    if(options.method==='PATCH'){saved={url,body:JSON.parse(options.body)};return Response.json(saved.body);}
    if(String(url).endsWith(':runQuery')){assert.equal(JSON.parse(options.body).structuredQuery.where.fieldFilter.value.stringValue,'AbC123');return Response.json([{document:doc({fid:'123',cdk:'AbC123'})}]);}
    if(String(url).includes('pageToken=page2'))return Response.json({documents:[doc({fid:'456',name:'B',kid:'2'})]});
    return Response.json({documents:[doc({fid:'123',name:'A',kid:'1'})],nextPageToken:'page2'});
  };
  const targets=await loadTargets(env,'AbC123');assert.equal(targets.length,2);assert.equal(targets[0].status,'skipped');assert.equal(targets[1].status,'pending');
  await writeHistory(env,'AbC123',targets[1],{msg:'交換成功'});assert.ok(saved.url.endsWith('/redeemHistory/AbC123--456'));assert.equal(saved.body.fields.fid.stringValue,'456');assert.ok(saved.body.fields.updatedAt.timestampValue);
}
// Fail the test if any later test accidentally attempts an unmocked external call.
globalThis.fetch=async()=>{throw Error('Unexpected network request');};
console.log('PASS automation: real SQLite uniqueness, manual/Discord shared queue, skip history, retry limit, cancellation, crash recovery, persistence failures, extraction, watermark, secret and signed Firebase token authentication');

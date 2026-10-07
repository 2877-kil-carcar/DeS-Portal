import proxy from './worker.js';
import {secretMatches, verifyFirebaseToken} from './services.mjs';
export {RedeemQueue} from './batch-queue.mjs';

const ORIGINS = new Set(['https://2877-kil-carcar.github.io','http://127.0.0.1:8766','http://127.0.0.1:8791','http://localhost:8766','http://localhost:8791']);
const ready = env => env.AUTOMATION_ENABLED === 'true' && Boolean(env.REDEEM_QUEUE && env.FIREBASE_API_KEY);
function queue(env) { return env.REDEEM_QUEUE.get(env.REDEEM_QUEUE.idFromName('all-players-v1')); }
function reply(request, value, status = 200) {
  const origin=request.headers.get('Origin');
  return Response.json(value,{status,headers:{'Cache-Control':'no-store',
    ...(ORIGINS.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'}:{})}});
}
async function forward(env, path, method='GET', body) {
  return queue(env).fetch(new Request('https://queue.internal'+path,{method,...(body?{body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:{})}));
}
export default {
  async fetch(request, env) {
    const url=new URL(request.url), path=url.pathname;
    if(!path.startsWith('/api/gift-code/')) {
      if(ready(env) && request.method==='POST') {
        // Cached older pages must not bypass the shared queue during migration.
        let input;try{input=await request.clone().formData();}catch{return reply(request,{error:'Invalid request'},400);}
        if(input.get('cdk')!=='ZZCHECKONLY0')return reply(request,{error:'画面を更新して一括交換を実行してください。'},409);
      }
      return proxy.fetch(request);
    }
    if(request.method==='OPTIONS') return reply(request,{},200);
    if(path==='/api/gift-code/capabilities' && request.method==='GET') return reply(request,{batch:ready(env),discord:ready(env)&&env.DISCORD_ENABLED==='true'});
    if(!ready(env)) return reply(request,{error:'自動交換サーバーは設定中です。'},503);
    const internal=path==='/api/gift-code/redeem';
    const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1] || '';
    if(internal) {
      if(request.method!=='POST') return reply(request,{error:'Method not allowed'},405);
      if(!await secretMatches(token,env.GIFT_CODE_API_SECRET)) return reply(request,{error:'Unauthorized'},401);
    } else {
      if(!ORIGINS.has(request.headers.get('Origin'))) return reply(request,{error:'Forbidden'},403);
      if(!await verifyFirebaseToken(token)) return reply(request,{error:'ログイン状態を更新してください。'},401);
    }
    try {
      let response;
      if((path==='/api/gift-code/manual'||internal)&&request.method==='POST') {
        const raw=await request.text();
        if(raw.length>4096) return reply(request,{error:'Request too large'},413);
        const input=JSON.parse(raw);
        response=await forward(env,'/submit','POST',{code:input.code,source:{type:internal?'integration':'manual'},
          retry:!internal&&input.retry===true,acknowledgeUnknown:!internal&&input.acknowledgeUnknown===true});
      } else if(path==='/api/gift-code/jobs'&&request.method==='GET') {
        response=await forward(env,'/jobs'+(url.searchParams.has('code')?'?code='+encodeURIComponent(url.searchParams.get('code')):''));
      } else if(path==='/api/gift-code/cancel'&&request.method==='POST') {
        const raw=await request.text();
        if(raw.length>4096) return reply(request,{error:'Request too large'},413);
        response=await forward(env,'/cancel','POST',{code:JSON.parse(raw).code});
      } else return reply(request,{error:'Not found'},404);
      return reply(request,await response.json(),response.ok&&request.method==='POST'?202:response.status);
    } catch { return reply(request,{error:'処理を受け付けられませんでした。接続と入力を確認してください。'},503); }
  },
  async scheduled(_event,env,ctx) {
    if(!ready(env)) return;
    ctx.waitUntil(forward(env,'/tick','POST',{}).then(response=>{if(!response.ok)throw Error('Queue recovery failed');}));
  }
};

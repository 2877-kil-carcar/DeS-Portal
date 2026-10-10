const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
async function scenario(unavailable=false){
  const nodes=new Map(),timers=new Map(),calls=[];let serial=0,current=null;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,hidden:true,handlers:{},addEventListener(k,fn){this.handlers[k]=fn;},focus(){}});return nodes.get(id);};
  const state={players:[{fid:'123',kid:'1',name:'sample'}],history:{},kingdom:'1'};
  const queue={
    available:async()=>{if(unavailable)throw Error('server offline');return true;},
    list:async()=>({jobs:current?[current]:[]}),get:async()=>({job:current}),
    start:async(code,retry,ack)=>{calls.push(['start',code,retry,ack]);current={code,status:'pending',targets:[],error:'',stop_requested:0};return {job:current};},
    cancel:async code=>{calls.push(['cancel',code]);current={...current,status:'cancelled'};return {job:current};}
  };
  const context={document:{getElementById:node,querySelector:node},location:{search:''},URLSearchParams,console,
    setTimeout(fn,ms){timers.set(++serial,{fn,ms});return serial;},clearTimeout(id){timers.delete(id);},confirm:()=>true,prompt:()=>null,addEventListener(){},
    WOS_REDEEM_JOBS:queue,
    WOS_REDEEM_API:{redeem:async()=>{throw Error('browser exchange must not run in server mode');},checkPlayer:async()=>({ok:true})},
    WOS_REDEEM_CLOUD:{connect:async(_old,onState)=>onState(state),recordHistory:async()=>{throw Error('server must save the result');}}
  };
  vm.runInNewContext(fs.readFileSync('apps/redeem/redeem.js','utf8'),context);
  for(let i=0;i<10;i++)await new Promise(setImmediate);
  if(unavailable){assert.equal(node('startBtn').disabled,true);assert.equal(calls.length,0);return;}
  assert.equal(node('startBtn').disabled,false);node('cdk').value='ABC123';await node('startBtn').handlers.click();
  assert.deepEqual(calls[0],['start','ABC123',false,false]);assert.equal(node('stopBtn').disabled,false);
  await node('stopBtn').handlers.click();assert.deepEqual(calls[1],['cancel','ABC123']);assert.equal(node('resumeBtn').hidden,true);
  current={...current,status:'failed',summary:{total:1,success:0,failed:1,unknown:0},targets:[{fid:'123',name:'sample',status:'failed',msg:'サーバービジー'}]};
  await [...timers.values()].find(t=>t.ms===8000).fn();assert.equal(node('resumeBtn').hidden,false);assert.equal(node('resumeBtn').textContent,'失敗した1人だけ再実行');
  assert.ok(node('job-summary-counts').textContent.includes('成功0／失敗1／未確認0'));assert.ok(node('job-failures').innerHTML.includes('sample'));await node('resumeBtn').handlers.click();assert.deepEqual(calls[2],['start','ABC123',true,false]);
  current={...current,status:'failed',targets:[{fid:'123',status:'unknown',msg:'結果未確認'}]};
  await [...timers.values()].find(t=>t.ms===8000).fn();
  assert.ok(node('list').innerHTML.includes('結果未確認'));await node('resumeBtn').handlers.click();assert.deepEqual(calls[3],['start','ABC123',true,true]);
  current={...current,status:'completed',targets:[{fid:'123',status:'done',msg:'成功'}]};
  await [...timers.values()].find(t=>t.ms===8000).fn();assert.equal(node('stopBtn').disabled,true);assert.ok(node('progress').textContent.includes('成功 1 / 失敗 0 / 未確認 0'));
  current={...current,status:'expired',summary:{total:2,success:0,failed:0,unknown:0,expired:1,invalid:0,unprocessed:1},targets:[{fid:'123',status:'expired',msg:'交換期限切れ'},{fid:'456',status:'closed',msg:'期限切れのため未実行'}]};
  await [...timers.values()].find(t=>t.ms===8000).fn();assert.equal(node('resumeBtn').hidden,true);assert.ok(node('progress').textContent.includes('受付終了'));assert.ok(node('job-summary-counts').textContent.includes('期限切れ確認1／未実行1'));
}
(async()=>{await scenario();await scenario(true);console.log('PASS shared server UI: submit, live results, stop, retry, uncertain-result confirmation, fail-closed on unavailable server');})().catch(error=>{console.error(error);process.exitCode=1;});

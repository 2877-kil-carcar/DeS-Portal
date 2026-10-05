// Offline DOM doubles. fetch is always a stub; no browser or real request.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const code=fs.readFileSync(path.resolve(__dirname,'../apps/redeem/redeem.js'),'utf8');
async function scenario(mode){
 const nodes=new Map(),calls=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',handlers:{},addEventListener(k,fn){this.handlers[k]=fn;},focus(){}});return nodes.get(id);};
 let confirmResult=false;
 const state={kingdom:'7',players:[{fid:'123',kid:'7',name:'<unsafe>'}],history:{}};
 const fetch=async(url,options)=>{calls.push({url:String(url),options});if(mode==='send-failure'&&options.method==='POST')throw Error('mock network failure');return {ok:mode!=='missing',status:mode==='missing'?404:200,headers:{get:()=>'application/json'},json:async()=>String(url).endsWith('health')?{service:'wos-redeem-hub',ready:mode!=='backend-missing'}:String(url).endsWith('state')?state:{done:true,msg:'mock done',retry:false}};};
 vm.runInNewContext(code,{document:{getElementById:node,querySelector:node},location:{href:'http://example.invalid/apps/redeem/index.html',search:mode==='preview'?'?preview=1':'',protocol:'http:',hostname:'example.invalid'},URL,URLSearchParams,AbortController,setTimeout,clearTimeout,fetch,confirm:()=>confirmResult,prompt:()=>null,addEventListener(){}});
 for(let i=0;i<12;i++)await new Promise(setImmediate);
 if(mode==='preview'){assert.equal(calls.length,0);assert.ok(node('startBtn').disabled);assert.ok(node('list').innerHTML.includes('サンプル'));}
 else if(['missing','backend-missing'].includes(mode)){assert.ok(node('startBtn').disabled);assert.ok(node('setup').open);assert.ok(node('connection-title').textContent.includes('ローカル起動'));assert.equal(node('local-link').hidden,false);}
 else{
  assert.equal(node('startBtn').disabled,false);assert.ok(node('list').innerHTML.includes('&lt;unsafe&gt;'));
  node('cdk').value='DEMO';await node('startBtn').handlers.click();assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
  confirmResult=true;await node('startBtn').handlers.click();assert.equal(calls.filter(c=>c.options.method==='POST').length,1);assert.equal(node('startBtn').disabled,false);assert.equal(node('stopBtn').disabled,true);assert.ok(node('progress').textContent.includes(mode==='send-failure'?'中止':'完了'));
  if(mode==='send-failure')assert.ok(node('list').innerHTML.includes('結果未確認'));
 }
 console.log('PASS redeem UI:',mode);
}
(async()=>{for(const mode of ['preview','missing','backend-missing','ready','send-failure'])await scenario(mode);})().catch(error=>{console.error(error);process.exitCode=1;});

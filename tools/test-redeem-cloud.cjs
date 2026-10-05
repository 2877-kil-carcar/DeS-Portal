const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const stores = new Map();
const listeners = new Map();
let signIns = 0;
const store = name => stores.get(name) || (stores.set(name, new Map()), stores.get(name));
const snapshot = name => ({docs:[...store(name).entries()].map(([id,value]) => ({id,data:()=>value})), empty:store(name).size===0});
const notify = name => (listeners.get(name) || []).forEach(fn => fn(snapshot(name)));

function collection(name) {
  return {
    doc(id) {
      return {
        async get(){ return {exists:store(name).has(id), data:()=>store(name).get(id)}; },
        async set(value){ store(name).set(id,value); notify(name); },
        async delete(){ store(name).delete(id); notify(name); }
      };
    },
    limit(){ return {get:async()=>snapshot(name)}; },
    onSnapshot(next){ const list=listeners.get(name)||[]; list.push(next); listeners.set(name,list); next(snapshot(name)); return ()=>listeners.set(name,list.filter(fn=>fn!==next)); }
  };
}
const db = {
  collection,
  batch(){
    const writes=[];
    return {set(ref,value){writes.push([ref,value]);},async commit(){for(const [ref,value] of writes) await ref.set(value);}};
  }
};
const app = {auth:()=>({signInAnonymously:async()=>{signIns++;}}),firestore:()=>db};
const firebase = {
  apps:[],
  initializeApp(config,name){ assert.equal(config.projectId,'des-portal-gift-code'); const value={name,...app}; this.apps.push(value); return value; },
  firestore:{FieldValue:{serverTimestamp:()=>({serverTimestamp:true})}}
};
const context = {firebase,window:{},console,Date,encodeURIComponent};
vm.runInNewContext(fs.readFileSync('apps/redeem/cloud.js','utf8'),context,{filename:'cloud.js'});
const cloud = context.window.WOS_REDEEM_CLOUD;

(async()=>{
  let latest;
  await cloud.connect({
    players:[{fid:'1001',kid:'2856',name:'A'},{fid:'1002',kid:'2857',name:'B'}],
    history:{CODE1:{1001:{msg:'SUCCESS',at:'2026/10/6'}}}
  }, state=>{latest=state;}, error=>{throw error;});
  assert.equal(signIns,1);
  assert.equal(store('redeemPlayers').size,2);
  assert.equal(store('redeemHistory').size,1);
  assert.equal(store('redeemMeta').get('local-v1').done,true);
  assert.equal(latest.players.length,2);

  await cloud.setPlayer({fid:'1003',kid:'2858',name:'C'});
  assert.equal(latest.players.length,3);
  await cloud.deletePlayer('1002');
  assert.equal(latest.players.length,2);
  await cloud.recordHistory('CODE2','1003',{msg:'ALREADY RECEIVED'});
  assert.equal(latest.history.CODE2['1003'].msg,'ALREADY RECEIVED');

  await cloud.connect({players:[{fid:'9999',kid:'1',name:'復活させない'}],history:{}}, state=>{latest=state;}, error=>{throw error;});
  assert.equal(signIns,2);
  assert.equal(store('redeemPlayers').has('9999'),false);
  assert.equal(latest.players.length,2);
  console.log('PASS redeem cloud: anonymous auth, one-time migration, realtime CRUD and history');
})().catch(error=>{console.error(error);process.exitCode=1;});

const firebaseConfig = {
  apiKey: "AIzaSyDs-jLrDT8s_lymDkDU2VGET0RKeuVvulc",
  authDomain: "rally-app-d8610.firebaseapp.com",
  projectId: "rally-app-d8610",
  storageBucket: "rally-app-d8610.firebasestorage.app",
  messagingSenderId: "439294990582",
  appId: "1:439294990582:web:63c2f273b9f4d5e56af4d7"
}

;
window.firestoreUnsubscribers=[];
function clearFirestoreListeners(){
  window.firestoreUnsubscribers.forEach(fn=>{try{fn();}catch(_){}});
  window.firestoreUnsubscribers=[];
}
const syncCollections=['heroes','alliances','groups','players','rallies'];
let syncGeneration=0, syncTimer, booting=false, servicesLoaded=false, bootGeneration=0;
const sdkLoads=new Map();
function loadSdk(src){
  if(sdkLoads.has(src))return sdkLoads.get(src);
  const promise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=src;
    const fail=()=>{clearTimeout(timer);script.remove();reject(new Error('SDKを読み込めませんでした'));};
    const timer=setTimeout(fail,12000);
    script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=fail;
    document.head.append(script);
  });
  sdkLoads.set(src,promise);
  promise.catch(()=>sdkLoads.delete(src));
  return promise;
}
function startRealtimeSync(){
  clearFirestoreListeners();clearTimeout(syncTimer);
  const generation=++syncGeneration, received=new Set(), errors=new Set();
  window.svsConnectionReady=false;
  syncTimer=setTimeout(()=>{
    if(generation===syncGeneration && received.size<syncCollections.length)setSyncStatus('取得に時間がかかっています。通信・許可ドメイン・Firestoreルールを確認して再接続してください。','error');
  },15000);
  for(const name of syncCollections){
    const unsub=window.db.collection(name).onSnapshot(snapshot=>{
      if(generation!==syncGeneration)return;
      const list=[];
      snapshot.forEach(doc=>{
        const raw=doc.data()||{};
        const row={...raw,id:doc.id,name:String(raw.name||'')};
        if(name==='players')Object.assign(row,{alliance:String(raw.alliance||''),group:String(raw.group||''),heroes:Array.isArray(raw.heroes)?raw.heroes:[],t11:Array.isArray(raw.t11)?raw.t11:[],active:raw.active!==false,joinTime:String(raw.joinTime||''),priority:raw.priority===true,fc:String(raw.fc||'')});
        if(name==='rallies')Object.assign(row,{leaderId:String(raw.leaderId||''),rate:String(raw.rate||''),marchTime:Number(raw.marchTime)||0,heroes:Array.isArray(raw.heroes)?raw.heroes:[],active:raw.active!==false});
        list.push(row);
      });
      list.sort((a,b)=>(a.alliance||'').localeCompare(b.alliance||'')||a.name.localeCompare(b.name)||String(a.leaderId||'').localeCompare(String(b.leaderId||'')));
      setState(name,list);received.add(name);errors.delete(name);
      if(received.size===syncCollections.length && !errors.size){clearTimeout(syncTimer);window.svsConnectionReady=true;setSyncStatus('接続済み・変更は元の共有データへ保存されます','ready');}
    },error=>{
      if(generation!==syncGeneration)return;
      console.error(name+' sync error',error);errors.add(name);window.svsConnectionReady=false;
      setSyncStatus('データを取得できません（'+name+'）。接続・認証・アクセス権限を確認してください。','error');
    });
    window.firestoreUnsubscribers.push(unsub);
  }
}
async function bootSvs(){
  if(booting)return;
  if(window.SVS_PREVIEW){
    setState('heroes',[{id:'sample-hero',name:'ジェシー'}]);
    setState('groups',[{id:'sample-group',name:'サンプル班'}]);
    setState('alliances',[{id:'sample-alliance',name:'SAMPLE'}]);
    setState('players',[{id:'sample-lead',name:'サンプル集結主',alliance:'SAMPLE',group:'サンプル班',heroes:[],active:true,joinTime:'21:00',t11:[]},{id:'sample-joiner',name:'サンプル参加者',alliance:'SAMPLE',group:'サンプル班',heroes:['ジェシー'],active:true,joinTime:'21:00',t11:[]}]);
    setState('rallies',[{id:'sample-rally',leaderId:'sample-lead',rate:'60.20.20',marchTime:30,heroes:[{hero:'ジェシー',need:1}],active:true}]);
    setSyncStatus('プレビュー：サンプルのみ。共有DB・認証・メールへ接続しません。','ready');return;
  }
  const generation=++bootGeneration;
  booting=true;window.svsConnectionReady=false;clearFirestoreListeners();++syncGeneration;clearTimeout(syncTimer);
  setSyncStatus('共有データへ接続しています…');
  const startupTimer=setTimeout(()=>{
    if(generation!==bootGeneration)return;
    ++bootGeneration;booting=false;
    setSyncStatus('接続に時間がかかっています。通信を確認し、再接続してください。','error');
  },15000);
  try{
    if(!servicesLoaded){
      for(const sdk of ['app','firestore','auth']){
        await loadSdk('https://www.gstatic.com/firebasejs/10.12.0/firebase-'+sdk+'-compat.js');
        if(generation!==bootGeneration)return;
      }
      servicesLoaded=true;
    }
    if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);
    window.db=firebase.firestore();window.auth=firebase.auth();
    await window.auth.signInAnonymously();
    if(generation!==bootGeneration)return;
    startRealtimeSync();
  }catch(error){if(generation===bootGeneration){console.error(error);setSyncStatus('接続できません。通信・許可ドメイン・Firebase設定を確認してください。','error');}}
  finally{clearTimeout(startupTimer);if(generation===bootGeneration)booting=false;}
}
document.getElementById('retrySync').addEventListener('click',bootSvs);
showTab('heroes');
bootSvs();

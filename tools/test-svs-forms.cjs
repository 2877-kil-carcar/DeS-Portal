// Offline tests: no browser, Firebase, registration email, clipboard or network.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const U=require('../apps/forms/core.js');
let count=0;
async function test(label,fn){await fn();count++;console.log('PASS',label);}
function sandbox(){
 const nodes=new Map(),events={},alerts=[],batches=[],timers=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,value:'',checked:false,disabled:false,innerHTML:'',textContent:'',dataset:{},style:{},handlers:{},children:[],classList:{add(){},remove(){},contains(){return false;}},addEventListener(k,f){this.handlers[k]=f;},getAttribute(){return '';},setAttribute(){},querySelectorAll(){return [];},append(...items){this.children.push(...items);},before(){},focus(){},remove(){},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);};
 const ctx={console:{log(){},error(){}},URL,URLSearchParams,location:{search:'?preview=1'},document:{getElementById:node,querySelector:()=>null,querySelectorAll:()=>[],createElement:tag=>({...node('temp-'+nodes.size),tagName:tag.toUpperCase()}),body:node('body'),head:node('head'),addEventListener(k,f){events[k]=f;}},navigator:{},alert:m=>alerts.push(m),confirm:()=>true,addEventListener(){},setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout(){},MutationObserver:class{observe(){}},fetch(){throw Error('Unexpected network');},firebase:{firestore:{FieldValue:{serverTimestamp:()=>0}}}};
 ctx.window=ctx;ctx.db={collection:name=>({doc:id=>({name,id,update:async()=>{throw Error('Unexpected direct write');}})}),batch(){const b={ops:[],update(ref,data){this.ops.push({ref,data});},commit:async()=>{b.committed=true;}};batches.push(b);return b;}};
 vm.createContext(ctx);
 const run=f=>vm.runInContext(read('apps/svs/'+f),ctx,{filename:f});
 return {ctx,node,events,alerts,batches,run,timers,nodes};
}
function svs(){
 const s=sandbox();
 for(const f of ['safe-ui.js','storage.js','auth.js','users.js','log.js','heroes.js','groups.js','players.js','alliances.js','playerHeroes.js','rally.js','assign.js','countup.js'])s.run(f);
 return s;
}
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
async function connectedForms(){
 const s=sandbox(),writes=[],opened=[],savedMemo='</textarea><script>untrusted()</script>';
 s.ctx.FormUtils=U;s.ctx.location.search='';s.ctx.localStorage={getItem:()=>savedMemo,setItem(){}};s.ctx.open=(...args)=>opened.push(args);
 let failSave=false;
 const exports={getApps:()=>[],initializeApp:()=>({}),getAuth:()=>({}),signInAnonymously:async()=>{},getFirestore:()=>({}),doc:()=>({}),getDoc:async()=>({exists:()=>true,data:()=>({svs_form:'https://example.invalid/original',svs_sheet:'https://example.invalid/sheet',svs_form_updatedAt:{toDate:()=>new Date('2026-10-06T09:00:00Z')}})}),serverTimestamp:()=> 'SERVER_TIME',setDoc:async(ref,patch,options)=>{writes.push({patch,options});if(failSave)throw Error('mock denied');}};
 vm.runInContext(read('apps/forms/app.js'),s.ctx,{filename:'forms/app.js',importModuleDynamically:async spec=>{
  assert.ok(spec.startsWith('https://www.gstatic.com/firebasejs/'));
  const m=new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context:s.ctx});
  await m.link(()=>{});await m.evaluate();return m;
 }});
 await flush();assert.ok(s.node('status').textContent.includes('接続済み'));
 const click=(action,field='svs_form')=>s.node('sections').handlers.click({target:{closest:()=>({dataset:{action,field},focus(){}})}});
 return {...s,writes,opened,savedMemo,click,failSave:()=>{failSave=true;},submit:()=>s.node('link-form').handlers.submit({preventDefault(){}})};
}
(async()=>{
 await test('forms retain 12 link fields, 6 groups and one shared memo',()=>{
  assert.equal(U.fields.length,12);assert.equal(U.sections.length,5);assert.equal(U.groups.length,6);assert.equal(U.sharedMemoKey,'2856_forms_memo');
  assert.equal(U.sections[3].id,'heiki');assert.equal(U.sections[3].label,'兵器リーグ');
  assert.equal(U.memoKey('toride'),'2856_toride_memo');assert.ok(U.fields.includes('imin_tokubetsu_sheet'));
 });
 await test('forms reject executable/credential URLs and update only one field',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,x','file:///test','https://name:secret@example.invalid','not a URL'])assert.throws(()=>U.safeUrl(url));
  assert.equal(U.safeUrl(''),'');assert.equal(U.safeUrl('https://example.invalid/path'),'https://example.invalid/path');
  assert.deepEqual(U.linkPatch('svs_form','https://example.invalid/'),{svs_form:'https://example.invalid/'});
  assert.throws(()=>U.linkPatch('__proto__','https://example.invalid/'));
  assert.deepEqual(U.readLinks({svs_form:42,imin_futsuu_form:'https://example.invalid/',unrelated:'x'}),{imin_futsuu_form:'https://example.invalid/'});
  assert.deepEqual(U.readUpdatedAt({svs_form_updatedAt:{toDate:()=>new Date('2026-10-06T09:00:00Z')}}),{svs_form:'2026-10-06T09:00:00.000Z'});
 });
 await test('SvS scripts initialize with complete empty state',()=>{
  const s=svs();assert.equal(s.ctx.getState('groups').length,0);assert.ok(s.node('rally').innerHTML.includes('集結設定'));
  s.ctx.setState('players',[{id:'p',name:'テスト',alliance:'__proto__',heroes:[]}]);
  assert.ok(s.node('players').innerHTML.includes('__proto__'));assert.ok(s.node('playerHeroes').innerHTML.includes('所持英雄登録'));
 });
 await test('SvS management views group heroes, players and rallies into compact folds',()=>{
  const s=svs();
  s.ctx.setState('heroes',[{id:'g2',name:'第二英雄',generation:2},{id:'g1',name:'第一英雄',generation:1}]);
  s.ctx.setState('players',[{id:'a',name:'甲',alliance:'A',heroes:['第一英雄'],active:true},{id:'b',name:'乙',alliance:'B',heroes:['第二英雄'],active:true}]);
  s.ctx.setState('rallies',[{id:'r',leaderId:'a',active:true,rate:'60.20.20',marchTime:30,heroes:[{hero:'第一英雄',need:1}]}]);
  const heroHtml=s.node('heroes').innerHTML,playerHtml=s.node('players').innerHTML,ownedHtml=s.node('playerHeroes').innerHTML,rallyHtml=s.node('rally').innerHTML;
  assert.ok(heroHtml.indexOf('第1世代')<heroHtml.indexOf('第2世代'));assert.ok(heroHtml.includes('hero-generation-fold'));
  assert.equal((playerHtml.match(/alliance-fold/g)||[]).length,2);
  assert.ok(playerHtml.indexOf('集計コピー')<playerHtml.indexOf('playerName'));assert.ok(playerHtml.includes('>グループ'));assert.ok(playerHtml.includes('>同盟'));
  assert.ok(ownedHtml.includes('ownership-generation-fold'));assert.ok(ownedHtml.includes('ownership-grid'));assert.ok(s.node('heroList').innerHTML.includes('hero-check-generation'));
  assert.ok(rallyHtml.includes('rally-form-fields'));assert.ok(rallyHtml.includes('march-time-input'));assert.ok(rallyHtml.includes('rate-fields'));
  assert.ok(rallyHtml.includes('rally-alliance-fold'));assert.ok(rallyHtml.includes('<th>行軍時間</th>'));assert.ok(!rallyHtml.includes('<th>行軍</th>'));
 });
 await test('countup handles quotes in group names without executable injection',()=>{
  const s=svs(),group=`O'Reilly "; alert(1); //`;
  s.ctx.setState('groups',[{id:'g',name:group}]);s.node('countupGroupSelect').value=group;s.ctx.addGroupSection();s.ctx.addCountupRow(group);
  const html=s.node('countupTab').innerHTML;
  assert.ok(html.includes('O&#39;Reilly'));
  const decode=x=>x.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  for(const [,code] of html.matchAll(/on(?:click|change)="([^"]+)"/g))new vm.Script(decode(code));
  assert.equal(s.alerts.length,0);
 });
 await test('assignment preserves priority, group and one-player-once rules',()=>{
  const s=svs();s.node('randomAssign').checked=false;
  s.ctx.setState('players',[{id:'lead',name:'主',alliance:'A',group:'G',active:true},{id:'one',name:'優先',alliance:'A',group:'G',active:true,priority:true,joinTime:'00:00',heroes:['H']},{id:'two',name:'通常',alliance:'A',group:'G',active:true,joinTime:'00:00',heroes:['H']},{id:'other',name:'別班',alliance:'A',group:'OTHER',active:true,joinTime:'00:00',heroes:['H']}]);
  s.ctx.setState('rallies',[{id:'r',leaderId:'lead',active:true,marchTime:30,heroes:[{hero:'H',need:3}]}]);
  s.ctx.assign();const text=s.ctx.copyData.lead;
  assert.ok(text.indexOf('優先')<text.indexOf('通常'));assert.ok(text.includes('不在'));assert.ok(!text.includes('別班'));
 });
 await test('player participation and active rallies change in one batch',async()=>{
  const s=svs();s.ctx.setState('rallies',[{id:'r1',leaderId:'p',active:true},{id:'r2',leaderId:'other',active:true}]);
  await s.ctx.togglePlayer('p',true);assert.equal(s.batches.length,1);assert.equal(s.batches[0].ops.length,2);assert.equal(s.batches[0].committed,true);
  assert.equal(s.batches[0].ops[0].data.joinTime,'');assert.equal(s.batches[0].ops[1].ref.id,'r1');
 });
 await test('rally rejects negative ratios that still add to 100',async()=>{
  const s=svs();s.node('rallyLeader').value='p';s.node('rate1').value='-10';s.node('rate2').value='60';s.node('rate3').value='50';
  await s.ctx.addRally();assert.ok(s.alerts.some(x=>x.includes('100')));assert.equal(s.batches.length,0);
 });
 await test('countup retains march-time arithmetic and rejects stale selection',()=>{
  const s=svs();s.ctx.setState('groups',[{id:'g',name:'G'}]);s.ctx.setState('players',[{id:'a',name:'A',group:'G',active:true},{id:'b',name:'B',group:'G',active:true}]);
  s.ctx.setState('rallies',[{leaderId:'a',marchTime:50,active:true},{leaderId:'b',marchTime:30,active:true}]);
  s.node('countupGroupSelect').value='G';s.ctx.addGroupSection();s.ctx.addCountupRow('G');s.ctx.addCountupRow('G');s.ctx.changeLeader('G',0,'a');s.ctx.changeLeader('G',1,'b');s.ctx.changeInterval('G',1,'5');s.ctx.calcCountup();
  assert.ok(s.ctx._countupCopyData.countup_G.includes('B 25'));
  s.ctx.setState('rallies',[]);s.ctx.calcCountup();assert.ok(s.alerts.at(-1).includes('選び直し'));
 });
 await test('SvS preview never loads SDK or performs writes, but calculations work',async()=>{
  const s=svs();s.run('hub-runtime.js');s.ctx.showTab=()=>{};s.run('boot.js');
  assert.equal(s.node('head').children.length,0);assert.ok(s.node('syncStatus').textContent.includes('プレビュー'));
  assert.deepEqual(JSON.parse(JSON.stringify(s.ctx.getState('heroes'))),[{id:'sample-hero',name:'エイダン',generation:17}]);
  assert.equal(s.ctx.getState('players').length,2);await s.ctx.addPlayer();assert.ok(s.alerts.at(-1).includes('プレビュー'));assert.equal(s.batches.length,0);
  s.ctx.assign();assert.ok(s.ctx.copyData['sample-lead'].includes('サンプル参加者'));
 });
 await test('forms preview is usable with denied localStorage and creates no requests',async()=>{
  const s=sandbox();s.ctx.FormUtils=U;s.ctx.localStorage={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
  vm.runInContext(read('apps/forms/app.js'),s.ctx,{filename:'forms/app.js'});
  assert.equal(s.node('sections').children.length,6);assert.ok(s.node('status').textContent.includes('プレビュー'));
  assert.equal(s.node('head').children.length,0);
 });
 await test('forms initial load failure is visible and retryable',async()=>{
  const s=sandbox();s.ctx.FormUtils=U;s.ctx.location.search='';s.ctx.localStorage={getItem(){throw Error('denied');}};
  vm.runInContext(read('apps/forms/app.js'),s.ctx,{filename:'forms/app.js',importModuleDynamically:async()=>{throw Error('mock offline');}});
  for(let i=0;i<4;i++)await new Promise(setImmediate);
  assert.ok(s.node('status').textContent.includes('取得できません'));assert.equal(s.node('retry').hidden,false);assert.equal(s.node('sections').children.length,6);
 });
 await test('forms connected edit saves only changed field and opens sanitized URL',async()=>{
  const s=await connectedForms();s.click('edit');assert.equal(s.node('modal-input').value,'https://example.invalid/original');
  s.node('modal-input').value='https://example.invalid/new';await s.submit();
  assert.equal(s.writes.length,1);assert.equal(s.writes[0].patch.svs_form,'https://example.invalid/new');assert.equal(s.writes[0].patch.svs_form_updatedAt,'SERVER_TIME');assert.equal(Object.keys(s.writes[0].patch).length,2);assert.equal(s.writes[0].options.merge,true);
  assert.equal(s.node('link-dialog').open,false);assert.equal(s.node('modal-save').disabled,false);
  s.click('open');assert.deepEqual(s.opened[0],['https://example.invalid/new','_blank','noopener,noreferrer']);
  s.click('open','svs_sheet');assert.equal(s.opened[1][0],'https://example.invalid/sheet');
  const memo=s.node('memo');
  assert.equal(memo.value,s.savedMemo);assert.equal(memo.innerHTML,'');
 });
 await test('forms failed save retains input, old link and usable retry controls',async()=>{
  const s=await connectedForms();s.failSave();s.click('edit');s.node('modal-input').value='https://example.invalid/failed';await s.submit();
  assert.equal(s.node('link-dialog').open,true);assert.ok(s.node('modal-error').textContent.includes('保存できません'));
  assert.equal(s.node('modal-input').value,'https://example.invalid/failed');assert.equal(s.node('modal-input').disabled,false);
  s.node('modal-cancel').handlers.click();s.click('open');assert.equal(s.opened[0][0],'https://example.invalid/original');
 });
 await test('SvS startup timeout is retryable and late old callbacks are ignored',async()=>{
  const s=svs();s.ctx.SVS_PREVIEW=false;s.ctx.showTab=()=>{};s.run('hub-runtime.js');s.run('boot.js');
  assert.equal(s.node('head').children.length,1);s.timers[0]();
  assert.equal(s.node('retrySync').hidden,false);const retry=s.ctx.bootSvs();
  assert.equal(s.node('head').children.length,1); // in-flight SDK load is shared
  for(let i=0;i<3;i++){s.node('head').children.at(-1).onload();await flush();}
  await retry; // mock Firebase initialization fails; old attempt must not start a second SDK sequence
  assert.equal(s.node('head').children.length,3);assert.equal(s.node('retrySync').hidden,false);
  assert.equal(s.ctx.svsConnectionReady,false);
 });
 await test('both menu modules registered; legacy feature tabs retained',()=>{
  const app=read('assets/app.js'),html=read('index.html'),svsHtml=read('apps/svs/index.html');
  for(const id of ['svs','forms']){assert.ok(app.includes("id: '"+id+"'"));assert.ok(html.includes('id="view-'+id+'"'));}
  for(const id of ['heroes','groups','alliances','players','playerHeroes','rally','result','countupTab','userMgmt','logTab'])assert.ok(svsHtml.includes('id="'+id+'"'));
  assert.ok(app.includes("'games', 'formation', 'svs'"));
  assert.ok(html.includes('GEN 01 — 17'));
  assert.equal((svsHtml.match(/id="syncStatus"/g)||[]).length,1);
  assert.ok(svsHtml.indexOf('id="syncStatus"')>svsHtml.indexOf('id="countupTab"'));
  assert.ok(read('apps/svs/heroes.js').includes('hero-generation-fold'));
 });
 console.log(count+' SvS/forms offline test groups passed');
})().catch(error=>{console.error(error);process.exitCode=1;});

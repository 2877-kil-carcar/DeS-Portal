// In-memory DOM doubles only. No browser, layout engine, networking or Firebase.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'wos_rally_joiner_gen1-8.json'),'utf8'));
const code=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
const core=require('../assets/core.js');
function run(standalone){
 const nodes=new Map(),handlers={};
 function element(id=''){
  return {id,value:'',textContent:'',innerHTML:'',dataset:{},hidden:false,style:{},handlers:{},children:[],classList:{toggle(){},add(){},remove(){},contains(){return false;}},
   addEventListener(type,fn){this.handlers[type]=fn;},setAttribute(){},removeAttribute(){},querySelectorAll(){return [];},querySelector(){return element();},append(node){this.children.push(node);},focus(){},showModal(){this.open=true;},close(){this.open=false;},closest(){return this;}};
 }
 const get=id=>{if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id);};
 const document={getElementById:get,querySelectorAll:()=>[],querySelector:()=>element(),createElement:()=>element(),body:element(),addEventListener:(type,fn)=>handlers[type]=fn};
 const win={WOS_DATA:data,WOS_CORE:core,WOS_STANDALONE:standalone,matchMedia:()=>({matches:true,addEventListener(){}}),addEventListener(){},scrollTo(){}};
 const location={hash:'',href:'https://example.invalid/wos/index.html?preview=1',search:'?preview=1',origin:'https://example.invalid'};
 vm.runInNewContext(code,{window:win,document,location,URL,URLSearchParams,localStorage:{getItem:()=>null,setItem(){}},addEventListener(){},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},queueMicrotask:fn=>fn(),confirm:()=>true,Blob}, {filename:'assets/app.js'});
 assert.ok(get('hero-grid').innerHTML.includes('ウェイン'));
 const click=dataset=>handlers.click({target:{closest:()=>({dataset})}});
 for(const purpose of ['attack','defense']){
  click({purpose});click({mode:'all'});
  assert.ok(!get('hero-grid').innerHTML.includes('undefined'));
  for(const h of data.heroes){click({detail:h.id});assert.ok(get('hero-dialog').open);assert.ok(!get('dialog-content').innerHTML.includes('undefined'),h.id);assert.ok(get('dialog-content').innerHTML.includes('採用元と根拠'),h.id);assert.ok(get('dialog-content').innerHTML.includes(h.skills[0].evidence.adoptedSourceUrl),h.id);}
 }
 click({add:'wayne'});click({add:'wayne'});assert.ok(get('comparison-notes').innerHTML.includes('個別重複式は未確認'));
 assert.ok(get('trigger-filter').innerHTML.includes('critical'));assert.ok(get('trigger-filter').innerHTML.includes('periodic_delayed'));
 assert.ok(get('evidence-policy').innerHTML.includes('83/91'));
 click({detail:'gordon'});assert.ok(get('dialog-content').innerHTML.includes('6% / 12% / 15% / 24% / 30%'));
 click({detail:'gwen'});assert.ok(get('dialog-content').innerHTML.includes('/gwen-2/'));
 assert.ok(get('hero-grid').innerHTML.includes('暫定採用・資料差あり'));
 console.log('PASS in-memory render smoke:',standalone?'standalone':'hub','/ 66 detail renders');
}
run(false);run(true);
console.log('No browser visual or backend verification was performed by this test.');

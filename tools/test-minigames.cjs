// Offline execution of the actual inline game scripts. No browser or network.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(process.env.WOS_GAME_TEST_ROOT||path.join(__dirname,'..','apps','games'));
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const plain=x=>JSON.parse(JSON.stringify(x));
const tests=[];function test(name,fn){tests.push({name,fn});}
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
function node(){const classes=new Set();return {style:{},dataset:{},value:'',checked:false,disabled:false,innerHTML:'',textContent:'',children:[],handlers:{},classList:{add(...v){v.forEach(x=>classes.add(x));},remove(...v){v.forEach(x=>classes.delete(x));},contains:x=>classes.has(x),toggle(x,on){if(on??!classes.has(x))classes.add(x);else classes.delete(x);}},appendChild(c){this.children.push(c);return c;},append(...c){this.children.push(...c);},prepend(c){this.children.unshift(c);},addEventListener(k,fn){this.handlers[k]=fn;},setAttribute(){},getAttribute(){return '';},querySelectorAll(){return [];},querySelector(){return node();},remove(){},focus(){},getBoundingClientRect(){return {width:400,height:600,top:0,left:0};}};}
const exposures={
 babanuki:'createDeck,shuffle,dealCards,removePairs,startGame,getDrawTarget,drawCard,renderGame,setState(v){gameState=v;myIndex=v.pids.indexOf(MY_PID);}',
 sevens:'createDeck,isCardPlayable,updateBoardForCard,forceCardOnBoard,getJokerTargets,startGame,playCard,passClick,eliminatePlayer,renderGame,setState(v){gameState=v;myIndex=v.pids.indexOf(MY_PID);}',
 poker:'createDeck,evaluateHand,evaluateNormal,checkStraight,HAND_SCORES,HINT_HANDS,startGame,renderGame,setState(v){gameState=v;},select(ids){selectedCards=new Set(ids);}',
 daifugo:'cardStrength,isStair,isValidStructure,canPlay,checkRevolution,checkForbiddenWin,computeShibari,removeCards,nextActivePid,fieldClearEffect,computeRankings,rankName,rankPoint,runEffectPipeline,makeDeck,applyPlay,doPass,startListeners,renderGame,executeExchange,openSelectModal,handleExchangePhase,setSelection(indices){selModalSelected=indices;},setState(v,h=[],r={}){gs=v;myHand=h;rules={...DEFAULT_RULES,...r};players={a:{name:"A"},b:{name:"B"},c:{name:"C"}};},getState(){return gs;}',
};
async function load(game,{name='Player',preview=false,lobby=false,pid='a'}={}){
 const file=game+(lobby?'':'-game')+'.html',html=fs.readFileSync(path.join(root,file),'utf8');
 const nodes=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],node()]));
 const writes=[],listeners=[],timers=[],errors=[];let failWrite=false,initCount=0,dataTree={};
 const read=p=>{let v=dataTree;for(const key of p.split('/').filter(Boolean))v=v?.[key];return clone(v??null);};
 const writePath=(p,v)=>{const parts=p.split('/').filter(Boolean);if(!parts.length){dataTree=clone(v)||{};return;}let obj=dataTree;for(const part of parts.slice(0,-1))obj=obj[part]??={};if(v==null)delete obj[parts.at(-1)];else obj[parts.at(-1)]=clone(v);};
 const store={set:writePath,get:read};
 const snap=v=>({exists:()=>v!==null&&v!==undefined,val:()=>clone(v??null),forEach(fn){Object.entries(v||{}).forEach(([key,x])=>fn({...snap(x),key}));}});
 const put=async(p,data,kind)=>{if(failWrite)throw Error('mock write failure');writes.push({path:p,data:clone(data),kind});if(kind==='set')store.set(p,clone(data));else{const result=read(p)||{};for(const [k,v]of Object.entries(data)){const parts=k.split('/');let obj=result;for(const part of parts.slice(0,-1))obj=obj[part]??={};obj[parts.at(-1)]=clone(v);}store.set(p,result);}};
 const ctx={console:{log(){},warn(){},error(...v){errors.push(v.map(String).join(' '));}},URL,URLSearchParams,location:{search:preview?'?preview=1':`?room=TEST&pid=${pid}&name=${encodeURIComponent(name)}`,href:''},navigator:{clipboard:{writeText:async()=>{}}},localStorage:{getItem:k=>k==='gallery_image_urls'?'["https://example.invalid/card.png"]':k==='babanuki_pid'?pid:null,setItem(){}},document:{getElementById:id=>nodes.get(id)||null,createElement:()=>node(),querySelectorAll:()=>[],querySelector:()=>node(),body:node(),addEventListener(){}},innerWidth:400,innerHeight:800,alert(){},confirm:()=>true,addEventListener(){},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,fetch(){throw Error('Network prohibited');},initializeApp(){initCount++;return {};},getDatabase:()=>({}),getFirestore:()=>({}),getAuth:()=>({}),signInAnonymously:async()=>{},getDocs:async()=>({docs:[]}),collection:()=>({}),query:x=>x,limit:()=>{},orderByChild:()=>{},endAt:()=>{},ref:(db,p='')=>p,get:async p=>snap(read(p)),set:(p,data)=>put(p,data,'set'),update:(p,data)=>put(p,data,'update'),onValue:(p,fn)=>{listeners.push({path:p,fn});return ()=>{};},onChildAdded:()=>()=>{},onDisconnect:()=>({set:async()=>{},remove:async()=>{}}),push:async()=>{},runTransaction:async(p,fn)=>{const next=fn(read(p));if(next===undefined)return {committed:false,snapshot:snap(read(p))};await put(p,next,'set');return {committed:true,snapshot:snap(next)};}};
 ctx.window=ctx;vm.createContext(ctx);
 if(fs.existsSync(path.join(root,'game-sync.js')))vm.runInContext(fs.readFileSync(path.join(root,'game-sync.js'),'utf8'),ctx);
 if(game==='daifugo')vm.runInContext(fs.readFileSync(path.join(root,'daifugo-rules.js'),'utf8'),ctx);
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(!/type="module"/.test(match[1]))continue;
  let code=match[2].replace(/import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?/g,'');
  if(!lobby){const end=code.lastIndexOf('}');code=code.slice(0,end)+'\nwindow.__test={MY_NAME,'+exposures[game]+'};\n'+code.slice(end);}
  vm.runInContext(code,ctx,{filename:file,timeout:3000});
 }
 await flush();
 if(ctx.__test && game!=='daifugo'){
  const setState=ctx.__test.setState;
  ctx.__test.setState=(v,...args)=>{setState(v,...args);store.set((game==='babanuki'?'rooms':'rooms_'+game)+'/TEST/gameState',v);};
 }
 return {ctx,api:ctx.__test,node:id=>nodes.get(id),nodes,writes,store,read,listeners,timers,errors,get initCount(){return initCount;},failWrite(v=true){failWrite=v;},async emit(p,v){store.set(p,clone(v));for(const l of listeners.filter(l=>l.path===p))await l.fn(snap(v));await flush();}};
}
const card=(n,suit='♠')=>({num:n,rank:({1:'A',11:'J',12:'Q',13:'K'})[n]||String(n),suit,id:suit+n});
const joker={num:0,rank:'JOKER',suit:'JOKER',id:'JOKER1'};
const board=()=>Object.fromEntries(['♠','♥','♦','♣'].map(s=>[s,{min:7,max:7}]));
const sevenState=(hands={a:[card(6),card(8)],b:[card(5)],c:[card(9)]})=>({pids:Object.keys(hands),currentTurn:0,hands,board:board(),passes:{},finished:[],eliminated:[],rules:{joker:true,akAdjacent:false},jokerForced:[],jokerPositions:[],logs:[]});
const daiState=()=>({turnOrder:['a','b','c'],turn:'a',direction:1,field:[],finished:[],disqualified:[],forbidden:{},passCount:0,revolution:false,elevenBack:false,round:1,scores:{},phase:'playing'});
function applyPatch(state,patch){const next=clone(state);for(const [key,value]of Object.entries(patch)){let obj=next;const parts=key.split('/');for(const part of parts.slice(0,-1))obj=obj[part]??={};obj[parts.at(-1)]=clone(value);}return next;}
function seed(s,n){vm.runInContext(`{let n=${n};Math.random=()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);}`,s.ctx);}

test('all four games and lobbies load; preview never initializes Firebase',async()=>{
 for(const g of Object.keys(exposures))for(const lobby of [false,true]){const s=await load(g,{preview:true,lobby});assert.equal(s.initCount,0);assert.equal(s.writes.length,0);}
});
test('player names containing percent signs and encoded-looking text survive one URL decode',async()=>{
 for(const g of Object.keys(exposures))for(const name of ['100%もふ','%E3%81%82','A&B + C']){const s=await load(g,{name});assert.equal(s.api.MY_NAME,name);}
});
test('babanuki deck sizes, unique IDs, pair removal and joker preservation',async()=>{
 const {api:a}=await load('babanuki');for(const n of [1,2,3]){const deck=a.createDeck(n);assert.equal(deck.length,52*n+1);assert.equal(new Set(deck.map(c=>c.id)).size,deck.length);assert.equal(a.removePairs(deck).length,1);assert.equal(a.removePairs(deck)[0].rank,'JOKER');const hands=a.dealCards(deck,7);assert.equal(hands.flat().length,deck.length);assert.ok(Math.max(...hands.map(h=>h.length))-Math.min(...hands.map(h=>h.length))<=1);}
});
test('babanuki recognizes zero-card players after initial pairing and skips them',async()=>{
 const s=await load('babanuki');vm.runInContext('Math.random=()=>0.999999',s.ctx);
 const room={players:{a:{},b:{}}};s.store.set('rooms/TEST',room);await s.api.startGame(room);const g=s.writes.at(-1).data.gameState;
 for(const pid of g.pids.filter(p=>!g.hands[p]?.length))assert.ok(g.finished.includes(pid),'empty hand must be finished');
 assert.ok(g.hands[g.pids[g.currentTurn]]?.length,'turn must not point at an empty hand');
});
test('babanuki rejects stale/non-turn draws and invalid card positions',async()=>{
 const s=await load('babanuki');const g={pids:['a','b','c'],currentTurn:1,hands:{a:[card(3)],b:[card(4)],c:[joker]},finished:[],logs:[]};s.api.setState(g);
 await s.api.drawCard('c',0,g,{});assert.equal(s.writes.length,0);
 g.currentTurn=0;s.api.setState(g);await s.api.drawCard('b',99,g,{});assert.equal(s.writes.length,0);
});
test('sevens adjacent placement, gaps after retirement and AK arms',async()=>{
 const {api:a}=await load('sevens');const b=board();assert.equal(a.isCardPlayable(card(6),b),true);assert.equal(a.isCardPlayable(card(5),b),false);
 a.forceCardOnBoard(b,card(3));assert.deepEqual(plain(b['♠'].gaps),[4,5,6]);assert.equal(a.isCardPlayable(card(4),b),false);
 a.updateBoardForCard(b,card(6));assert.equal(a.isCardPlayable(card(5),b),true);
 const wrap=board();for(let n=8;n<=13;n++)a.updateBoardForCard(wrap,card(n));assert.equal(a.isCardPlayable(card(1),wrap),false);assert.equal(a.isCardPlayable(card(1),wrap,{akAdjacent:true}),true);
 a.updateBoardForCard(wrap,card(1),{akAdjacent:true});assert.equal(a.isCardPlayable(card(2),wrap,{akAdjacent:true}),true);
 assert.equal(a.createDeck(false).length,52);assert.equal(a.createDeck(true).length,54);
});
test('sevens ordinary last card finishes and advances past finished players',async()=>{
 const s=await load('sevens'),g=sevenState({a:[card(6)],b:[card(5)],c:[card(8)]});s.api.setState(g);await s.api.playCard(card(6),g,{});
 assert.deepEqual(plain(s.writes.at(-1).data.finished),['a']);assert.equal(s.writes.at(-1).data.currentTurn,1);
});
test('sevens last joker finishes the player and preserves forced replacement',async()=>{
 const s=await load('sevens'),g=sevenState({a:[joker],b:[card(6)],c:[card(8)]});s.api.setState(g);
 s.ctx._startJokerMode(joker);await flush();await s.ctx._placeJoker({suit:'♠',num:6});const p=s.writes.at(-1).data;
 assert.ok(p.finished?.includes('a'));assert.equal(p.jokerForced[0].pid,'b');assert.equal(p.currentTurn,1);
});
test('sevens joker on AK arm cannot shrink the existing board',async()=>{
 const s=await load('sevens'),g=sevenState({a:[joker,card(4)],b:[card(2)],c:[card(6)]});g.rules.akAdjacent=true;g.board['♠']={min:7,max:13,aAboveK:true,maxAboveK:1};s.api.setState(g);
 s.ctx._startJokerMode(joker);await flush();await s.ctx._placeJoker({suit:'♠',num:2});const b=s.writes.at(-1).data.board['♠'];assert.equal(b.max,13);assert.equal(b.maxAboveK,2);
});
test('sevens forced replacement blocks unrelated cards and pass; limit remains five',async()=>{
 const s=await load('sevens'),g=sevenState();g.jokerForced=[{pid:'a',suit:'♠',num:6}];s.api.setState(g);
 await s.api.playCard(card(8),g,{});await s.api.passClick();assert.equal(s.writes.length,0);
 g.jokerForced=[];g.passes.a=5;await s.api.passClick();assert.equal(s.writes.length,0);
 g.passes.a=4;s.api.setState(g);await s.api.passClick();assert.equal(s.writes.at(-1).data.passes.a,5);
});
test('poker all ten existing roles, points and both ace straights',async()=>{
 const {api:a}=await load('poker');for(const h of a.HINT_HANDS){const hand=h.cards.map(c=>card(({A:1,J:11,Q:12,K:13})[c.r]||Number(c.r),c.s));assert.equal(a.evaluateHand(hand),h.role);}
 assert.deepEqual(plain(a.HAND_SCORES),{'ロイヤルフラッシュ':30,'ストレートフラッシュ':25,'フォーカード':20,'フルハウス':16,'フラッシュ':12,'ストレート':9,'スリーカード':6,'ツーペア':4,'ワンペア':2,'ハイカード':0});
 assert.equal(a.checkStraight([1,2,3,4,5]),true);assert.equal(a.checkStraight([1,10,11,12,13]),true);assert.equal(a.checkStraight([1,2,11,12,13]),false);
 assert.equal(a.evaluateHand([card(1),card(10),card(11),joker,{...joker,id:'JOKER2'}]),'ロイヤルフラッシュ');assert.equal(a.createDeck().length,54);
});
test('poker exchange write failure restores buttons and permits retry',async()=>{
 const s=await load('poker'),g={pids:['a','b'],hands:{a:[1,3,6,9,13].map(n=>card(n)),b:[2,4,7,10,12].map(n=>card(n,'♥'))},deck:[card(8)],phase:'exchange',exchangeOrder:['a','b'],currentExchangeTurn:0,scores:{},round:1,totalRounds:3};s.api.setState(g);s.api.select(['♠3']);s.failWrite();
 await s.ctx._doExchange();assert.equal(s.node('exchangeBtn').style.display,'block');assert.equal(s.node('stayBtn').style.display,'block');
 s.failWrite(false);await s.ctx._doExchange();assert.equal(s.writes.length,1);
});
test('daifugo full rule ID round-trips without changing any switches',async()=>{
 const s=await load('daifugo'),r=s.ctx.DaifugoRules;
 for(const key of r.RULE_BOOL_KEYS){const rule={...r.DEFAULT_RULES,[key]:true};assert.deepEqual(plain(r.decodeRuleId(r.encodeRuleId(rule))),plain(rule),key);}
 for(const ce of ['off','simultaneous','receive-first'])for(const fw of ['off','yasashii','on'])for(const jk of ['off','yasashii','on']){const rule={...r.DEFAULT_RULES,...Object.fromEntries(r.RULE_BOOL_KEYS.map(k=>[k,true])),cardExchange:ce,forbiddenWin2:fw,forbiddenWinJoker:jk};assert.deepEqual(plain(r.decodeRuleId(r.encodeRuleId(rule))),plain(rule));}
 assert.equal(r.decodeRuleId('00000000000').revolution,false);assert.equal(r.decodeRuleId('000000010').revolution,true);
});
test('daifugo base strength, revolution XOR back, stairs and joker removal count',async()=>{
 const {api:a}=await load('daifugo');const c=n=>({s:'S',n}),g=daiState();assert.equal(a.cardStrength(c(3),false,false),3);assert.equal(a.cardStrength(c(3),true,false),13);assert.equal(a.cardStrength(c(3),true,true),3);
 assert.equal(a.canPlay([c(5)],{...g,field:[c(4)]},{}),true);assert.equal(a.canPlay([c(3)],{...g,field:[c(4)]},{}),false);
 assert.equal(a.canPlay([c(3)],{...g,field:[c(4)],revolution:true},{}),true);
 assert.equal(a.isValidStructure([c(3),c(4),c(5)],g,{}),false);assert.equal(a.isValidStructure([c(3),c(4),c(5)],g,{stair:true}),true);
 assert.equal(a.removeCards([{s:'JK',n:16},{s:'JK',n:16}],[{s:'JK',n:16}]).length,1);
});
test('daifugo optional effects stay off by default; rank points stay unchanged',async()=>{
 const {api:a}=await load('daifugo');for(let n=3;n<=15;n++){const gs=daiState(),next=clone(gs);const fx=a.runEffectPipeline({cards:[{s:'S',n}],pid:'a',prevField:[],gs,newGs:next,rules:{}});assert.equal(fx.fieldCleared,false);assert.equal(fx.skipCount,0);assert.equal(fx.subPhases.length,0);}
 assert.deepEqual([0,1,2,3,4].map(i=>a.rankPoint(a.rankName(i,5))),[2,1,0,-1,-2]);
 const rankings=a.computeRankings({...daiState(),finished:['b'],disqualified:['c']});assert.deepEqual(plain(rankings),{c:2,b:0,a:1});
});
test('daifugo receive-first can return a received card without duplication',async()=>{
 const s=await load('daifugo'),a={s:'S',n:9},b={s:'D',n:3},g={...daiState(),rankings:['a','b','c'],phase:'exchange'};s.api.setState(g,[a],{cardExchange:'receive-first'});
 s.store.set('rooms_daifugo/TEST/hands/a',[a]);s.store.set('rooms_daifugo/TEST/hands/c',[b,{s:'H',n:4}]);
 await s.api.executeExchange({upper:'a',lower:'c',count:1},[b],[b],g);
 const write=s.writes.find(w=>w.data?.['rooms_daifugo/TEST/hands/a']);assert.deepEqual(plain(write.data['rooms_daifugo/TEST/hands/a']),[a]);assert.equal(write.data['rooms_daifugo/TEST/hands/c'].length,2);
});
test('daifugo seven-pass can finish an emptied hand',async()=>{
 const s=await load('daifugo'),hand=[{s:'S',n:4}],g={...daiState(),subPhase:{type:'sevenPass',pid:'a',count:1,target:'b'}};s.api.setState(g,hand,{sevenPass:true});s.store.set('rooms_daifugo/TEST/hands/b',[{s:'H',n:8}]);
 s.api.openSelectModal('sevenPass',1,hand);s.api.setSelection([0]);await s.ctx.confirmSelect();const next=s.writes.at(-1).data['rooms_daifugo/TEST/game'];assert.ok(next.finished.includes('a'));assert.equal(next.turn,'b');
});
test('daifugo round-ending play saves its hand together with the final scores',async()=>{
 const s=await load('daifugo'),last={s:'S',n:4},g={...daiState(),finished:['b']};s.api.setState(g,[last]);await s.api.applyPlay([last],'a');
 const w=s.writes.at(-1);assert.deepEqual(plain(w.data['rooms_daifugo/TEST/hands/a']),[]);assert.equal(w.data['rooms_daifugo/TEST/game'].phase,'round_end');
});
test('babanuki complete games for 2, 3, 8 and 30 players preserve unique cards and terminate',async()=>{
 for(const size of [2,3,8,30]){
  const pids=Array.from({length:size},(_,i)=>'p'+i),players=Object.fromEntries(pids.map(p=>[p,{name:p}])),clients={};
  for(const pid of pids){clients[pid]=await load('babanuki',{pid});seed(clients[pid],size+pid.length);}
  const first=clients[pids[0]],room={players};first.store.set('rooms/TEST',room);await first.api.startGame(room);let g=plain(first.writes.at(-1).data.gameState),turns=0;
  while(g.finished.length<size-1 && turns++<10000){const s=clients[g.pids[g.currentTurn%size]];s.api.setState(g);const target=s.api.getDrawTarget(g);assert.ok(target);const before=s.writes.length;await s.api.drawCard(target,turns%g.hands[target].length,g,players);assert.equal(s.writes.length,before+1);g=applyPatch(g,s.writes.at(-1).data);const cards=Object.values(g.hands).flat();assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);assert.equal(cards.filter(c=>c.rank==='JOKER').length,1);}
  assert.equal(g.finished.length,size-1);assert.equal(Object.values(g.hands).flat().length,1);
 }
});
test('sevens complete games with each joker/AK toggle combination keep cards and turns valid',async()=>{
 for(const rules of [{joker:false,akAdjacent:false},{joker:false,akAdjacent:true},{joker:true,akAdjacent:false},{joker:true,akAdjacent:true}]){
  const pids=['a','b','c','d'],players=Object.fromEntries(pids.map(p=>[p,{name:p}])),clients={};for(const pid of pids){clients[pid]=await load('sevens',{pid});seed(clients[pid],pid.charCodeAt(0));}
  const room={players,rules};clients.a.store.set('rooms_sevens/TEST',room);await clients.a.api.startGame(room);let g=plain(clients.a.writes.at(-1).data.gameState),turns=0;
  while(!g.gameOver && turns++<400){const s=clients[g.pids[g.currentTurn]],pid=g.pids[g.currentTurn],hand=g.hands[pid]||[];s.api.setState(g);const forced=(g.jokerForced||[]).filter(f=>f.pid===pid);const legal=hand.find(c=>forced.length?forced.some(f=>f.suit===c.suit&&f.num===c.num):s.api.isCardPlayable(c,g.board,rules));const before=s.writes.length;
   if(legal)await s.api.playCard(legal,g,players);
   else if(hand.some(c=>c.rank==='JOKER')){s.ctx._startJokerMode();await flush();const target=s.api.getJokerTargets(g.board,rules).find(t=>Object.values(g.hands).flat().some(c=>c.suit===t.suit&&c.num===t.num));assert.ok(target);await s.ctx._placeJoker(target);}
   else if((g.passes[pid]||0)<5)await s.api.passClick();else await s.api.eliminatePlayer();
   assert.equal(s.writes.length,before+1,'turn must commit');g=applyPatch(g,s.writes.at(-1).data);
   for(const b of Object.values(g.board))assert.ok(b.min<=7&&b.max>=7&&b.min>=1&&b.max<=13);
   const cards=Object.values(g.hands).flat();assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);for(const finished of g.finished||[])assert.equal((g.hands[finished]||[]).length,0);
  }
  assert.equal(g.gameOver,true);assert.ok(turns<400);
 }
});
test('poker three rounds preserve five-card hands, scores and no joker exchange',async()=>{
 const players={a:{name:'A',index:0},b:{name:'B',index:1}},a=await load('poker'),b=await load('poker',{pid:'b'});seed(a,5);seed(b,6);const room={players};a.store.set('rooms_poker/TEST',room);await a.api.startGame(room);let g=plain(a.writes.at(-1).data.gameState);
 for(let round=1;round<=3;round++){
  assert.equal(g.round,round);assert.equal(g.totalRounds,3);
  for(const pid of g.exchangeOrder){const s=pid==='a'?a:b;s.api.setState(g);s.api.select((g.hands[pid]||[]).filter(c=>c.rank!=='JOKER').slice(0,2).map(c=>c.id));await s.ctx._doExchange();g=applyPatch(g,s.writes.at(-1).data);assert.equal(g.hands[pid].length,5);}
  assert.equal(g.phase,'roundResult');for(const pid of g.pids)assert.equal(g.roundResults[pid].pt,a.api.HAND_SCORES[g.roundResults[pid].role]);
  if(round<3){a.api.setState(g);a.store.set('rooms_poker/TEST',{host:'a',players,gameState:g});await a.ctx._nextRound();g=applyPatch(g,a.writes.at(-1).data);}
 }
});
test('daifugo complete base-rule round has valid turns, ranks and conserved hands',async()=>{
 const clients={};for(const pid of ['a','b','c'])clients[pid]=await load('daifugo',{pid});
 const deck=plain(clients.a.api.makeDeck());const hands={a:[],b:[],c:[]};deck.forEach((c,i)=>hands[['a','b','c'][i%3]].push(c));let g=daiState(),turns=0;
 while(g.phase==='playing'&&turns++<500){const pid=g.turn,s=clients[pid];s.api.setState(g,hands[pid]);const legal=hands[pid].find(c=>s.api.canPlay([c],g,{}));const before=s.writes.length;if(legal)await s.api.applyPlay([legal],pid);else await s.api.doPass();assert.equal(s.writes.length,before+1);const w=s.writes.at(-1);
  if(w.path==='') {g=plain(w.data['rooms_daifugo/TEST/game']);for(const p of ['a','b','c'])if(w.data['rooms_daifugo/TEST/hands/'+p])hands[p]=plain(w.data['rooms_daifugo/TEST/hands/'+p]);}else g=plain(w.data);
  assert.equal(new Set(g.finished).size,g.finished.length);
 }
 assert.equal(g.phase,'round_end');assert.equal(g.rankings.length,3);assert.deepEqual(Object.values(g.scores).sort(),[-1,0,1]);assert.ok(turns<500);
});
test('turn transactions reject repeated stale actions and permit retry after failure',async()=>{
 const b=await load('babanuki'),g={pids:['a','b','c'],currentTurn:0,hands:{a:[card(3)],b:[card(4),card(5)],c:[joker]},finished:[],logs:[]};b.api.setState(g);await b.api.drawCard('b',0,g,{});await b.api.drawCard('b',1,g,{});assert.equal(b.writes.length,1);
 const s=await load('sevens'),sg=sevenState();s.api.setState(sg);s.failWrite();await s.api.playCard(card(6),sg,{});assert.equal(s.writes.length,0);s.failWrite(false);await Promise.all([s.api.playCard(card(6),sg,{}),s.api.playCard(card(8),sg,{})]);assert.equal(s.writes.length,1);
 assert.equal(s.ctx.GameSync.signature({empty:[],a:[1,2],obj:{}}),s.ctx.GameSync.signature({a:{0:1,1:2}}));
});
test('poker ready-for-rematch ignores prior game snapshots',async()=>{
 const s=await load('poker'),g={pids:['a','b'],phase:'roundResult',round:3,totalRounds:3,hands:{a:[],b:[]},scores:{a:0,b:0},roundResults:{}};s.api.setState(g);const room={host:'a',status:'playing',players:{a:{name:'A'},b:{name:'B'}},gameState:g};s.store.set('rooms_poker/TEST',room);await s.ctx._playAgain();await s.emit('rooms_poker/TEST',room);
 assert.equal(s.node('waitingScreen').style.display,'flex');assert.equal(s.node('gameScreen').style.display,'none');
});
test('room creation does not overwrite a code collision; joins enforce capacity atomically',async()=>{
 const s=await load('poker',{preview:true,lobby:true});s.store.set('rooms_poker/USED',{status:'waiting',players:{old:{name:'Old'}}});const codes=['USED','FREE'];
 const code=await s.ctx.GameSync.createRoom(s.ctx.runTransaction,c=>'rooms_poker/'+c,()=>codes.shift(),{status:'waiting',players:{host:{name:'Host'}}});assert.equal(code,'FREE');assert.equal(s.read('rooms_poker/USED').players.old.name,'Old');
 s.store.set('room',{status:'waiting',players:{a:{name:'A',index:0},b:{name:'B',index:1}}});await s.ctx.GameSync.joinRoom(s.ctx.runTransaction,'room','b','B2',2);assert.equal(s.read('room').players.b.name,'B2');
 await assert.rejects(()=>s.ctx.GameSync.joinRoom(s.ctx.runTransaction,'room','c','C',2),/満員/);assert.equal(Object.keys(s.read('room').players).length,2);
 s.store.set('playing',{status:'playing',players:{a:{name:'A',index:0}}});await assert.rejects(()=>s.ctx.GameSync.joinRoom(s.ctx.runTransaction,'playing','b','B',2),/ゲーム中/);
});
test('only the waiting-room host can start; stale start snapshots are rejected',async()=>{
 const configs=[
  {game:'babanuki',lobby:false,path:'rooms/TEST',minimum:2},
  {game:'sevens',lobby:false,path:'rooms_sevens/TEST',minimum:2},
  {game:'poker',lobby:false,path:'rooms_poker/TEST',minimum:2},
  {game:'daifugo',lobby:true,path:'rooms_daifugo/TEST',minimum:3},
 ];
 for(const cfg of configs){
  const s=await load(cfg.game,{lobby:cfg.lobby,pid:'a'});
  const players={a:{name:'A',index:0},b:{name:'B',index:1},c:{name:'C',index:2}};
  const room={host:'b',status:'waiting',players:Object.fromEntries(Object.entries(players).slice(0,cfg.minimum))};
  s.store.set(cfg.path,room);await s.ctx.hostStartGame();assert.equal(s.writes.length,0,`${cfg.game}: non-host start`);
  room.host='a';room.status='playing';s.store.set(cfg.path,room);await s.ctx.hostStartGame();assert.equal(s.writes.length,0,`${cfg.game}: already-playing start`);
  room.status='waiting';room.players={a:players.a};s.store.set(cfg.path,room);await s.ctx.hostStartGame();assert.equal(s.writes.length,0,`${cfg.game}: insufficient players`);
 }
 const b=await load('babanuki');
 const expected={host:'a',status:'waiting',players:{a:{name:'A',index:0},b:{name:'B',index:1}}};
 const changed={...expected,players:{...expected.players,c:{name:'C',index:2}}};
 b.store.set('rooms/TEST',changed);await b.api.startGame(expected);assert.equal(b.writes.length,0);assert.deepEqual(b.read('rooms/TEST'),changed);
});
test('shared player names, logs and image URLs are escaped before HTML rendering',async()=>{
 const s=await load('babanuki');const hostile='<img src=x onerror=alert(1)> & "quoted"';assert.equal(s.ctx.GameSync.escapeHtml(hostile),'&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;');
 await s.emit('rooms/TEST',{status:'waiting',players:{a:{name:hostile,index:0}}});const html=s.node('playerSlots').children[0].innerHTML;assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));
});

(async()=>{let failed=0;for(const t of tests){try{await t.fn();console.log('PASS',t.name);}catch(e){failed++;console.error('FAIL',t.name,'\n ',e.stack);}}console.log(`${tests.length-failed}/${tests.length} mini-game offline groups passed`);process.exitCode=failed?1:0;})();

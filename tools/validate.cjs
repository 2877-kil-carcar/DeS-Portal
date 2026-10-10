const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const C=require('../assets/core.js');
const D=JSON.parse(fs.readFileSync(path.join(root,'wos_rally_joiner_gen1-8.json'),'utf8'));
let count=0;
function test(label,fn){fn();count++;console.log('PASS',label);}
const heroes=D.heroes;
test('33 heroes / 91 skills / 33 primaries',()=>{
 assert.equal(heroes.length,33);assert.equal(heroes.flatMap(h=>h.skills).length,91);assert.equal(heroes.flatMap(h=>h.skills).filter(s=>s.isPrimary).length,33);
 assert.equal(heroes.filter(h=>h.rarity==='SR').length,8);assert.equal(heroes.filter(h=>h.rarity==='SSR').length,25);
 assert.equal(heroes.some(h=>h.id==='gina'),false);assert.equal(new Set(heroes.map(h=>h.id)).size,33);
 for(let gen=1;gen<=8;gen++)assert.equal(heroes.filter(h=>h.generation===gen&&h.rarity==='SSR').length,gen===1?4:3);
});
test('names and required fields',()=>{
 assert.equal(heroes.find(h=>h.id==='ling-xue').name,'リンセツ');assert.equal(heroes.find(h=>h.id==='lumak-bokan').name,'ルム・ボーガン');
 const keys=new Set([...Object.keys(D.slotDefinitions),...Object.keys(D.extendedSlotDefinitions)]);
 for(const h of heroes){assert.ok(h.sources.length>=2);assert.ok(h.stacking.label);assert.ok(h.recommendations.attack.positive);assert.ok(h.recommendations.defense.caution);assert.equal(h.stacking.pvpVerified,false);assert.equal(h.stacking.exactFormula,null);assert.equal(h.stacking.bearModel,undefined);
  h.skills.forEach((s,i)=>{assert.equal(s.number,i+1);assert.equal(s.isPrimary,i===0);assert.ok(s.target&&s.condition&&s.effect);assert.ok(s.trigger.type&&s.trigger.detail);assert.ok(s.slots.length);assert.ok(s.components.length);assert.ok(s.slots.every(k=>keys.has(k)));assert.ok(s.levelValues.every(v=>!v.scale.startsWith('100% / 2%')));});
 }
});
test('Wayne crit separated; bear model removed from PvP',()=>{
 const w=heroes.find(h=>h.id==='wayne');assert.deepEqual(w.skills[2].slots,['CRIT']);assert.equal(w.skills[2].trigger.type,'critical');assert.equal(w.skills[2].trigger.probabilityByLevel.at(-1),25);
 for(const id of ['jessie','jasser','jeronimo'])assert.deepEqual(heroes.find(h=>h.id===id).skills[0].slots,['A']);
 assert.equal(heroes.find(h=>h.id==='renee').skills[0].slots[0],'S');
 for(const h of heroes)for(const s of h.skills){assert.equal(s.model,undefined);assert.equal(s.mechanicsVerified,false);assert.deepEqual(s.slots,s.descriptionSlots);}
 assert.equal(C.normalizeState({purpose:'bear',basis:'model',frame:'M'},heroes).purpose,'attack');assert.equal(C.normalizeState({frame:'M'},heroes).frame,'');
});
test('invalid stored state is normalized and future heroes removed',()=>{
 for(const bad of [null,[],0,'x',{}, {generation:-1,leaders:['gatot','sonya','hendrik'],joiners:['wayne','fake']}]){
  const s=C.normalizeState(bad,heroes);assert.ok(s.generation>=1&&s.generation<=8);assert.equal(s.leaders.length,3);assert.equal(s.joiners.length,4);
 }
 const s=C.normalizeState({generation:3,leaders:['edith','gordon','bradley'],joiners:['wayne','jessie','','']},heroes);
 assert.deepEqual(s.leaders,['','','']);assert.deepEqual(s.joiners,['','jessie','','']);
 const wrong=C.normalizeState({generation:8,leaders:['sonya','hendrik','gatot']},heroes);assert.deepEqual(wrong.leaders,['','','']);
});
test('generation / search / aliases / troop / trigger / skill mode filters',()=>{
 let s=C.normalizeState({generation:1},heroes);assert.equal(C.filterHeroes(heroes,s).length,12);
 s=C.normalizeState({generation:8,search:'ウェイン'},heroes);assert.equal(C.filterHeroes(heroes,s)[0].id,'wayne');
 s.search='リンソウ';assert.equal(C.filterHeroes(heroes,s)[0].name,'リンセツ');
 s.search='';s.troop='lancer';assert.ok(C.filterHeroes(heroes,s).every(h=>h.troopType==='lancer'));
 s.troop='all';s.trigger='periodic';assert.ok(C.filterHeroes(heroes,s).some(h=>h.id==='wayne'));
 s=C.normalizeState({mode:'primary',frame:'S+'},heroes);assert.equal(C.filterHeroes(heroes,s).length,0);
 s.mode='all';assert.ok(C.filterHeroes(heroes,s).some(h=>h.id==='wu-ming'));
});
test('leader frame union and classification basis',()=>{
 let s=C.normalizeState({leaders:['edith','gordon','bradley']},heroes);
 const f=C.leaderFrames(s,heroes);assert.ok(f.size>3);assert.equal(f.has('M'),false);
 const j=heroes.find(h=>h.id==='jasser').skills[0];assert.deepEqual(C.slots(j),['A']);assert.deepEqual(C.slots(j,'description'),['A']);
});
test('simultaneous mutual destruction; no cancellation of retaliation',()=>{
 const r=C.resolveRound([1,0,0],[1,0,0],100);assert.deepEqual(r.left,[0,0,0]);assert.deepEqual(r.right,[0,0,0]);
 const r2=C.resolveRound([100,100,100],[100,100,100],12);assert.deepEqual(r2.left,r2.right);assert.equal(r2.left[0],64);
});
test('frontline targeting, bounds and side symmetry',()=>{
 const r=C.resolveRound([0,100,50],[100,0,30],12);assert.equal(r.targetA,1);assert.equal(r.targetB,0);assert.equal(r.left[2],50);assert.equal(r.right[2],30);
 const swapped=C.resolveRound([100,0,30],[0,100,50],12);assert.deepEqual(r.left,swapped.right);assert.deepEqual(r.right,swapped.left);
 const empty=C.resolveRound([0,0,0],[1,2,3],12);assert.deepEqual(empty.right,[1,2,3]);
 const bounded=C.resolveRound([-1,1,0],[2000,0,0],100);assert.ok(bounded.left.every(v=>v>=0));assert.ok(bounded.right.every(v=>v<=1500));
});
test('data.js matches JSON and standalone embeds same data',()=>{
 const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/data.js'),'utf8'),context);
 assert.equal(JSON.stringify(context.window.WOS_DATA),JSON.stringify(D));
 const html=fs.readFileSync(path.join(root,'standalone.html'),'utf8');assert.ok(!html.includes('src="./assets/'));assert.ok(!html.includes('href="./assets/'));
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);assert.equal(scripts.length,4);scripts.forEach(s=>new vm.Script(s));
 assert.ok(html.indexOf('window.WOS_DATA =')>html.indexOf('<dialog'));
});
test('static shell ids unique and resource references exist',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 for(const f of ['assets/app.css','assets/core.js','assets/app.js','assets/data.js'])assert.ok(fs.existsSync(path.join(root,f)));
  for(const id of ['view-joiners','view-library','view-notes','view-battle','view-sources','view-bear','view-canyon','view-gallery','view-games','view-redeem','mobile-dock'])assert.ok(ids.includes(id));
 new vm.Script(fs.readFileSync(path.join(root,'assets/app.js'),'utf8'));
 assert.equal(html.includes('http://'),false);
});
console.log(`${count} test groups passed`);

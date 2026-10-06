const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const P=require('../apps/bear/js/placement-core.js');
let groups=0;
function test(name,fn){fn();groups++;console.log('PASS',name);}
test('rejected move preserves original placement',()=>{
 const objects=[{type:'player',memberId:'a',x:5,y:5,size:2},{type:'trap',x:10,y:10,size:3}];
 const before=JSON.stringify(objects);
 assert.throws(()=>P.planPlacement(objects,'player','a',{x:10,y:11}),/重な/);
 assert.throws(()=>P.planPlacement(objects,'player','a',{x:47,y:26}),/マップ/);
 assert.throws(()=>P.planPlacement(objects,'player','a',{x:1,y:1}),/マップ/);
 assert.equal(JSON.stringify(objects),before);
 const valid=P.planPlacement(objects,'player','a',{x:20,y:21});assert.equal(valid.previous,objects[0]);assert.equal(valid.next.y,20);assert.equal(JSON.stringify(objects),before);
});
test('layout limits, member and coordinate validation',()=>{
 const traps=[{type:'trap',x:2,y:2,size:3},{type:'trap',x:10,y:10,size:3}];
 assert.throws(()=>P.planPlacement(traps,'trap',null,{x:20,y:20}),/2つ/);
 assert.throws(()=>P.planPlacement([{type:'base',x:2,y:2,size:3}],'base',null,{x:20,y:20}),/1つ/);
 assert.throws(()=>P.planPlacement([],'player','',{x:5,y:5}),/同盟員/);
 assert.throws(()=>P.planPlacement([],'fake',null,{x:5,y:5}),/不正/);
 assert.throws(()=>P.planPlacement([],'flag',null,{x:NaN,y:5}),/不正/);
 assert.equal(P.planPlacement([],'flag',null,{x:47,y:26}).next.x,47);
 assert.equal(P.planPlacement([],'player','a',{x:46,y:26}).next.y,25);
});
test('an existing facility can be moved without becoming a duplicate',()=>{
 const first={type:'trap',x:2,y:2,size:3},second={type:'trap',x:10,y:10,size:3},objects=[first,second];
 const plan=P.planPlacement(objects,'trap',null,{x:20,y:20},48,27,first);
 assert.equal(plan.previous,first);assert.equal(plan.next.x,20);assert.equal(plan.next.y,18);
 assert.equal(objects.length,2);
});
test('all inline and local scripts parse without executing remote services',()=>{
 let scripts=0,htmls=0;
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(/\.(html|js)$/.test(file)){
   const content=fs.readFileSync(file,'utf8');
   if(file.endsWith('.js')){const isModule=/^\s*(import\s|export\s)/m.test(content);if(isModule)new vm.SourceTextModule(content,{identifier:file});else new vm.Script(content,{filename:file});scripts++;}
   else{htmls++;for(const m of content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc\s*=/.test(m[1])||!m[2].trim())continue;if(/type=["']module["']/.test(m[1]))new vm.SourceTextModule(m[2],{identifier:file});else if(!/type=["'](?:application\/ld\+json|application\/json)/.test(m[1]))new vm.Script(m[2],{filename:file});scripts++;}}
 }} }
 walk(path.join(root,'apps'));console.log('Checked',htmls,'HTML files and',scripts,'scripts');
});
test('local static HTML references resolve',()=>{
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else if(e.name.endsWith('.html')){
  const html=fs.readFileSync(file,'utf8').replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi,'$1</script>');
  for(const tag of html.matchAll(/<(?:a|script|link|img|video|source)\b[^>]*>/gi))for(const attr of tag[0].matchAll(/\b(?:href|src|poster)=["']([^"']+)["']/gi)){
   const value=attr[1];if(/^(?:[a-z]+:|\/\/|#)/i.test(value)||value.includes('${')||value.includes('{'))continue;
   const relative=decodeURIComponent(value.split(/[?#]/)[0]);if(!relative)continue;
   assert.ok(fs.existsSync(path.resolve(path.dirname(file),relative)),path.relative(root,file)+' -> '+relative);
  }
 }}}
 walk(path.join(root,'apps'));
});
test('shell source IDs and dynamic element targets',()=>{
 const app=fs.readFileSync(path.join(root,'assets/app.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),css=fs.readFileSync(path.join(root,'assets/app.css'),'utf8');
 const data=JSON.parse(fs.readFileSync(path.join(root,'wos_rally_joiner_gen1-8.json'),'utf8'));
 const ids=new Set(data.sources.map(s=>s.id));
 for(const m of app.matchAll(/cite\('([^']+)'\)/g))assert.ok(ids.has(m[1]),m[1]);
 for(const h of data.heroes)for(const id of h.stacking.sourceIds)assert.ok(ids.has(id),id);
 for(const m of app.matchAll(/\$\('([\w-]+)'\)/g))assert.ok((html+app).includes('id="'+m[1]+'"'),m[1]);
 assert.ok(!app.includes('bearModel'));assert.ok(!app.includes('s.model.fields'));assert.ok(!html.includes('data-purpose="bear"'));
});
test('preview gates and atomic relocation preserved',()=>{
 const read=f=>fs.readFileSync(path.join(root,f),'utf8');
 const bear=read('apps/bear/js/app.js');assert.ok(bear.includes('const plan = window.WOS_PLACEMENT.planPlacement'));assert.ok(bear.includes('await commitPlan(plan)'));assert.ok(bear.includes('batch.delete'));assert.ok(bear.includes('await batch.commit()'));
 const bearHtml=read('apps/bear/index.html');for(const id of ['focusTrap','findMember','mapAll','modeBadge','placementTray','confirmPlacement','selectionSummary','memberSearch'])assert.ok(bearHtml.includes('id="'+id+'"'),id);
 for(const tab of ['unplaced','placed','facilities'])assert.ok(bearHtml.includes('data-tab="'+tab+'"'),tab);
 assert.ok(read('apps/bear/js/firebase.js').includes('PREVIEW'));assert.match(bear,/if\s*\(PREVIEW\)/);
 for(const name of ['babanuki','sevens','poker','daifugo'])for(const suffix of ['', '-game'])assert.ok(read('apps/games/'+name+suffix+'.html').includes('対戦は無効'));
 const gallery=read('apps/gallery/index.html');assert.ok(gallery.includes('safeImageUrl'));assert.ok(!gallery.includes('<div class="game-banner">'));
 assert.ok(read('apps/canyon/index.html').includes('toc-search'));assert.ok(read('apps/bridge.js').includes('wos:visibility'));
});
test('bear member UI omits furnace data and uses the expanded mobile sheet',()=>{
 const read=f=>fs.readFileSync(path.join(root,f),'utf8');
 const files=['apps/bear/index.html','apps/bear/members.html','apps/bear/js/app.js','apps/bear/js/ui.js','apps/bear/js/members.js','apps/bear/css/style.css'];
 const combined=files.map(read).join('\n');
 assert.ok(!/furnace|溶鉱炉|FC\d|goBack/.test(combined));
 assert.ok(!read('apps/bear/members.html').includes('>戻る<'));
 assert.ok(read('apps/bear/css/mobile.css').includes('height: calc(100dvh - 6px)'));
});
test('gift code, gallery and forms lead navigation without changing default module',()=>{
 const app=fs.readFileSync(path.join(root,'assets/app.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),css=fs.readFileSync(path.join(root,'assets/app.css'),'utf8');
 assert.ok(app.includes("navigationModules=window.WOS_STANDALONE?modules:[modules.find(m=>m.id==='redeem'),modules.find(m=>m.id==='gallery'),modules.find(m=>m.id==='forms')"));
 assert.ok(app.includes("['redeem','gallery','forms','bear']"));
 assert.ok(app.includes("let state = C.normalizeState(saved, heroes), currentView = 'joiners'"));
 assert.ok(html.includes('brand-name">DeS</span><span class="brand-row"><span class="brand-mark"'));assert.ok(html.includes('brand-title">ポータル'));assert.ok(html.includes('<div class="nav-label">メニュー</div>'));assert.ok(fs.existsSync(path.join(root,'assets/pepper-portal.jpg')));
 assert.ok(css.includes('.brand{width:100%;padding:0 3px;gap:9px;flex-direction:column'));assert.ok(css.includes('.brand-name{display:block;width:100%;text-align:center'));assert.ok(css.includes('font-size:82px'));assert.ok(css.includes('.brand-row{display:flex;align-items:center;gap:9px'));assert.ok(css.includes('.brand-title{display:block;line-height:1.15;font-size:26px'));assert.ok(css.includes('.brand-mark{width:70px;height:78px;flex:0 0 70px'));assert.ok(css.includes('.brand-mark::before'));
});
console.log(groups+' hub test groups passed (static/unit only; not browser E2E)');

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
test('cropped bear map accepts only X416 through X453',()=>{
 const bounds=[48,27,null,5,42];
 assert.throws(()=>P.planPlacement([],'flag',null,{x:4,y:10},...bounds),/マップ/);
 assert.equal(P.planPlacement([],'flag',null,{x:5,y:10},...bounds).next.x,5);
 assert.equal(P.planPlacement([],'flag',null,{x:42,y:10},...bounds).next.x,42);
 assert.throws(()=>P.planPlacement([],'flag',null,{x:43,y:10},...bounds),/マップ/);
 assert.equal(P.planPlacement([],'player','a',{x:41,y:10},...bounds).next.x,41);
 assert.throws(()=>P.planPlacement([],'player','a',{x:42,y:10},...bounds),/マップ/);
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
 assert.ok(read('apps/bear/members.html').includes('id="memberBackLink"'));
 assert.ok(read('apps/bear/members.html').includes('← 戻る'));
 assert.ok(read('apps/bear/css/style.css').includes('white-space: nowrap'));
 assert.ok(read('apps/bear/css/mobile.css').includes('height: calc(100dvh - 6px)'));
 assert.ok(read('apps/bear/js/members.js').includes('登録済み候補 · 選択すると更新'));
 assert.ok(read('apps/bear/css/style.css').includes('#nameDropdown.show { display: block; }'));
 assert.ok(read('apps/bear/css/style.css').includes('max-height: min(42dvh, 320px)'));
 assert.ok(read('apps/bear/js/data.js').includes('GRID_MIN_X = 5'));
 assert.ok(read('apps/bear/js/data.js').includes('GRID_MAX_X = 42'));
});
test('bear alliance tabs isolate DeS and GeM data',()=>{
 const read=f=>fs.readFileSync(path.join(root,f),'utf8');
 const alliance=read('apps/bear/js/alliance.js');
 const bear=read('apps/bear/js/app.js');
 const members=read('apps/bear/js/members.js');
 for(const html of [read('apps/bear/index.html'),read('apps/bear/members.html')])assert.ok(html.includes('id="allianceTabs"'));
 assert.ok(alliance.includes('objectsCollection: "objects"'));
 assert.ok(alliance.includes('membersCollection: "members"'));
 assert.ok(alliance.includes('objectsCollection: "gemObjects"'));
 assert.ok(alliance.includes('membersCollection: "gemMembers"'));
 assert.ok(alliance.includes('currentParams.get("alliance") || "des"'));
 assert.ok(bear.includes('collection(db, allianceConfig.objectsCollection)'));
 assert.ok(bear.includes('collection(db, allianceConfig.membersCollection)'));
 assert.ok(members.includes('collection(db, allianceConfig.membersCollection)'));
 assert.ok(members.includes('doc(db, allianceConfig.membersCollection'));
});
test('GeM map range is shared, bounded and stored in world coordinates',()=>{
 const read=f=>fs.readFileSync(path.join(root,f),'utf8');
 const config=read('apps/bear/js/map-config.js');
 const bear=read('apps/bear/js/app.js');
 const html=read('apps/bear/index.html');
 assert.ok(config.includes('width > 100 || height > 100'));
 assert.ok(config.includes('stored.mapX = worldX(object.x)'));
 assert.ok(config.includes('stored.mapY = worldY(object.y + object.size - 1)'));
 assert.ok(config.includes('object.mapX = 411 + object.x'));
 assert.ok(config.includes('objectFitsMap'));
 assert.ok(bear.includes('doc(db, allianceConfig.settingsCollection, "map")'));
 assert.ok(bear.includes('範囲外になる配置が'));
 assert.ok(bear.includes('grid.style.gridTemplateColumns'));
 for(const id of ['mapSettingsBtn','mapSettingsDialog','mapMinX','mapMaxX','mapMinY','mapMaxY'])assert.ok(html.includes('id="'+id+'"'),id);
});
test('bear admin passwords and sessions are isolated per alliance',()=>{
 const read=f=>fs.readFileSync(path.join(root,f),'utf8');
 const bear=read('apps/bear/js/app.js');
 const members=read('apps/bear/js/members.js');
 assert.ok(bear.includes('allianceConfig.key === "gem" ? "gem" : "des"'));
 assert.ok(bear.includes('`adminApproved:${allianceConfig.key}`'));
 assert.ok(!bear.includes('sessionStorage.setItem("adminApproved"'));
 assert.ok(members.includes('sessionStorage.getItem(`adminApproved:${allianceConfig.key}`)'));
});
test('gift code, gallery and forms lead navigation without changing default module',()=>{
 const app=fs.readFileSync(path.join(root,'assets/app.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),css=fs.readFileSync(path.join(root,'assets/app.css'),'utf8');
 assert.ok(app.includes("const primaryNavigationIds = ['redeem', 'gallery', 'forms', 'bear', 'games', 'formation', 'svs']"));
 assert.ok(app.includes('primaryNavigationIds.map(id=>modules.find(m=>m.id===id))'));
 assert.ok(app.includes("['redeem','gallery','forms','bear']"));
 assert.ok(app.includes("let state = C.normalizeState(saved, heroes), currentView = 'redeem'"));
 assert.ok(html.includes('brand-name">DeS</span><span class="brand-row"><span class="brand-mark"'));assert.ok(html.includes('brand-title">ポータル'));assert.ok(html.includes('<div class="nav-label">メニュー</div>'));assert.ok(fs.existsSync(path.join(root,'assets/pepper-portal.jpg')));
 assert.ok(!html.includes('非公式の同盟ツール集'));assert.ok(!html.includes('id="save-status"'));assert.ok(!app.includes('この端末に保存済み'));
  assert.ok(css.includes('.brand{width:100%;padding:0 3px;gap:9px;flex-direction:column'));assert.ok(css.includes('.brand-name{display:block;width:100%;text-align:center'));assert.ok(css.includes('font-size:82px'));assert.ok(css.includes('.brand-row{display:flex;align-items:center;gap:9px'));assert.ok(css.includes('.brand-title{display:block;line-height:1.15;font-size:26px'));assert.ok(css.includes('.brand-mark{width:70px;height:78px;flex:0 0 70px'));assert.ok(css.includes('.brand-mark::before'));
});
test('battle and canyon are grouped in the final notebook menu',()=>{
 const app=fs.readFileSync(path.join(root,'assets/app.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(app.includes("id: 'battle'")&&app.includes("label: '戦闘ターン'")&&app.includes('memoOnly:true'));
 assert.ok(app.includes("id: 'canyon'")&&app.includes("label:'峡谷合戦'")&&app.includes('memoOnly:true'));
 assert.ok(app.includes("id: 'rally-skills'")&&app.includes("label: '強化元と右上スキル'")&&app.includes('memoOnly:true'));
 assert.ok(app.includes("id: 'mia-stacking'")&&app.includes("label: 'ミア「不幸の連鎖」の重複'")&&app.includes('memoOnly:true'));
 assert.ok(app.includes("id: 'ahmose-stacking'")&&app.includes("label: 'アクモス「マムシ方陣」の重複'")&&app.includes('memoOnly:true'));
 assert.ok(app.includes("id: 'stamina-routine'")&&app.includes("label: '領主体力の理想ルート'")&&app.includes('memoOnly:true'));
 assert.ok(app.includes("id: 'joiner-comparison'")&&app.includes("label: 'レイナ・ジェシー・グエン比較'")&&app.includes('memoOnly:true'));
 assert.ok(app.includes("id: 'fortress-rules'")&&app.includes("label: '砦・要塞の申請ルール'")&&app.includes('memoOnly:true'));
 assert.ok(app.includes("id: 'damage-buff-comparison'")&&app.includes("label: '与ダメ上昇と被ダメ上昇'")&&app.includes('memoOnly:true'));
 assert.ok(app.includes("id: 'tourism-theater'")&&app.includes("label: '観光シアター攻略'")&&app.includes('memoOnly:true'));
 assert.ok(app.includes("id: 'notes', label:'かるろすのメモ帳'"));
 assert.ok(app.includes('.filter(m=>!m.memoOnly)'));
assert.ok(html.includes('id="view-notes"'));assert.ok(html.includes('href="#battle"'));assert.ok(html.includes('href="#canyon"'));assert.ok(html.includes('href="#rally-skills"'));assert.ok(html.includes('id="view-rally-skills"'));assert.ok(html.includes('href="#mia-stacking"'));assert.ok(html.includes('id="view-mia-stacking"'));assert.ok(html.includes('href="#ahmose-stacking"'));assert.ok(html.includes('id="view-ahmose-stacking"'));assert.ok(html.includes('href="#stamina-routine"'));assert.ok(html.includes('id="view-stamina-routine"'));assert.ok(html.includes('href="#joiner-comparison"'));assert.ok(html.includes('id="view-joiner-comparison"'));assert.ok(html.includes('href="#fortress-rules"'));assert.ok(html.includes('id="view-fortress-rules"'));assert.ok(html.includes('href="#damage-buff-comparison"'));assert.ok(html.includes('id="view-damage-buff-comparison"'));assert.ok(html.includes('href="#tourism-theater"'));assert.ok(html.includes('id="view-tourism-theater"'));
for(const text of ['ミアの遠征スキル「不幸の連鎖」重複について','同時に発動しても“最後の1件だけ”が有効','ミア4人：発動率93.75%（1−0.5⁴）、効果＋50%','ミアは1人で効果MAX。ただし人数を増やせば発動が安定する。','グレッグ／ローガン／フリント']) assert.ok(html.includes(text),text);
 for(const text of ['アクモスの遠征スキル「マムシ方陣」重複について','盾兵の被ダメージ -70%（2ターン）','Ahmose for example doesn\'t stack','発動回数は増えても、効果量は1人分だけ。','アクモスは1人で完成。複数入れても軽減は増えない。']) assert.ok(html.includes(text),text);
 for(const text of ['領主体力の理想的な使い方','専門家アグネスがいると獲得倉庫体力と灯台出現量が変わるためそこは考慮していません','ジーナ編成だけで自然回復6時間分の体力を節約！','巨獣10回集結の発起者特別報酬をここで達成！','体力缶詰ゼロでもOK！']) assert.ok(html.includes(text),text);
 for(const file of ['assets/stamina-reward-detail.jpg','assets/stamina-reward-rules.jpg']) assert.ok(fs.existsSync(path.join(root,file)),file);
 for(const text of ['乗り手比較：レイナ vs ジェシー vs グエン','ジェシー4人の方が総ダメが高くなる','熊罠に関してはレイナの方が圧倒的にダメージが高い','グエンは非推奨。','全ステータスがダメージポイントの計算対象','ジェシーよりレイナを乗り手採用した方がダメージは増える傾向']) assert.ok(html.includes(text),text);
 for(const text of ['砦・要塞の申請ルール　2856版','前週占領している場所＋新規1ヶ所','3号要塞（自動申請）','戦闘なしで占領になります。','木曜日 朝9時までに申請','全同盟 占領0からスタート','申請できるのは<strong>最大3ヶ所</strong>','サーバールールに沿って事前に共有・相談しましょう。']) assert.ok(html.includes(text),text);
 for(const text of ['与ダメ上昇 vs 被ダメ上昇（遠征スキル）まとめ','単体性能はほぼ同格（25% vs 25%）','与ダメ＝人数分伸びる','主力に被ダメがいるなら、ジョイナーに被ダメは不要','被ダメ1＋与ダメ3','被ダメは1枠前提で運用するのが正解']) assert.ok(html.includes(text),text);
 for(const text of ['観光シアター攻略（コイン重視）','コイン獲得を最優先','保護探索5回','500 × 8 =','第4階層へ進める可能性','階層が上昇したら、その時点でコイン回収','アップデートや仕様変更によって最適な立ち回りが変わる可能性があります。']) assert.ok(html.includes(text),text);
 assert.equal((html.match(/href="#notes"/g)||[]).length,10);
 for(const text of ['強化元は集結主（1番上の人）！','駐屯の強化元は「並び順」じゃなくて「ステータス」で決まる！','対象：2・3・5・6','Lv5が4人いないときは、Lv4でも対象になる！','フレンダー・ジンマン・他全員ジェシーで乗って！','事前の調整は必須！'])assert.ok(html.includes(text),text);
});
console.log(groups+' hub test groups passed (static/unit only; not browser E2E)');

(() => {
  'use strict';
  const data = window.WOS_DATA, C = window.WOS_CORE;
  const heroes = data.heroes, byId = new Map(heroes.map(h => [h.id, h]));
  const frames = { ...data.slotDefinitions, ...data.extendedSlotDefinitions };
  const troopNames = { infantry: '盾兵', lancer: '槍兵', marksman: '弓兵' };
  const symbols = { infantry: '♜', lancer: '⚑', marksman: '➶' };
  const source = id => data.sources.find(s => s.id === id);
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const link = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
  const cite = id => {const s=source(id);return s?link(s.url,s.name):'出典未登録';};
  const storageKey = 'wos-toolbox.v2';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (_) { /* File/private mode can block persistence. */ }
  let state = C.normalizeState(saved, heroes), currentView = 'redeem';
  let toastTimer;
  const modules = [
    { id: 'battle', label: '戦闘ターン', icon: '⇄', eyebrow: 'COMBAT FIELD NOTES', title: '1ターンの、その中へ。', subtitle: '両軍が同時に動く仕組みを、ステップで確かめる。' },
    { id: 'sources', label: '出典・検証', icon: '◎', eyebrow: 'RESEARCH LOG', title: '根拠から、確かめる。', subtitle: '公式ルール・採用した本文・未確認事項を分けて記録。' },
    { id: 'bear', label:'熊罠配置', icon:'▦', path:'./apps/bear/index.html?v=3.30', title:'熊罠配置', eyebrow:'ALLIANCE LAYOUT', subtitle:'同盟の配置を確認・調整' },
    { id: 'canyon', label:'峡谷合戦', icon:'△', path:'./apps/canyon/index.html', title:'峡谷合戦', eyebrow:'CANYON CLASH', subtitle:'42レッスンの攻略ガイド' },
    { id: 'gallery', label:'もふもふギャラリー', icon:'♧', path:'./apps/gallery/index.html', title:'もふもふギャラリー', eyebrow:'THE FLUFFY HALL', subtitle:'同盟のもふもふコレクション' },
    { id: 'games', label:'ミニゲーム', icon:'♠', path:'./apps/games/index.html?v=3.30', title:'ミニゲーム', eyebrow:'PLAY TOGETHER', subtitle:'みんなで楽しむカードゲーム' },
    { id: 'formation', label:'編成ツール', icon:'◫', path:'https://wos.henseiradar.com/', title:'編成ツール', eyebrow:'FORMATION RADAR', subtitle:'英雄・兵士の編成を確認' },
    { id: 'svs', label:'2856SvS補助ツール', icon:'⚑', path:'./apps/svs/index.html', title:'2856SvS補助ツール', eyebrow:'SVS OPERATIONS', subtitle:'参加管理・集結設定・振り分け・カウントアップ' },
    { id: 'forms', label:'申請フォーム一覧', icon:'▧', path:'./apps/forms/index.html?v=3.27', title:'申請フォーム一覧', eyebrow:'APPLICATION DESK', subtitle:'各種申請・スプレッドシート・端末メモ' },
    { id: 'redeem', label:'ギフトコード', icon:'◇', path:'./apps/redeem/index.html?v=3.27', title:'ギフトコード', eyebrow:'GIFT CODE REDEMPTION', subtitle:'登録と履歴を共有・まとめて交換' }
  ].filter(m => !window.WOS_STANDALONE || !m.path);
  const primaryNavigationIds = ['redeem', 'gallery', 'forms', 'bear', 'games', 'formation'];
  const navigationModules=window.WOS_STANDALONE?modules:[...primaryNavigationIds.map(id=>modules.find(m=>m.id===id)),...modules.filter(m=>!primaryNavigationIds.includes(m.id))];
  const moduleFrames = new Map();
  const previewMode = new URLSearchParams(location.search).get('preview') === '1';
  let gamePath = '', navigationLock = false;
  function panelVisibility(id, active) {
    const frame = moduleFrames.get(id);
    if (!frame) return;
    const frameOrigin = new URL(frame.src, location.href).origin;
    if (location.origin !== 'null' && frameOrigin !== location.origin) return;
    frame.contentWindow?.postMessage({type:'wos:visibility',active},location.origin==='null'?'*':location.origin);
  }
  function mountModule(m) {
    if (!m.path || moduleFrames.has(m.id)) return;
    const panel=$('view-'+m.id), frame=document.createElement('iframe');
    frame.title=m.label;frame.className='module-frame';frame.setAttribute('referrerpolicy','same-origin');
    const url=new URL(m.path,location.href);if(previewMode&&url.origin===location.origin)url.searchParams.set('preview','1');frame.src=url.href;
    frame.addEventListener('load',()=>{panel.querySelector('.embed-loading').hidden=true;panelVisibility(m.id,currentView===m.id);});
    moduleFrames.set(m.id,frame);panel.append(frame);
  }
  addEventListener('message',event=>{
    if(location.origin!=='null'&&event.origin!==location.origin)return;
    const record=[...moduleFrames.entries()].find(([,frame])=>frame.contentWindow===event.source);
    if(!record||event.data?.type!=='wos:ready')return;
    if(record[0]==='games')gamePath=String(event.data.path||'');
    panelVisibility(record[0],currentView===record[0]);
  });
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); $('save-status').textContent = 'この端末に保存済み'; }
    catch (_) { $('save-status').textContent = 'この環境では保存できません（操作は可能）'; }
  }
  function toast(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3400);
  }
  function tag(text, cls = '') { return `<span class="tag ${cls}">${esc(text)}</span>`; }
  function ratingClass(rating) { return rating === '候補' ? 'good' : rating === '要検証' ? 'amber' : ''; }
  function evidenceTag(s) {
    return s.evidence.status === 'published-description' ? '' : tag(s.evidence.label, 'amber');
  }
  function skillEvidence(s) {
    const e = s.evidence;
    return '<details class="evidence-detail"><summary>採用元と根拠 — '+esc(e.label)+'</summary>'+
      '<dl class="data-list"><dt>優先した本文</dt><dd>'+link(e.adoptedSourceUrl,e.adoptedSourceName)+'</dd><dt>採用理由</dt><dd>'+esc(e.adoptionReason)+'</dd><dt>資料確認日</dt><dd>'+esc(e.sourceCheckedAt)+'（全資料の再取得日ではありません）</dd><dt>内部処理</dt><dd>'+esc(e.mechanicsStatus)+'</dd></dl>'+
      '<div class="source-links">'+s.sourceUrls.map(u=>link(u,new URL(u).hostname)).join(' ')+'</div></details>';
  }
  function activeSkills(h) { return state.mode === 'primary' ? h.skills.filter(s => s.isPrimary) : h.skills; }
  function slotChips(skill, used = C.leaderFrames(state, heroes)) {
    return C.slots(skill, state.basis).map(k => `<span class="slot-label ${used.has(k) ? 'used' : ''}" title="${esc(frames[k])}"><b>${esc(k)}</b> ${esc(frames[k])}</span>`).join('');
  }
  const heroOption = h => `<option value="${h.id}">${esc(h.name)} · G${h.generation} ${h.rarity}</option>`;
  const available = () => heroes.filter(h => h.generation <= state.generation);
  function renderSetup() {
    $('generation').value = state.generation;
    $('leader-pickers').innerHTML = C.troops.map((t, i) => {
      const h = byId.get(state.leaders[i]);
      return `<div class="leader-picker ${t}"><label class="picker-top" for="leader-${i}"><span class="troop-icon">${symbols[t]}</span>${troopNames[t]}</label><select id="leader-${i}" data-leader="${i}" aria-label="集結主 ${troopNames[t]}"><option value="">未選択</option>${available().filter(x => x.troopType === t).sort((a,b) => b.generation-a.generation).map(heroOption).join('')}</select><small>${h ? `${h.rarity} · 第${h.generation}世代 · ${h.skills.length}スキル` : '英雄を選択'}</small></div>`;
    }).join('');
    state.leaders.forEach((id, i) => { $(`leader-${i}`).value = id; });
    $('joiner-pickers').innerHTML = state.joiners.map((id, i) => `<div class="joiner-slot"><label for="joiner-${i}">JOINER 0${i+1}</label><select id="joiner-${i}" data-joiner="${i}"><option value="">候補を追加</option>${available().map(heroOption).join('')}</select></div>`).join('');
    state.joiners.forEach((id, i) => { $(`joiner-${i}`).value = id; });
    $('purpose-buttons').querySelectorAll('button').forEach(b => { const on = b.dataset.purpose === state.purpose; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
    $('mode-buttons').querySelectorAll('button').forEach(b => { const on = b.dataset.mode === state.mode; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
    $('purpose-hint').textContent = state.purpose === 'attack' ? '攻撃集結：火力と前線維持の両方を比較。役割評価は公開本文からの推論で、最適順位ではありません。' : '駐屯防衛：生存だけでなく敵を減らす速度も比較。相手・兵種・スキルLvで選択が変わります。';
    $('search').value = state.search; $('troop-filter').value = state.troop; $('trigger-filter').value = state.trigger;
  }
  function renderFrames() {
    const used = C.leaderFrames(state, heroes);
    $('frame-board').innerHTML = Object.entries(frames).map(([id, label]) => `<button class="frame-chip ${used.has(id) ? 'used' : ''} ${state.frame === id ? 'selected' : ''}" data-frame="${esc(id)}" aria-pressed="${state.frame === id}" title="${esc(label)}で絞り込み"><b>${esc(id)}</b><span>${esc(label)}</span></button>`).join('');
    $('leader-count').textContent = `${state.leaders.filter(Boolean).length}/3体 · 説明文による分類・内部式未確定`;
  }
  function renderComparison() {
    const selected=state.joiners.filter(Boolean);
    if(!selected.length){$('comparison-notes').textContent='カードの「＋ 比較」から最大4体を追加できます。実際の参加スキル採用順を再現する機能ではありません。';return;}
    const used=C.leaderFrames(state,heroes),seen=new Set(state.leaders.filter(Boolean));
    $('comparison-notes').innerHTML=selected.map(id=>{
      const h=byId.get(id),first=h.skills[0],overlap=C.slots(first).filter(k=>used.has(k)),duplicate=seen.has(id);seen.add(id);
      let text=h.name+'：'+first.slots.join(' / ')+'。'+(overlap.length?'主と同系統 '+overlap.join('・')+'（無効を意味しません）。':'主にない効果分類。');
      if(duplicate)text+=' 同英雄の個別重複式は未確認。';
      text+=' '+h.stacking.label+'。';
      return '<p class="comparison-line">'+esc(text)+'</p>';
    }).join('')+'<p class="caption">色は効果の類似を表します。同枠加算・別枠乗算や重複の○×は断定しません。数値の合算や最適順位は表示しません。</p>';
  }
  function skillPreview(s, used) {
    const probability=s.trigger.probabilityPct ?? s.trigger.probabilityByLevel?.at(-1);
    return `<div class="skill-preview ${s.number > 1 ? 'skill-extra' : ''}"><div class="tags">${tag(`${s.isPrimary ? '⭐ ' : ''}遠征 ${s.number}`, s.isPrimary ? 'blue' : '')}${tag(s.trigger.label)}${Number.isFinite(probability) ? tag(`Lv5 ${probability}%抽選`) : ''}${evidenceTag(s)}</div><p>${esc(s.effect)}</p><div class="mini-slots">${slotChips(s,used)}</div><small>${esc(s.target)} / ${esc(s.condition)}</small></div>`;
  }
  function renderCards() {
    const shown = C.filterHeroes(heroes,state), used = C.leaderFrames(state,heroes);
    shown.sort((a,b) => b.generation-a.generation || a.name.localeCompare(b.name,'ja'));
    $('result-count').textContent = `${shown.length} / ${available().length}`;
    $('active-filter').hidden = !state.frame;
    $('active-filter').textContent = state.frame ? `${state.frame} / ${frames[state.frame]} で絞り込み中` : '';
    $('hero-grid').innerHTML = shown.length ? shown.map(h => {
      const rec = h.recommendations[state.purpose];
      return `<article class="hero-card"><div class="hero-top"><div class="avatar ${h.troopType}" aria-hidden="true">${symbols[h.troopType]}</div><div class="hero-title"><h3>${esc(h.name)}</h3><div class="hero-meta"><span class="${h.rarity.toLowerCase()}">${h.rarity}</span> · GEN ${String(h.generation).padStart(2,'0')} · ${h.troopTypeJa}</div></div>${tag(rec.rating,ratingClass(rec.rating))}</div>${activeSkills(h).map(s=>skillPreview(s,used)).join('')}<div class="stack-caption">${tag(h.stacking.label,'amber')}</div><div class="recommendation"><b>役割と採用理由</b><p>${esc(rec.positive)}</p><details class="card-caution"><summary>注意・低優先になる理由</summary><p>${esc(rec.caution)}</p></details></div><div class="card-actions"><button data-detail="${h.id}" class="text-button">理由・スタック・出典 ↗</button><button class="add-button" data-add="${h.id}">＋ 比較</button></div></article>`;
    }).join('') : '<div class="empty">該当する英雄がいません。<br>世代や絞り込み条件を変更してください。</div>';
  }
  function render() { renderSetup(); renderFrames(); renderComparison(); renderCards(); persist(); }
  function renderLibrary() {
    const q = $('library-search').value.trim().toLocaleLowerCase(), gen = Number($('library-generation').value);
    const list = heroes.filter(h => h.generation <= gen && [h.name,h.nameEn,...h.aliases].join(' ').toLocaleLowerCase().includes(q));
    $('library-grid').innerHTML = list.map(h => `<button class="library-item" data-detail="${h.id}"><span class="avatar ${h.troopType}">${symbols[h.troopType]}</span><span><strong>${esc(h.name)}</strong><small>${h.rarity} / 第${h.generation}世代 / ${h.troopTypeJa}</small></span></button>`).join('') || '<div class="empty">該当する英雄がいません。</div>';
  }
  function openHero(id) {
    const h=byId.get(id);if(!h)return;
    const rec=h.recommendations[state.purpose];
    $('dialog-label').innerHTML='<p class="eyebrow">'+h.rarity+' / GEN '+h.generation+' / '+h.troopTypeJa+'</p><h2 id="dialog-title">'+esc(h.name)+'</h2>';
    $('dialog-content').innerHTML='<div class="recommendation"><b>⭐ 第1の役割 / '+(state.purpose==='attack'?'攻撃集結':'駐屯防衛')+' / '+esc(rec.rating)+'</b><p>'+esc(rec.positive)+'</p><p><strong>注意・非推奨となる条件：</strong>'+esc(rec.caution)+'</p><p>'+esc(rec.context)+'</p></div>'+
      '<dl class="data-list"><dt>公式の一般則</dt><dd>'+esc(h.stacking.officialGeneralRule)+' '+cite('official-stack')+'</dd><dt>個別の重複</dt><dd>'+esc(h.stacking.label)+'</dd><dt>判断理由</dt><dd>'+esc(h.stacking.reason)+'</dd></dl><p class="audit-note">'+esc(h.stacking.caution)+'</p><div class="source-links">'+h.stacking.sourceIds.map(cite).join(' ')+'</div>'+
      h.skills.map(s=>'<section class="dialog-skill"><h3>'+(s.isPrimary?'⭐ ':'')+'遠征スキル '+s.number+(s.isPrimary?' — 乗り手候補の第1':' — 集結主の効果')+'</h3><p>'+esc(s.effect)+'</p><div class="mini-slots">'+slotChips(s)+'</div><dl class="data-list"><dt>発動タイプ</dt><dd>'+esc(s.trigger.label)+' / '+esc(s.trigger.detail)+'</dd><dt>対象</dt><dd>'+esc(s.target)+'</dd><dt>条件</dt><dd>'+esc(s.condition)+'</dd><dt>掲載倍率</dt><dd>'+s.levelValues.map(v=>esc(v.label)+'：'+esc(v.scale)).join('<br>')+'</dd><dt>分類根拠</dt><dd>'+esc(s.calculationSlotStatus)+'</dd></dl>'+s.components.map(c=>'<div class="component"><b>'+esc(c.category)+'</b> '+esc(c.effect)+'<br><small>対象：'+esc(c.target)+'</small></div>').join('')+s.verificationNotes.map(n=>'<p class="audit-note">'+esc(n)+'</p>').join('')+(s.trigger.mechanicsNote?'<p class="caption">'+esc(s.trigger.mechanicsNote)+'</p>':'')+skillEvidence(s)+'</section>').join('')+
      '<div class="source-links">'+h.sources.map(u=>link(u,new URL(u).hostname)).join(' ')+'</div><p class="caption">'+esc(h.checkedAt)+' 再監査。'+esc(h.verification.skillText)+' 専用装備は対象外。実機のPvP内部式は未検証です。</p>';
    $('hero-dialog').showModal();
  }
  function renderFormula() {
    $('formula-content').innerHTML='<div class="tags">'+tag('公式：重複の一般則','good')+tag('内部計算式：未確定','amber')+'</div><div class="formula-notes"><div><h3>スタック可 ≠ 単純な足し算</h3><p>公式FAQは集結主と参加者の同スキル、および異なるレベルの効果の重複を認めています。被ダメ減少と敵与ダメ減少は主体が異なり、単純加算ではないと説明しています。</p><p>'+cite('official-stack')+'<br>'+cite('official-levels')+'<br>'+cite('official-reduction')+'</p></div><div><h3>分類の一致 ≠ 無効・非推奨</h3><p>A〜J・追加枠は文面を整理する表示名です。公式の内部計算枠ではありません。同じ枠は加算、別枠は乗算とする実証根拠は確認できませんでした。</p><p>対象・条件・スキルLv・兵種構成を比較してください。攻撃側にも耐久、防衛側にも火力が必要です。</p></div></div><h3>計算の考え方（仮定の説明のみ）</h3><div class="equation">【前提】単一の加算項 a に x を追加する模型なら<br>相対倍率 = (1 + a + x) / (1 + a)</div><p>例：a=0.5、x=0.25なら約1.167倍。これは算数の例であり、WoSのPvP式・軽減の合成式・複数スキルの確率式ではありません。熊用モデルや別ゲームの式を対人戦へ転用しません。</p><p><strong>ウェイン③：</strong>全兵種の会心率（Lv5 25%）としてCRITへ分類。会心倍率・発動間の独立性・Sへの換算は未確認。乗り手では第1のみのため、③の会心を乗り手の推薦理由にしません。 '+cite('wayne-wiki')+'</p><p class="caption">2026年10月4日公開資料を再監査。再現可能な英雄別PvP比較実験は今回0件。レネの調整後重複など、報告が食い違う項目は保留を表示します。</p>';
  }
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  function closeMenu() { $('sidebar').classList.remove('open'); $('sidebar').inert = mobileQuery.matches; $('scrim').hidden = true; $('menu-toggle').setAttribute('aria-expanded','false'); }
  function navigate(id) {
    const selected = modules.find(m=>m.id===id) || navigationModules[0];
    if(currentView==='games'&&selected.id!=='games'&&/-game\.html$/.test(gamePath)&&!navigationLock){
      if(!confirm('対戦画面を離れます。進行中のゲームは残りますが、必要なら先にゲーム内で退室してください。別の機能へ移動しますか？')){navigationLock=true;location.hash='games';queueMicrotask(()=>navigationLock=false);return;}
    }
    for(const key of moduleFrames.keys())panelVisibility(key,false);
    currentView = selected.id;
    document.querySelectorAll('.view').forEach(v=>{v.hidden=v.id!==`view-${currentView}`;});
    $('navigation').querySelectorAll('button').forEach(b=>{const on=b.dataset.nav===currentView; b.classList.toggle('active',on); if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    $('breadcrumb-current').textContent=selected.label; $('page-title').textContent=selected.title; $('page-eyebrow').textContent=selected.eyebrow; $('page-subtitle').textContent=selected.subtitle;
    $('reset-settings').hidden=currentView!=='joiners';
    document.body.classList.toggle('embedded-module',Boolean(selected.path));
    mountModule(selected);panelVisibility(selected.id,true);
    $('mobile-dock').querySelectorAll('[data-nav]').forEach(b=>{const on=b.dataset.nav===currentView;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});
    if(currentView!=='battle')stopBattle();
    if(currentView==='library')renderLibrary();
    closeMenu(); document.title=`${selected.label} | DeS ポータル`;
  }

  // Independent teaching module. All losses are resolved from one shared snapshot.
  let battle = { initialLeft:[500,500,500],initialRight:[500,500,500],left:[500,500,500],right:[500,500,500],rate:12,phase:0,turn:1,pending:null };
  let battleTimer = null;
  const battleDone=()=>!battle.left.some(Boolean)||!battle.right.some(Boolean);
  function stopBattle(){if(battleTimer!==null){clearInterval(battleTimer);battleTimer=null;}$('battle-play').textContent='自動再生';$('battle-play').setAttribute('aria-pressed','false');}
  function resetBattle(){stopBattle();battle.left=[...battle.initialLeft];battle.right=[...battle.initialRight];battle.turn=1;battle.phase=0;battle.pending=C.resolveRound(battle.left,battle.right,battle.rate);renderBattle();}
  function nextBattle(){
    if(battleDone()){stopBattle();return;}
    if(battle.phase===0)battle.phase=1;
    else if(battle.phase===1){battle.phase=2;battle.left=[...battle.pending.left];battle.right=[...battle.pending.right];}
    else{battle.turn++;battle.phase=0;battle.pending=C.resolveRound(battle.left,battle.right,battle.rate);}
    renderBattle();if(battleDone())stopBattle();
  }
  function renderBattle(){
    const pending=battle.pending,done=battleDone();
    $('turn-number').textContent=`TURN ${String(battle.turn).padStart(2,'0')}`;
    $('battle-phases').innerHTML=['① 対象を選ぶ','② 両軍が攻撃','③ 損害を同時反映'].map((s,i)=>`<div class="phase ${battle.phase===i?'active':''}">${s}</div>`).join('');
    function side(values,initial,enemy){return `<div class="battle-side ${enemy?'enemy':''}"><h3>${enemy?'敵軍':'味方'}</h3>${values.map((v,i)=>`<div class="battle-unit ${v===0?'dead':''} ${battle.phase<2&&i===(enemy?pending.targetB:pending.targetA)?'target':''}"><div class="unit-label"><span>${symbols[C.troops[i]]} ${troopNames[C.troops[i]]}</span><span><strong>${v}</strong>${battle.phase===2&&(enemy?pending.damageToB:pending.damageToA)[i]?`<span class="damage-number">−${(enemy?pending.damageToB:pending.damageToA)[i]}*</span>`:''}</span></div><div class="bar"><i style="width:${initial[i]?Math.min(100,v/initial[i]*100):0}%"></i></div></div>`).join('')}</div>`;}
    $('battle-field').classList.toggle('attacking',battle.phase===1&&!done);
    $('battle-field').innerHTML=side(battle.left,battle.initialLeft,false)+`<div class="battle-center">${battle.phase===1?'⇄':'·'}<small>SIMULTANEOUS</small></div>`+side(battle.right,battle.initialRight,true);
    let msg=['各兵種はターン開始時に残っている敵の先頭を狙います。','開始時の兵数から両軍のダメージを計算。まだ兵数は減りません。','双方の損害を同時に反映しました。* 表示は計算したダメージ量（残兵数を超えることがあります）。'][battle.phase];
    if(done)msg=!battle.left.some(Boolean)&&!battle.right.some(Boolean)?'両軍が同時に全滅。片方の攻撃だけ取り消すことはありません。':!battle.left.some(Boolean)?'この教材では敵軍が残存しました。':'この教材では味方が残存しました。';
    $('battle-status').textContent=msg;$('battle-next').disabled=done;$('battle-play').disabled=done;
    $('battle-next').textContent=battle.phase===2?'次のターン →':'次のステップ →';
  }

  // Register new modules here; shell, routes and navigation are shared.
  $('navigation').innerHTML=navigationModules.map((m,i)=>`<button class="nav-button" data-nav="${m.id}"><span class="nav-icon" aria-hidden="true">${m.icon}</span>${m.label}<span class="nav-num">0${i+1}</span></button>`).join('');
  const dockIds=window.WOS_STANDALONE?['joiners','library','battle','sources']:['redeem','gallery','forms','bear'];
  $('mobile-dock').innerHTML=dockIds.map(id=>{const m=modules.find(x=>x.id===id);return `<button data-nav="${id}" aria-pressed="false"><span aria-hidden="true">${m.icon}</span>${id==='gallery'?'ギャラリー':m.label}</button>`;}).join('')+'<button id="dock-menu"><span aria-hidden="true">☰</span>一覧</button>';
  const generations=Array.from({length:8},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
  $('generation').innerHTML=Array.from({length:8},(_,i)=>`<option value="${i+1}">Gen ${i+1}</option>`).join('');
  $('library-generation').innerHTML=generations;$('library-generation').value=state.generation;
  const triggerTypes=new Map(heroes.flatMap(h=>h.skills.map(s=>[s.trigger.type,s.trigger.label])));
  $('trigger-filter').innerHTML='<option value="all">すべての発動タイプ</option>'+[...triggerTypes].map(([type,label])=>`<option value="${esc(type)}">${esc(label)}</option>`).join('');
  renderFormula();
  $('evidence-policy').innerHTML='<h3>どの情報を優先したか</h3><p>'+esc(data.evidencePolicy.adoptionRule)+'</p><p>'+esc(data.evidencePolicy.limitations)+'</p><details class="evidence-detail"><summary>今回の調査範囲・照合件数について</summary><p>'+esc(data.evidencePolicy.coverage)+'</p><p>'+esc(data.evidencePolicy.extractionNote)+'</p><p>'+esc(data.evidencePolicy.recommendations)+'</p></details>';
  $('source-list').innerHTML=data.sources.map(s=>`<article class="panel source-card">${tag(s.evidenceLevel==='official-general'?'公式一般則':s.evidenceLevel.startsWith('rejected')?'根拠に不採用':s.evidenceLevel==='out-of-scope'?'対象外':s.evidenceLevel==='community-disputed'?'報告が対立':s.evidenceLevel==='community-report'?'コミュニティ報告':'本文照合・補助資料',s.evidenceLevel==='official-general'?'good':'')}<h3>${link(s.url,s.name)}</h3><p>${esc(s.assessment)}</p></article>`).join('');
  $('battle-source').innerHTML=`公式の戦闘説明：${cite('official-combat')}。周期の例はスキル図鑑の個別出典を参照。`;
  $('battle-inputs').innerHTML=`<div class="battle-input-grid"><span></span>${C.troops.map(t=>`<span>${troopNames[t]}</span>`).join('')}${['left','right'].map(side=>`<span>${side==='left'?'味方':'敵軍'}</span>${C.troops.map((t,i)=>`<input type="number" id="battle-${side}-${i}" aria-label="${side==='left'?'味方':'敵軍'} ${troopNames[t]}の兵数" value="500" min="0" max="1500">`).join('')}`).join('')}</div>`;
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.nav){location.hash=button.dataset.nav;if(currentView===button.dataset.nav)closeMenu();return;}
    if(button.dataset.detail){openHero(button.dataset.detail);return;}
    if(button.dataset.add){const index=state.joiners.indexOf('');if(index===-1){toast('4枠が埋まっています。比較欄で入れ替えてください。');return;}state.joiners[index]=button.dataset.add;renderSetup();renderComparison();persist();toast(`${byId.get(button.dataset.add).name}を比較枠${index+1}に追加しました。`);return;}
    if(button.dataset.frame!==undefined){state.frame=state.frame===button.dataset.frame?'':button.dataset.frame;renderFrames();renderCards();persist();}
    if(button.dataset.purpose){state.purpose=button.dataset.purpose;state.basis='description';state.frame='';render();}
    if(button.dataset.mode){state.mode=button.dataset.mode;renderSetup();renderCards();persist();}
  });
  document.addEventListener('change',event=>{
    const el=event.target;
    if(el.dataset.leader!==undefined){state.leaders[Number(el.dataset.leader)]=el.value;render();}
    if(el.dataset.joiner!==undefined){state.joiners[Number(el.dataset.joiner)]=el.value;renderComparison();persist();}
  });
  $('generation').addEventListener('change',()=>{const before=[...state.leaders,...state.joiners].filter(Boolean).length;state=C.normalizeState({...state,generation:$('generation').value},heroes);render();$('library-generation').value=state.generation;if([...state.leaders,...state.joiners].filter(Boolean).length<before)toast('選択世代より後の英雄を編成から外しました。');});
  $('search').addEventListener('input',()=>{state.search=$('search').value;renderCards();persist();});
  for(const [id,key] of [['troop-filter','troop'],['trigger-filter','trigger']])$(id).addEventListener('change',()=>{state[key]=$(id).value;renderCards();persist();});
  $('clear-filters').addEventListener('click',()=>{Object.assign(state,{search:'',troop:'all',trigger:'all',frame:''});render();});
  $('clear-joiners').addEventListener('click',()=>{state.joiners=['','','',''];renderSetup();renderComparison();persist();});
  $('reset-settings').addEventListener('click',()=>{state=C.normalizeState({},heroes);render();toast('編成と絞り込みをリセットしました。');});
  $('load-example').addEventListener('click',()=>{state.generation=Math.max(7,state.generation);state.leaders=['edith','gordon','bradley'];render();toast('エディス・ゴードン・ブラッドリーを選択しました（推奨編成の指定ではありません）。');});
  $('library-search').addEventListener('input',renderLibrary);$('library-generation').addEventListener('change',renderLibrary);
  $('dialog-close').addEventListener('click',()=>$('hero-dialog').close());
  $('hero-dialog').addEventListener('click',e=>{if(e.target===$('hero-dialog')){const r=$('hero-dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('hero-dialog').close();}});
  $('menu-toggle').addEventListener('click',()=>{const open=!$('sidebar').classList.contains('open');$('sidebar').classList.toggle('open',open);$('sidebar').inert=!open;$('scrim').hidden=!open;$('menu-toggle').setAttribute('aria-expanded',String(open));if(open)$('navigation').querySelector('button').focus();});
  $('dock-menu').addEventListener('click',()=>$('menu-toggle').click());
  mobileQuery.addEventListener('change',closeMenu);
  $('scrim').addEventListener('click',()=>{closeMenu();$('menu-toggle').focus();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('sidebar').classList.contains('open')){closeMenu();$('menu-toggle').focus();}});
  window.addEventListener('hashchange',()=>{navigate(location.hash.slice(1));window.scrollTo({top:0,behavior:'instant'});});
  $('battle-next').addEventListener('click',nextBattle);$('battle-reset').addEventListener('click',resetBattle);
  $('battle-play').addEventListener('click',()=>{if(battleTimer!==null){stopBattle();return;}if(battleDone())return;$('battle-play').textContent='一時停止';$('battle-play').setAttribute('aria-pressed','true');battleTimer=setInterval(nextBattle,Number($('battle-speed').value));});
  $('battle-speed').addEventListener('change',()=>{if(battleTimer!==null){clearInterval(battleTimer);battleTimer=setInterval(nextBattle,Number($('battle-speed').value));}});
  $('battle-apply').addEventListener('click',()=>{
    const inputs=[...document.querySelectorAll('#battle-inputs input'),$('battle-rate')];
    if(inputs.some(el=>el.value===''||!el.checkValidity())){toast('兵数は0〜1,500の整数、ダメージ率は1〜100で入力してください。');return;}
    battle.initialLeft=[0,1,2].map(i=>Number($(`battle-left-${i}`).value));battle.initialRight=[0,1,2].map(i=>Number($(`battle-right-${i}`).value));battle.rate=Number($('battle-rate').value);resetBattle();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopBattle();for(const key of moduleFrames.keys())panelVisibility(key,!document.hidden&&key===currentView);});
  $('download-data').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='wos_rally_joiner_gen1-8.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  render();resetBattle();navigate(location.hash.slice(1));
})();

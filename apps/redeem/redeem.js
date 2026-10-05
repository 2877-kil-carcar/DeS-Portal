(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  const api = new URL('../../api/redeem-tool/', location.href);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let state = {kingdom:'2856', players:[], history:{}};
  let cloudConnected = false, exchangeConnected = false, busy = false, running = false, stop = false;
  const results = new Map();
  const cloud = globalThis.WOS_REDEEM_CLOUD;

  function status(title, message, kind = '') {
    $('connection-title').textContent = title;
    $('connection-message').textContent = message;
    document.querySelector('.connection').className = 'connection ' + kind;
  }
  function canEdit() { return !preview && (cloudConnected || exchangeConnected); }
  function controls() {
    $('startBtn').disabled = !exchangeConnected || busy || preview;
    for (const id of ['addBtn','newFid','newKid','newName']) $(id).disabled = !canEdit() || busy;
    $('retry').disabled = busy || preview;
    $('cdk').disabled = running;
    $('stopBtn').disabled = !running || stop;
  }
  function connectionStatus() {
    const local = /^(127\.0\.0\.1|localhost)$/.test(location.hostname || '');
    $('local-link').hidden = exchangeConnected || local;
    if (cloudConnected && exchangeConnected) status('共有登録・交換サーバーに接続済み','登録者と履歴はFirebaseで全端末へ共有されます。','ready');
    else if (cloudConnected) status('共有登録に接続済み','登録編集は可能です。交換するときはPCで start_hub.bat を起動してください。','ready');
    else if (exchangeConnected) status('ローカル交換サーバーに接続済み','Firebaseへ接続できないため、このPCの登録データを表示しています。','error');
    else status('接続できません','Firebase接続を確認してください。交換には start_hub.bat も必要です。','error');
  }
  async function request(route, body) {
    if (preview) throw Error('表示確認モードでは通信しません。');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), body ? 40000 : 8000);
    try {
      const response = await fetch(new URL(route, api), {method:body?'POST':'GET', headers:body?{'Content-Type':'application/json'}:{}, body:body?JSON.stringify(body):undefined, signal:controller.signal, cache:'no-store'});
      if (!response.ok) throw Error(response.status === 404 ? '交換APIがありません。start_hub.bat で起動してください。' : '交換サーバーが応答できません（HTTP ' + response.status + '）。');
      if (!response.headers.get('content-type')?.includes('application/json')) throw Error('交換APIではない応答です。start_hub.bat で起動してください。');
      const value = await response.json();
      if (value.ok === false) throw Error(value.msg || '処理に失敗しました。');
      return value;
    } catch (error) {
      if (error.name === 'AbortError') throw Error('通信がタイムアウトしました。送信済みの交換は完了している可能性があります。履歴を確認してください。');
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function refreshLocal() {
    const next = await request('state');
    if (!Array.isArray(next.players) || !next.history) throw Error('登録データの形式を確認してください。');
    state = next; render();
    return next;
  }
  function render() {
    $('count').textContent = state.players.length + '人';
    const query = $('search').value.trim().toLowerCase(), done = state.history[$('cdk').value.trim()] || {};
    const players = state.players.filter(player => [player.name,player.fid,player.kid].join(' ').toLowerCase().includes(query));
    $('list').innerHTML = players.map(player => {
      const result = results.get(player.fid) || (done[player.fid] ? {cls:'muted',msg:'記録済：'+done[player.fid].msg} : null);
      const disabled = busy || !canEdit() ? 'disabled' : '';
      return `<article class="player"><h3>${esc(player.name||'名前なし')}</h3><div class="player-meta">ID ${esc(player.fid)} · 王国 ${esc(player.kid||state.kingdom)}</div><p class="player-result ${result?.cls||'muted'}">${esc(result?.msg||'未実行')}</p><div class="player-actions"><button class="secondary" data-action="rename" data-id="${esc(player.fid)}" ${disabled}>名前編集</button><button class="secondary" data-action="kingdom" data-id="${esc(player.fid)}" ${disabled}>王国変更</button><button class="secondary danger" data-action="delete" data-id="${esc(player.fid)}" ${disabled}>削除</button></div></article>`;
    }).join('') || '<p class="empty">' + (state.players.length ? '検索に一致するプレイヤーがいません。' : '登録プレイヤーがいません。') + '</p>';
    controls();
  }
  async function connect() {
    if (preview) {
      status('表示確認モード','サンプルのみ表示しています。Firebase・交換APIへの通信は行いません。');
      state.players = [{fid:'00000001',kid:'0000',name:'サンプルプレイヤー'}]; render(); return;
    }
    busy = true; controls(); status('接続を確認中…','共有登録とローカル交換サーバーを確認しています。');
    let localState = {kingdom:'2856',players:[],history:{}}, cloudError = null;
    try {
      const health = await request('health');
      if (health.service !== 'wos-redeem-hub' || !health.ready) throw Error('交換機能を読み込めません。');
      exchangeConnected = true; localState = await refreshLocal();
    } catch (_) { exchangeConnected = false; }
    try {
      if (!cloud) throw Error('Firebase SDKを読み込めません。');
      await cloud.connect(localState, next => { state = next; cloudConnected = true; render(); connectionStatus(); }, error => { cloudConnected = false; connectionStatus(); console.warn('redeem sync', error); });
      cloudConnected = true;
    } catch (error) { cloudConnected = false; cloudError = error; if (exchangeConnected) state = localState; }
    busy = false; render(); connectionStatus();
    if (cloudError) $('setup').open = true;
  }
  async function change(operation) {
    if (busy || !canEdit()) return;
    busy = true; render();
    try { await operation(); if (!cloudConnected && exchangeConnected) await refreshLocal(); }
    catch (error) { status('処理を完了できませんでした',error.message,'error'); }
    finally { busy = false; render(); }
  }
  async function savePlayer(player, verify = false) {
    if (verify && exchangeConnected) await request('players', player);
    if (cloudConnected) await cloud.setPlayer(player);
    else if (!verify) await request('players', player);
  }

  $('list').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]'); if (!button) return;
    const player = state.players.find(value => value.fid === button.dataset.id); if (!player) return;
    change(async () => {
      if (button.dataset.action === 'delete') {
        if (!confirm(`${player.name||player.fid} を共有登録から削除しますか？`)) return;
        if (cloudConnected) await cloud.deletePlayer(player.fid); else await request('players/delete',{fid:player.fid});
      }
      if (button.dataset.action === 'rename') {
        const name = prompt('メモ名',player.name||''); if (name !== null) await savePlayer({...player,name},false);
      }
      if (button.dataset.action === 'kingdom') {
        const kid = prompt(exchangeConnected?'王国（外部サーバーへID確認を送信します）':'王国（交換サーバー未起動のため、ID確認なしで共有保存します）',player.kid||state.kingdom);
        if (kid === null) return; if (!/^\d+$/.test(kid.trim())) throw Error('王国は数字で入力してください。');
        await savePlayer({...player,kid:kid.trim()},true);
      }
    });
  });
  $('addBtn').addEventListener('click', () => change(async () => {
    const ids = [...new Set($('newFid').value.split(/[\s,、]+/).filter(Boolean))], kid = $('newKid').value.trim();
    if (!ids.length || ids.some(id => !/^\d+$/.test(id)) || !/^\d+$/.test(kid)) throw Error('IDと王国は数字で入力してください。複数IDは改行かカンマで区切ります。');
    const note = exchangeConnected ? '外部サーバーで確認して共有登録' : 'ID確認なしで共有登録';
    if (!confirm(ids.length + '人を' + note + 'しますか？')) return;
    const failed = [];
    for (let index=0; index<ids.length; index++) {
      $('addBtn').textContent = `登録中 ${index+1}/${ids.length}`;
      const player = {fid:ids[index],kid,name:ids.length===1?$('newName').value.trim():''};
      try { await savePlayer(player,true); } catch (error) { failed.push(ids[index]+': '+error.message); }
      if (index+1<ids.length && exchangeConnected) await sleep(1200);
    }
    $('addBtn').textContent = '確認して追加';
    if (!failed.length) { $('newFid').value=''; $('newName').value=''; }
    else status('一部を登録できませんでした',failed.join(' / '),'error');
  }));
  $('startBtn').addEventListener('click', async () => {
    if (busy || !exchangeConnected || preview) return;
    const cdk = $('cdk').value.trim(); if (!cdk) { $('cdk').focus(); return; }
    const done = state.history[cdk] || {}, targets = state.players.filter(player => !done[player.fid]);
    if (!targets.length) { $('progress').textContent=state.players.length?'全員分が記録済みです。':'先にプレイヤーを登録してください。'; return; }
    if (!confirm(`コード「${cdk}」を ${targets.length}人へ送信して交換しますか？\n受取済み ${state.players.length-targets.length}人はスキップします。`)) return;
    busy=true; running=true; stop=false; results.clear(); render(); let success=0, failed=0, aborted=false;
    $('batch-progress').max=targets.length; $('batch-progress').value=0;
    try {
      for (let index=0; index<targets.length && !stop; index++) {
        const player=targets[index]; $('progress').textContent=`${index+1}/${targets.length} 人目を交換中…`; results.set(player.fid,{cls:'muted',msg:'交換中…'}); render();
        let result;
        for (let attempt=0; attempt<3; attempt++) {
          if (stop) break;
          result=await request('redeem',{fid:player.fid,kid:player.kid||state.kingdom,cdk});
          if (!result.retry || attempt===2) break;
          results.set(player.fid,{cls:'warn',msg:result.msg+'（再試行待ち）'}); render();
          for(let tick=0;tick<10&&!stop;tick++) await sleep(500);
        }
        if (!result) break;
        results.set(player.fid,{cls:result.done?'ok':'ng',msg:result.msg||'結果不明'});
        if (result.done) { success++; if (cloudConnected) await cloud.recordHistory(cdk,player.fid,result); }
        else failed++;
        $('batch-progress').value=index+1; render();
        if (result.bad_cdk) { stop=true; status('コードを確認してください',result.msg,'error'); break; }
        if (index+1<targets.length&&!stop) await sleep(1200);
      }
    } catch (error) {
      aborted=true; stop=true; status('通信が中断しました',error.message,'error');
      for(const [id,result] of results) if(result.msg==='交換中…') results.set(id,{cls:'warn',msg:'結果未確認。共有履歴とゲーム内を確認してください。'});
    } finally {
      running=false;
      if (!cloudConnected) { try { await refreshLocal(); } catch (_) { exchangeConnected=false; } }
      busy=false; render(); $('progress').textContent=`${stop?'中止':'完了'}：成功・記録済 ${success} / 失敗 ${failed}`+(aborted?'（通信結果未確認あり）':'');
    }
  });
  $('stopBtn').addEventListener('click',()=>{stop=true;controls();$('progress').textContent='中止を受け付けました。送信中の1件があれば完了を待ちます。';});
  $('cdk').addEventListener('input',()=>{results.clear();render();});
  $('search').addEventListener('input',render); $('retry').addEventListener('click',connect);
  addEventListener('beforeunload',event=>{if(running){event.preventDefault();event.returnValue='';}});
  connect();
})();

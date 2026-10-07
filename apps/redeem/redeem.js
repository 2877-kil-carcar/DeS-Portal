(() => {
  'use strict';
  const $=id=>document.getElementById(id),preview=new URLSearchParams(location.search).get('preview')==='1';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const cloud=globalThis.WOS_REDEEM_CLOUD,directApi=globalThis.WOS_REDEEM_API;
  let state={kingdom:'2856',players:[],history:{}},connected=false,busy=false,running=false,stop=false;
  const results=new Map();
  const jobs=globalThis.WOS_REDEEM_JOBS;
  let serverBatch=false,jobTimer=null,selectedCode='',currentJob=null;
  const statusNames={pending:'待機中',processing:'交換中',completed:'完了',failed:'要確認',cancelled:'中止'};
  function showJob(job) {
    currentJob=job;
    const retryButton=$('resumeBtn');
    retryButton.hidden=!job||['pending','processing'].includes(job.status);
    if(!job)return;
    selectedCode=job.code;
    running=['pending','processing'].includes(job.status);busy=running;stop=Boolean(job.stop_requested);
    results.clear();
    for(const p of job.targets)results.set(p.fid,{cls:['done','skipped'].includes(p.status)?'ok':['failed','unknown'].includes(p.status)?'ng':'muted',msg:p.msg||({pending:'待機中',sending:'交換中…',recording:'交換結果を保存中…'}[p.status]||'')});
    const finished=job.targets.filter(p=>['done','skipped','failed','unknown'].includes(p.status)).length;
    const success=job.targets.filter(p=>['done','skipped'].includes(p.status)).length;
    const failed=job.targets.filter(p=>['failed','unknown'].includes(p.status)).length;
    $('batch-progress').max=Math.max(1,job.targets.length);$('batch-progress').value=finished;
    $('progress').textContent=`${statusNames[job.status]||job.status}：${finished}/${job.targets.length}人（成功・記録済 ${success} / 要確認 ${failed}）`+(job.error?' '+job.error:'');
    render();
  }
  async function refreshJobs() {
    clearTimeout(jobTimer);
    try {
      const response=await jobs.list();
      const latest=response.jobs||[];
      $('jobs-panel').hidden=false;
      const monitor=response.discord||{};
      $('discord-status').textContent=!monitor.enabled?'自動取得：設定待ち':monitor.status==='failed'?'自動取得：接続を確認してください。 '+(monitor.message||''):monitor.checked_at?'自動取得：最終確認 '+new Date(monitor.checked_at).toLocaleString('ja-JP'):'自動取得：初回接続待ち';
      $('jobs-list').innerHTML=latest.length?latest.map(job=>`<button class="secondary" data-job="${esc(job.code)}">${esc(job.code)} · ${esc(statusNames[job.status]||job.status)}</button>`).join(' '):'<p class="empty">一括交換の記録はまだありません。</p>';
      const current=latest.find(j=>j.code===selectedCode);
      if(current)showJob(current);
      else if(selectedCode){const detail=await jobs.get(selectedCode);if(detail.job)showJob(detail.job);}
      else if(!$('cdk').value&&latest.length){selectedCode=(latest.find(j=>['pending','processing'].includes(j.status))||latest[0]).code;$('cdk').value=selectedCode;showJob(latest.find(j=>j.code===selectedCode));}
    } catch(error) {status('交換状況を取得できません',error.message+' 自動で再接続します。','error');}
    finally {jobTimer=setTimeout(refreshJobs,8000);}
  }
  async function startServer(retry=false) {
    if(busy||!connected||preview)return;
    const code=$('cdk').value.trim();if(!code){$('cdk').focus();return;}
    const unknown=retry&&currentJob?.targets.some(p=>p.status==='unknown');
    const message=retry?'未完了分と新規登録分を再実行しますか？'+(unknown?'\n結果未確認分があります。ゲーム内の受取状況を確認してから進めてください。':''):`コード「${code}」の一括交換を開始しますか？\n登録済み全員を対象に、記録済みのプレイヤーはスキップします。`;
    if(!confirm(message))return;
    busy=true;render();
    try{const response=await jobs.start(code,retry,Boolean(unknown));selectedCode=code;showJob(response.job);await refreshJobs();}
    catch(error){status('受付結果を確認できません',error.message+' 同じコードで再送しても処理は重複登録されません。','error');}
    finally{busy=running;render();}
  }
  function status(title,message,kind=''){$('connection-title').textContent=title;$('connection-message').textContent=message;document.querySelector('.connection').className='connection '+kind;}
  function controls(){$('startBtn').disabled=!connected||!directApi||busy||preview;for(const id of ['addBtn','newFid','newKid','newName'])$(id).disabled=!connected||busy||preview;$('retry').disabled=busy||preview;$('cdk').disabled=running;$('stopBtn').disabled=!running||stop;}
  function renderRecent(){
    const recent=Object.entries(state.history||{}).map(([cdk,records])=>{
      const values=Object.values(records||{}),latest=values.reduce((best,item)=>!best.at&&best.atMillis===undefined||Number(item.atMillis||Date.parse(item.at||'')||0)>Number(best.atMillis||Date.parse(best.at||'')||0)?item:best,{});
      return {cdk,at:String(latest.at||''),atMillis:Number(latest.atMillis||Date.parse(latest.at||'')||0)};
    }).filter(item=>item.cdk).sort((a,b)=>b.atMillis-a.atMillis||b.at.localeCompare(a.at,'ja')).slice(0,5);
    $('recent-list').innerHTML=recent.length?recent.map(item=>`<div class="recent-code"><strong>${esc(item.cdk)}</strong><time>${esc(item.at||'日時記録なし')}</time></div>`).join(''):'<p class="empty">交換履歴はまだありません。</p>';
  }
  function render(){
    $('count').textContent=state.players.length+'人';
    const query=$('search').value.trim().toLowerCase(),done=state.history[$('cdk').value.trim()]||{},players=state.players.filter(player=>[player.name,player.fid,player.kid].join(' ').toLowerCase().includes(query));
    $('list').innerHTML=players.map(player=>{const result=results.get(player.fid)||(done[player.fid]?{cls:'muted',msg:'記録済：'+done[player.fid].msg}:null),disabled=busy||!connected?'disabled':'';return `<article class="player"><h3>${esc(player.name||'名前なし')}</h3><div class="player-meta">ID ${esc(player.fid)} · 王国 ${esc(player.kid||state.kingdom)}</div><p class="player-result ${result?.cls||'muted'}">${esc(result?.msg||'未実行')}</p><div class="player-actions"><button class="secondary" data-action="rename" data-id="${esc(player.fid)}" ${disabled}>名前編集</button><button class="secondary" data-action="kingdom" data-id="${esc(player.fid)}" ${disabled}>王国変更</button><button class="secondary danger" data-action="delete" data-id="${esc(player.fid)}" ${disabled}>削除</button></div></article>`;}).join('')||'<p class="empty">'+(state.players.length?'検索に一致するプレイヤーがいません。':'登録プレイヤーがいません。')+'</p>';renderRecent();controls();
  }
  async function connect(){
    if(preview){status('表示確認モード','サンプルのみ表示しています。Firebase・交換APIへの通信は行いません。');state.players=[{fid:'00000001',kid:'0000',name:'サンプルプレイヤー'}];render();return;}
    busy=true;controls();status('接続を確認中…','共有登録へ接続しています。');
    try{if(!cloud)throw Error('Firebase SDKを読み込めません。');if(!directApi)throw Error('交換処理を読み込めません。');serverBatch=jobs?await jobs.available():false;await cloud.connect({players:[],history:{}},next=>{state=next;connected=true;render();status('利用できます','共有データに接続しました。','ready');},error=>{connected=false;status('共有登録に接続できません',error.message,'error');});connected=true;status('利用できます','共有データに接続しました。','ready');if(serverBatch){$('batch-caption').textContent='画面を閉じても交換は続きます。「中止」は送信中の1件が完了した後に止まります。';await refreshJobs();}}
    catch(error){connected=false;status('接続できません',error.message,'error');}finally{busy=false;render();}
  }
  async function change(operation){if(busy||!connected||preview)return;busy=true;render();try{await operation();}catch(error){status('処理を完了できませんでした',error.message,'error');}finally{busy=false;render();}}
  async function verifiedSave(player){const checked=await directApi.checkPlayer(player.fid,player.kid);if(!checked.ok)throw Error(checked.msg||'プレイヤーを確認できません。');await cloud.setPlayer(player);}
  $('list').addEventListener('click',event=>{const button=event.target.closest('button[data-action]');if(!button)return;const player=state.players.find(value=>value.fid===button.dataset.id);if(!player)return;change(async()=>{
    if(button.dataset.action==='delete'){if(confirm(`${player.name||player.fid} を共有登録から削除しますか？`))await cloud.deletePlayer(player.fid);}
    if(button.dataset.action==='rename'){const name=prompt('メモ名',player.name||'');if(name!==null)await cloud.setPlayer({...player,name});}
    if(button.dataset.action==='kingdom'){const kid=prompt('王国（公式交換APIでIDを確認します）',player.kid||state.kingdom);if(kid===null)return;if(!/^\d+$/.test(kid.trim()))throw Error('王国は数字で入力してください。');await verifiedSave({...player,kid:kid.trim()});}
  });});
  $('addBtn').addEventListener('click',()=>change(async()=>{
    const fid=$('newFid').value.trim(),kid=$('newKid').value.trim();
    if(!/^\d+$/.test(fid)||!/^\d+$/.test(kid))throw Error('IDと王国は数字で入力してください。');if(!confirm('このプレイヤーを公式交換APIで確認して共有登録しますか？'))return;
    $('addBtn').textContent='確認中…';try{await verifiedSave({fid,kid,name:$('newName').value.trim()});$('newFid').value='';$('newName').value='';}finally{$('addBtn').textContent='確認して追加';}
  }));
  $('startBtn').addEventListener('click',async()=>{
    if(serverBatch)return startServer();
    if(busy||!connected||!directApi||preview)return;const cdk=$('cdk').value.trim();if(!cdk){$('cdk').focus();return;}const done=state.history[cdk]||{},targets=state.players.filter(player=>!done[player.fid]);
    if(!targets.length){$('progress').textContent=state.players.length?'全員分が記録済みです。':'先にプレイヤーを登録してください。';return;}if(!confirm(`コード「${cdk}」を ${targets.length}人へ送信して交換しますか？\n受取済み ${state.players.length-targets.length}人はスキップします。`))return;
    busy=running=true;stop=false;results.clear();render();let success=0,failed=0,aborted=false;$('batch-progress').max=targets.length;$('batch-progress').value=0;
    try{for(let index=0;index<targets.length&&!stop;index++){const player=targets[index];$('progress').textContent=`${index+1}/${targets.length} 人目を交換中…`;results.set(player.fid,{cls:'muted',msg:'交換中…'});render();let result;for(let attempt=0;attempt<3;attempt++){if(stop)break;result=await directApi.redeem(player.fid,player.kid||state.kingdom,cdk);if(!result.retry||attempt===2)break;results.set(player.fid,{cls:'warn',msg:result.msg+'（再試行待ち）'});render();for(let tick=0;tick<10&&!stop;tick++)await sleep(500);}if(!result)break;results.set(player.fid,{cls:result.done?'ok':'ng',msg:result.msg||'結果不明'});if(result.done){success++;await cloud.recordHistory(cdk,player.fid,result);}else failed++;$('batch-progress').value=index+1;render();if(result.bad_cdk){stop=true;status('コードを確認してください',result.msg,'error');break;}if(index+1<targets.length&&!stop)await sleep(2200);}}
    catch(error){aborted=true;stop=true;status('通信が中断しました',error.message,'error');for(const [id,result]of results)if(result.msg==='交換中…')results.set(id,{cls:'warn',msg:'結果未確認。共有履歴とゲーム内を確認してください。'});}
    finally{running=false;busy=false;render();$('progress').textContent=`${stop?'中止':'完了'}：成功・記録済 ${success} / 失敗 ${failed}`+(aborted?'（通信結果未確認あり）':'');}
  });
  $('resumeBtn').addEventListener('click',()=>startServer(true));
  $('jobs-list').addEventListener('click',event=>{const button=event.target.closest('[data-job]');if(!button)return;selectedCode=button.dataset.job;$('cdk').value=selectedCode;refreshJobs();});
  $('stopBtn').addEventListener('click',async()=>{if(serverBatch){try{await jobs.cancel(selectedCode);await refreshJobs();}catch(error){status('中止を受け付けられませんでした',error.message,'error');}return;}stop=true;controls();$('progress').textContent='中止を受け付けました。送信中の1件があれば完了を待ちます。';});$('cdk').addEventListener('input',()=>{selectedCode='';currentJob=null;$('resumeBtn').hidden=true;results.clear();render();});$('search').addEventListener('input',render);$('retry').addEventListener('click',connect);addEventListener('beforeunload',event=>{if(running&&!serverBatch){event.preventDefault();event.returnValue='';}});connect();
})();

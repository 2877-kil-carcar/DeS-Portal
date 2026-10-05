(() => {
  'use strict';
  const $=id=>document.getElementById(id),preview=new URLSearchParams(location.search).get('preview')==='1';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const cloud=globalThis.WOS_REDEEM_CLOUD,directApi=globalThis.WOS_REDEEM_API;
  let state={kingdom:'2856',players:[],history:{}},connected=false,busy=false,running=false,stop=false;
  const results=new Map();
  function status(title,message,kind=''){$('connection-title').textContent=title;$('connection-message').textContent=message;document.querySelector('.connection').className='connection '+kind;}
  function controls(){$('startBtn').disabled=!connected||!directApi||busy||preview;for(const id of ['addBtn','newFid','newKid','newName'])$(id).disabled=!connected||busy||preview;$('retry').disabled=busy||preview;$('cdk').disabled=running;$('stopBtn').disabled=!running||stop;}
  function render(){
    $('count').textContent=state.players.length+'人';
    const query=$('search').value.trim().toLowerCase(),done=state.history[$('cdk').value.trim()]||{},players=state.players.filter(player=>[player.name,player.fid,player.kid].join(' ').toLowerCase().includes(query));
    $('list').innerHTML=players.map(player=>{const result=results.get(player.fid)||(done[player.fid]?{cls:'muted',msg:'記録済：'+done[player.fid].msg}:null),disabled=busy||!connected?'disabled':'';return `<article class="player"><h3>${esc(player.name||'名前なし')}</h3><div class="player-meta">ID ${esc(player.fid)} · 王国 ${esc(player.kid||state.kingdom)}</div><p class="player-result ${result?.cls||'muted'}">${esc(result?.msg||'未実行')}</p><div class="player-actions"><button class="secondary" data-action="rename" data-id="${esc(player.fid)}" ${disabled}>名前編集</button><button class="secondary" data-action="kingdom" data-id="${esc(player.fid)}" ${disabled}>王国変更</button><button class="secondary danger" data-action="delete" data-id="${esc(player.fid)}" ${disabled}>削除</button></div></article>`;}).join('')||'<p class="empty">'+(state.players.length?'検索に一致するプレイヤーがいません。':'登録プレイヤーがいません。')+'</p>';controls();
  }
  async function connect(){
    if(preview){status('表示確認モード','サンプルのみ表示しています。Firebase・交換APIへの通信は行いません。');state.players=[{fid:'00000001',kid:'0000',name:'サンプルプレイヤー'}];render();return;}
    busy=true;controls();status('接続を確認中…','共有登録へ接続しています。');
    try{if(!cloud)throw Error('Firebase SDKを読み込めません。');if(!directApi)throw Error('交換処理を読み込めません。');await cloud.connect({players:[],history:{}},next=>{state=next;connected=true;render();status('共有登録・交換APIを利用できます','この画面から直接、公式交換APIへ送信します。','ready');},error=>{connected=false;status('共有登録に接続できません',error.message,'error');});connected=true;status('共有登録・交換APIを利用できます','この画面から直接、公式交換APIへ送信します。','ready');}
    catch(error){connected=false;status('接続できません',error.message,'error');$('setup').open=true;}finally{busy=false;render();}
  }
  async function change(operation){if(busy||!connected||preview)return;busy=true;render();try{await operation();}catch(error){status('処理を完了できませんでした',error.message,'error');}finally{busy=false;render();}}
  async function verifiedSave(player){const checked=await directApi.checkPlayer(player.fid,player.kid);if(!checked.ok)throw Error(checked.msg||'プレイヤーを確認できません。');await cloud.setPlayer(player);}
  $('list').addEventListener('click',event=>{const button=event.target.closest('button[data-action]');if(!button)return;const player=state.players.find(value=>value.fid===button.dataset.id);if(!player)return;change(async()=>{
    if(button.dataset.action==='delete'){if(confirm(`${player.name||player.fid} を共有登録から削除しますか？`))await cloud.deletePlayer(player.fid);}
    if(button.dataset.action==='rename'){const name=prompt('メモ名',player.name||'');if(name!==null)await cloud.setPlayer({...player,name});}
    if(button.dataset.action==='kingdom'){const kid=prompt('王国（公式交換APIでIDを確認します）',player.kid||state.kingdom);if(kid===null)return;if(!/^\d+$/.test(kid.trim()))throw Error('王国は数字で入力してください。');await verifiedSave({...player,kid:kid.trim()});}
  });});
  $('addBtn').addEventListener('click',()=>change(async()=>{
    const ids=[...new Set($('newFid').value.split(/[\s,、]+/).filter(Boolean))],kid=$('newKid').value.trim();
    if(!ids.length||ids.some(id=>!/^\d+$/.test(id))||!/^\d+$/.test(kid))throw Error('IDと王国は数字で入力してください。複数IDは改行かカンマで区切ります。');if(!confirm(ids.length+'人を公式交換APIで確認して共有登録しますか？'))return;
    const failed=[];for(let index=0;index<ids.length;index++){$('addBtn').textContent=`確認中 ${index+1}/${ids.length}`;try{await verifiedSave({fid:ids[index],kid,name:ids.length===1?$('newName').value.trim():''});}catch(error){failed.push(ids[index]+': '+error.message);}if(index+1<ids.length)await sleep(1200);}
    $('addBtn').textContent='確認して追加';if(!failed.length){$('newFid').value='';$('newName').value='';}else status('一部を登録できませんでした',failed.join(' / '),'error');
  }));
  $('startBtn').addEventListener('click',async()=>{
    if(busy||!connected||!directApi||preview)return;const cdk=$('cdk').value.trim();if(!cdk){$('cdk').focus();return;}const done=state.history[cdk]||{},targets=state.players.filter(player=>!done[player.fid]);
    if(!targets.length){$('progress').textContent=state.players.length?'全員分が記録済みです。':'先にプレイヤーを登録してください。';return;}if(!confirm(`コード「${cdk}」を ${targets.length}人へ送信して交換しますか？\n受取済み ${state.players.length-targets.length}人はスキップします。`))return;
    busy=running=true;stop=false;results.clear();render();let success=0,failed=0,aborted=false;$('batch-progress').max=targets.length;$('batch-progress').value=0;
    try{for(let index=0;index<targets.length&&!stop;index++){const player=targets[index];$('progress').textContent=`${index+1}/${targets.length} 人目を交換中…`;results.set(player.fid,{cls:'muted',msg:'交換中…'});render();let result;for(let attempt=0;attempt<3;attempt++){if(stop)break;result=await directApi.redeem(player.fid,player.kid||state.kingdom,cdk);if(!result.retry||attempt===2)break;results.set(player.fid,{cls:'warn',msg:result.msg+'（再試行待ち）'});render();for(let tick=0;tick<10&&!stop;tick++)await sleep(500);}if(!result)break;results.set(player.fid,{cls:result.done?'ok':'ng',msg:result.msg||'結果不明'});if(result.done){success++;await cloud.recordHistory(cdk,player.fid,result);}else failed++;$('batch-progress').value=index+1;render();if(result.bad_cdk){stop=true;status('コードを確認してください',result.msg,'error');break;}if(index+1<targets.length&&!stop)await sleep(1200);}}
    catch(error){aborted=true;stop=true;status('通信が中断しました',error.message,'error');for(const [id,result]of results)if(result.msg==='交換中…')results.set(id,{cls:'warn',msg:'結果未確認。共有履歴とゲーム内を確認してください。'});}
    finally{running=false;busy=false;render();$('progress').textContent=`${stop?'中止':'完了'}：成功・記録済 ${success} / 失敗 ${failed}`+(aborted?'（通信結果未確認あり）':'');}
  });
  $('stopBtn').addEventListener('click',()=>{stop=true;controls();$('progress').textContent='中止を受け付けました。送信中の1件があれば完了を待ちます。';});$('cdk').addEventListener('input',()=>{results.clear();render();});$('search').addEventListener('input',render);$('retry').addEventListener('click',connect);addEventListener('beforeunload',event=>{if(running){event.preventDefault();event.returnValue='';}});connect();
})();

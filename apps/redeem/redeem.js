(() => {
 'use strict';
 const $=id=>document.getElementById(id),preview=new URLSearchParams(location.search).get('preview')==='1';
 const api=new URL('../../api/redeem-tool/',location.href);
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let state={kingdom:'2856',players:[],history:{}},connected=false,busy=false,running=false,stop=false;
 const results=new Map();
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 function status(title,message,kind=''){$('connection-title').textContent=title;$('connection-message').textContent=message;document.querySelector('.connection').className='connection '+kind;}
 function controls(){for(const id of ['startBtn','addBtn','newFid','newKid','newName'])$(id).disabled=!connected||busy||preview;$('retry').disabled=busy||preview;$('cdk').disabled=running;$('stopBtn').disabled=!running||stop;}
 async function request(route,body){
  if(preview)throw Error('表示確認モードでは通信しません。');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),body?40000:8000);
  try{
   const response=await fetch(new URL(route,api),{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw Error(response.status===404?'交換APIがありません。start_hub.bat で起動してください。':'交換サーバーが応答できません（HTTP '+response.status+'）。');
   if(!response.headers.get('content-type')?.includes('application/json'))throw Error('交換APIではない応答です。start_hub.bat で起動してください。');
   const value=await response.json();if(value.ok===false)throw Error(value.msg||'処理に失敗しました。');return value;
  }catch(error){if(error.name==='AbortError')throw Error('通信がタイムアウトしました。送信済みの交換は完了している可能性があります。履歴を確認してから再操作してください。');throw error;}
  finally{clearTimeout(timer);}
 }
 async function refresh(){const next=await request('state');if(!Array.isArray(next.players)||!next.history)throw Error('登録データの形式を確認してください。');state=next;render();}
 function render(){
  $('count').textContent=state.players.length+'人';
  const query=$('search').value.trim().toLowerCase(),done=state.history[$('cdk').value.trim()]||{};
  const players=state.players.filter(p=>[p.name,p.fid,p.kid].join(' ').toLowerCase().includes(query));
  $('list').innerHTML=players.map(p=>{const r=results.get(p.fid)||(done[p.fid]?{cls:'muted',msg:'記録済：'+done[p.fid].msg}:null),disabled=busy||!connected||preview?'disabled':'';
   return `<article class="player"><h3>${esc(p.name||'名前なし')}</h3><div class="player-meta">ID ${esc(p.fid)} · 王国 ${esc(p.kid||state.kingdom)}</div><p class="player-result ${r?.cls||'muted'}">${esc(r?.msg||'未実行')}</p><div class="player-actions"><button class="secondary" data-action="rename" data-id="${esc(p.fid)}" ${disabled}>名前編集</button><button class="secondary" data-action="kingdom" data-id="${esc(p.fid)}" ${disabled}>王国変更</button><button class="secondary danger" data-action="delete" data-id="${esc(p.fid)}" ${disabled}>削除</button></div></article>`;
  }).join('')||'<p class="empty">'+(state.players.length?'検索に一致するプレイヤーがいません。':'登録プレイヤーがいません。')+'</p>';
  controls();
 }
 async function connect(){
  if(preview){status('表示確認モード','サンプルのみ表示しています。登録情報の取得・保存・交換は行いません。');state.players=[{fid:'00000001',kid:'0000',name:'サンプルプレイヤー'}];render();return;}
  busy=true;controls();status('接続を確認中…','ローカル交換サーバーを確認しています。');
  try{if(location.protocol==='file:')throw Error('ファイルを直接開いています。start_hub.bat を実行し、自動で開くURLを使用してください。');const health=await request('health');if(health.service!=='wos-redeem-hub'||!health.ready)throw Error('交換機能を読み込めません。start_hub.bat を再起動してください。');await refresh();connected=true;$('local-link').hidden=true;status('交換サーバーに接続済み','登録・履歴はこのPC内だけに保存されます。','ready');}
  catch(error){connected=false;const local=/^(127\.0\.0\.1|localhost)$/.test(location.hostname||'');$('local-link').hidden=local;status('交換にはローカル起動が必要です',error.message+' start_hub.bat を起動してください。','error');$('setup').open=true;}
  finally{busy=false;render();}
 }
 async function change(operation){if(busy||!connected||preview)return;busy=true;render();try{await operation();await refresh();}catch(error){status('処理を完了できませんでした',error.message,'error');}finally{busy=false;render();}}
 $('list').addEventListener('click',event=>{const button=event.target.closest('button[data-action]');if(!button)return;const p=state.players.find(x=>x.fid===button.dataset.id);if(!p)return;change(async()=>{
  if(button.dataset.action==='delete'){if(!confirm(`${p.name||p.fid} を登録から削除しますか？`))return;await request('players/delete',{fid:p.fid});}
  if(button.dataset.action==='rename'){const name=prompt('メモ名',p.name||'');if(name!==null)await request('players/rename',{fid:p.fid,name});}
  if(button.dataset.action==='kingdom'){const kid=prompt('王国（変更すると外部サーバーへID確認を送信します）',p.kid||state.kingdom);if(kid===null)return;if(!/^\d+$/.test(kid.trim()))throw Error('王国は数字で入力してください。');await request('players',{fid:p.fid,kid:kid.trim()});}
 });});
 $('addBtn').addEventListener('click',()=>change(async()=>{
  const ids=[...new Set($('newFid').value.split(/[\s,、]+/).filter(Boolean))],kid=$('newKid').value.trim();
  if(!ids.length||ids.some(id=>!/^\d+$/.test(id))||!/^\d+$/.test(kid))throw Error('IDと王国は数字で入力してください。複数IDは改行かカンマで区切ります。');
  if(!confirm(ids.length+'人のID・王国を外部サーバーへ送信して確認・登録しますか？'))return;
  const failed=[];
  for(let i=0;i<ids.length;i++){ $('addBtn').textContent=`確認中 ${i+1}/${ids.length}`;try{await request('players',{fid:ids[i],kid,...(ids.length===1?{name:$('newName').value.trim()}:{})});}catch(error){failed.push(ids[i]+': '+error.message);}if(i+1<ids.length)await sleep(1200);}
  $('addBtn').textContent='確認して追加';if(!failed.length){$('newFid').value='';$('newName').value='';}else status('一部を登録できませんでした',failed.join(' / '),'error');
 }));
 $('startBtn').addEventListener('click',async()=>{
  if(busy||!connected||preview)return;const cdk=$('cdk').value.trim();if(!cdk){$('cdk').focus();return;}
  const done=state.history[cdk]||{},targets=state.players.filter(p=>!done[p.fid]);
  if(!targets.length){$('progress').textContent=state.players.length?'全員分が記録済みです。':'先にプレイヤーを登録してください。';return;}
  if(!confirm(`コード「${cdk}」を ${targets.length}人へ送信して交換しますか？\n受取済み ${state.players.length-targets.length}人はスキップします。`))return;
  busy=running=true;stop=false;results.clear();render();let success=0,failed=0,aborted=false;
  $('batch-progress').max=targets.length;$('batch-progress').value=0;
  try{for(let i=0;i<targets.length&&!stop;i++){
   const p=targets[i];$('progress').textContent=`${i+1}/${targets.length} 人目を交換中…`;results.set(p.fid,{cls:'muted',msg:'交換中…'});render();
   let result;for(let attempt=0;attempt<3;attempt++){if(stop)break;result=await request('redeem',{fid:p.fid,cdk});if(!result.retry||attempt===2)break;results.set(p.fid,{cls:'warn',msg:result.msg+'（再試行待ち）'});render();for(let tick=0;tick<10&&!stop;tick++)await sleep(500);}
   if(!result)break;results.set(p.fid,{cls:result.done?'ok':'ng',msg:result.msg||'結果不明'});result.done?success++:failed++;$('batch-progress').value=i+1;render();
   if(result.bad_cdk){stop=true;status('コードを確認してください',result.msg,'error');break;}if(i+1<targets.length&&!stop)await sleep(1200);
  }}catch(error){aborted=true;stop=true;status('通信が中断しました',error.message,'error');for(const [id,r]of results)if(r.msg==='交換中…')results.set(id,{cls:'warn',msg:'結果未確認。再接続して履歴を確認してください。'});}
  finally{running=false;try{await refresh();}catch(error){connected=false;status('履歴を再取得できません',error.message,'error');}busy=false;render();$('progress').textContent=`${stop?'中止':'完了'}：成功・記録済 ${success} / 失敗 ${failed}`+(aborted?'（通信結果未確認あり）':'');}
 });
 $('stopBtn').addEventListener('click',()=>{stop=true;controls();$('progress').textContent='中止を受け付けました。送信中の処理があれば完了を待ちます。';});
 $('cdk').addEventListener('input',()=>{results.clear();render();});$('search').addEventListener('input',render);$('retry').addEventListener('click',connect);
 addEventListener('beforeunload',event=>{if(running){event.preventDefault();event.returnValue='';}});
 connect();
})();

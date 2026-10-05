(() => {
  'use strict';
  const U=window.FormUtils, $=id=>document.getElementById(id);
  const preview=new URLSearchParams(location.search).get('preview')==='1';
  const config={
    apiKey: "AIzaSyBv8lGWjlD4LRZmZqzZrzaslWnRp-aq-sI",
    authDomain: "form-14af5.firebaseapp.com",
    projectId: "form-14af5",
    storageBucket: "form-14af5.firebasestorage.app",
    messagingSenderId: "345951004267",
    appId: "1:345951004267:web:64cade0b3a146e69a4f32e"
  };
  let links={}, backend=null, ready=false, attempt=0, busy=false, editField='', returnFocus=null, toastTimer;
  function status(message,error=false){$('status').textContent=message;$('status').dataset.error=String(error);$('retry').hidden=!error;}
  function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
  function refreshButtons(){document.querySelectorAll('[data-field]').forEach(btn=>{
    btn.disabled=!ready;
    if(btn.dataset.action==='open'){
      const hasLink=!!links[btn.dataset.field];
      btn.dataset.empty=String(!hasLink);btn.title=hasLink?'別タブで開く':'リンク未設定';
    }
  });}
  function createPair(id,label){
    const block=document.createElement('div');block.className='link-pair';
    if(label){const heading=document.createElement('h3');heading.textContent=label;block.append(heading);}
    for(const [type,name] of [['form','申請フォーム'],['sheet','スプレッドシート']]){
      const row=document.createElement('div');row.className='link-row';
      const open=document.createElement('button');open.className='open-link '+type;open.textContent=name+' ↗';open.dataset.field=id+'_'+type;open.dataset.action='open';
      const edit=document.createElement('button');edit.className='edit-link';edit.textContent='編集';edit.dataset.field=id+'_'+type;edit.dataset.action='edit';edit.setAttribute('aria-label',(label||id)+' '+name+'のリンクを編集');
      row.append(open,edit);block.append(row);
    }
    return block;
  }
  function buildUI(){
    for(const [index,section] of U.sections.entries()){
      const card=document.createElement('section');card.className='card';
      const title=document.createElement('h2');title.textContent=String(index+1).padStart(2,'0')+' / '+section.label;card.append(title);
      for(const sub of section.subs||[{id:section.id,label:''}])card.append(createPair(sub.id,sub.label));
      const label=document.createElement('label');label.textContent='この端末のメモ';label.htmlFor='memo-'+section.id;
      const memo=document.createElement('textarea');memo.id=label.htmlFor;memo.dataset.id=section.id;memo.rows=4;memo.placeholder='必要なことをメモ…';
      const note=document.createElement('p');note.className='memo-note';note.id='note-'+section.id;note.textContent='ブラウザのデータを消すとメモも消えます。';
      try{memo.value=preview?'':localStorage.getItem(U.memoKey(section.id))||'';}catch(_){note.textContent='端末保存が利用できません。この画面内のみ保持します。';}
      memo.addEventListener('input',()=>{
        if(preview){note.textContent='プレビューのメモは保存されません。';return;}
        try{localStorage.setItem(U.memoKey(section.id),memo.value);note.textContent='この端末に保存済み（ブラウザのデータ削除で消去）';}
        catch(_){note.textContent='保存できませんでした。閉じる前にメモをコピーしてください。';}
      });
      card.append(label,memo,note);$('sections').append(card);
    }
    refreshButtons();
  }
  async function connect(){
    const token=++attempt;ready=false;refreshButtons();status(preview?'プレビュー：共有データには接続しません。':'共有リンクを読み込み中…');
    if(preview){links={};ready=true;refreshButtons();return;}
    const timer=setTimeout(()=>{
      if(token!==attempt)return;
      attempt++;status('接続に時間がかかっています。通信やアクセス権限を確認し、再接続してください。',true);
    },15000);
    try{
      const [appApi,authApi,dbApi]=await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')
      ]);
      if(token!==attempt)return;
      const app=appApi.getApps().find(a=>a.name==='wos-forms')||appApi.initializeApp(config,'wos-forms');
      await authApi.signInAnonymously(authApi.getAuth(app));
      if(token!==attempt)return;
      const ref=dbApi.doc(dbApi.getFirestore(app),'settings','links');
      const snap=await dbApi.getDoc(ref);
      if(token!==attempt)return;
      links=U.readLinks(snap.exists()?snap.data():{});
      // Write only the edited field; never send a stale copy of all shared links.
      backend=patch=>dbApi.setDoc(ref,patch,{merge:true});
      ready=true;status('共有リンクに接続済み');refreshButtons();
    }catch(error){if(token===attempt){console.error(error);status('共有リンクを取得できません。通信・匿名認証・アクセス権限を確認してください。',true);}}
    finally{clearTimeout(timer);}
  }
  function closeModal(){if(busy)return;$('link-dialog').close();editField='';returnFocus?.focus();}
  $('sections').addEventListener('click',event=>{
    const btn=event.target.closest('button[data-field]');if(!btn||!ready)return;
    const field=btn.dataset.field;
    if(btn.dataset.action==='edit'){
      editField=field;returnFocus=btn;$('modal-input').value=links[field]||'';$('modal-error').textContent='';
      const owner=U.sections.flatMap(s=>s.subs||[s]).find(s=>field.startsWith(s.id+'_'));
      $('modal-title').textContent=(owner?.label||'リンク')+' / '+(field.endsWith('_form')?'申請フォーム':'スプレッドシート');
      $('link-dialog').showModal();$('modal-input').focus();
    }else{
      try{const url=U.safeUrl(links[field]);if(!url){toast('リンクが未設定です。「編集」から設定してください。');return;}window.open(url,'_blank','noopener,noreferrer');}
      catch(_){toast('保存されたURLが不正です。「編集」から修正してください。');}
    }
  });
  $('link-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!editField)return;
    let patch;try{patch=U.linkPatch(editField,$('modal-input').value);}catch(error){$('modal-error').textContent=error.message;return;}
    busy=true;$('modal-save').disabled=true;$('modal-cancel').disabled=true;$('modal-input').disabled=true;
    $('modal-error').textContent='保存中…';
    try{
      if(!preview){if(!ready||!backend)throw new Error('not connected');await backend(patch);}
      Object.assign(links,patch);refreshButtons();busy=false;closeModal();
      toast(preview?'プレビュー内のみ変更しました（共有設定は未変更）':'保存しました');
    }catch(error){console.error(error);$('modal-error').textContent='保存できませんでした。入力は残しています。通信・権限を確認して再試行してください。';}
    finally{busy=false;$('modal-save').disabled=false;$('modal-cancel').disabled=false;$('modal-input').disabled=false;}
  });
  $('modal-cancel').addEventListener('click',closeModal);
  $('link-dialog').addEventListener('cancel',event=>{event.preventDefault();closeModal();});
  $('retry').addEventListener('click',connect);
  buildUI();connect();
})();

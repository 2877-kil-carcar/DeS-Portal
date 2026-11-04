// The entrance is shown only for the bare portal URL. Deep links and previews
// keep opening their requested tool directly; no game state or login is changed.
(() => {
  'use strict';
  const params=new URLSearchParams(location.search);
  const active=!location.hash.slice(1)&&!location.pathname.endsWith('/standalone.html')&&
    (params.get('preview')!=='1'||params.get('entrance')==='1');
  let frame=null;
  const gate=window.DES_PORTAL_ENTRANCE={active,enter};
  if(active){document.documentElement.classList.add('portal-intro');document.title='ようこそDeSポータルへ';}
  function enter(){
    if(!gate.active)return;
    gate.active=false;
    frame?.remove();frame=null;
    const host=document.getElementById('portal-entrance');if(host)host.hidden=true;
    document.documentElement.classList.remove('portal-intro');
    for(const id of ['sidebar','mobile-dock']){const node=document.getElementById(id);if(node)node.inert=false;}
    const workspace=document.querySelector('.workspace');if(workspace)workspace.inert=false;
    if(!location.hash.slice(1))history.replaceState(null,'',location.pathname+location.search+'#redeem');
    window.dispatchEvent(new Event('des:portal-entered'));
    document.getElementById('main')?.focus({preventScroll:true});
  }
  addEventListener('message',event=>{
    if(!gate.active||!frame||event.source!==frame.contentWindow||event.origin!==location.origin)return;
    if(event.data?.type==='des:portal-enter')enter();
  });
  addEventListener('DOMContentLoaded',()=>{
    if(!gate.active)return;
    const host=document.getElementById('portal-entrance');if(!host){enter();return;}
    for(const id of ['sidebar','mobile-dock']){const node=document.getElementById(id);if(node)node.inert=true;}
    const workspace=document.querySelector('.workspace');if(workspace)workspace.inert=true;
    frame=document.createElement('iframe');frame.title='ようこそDeSポータルへ';frame.className='portal-entrance-frame';
    frame.src=new URL('./apps/entrance/index.html?v=3.81',location.href).href;
    frame.setAttribute('referrerpolicy','same-origin');host.hidden=false;host.append(frame);
  });
})();

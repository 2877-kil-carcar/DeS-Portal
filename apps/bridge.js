(() => {
  'use strict';
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  const origin = location.origin === 'null' ? '*' : location.origin;
  window.WOS_PANEL_ACTIVE = true;
  function ready() {
    if (parent !== window) parent.postMessage({ type:'wos:ready', path:location.pathname, title:document.title },origin);
    if (preview) document.documentElement.dataset.preview = 'true';
  }
  addEventListener('message',event => {
    if (event.source !== parent || (location.origin !== 'null' && event.origin !== location.origin)) return;
    if (event.data?.type !== 'wos:visibility' || typeof event.data.active !== 'boolean') return;
    window.WOS_PANEL_ACTIVE = event.data.active;
    document.documentElement.classList.toggle('wos-panel-inactive',!event.data.active);
    if (!event.data.active) document.querySelectorAll('video,audio').forEach(media=>media.pause());
    window.dispatchEvent(new CustomEvent('wos:visibility',{ detail:{active:event.data.active} }));
  });
  document.addEventListener('click',event=>{
    const anchor=event.target.closest('a[href]'); if(!anchor)return;
    try {const url=new URL(anchor.href); if(preview && url.origin===location.origin && /\.html$/.test(url.pathname)){url.searchParams.set('preview','1');anchor.href=url.href;}} catch(_){}
  },true);
  const style=document.createElement('style');style.textContent='.wos-panel-inactive *{animation-play-state:paused!important}';document.head.append(style);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();

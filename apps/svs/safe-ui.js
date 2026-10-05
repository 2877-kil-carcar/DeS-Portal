window.SVS_PREVIEW = new URLSearchParams(location.search).get('preview') === '1';
// Escape both JavaScript string syntax and HTML attribute syntax.
function htmlJsArg(value){
  return JSON.stringify(String(value)).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function copyText(text){
  try { if(navigator.clipboard?.writeText){ await navigator.clipboard.writeText(text); return; } } catch (_) {}
  const area=document.createElement('textarea'); area.value=text; area.readOnly=true;
  area.style.cssText='position:fixed;left:0;top:0;opacity:0';
  document.body.append(area); area.select(); area.setSelectionRange(0,text.length);
  try { if(!document.execCommand('copy')) throw new Error('copy unavailable'); }
  finally { area.remove(); }
}

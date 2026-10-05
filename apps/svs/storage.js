const listeners = {}

window.appState = {
  groups: [],
  users: [],
  logs: [],
  heroes: [],
  alliances: [],
  players: [],
  rallies: []
}

function cloneValue(value){
  if(Array.isArray(value)){
    return value.map(v=>{
      if(v && typeof v === "object"){
        return { ...v }
      }
      return v
    })
  }

  if(value && typeof value === "object"){
    return { ...value }
  }

  return value
}

function getState(key){
  return cloneValue(window.appState[key])
}

function setState(key, value){
  window.appState[key] = Array.isArray(value) ? value : []
  notify(key)
  notify("*")
}

function notify(key){
  if(!listeners[key]) return

  listeners[key].forEach(fn=>{
    try{
      fn(getState(key), key)
    }
    catch(err){
      console.error(err)
    }
  })
}

function subscribe(key, fn){
  if(!listeners[key]){
    listeners[key] = []
  }

  listeners[key].push(fn)
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// 追加ボタンの入力チェック（管理者のみ有効化）
function checkAddInput(inputId, btnId){
  const input = document.getElementById(inputId)
  const btn   = document.getElementById(btnId)
  if(!input || !btn) return
  if(!window.currentUser?.isAdmin) return
  btn.disabled = !input.value.trim()
}

function afterRender(){
  if(typeof applyPermission === "function"){
    applyPermission()
  }
  if(typeof updateBulkChangeBtn === "function"){
    updateBulkChangeBtn()
  }
  // 追加ボタン：入力なければ無効
  ;[
    ["heroName",    "addHeroBtn"],
    ["groupName",   "addGroupBtn"],
    ["allianceName","addAllianceBtn"]
  ].forEach(([inputId, btnId])=>{
    const input = document.getElementById(inputId)
    const btn   = document.getElementById(btnId)
    if(!input || !btn) return
    if(!window.currentUser?.isAdmin) return
    btn.disabled = !input.value.trim()
  })
}

window.getState = getState
window.setState = setState
window.subscribe = subscribe
window.escapeHtml = escapeHtml
window.afterRender = afterRender
window.checkAddInput = checkAddInput

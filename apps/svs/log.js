// ===========================
// 操作ログ管理
// ===========================

// --- 画面名取得 ---
function getActiveTabName(){

  const tabMap = {
    heroes:      "英雄",
    groups:      "グループ",
    alliances:   "同盟",
    players:     "プレイヤー",
    playerHeroes:"所持英雄",
    rally:       "集結",
    result:      "結果",
    countupTab:  "カウントアップ",
    userMgmt:    "ユーザー管理"
  }

  for(const [id, name] of Object.entries(tabMap)){
    const el = document.getElementById(id)
    if(el && el.style.display !== "none") return name
  }
  return "不明"
}

// --- 対象データ抽出 ---
function extractLogDetail(onclick){

  // onclick から ID を取り出す  例: deletePlayer('abc123') → abc123
  const idMatch = onclick.match(/'([^']+)'/)
  const id = idMatch ? idMatch[1] : null

  if(id){
    const players  = getState("players")  || []
    const rallies  = getState("rallies")  || []
    const groups   = getState("groups")   || []
    const alliances= getState("alliances")|| []
    const heroes   = getState("heroes")   || []

    // グループ名変更：旧名 → 新名
    if(onclick.includes("renameGroup")){
      const group = groups.find(g => g.id === id)
      const oldName = group ? group.name : "?"
      const input = document.getElementById("group_name_" + id)
      const newName = input ? input.value.trim() : "?"
      return `${oldName} → ${newName}`
    }

    // 同盟名変更：旧名 → 新名
    if(onclick.includes("renameAlliance")){
      const alliance = alliances.find(a => a.id === id)
      const oldName = alliance ? alliance.name : "?"
      const input = document.getElementById("alliance_name_" + id)
      const newName = input ? input.value.trim() : "?"
      return `${oldName} → ${newName}`
    }

    // プレイヤー名変更：旧名 → 新名
    if(onclick.includes("updatePlayerName")){
      const player = players.find(p => p.id === id)
      const oldName = player ? player.name : "?"
      const input = document.getElementById("name_" + id)
      const newName = input ? input.value.trim() : "?"
      return `${oldName} → ${newName}`
    }

    const player = players.find(p => p.id === id)
    if(player) return `${player.name}（${player.alliance || "未所属"}）`

    const rally = rallies.find(r => r.id === id)
    if(rally){
      const leader = players.find(p => p.id === rally.leaderId)
      const leaderName = leader ? leader.name : "不明"
      return `${leaderName} / ${rally.rate} / 行軍${rally.marchTime}秒`
    }

    const group = groups.find(g => g.id === id)
    if(group) return group.name

    const alliance = alliances.find(a => a.id === id)
    if(alliance) return alliance.name

    const hero = heroes.find(h => h.id === id)
    if(hero) return hero.name
  }

  // 追加系ボタン → フォーム入力値を取得
  const addInputMap = {
    addHero:     "heroName",
    addGroup:    "groupName",
    addAlliance: "allianceName",
    addPlayer:   "playerName"
  }

  for(const [fn, inputId] of Object.entries(addInputMap)){
    if(onclick.includes(fn)){
      const el = document.getElementById(inputId)
      if(el && el.value) return el.value
    }
  }

  // 一括変更
  if(onclick.includes("bulkChangeAlliance")){
    const el = document.getElementById("bulkAlliance")
    return el ? `→ ${el.value || "未所属"}` : ""
  }

  return ""
}

// --- ログ保存 ---
async function saveLog(screen, action, detail){

  try{
    const now = new Date()
    const pad = n => String(n).padStart(2,"0")
    const timeStr =
      `${now.getFullYear()}/${pad(now.getMonth()+1)}/${pad(now.getDate())} ` +
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

    await window.db.collection("logs").add({
      timeStr,
      username: window.currentUser?.username || "不明",
      screen,
      action,
      detail,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
  } catch(e){
    console.error("ログ保存エラー", e)
  }
}

// --- ログ表示（スーパー管理者のみ）---
function renderLogs(){

  if(!window.currentUser?.isSuperAdmin) return

  const logs = getState("logs") || []

  let html = `<h2>操作ログ</h2>`

  html += `<button onclick="deleteAllLogs()">ログ一括削除</button>`

  if(logs.length === 0){
    html += `<p>ログはありません</p>`
  } else {
    html += `
    <table>
    <tr>
      <th>時間</th>
      <th>ユーザー名</th>
      <th>画面</th>
      <th>操作</th>
      <th>対象データ</th>
    </tr>
    `

    // 新しい順に表示
    ;[...logs].reverse().forEach(log=>{
      html += `
      <tr>
        <td>${escapeHtml(log.timeStr || "")}</td>
        <td>${escapeHtml(log.username || "")}</td>
        <td>${escapeHtml(log.screen || "")}</td>
        <td>${escapeHtml(log.action || "")}</td>
        <td>${escapeHtml(log.detail || "")}</td>
      </tr>
      `
    })

    html += `</table>`
  }

  const el = document.getElementById("logTab")
  if(el) el.innerHTML = html
}

// --- 2カ月超えログ自動削除（誰でも開いたら実行）---
async function cleanOldLogs(){

  try{
    const limit = new Date()
    limit.setMonth(limit.getMonth() - 2)

    const snap = await window.db.collection("logs")
      .where("createdAt", "<", limit)
      .get()

    if(snap.empty) return

    const batch = window.db.batch()
    snap.forEach(doc => batch.delete(doc.ref))
    await batch.commit()

    console.log(`古いログ ${snap.size}件 を削除しました`)
  } catch(e){
    console.error("ログ削除エラー", e)
  }
}

// --- ログ一括削除 ---
async function deleteAllLogs(){

  if(!confirm("すべてのログを削除しますか？")) return

  try{
    const snap = await window.db.collection("logs").get()

    if(snap.empty){
      alert("削除するログはありません")
      return
    }

    const batch = window.db.batch()
    snap.forEach(doc => batch.delete(doc.ref))
    await batch.commit()

    alert(`${snap.size}件のログを削除しました`)
  } catch(e){
    console.error("ログ一括削除エラー", e)
    alert("削除に失敗しました")
  }
}

// --- Firestoreリスナー起動（スーパー管理者ログイン後に呼ぶ）---
function startLogsSync(){

  window.logsUnsubscribe?.()
  window.logsUnsubscribe = window.db.collection("logs")
    .orderBy("createdAt", "asc")
    .onSnapshot(snapshot=>{
      const list = []
      snapshot.forEach(doc=>{
        const d = doc.data() || {}
        list.push({
          id: doc.id,
          timeStr:  d.timeStr  || "",
          username: d.username || "",
          screen:   d.screen   || "",
          action:   d.action   || "",
          detail:   d.detail   || ""
        })
      })
      setState("logs", list)
    }, err=>console.error("logs sync error", err))
}

// --- グローバルクリックリスナー（管理者操作を自動検知）---
document.addEventListener("click", function(e){

  if(!window.currentUser?.isAdmin) return

  const btn = e.target.closest("button")
  if(!btn || btn.disabled) return

  const onclick = btn.getAttribute("onclick") || ""
  if(!(window.ADMIN_ONCLICK_FNS || []).some(fn => onclick.includes(fn))) return

  // 個別にログ出力するものはここでは除外
  if(onclick.includes("addRally")) return
  if(onclick.includes("bulkChangeAlliance")) return
  // 集結の更新ボタン（編集フォームを開くだけ）はログ不要
  if(onclick.includes("startEdit")) return
  // 集結の保存は rally.js 側で変更前後を出力するためここでは除外
  if(onclick.includes("updateRally")) return

  const screen = getActiveTabName()

  // ログ不要な画面は除外
  const noLogScreens = ["カウントアップ", "ユーザー管理", "ログ", "結果"]
  if(noLogScreens.includes(screen)) return

  const detail = extractLogDetail(onclick)
  const action = btn.textContent.trim()

  saveLog(screen, "操作要求：" + action, detail)

}, true) // capture phase

subscribe("logs", renderLogs)

window.saveLog       = saveLog
window.renderLogs    = renderLogs
window.cleanOldLogs  = cleanOldLogs
window.startLogsSync = startLogsSync
window.deleteAllLogs = deleteAllLogs

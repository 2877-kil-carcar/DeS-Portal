function fcOptions(selected){

  const fcs = ["FC10","FC9","FC8","FC7","FC6","FC5","FC4","FC3","FC2","FC1","FC未満"]

  let html = `<option value="">--</option>`

  fcs.forEach(fc=>{
    html += `<option value="${fc}" ${selected===fc?"selected":""}>${fc}</option>`
  })

  return html
}

function groupOptions(selected){

  const groups = getState("groups")

  let html = `<option value="">なし</option>`

  groups.forEach(g=>{
    html += `<option value="${escapeHtml(g.name)}" ${selected === g.name ? 'selected' : ''}>${escapeHtml(g.name)}</option>`
  })

  return html
}

function allianceOptions(){

  const alliances = getState("alliances")

  let html = `<option value="">なし</option>`

  alliances.forEach(a=>{
    html += `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`
  })

  return html
}

function timeOptions(selected){

  const times = []
  for(let h = 21; h <= 23; h++){
    times.push(`${String(h).padStart(2,'0')}:00`)
    times.push(`${String(h).padStart(2,'0')}:30`)
  }
  times.push("24:00")

  let html = `<option value="">--</option>`
  times.forEach(t=>{
    html += `<option value="${t}" ${selected === t ? 'selected' : ''}>${t}</option>`
  })

  return html
}

async function addPlayer(){

  const players = getState("players")

  let name = document.getElementById("playerName").value.trim()
  let alliance = document.getElementById("playerAlliance").value

  if(!name){
    alert("プレイヤー名を入力してください")
    return
  }

  if(players.some(p=>p.name === name)){
    alert("登録済み")
    return
  }

  let group = document.getElementById("playerGroup").value

  await window.db.collection("players").add({
    name: name,
    alliance: alliance,
    group: group,
    heroes: [],
    active: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  })
}

async function togglePlayer(id, current){

  const update = { active: !current }
  if(current) update.joinTime = ""

  const batch = window.db.batch()
  batch.update(window.db.collection("players").doc(id), update)
  if(current){
    getState("rallies").filter(r=>r.leaderId===id && r.active).forEach(r=>{
      batch.update(window.db.collection("rallies").doc(r.id), {active:false})
    })
  }
  await batch.commit()
}

async function updatePlayerTime(id, time){

  await window.db.collection("players").doc(id).update({
    joinTime: time
  })
}

async function updatePlayerGroup(id, group){

  await window.db.collection("players").doc(id).update({
    group: group
  })
}

async function updatePlayerPriority(id, checked){

  await window.db.collection("players").doc(id).update({
    priority: checked
  })
}

async function updatePlayerFC(id, fc){

  await window.db.collection("players").doc(id).update({ fc })
}

async function updatePlayerT11(id, type, checked){

  const players = getState("players")
  const player = players.find(p => p.id === id)
  if(!player) return

  const t11 = Array.isArray(player.t11) ? [...player.t11] : []

  if(checked){
    if(!t11.includes(type)) t11.push(type)
  } else {
    const idx = t11.indexOf(type)
    if(idx !== -1) t11.splice(idx, 1)
  }

  await window.db.collection("players").doc(id).update({ t11 })
}

async function deletePlayer(id){

  const players = getState("players")
  const rallies = getState("rallies")

  const target = players.find(p=>p.id === id)
  if(!target) return

  if(!confirm(`プレイヤー「${target.name}」を削除しますか？`)){
    return
  }

  const batch = window.db.batch()

  batch.delete(window.db.collection("players").doc(id))

  rallies.forEach(r=>{
    if(r.leaderId === id){
      batch.delete(window.db.collection("rallies").doc(r.id))
    }
  })

  await batch.commit()
}

// ★追加：同盟人数コピー
function copyAllianceCounts(groups){

  let text = ""

  Object.keys(groups)
    .sort((a,b)=>a.localeCompare(b))
    .forEach(alliance=>{

      const activePlayers = groups[alliance].filter(p=>p.active !== false)
      if(activePlayers.length === 0) return

      const name = (alliance === "未所属" ? "未所属" : alliance).toUpperCase()

      const timeCounts = {}
      activePlayers.forEach(p=>{
        const t = p.joinTime || "未定"
        timeCounts[t] = (timeCounts[t] || 0) + 1
      })

      const sortedTimes = Object.keys(timeCounts).sort((a,b)=>{
        if(a === "未定") return 1
        if(b === "未定") return -1
        return a.localeCompare(b)
      })

      text += `${name}\n`
      sortedTimes.forEach(t=>{
        text += `${t} ${timeCounts[t]}名\n`
      })
    })

  copyText(text.trim())
    .then(()=>{
      alert("コピーしました")
    })
    .catch(()=>{
      alert("コピー失敗")
    })
}

// ★追加：同盟参加FC数コピー
function copyAllianceFcCounts(groups){

  const FC_ORDER = ["FC10","FC9","FC8","FC7","FC6","FC5","FC4","FC3","FC2","FC1","FC未満"]

  let text = ""

  Object.keys(groups)
    .sort((a,b)=>a.localeCompare(b))
    .forEach(alliance=>{

      const activePlayers = groups[alliance].filter(p=>p.active !== false)
      if(activePlayers.length === 0) return

      const fcCounts = {}
      activePlayers.forEach(p=>{
        if(p.fc) fcCounts[p.fc] = (fcCounts[p.fc] || 0) + 1
      })

      if(Object.keys(fcCounts).length === 0) return

      const name = (alliance === "未所属" ? "未所属" : alliance).toUpperCase()
      text += `${name}\n`

      FC_ORDER.forEach(fc=>{
        if(fcCounts[fc]) text += `${fc} ${fcCounts[fc]}名\n`
      })
    })

  copyText(text.trim())
    .then(()=>alert("コピーしました"))
    .catch(()=>alert("コピー失敗"))
}

// ★追加：同盟参加T11保有数コピー
function copyAllianceT11Counts(groups){

  const T11_TYPES = ["T11盾","T11槍","T11弓"]

  let text = ""

  Object.keys(groups)
    .sort((a,b)=>a.localeCompare(b))
    .forEach(alliance=>{

      const activePlayers = groups[alliance].filter(p=>p.active !== false)
      if(activePlayers.length === 0) return

      const name = (alliance === "未所属" ? "未所属" : alliance).toUpperCase()
      text += `${name}\n`

      T11_TYPES.forEach(type=>{
        // Firestore保存値は "盾"/"槍"/"弓"、表示ラベルは "T11盾"等なので末尾1文字で照合
        const key = type.slice(-1)
        const count = activePlayers.filter(p=>Array.isArray(p.t11)&&p.t11.includes(key)).length
        text += `${type} ${count}名\n`
      })
    })

  copyText(text.trim())
    .then(()=>alert("コピーしました"))
    .catch(()=>alert("コピー失敗"))
}

function renderPlayers(){

  const players = getState("players")

  let html = `
  <h2>プレイヤー登録</h2>

  <input id="playerName" placeholder="プレイヤー名" oninput="checkAddInput('playerName','addPlayerBtn')">

  <select id="playerGroup">
  ${groupOptions("")}
  </select>

  <select id="playerAlliance">
  ${allianceOptions()}
  </select>

  <button id="addPlayerBtn" onclick="addPlayer()" disabled>追加</button>
  <button onclick="copyAllianceCounts(window._allianceGroups)">同盟参加人数コピー</button>
  <button onclick="copyAllianceFcCounts(window._allianceGroups)">同盟参加FC数コピー</button>
  <button onclick="copyAllianceT11Counts(window._allianceGroups)">同盟参加T11保有数コピー</button>
  
  <hr>

  <h3>同盟一括変更</h3>

  <select id="bulkAlliance">
  ${allianceOptions()}
  </select>

  <button onclick="bulkChangeAlliance()">一括変更</button>
  `

  const sorted = players.slice().sort((a,b)=>{

    let aAlliance = a.alliance || ""
    let bAlliance = b.alliance || ""

    let c = aAlliance.localeCompare(bAlliance)
    if(c !== 0) return c

    return a.name.localeCompare(b.name)
  })

  const groups = Object.create(null)

  sorted.forEach(p=>{
    const key = p.alliance || "未所属"
    if(!groups[key]) groups[key] = []
    groups[key].push(p)
  })

  // ★コピー用に保持
  window._allianceGroups = groups

  Object.keys(groups).forEach(alliance=>{

    const count = groups[alliance].length
    const activeCount = groups[alliance].filter(player=>player.active !== false).length

    html += `<details class="svs-fold alliance-fold">
    <summary><span>${escapeHtml(alliance)}</span><small>計${count}人・参加${activeCount}人</small></summary>`

    html += `
    <div class="table-wrap">
    <table style="min-width:max-content;">
    <tr>
    <th>一括変更</th>
    <th>プレイヤー</th>
    <th>グループ</th>
    <th>参加</th>
    <th>参加時間</th>
    <th>優先</th>
    <th>FC</th>
    <th>T11保有</th>
    <th></th>
    </tr>
    `
    groups[alliance].forEach(p=>{

      const isGorgeous = ["ディスティニー"].includes(p.name)
      const isActive = p.active !== false

      html += `
      <tr class="${isGorgeous ? "destiny-highlight" : ""}">
      <td>
        <input type="checkbox" id="chk_${p.id}" onchange="updateBulkChangeBtn()">
      </td>
      <td>
        <div style="text-align:center;">
          <input
            id="name_${p.id}"
            value="${escapeHtml(p.name)}"
            oninput="onPlayerNameInput('${p.id}')"
          >
        </div>

        <button
          id="btn_${p.id}"
          onclick="updatePlayerName('${p.id}')"
          disabled
        >
          更新
        </button>
      </td>
      <td>
      <select onchange="updatePlayerGroup('${p.id}', this.value)">
        ${groupOptions(p.group || "")}
      </select>
      </td>
      <td>
      <label class="switch">
      <input type="checkbox"
        ${isActive ? "checked" : ""}
        onchange="togglePlayer('${p.id}', ${isActive})">
      <span class="slider"></span>
      </label>
      </td>
      <td>
      <select
        id="time_${p.id}"
        onchange="updatePlayerTime('${p.id}', this.value)"
        ${!isActive ? "disabled" : ""}
      >
        ${timeOptions(p.joinTime || "")}
      </select>
      </td>
      <td>
      <label class="switch">
      <input type="checkbox"
        ${p.priority ? "checked" : ""}
        onchange="updatePlayerPriority('${p.id}', this.checked)">
      <span class="slider"></span>
      </label>
      </td>
      <td>
      <select onchange="updatePlayerFC('${p.id}', this.value)">
        ${fcOptions(p.fc || "")}
      </select>
      </td>
      <td>
      <label><input type="checkbox" ${(p.t11||[]).includes("盾")?"checked":""} onchange="updatePlayerT11('${p.id}','盾',this.checked)">T11盾</label>
      <label><input type="checkbox" ${(p.t11||[]).includes("槍")?"checked":""} onchange="updatePlayerT11('${p.id}','槍',this.checked)">T11槍</label>
      <label><input type="checkbox" ${(p.t11||[]).includes("弓")?"checked":""} onchange="updatePlayerT11('${p.id}','弓',this.checked)">T11弓</label>
      </td>
      <td>
      <button onclick="deletePlayer('${p.id}')">削除</button>
      </td>
      </tr>
      `
    })

    html += `</table></div></details>`
  })

  document.getElementById("players").innerHTML = html
  initPlayerInputs()
  afterRender()
}

async function updatePlayerName(id){

  const input = document.getElementById("name_" + id)
  const btn = document.getElementById("btn_" + id)

  if(!input || !btn) return

  const newName = input.value.trim()

  if(!newName){
    alert("名前を入力してください")
    return
  }

  const players = getState("players")

  if(players.some(p => p.name === newName && p.id !== id)){
    alert("同名のプレイヤーが存在します")
    return
  }

  // ★即無効化（2回押し防止の本体）
  btn.disabled = true

  try{
    await window.db.collection("players").doc(id).update({
      name: newName
    })
  }
  catch(e){
    console.error(e)
    alert("更新失敗")

    // ★失敗時だけ戻す
    btn.disabled = false
  }
}

function onPlayerNameInput(id){

  const input = document.getElementById("name_" + id)
  const btn = document.getElementById("btn_" + id)

  if(!input || !btn) return

  const original = input.dataset.original || ""
  const current = input.value.trim()

  const changed = original !== current

  btn.disabled = !changed

  // ★色変化
  if(changed){
    input.classList.add("changed-input")
  }else{
    input.classList.remove("changed-input")
  }
}

function hasUnsavedChanges(){

  const inputs = document.querySelectorAll("input[id^='name_']")

  for(const input of inputs){
    const original = input.dataset.original || ""
    const current = input.value.trim()

    if(original !== current){
      return true
    }
  }

  return false
}

window.addEventListener("beforeunload", function (e){

  if(!hasUnsavedChanges()) return

  e.preventDefault()
  e.returnValue = ""
})

function updateBulkChangeBtn(){

  const btn = document.querySelector("button[onclick='bulkChangeAlliance()']")
  if(!btn) return

  // 管理者以外は触らない（applyPermission が制御）
  if(!window.currentUser?.isAdmin) return

  const anyChecked = Array.from(document.querySelectorAll("input[id^='chk_']"))
    .some(chk => chk.checked)

  btn.disabled = !anyChecked
}

function initPlayerInputs(){

  const inputs = document.querySelectorAll("input[id^='name_']")

  inputs.forEach(input=>{

    const id = input.id.replace("name_", "")
    const btn = document.getElementById("btn_" + id)

    const current = input.value.trim()

    // ★必ずここで揃える
    input.dataset.original = current

    // ★状態確定
    if(btn){
      btn.disabled = true
    }

    input.classList.remove("changed-input")
  })
}

async function bulkChangeAlliance(){

  const players = getState("players")
  const alliance = document.getElementById("bulkAlliance").value

  if(!confirm("選択したプレイヤーの同盟を変更しますか？")){
    return
  }

  const batch = window.db.batch()

  let count = 0
  const targets = []

  players.forEach(p=>{

    const chk = document.getElementById("chk_" + p.id)

    if(chk && chk.checked){

      batch.update(
        window.db.collection("players").doc(p.id),
        { alliance: alliance }
      )

      targets.push(p)
      count++
    }
  })

  if(count === 0){
    alert("対象が選択されていません")
    return
  }

  await batch.commit()

  // 対象プレイヤーごとにログ出力
  if(typeof saveLog === "function"){
    targets.forEach(p=>{
      saveLog("プレイヤー", "一括変更", `${p.name}：${p.alliance || "未所属"} → ${alliance || "未所属"}`)
    })
  }

  alert(`${count}件変更しました`)
}


subscribe("players", renderPlayers)
subscribe("alliances", renderPlayers)
subscribe("groups", renderPlayers)
renderPlayers()

window.updateBulkChangeBtn = updateBulkChangeBtn
window.addPlayer = addPlayer
window.togglePlayer = togglePlayer
window.updatePlayerTime = updatePlayerTime
window.updatePlayerGroup = updatePlayerGroup
window.updatePlayerPriority = updatePlayerPriority
window.updatePlayerFC = updatePlayerFC
window.updatePlayerT11 = updatePlayerT11
window.deletePlayer = deletePlayer
window.renderPlayers = renderPlayers
window.copyAllianceCounts = copyAllianceCounts
window.copyAllianceFcCounts = copyAllianceFcCounts
window.copyAllianceT11Counts = copyAllianceT11Counts
window.bulkChangeAlliance = bulkChangeAlliance

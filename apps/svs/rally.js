let editingId = null // ★追加：編集中ID

function heroOptions(selected = ""){

  const heroMaster = getState("heroes")

  let html = `<option value="">なし</option>`

  heroMaster.forEach(h=>{
    const sel = h.name === selected ? "selected" : ""
    html += `<option value="${escapeHtml(h.name)}" ${sel}>${escapeHtml(h.name)}</option>`
  })

  return html
}

function clearRallyForm(){

  const rate1 = document.getElementById("rate1")
  const rate2 = document.getElementById("rate2")
  const rate3 = document.getElementById("rate3")
  const marchTime = document.getElementById("marchTime")

  if(rate1) rate1.value = ""
  if(rate2) rate2.value = ""
  if(rate3) rate3.value = ""
  if(marchTime) marchTime.value = ""

  for(let i = 1; i <= 4; i++){
    const hero = document.getElementById("hero" + i)
    const need = document.getElementById("need" + i)

    if(hero) hero.value = ""
    if(need) need.value = ""
  }
}

// ❌ loadRallyToFormは使わない（残すが未使用）

async function addRally(){

  const players = getState("players")

  const leaderId = document.getElementById("rallyLeader").value

  const r1 = Number(document.getElementById("rate1").value || 0)
  const r2 = Number(document.getElementById("rate2").value || 0)
  const r3 = Number(document.getElementById("rate3").value || 0)
  const marchTime = Number(document.getElementById("marchTime").value || 0)

  if(!leaderId){
    alert("集結主を選択してください")
    return
  }

  if(![r1,r2,r3].every(n=>Number.isFinite(n) && n >= 0 && n <= 100) || r1 + r2 + r3 !== 100){
    alert("割合合計は100にしてください")
    return
  }

  if(!Number.isInteger(marchTime) || marchTime < 0){
    alert("行軍時間は0以上の整数で入力してください")
    return
  }

  const rate = `${r1}.${r2}.${r3}`

  const heroes = []
  const heroNames = new Set()

  function getHero(heroId, needId){

    const hero = document.getElementById(heroId).value
    const needRaw = document.getElementById(needId).value

    if(!hero){
      return
    }

    const need = Number(needRaw)

    if(!Number.isInteger(need) || need < 1 || need > 4){
      throw new Error("人数は1～4で入力してください")
    }

    if(heroNames.has(hero)){
      throw new Error("同じ英雄は同一集結に重複登録できません")
    }

    heroNames.add(hero)
    heroes.push({ hero: hero, need: need })
  }

  try{
    getHero("hero1", "need1")
    getHero("hero2", "need2")
    getHero("hero3", "need3")
    getHero("hero4", "need4")
  }
  catch(e){
    alert(e.message)
    return
  }

  if(heroes.length === 0){
    alert("英雄を1つ以上登録してください")
    return
  }

  const total = heroes.reduce((sum, h) => sum + h.need, 0)

  if(total > 4){
    alert("英雄人数の合計は4までです")
    return
  }
  const leader = players.find(p=>p.id === leaderId)
  if(!leader){
    alert("集結主が見つかりません")
    return
  }

  // ★変更：常に新規追加
  await window.db.collection("rallies").add({
    leaderId: leaderId,
    rate: rate,
    marchTime: marchTime,
    heroes: heroes,
    active: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  })

  // 登録成功時のみログ出力
  if(typeof saveLog === "function"){
    const detail = `${leader.name} / ${rate} / 行軍${marchTime}秒`
    saveLog("集結", "登録", detail)
  }

  clearRallyForm()
}

// ★追加：更新処理
async function updateRally(id){

  const r1 = Number(document.getElementById("edit_rate1").value || 0)
  const r2 = Number(document.getElementById("edit_rate2").value || 0)
  const r3 = Number(document.getElementById("edit_rate3").value || 0)
  const marchTime = Number(document.getElementById("edit_marchTime").value || 0)

  if(![r1,r2,r3].every(n=>Number.isFinite(n) && n >= 0 && n <= 100) || r1 + r2 + r3 !== 100){
    alert("割合合計は100にしてください")
    return
  }

  if(!Number.isInteger(marchTime) || marchTime < 0){
    alert("行軍時間は0以上の整数で入力してください")
    return
  }

  const rate = `${r1}.${r2}.${r3}`

  const heroes = []
  const heroNames = new Set()

  try{
    for(let i = 1; i <= 4; i++){

      const hero = document.getElementById("edit_hero" + i).value
      const needRaw = document.getElementById("edit_need" + i).value

      if(!hero) continue

      const need = Number(needRaw)

      if(!Number.isInteger(need) || need < 1 || need > 4){
        throw new Error("人数は1～4で入力してください")
      }

      if(heroNames.has(hero)){
        throw new Error("同じ英雄は同一集結に重複登録できません")
      }

      heroNames.add(hero)
      heroes.push({ hero, need })
    }
  }
  catch(e){
    alert(e.message)
    return
  }

  if(heroes.length === 0){
    alert("英雄を1つ以上登録してください")
    return
  }

  const total = heroes.reduce((sum, h) => sum + h.need, 0)

  if(total > 4){
    alert("英雄人数の合計は4までです")
    return
  }

  // 変更前の状態を取得
  const rallies = getState("rallies")
  const players = getState("players")
  const before  = rallies.find(r => r.id === id)
  const leader  = before ? players.find(p => p.id === before.leaderId) : null
  const leaderName = leader ? leader.name : "不明"

  await window.db.collection("rallies").doc(id).update({
    rate,
    marchTime,
    heroes
  })

  // 保存成功後に変更前後をログ出力
  if(typeof saveLog === "function" && before){
    saveLog("集結", "保存（変更前）", `${leaderName} / ${before.rate} / 行軍${before.marchTime}秒`)
    saveLog("集結", "保存（変更後）", `${leaderName} / ${rate} / 行軍${marchTime}秒`)
  }

  editingId = null
  renderRally()
}

function startEdit(id){
  editingId = id
  renderRally()
}

function cancelEdit(){
  editingId = null
  renderRally()
}

async function toggleRally(id, current, el){

  const rallies = getState("rallies")
  const players = getState("players")
  const target = rallies.find(r=>r.id === id)
  if(!target) return

  const leader = players.find(p=>p.id === target.leaderId)

  // 参加OFFのプレイヤーは使用不可
  if(!current && leader && leader.active === false){
    alert("このプレイヤーは参加OFFのため使用できません")
    // チェックボックスを元の状態（OFF）に戻す
    if(el) el.checked = false
    return
  }

  const batch = window.db.batch()

  if(!current){
    rallies.forEach(r=>{
      if(r.leaderId === target.leaderId && r.id !== id && r.active){
        batch.update(
          window.db.collection("rallies").doc(r.id),
          { active:false }
        )
      }
    })
  }

  batch.update(
    window.db.collection("rallies").doc(id),
    { active: !current }
  )

  await batch.commit()
}

async function deleteRally(id){

  if(!confirm("削除しますか？")) return

  await window.db.collection("rallies").doc(id).delete()
}

function renderRally(){

  const players = getState("players")
  const rallies = getState("rallies")

  // ❌ normalize削除（全OFF許可）

  const currentLeaderSelect = document.getElementById("rallyLeader")
  const selectedLeaderId = currentLeaderSelect ? currentLeaderSelect.value : ""

  let html = `
  <h2>集結設定</h2>

  <div class="rally-form-fields">
  <label class="rally-form-field">集結主
  <select id="rallyLeader">
  `

  const sortedPlayers = players.slice().sort((a,b)=>{

    let aAlliance = a.alliance || ""
    let bAlliance = b.alliance || ""

    let c = aAlliance.localeCompare(bAlliance)
    if(c !== 0) return c

    return a.name.localeCompare(b.name)
  })

  const playerGroups = Object.create(null)

  sortedPlayers.forEach(p=>{
    const key = p.alliance || "未所属"
    if(!playerGroups[key]) playerGroups[key] = []
    playerGroups[key].push(p)
  })

  Object.keys(playerGroups).forEach(alliance=>{

    html += `<optgroup label="${escapeHtml(alliance)}">`

    playerGroups[alliance].forEach(p=>{
      const selected = p.id === selectedLeaderId ? "selected" : ""
      html += `<option value="${p.id}" ${selected}>${escapeHtml(p.name)}</option>`
    })

    html += `</optgroup>`
  })

  html += `
  </select></label>

  <label class="rally-form-field">行軍時間
    <span class="march-time-input"><input id="marchTime" type="number" min="0"><small>秒</small></span>
  </label>

  <label class="rally-form-field">割合
    <span class="rate-fields">
      <input id="rate1" class="rate-input" type="number" min="0" max="100" aria-label="盾の割合">
      <span>.</span>
      <input id="rate2" class="rate-input" type="number" min="0" max="100" aria-label="槍の割合">
      <span>.</span>
      <input id="rate3" class="rate-input" type="number" min="0" max="100" aria-label="弓の割合">
    </span>
  </label>
  </div>
  `

  html += `
  <div class="rally-row">
  英雄 <select id="hero1">${heroOptions()}</select>
  人数 <input id="need1" type="number" min="1" max="4">
  </div>

  <div class="rally-row">
  英雄 <select id="hero2">${heroOptions()}</select>
  人数 <input id="need2" type="number" min="1" max="4">
  </div>

  <div class="rally-row">
  英雄 <select id="hero3">${heroOptions()}</select>
  人数 <input id="need3" type="number" min="1" max="4">
  </div>

  <div class="rally-row">
  英雄 <select id="hero4">${heroOptions()}</select>
  人数 <input id="need4" type="number" min="1" max="4">
  </div>

  <button onclick="addRally()">登録</button>
  `

  const rallyGroups = Object.create(null)

  rallies.forEach(r=>{

    const player = players.find(p=>p.id === r.leaderId)
    const alliance = player && player.alliance ? player.alliance : "未所属"

    if(!rallyGroups[alliance]) rallyGroups[alliance] = []

    rallyGroups[alliance].push({
      ...r,
      leaderName: player ? player.name : "不明"
    })
  })

  Object.keys(rallyGroups).sort((a,b)=>a.localeCompare(b)).forEach(alliance=>{

    const activeCount = rallyGroups[alliance].filter(rally=>rally.active).length
    html += `<details class="svs-fold alliance-fold rally-alliance-fold">
    <summary><span>${escapeHtml(alliance)}</span><small>${rallyGroups[alliance].length}設定・使用中${activeCount}</small></summary>`

    html += `
    <div class="table-wrap">
    <table class="rally-table">
    <tr>
    <th>集結主</th>
    <th>使用</th>
    <th>割合</th>
    <th>行軍時間</th>
    <th>英雄</th>
    <th>人数</th>
    <th></th>
    </tr>
    `

    rallyGroups[alliance]
      .sort((a,b)=>{
        if(a.active !== b.active){
          return a.active ? -1 : 1
        }
        return a.leaderName.localeCompare(b.leaderName)
      })
    .forEach(r=>{

      const heroes = Array.isArray(r.heroes) ? r.heroes : []
      const isGorgeous = ["ディスティニー"].includes(r.leaderName)

      heroes.forEach((h,index)=>{

        const rowClasses = []
        if(r.active){
          rowClasses.push("active-rally")
        }
        if(isGorgeous && r.active){
          rowClasses.push("destiny-highlight")   // ★ここ変更
        }
        
        html += `
        <tr class="${rowClasses.join(" ")}">
        <td>${index === 0 ? escapeHtml(r.leaderName) : ""}</td>

        <td>
        ${index === 0 ? `<label class="switch">
        <input type="checkbox" ${r.active ? "checked" : ""} onchange="toggleRally('${r.id}', ${r.active}, this)">
        <span class="slider"></span>
        </label>` : ""}
        </td>

        <td>${index === 0 ? escapeHtml(r.rate) : ""}</td>
        <td>${index === 0 ? escapeHtml(r.marchTime ?? "") : ""}</td>
        <td>${escapeHtml(h.hero)}</td>
        <td>${escapeHtml(h.need)}</td>

        <td>
        ${index === 0 ? `<div style="white-space:nowrap;"><button onclick="startEdit('${r.id}')">更新</button> <button onclick="deleteRally('${r.id}')">削除</button></div>` : ""}
        </td>
        </tr>
        `
      })

      if(editingId === r.id){

        const rate = (r.rate || "").split(".")

        html += `
        <tr>
        <td colspan="7">
          <div style="padding:10px;border:1px solid #ccc;">
            行軍時間 <input id="edit_marchTime" value="${r.marchTime ?? ""}"><br>

            割合
            <input id="edit_rate1" value="${rate[0]||""}"> .
            <input id="edit_rate2" value="${rate[1]||""}"> .
            <input id="edit_rate3" value="${rate[2]||""}"><br>
        `

        for(let i=1;i<=4;i++){
          const h = r.heroes[i-1] || {}
          html += `
            英雄 <select id="edit_hero${i}">${heroOptions(h.hero || "")}</select>
            人数 <input id="edit_need${i}" value="${h.need||""}"><br>
          `
        }

        html += `
            <button onclick="updateRally('${r.id}')">保存</button>
            <button onclick="cancelEdit()">キャンセル</button>
          </div>
        </td>
        </tr>
        `
      }

    })

    html += `</table></div></details>`
  })

  document.getElementById("rally").innerHTML = html

  afterRender()
}

subscribe("players", renderRally)
subscribe("heroes", renderRally)
subscribe("rallies", renderRally)
renderRally()

window.addRally = addRally
window.updateRally = updateRally
window.startEdit = startEdit
window.cancelEdit = cancelEdit
window.toggleRally = toggleRally
window.deleteRally = deleteRally
window.renderRally = renderRally

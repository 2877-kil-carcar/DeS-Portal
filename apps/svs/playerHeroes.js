window.playerHeroesSelectedPlayerId = ""

function renderPlayerHeroes(){

  const players = getState("players")
  const heroes = getState("heroes")
  const container = document.getElementById("playerHeroes")

  if(players.length === 0){
    container.innerHTML = "<h2>所持英雄登録</h2><p>先にプレイヤー登録</p>"
    afterRender()
    return
  }

  if(!window.playerHeroesSelectedPlayerId || !players.some(p=>p.id === window.playerHeroesSelectedPlayerId)){
    window.playerHeroesSelectedPlayerId = players[0].id
  }

  // --- 並び替え ---
  const sorted = players.slice().sort((a,b)=>{
    const aa = a.alliance || ""
    const bb = b.alliance || ""
    const c = aa.localeCompare(bb)
    if(c !== 0) return c
    return a.name.localeCompare(b.name)
  })

  // --- グループ化 ---
  const groups = Object.create(null)
  sorted.forEach(p=>{
    const key = p.alliance || "未所属"
    if(!groups[key]) groups[key] = []
    groups[key].push(p)
  })

  let html = `
  <h2>所持英雄登録</h2>

  <select id="playerSelect" onchange="changePlayerHeroTarget(this.value)">
  `

  // --- optgroup ---
  Object.keys(groups).forEach(alliance=>{
    html += `<optgroup label="${escapeHtml(alliance)}">`

    groups[alliance].forEach(p=>{
      html += `<option value="${p.id}" ${p.id === window.playerHeroesSelectedPlayerId ? "selected" : ""}>
      ${escapeHtml(p.name)}
      </option>`
    })

    html += `</optgroup>`
  })

  html += `
  </select>

  <div id="heroList"></div>

  <button onclick="savePlayerHeroes()">保存</button>

  <hr>

  <h3>登録一覧</h3>
  `

  // =========================
  // 一覧テーブル
  // =========================

  Object.keys(groups).forEach(alliance=>{

    html += `<h4>${escapeHtml(alliance)}</h4>`

    html += `<div class="table-wrap">`  // ★追加

    html += `<table class="hero-table"><tr>
    <th class="sticky-col header-corner">
      英雄名 →<br>プレイヤー名 ↓
    </th>`
    
    heroes.forEach(h=>{
      html += `<th>${escapeHtml(h.name)}</th>`
    })

    html += `</tr>`

    groups[alliance].forEach(p=>{

      const isGorgeous = ["ディスティニー"].includes(p.name)

      html += `<tr class="${isGorgeous ? "destiny-highlight" : ""}">`
      html += `<td>${escapeHtml(p.name)}</td>`

      heroes.forEach(h=>{
        const has = Array.isArray(p.heroes) && p.heroes.includes(h.name)
        html += `<td>${has ? "●" : ""}</td>`
      })

      html += `</tr>`
    })

    html += `</table></div>` // ★閉じる
  })

  container.innerHTML = html

  renderHeroCheckbox()
  afterRender()
  if(typeof applyDestinyOverlay === 'function') applyDestinyOverlay()
}

function changePlayerHeroTarget(playerId){
  window.playerHeroesSelectedPlayerId = playerId
  renderHeroCheckbox()
}

function renderHeroCheckbox(){

  const players = getState("players")
  const heroMaster = getState("heroes")

  const player = players.find(p=>p.id === window.playerHeroesSelectedPlayerId)

  if(!player){
    document.getElementById("heroList").innerHTML = ""
    return
  }

  const owned = Array.isArray(player.heroes) ? player.heroes : []

  let html = ""

  heroMaster.forEach(h=>{
    let checked = owned.includes(h.name) ? "checked" : ""

    html += `
    <label>
    <input type="checkbox" value="${escapeHtml(h.name)}" ${checked}>
    ${escapeHtml(h.name)}
    </label><br>
    `
  })

  if(heroMaster.length === 0){
    html = "<p>先に英雄登録</p>"
  }

  document.getElementById("heroList").innerHTML = html
}

async function savePlayerHeroes(){

  const players = getState("players")
  const player = players.find(p=>p.id === window.playerHeroesSelectedPlayerId)

  if(!player){
    alert("プレイヤーが見つかりません")
    return
  }

  const checked = [...document.getElementById("heroList").querySelectorAll("input:checked")].map(x=>x.value)

  await window.db.collection("players").doc(player.id).update({
    heroes: checked
  })

  alert("保存しました")
}

subscribe("players", renderPlayerHeroes)
subscribe("heroes", renderPlayerHeroes)
renderPlayerHeroes()

window.renderPlayerHeroes = renderPlayerHeroes
window.renderHeroCheckbox = renderHeroCheckbox
window.savePlayerHeroes = savePlayerHeroes
window.changePlayerHeroTarget = changePlayerHeroTarget

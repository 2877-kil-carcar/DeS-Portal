window.playerHeroesSelectedPlayerId = ""

function playerHeroGeneration(hero){
  const generation = Number(hero.generation)
  return Number.isInteger(generation) && generation >= 1 && generation <= 17 ? generation : 0
}

function playerHeroGenerationGroups(heroes){
  const groups = new Map()

  heroes.slice().sort((a,b)=>{
    const ag = playerHeroGeneration(a) || 999
    const bg = playerHeroGeneration(b) || 999
    return ag - bg || a.name.localeCompare(b.name, "ja")
  }).forEach(hero=>{
    const generation = playerHeroGeneration(hero)
    if(!groups.has(generation)) groups.set(generation, [])
    groups.get(generation).push(hero)
  })

  return groups
}

function playerHeroAllianceGroups(players){
  const groups = Object.create(null)

  players.slice().sort((a,b)=>{
    const allianceOrder = (a.alliance || "").localeCompare(b.alliance || "", "ja")
    return allianceOrder || a.name.localeCompare(b.name, "ja")
  }).forEach(player=>{
    const alliance = player.alliance || "未所属"
    if(!groups[alliance]) groups[alliance] = []
    groups[alliance].push(player)
  })

  return groups
}

function renderPlayerHeroes(){

  const players = getState("players")
  const heroes = getState("heroes")
  const container = document.getElementById("playerHeroes")

  if(players.length === 0){
    container.innerHTML = "<h2>所持英雄登録</h2><p>先にプレイヤー登録</p>"
    afterRender()
    return
  }

  if(!window.playerHeroesSelectedPlayerId || !players.some(player=>player.id === window.playerHeroesSelectedPlayerId)){
    window.playerHeroesSelectedPlayerId = players.slice().sort((a,b)=>a.name.localeCompare(b.name, "ja"))[0].id
  }

  const allianceGroups = playerHeroAllianceGroups(players)
  const generationGroups = playerHeroGenerationGroups(heroes)
  const selectedPlayer = players.find(player=>player.id === window.playerHeroesSelectedPlayerId)

  let html = `
  <h2>所持英雄登録</h2>
  <div class="hero-target-bar">
    <label>プレイヤー
      <select id="playerSelect" onchange="changePlayerHeroTarget(this.value)">
  `

  Object.keys(allianceGroups).forEach(alliance=>{
    html += `<optgroup label="${escapeHtml(alliance)}">`
    allianceGroups[alliance].forEach(player=>{
      html += `<option value="${player.id}" ${player.id === window.playerHeroesSelectedPlayerId ? "selected" : ""}>${escapeHtml(player.name)}</option>`
    })
    html += `</optgroup>`
  })

  html += `
      </select>
    </label>
    <strong>${selectedPlayer ? escapeHtml(selectedPlayer.name) : ""}</strong>
    <span>${selectedPlayer ? escapeHtml(selectedPlayer.alliance || "未所属") : ""}</span>
  </div>
  <p class="section-guide">世代を開き、所持している英雄を選択してください。</p>
  <div class="hero-save-bar hero-save-top"><button onclick="savePlayerHeroes()">所持英雄を保存</button></div>
  <div id="heroList"></div>
  <div class="hero-save-bar hero-save-bottom"><button onclick="savePlayerHeroes()">所持英雄を保存</button></div>
  <hr>
  <div class="ownership-heading">
    <div><h3>登録一覧</h3><p class="section-guide">世代ごとに開くと、プレイヤーと所持英雄を一画面で確認できます。</p></div>
  </div>
  <div class="ownership-overview">
  `

  generationGroups.forEach((generationHeroes,generation)=>{
    const generationLabel = generation ? `第${generation}世代` : "世代未設定"
    const ownedCount = players.reduce((total,player)=>{
      const owned = Array.isArray(player.heroes) ? player.heroes : []
      return total + generationHeroes.filter(hero=>owned.includes(hero.name)).length
    },0)

    html += `<details class="svs-fold ownership-generation-fold">
      <summary><span>${generationLabel}</span><small>${generationHeroes.length}英雄・保有登録${ownedCount}件</small></summary>
      <div class="ownership-generation-body">`

    Object.keys(allianceGroups).forEach(alliance=>{
      html += `<section class="ownership-alliance">
        <h4>${escapeHtml(alliance)} <small>${allianceGroups[alliance].length}人</small></h4>
        <div class="ownership-grid" style="--hero-count:${generationHeroes.length}">
          <div class="owner-name owner-head">プレイヤー</div>`

      generationHeroes.forEach(hero=>{
        html += `<div class="owner-hero-head" title="${escapeHtml(hero.name)}">${escapeHtml(hero.name)}</div>`
      })

      allianceGroups[alliance].forEach(player=>{
        const owned = Array.isArray(player.heroes) ? player.heroes : []
        const gorgeousClass = player.name === "ディスティニー" ? " gorgeous-owner" : ""
        html += `<div class="owner-name${gorgeousClass}">${escapeHtml(player.name)}</div>`
        generationHeroes.forEach(hero=>{
          const hasHero = owned.includes(hero.name)
          html += `<div class="owner-mark ${hasHero ? "has" : ""}" aria-label="${escapeHtml(player.name)}：${escapeHtml(hero.name)} ${hasHero ? "所持" : "未所持"}">${hasHero ? "✓" : "—"}</div>`
        })
      })

      html += `</div></section>`
    })

    html += `</div></details>`
  })

  if(heroes.length === 0){
    html += `<p class="empty-state">先に英雄を登録してください。</p>`
  }

  html += `</div>`
  container.innerHTML = html

  renderHeroCheckbox()
  afterRender()
  if(typeof applyDestinyOverlay === "function") applyDestinyOverlay()
}

function changePlayerHeroTarget(playerId){
  window.playerHeroesSelectedPlayerId = playerId
  renderPlayerHeroes()
}

function renderHeroCheckbox(){

  const players = getState("players")
  const generationGroups = playerHeroGenerationGroups(getState("heroes"))
  const player = players.find(item=>item.id === window.playerHeroesSelectedPlayerId)
  const heroList = document.getElementById("heroList")

  if(!heroList || !player){
    if(heroList) heroList.innerHTML = ""
    return
  }

  const owned = Array.isArray(player.heroes) ? player.heroes : []
  let html = ""

  generationGroups.forEach((heroes,generation)=>{
    const generationLabel = generation ? `第${generation}世代` : "世代未設定"
    const ownedCount = heroes.filter(hero=>owned.includes(hero.name)).length

    html += `<details class="svs-fold hero-check-generation">
      <summary><span>${generationLabel}</span><small>${ownedCount}/${heroes.length} 所持</small></summary>
      <div class="hero-check-grid">`

    heroes.forEach(hero=>{
      const checked = owned.includes(hero.name) ? "checked" : ""
      html += `<label class="hero-check-card">
        <input type="checkbox" value="${escapeHtml(hero.name)}" ${checked}>
        <span>${escapeHtml(hero.name)}</span>
      </label>`
    })

    html += `</div></details>`
  })

  if(generationGroups.size === 0){
    html = "<p>先に英雄登録</p>"
  }

  heroList.innerHTML = html
}

async function savePlayerHeroes(){

  const players = getState("players")
  const player = players.find(item=>item.id === window.playerHeroesSelectedPlayerId)

  if(!player){
    alert("プレイヤーが見つかりません")
    return
  }

  const checked = [...document.getElementById("heroList").querySelectorAll("input:checked")].map(input=>input.value)

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

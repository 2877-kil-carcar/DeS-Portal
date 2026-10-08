async function addHero(name){

  const hero = (name || "").trim()

  if(!hero){
    alert("英雄名を入力してください")
    return
  }

  const heroes = getState("heroes")

  if(heroes.some(h=>h.name === hero)){
    alert("登録済みです")
    return
  }

  const generationInput = document.getElementById("heroGeneration")
  const generation = generationInput ? Number(generationInput.value) : 0

  await window.db.collection("heroes").add({
    name: hero,
    ...(generation >= 1 && generation <= 17 ? { generation } : {}),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  })
}

async function deleteHero(id){

  const heroes = getState("heroes")
  const players = getState("players")
  const rallies = getState("rallies")

  const target = heroes.find(h=>h.id === id)
  if(!target) return

  if(!confirm(`英雄「${target.name}」を削除しますか？`)){
    return
  }

  const batch = window.db.batch()

  batch.delete(window.db.collection("heroes").doc(id))

  players.forEach(player=>{
    if(Array.isArray(player.heroes) && player.heroes.includes(target.name)){
      batch.update(
        window.db.collection("players").doc(player.id),
        {
          heroes: player.heroes.filter(x=>x !== target.name)
        }
      )
    }
  })

  rallies.forEach(rally=>{
    const nextHeroes = (Array.isArray(rally.heroes) ? rally.heroes : []).filter(x=>x.hero !== target.name)

    if(nextHeroes.length !== (Array.isArray(rally.heroes) ? rally.heroes.length : 0)){
      batch.update(
        window.db.collection("rallies").doc(rally.id),
        {
          heroes: nextHeroes
        }
      )
    }
  })

  await batch.commit()
}

function renderHeroes(){

  const heroMaster = getState("heroes")
  const sorted = heroMaster.slice().sort((a,b)=>{
    const ag = Number(a.generation) || 999
    const bg = Number(b.generation) || 999
    return ag - bg || a.name.localeCompare(b.name, "ja")
  })
  const generationGroups = new Map()

  sorted.forEach(hero=>{
    const generation = Number(hero.generation)
    const key = generation >= 1 && generation <= 17 ? generation : 0
    if(!generationGroups.has(key)) generationGroups.set(key, [])
    generationGroups.get(key).push(hero)
  })

  let html = `
  <h2>英雄登録</h2>

  <div class="hero-add-row">
    <input id="heroName" placeholder="英雄名" oninput="checkAddInput('heroName','addHeroBtn')">
    <label>世代
      <select id="heroGeneration">
        ${Array.from({length:17},(_,index)=>`<option value="${index+1}" ${index===16 ? "selected" : ""}>第${index+1}世代</option>`).join("")}
      </select>
    </label>
    <button id="addHeroBtn" onclick="addHero(document.getElementById('heroName').value)" disabled>追加</button>
  </div>
  <p class="section-guide">世代をタップすると、その世代の英雄を開閉できます。</p>
  `

  generationGroups.forEach((heroes,generation)=>{
    const label = generation ? `第${generation}世代` : "世代未設定"
    html += `<details class="svs-fold hero-generation-fold">
      <summary><span>${label}</span><small>${heroes.length}英雄</small></summary>
      <div class="generation-hero-list">`

    heroes.forEach(h=>{
      html += `<div class="generation-hero-row">
        <strong>${escapeHtml(h.name)}</strong>
        <span>${generation ? `S${generation}` : "未設定"}</span>
        <button onclick="deleteHero('${h.id}')">削除</button>
      </div>`
    })

    html += `</div></details>`
  })

  if(heroMaster.length === 0){
    html += `<p class="empty-state">英雄が登録されていません。</p>`
  }

  document.getElementById("heroes").innerHTML = html
  afterRender()
}

subscribe("heroes", renderHeroes)
renderHeroes()

window.addHero = addHero
window.deleteHero = deleteHero
window.renderHeroes = renderHeroes

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

  await window.db.collection("heroes").add({
    name: hero,
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

  let html = `
  <h2>英雄登録</h2>

  <input id="heroName" placeholder="英雄名" oninput="checkAddInput('heroName','addHeroBtn')">

  <button id="addHeroBtn" onclick="addHero(document.getElementById('heroName').value)" disabled>追加</button>

  <table>
  <tr>
  <th>英雄</th>
  <th>世代</th>
  <th></th>
  </tr>
  `

  heroMaster.forEach(h=>{
    html += `
    <tr>
    <td>${escapeHtml(h.name)}</td>
    <td>${h.generation ? `S${h.generation}` : '追加登録'}</td>
    <td><button onclick="deleteHero('${h.id}')">削除</button></td>
    </tr>
    `
  })

  html += `</table>`

  document.getElementById("heroes").innerHTML = html
  afterRender()
}

subscribe("heroes", renderHeroes)
renderHeroes()

window.addHero = addHero
window.deleteHero = deleteHero
window.renderHeroes = renderHeroes

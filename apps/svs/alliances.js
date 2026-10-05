async function addAlliance(name){

  const allianceName = (name || "").trim()

  if(!allianceName){
    alert("同盟名を入力してください")
    return
  }

  const alliances = getState("alliances")

  if(alliances.some(a=>a.name === allianceName)){
    alert("登録済み")
    return
  }

  await window.db.collection("alliances").add({
    name: allianceName,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  })
}

async function renameAlliance(id){

  const alliances = getState("alliances")
  const players = getState("players")

  const target = alliances.find(a=>a.id === id)
  if(!target) return

  const input = document.getElementById("alliance_name_" + id)
  const newName = input.value.trim()

  if(!newName){
    alert("同盟名を入力してください")
    return
  }

  if(newName === target.name){
    return
  }

  if(alliances.some(a=>a.name === newName)){
    alert("同盟名が重複しています")
    return
  }

  if(!confirm(`同盟名を「${target.name}」→「${newName}」に変更しますか？`)){
    return
  }

  const batch = window.db.batch()

  // --- alliances更新 ---
  batch.update(
    window.db.collection("alliances").doc(id),
    { name: newName }
  )

  // --- players更新 ---
  players.forEach(player=>{
    if(player.alliance === target.name){
      batch.update(
        window.db.collection("players").doc(player.id),
        { alliance: newName }
      )
    }
  })

  await batch.commit()

  // ★更新後にoriginal更新
  input.dataset.original = newName

  // ★ボタン無効化
  const btn = document.getElementById("alliance_btn_" + id)
  if(btn) btn.disabled = true

  input.classList.remove("changed-input")

  alert("変更しました")
}

async function deleteAlliance(id){

  const alliances = getState("alliances")
  const players = getState("players")

  const target = alliances.find(a=>a.id === id)
  if(!target) return

  if(!confirm(`同盟「${target.name}」を削除しますか？`)){
    return
  }

  const batch = window.db.batch()

  batch.delete(window.db.collection("alliances").doc(id))

  players.forEach(player=>{
    if(player.alliance === target.name){
      batch.update(
        window.db.collection("players").doc(player.id),
        { alliance: "" }
      )
    }
  })

  await batch.commit()
}

function renderAlliances(){

  const alliances = getState("alliances")

  let html = `
  <h2>同盟登録</h2>

  <input id="allianceName" placeholder="同盟名" oninput="checkAddInput('allianceName','addAllianceBtn')">

  <button id="addAllianceBtn" onclick="addAlliance(document.getElementById('allianceName').value)" disabled>追加</button>

  <table>
  <tr>
  <th>同盟</th>
  <th></th>
  </tr>
  `

  alliances.forEach(a=>{
    html += `
    <tr>
    <td>
      <input 
        id="alliance_name_${a.id}"
        value="${escapeHtml(a.name)}"
        oninput="onAllianceNameInput('${a.id}')"
      >
      <button 
        id="alliance_btn_${a.id}"
        onclick="renameAlliance('${a.id}')"
        disabled
      >
        更新
      </button>
    </td>
    <td><button onclick="deleteAlliance('${a.id}')">削除</button></td>
    </tr>
    `
  })

  html += `</table>`

  document.getElementById("alliances").innerHTML = html
  initAllianceInputs()  // ★これ追加
  afterRender()
}

function onAllianceNameInput(id){

  const input = document.getElementById("alliance_name_" + id)
  const btn = document.getElementById("alliance_btn_" + id)

  if(!input || !btn) return

  const original = input.dataset.original || ""
  const current = input.value.trim()

  const changed = original !== current

  btn.disabled = !changed

  if(changed){
    input.classList.add("changed-input")
  }else{
    input.classList.remove("changed-input")
  }
}

function initAllianceInputs(){

  const inputs = document.querySelectorAll("input[id^='alliance_name_']")

  inputs.forEach(input=>{

    const id = input.id.replace("alliance_name_", "")
    const btn = document.getElementById("alliance_btn_" + id)

    const current = input.value.trim()

    // ★原本保持
    input.dataset.original = current

    // ★初期状態は必ず無効
    if(btn){
      btn.disabled = true
    }

    input.classList.remove("changed-input")
  })
}

subscribe("alliances", renderAlliances)
renderAlliances()

window.addAlliance = addAlliance
window.deleteAlliance = deleteAlliance
window.renameAlliance = renameAlliance
window.renderAlliances = renderAlliances
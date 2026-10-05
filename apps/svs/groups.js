async function addGroup(name){

  const groupName = (name || "").trim()

  if(!groupName){
    alert("グループ名を入力してください")
    return
  }

  const groups = getState("groups")

  if(groups.some(g=>g.name === groupName)){
    alert("登録済み")
    return
  }

  await window.db.collection("groups").add({
    name: groupName,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  })
}

async function renameGroup(id){

  const groups = getState("groups")
  const players = getState("players")

  const target = groups.find(g=>g.id === id)
  if(!target) return

  const input = document.getElementById("group_name_" + id)
  const newName = input.value.trim()

  if(!newName){
    alert("グループ名を入力してください")
    return
  }

  if(newName === target.name) return

  if(groups.some(g=>g.name === newName)){
    alert("グループ名が重複しています")
    return
  }

  if(!confirm(`グループ名を「${target.name}」→「${newName}」に変更しますか？`)){
    return
  }

  const batch = window.db.batch()

  batch.update(window.db.collection("groups").doc(id), { name: newName })

  players.forEach(player=>{
    if(player.group === target.name){
      batch.update(window.db.collection("players").doc(player.id), { group: newName })
    }
  })

  await batch.commit()

  input.dataset.original = newName

  const btn = document.getElementById("group_btn_" + id)
  if(btn) btn.disabled = true

  input.classList.remove("changed-input")

  alert("変更しました")
}

async function deleteGroup(id){

  const groups = getState("groups")
  const players = getState("players")

  const target = groups.find(g=>g.id === id)
  if(!target) return

  if(!confirm(`グループ「${target.name}」を削除しますか？`)){
    return
  }

  const batch = window.db.batch()

  batch.delete(window.db.collection("groups").doc(id))

  players.forEach(player=>{
    if(player.group === target.name){
      batch.update(window.db.collection("players").doc(player.id), { group: "" })
    }
  })

  await batch.commit()
}

function renderGroups(){

  const groups = getState("groups")

  let html = `
  <h2>グループ登録</h2>

  <input id="groupName" placeholder="グループ名" oninput="checkAddInput('groupName','addGroupBtn')">

  <button id="addGroupBtn" onclick="addGroup(document.getElementById('groupName').value)" disabled>追加</button>

  <table>
  <tr>
  <th>グループ</th>
  <th></th>
  </tr>
  `

  groups.forEach(g=>{
    html += `
    <tr>
    <td>
      <input
        id="group_name_${g.id}"
        value="${escapeHtml(g.name)}"
        oninput="onGroupNameInput('${g.id}')"
      >
      <button
        id="group_btn_${g.id}"
        onclick="renameGroup('${g.id}')"
        disabled
      >
        更新
      </button>
    </td>
    <td><button onclick="deleteGroup('${g.id}')">削除</button></td>
    </tr>
    `
  })

  html += `</table>`

  document.getElementById("groups").innerHTML = html
  initGroupInputs()
  afterRender()
}

function onGroupNameInput(id){

  const input = document.getElementById("group_name_" + id)
  const btn = document.getElementById("group_btn_" + id)

  if(!input || !btn) return

  const original = input.dataset.original || ""
  const current = input.value.trim()
  const changed = original !== current

  btn.disabled = !changed

  if(changed){
    input.classList.add("changed-input")
  } else {
    input.classList.remove("changed-input")
  }
}

function initGroupInputs(){

  const inputs = document.querySelectorAll("input[id^='group_name_']")

  inputs.forEach(input=>{

    const id = input.id.replace("group_name_", "")
    const btn = document.getElementById("group_btn_" + id)

    input.dataset.original = input.value.trim()

    if(btn) btn.disabled = true

    input.classList.remove("changed-input")
  })
}

subscribe("groups", renderGroups)
subscribe("players", renderGroups)
renderGroups()

window.addGroup = addGroup
window.deleteGroup = deleteGroup
window.renameGroup = renameGroup
window.renderGroups = renderGroups

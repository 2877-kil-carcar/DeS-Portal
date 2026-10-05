// ===========================
// ユーザー管理（isozaki専用）
// ===========================

function startUsersSync(){

  window.usersUnsubscribe?.()
  window.usersUnsubscribe = window.db.collection("users").onSnapshot(snapshot=>{

    const list = []

    snapshot.forEach(doc=>{
      const data = doc.data() || {}
      list.push({
        id: doc.id,
        username: data.username || "",
        password: data.password || "",
        isAdmin: data.isAdmin === true
      })
    })

    list.sort((a,b)=>a.username.localeCompare(b.username))

    setState("users", list)

  }, err=>console.error("users sync error", err))
}

async function toggleUserAdmin(id, current){

  await window.db.collection("users").doc(id).update({
    isAdmin: !current
  })
}

async function updateUserPassword(id){

  const input = document.getElementById("upw_" + id)
  const btn   = document.getElementById("upwbtn_" + id)

  if(!input || !btn) return

  const newPass = input.value.trim()

  if(!newPass){
    alert("パスワードを入力してください")
    return
  }

  btn.disabled = true

  try{
    await window.db.collection("users").doc(id).update({ password: newPass })
    input.dataset.original = newPass
    input.classList.remove("changed-input")
  } catch(e){
    console.error(e)
    alert("更新失敗")
    btn.disabled = false
  }
}

async function deleteUser(id){

  const users = getState("users") || []
  const target = users.find(u=>u.id === id)
  if(!target) return

  if(!confirm(`ユーザー「${target.username}」を削除しますか？`)) return

  await window.db.collection("users").doc(id).delete()
}

function onUserPasswordInput(id){

  const input = document.getElementById("upw_" + id)
  const btn   = document.getElementById("upwbtn_" + id)

  if(!input || !btn) return

  const changed = (input.dataset.original || "") !== input.value.trim()

  btn.disabled = !changed

  if(changed){
    input.classList.add("changed-input")
  } else {
    input.classList.remove("changed-input")
  }
}

function renderUsers(){

  if(!window.currentUser?.isSuperAdmin) return

  const users = getState("users") || []

  let html = `<h2>ユーザー管理</h2>`

  if(users.length === 0){
    html += `<p>登録ユーザーはいません</p>`
  } else {
    html += `
    <table>
    <tr>
      <th>ユーザー名</th>
      <th>パスワード</th>
      <th>管理者権限</th>
      <th></th>
    </tr>
    `

    users.forEach(u=>{
      html += `
      <tr>
        <td>${escapeHtml(u.username)}</td>
        <td>
          <input
            id="upw_${u.id}"
            value="${escapeHtml(u.password)}"
            oninput="onUserPasswordInput('${u.id}')"
          >
          <button
            id="upwbtn_${u.id}"
            onclick="updateUserPassword('${u.id}')"
            disabled
          >更新</button>
        </td>
        <td>
          <label class="switch">
          <input type="checkbox"
            ${u.isAdmin ? "checked" : ""}
            onchange="toggleUserAdmin('${u.id}', ${u.isAdmin})">
          <span class="slider"></span>
          </label>
        </td>
        <td>
          <button onclick="deleteUser('${u.id}')">削除</button>
        </td>
      </tr>
      `
    })

    html += `</table>`
  }

  document.getElementById("userMgmt").innerHTML = html
  initUserPasswordInputs()
}

function initUserPasswordInputs(){

  const users = getState("users") || []

  users.forEach(u=>{
    const input = document.getElementById("upw_" + u.id)
    const btn   = document.getElementById("upwbtn_" + u.id)

    if(input) input.dataset.original = input.value.trim()
    if(btn)   btn.disabled = true
    if(input) input.classList.remove("changed-input")
  })
}

subscribe("users", renderUsers)

window.startUsersSync = startUsersSync
window.toggleUserAdmin = toggleUserAdmin
window.updateUserPassword = updateUserPassword
window.deleteUser = deleteUser
window.onUserPasswordInput = onUserPasswordInput
window.renderUsers = renderUsers

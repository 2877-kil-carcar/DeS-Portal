// ===========================
// スーパー管理者（固定）
// ===========================
const SUPER_ADMIN = window.DES_ADMIN_CREDENTIALS || null

window.currentUser = null

// ===========================
// 登録ボタン
// 新規 → Firestore登録 + メール通知
// 既存 → パスワード照合してログイン
// ===========================
async function attemptRegister(){

  const username = document.getElementById("loginUsername").value.trim()
  const password = document.getElementById("loginPassword").value.trim()

  if(!username || !password){
    alert("ユーザー名とパスワードを入力してください")
    return
  }

  if(!SUPER_ADMIN){
    alert("管理者設定を読み込めません。画面を再読み込みしてください")
    return
  }

  // スーパー管理者チェック
  if(username === SUPER_ADMIN.username && password === SUPER_ADMIN.password){
    loginSuccess({ username, isAdmin: true, isSuperAdmin: true })
    return
  }

  try{
    const snap = await window.db.collection("users")
      .where("username", "==", username).limit(1).get()

    if(!snap.empty){
      // 同一ユーザー名は登録不可
      alert("このユーザー名は既に登録されています")
      return

    } else {
      // 新規登録
      const ref = await window.db.collection("users").add({
        username,
        password,
        isAdmin: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      })

      sendRegistrationEmail(username)

      loginSuccess({ username, isAdmin: false, isSuperAdmin: false, id: ref.id })

      alert(`「${username}」として登録しました。\n管理者の承認をお待ちください。`)
    }

  } catch(e){
    console.error(e)
    alert("エラーが発生しました")
  }
}

// ===========================
// 管理承認ボタン
// 管理者権限があるユーザーのみログイン可
// ===========================
async function attemptAdminLogin(){

  const username = document.getElementById("loginUsername").value.trim()
  const password = document.getElementById("loginPassword").value.trim()

  if(!username || !password){
    alert("ユーザー名とパスワードを入力してください")
    return
  }

  if(!SUPER_ADMIN){
    alert("管理者設定を読み込めません。画面を再読み込みしてください")
    return
  }

  // スーパー管理者チェック
  if(username === SUPER_ADMIN.username && password === SUPER_ADMIN.password){
    loginSuccess({ username, isAdmin: true, isSuperAdmin: true })
    return
  }

  try{
    const snap = await window.db.collection("users")
      .where("username", "==", username).limit(1).get()

    if(snap.empty){
      alert("ユーザーが存在しません")
      return
    }

    const doc = snap.docs[0]
    const data = doc.data()

    if(data.password !== password){
      alert("パスワードが違います")
      return
    }

    if(!data.isAdmin){
      alert("管理権限がありません")
      return
    }

    loginSuccess({
      username,
      isAdmin: true,
      isSuperAdmin: false,
      id: doc.id
    })

  } catch(e){
    console.error(e)
    alert("エラーが発生しました")
  }
}

// ===========================
// ポップアップ制御
// ===========================
let _loginMode = "register"

function showLoginPopup(mode){
  _loginMode = mode
  const title = document.getElementById("loginPopupTitle")
  if(title) title.textContent = mode === "admin" ? "管理者ログイン" : "管理者申請"

  const btn = document.getElementById("loginConfirmBtn")
  if(btn) btn.onclick = mode === "admin" ? attemptAdminLogin : attemptRegister

  const un = document.getElementById("loginUsername")
  const pw = document.getElementById("loginPassword")
  if(un) un.value = ""
  if(pw) pw.value = ""

  document.getElementById("loginPopup").style.display = "block"
  document.getElementById("loginOverlay").style.display = "block"
  if(un) un.focus()
}

function hideLoginPopup(){
  document.getElementById("loginPopup").style.display = "none"
  document.getElementById("loginOverlay").style.display = "none"
}

// ===========================
// ログイン成功処理
// ===========================
function loginSuccess(user){

  window.usersUnsubscribe?.()
  window.logsUnsubscribe?.()
  setState("users", [])
  setState("logs", [])
  document.getElementById("userMgmt").innerHTML = ""
  document.getElementById("logTab").innerHTML = ""
  document.getElementById("logTabBtn").style.display = "none"
  window.currentUser = user

  hideLoginPopup()

  // ログイン状態ラベル更新
  const label = document.getElementById("currentUserLabel")
  if(label){
    const role = user.isSuperAdmin ? "スーパー管理者" : user.isAdmin ? "管理者" : "閲覧者"
    label.textContent = `ログイン中: ${user.username}（${role}）`
  }

  // ユーザー管理タブ：isozakiのみ表示
  const userMgmtBtn = document.getElementById("userMgmtTabBtn")
  if(userMgmtBtn){
    userMgmtBtn.style.display = user.isSuperAdmin ? "" : "none"
  }

  // isozakiのみユーザー一覧リスナー・ログタブ表示
  if(user.isSuperAdmin){
    if(typeof startUsersSync === "function") startUsersSync()
    if(typeof startLogsSync === "function")  startLogsSync()
    if(typeof cleanOldLogs === "function") cleanOldLogs()
    const logTabBtn = document.getElementById("logTabBtn")
    if(logTabBtn) logTabBtn.style.display = ""
  }

  showTab("heroes")
  applyPermission()
}

// ===========================
// メール通知（formsubmit.co経由）
// ===========================
function sendRegistrationEmail(username){

  fetch("https://formsubmit.co/ajax/shunya3624716@gmail.com", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      subject: "【2856SvS補助ツール】新規ユーザー登録",
      message: `ユーザー「${username}」が新規登録しました。\n管理者画面から権限を設定してください。`
    })
  }).catch(e => console.error("メール送信エラー", e))
}

// ===========================
// 権限制御
// 管理者のみ操作可能な機能を制限する
// ===========================

// 管理者のみのonclick関数名リスト（log.jsからも参照）
window.ADMIN_ONCLICK_FNS = [
  // 英雄
  "addHero", "deleteHero",
  // グループ
  "addGroup", "renameGroup", "deleteGroup",
  // 同盟
  "addAlliance", "renameAlliance", "deleteAlliance",
  // プレイヤー
  "addPlayer", "bulkChangeAlliance", "updatePlayerName", "deletePlayer",
  "updatePlayerGroup", "updatePlayerPriority",
  // 集結
  "addRally", "startEdit", "updateRally", "deleteRally", "toggleRally"
]

// 管理者のみの入力欄ID
const ADMIN_INPUT_IDS = [
  "heroName",
  "groupName",
  "allianceName",
  "playerName",
  "playerAlliance",
  "playerGroup",
  "bulkAlliance"
]

// 管理者のみの入力欄IDプレフィックス
const ADMIN_INPUT_PREFIXES = [
  "group_name_",
  "alliance_name_"
]

function applyPermission(){

  // currentUser が null = 未ログイン = 閲覧者扱い
  const isAdmin = window.currentUser?.isAdmin === true

  // ★タブボタン：全員が全タブを閲覧可能
  document.querySelectorAll(".tabs button").forEach(btn=>{
    if(btn.id !== "userMgmtTabBtn") btn.disabled = false
  })

  // ★ボタン制御（onclick属性で判定）
  // btn_ / alliance_btn_ / group_btn_ は initInputs が管理するため除外
  document.querySelectorAll("button").forEach(btn=>{

    if(btn.closest("#loginModal")) return

    // 更新ボタンは値変化検知で制御するためここでは触らない
    if(btn.id && (
      btn.id.startsWith("btn_") ||
      btn.id.startsWith("alliance_btn_") ||
      btn.id.startsWith("group_btn_")
    )) return

    const onclick = btn.getAttribute("onclick") || ""
    const isAdminOnly = window.ADMIN_ONCLICK_FNS.some(fn => onclick.includes(fn))

    if(isAdminOnly){
      btn.disabled = !isAdmin
    }
  })

  // ★更新ボタン：非管理者は常にdisabled
  if(!isAdmin){
    document.querySelectorAll(
      "button[id^='btn_'], button[id^='alliance_btn_'], button[id^='group_btn_']"
    ).forEach(btn=>{
      btn.disabled = true
    })
  }

  // ★select・checkbox制御（onchange属性で判定）
  document.querySelectorAll("select, input[type='checkbox']").forEach(el=>{

    const onchange = el.getAttribute("onchange") || ""
    const isAdminOnly = window.ADMIN_ONCLICK_FNS.some(fn => onchange.includes(fn))

    if(isAdminOnly){
      el.disabled = !isAdmin
    }
  })

  // ★管理者のみの入力欄（ID完全一致）
  ADMIN_INPUT_IDS.forEach(id=>{
    const el = document.getElementById(id)
    if(el) el.disabled = !isAdmin
  })

  // ★管理者のみの入力欄（IDプレフィックス一致）
  ADMIN_INPUT_PREFIXES.forEach(prefix=>{
    document.querySelectorAll(`input[id^='${prefix}']`).forEach(el=>{
      el.disabled = !isAdmin
    })
  })

  // ★追加ボタン：管理者でも入力がなければ無効
  if(isAdmin){
    ;[
      ["heroName",    "addHeroBtn"],
      ["groupName",   "addGroupBtn"],
      ["allianceName","addAllianceBtn"],
      ["playerName",  "addPlayerBtn"]
    ].forEach(([inputId, btnId])=>{
      const input = document.getElementById(inputId)
      const btn   = document.getElementById(btnId)
      if(!input || !btn) return
      btn.disabled = !input.value.trim()
    })
  }
}

window.attemptRegister = attemptRegister
window.attemptAdminLogin = attemptAdminLogin
window.showLoginPopup = showLoginPopup
window.hideLoginPopup = hideLoginPopup
window.applyPermission = applyPermission

// { groupName: [{ leaderId, interval }] }
let countupState = {
  groupRows: Object.create(null)
}

// --- 描画 ---

function renderCountup(){

  const players = getState("players")
  const rallies = getState("rallies")
  const groups = getState("groups")

  let html = `<h2>カウントアップ</h2>`

  html += `グループ追加&nbsp;
  <select id="countupGroupSelect">
  <option value="">選択してください</option>`

  groups.forEach(g=>{
    html += `<option value="${escapeHtml(g.name)}">${escapeHtml(g.name)}</option>`
  })

  html += `</select>`
  html += `<button onclick="addGroupSection()">追加</button>`
  html += `<button onclick="resetCountup()">リセット</button>`

  Object.keys(countupState.groupRows).forEach(groupName=>{

    const rows = countupState.groupRows[groupName]

    const activeLeaders = rallies
      .filter(r=>r.active)
      .map(r=>{
        const p = players.find(p=>p.id === r.leaderId)
        return p ? { id:p.id, name:p.name, group:p.group||"" } : null
      })
      .filter(x=>x && x.group === groupName)

    const escaped = escapeHtml(groupName)

    html += `<div class="result-group">`
    html += `<h3>${escaped}&nbsp;<button onclick="removeGroupSection(${htmlJsArg(groupName)})">削除</button></h3>`

    html += `<div class="table-wrap"><table>
    <tr>
      <th>順</th>
      <th>集結</th>
      <th>間隔</th>
      <th></th>
    </tr>`

    rows.forEach((row,i)=>{

      html += `<tr>`
      html += `<td>${i+1}</td>`

      html += `<td>
        <select onchange="changeLeader(${htmlJsArg(groupName)}, ${i}, this.value)">
        <option value="">選択</option>`

      activeLeaders.forEach(l=>{
        const selected = l.id === row.leaderId ? "selected" : ""
        html += `<option value="${l.id}" ${selected}>${escapeHtml(l.name)}</option>`
      })

      html += `</select></td>`

      html += `<td>
        <input type="number" value="${row.interval||0}"
          onchange="changeInterval(${htmlJsArg(groupName)}, ${i}, this.value)">
      </td>`

      html += `<td>
        <button onclick="removeRow(${htmlJsArg(groupName)}, ${i})">削除</button>
      </td>`

      html += `</tr>`
    })

    html += `</table></div>`
    html += `<button onclick="addCountupRow(${htmlJsArg(groupName)})">行追加</button>`
    html += `</div>`
  })

  if(Object.keys(countupState.groupRows).length > 0){
    html += `<br><button onclick="calcCountup()">計算</button>`
  }

  html += `<div id="countupResult"></div>`

  document.getElementById("countupTab").innerHTML = html
}

// --- 操作系 ---

function addGroupSection(){

  const sel = document.getElementById("countupGroupSelect")
  const groupName = sel.value

  if(!groupName) return

  if(countupState.groupRows[groupName] !== undefined){
    alert("すでに追加済みです")
    return
  }

  countupState.groupRows[groupName] = []
  renderCountup()
}

function removeGroupSection(groupName){
  delete countupState.groupRows[groupName]
  renderCountup()
}

function addCountupRow(groupName){

  const rows = countupState.groupRows[groupName]
  if(!rows) return

  if(rows.length >= 10){
    alert("最大10件までです")
    return
  }

  rows.push({ leaderId:"", interval:0 })
  renderCountup()
}

function removeRow(groupName, i){
  countupState.groupRows[groupName].splice(i, 1)
  renderCountup()
}

function changeLeader(groupName, i, leaderId){

  const rows = countupState.groupRows[groupName]
  if(!rows) return

  const exists = rows.some((r,idx)=>idx!==i && r.leaderId === leaderId)
  if(exists){
    alert("同じ集結主は選べません")
    renderCountup()
    return
  }

  rows[i].leaderId = leaderId
}

function changeInterval(groupName, i, val){
  const number = Number(val);
  if(!Number.isFinite(number)){ alert("間隔は有限の数値を入力してください"); return; }
  countupState.groupRows[groupName][i].interval = number
}

function resetCountup(){
  countupState.groupRows = Object.create(null)
  renderCountup()
}

// --- 計算 ---

function calcCountup(){

  const rallies = getState("rallies")
  const players = getState("players")
  const selected = Object.entries(countupState.groupRows).flatMap(([group,rows])=>rows.filter(r=>r.leaderId).map(r=>({...r,group})));
  if(selected.some(r=>!rallies.some(x=>x.leaderId===r.leaderId && x.active) || !players.some(p=>p.id===r.leaderId && p.active!==false && (p.group||"")===r.group))){
    alert("選択した集結主の参加・グループ・集結状態が変わっています。選び直してください。"); return;
  }

  let html = `<h3>結果</h3>`

  Object.keys(countupState.groupRows).forEach(groupName=>{

    const rows = countupState.groupRows[groupName]
    const list = rows.filter(r=>r.leaderId)

    if(list.length === 0) return

    const data = list.map(r=>{
      const rally = rallies.find(x=>x.leaderId === r.leaderId && x.active)
      const player = players.find(p=>p.id === r.leaderId)
      return {
        name: player?.name || "不明",
        interval: r.interval,
        marchTime: rally?.marchTime || 0
      }
    })

    const base = Math.max(...data.map(r=>r.marchTime))

    const result = data.map(r=>{
      const time = r.marchTime !== base
        ? (base - r.marchTime) + r.interval
        : r.interval === 0 ? 0 : r.interval
      return { ...r, time }
    }).sort((a,b)=>a.time - b.time)

    let text = `${groupName}\n`

    html += `<div class="result-group">`
    html += `<h4>${escapeHtml(groupName)}</h4>`

    result.forEach(r=>{
      html += `<div>${escapeHtml(r.name)}　${r.time}</div>`
      text += `${r.name} ${r.time}\n`
    })

    const copyKey = "countup_" + groupName
    window._countupCopyData = window._countupCopyData || {}
    window._countupCopyData[copyKey] = text

    html += `<button onclick="copyCountupGroup(${htmlJsArg(groupName)})">コピー</button>`
    html += `</div>`
  })

  document.getElementById("countupResult").innerHTML = html
}

// --- コピー ---

function copyCountupGroup(groupName){

  const key = "countup_" + groupName
  const text = (window._countupCopyData || {})[key] || ""

  copyText(text)
    .then(()=>alert("コピーしました"))
    .catch(()=>alert("コピーに失敗しました"))
}

// --- export ---

window.renderCountup = renderCountup
window.calcCountup = calcCountup
window.resetCountup = resetCountup
window.addGroupSection = addGroupSection
window.removeGroupSection = removeGroupSection
window.addCountupRow = addCountupRow
window.removeRow = removeRow
window.changeLeader = changeLeader
window.changeInterval = changeInterval
window.copyCountupGroup = copyCountupGroup

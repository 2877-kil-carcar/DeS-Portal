window.copyData = {}

function shuffle(array){

  for(let i = array.length - 1; i > 0; i--){

    const j = Math.floor(Math.random() * (i + 1))

    const temp = array[i]
    array[i] = array[j]
    array[j] = temp
  }

  return array
}

function assign(){

  const players = getState("players")
  const rallies = getState("rallies")

  const playerMap = Object.create(null)
  players.forEach(p=>{
    playerMap[p.id] = p
  })

  // 現在時刻を30分スロットに切り捨て（21:30未満は21:00固定）
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  const effectiveTime = (h < 21 || (h === 21 && m < 30))
    ? "21:00"
    : String(h).padStart(2,'0') + ":" + (m < 30 ? "00" : "30")

  // 参加時間フィルター：未設定は除外、有効スロット以下なら選定対象
  function isTimeAvailable(p){
    if(!p.joinTime) return false
    return effectiveTime >= p.joinTime
  }

  const activeRallies = rallies.filter(r=>{
    if(r.active === false) return false

    const leader = playerMap[r.leaderId]
    if(!leader) return false
    if(leader.active === false) return false

    return true
  })

  const usedPlayerIds = new Set()
  const leaderIds = new Set(activeRallies.map(r=>r.leaderId))
  const result = []

  leaderIds.forEach(id=>usedPlayerIds.add(id))

  activeRallies.forEach(r=>{

    const leader = playerMap[r.leaderId]
    if(!leader) return

    const rallyAlliance = leader.alliance || ""
    const rallyGroup = leader.group || ""
    const marchTime = r.marchTime || 0

    ;(Array.isArray(r.heroes) ? r.heroes : []).forEach(h=>{

      let count = Number(h.need) || 0

      // 共通フィルター（時間・英雄・グループ）
      const baseFilter = p=>
        p.active !== false &&
        p.id !== r.leaderId &&
        !leaderIds.has(p.id) &&
        !usedPlayerIds.has(p.id) &&
        Array.isArray(p.heroes) &&
        p.heroes.includes(h.hero) &&
        isTimeAvailable(p) &&
        (p.group || "") === rallyGroup

      const sameAlliance = p=> (p.alliance || "") === rallyAlliance

      // ①同一グループ × 同一同盟 × 参加時間OK × 優先あり
      let tier1 = players.filter(p=> baseFilter(p) && sameAlliance(p) && p.priority === true)
      // ②同一グループ × 同一同盟 × 参加時間OK × 優先なし
      let tier2 = players.filter(p=> baseFilter(p) && sameAlliance(p) && !p.priority)
      // ③同一グループ × 他同盟 × 参加時間OK × 優先あり
      let tier3 = players.filter(p=> baseFilter(p) && !sameAlliance(p) && p.priority === true)
      // ④同一グループ × 他同盟 × 参加時間OK × 優先なし
      let tier4 = players.filter(p=> baseFilter(p) && !sameAlliance(p) && !p.priority)

      const isRandom = document.getElementById("randomAssign")?.checked

      if(isRandom){
        tier1 = shuffle(tier1)
        tier2 = shuffle(tier2)
        tier3 = shuffle(tier3)
        tier4 = shuffle(tier4)
      }

      const assignCandidates = [...tier1, ...tier2, ...tier3, ...tier4]

      assignCandidates.forEach(p=>{

        if(count <= 0) return

        result.push({
          leaderId: r.leaderId,
          leaderName: leader.name,
          alliance: rallyAlliance || "未所属",
          rate: r.rate || "",
          marchTime: marchTime,
          hero: h.hero,
          playerName: p.name
        })

        usedPlayerIds.add(p.id)
        count--
      })

      while(count > 0){

        result.push({
          leaderId: r.leaderId,
          leaderName: leader.name,
          alliance: rallyAlliance || "未所属",
          rate: r.rate || "",
          marchTime: marchTime,
          hero: h.hero,
          playerName: "不在"
        })

        count--
      }
    })
  })

  renderResult(result)
}

function renderResult(data){

  let html = `<h2>振り分け結果</h2>`

  const groups = Object.create(null)

  data.forEach(r=>{
    if(!groups[r.leaderId]){
      groups[r.leaderId] = []
    }
    groups[r.leaderId].push(r)
  })

  const sortedLeaders = Object.keys(groups).sort((a,b)=>{

    const aa = groups[a][0].alliance || ""
    const bb = groups[b][0].alliance || ""

    const c = aa.localeCompare(bb)
    if(c !== 0) return c

    return groups[a][0].leaderName.localeCompare(groups[b][0].leaderName)
  })

  window.copyData = {}

  sortedLeaders.forEach(leaderId=>{

    const rows = groups[leaderId]
    const first = rows[0]

    html += `<div class="result-group">`
    html += `<h3>${escapeHtml(first.alliance)}</h3>`

    html += `<div class="result-row"><strong>${escapeHtml(first.leaderName)} ${escapeHtml(first.rate)}</strong></div>`
    html += `<div class="result-row">行軍 ${escapeHtml(first.marchTime)}秒</div>`

    let text = `${first.alliance}\n`
    text += `${first.leaderName} ${first.rate}\n`
    text += `行軍 ${first.marchTime}秒\n\n`

    rows.forEach(r=>{
      html += `<div class="result-row">${escapeHtml(r.hero)} ${escapeHtml(r.playerName)}</div>`
      text += `${r.hero} ${r.playerName}\n`
    })

    html += `<button onclick="copyLeader('${leaderId}')">コピー</button>`
    html += `</div>`

    window.copyData[leaderId] = text
  })

  if(data.length === 0){
    html += `<p>結果はまだありません</p>`
  }

  document.getElementById("resultTable").innerHTML = html
  afterRender()
}

function copyLeader(id){

  const text = window.copyData[id] || ""

  copyText(text)
  .then(()=>{
    alert("コピーしました")
  })
  .catch(()=>{
    alert("コピーに失敗しました")
  })
}

window.assign = assign
window.renderResult = renderResult
window.copyLeader = copyLeader

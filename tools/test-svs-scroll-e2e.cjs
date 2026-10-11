const assert = require('node:assert/strict')

async function getPageTarget(){
  const targets = await fetch('http://127.0.0.1:9223/json/list').then(response=>response.json())
  return targets.find(target=>target.type === 'page' && target.url.includes('/apps/svs/index.html'))
}

async function main(){
  const target = await getPageTarget()
  assert.ok(target?.webSocketDebuggerUrl, 'SvS page target was not found')

  const socket = new WebSocket(target.webSocketDebuggerUrl)
  let nextId = 0
  const pending = new Map()
  socket.onmessage = event=>{
    const message = JSON.parse(event.data)
    if(!message.id || !pending.has(message.id)) return
    const {resolve, reject} = pending.get(message.id)
    pending.delete(message.id)
    if(message.error) reject(new Error(message.error.message))
    else resolve(message.result)
  }
  await new Promise((resolve, reject)=>{
    socket.onopen = resolve
    socket.onerror = reject
  })

  const send = (method, params={})=>new Promise((resolve, reject)=>{
    const id = ++nextId
    pending.set(id, {resolve, reject})
    socket.send(JSON.stringify({id, method, params}))
  })
  await send('Emulation.setDeviceMetricsOverride', {
    width:390,
    height:844,
    deviceScaleFactor:1,
    mobile:true
  })
  const expression = `(()=>{
    showTab('playerHeroes');
    setState('heroes', Array.from({length:12}, (_,index)=>({
      id:'hero-'+index,
      name:'第1世代英雄'+(index+1),
      generation:1
    })));
    setState('players', [{
      id:'player-1',
      name:'プレイヤー1',
      alliance:'DeS',
      heroes:['第1世代英雄1'],
      active:true
    }]);
    renderPlayerHeroes();
    const fold=document.querySelector('.ownership-generation-fold');
    if(fold) fold.open=true;
    const scroller=document.querySelector('.ownership-scroll');
    const sticky=document.querySelector('.owner-name');
    const before=scroller?.scrollLeft ?? -1;
    if(scroller) scroller.scrollLeft=240;
    return {
      viewport:innerWidth,
      clientWidth:scroller?.clientWidth ?? 0,
      scrollWidth:scroller?.scrollWidth ?? 0,
      overflowX:scroller ? getComputedStyle(scroller).overflowX : '',
      before,
      after:scroller?.scrollLeft ?? -1,
      stickyPosition:sticky ? getComputedStyle(sticky).position : '',
      heroColumns:document.querySelectorAll('.owner-hero-head').length
    };
  })()`
  const result = await send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true})
  const value = result.result.value
  assert.equal(value.viewport, 390)
  assert.equal(value.overflowX, 'auto')
  assert.ok(value.scrollWidth > value.clientWidth, '12 hero columns must overflow on mobile')
  assert.ok(value.after > value.before, 'ownership table must scroll horizontally')
  assert.equal(value.stickyPosition, 'sticky')
  assert.equal(value.heroColumns, 12)
  console.log('PASS SvS owned-hero table scrolls with 12 heroes and keeps player names sticky')
  console.log(JSON.stringify(value))
  socket.close()
}

main().catch(error=>{
  console.error(error)
  process.exitCode=1
  setTimeout(()=>process.exit(1), 10)
})

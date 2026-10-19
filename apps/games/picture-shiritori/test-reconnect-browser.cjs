// Local browser QA. All Firebase imports are fulfilled with the adapter below.
// Set WOS_PLAYWRIGHT_MODULE if playwright is not installed in normal resolution.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.WOS_PLAYWRIGHT_MODULE || "playwright");
const base = __dirname;

const mockModule = `
const m=window.__firebaseTest;
const clone=value=>value===undefined?undefined:structuredClone(value);
const snapshot=value=>({exists:()=>value!=null,val:()=>clone(value)});
function persist(){sessionStorage.setItem('test:room',JSON.stringify(m.room))}
function notify(){persist();for(const [key,callbacks] of m.listeners){if(key.startsWith('.info/'))continue;for(const callback of callbacks)queueMicrotask(()=>callback(snapshot(m.room)))}}
export const initializeApp=()=>({});
export const getDatabase=()=>({});
export const ref=(db,key)=>key;
export const serverTimestamp=()=>({'.sv':'timestamp'});
export const get=async key=>snapshot(m.room);
export function onValue(key,callback){if(!m.listeners.has(key))m.listeners.set(key,new Set());m.listeners.get(key).add(callback);queueMicrotask(()=>callback(snapshot(key==='.info/connected'?m.connected:key==='.info/serverTimeOffset'?0:m.room)));return ()=>m.listeners.get(key)?.delete(callback)}
export function onDisconnect(key){const registration={key,armed:false};m.registrations.push(registration);return {update:async patch=>{registration.patch=patch;registration.armed=true},cancel:async()=>{registration.armed=false}}}
export async function runTransaction(key,callback){const value=callback(clone(m.room));if(value!==undefined){m.room=value;notify()}return {committed:value!==undefined,snapshot:snapshot(m.room)}}
m.disconnect=()=>{m.connected=false;for(const callback of m.listeners.get('.info/connected')||[])callback(snapshot(false));for(const r of m.registrations){if(!r.armed)continue;r.armed=false;let obj=m.room;for(const part of r.key.split('/').slice(3))obj=obj[part]??={};for(const [key,value] of Object.entries(r.patch))obj[key]=value?.['.sv']==='timestamp'?m.now:value}notify()};
m.reconnect=()=>{m.connected=true;for(const callback of m.listeners.get('.info/connected')||[])callback(snapshot(true))};
m.advance=ms=>{m.now+=ms};
m.postChat=(pid,text)=>{m.room.chatMessages??={};m.room.chatSequence=(m.room.chatSequence||0)+1;const id='test-message-'+m.room.chatSequence;m.room.chatMessages[id]={pid,name:pid,text,sentAt:m.now,sequence:m.room.chatSequence};m.room.revision=(m.room.revision||0)+1;notify()};
`;

function seed(phase = "draw") {
  const now = Date.now();
  return { hostId: "A", status: "playing", startedAt: now - 1000, order: ["A", "B"],
    settings: { turnSeconds: 60, answerSeconds: 60 }, history: {},
    players: { A: { name: "A", active: true, disconnectedAt: 0, joinedAt: now - 1000 }, B: { name: "B", active: true, disconnectedAt: 0, joinedAt: now - 1000 } },
    game: { turnNo: 1, phase, artistId: "A", guesserId: "B", answer: "ねこ", requiredStart: "", startedAt: now, deadline: now + 60000,
      image: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" },
  };
}

async function main() {
  const server = http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const target = path.resolve(base, `.${relative.endsWith("/") ? relative + "index.html" : relative}`);
    if (!target.startsWith(base + path.sep) || !fs.existsSync(target)) { response.writeHead(404); response.end(); return; }
    response.setHeader("Content-Type", ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" })[path.extname(target)] || "application/octet-stream");
    response.setHeader("Cache-Control", "no-store"); response.end(fs.readFileSync(target));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const url = `http://127.0.0.1:${server.address().port}/?room=TESTAA`;
    async function pageFor(pid, phase = "draw", status = "playing") {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await context.route("**/*", async route => {
        const requestUrl = route.request().url();
        if (requestUrl.startsWith("https://www.gstatic.com/firebasejs/")) return route.fulfill({ contentType: "text/javascript", body: mockModule });
        if (requestUrl.startsWith(`http://127.0.0.1:${server.address().port}/`)) return route.continue();
        errors.push(`Unexpected external request: ${requestUrl}`); return route.abort();
      });
      const room = seed(phase); room.status = status;
      await context.addInitScript(({ room, pid }) => {
        const saved = sessionStorage.getItem("test:room");
        const current = saved ? JSON.parse(saved) : room;
        window.__firebaseTest = { room: current, now: room.game.startedAt, connected: true, listeners: new Map(), registrations: [] };
        Date.now = () => window.__firebaseTest.now;
        sessionStorage.setItem("pictureShiritori:TESTAA:pid", pid);
        localStorage.setItem("pictureShiritori:name", pid);
      }, { room, pid });
      const page = await context.newPage(); page.on("pageerror", error => errors.push(error.stack));
      await page.goto(url); await page.waitForFunction(() => document.getElementById("connectionBadge").textContent === "接続済み" && !document.getElementById("roomView").hidden);
      return { page, context };
    }

    const { page: drawPage, context: drawContext } = await pageFor("A");
    assert.equal(await drawPage.locator("body").evaluate(body => getComputedStyle(body).backgroundColor), "rgb(255, 240, 241)");
    const box = await drawPage.locator("#drawingCanvas").boundingBox();
    await drawPage.mouse.move(box.x + 35, box.y + 35); await drawPage.mouse.down();
    await drawPage.mouse.move(box.x + 90, box.y + 70, { steps: 4 }); await drawPage.mouse.up();
    await drawPage.locator("#secretAnswer").fill("ねこ");
    const before = await drawPage.locator("#drawingCanvas").evaluate(canvas => canvas.toDataURL());
    await drawPage.evaluate(() => window.__firebaseTest.disconnect());
    assert.equal(await drawPage.locator("#submitDrawingBtn").isDisabled(), true);
    await drawPage.evaluate(() => { window.__firebaseTest.advance(30000); window.__firebaseTest.reconnect(); });
    await drawPage.waitForFunction(() => !document.getElementById("submitDrawingBtn").disabled);
    assert.equal(await drawPage.locator("#secretAnswer").inputValue(), "ねこ");
    assert.equal(await drawPage.locator("#drawingCanvas").evaluate(canvas => canvas.toDataURL()), before);
    await drawPage.locator("#submitDrawingBtn").click();
    await drawPage.waitForFunction(() => window.__firebaseTest.room.game.phase === "guess");
    assert.equal(await drawPage.locator("#waitingCard").isVisible(), true);
    console.log("PASS mobile browser: background-style disconnect/reconnect restores drawing and submit button");
    await drawContext.close();

    const { page: reloadPage, context: reloadContext } = await pageFor("A");
    const drawBox = await reloadPage.locator("#drawingCanvas").boundingBox();
    await reloadPage.mouse.move(drawBox.x + 30, drawBox.y + 30); await reloadPage.mouse.down();
    await reloadPage.mouse.move(drawBox.x + 100, drawBox.y + 60, { steps: 5 }); await reloadPage.mouse.up();
    await reloadPage.locator("#secretAnswer").fill("ねこ");
    await reloadPage.evaluate(() => window.__firebaseTest.disconnect());
    await reloadPage.reload();
    await reloadPage.waitForFunction(() => !document.getElementById("submitDrawingBtn").disabled && document.getElementById("secretAnswer").value === "ねこ");
    // Image decoding completes asynchronously after the room is rendered.
    await reloadPage.waitForFunction(() => {
      const canvas = document.getElementById("drawingCanvas"), data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      for (let n = 0; n < data.length; n += 4) if (data[n] < 200) return true;
      return false;
    });
    await reloadPage.locator("#submitDrawingBtn").click();
    await reloadPage.waitForFunction(() => window.__firebaseTest.room.game.phase === "guess");
    console.log("PASS mobile browser: reload restores the real canvas image and secret word before submission");
    await reloadContext.close();

    const { page: guessPage, context: guessContext } = await pageFor("B", "guess");
    assert.equal(await guessPage.locator("body").evaluate(body => getComputedStyle(body).backgroundColor), "rgb(237, 249, 241)");
    await guessPage.locator("#guessInput").fill("ね");
    await guessPage.evaluate(() => window.__firebaseTest.disconnect());
    assert.equal(await guessPage.locator("#guessForm button").isDisabled(), true);
    await guessPage.evaluate(() => { window.__firebaseTest.advance(20000); window.__firebaseTest.reconnect(); });
    await guessPage.waitForFunction(() => !document.querySelector("#guessForm button").disabled);
    assert.equal(await guessPage.locator("#guessInput").inputValue(), "ね");
    await guessPage.locator("#guessInput").fill("ねこ"); await guessPage.locator("#guessForm button").click();
    await guessPage.waitForFunction(() => window.__firebaseTest.room.game.turnNo === 2);
    assert.deepEqual(await guessPage.evaluate(() => [window.__firebaseTest.room.game.artistId, window.__firebaseTest.room.game.guesserId]), ["B", "A"]);
    assert.equal(await guessPage.locator("#drawCard").isVisible(), true);
    assert.equal(await guessPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    console.log("PASS mobile browser: answer button recovers and the correct player gets the next drawing turn");
    await guessContext.close();

    const { page: chatPage, context: chatContext } = await pageFor("A");
    await chatPage.locator("#drawingCanvas").scrollIntoViewIfNeeded();
    const chatCanvas = await chatPage.locator("#drawingCanvas").boundingBox();
    await chatPage.mouse.move(chatCanvas.x + 40, chatCanvas.y + 40); await chatPage.mouse.down();
    await chatPage.mouse.move(chatCanvas.x + 100, chatCanvas.y + 65, { steps: 4 }); await chatPage.mouse.up();
    await chatPage.locator("#secretAnswer").fill("ねこ");
    const chatImage = await chatPage.locator("#drawingCanvas").evaluate(canvas => canvas.toDataURL());
    await chatPage.evaluate(() => window.__firebaseTest.postChat("B", "描けたら教えてね！"));
    await chatPage.waitForFunction(() => document.getElementById("chatUnread").textContent === "1");
    assert.equal(await chatPage.locator("#chatPanel").isVisible(), false);
    assert.match(await chatPage.locator("#chatPreview").textContent(), /B：描けたら教えてね/);
    await chatPage.locator("#chatToggle").click();
    assert.equal(await chatPage.locator("#chatUnread").isVisible(), false);
    await chatPage.locator("#chatInput").fill('<img src=x onerror=alert(1)> もう少し！'); await chatPage.locator("#chatSend").click();
    await chatPage.waitForFunction(() => Object.values(window.__firebaseTest.room.chatMessages || {}).length === 2);
    assert.equal(await chatPage.locator("#chatList img").count(), 0);
    assert.match(await chatPage.locator("#chatList").textContent(), /<img src=x onerror=alert\(1\)>/);
    assert.equal(await chatPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.WOS_GAME_QA_DIR) {
      fs.mkdirSync(process.env.WOS_GAME_QA_DIR, { recursive: true });
      await chatPage.screenshot({ path: path.join(process.env.WOS_GAME_QA_DIR, "chat-mobile.png") });
    }
    await chatPage.locator("#chatClose").click();
    assert.equal(await chatPage.locator("#drawingCanvas").evaluate(canvas => canvas.toDataURL()), chatImage);
    assert.equal(await chatPage.locator("#secretAnswer").inputValue(), "ねこ");
    assert.equal(await chatPage.locator("#submitDrawingBtn").isDisabled(), false);
    await chatPage.setViewportSize({ width: 320, height: 740 }); await chatPage.locator("#chatToggle").click();
    assert.equal(await chatPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const chatBounds = await chatPage.locator("#chatPanel").boundingBox(); assert.ok(chatBounds.x >= 0 && chatBounds.x + chatBounds.width <= 320);
    console.log("PASS mobile browser: unread preview, chat send/close, safe text, 320px layout and canvas preservation");
    await chatContext.close();

    const { page: startPage, context: startContext } = await pageFor("A", "draw", "lobby");
    await startPage.locator("#startGameBtn").click(); await startPage.waitForFunction(() => window.__firebaseTest.room.status === "playing");
    const started = await startPage.evaluate(() => ({ order: window.__firebaseTest.room.order, game: window.__firebaseTest.room.game, roundId: window.__firebaseTest.room.roundId }));
    assert.deepEqual([...started.order].sort(), ["A", "B"]);
    assert.equal(started.game.artistId, started.order[0]); assert.equal(started.game.guesserId, started.order[1]);
    assert.match(started.game.requiredStart, /^[あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわ]$/);
    assert.match(await startPage.locator("#requiredStart").textContent(), /から始まる言葉/);
    startPage.once("dialog", dialog => dialog.accept()); await startPage.locator("#endGameBtn").click();
    await startPage.locator("#returnLobbyBtn").click(); await startPage.locator("#startGameBtn").click();
    await startPage.waitForFunction(previous => window.__firebaseTest.room.roundId !== previous, started.roundId);
    console.log("PASS mobile browser: shared shuffled order, unvoiced initial letter and fresh round identity on restart");
    await startContext.close();
    assert.deepEqual(errors, []);
    console.log("5/5 browser scenarios passed (320px/390px viewports, mocked Firebase, no production requests)");
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });

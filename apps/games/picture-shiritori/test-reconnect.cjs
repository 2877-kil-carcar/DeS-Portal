// Execute the actual app with isolated Firebase/DOM adapters and a virtual clock.
// No production database, browser account, or network is accessed.
"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const path = require("node:path");
const Rules = require("./rules.js");
const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8")
  .replace(/^import\s[\s\S]*?;\s*/gm, "").replace(/\nboot\(\);\s*$/, "");
const clone = value => value === undefined ? undefined : structuredClone(value);
const flush = async () => { for (let n = 0; n < 12; n += 1) await new Promise(setImmediate); };
const tests = [];
const test = (name, run) => tests.push({ name, run });

function fixture({ phase = "draw", size = 2, unlimited = false } = {}) {
  const order = "ABCDEFGH".slice(0, size).split("");
  return {
    hostId: "A", status: "playing", startedAt: 900000, updatedAt: 1000000,
    settings: { turnSeconds: unlimited ? 0 : 60, answerSeconds: 60 }, order,
    players: Object.fromEntries(order.map(id => [id, { name: id, active: true, disconnectedAt: 0, joinedAt: 900000 }])),
    history: {}, game: { turnNo: 1, phase, artistId: "A", guesserId: "B", answer: "ねこ", image: "data:image/jpeg;base64,PICTURE", requiredStart: "", startedAt: 1000000, deadline: unlimited ? 0 : 1060000 },
  };
}

function backend(initial = fixture()) {
  let room = clone(initial), clock = 1000000, nextId = 0;
  const clients = [], queue = [], registrations = [], operations = [], timers = new Map();
  const snapshot = value => ({ exists: () => value != null, val: () => clone(value) });
  function read(key) {
    const parts = key.split("/").slice(3);
    let value = room;
    for (const part of parts) value = value?.[part];
    return clone(value ?? null);
  }
  function notify() {
    for (const client of clients) {
      if (!client.connected) continue;
      for (const [key, handlers] of client.listeners) {
        if (key.startsWith(".info")) continue;
        const value = read(key);
        for (const callback of handlers) queueMicrotask(() => callback(snapshot(value)));
      }
    }
  }
  function writePatch(key, patch) {
    const parts = key.split("/").slice(3);
    let target = room;
    for (const part of parts) target = target[part] ||= {};
    for (const [name, value] of Object.entries(patch)) target[name] = value?.[".sv"] === "timestamp" ? clock : clone(value);
    notify();
  }
  const api = {
    get room() { return room; }, get now() { return clock; }, get registrations() { return registrations; }, get operations() { return operations; },
    patch(change) { change(room); notify(); },
    async advance(ms, runTimers = false) {
      clock += ms;
      if (runTimers) {
        for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn(); }
      }
      await flush();
    },
    async release() { for (const execute of queue.splice(0)) execute(); await flush(); },
    async client(pid, { session = new Map(), local = new Map(), clientOffset = 0, enter = true } = {}) {
      const nodes = new Map(), pageEvents = new Map(), documentEvents = new Map();
      const makeNode = () => {
        const classes = new Set();
        return { value: "", hidden: false, disabled: false, textContent: "", className: "", children: [], handlers: {}, style: {}, dataset: {}, scrollTop: 0, scrollHeight: 0, clientHeight: 0,
          classList: { add(...v) { v.forEach(x => classes.add(x)); }, remove(...v) { v.forEach(x => classes.delete(x)); }, toggle(v, force) { if (force ?? !classes.has(v)) classes.add(v); else classes.delete(v); }, contains: v => classes.has(v) },
          addEventListener(name, fn) { this.handlers[name] = fn; }, append(...v) { this.children.push(...v); }, replaceChildren(...v) { this.children = v; }, focus() {}, select() {}, querySelectorAll() { return []; }, setAttribute(name, value) { this[name] = value; },
        };
      };
      const node = id => { if (!nodes.has(id)) nodes.set(id, makeNode()); return nodes.get(id); };
      const canvas = node("drawingCanvas"); canvas.width = 720; canvas.height = 480; canvas.image = "data:image/jpeg;base64,DRAWN";
      canvas.toDataURL = () => canvas.image;
      canvas.getContext = () => ({ save() {}, restore() {}, fillRect() { canvas.image = "data:image/jpeg;base64,BLANK"; },
        getImageData() { return { data: canvas.image.endsWith("BLANK") ? [255, 255, 255, 255] : [0, 0, 0, 255] }; },
        drawImage(image) { canvas.image = image.src; }, putImageData() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {},
      });
      node("guessForm").querySelectorAll = () => [node("guessInput"), node("guessSubmit")];
      const store = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) });
      const c = { pid, connected: true, holdNext: false, listeners: new Map(), errors: [], nodes, session, local, pageEvents, documentEvents };
      clients.push(c);
      const context = {
        console: { log() {}, error(...args) { c.errors.push(args.map(String).join(" ")); } },
        URL, URLSearchParams, Date: class extends Date { static now() { return clock + clientOffset; } }, crypto: { randomUUID: () => `connection-${++nextId}`, getRandomValues: bytes => { bytes.fill(++nextId); return bytes; } },
        window: { PictureShiritoriRules: Rules }, location: { href: "https://test.invalid/apps/games/picture-shiritori/", search: "" },
        document: { hidden: false, body: makeNode(), getElementById: node, querySelectorAll: () => [], createElement: makeNode, addEventListener: (event, fn) => documentEvents.set(event, fn) },
        addEventListener: (event, fn) => pageEvents.set(event, fn), navigator: {}, confirm: () => true,
        sessionStorage: store(session), localStorage: store(local),
        history: { replaceState(state, title, url) { context.location.href = String(url); context.location.search = new URL(url).search; } },
        Image: class { set src(value) { this._src = value; queueMicrotask(() => this.onload?.()); } get src() { return this._src; } },
        setInterval() { return 0; }, setTimeout(fn, ms) { const id = ++nextId; timers.set(id, { at: clock + ms, fn }); return id; }, clearTimeout(id) { timers.delete(id); },
        initializeApp: () => ({}), getDatabase: () => ({}), ref: (db, key) => key, serverTimestamp: () => ({ ".sv": "timestamp" }),
        get: async key => snapshot(read(key)),
        onValue(key, fn) {
          if (!c.listeners.has(key)) c.listeners.set(key, new Set()); c.listeners.get(key).add(fn);
          const value = key === ".info/connected" ? c.connected : key === ".info/serverTimeOffset" ? -clientOffset : read(key);
          queueMicrotask(() => fn(snapshot(value)));
          return () => c.listeners.get(key)?.delete(fn);
        },
        onDisconnect(key) {
          const registration = { key, pid, owner: c, armed: false };
          registrations.push(registration);
          return { update: async patch => { registration.patch = patch; registration.armed = true; }, cancel: async () => { registration.armed = false; } };
        },
        runTransaction(key, change) {
          operations.push({ pid, key, at: clock });
          return new Promise((resolve, reject) => {
            const execute = () => {
              try {
                if (c.failNext) { c.failNext = false; throw new Error("simulated network error"); }
                const value = change(read(key));
                if (value !== undefined) { room = clone(value); notify(); }
                resolve({ committed: value !== undefined, snapshot: snapshot(read(key)) });
              } catch (error) { reject(error); }
            };
            if (c.holdNext) { c.holdNext = false; queue.push(execute); }
            else queueMicrotask(execute);
          });
        },
      };
      vm.createContext(context);
      vm.runInContext(source + `\nglobalThis.audit = { boot, enterRoom, joinRoom, recoverPresence, handleConnection, resumePage,
        submitDrawing, submitGuess, expireTurn, reconcileDisconnectedPlayers, updateTimer, renderRoom,
        createRoom, startGame, leaveRoom, endGame, returnLobby, runRoomAction, saveDraft, restoreDraft,
        isPlayerConnected, reconnectRemaining, activeIds, settleRoom, restorePlayer, beginNextTurn, startRoom, clearSessionView, acceptRoomSnapshot,
        sendChat, toggleChat, renderChat, chatEntries,
        chatState: () => ({chatOpen,unread:[...unreadChatIds],chatSending}),
        state: () => ({roomCode,myId,currentRoom,networkConnected,presenceReady,connectionId,connectionEpoch,actionPending}),
      };`, context, { filename: "picture-shiritori/app.js" });
      c.ctx = context; c.a = context.audit;
      c.draw = () => { canvas.image = "data:image/jpeg;base64,DRAWN"; node("secretAnswer").value = "ねこ"; };
      c.guess = word => { node("guessInput").value = word; return c.a.submitGuess({ preventDefault() {} }); };
      c.disconnect = async () => {
        c.connected = false;
        for (const fn of c.listeners.get(".info/connected") || []) fn(snapshot(false));
        for (const item of registrations.filter(r => r.owner === c && r.armed)) { item.armed = false; writePatch(item.key, item.patch); }
        await flush();
      };
      c.reconnect = async () => {
        c.connected = true;
        for (const fn of c.listeners.get(".info/connected") || []) fn(snapshot(true));
        await flush();
      };
      c.close = () => { c.listeners.clear(); };
      await c.a.boot(); await flush();
      if (enter) { await c.a.enterRoom("TESTAA", pid, pid); await flush(); }
      return c;
    },
  };
  return api;
}

test("normal drawing, incorrect/correct guesses and next turn still work", async () => {
  const b = backend(), a = await b.client("A"), c = await b.client("B");
  a.draw(); await a.a.submitDrawing(); await flush();
  assert.equal(b.room.game.phase, "guess");
  await c.guess("いぬ"); assert.equal(b.room.game.wrongAttempts, 1);
  await c.guess("ねこ"); assert.equal(b.room.game.turnNo, 2);
  assert.equal(b.room.game.artistId, "B"); assert.equal(b.room.game.guesserId, "A");
});

for (const phase of ["draw", "guess"]) test(`${phase}: return within three minutes restores membership, deadline and controls`, async () => {
  const b = backend(fixture({ phase })), pid = phase === "draw" ? "A" : "B", c = await b.client(pid);
  await b.advance(10000); await c.disconnect();
  assert.equal(c.a.state().presenceReady, false);
  await b.advance(30000); await c.reconnect();
  assert.equal(c.a.state().presenceReady, true);
  assert.equal(c.a.isPlayerConnected(b.room.players[pid]), true);
  assert.equal(b.room.game.deadline, 1090000);
  assert.equal(c.nodes.get(phase === "draw" ? "submitDrawingBtn" : "guessSubmit").disabled, false);
  if (phase === "draw") { c.draw(); await c.a.submitDrawing(); assert.equal(b.room.game.phase, "guess"); }
  else { await c.guess("ねこ"); assert.equal(b.room.game.artistId, "B"); assert.notEqual(b.room.game.artistId, b.room.game.guesserId); }
});

test("two and three consecutive disconnects each rearm presence and pause exactly once", async () => {
  const b = backend(), c = await b.client("A");
  for (let n = 1; n <= 3; n += 1) {
    await c.disconnect(); await b.advance(10000); await c.reconnect();
    assert.equal(b.room.game.deadline, 1060000 + n * 10000);
    assert.equal(b.registrations.filter(r => r.pid === "A" && r.armed).length, 1);
    await c.a.recoverPresence();
    assert.equal(b.room.game.deadline, 1060000 + n * 10000);
  }
});

test("a late disconnect from an old connection cannot disconnect the new one", async () => {
  const b = backend(), c = await b.client("A");
  const old = b.registrations.at(-1);
  await c.disconnect(); await b.advance(10000); await c.reconnect();
  b.patch(room => { room.players.A.connections[old.key.split("/").at(-1)] = { online: false, disconnectedAt: b.now }; });
  await flush(); assert.equal(c.a.isPlayerConnected(b.room.players.A), true);
  assert.equal(c.nodes.get("submitDrawingBtn").disabled, false);
});

test("multiple live tabs preserve online presence when only one tab disconnects", async () => {
  const b = backend(), first = await b.client("A"), second = await b.client("A");
  await first.disconnect();
  await flush(); assert.equal(second.a.isPlayerConnected(b.room.players.A), true);
  assert.equal(second.nodes.get("submitDrawingBtn").disabled, false);
});

test("disconnection during draw does not make the same person draw and answer", async () => {
  const b = backend(), a = await b.client("A"), c = await b.client("B");
  await c.disconnect(); a.draw(); await a.a.submitDrawing();
  assert.equal(b.room.game.guesserId, "B");
  await b.advance(10000); await c.reconnect(); await c.guess("ねこ");
  assert.equal(b.room.game.artistId, "B"); assert.equal(b.room.game.guesserId, "A");
});

test("a reconnecting participant remains in the correct turn order with three players", async () => {
  const b = backend(fixture({ phase: "guess", size: 3 })), a = await b.client("A"), c = await b.client("B");
  await c.disconnect(); await b.advance(20000); await c.reconnect(); await c.guess("ねこ");
  assert.equal(b.room.game.artistId, "B"); assert.equal(b.room.game.guesserId, "C");
});

for (const phase of ["draw", "guess"]) test(`${phase}: queued expiration rechecks the current disconnect grace`, async () => {
  const b = backend(fixture({ phase })), observer = await b.client(phase === "draw" ? "B" : "A");
  const actorId = phase === "draw" ? "A" : "B";
  await b.advance(61000); observer.holdNext = true;
  const expire = observer.a.expireTurn();
  b.patch(room => { room.players[actorId].active = false; room.players[actorId].disconnectedAt = b.now; });
  await b.release(); await expire;
  assert.equal(b.room.status, "playing"); assert.equal(b.room.game.phase, phase);
});

for (const phase of ["draw", "guess"]) test(`${phase}: a delayed submission cannot bypass an expired deadline`, async () => {
  const b = backend(fixture({ phase })), c = await b.client(phase === "draw" ? "A" : "B");
  c.draw(); c.holdNext = true;
  const send = phase === "draw" ? c.a.submitDrawing() : c.guess("ねこ");
  await b.advance(61000); await b.release(); await send;
  if (phase === "draw") { assert.equal(b.room.game.turnNo, 2); assert.equal(b.room.game.phase, "draw"); }
  else { assert.equal(b.room.status, "finished"); assert.equal(b.room.loserId, "A"); }
});

test("an old queued submission cannot execute after reconnect", async () => {
  const b = backend(), c = await b.client("A"); c.draw(); c.holdNext = true;
  const oldSend = c.a.submitDrawing(); await c.disconnect(); await b.advance(20000); await c.reconnect();
  await b.release(); await oldSend;
  assert.equal(b.room.game.phase, "draw"); assert.equal(c.nodes.get("submitDrawingBtn").disabled, false);
  c.draw(); await c.a.submitDrawing(); assert.equal(b.room.game.phase, "guess");
});

test("request timeout releases the submit button and cancels the delayed action", async () => {
  const b = backend(), c = await b.client("A"); c.draw(); c.holdNext = true;
  const pending = c.a.submitDrawing(); assert.equal(c.nodes.get("submitDrawingBtn").disabled, true);
  await b.advance(16000, true); await pending;
  assert.equal(c.nodes.get("submitDrawingBtn").disabled, false);
  await b.release(); assert.equal(b.room.game.phase, "draw");
  c.draw(); await c.a.submitDrawing(); assert.equal(b.room.game.phase, "guess");
});

test("answer pause counts only time in the answer phase", async () => {
  const b = backend(), a = await b.client("A"), c = await b.client("B");
  await c.disconnect(); await b.advance(20000); a.draw(); await a.a.submitDrawing();
  assert.equal(b.room.game.deadline, 1080000);
  await b.advance(10000); await c.reconnect(); assert.equal(b.room.game.deadline, 1090000);
});

test("unlimited drawing still ends when the only other participant exceeds three minutes", async () => {
  const b = backend(fixture({ unlimited: true })), a = await b.client("A"), c = await b.client("B");
  await c.disconnect(); await b.advance(180001); await a.a.reconcileDisconnectedPlayers();
  assert.equal(b.room.status, "finished");
});

for (const delay of [179999, 180000, 180001]) test(`rejoin boundary at ${delay} milliseconds is consistent`, async () => {
  const b = backend(), c = await b.client("A"); await c.disconnect(); await b.advance(delay); await c.reconnect();
  assert.equal(c.a.state().presenceReady, true);
  assert.equal(b.room.status, delay < 180000 ? "playing" : "finished");
});

test("host transfer occurs after the grace, not during it", async () => {
  const b = backend(fixture({ size: 3 })), a = await b.client("A"), c = await b.client("B");
  await a.disconnect(); await b.advance(179999); await c.a.reconcileDisconnectedPlayers(); assert.equal(b.room.hostId, "A");
  await b.advance(2); await c.a.reconcileDisconnectedPlayers(); assert.equal(b.room.hostId, "B"); assert.equal(b.room.game.artistId, "B");
});

test("every participant can reconnect after a simultaneous disconnect within the grace", async () => {
  const b = backend(), a = await b.client("A"), c = await b.client("B");
  await a.disconnect(); await c.disconnect(); await b.advance(30000); await a.reconnect(); await c.reconnect();
  assert.equal(a.a.isPlayerConnected(b.room.players.A), true); assert.equal(c.a.isPlayerConnected(b.room.players.B), true);
  assert.equal(b.room.status, "playing"); assert.equal(b.room.game.deadline, 1090000);
});

test("returning after all participants expired does not revive a finished match", async () => {
  const b = backend(), a = await b.client("A"), c = await b.client("B");
  await a.disconnect(); await c.disconnect(); await b.advance(181000); await a.reconnect(); await c.reconnect();
  assert.equal(b.room.status, "finished");
});

test("lobby starts require two connected people rather than a disconnected reserved slot", async () => {
  const room = fixture(); room.status = "lobby";
  const b = backend(room), a = await b.client("A"), c = await b.client("B"); await c.disconnect();
  await a.a.startGame(); assert.equal(b.room.status, "lobby");
  await c.reconnect(); await a.a.startGame(); assert.equal(b.room.status, "playing");
});

test("rejoining a lobby with no host restores a host", async () => {
  const room = fixture(); room.status = "lobby"; room.hostId = "";
  for (const player of Object.values(room.players)) { player.active = false; player.left = true; }
  const b = backend(room), c = await b.client("A"); assert.equal(b.room.hostId, "A");
});

test("normal explicit leave clears the local room and immediately removes membership", async () => {
  const b = backend(), c = await b.client("B"); await c.a.leaveRoom();
  assert.equal(c.a.state().roomCode, ""); assert.equal(b.room.players.B.left, true); assert.equal(b.room.status, "finished");
});

test("offline leave does not wait indefinitely for a server cancellation", async () => {
  const b = backend(), c = await b.client("B"); await c.disconnect(); await c.a.leaveRoom();
  assert.equal(c.a.state().roomCode, "");
});

test("drawings and the secret word survive reload of the same tab", async () => {
  const b = backend(), c = await b.client("A"); c.draw(); c.a.saveDraft();
  await c.disconnect(); c.close(); await b.advance(10000);
  const reloaded = await b.client("A", { session: c.session, local: c.local });
  assert.equal(reloaded.nodes.get("drawingCanvas").image, "data:image/jpeg;base64,DRAWN");
  assert.equal(reloaded.nodes.get("secretAnswer").value, "ねこ");
  await reloaded.a.submitDrawing(); assert.equal(b.room.game.phase, "guess");
});

test("a partially entered guess survives reload", async () => {
  const b = backend(fixture({ phase: "guess" })), c = await b.client("B");
  c.nodes.get("guessInput").value = "ね"; c.a.saveDraft(); await c.disconnect(); c.close();
  const reloaded = await b.client("B", { session: c.session, local: c.local });
  assert.equal(reloaded.nodes.get("guessInput").value, "ね");
});

test("an old draft cannot leak into a different round", async () => {
  const b = backend(), c = await b.client("A"); c.draw(); c.a.saveDraft(); await c.disconnect(); c.close();
  b.patch(room => { room.startedAt += 1000; });
  const reloaded = await b.client("A", { session: c.session, local: c.local });
  assert.equal(reloaded.nodes.get("secretAnswer").value, "");
  assert.equal(reloaded.nodes.get("drawingCanvas").image, "data:image/jpeg;base64,BLANK");
});

test("visibility/focus/pageshow recovery needs no drawing or answer submission", async () => {
  const b = backend(), c = await b.client("A"); await c.disconnect(); await b.advance(10000); await c.reconnect();
  for (const event of ["focus", "pageshow", "online"]) c.pageEvents.get(event)();
  c.ctx.document.hidden = false; c.documentEvents.get("visibilitychange")(); await flush();
  assert.equal(c.a.state().presenceReady, true); assert.equal(b.room.game.deadline, 1070000);
  assert.equal(c.nodes.get("submitDrawingBtn").disabled, false);
});

test("different device clocks use the server time offset", async () => {
  const b = backend(), a = await b.client("A", { clientOffset: 120000 }), c = await b.client("B", { clientOffset: -90000 });
  a.a.updateTimer(); c.a.updateTimer(); await flush();
  assert.equal(b.room.status, "playing"); assert.equal(a.nodes.get("timer").textContent, "01:00");
  assert.equal(c.nodes.get("timer").textContent, "01:00");
});

test("repeated fast submission clicks commit only one phase transition", async () => {
  const b = backend(), c = await b.client("A"); c.draw();
  await Promise.all([c.a.submitDrawing(), c.a.submitDrawing(), c.a.submitDrawing()]);
  assert.equal(b.room.game.phase, "guess"); assert.equal(b.room.game.turnNo, 1);
});

test("new room creation registers presence before enabling play", async () => {
  const b = backend(null), c = await b.client("A", { enter: false });
  c.nodes.get("homeName").value = "A";
  await c.a.createRoom(); await flush();
  assert.equal(b.room.status, "lobby");
  assert.equal(c.a.state().presenceReady, true);
  assert.equal(c.a.activeIds(b.room).length, 1);
});

test("concurrent joins reserve the last slot atomically", async () => {
  const room = fixture({ size: 8 }); room.status = "lobby"; room.players.H.active = false;
  const b = backend(room), first = await b.client("I", { enter: false }), second = await b.client("J", { enter: false });
  for (const c of [first, second]) {
    c.ctx.sessionStorage.setItem("pictureShiritori:TESTAA:pid", c.pid);
    c.nodes.get("homeName").value = c.pid; c.nodes.get("roomCodeInput").value = "TESTAA";
  }
  await Promise.all([first.a.joinRoom(), second.a.joinRoom()]); await flush();
  assert.equal(first.a.activeIds(b.room).length, 8);
  assert.equal([first, second].filter(c => c.a.state().presenceReady).length, 1);
});

test("an expired member cannot rejoin over the eight-player capacity", async () => {
  const room = fixture({ size: 8 }); room.status = "lobby";
  room.players.I = { name: "I", active: false, disconnectedAt: 700000, joinedAt: 600000 }; room.order.push("I");
  const b = backend(room), c = await b.client("I");
  assert.equal(c.a.activeIds(b.room).length, 8);
  assert.equal(c.a.state().presenceReady, false);
  assert.equal(c.a.state().roomCode, "");
});

test("a failed submission unlocks controls and permits a successful retry", async () => {
  const b = backend(), c = await b.client("A"); c.draw(); c.failNext = true;
  await c.a.submitDrawing(); assert.equal(b.room.game.phase, "draw");
  assert.equal(c.nodes.get("submitDrawingBtn").disabled, false);
  await c.a.submitDrawing(); assert.equal(b.room.game.phase, "guess");
});

test("recovery retries automatically after a request timeout", async () => {
  const b = backend(), c = await b.client("A");
  await c.disconnect(); c.holdNext = true; await c.reconnect();
  assert.equal(c.a.state().presenceReady, false);
  await b.advance(16000, true); await b.advance(3000, true);
  assert.equal(c.a.state().presenceReady, true); assert.equal(b.room.game.deadline, 1079000);
  await b.release(); assert.equal(b.room.game.deadline, 1079000);
});

test("the host can finish, reopen the lobby and start another match after recovery", async () => {
  const b = backend(), c = await b.client("A");
  await c.disconnect(); await b.advance(10000); await c.reconnect();
  await c.a.endGame(); assert.equal(b.room.status, "finished");
  await c.a.returnLobby(); assert.equal(b.room.status, "lobby");
  await c.a.startGame(); assert.equal(b.room.status, "playing"); assert.equal(b.room.game.turnNo, 1);
});

test("foregrounding with a live transport does not add time or require a submission", async () => {
  const b = backend(), c = await b.client("A");
  const before = b.room.game.deadline;
  c.ctx.document.hidden = true; c.documentEvents.get("visibilitychange")();
  await b.advance(20000); c.ctx.document.hidden = false; c.documentEvents.get("visibilitychange")(); await flush();
  assert.equal(c.a.state().presenceReady, true); assert.equal(b.room.game.deadline, before);
  assert.equal(c.nodes.get("submitDrawingBtn").disabled, false);
});

test("leaving a room prevents an old pending recovery from re-entering it", async () => {
  const b = backend(), c = await b.client("A");
  await c.disconnect(); c.holdNext = true; await c.reconnect();
  await c.a.leaveRoom(); assert.equal(c.a.state().roomCode, "");
  await b.release(); assert.equal(c.a.state().roomCode, ""); assert.equal(c.a.state().presenceReady, false);
});

test("an unused disconnect registration does not revive an expired reserved slot", async () => {
  const room = fixture({ size: 8 }); room.status = "lobby";
  room.players.I = { name: "I", active: false, disconnectedAt: 700000, joinedAt: 600000, connections: {
    unused: { online: false, disconnectedAt: 1000000 },
  } }; room.order.push("I");
  const b = backend(room), c = await b.client("A");
  assert.equal(c.a.activeIds(b.room).length, 8);
  assert.equal(c.a.reconnectRemaining(b.room.players.I), 0);
});

test("a rejected full-room recovery cancels its unused disconnect registration", async () => {
  const room = fixture({ size: 8 }); room.status = "lobby";
  room.players.I = { name: "I", active: false, disconnectedAt: 700000, joinedAt: 600000 }; room.order.push("I");
  const b = backend(room), c = await b.client("I"); await c.disconnect();
  assert.equal(c.a.activeIds(b.room).length, 8);
  assert.equal(b.registrations.filter(r => r.pid === "I" && r.armed).length, 0);
});

test("a delayed snapshot cannot revert a newer live room or its visible controls", async () => {
  const b = backend(), c = await b.client("A"), old = clone(c.a.state().currentRoom);
  b.patch(room => { room.revision += 1; room.game.phase = "guess"; }); await flush();
  c.a.acceptRoomSnapshot(old); c.a.renderRoom();
  assert.equal(c.a.state().currentRoom.game.phase, "guess");
  assert.equal(c.nodes.get("drawCard").hidden, true);
});

module.exports = { backend, fixture, flush };
if (require.main === module) (async () => {
  let failures = 0;
  for (const t of tests) {
    try { await t.run(); console.log("PASS", t.name); }
    catch (error) { failures += 1; console.error("FAIL", t.name, "\n", error.stack); }
  }
  console.log(`${tests.length - failures}/${tests.length} reconnect scenarios passed (mock Firebase/DOM; no network)`);
  process.exitCode = failures ? 1 : 0;
})();

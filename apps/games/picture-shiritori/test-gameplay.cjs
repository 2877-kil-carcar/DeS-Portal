"use strict";
const assert = require("node:assert/strict");
const Rules = require("./rules.js");
const { backend, fixture, flush } = require("./test-reconnect.cjs");
const tests = [];
const test = (name, run) => tests.push({ name, run });
const submit = { preventDefault() {} };
async function chat(client, text) {
  client.nodes.get("chatInput").value = text;
  await client.a.sendChat(submit);
  await flush();
}

test("マージ connects to じ, じゃ, じゅ or じょ", () => {
  const starts = Rules.nextStarts("マージ");
  assert.deepEqual(starts, ["じ", "じゃ", "じゅ", "じょ"]);
  for (const word of ["じてんしゃ", "じゃがいも", "ジュース", "じょうろ"]) assert.equal(Rules.validateWord(word, starts, []).ok, true, word);
  assert.equal(Rules.validateWord("しゃもじ", starts, []).ok, false);
});

test("やしゅ connects to ゆ or the complete しゅ syllable", () => {
  const starts = Rules.nextStarts("やしゅ");
  assert.deepEqual(starts, ["ゆ", "しゅ"]);
  assert.equal(Rules.validateWord("ゆき", starts, []).ok, true);
  assert.equal(Rules.validateWord("シュウマイ", starts, []).ok, true);
  for (const word of ["しろ", "しゃもじ", "しょくぱん", "うさぎ"]) assert.equal(Rules.validateWord(word, starts, []).ok, false, word);
});

for (const [word, start, compound] of [["きゃ", "や", "きゃ"], ["じゅ", "ゆ", "じゅ"], ["きょ", "よ", "きょ"], ["ふぁ", "あ", "ふぁ"], ["てぃ", "い", "てぃ"]]) {
  test(`${word}: small final kana and complete compound are both allowed`, () => assert.deepEqual(Rules.nextStarts(word), [start, compound]));
}

test("normal endings and long vowels keep their previous behavior", () => {
  assert.deepEqual(Rules.nextStarts("りんご"), ["ご"]);
  assert.deepEqual(Rules.nextStarts("こーひー"), ["い"]);
  assert.equal(Rules.validateWord("いす", Rules.nextStarts("こーひー"), []).ok, true);
  assert.equal(Rules.tailKana("きゃ"), "や");
});

test("used words, terminal ん and invalid characters remain invalid", () => {
  assert.equal(Rules.validateWord("ジュース", Rules.nextStarts("まーじ"), ["じゅーす"]).ok, false);
  assert.equal(Rules.validateWord("じかん", Rules.nextStarts("まーじ"), []).ok, false);
  assert.equal(Rules.validateWord("ABC", "あ", []).ok, false);
  assert.equal(Rules.isCorrectGuess("ジュース", "じゅーす"), true);
});

test("the initial-letter pool contains only normal unvoiced kana, without を or ん", () => {
  assert.equal(Rules.START_KANA.length, 44);
  assert.equal(new Set(Rules.START_KANA).size, 44);
  assert.match(Rules.START_KANA.join(""), /^[あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわ]+$/);
  for (let i = 0; i < Rules.START_KANA.length; i += 1) assert.equal(Rules.randomStart(() => (i + 0.5) / Rules.START_KANA.length), Rules.START_KANA[i]);
});

test("shuffle returns a fresh permutation without duplicate or lost players", () => {
  const original = ["A", "B", "C", "D"];
  assert.deepEqual(Rules.shuffleOrder(original, () => 0), ["B", "C", "D", "A"]);
  assert.deepEqual(Rules.shuffleOrder(original, () => 0.99999), original);
  assert.deepEqual(original, ["A", "B", "C", "D"]);
});

test("every start stores one shared randomized order and a valid initial letter", async () => {
  const room = fixture({ size: 8 }); room.status = "lobby";
  const b = backend(room), a = await b.client("A");
  for (let n = 0; n < 12; n += 1) {
    await a.a.startGame();
    assert.equal(b.room.status, "playing");
    assert.deepEqual([...b.room.order].sort(), "ABCDEFGH".split(""));
    assert.equal(b.room.game.artistId, b.room.order[0]); assert.equal(b.room.game.guesserId, b.room.order[1]);
    assert.notEqual(b.room.game.artistId, b.room.game.guesserId);
    assert.equal(Rules.START_KANA.includes(b.room.game.requiredStart), true);
    await a.a.endGame(); await a.a.returnLobby(); await b.advance(1000);
  }
});

test("the first drawing must match the randomly selected initial kana", async () => {
  const room = fixture(); room.status = "lobby";
  const b = backend(room), a = await b.client("A"); await a.a.startGame();
  const artist = b.room.game.artistId === "A" ? a : await b.client("B");
  artist.draw(); const initial = b.room.game.requiredStart;
  artist.nodes.get("secretAnswer").value = (initial === "あ" ? "い" : "あ") + "こ";
  await artist.a.submitDrawing(); assert.equal(b.room.game.phase, "draw");
  artist.nodes.get("secretAnswer").value = initial + "こ";
  await artist.a.submitDrawing(); assert.equal(b.room.game.phase, "guess");
});

test("compound choices are shared in room data and rendered for the next turn", async () => {
  const room = fixture({ phase: "guess" }); room.game.answer = "やしゅ";
  const b = backend(room), a = await b.client("A"), c = await b.client("B");
  await c.guess("やしゅ"); await flush();
  assert.deepEqual([...b.room.game.requiredStart], ["ゆ", "しゅ"]);
  assert.match(c.nodes.get("requiredStart").textContent, /「ゆ」・「しゅ」/);
  c.draw(); c.nodes.get("secretAnswer").value = "しゅうまい";
  await c.a.submitDrawing(); assert.equal(b.room.game.phase, "guess");
});

test("the active player's draw and answer colors change with the actual role", async () => {
  const b = backend(), a = await b.client("A"), c = await b.client("B");
  assert.equal(a.ctx.document.body.dataset.turn, "draw"); assert.equal(c.ctx.document.body.dataset.turn, "watch");
  a.draw(); await a.a.submitDrawing(); await flush();
  assert.equal(a.ctx.document.body.dataset.turn, "watch"); assert.equal(c.ctx.document.body.dataset.turn, "guess");
  await c.guess("ねこ"); await flush(); assert.equal(c.ctx.document.body.dataset.turn, "draw");
  await a.a.endGame(); await flush(); assert.equal(c.ctx.document.body.dataset.turn, "idle");
});

test("messages reach peers and closed chat shows preview and unread count", async () => {
  const b = backend(), a = await b.client("A"), c = await b.client("B");
  await chat(a, "よろしく！");
  assert.equal(c.nodes.get("chatPreview").textContent, "A：よろしく！");
  assert.equal(c.nodes.get("chatUnread").textContent, "1");
  assert.equal(c.nodes.get("chatUnread").hidden, false);
  assert.equal(c.nodes.get("chatPanel").hidden, true);
  assert.equal(a.a.chatState().unread.length, 0);
  c.a.toggleChat(true); assert.equal(c.nodes.get("chatPanel").hidden, false); assert.equal(c.a.chatState().unread.length, 0);
});

test("reading new chat at the bottom keeps it marked read", async () => {
  const b = backend(), a = await b.client("A"), c = await b.client("B");
  c.a.toggleChat(true); await chat(a, "見えてる？");
  assert.equal(c.a.chatState().unread.length, 0);
  c.a.toggleChat(false); await chat(a, "次のメッセージ"); assert.equal(c.a.chatState().unread.length, 1);
});

test("background messages and messages while reading older history stay unread", async () => {
  const b = backend(), a = await b.client("A"), c = await b.client("B");
  c.a.toggleChat(true); c.ctx.document.hidden = true; await chat(a, "バックグラウンド中");
  assert.equal(c.a.chatState().unread.length, 1);
  c.ctx.document.hidden = false; c.a.renderChat(); assert.equal(c.a.chatState().unread.length, 0);
  const list = c.nodes.get("chatList"); list.scrollHeight = 1000; list.clientHeight = 100; list.scrollTop = 0;
  await chat(a, "履歴を見ている間の新着"); assert.equal(c.a.chatState().unread.length, 1);
  assert.equal(c.nodes.get("chatNewMessages").hidden, false);
  list.scrollTop = 950; list.handlers.scroll(); assert.equal(c.a.chatState().unread.length, 0);
});

test("chat remains available in lobby and after a finished match", async () => {
  const room = fixture(); room.status = "lobby";
  const b = backend(room), a = await b.client("A");
  await chat(a, "開始前のチャット"); await a.a.startGame(); await a.a.endGame(); await chat(a, "おつかれさま");
  assert.equal(a.a.chatEntries().length, 2); assert.equal(b.room.status, "finished");
});

test("sending chat does not settle or advance a game deadline", async () => {
  const b = backend(), a = await b.client("A"); await b.advance(61000);
  await chat(a, "チャットだけ"); assert.equal(b.room.game.turnNo, 1); assert.equal(b.room.status, "playing");
});

test("chat and drawing submissions can run independently without losing either", async () => {
  const b = backend(), a = await b.client("A"); a.draw();
  a.holdNext = true; const send = chat(a, "先に絵を出すね");
  assert.equal(a.nodes.get("submitDrawingBtn").disabled, false);
  await a.a.submitDrawing(); assert.equal(b.room.game.phase, "guess");
  await b.release(); await send; assert.equal(a.a.chatEntries().length, 1); assert.equal(b.room.game.phase, "guess");
});

test("two peers can send simultaneously and agree on the same message order", async () => {
  const b = backend(), a = await b.client("A"), c = await b.client("B");
  await Promise.all([chat(a, "Aから"), chat(c, "Bから")]);
  assert.deepEqual([...a.a.chatEntries().map(entry => entry.text)], [...c.a.chatEntries().map(entry => entry.text)]);
  assert.equal(a.a.chatEntries().length, 2); assert.deepEqual([...a.a.chatEntries().map(entry => entry.sequence)], [1, 2]);
});

test("only the latest 80 messages are kept, including when timestamps tie", async () => {
  const b = backend(), a = await b.client("A");
  for (let n = 1; n <= 85; n += 1) await chat(a, `メッセージ${n}`);
  assert.equal(a.a.chatEntries().length, 80);
  assert.equal(a.a.chatEntries()[0].text, "メッセージ6"); assert.equal(a.a.chatEntries().at(-1).text, "メッセージ85");
});

test("HTML-looking chat is rendered only as text", async () => {
  const b = backend(), a = await b.client("A"), c = await b.client("B");
  const payload = '<img src=x onerror=alert(1)> & "test"'; await chat(a, payload);
  const item = c.nodes.get("chatList").children.at(-1); assert.equal(item.children[1].textContent, payload);
});

test("empty chat is rejected and control characters and long content are normalized", async () => {
  const b = backend(), a = await b.client("A"); await chat(a, "  \n\t "); assert.equal(a.a.chatEntries().length, 0);
  assert.equal(Rules.cleanChatText("  A\u0000B\nC  "), "A B C");
  assert.equal([...Rules.cleanChatText("😀".repeat(300))].length, 240);
});

test("failed and timed-out chat can retry without disabling drawing or duplicating messages", async () => {
  const b = backend(), a = await b.client("A"); a.failNext = true;
  await chat(a, "再試行するメッセージ"); assert.equal(a.a.chatEntries().length, 0);
  assert.equal(a.nodes.get("chatSend").disabled, false); assert.equal(a.nodes.get("submitDrawingBtn").disabled, false);
  a.holdNext = true; const send = a.a.sendChat(submit); await b.advance(16000, true); await send;
  await b.release(); assert.equal(a.a.chatEntries().length, 0);
  await a.a.sendChat(submit); assert.equal(a.a.chatEntries().length, 1);
});

test("a late old chat request cannot post after reconnect", async () => {
  const b = backend(), a = await b.client("A"); a.nodes.get("chatInput").value = "復帰前の送信"; a.holdNext = true;
  const send = a.a.sendChat(submit); await a.disconnect(); await b.advance(10000); await a.reconnect();
  await b.release(); await send; assert.equal(a.a.chatEntries().length, 0);
  await a.a.sendChat(submit); assert.equal(a.a.chatEntries().length, 1);
});

test("unread chat survives reload, and read messages do not become unread again", async () => {
  const b = backend(), a = await b.client("A"), c = await b.client("B"); await chat(a, "未読のままリロード");
  await c.disconnect(); c.close();
  const reload = await b.client("B", { session: c.session, local: c.local }); assert.equal(reload.a.chatState().unread.length, 1);
  reload.a.toggleChat(true); reload.a.toggleChat(false); await reload.disconnect(); reload.close();
  const second = await b.client("B", { session: reload.session, local: reload.local }); assert.equal(second.a.chatState().unread.length, 0);
});

test("messages sent while a peer is offline show as unread after automatic recovery", async () => {
  const b = backend(), a = await b.client("A"), c = await b.client("B"); await c.disconnect();
  await chat(a, "戻ったら読んでね"); await b.advance(20000); await c.reconnect();
  assert.equal(c.a.chatState().unread.length, 1); assert.equal(c.nodes.get("chatPreview").textContent, "A：戻ったら読んでね");
  assert.equal(c.nodes.get("chatSend").disabled, false);
});

test("leaving hides chat and clears the personal turn color", async () => {
  const b = backend(), a = await b.client("A"); a.a.toggleChat(true); await a.a.leaveRoom();
  assert.equal(a.nodes.get("chatPanel").hidden, true); assert.equal(a.nodes.get("chatToggle").hidden, true);
  assert.equal(a.ctx.document.body.dataset.turn, "idle");
});

test("incoming messages preserve the canvas, secret word, role and deadline", async () => {
  const b = backend(), a = await b.client("A"), c = await b.client("B"); a.draw();
  const image = a.nodes.get("drawingCanvas").image, deadline = b.room.game.deadline;
  for (let n = 0; n < 5; n += 1) await chat(c, `メッセージ${n}`);
  assert.equal(a.nodes.get("drawingCanvas").image, image); assert.equal(a.nodes.get("secretAnswer").value, "ねこ");
  assert.equal(a.ctx.document.body.dataset.turn, "draw"); assert.equal(a.nodes.get("submitDrawingBtn").disabled, false);
  assert.equal(b.room.game.deadline, deadline); assert.equal(a.a.chatState().unread.length, 5);
});

test("even matches started within the same clock millisecond get different round identities", async () => {
  const room = fixture(); room.status = "lobby";
  const b = backend(room), a = await b.client("A"); await a.a.startGame();
  const first = b.room.roundId; await a.a.endGame(); await a.a.returnLobby(); await a.a.startGame();
  assert.notEqual(b.room.roundId, first); assert.equal(b.room.game.turnNo, 1);
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try { await t.run(); console.log("PASS", t.name); }
    catch (error) { failed += 1; console.error("FAIL", t.name, "\n", error.stack); }
  }
  console.log(`${tests.length - failed}/${tests.length} word/order/chat scenarios passed (mock Firebase/DOM; no network)`);
  process.exitCode = failed ? 1 : 0;
})();

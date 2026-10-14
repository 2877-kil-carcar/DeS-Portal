"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const Rules = require("./rules.js");

const base = __dirname;
const html = fs.readFileSync(path.join(base, "index.html"), "utf8");
const app = fs.readFileSync(path.join(base, "app.js"), "utf8");
const css = fs.readFileSync(path.join(base, "style.css"), "utf8");

assert.equal(Rules.normalizeKana("　アイス クリーム　"), "あいすくりーむ");
assert.equal(Rules.headKana("ャク"), "や");
assert.equal(Rules.tailKana("こーひー"), "い");
assert.equal(Rules.tailKana("きゃ"), "や");
assert.deepEqual(Rules.validateWord("りんご", "り", []), { ok: true, reason: "", word: "りんご" });
assert.equal(Rules.validateWord("ごはん", "ご", []).ok, false, "んで終わる語を拒否する");
assert.equal(Rules.validateWord("ねこ", "い", []).ok, false, "指定の文字と異なる語を拒否する");
assert.equal(Rules.validateWord("ねこ", "ね", ["ねこ"]).ok, false, "使用済みの語を拒否する");
assert.equal(Rules.isCorrectGuess("ネコ", "ねこ"), true);
assert.equal(Rules.normalizeTurnSeconds("none"), 0);
assert.equal(Rules.normalizeTurnSeconds(5), 10);
assert.equal(Rules.normalizeTurnSeconds(999), 600);
assert.equal(Rules.timerLabel(90), "1分30秒");
assert.equal(Rules.nextActive(["a", "b", "c"], { a: { active: true }, b: { active: false }, c: { active: true } }, "a"), "c");

for (const required of [
  "createRoomBtn", "joinRoomBtn", "drawingCanvas", "secretAnswer", "guessForm",
  "timePreset", "gameTimePreset", "historyList", "leaveRoomBtn", "endGameBtn",
]) assert.match(html, new RegExp(`id=["']${required}["']`), `${required} がHTMLに必要`);

for (const marker of [
  'const ROOT_PATH = "pictureShiritori/rooms"',
  "runTransaction",
  "onDisconnect",
  "beginNextTurn",
  "expireTurn",
  "remaining <= 10000",
  "MAX_PLAYERS = 8",
  "currentRoom.hostId !== myId",
  "const existing = await get(roomRef(code))",
  'if (!room) { failure = "部屋が見つかりません。"; return null; }',
]) assert.ok(app.includes(marker), `${marker} が実装に必要`);

assert.ok(css.includes("touch-action: none"), "スマホ描画でブラウザスクロールを抑止する");
assert.ok(css.includes("@media (max-width: 760px)"), "スマホレイアウトが必要");
assert.ok(css.includes("grid-template-columns: 58px minmax(0, 1fr)"), "待機画面の文章領域が縮みすぎないこと");
assert.ok(css.includes(".waiting-card .submitted-image-wrap { grid-column: 1 / -1"), "待機中の絵はカード全幅に配置すること");

const syntax = spawnSync(process.execPath, ["--check", path.join(base, "app.js")], { encoding: "utf8" });
assert.equal(syntax.status, 0, syntax.stderr || "app.js syntax check failed");

console.log("picture-shiritori validation: 30 checks passed");

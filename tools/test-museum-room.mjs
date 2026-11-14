// museum-room.js の入室判定を通信なしで確かめる（Firebase の読み込みは差し替える）
import fs from 'node:fs'; import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL("../apps/gallery/museum-room.js", import.meta.url), 'utf8').replace(/^import .*$/gm, '');
const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const { decideEntry, decideWinner, pickHost, cleanCode, cleanName, MAX_PLAYERS } = mod;
const join = (room, pid, extra = {}) => decideEntry(room, { create: false, code: 'ABC234', pid, name: pid, ...extra });
let r = decideEntry(null, { create: true, code: 'ABC234', pid: 'p1', name: 'A' });
assert.equal(r.room.code, 'ABC234'); assert.equal(r.room.players.p1.team, 0);
assert.match(decideEntry(r.room, { create: true, code: 'ZZZ999', pid: 'x', name: 'x' }).error, /すでに部屋/);   // 部屋は 1 つだけ
assert.deepEqual(join(null, 'p2'), { room: null });                                                             // サーバー未確認なら中止しない
assert.match(join(r.room, 'p2', { code: 'WRONG1' }).error, /見つかりません/);
let room = r.room; const teams = [0];
for (let i = 2; i <= MAX_PLAYERS; i++) { const d = join(room, 'p' + i); assert.ok(d.room.players['p' + i]); assert.notEqual(d.room, room); room = d.room; teams.push(room.players['p' + i].team); }
assert.deepEqual(teams, [0, 1, 0, 1, 0, 1]);                                                                    // 2 チームに交互に分かれる
assert.match(join(room, 'p7').error, /満員/);
const empty = { code: 'ABC234', createdAt: 1 };                                                                 // 全員が出た後の部屋
assert.ok(decideEntry(empty, { create: true, code: 'NEW234', pid: 'n', name: 'n' }).room.code === 'NEW234');   // 空なら作り直せる
assert.equal(cleanCode(' ab-c2 34x'), 'ABC234'); assert.equal(cleanName('  <b>なまえ</b>\n'), 'bなまえ/b');
// 残った部屋：「いるよ」の知らせが 2 分とだえた人だけなら、作り直せる。知らせを送らない古い版の人は、6 時間は、いる扱い
const T = 1e12, left = at => ({ code: 'OLD234', createdAt: T, players: { z: { name: 'z', team: 0, s: [], ...at } } });
const make = (room, now) => decideEntry(room, { create: true, code: 'NEW234', pid: 'n', name: 'n', now });
assert.match(make(left({ at: T }), T + 119e3).error, /すでに部屋/);
assert.deepEqual(Object.keys(make(left({ at: T }), T + 121e3).room.players), ['n']);
assert.match(make(left({}), T + 5 * 3600e3).error, /すでに部屋/);
assert.equal(make(left({}), T + 7 * 3600e3).room.code, 'NEW234');
console.log('PASS museum-room entry rules (12 checks)');
// 試合の勝敗：両チームに生き残りがいる間は続く。片方が全滅で相手の勝ち、同時に全滅なら引き分け
assert.equal(decideWinner([2, 1]), null); assert.equal(decideWinner([1, 0]), 0); assert.equal(decideWinner([0, 3]), 1); assert.equal(decideWinner([0, 0]), -1);
console.log('PASS museum-room match result (4 checks)');
// アイテムを出す係：誰の端末で計算しても同じ 1 人になる。その人が抜けたら次の人へ移る
assert.equal(pickHost(['b', 'c', 'a']), 'a'); assert.equal(pickHost(['c', 'a', 'b']), 'a'); assert.equal(pickHost(['c', 'b']), 'b'); assert.equal(pickHost([]), null);
console.log('PASS museum-room item host (4 checks)');

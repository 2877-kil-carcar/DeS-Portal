// もふもふ冒険の 3 ステージが「1 人で最後まで解ける」ことを、描画も通信もなしで検査する。
// 自動操縦：目的地へ歩き、足元がなくなれば跳び、登れる縁があればつかんでよじ登る。
import assert from 'node:assert/strict';
import { STAGES, makeWorld, makePlayer } from '../apps/gallery/adventure-world.js';

function bot(index) {
  const w = makeWorld(STAGES[index]), p = makePlayer(w), name = STAGES[index].name;
  let now = 0, falls = 0;
  const where = () => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
  const api = { w, p, get falls() { return falls; } };
  const tick = api.tick = (mx = 0, mz = 0) => {
    now += 1000 / 60; w.step(1 / 60, now, [[p.x, p.y, p.z]]); p.step(1 / 60, mx, mz);
    if (p.events.includes('fell')) { falls++; api.fellAt = api.last; }
    if (p.events.includes('goal')) p.goal = true;
    p.events.length = 0; api.last = where();
  };
  api.wait = (what, pred, seconds = 30) => { for (let i = 0; i < seconds * 60; i++) { if (pred()) return; tick(); } assert.fail(`${name}: 「${what}」を待ちきれない ${where()}`); };
  // target は [x, z] か、それを返す関数（動く床を追うとき）。until があれば、着くかわりにその条件で終わる（風に乗っている間など）
  api.go = (target, until, seconds = 25) => {
    for (let i = 0; i < seconds * 60; i++) {
      const [tx, tz] = typeof target === 'function' ? target() : target, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (until ? until() : d < 0.3 && p.grounded) { if (!p.carry) p.grabEnd(); return; }
      if (d < 0.05) { tick(); continue; }
      const fx = dx / d, fz = dz / d, [hx, hz] = p.facing(), aligned = hx * fx + hz * fz > 0.95;
      if (!p.carry) {
        if (p.grab && !p.hang) p.grabEnd();
        if (aligned && !p.grab) {                                             // 重い箱は、跳んでからつかむと登れる（地面でつかむと押し引きになる）
          const e = w.ledge(p.x, p.z, p.y, hx, hz);
          if (e?.crate?.heavy && p.grounded) p.jump(); else if (e && !(e.crate && !e.crate.heavy) && (p.grounded || e.crate)) p.grabStart();
        }
      }
      if (p.grounded && aligned && d > 0.9 && !w.groundBox(p.x + fx * 0.5, p.z + fz * 0.5, p.y)) p.jump();
      tick(fx, fz);
    }
    assert.fail(`${name}: 目的地 ${typeof target === 'function' ? target() : target} に着けない ${where()}`);
  };
  api.face = (x, z) => { p.ry = Math.atan2(x - p.x, z - p.z); };
  // 箱 i のそばへ行ってつかむ（from: つかむときに立つ場所）
  api.grab = (i, from) => { const c = w.crates[i]; api.go(from); api.face(c.x, c.z); assert.equal(p.grabStart(), c, `${name}: 箱 ${i} をつかめない ${where()}`); };
  // 軽い箱 i を、ふみ板 plate の上へ運んで置く
  api.carry = (i, plate) => {
    const c = w.crates[i], t = w.plates[plate], d0 = Math.hypot(p.x - c.x, p.z - c.z);
    api.grab(i, [c.x + (p.x - c.x) / d0, c.z + (p.z - c.z) / d0]);
    const ux = t.x - p.x, uz = t.z - p.z, u = Math.hypot(ux, uz);
    api.go([t.x - ux / u * 0.75, t.z - uz / u * 0.75]); p.grabEnd();
    api.wait(`ふみ板 ${plate} が押される`, () => t.down, 3);
  };
  // 重い箱 i を、進めなくなるまで (dx, dz) の向きへ押す
  api.push = (i, from, dx, dz) => {
    api.grab(i, from);
    let last = 1e9, still = 0;
    for (let n = 0; n < 60 * 40 && still < 30; n++) { tick(dx, dz); const c = w.crates[i], q = c.x * dx + c.z * dz; still = Math.abs(q - last) < 1e-4 ? still + 1 : 0; last = q; }
    p.grabEnd();
  };
  api.center = m => { const k = w.movers[m].box; return [(k.x0 + k.x1) / 2, (k.z0 + k.z1) / 2]; };
  // 動く床 m に、近くへ来たときに飛び乗る
  api.hop = (m, reach = 1.2) => { const k = w.movers[m].box; api.wait(`動く床 ${m} が近づく`, () => p.grounded && Math.abs(api.center(m)[0] - p.x) < reach && Math.abs(k.y1 - p.y) < 0.3); api.go(() => api.center(m)); };
  // 動く床 m に乗ったまま、行き先（frac = 1）か出発点（0）に着くのを待つ
  api.ride = (m, frac) => api.wait(`動く床 ${m} が${frac ? '行き先' : '出発点'}に着く`, () => Math.abs(w.movers[m].f - frac) < 0.03);
  // 上下する床 m が下りてくるのを待つ（上がっている間に踏み出すと、床の下へ落ちる）
  api.board = m => { let prev = 2; api.wait(`動く床 ${m} が下りてくる`, () => { const f = w.movers[m].f, ok = f < 0.3 && f < prev; prev = f; return ok; }); };
  api.wait('空から着地', () => p.grounded, 6);
  return api;
}
const finish = (b, index) => {
  assert.ok(b.p.goal, `${STAGES[index].name}: ゴールに着いていない`);
  assert.equal(b.falls, 0, `${STAGES[index].name}: 途中で ${b.falls} 回落ちた（最後は ${b.fellAt} の近く）`);
  assert.equal(b.p.cp, STAGES[index].cps.length - 1, `${STAGES[index].name}: 通っていないセーブ地点がある`);
  console.log(`PASS stage ${index + 1} 「${STAGES[index].name}」 is solvable alone`);
};

// ── ステージ 1：跳ぶ → よじ登る → 箱で門を開ける → トランポリン → くずれる床 → 上下する床 → 回る床 ──
let b = bot(0);
b.go([0, 8]); b.go([0, 13]); b.go([0, 18]);
assert.ok(Math.abs(b.p.y - 2.6) < 0.01, '段をよじ登れていない');
b.carry(0, 0);
b.wait('門が開く', () => b.w.movers[0].f > 0.98, 5);
b.go([0, 20]); b.go([0, 26.5]); b.go([0, 39]);
b.go([0, 47]);                                                           // 途中のトランポリンで上の島へ
assert.ok(Math.abs(b.p.y - 5.6) < 0.01, `トランポリンで上の島に乗れていない (y=${b.p.y})`);
b.go([0, 62.5]);                                                         // くずれる床 4 枚を止まらず渡る
b.go([0, 65.7]); b.board(5); b.go([0, 68.25]); b.ride(5, 1); b.go([0, 74]);
b.go([0, 77.4]);
const docked = m => Math.hypot(b.center(m)[0], b.center(m)[1] - 79.5) < 0.7;
b.wait('回る床が岸に来る', () => docked(6) || docked(7));
const spin = docked(6) ? 6 : 7;
b.go(() => b.center(spin));
b.wait('回る床が向こう岸に着く', () => b.center(spin)[1] > 88.2 && Math.abs(b.center(spin)[0]) < 1.2);
b.go([0, 95.5]);
finish(b, 0);

// 門は、ふみ板が押されていない間は閉まっている。くずれる床は、乗ったままだと一緒に落ちる
b = bot(0); b.go([0, 8]); b.go([0, 13]); b.go([0, 18]);
assert.ok(b.w.blocked(0, 28, 2.6), '門が最初から開いている');
b.p.x = 0; b.p.y = 5.6; b.p.z = 51.1; b.p.cp = 3;
b.wait('くずれる床と一緒に落ちはじめる', () => b.p.y < 2, 8);
console.log('PASS gate stays shut without the plate; a crumbling tile drops whoever lingers');

// ── ステージ 2：重い箱を足場に → ふみ板 2 枚の門 → 逆向きのベルトと押し出し壁 → 時間制限の門 → 行き来する床 → トランポリン 2 段 → ふみ板で上がる橋 ──
b = bot(1);
b.push(0, [3, -0.1], 0, 1);
assert.ok(b.w.crates[0].z > 5.2, `重い箱が壁ぎわまで動いていない (z=${b.w.crates[0].z})`);
b.go([3, 9]);
assert.ok(Math.abs(b.p.y - 3) < 0.01, `箱を足場に壁を登れていない (y=${b.p.y})`);
b.carry(1, 0); b.carry(2, 1);
b.wait('門が開く', () => b.w.movers[0].f > 0.98, 5);
b.go([0, 23.5]); b.go([0, 38]); b.go([0, 41.5]);
b.wait('押し出し壁が引っ込みはじめる', () => b.w.movers[1].f > 0.97);
b.go([0, 62]);                                                           // ベルトをさかのぼる。途中でふみ板（時間制限の門）も踏む
b.go([0, 80]);
assert.ok(b.w.movers[3].f > 0.5, '時間制限の門が、通る前に閉まっていた');
b.go([0, 83.5]);
b.hop(4); b.hop(5); b.hop(6);
b.wait('島の正面に来る', () => Math.abs(b.p.x) < 2.5); b.go(() => [b.p.x, 100.5]);
b.go([0, 101]); b.go([0, 109.5]); b.go([0, 117]);                                        // トランポリン 2 段
assert.ok(Math.abs(b.p.y - 9) < 0.01, `トランポリンで上まで登れていない (y=${b.p.y})`);
b.carry(3, 3);
b.wait('橋が上がる', () => b.w.movers[7].f > 0.98, 5);
b.go([0, 119.5]); b.go([0, 133]);
finish(b, 1);

// ── ステージ 3：ふみ板のエレベーター → 氷 → 風で上へ → 観覧車 → 重い箱で壁を登る → くずれる床とトランポリン ──
b = bot(2);
b.carry(0, 0);
b.go([0, 6.5]); b.go([0, 9]); b.go([0, 13]); b.go([0, 14.2]);
b.board(0); b.go([0, 16.75]); b.ride(0, 1); b.go([0, 23]);
b.go([0, 51]);                                                           // 氷の道
b.carry(1, 2);
assert.ok(b.w.winds[0].active, 'ふみ板を押しても風が吹かない');
b.go([0, 53.5]); b.go([0, 57.5], () => b.p.y > 17.7); b.go([0, 64]);      // 風に乗って上がり、上の足場へ
assert.ok(Math.abs(b.p.y - 17) < 0.01, `風で上の足場に乗れていない (y=${b.p.y})`);
b.go([0, 67.3]);
const low = () => [1, 2, 3].find(m => Math.abs(b.center(m)[1] - 72.1) < 0.5 && b.w.movers[m].box.y1 < 17.3);   // いちばん下へ着く少し手前から動き出す
b.wait('観覧車のかごが下に来る', () => low() != null);
const car = low();
b.go(() => b.center(car), () => b.p.on === b.w.movers[car].box && Math.abs(b.center(car)[1] - b.p.z) < 0.5);
b.wait('かごが高い足場の横へ下りてくる', () => b.center(car)[1] > 75.4 && b.w.movers[car].box.y1 > 21.9 && b.w.movers[car].box.y1 < 23.2);
b.go([0, 81]);
b.push(2, [3, 78.9], 0, 1);
b.go([3, 87]); b.go([0, 87]);
assert.ok(Math.abs(b.p.y - 25) < 0.01, );
b.go([0, 105.5]);
finish(b, 2);

// ── 落ちたら、最後に通ったセーブ地点の真上（空）から落ちてきて再開する ──
b = bot(0); b.go([0, 8]); b.go([0, 13]); b.go([0, 18]);
assert.equal(b.p.cp, 1);
for (let i = 0; i < 900 && !b.falls; i++) b.tick(1, 0);                  // 東の縁から落ちる
assert.equal(b.falls, 1, '落ちてもやり直しにならない');
assert.ok(b.p.y > 10 && Math.hypot(b.p.x, b.p.z - 18) < 1, `セーブ地点の真上に戻っていない (${b.p.x}, ${b.p.y}, ${b.p.z})`);
b.wait('セーブ地点へ着地', () => b.p.grounded, 6);
assert.ok(Math.abs(b.p.y - 2.6) < 0.01);
console.log('PASS falling restarts from the last checkpoint, dropping from the sky');

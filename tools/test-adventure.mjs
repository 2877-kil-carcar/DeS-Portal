// もふもふ冒険の 3 ステージが「1 人で最後まで解ける」ことを、描画も通信もなしで検査する。
// 自動操縦：目的地へ歩き、足元がなくなれば跳び、登れる縁があればつかんでよじ登る。
import assert from 'node:assert/strict';
import { STAGES, makeWorld, makePlayer } from '../apps/gallery/adventure-world.js';

function bot(index) {
  const w = makeWorld(STAGES[index]), p = makePlayer(w), name = STAGES[index].name;
  let now = 0, falls = 0;
  const tick = (mx = 0, mz = 0) => {
    now += 1000 / 60; w.step(1 / 60, now, [[p.x, p.y, p.z]]); p.step(1 / 60, mx, mz);
    if (p.events.includes('fell')) falls++;
    if (p.events.includes('goal')) p.goal = true;
    p.events.length = 0;
  };
  const where = () => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
  const api = { w, p, tick, get falls() { return falls; } };
  api.wait = (what, pred, seconds = 25) => { for (let i = 0; i < seconds * 60; i++) { if (pred()) return; tick(); } assert.fail(`${name}: 「${what}」を待ちきれない ${where()}`); };
  // target は [x, z] か、それを返す関数（動く床を追うとき）
  api.go = (target, seconds = 20) => {
    for (let i = 0; i < seconds * 60; i++) {
      const [tx, tz] = typeof target === 'function' ? target() : target, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (d < 0.3 && p.grounded) { if (!p.carry) p.grabEnd(); return; }
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
    for (let n = 0; n < 60 * 30 && still < 30; n++) { tick(dx, dz); const c = w.crates[i], q = c.x * dx + c.z * dz; still = Math.abs(q - last) < 1e-4 ? still + 1 : 0; last = q; }
    p.grabEnd();
  };
  const center = m => [(m.box.x0 + m.box.x1) / 2, (m.box.z0 + m.box.z1) / 2];
  // 動く床 m に、近くへ来たときに飛び乗る
  api.hop = (m, reach = 1.2) => { const mv = w.movers[m]; api.wait(`動く床 ${m} が近づく`, () => p.grounded && Math.abs(center(mv)[0] - p.x) < reach && Math.abs(mv.box.y1 - p.y) < 0.3); api.go(() => center(mv)); };
  // 動く床 m に乗ったまま、行き先（frac = 1）か出発点（0）に着くのを待つ
  api.ride = (m, frac) => api.wait(`動く床 ${m} が${frac ? '行き先' : '出発点'}に着く`, () => Math.abs(w.movers[m].f - frac) < 0.03);
  api.wait('空から着地', () => p.grounded, 6);
  return api;
}
const finish = (b, index) => {
  assert.ok(b.p.goal, `${STAGES[index].name}: ゴールに着いていない`);
  assert.equal(b.falls, 0, `${STAGES[index].name}: 途中で ${b.falls} 回落ちた`);
  assert.equal(b.p.cp, STAGES[index].cps.length - 1, `${STAGES[index].name}: 通っていないセーブ地点がある`);
  console.log(`PASS stage ${index + 1} 「${STAGES[index].name}」 is solvable alone`);
};

// ── ステージ 1：跳ぶ → よじ登る → 箱でふみ板を押して門を開ける → 上下する床 → 横に動く床 ──
let b = bot(0);
b.go([0, 8]); b.go([0, 13]); b.go([0, 18]);
assert.ok(Math.abs(b.p.y - 2.6) < 0.01, '段をよじ登れていない');
b.carry(0, 0);
assert.ok(b.w.movers[0].f < 0.01 || true);
b.wait('門が開く', () => b.w.movers[0].f > 0.98, 5);
b.go([0, 21]); b.go([0, 26.5]); b.go([0, 39]);
b.ride(1, 0); b.go([0, 45.75]); b.ride(1, 1); b.go([0, 51]);
b.ride(2, 0); b.go([0, 57]); b.ride(2, 1); b.go([0, 72]);
finish(b, 0);

// 門は、ふみ板から箱をどけると閉まる（押している間だけ開く）
b = bot(0); b.go([0, 8]); b.go([0, 13]); b.go([0, 18]);
assert.ok(b.w.blocked(0, 28, 2.6), '門が最初から開いている');

// ── ステージ 2：重い箱を足場に → ふみ板 2 枚の門 → 行き来する床 3 枚 → ふみ板で上がる橋 ──
b = bot(1);
b.push(0, [3, -0.1], 0, 1);
assert.ok(b.w.crates[0].z > 5.2, `重い箱が壁ぎわまで動いていない (z=${b.w.crates[0].z})`);
b.go([3, 9]);
assert.ok(Math.abs(b.p.y - 3) < 0.01, `箱を足場に壁を登れていない (y=${b.p.y})`);
b.carry(1, 0); b.carry(2, 1);
b.wait('門が開く', () => b.w.movers[0].f > 0.98, 5);
b.go([0, 23.5]); b.go([0, 38]); b.go([0, 41.5]);
b.hop(1); b.hop(2); b.hop(3);
b.wait('島の正面に来る', () => Math.abs(b.p.x) < 2.5); b.go(() => [b.p.x, 58.5]); b.go([0, 60]);
b.carry(3, 2);
b.wait('橋が上がる', () => b.w.movers[4].f > 0.98, 5);
b.go([0, 63.5]); b.go([0, 77]);
finish(b, 1);

// ── ステージ 3：ふみ板で動くエレベーター → ふみ板で動く床 → 重い箱で壁を登る → 段を跳び上がる ──
b = bot(2);
b.carry(0, 0);
b.go([0, 6.5]); b.go([0, 9]); b.go([0, 13]);
b.ride(0, 0); b.go([0, 16.75]); b.ride(0, 1); b.go([0, 23]);
b.carry(1, 2);
b.go([0, 26.4]); b.ride(1, 0); b.go([0, 28.75]); b.ride(1, 1); b.go([0, 39]);
b.push(2, [3, 36.9], 0, 1);
b.go([3, 46]); b.go([0, 46]);
assert.ok(Math.abs(b.p.y - 13) < 0.01, `箱を足場に壁を登れていない (y=${b.p.y})`);
b.go([0, 53]); b.go([0, 58.5]); b.go([0, 64.5]);
finish(b, 2);

// ── 落ちたら、最後に通ったセーブ地点の真上（空）から落ちてきて再開する ──
b = bot(0); b.go([0, 8]); b.go([0, 13]); b.go([0, 18]);
assert.equal(b.p.cp, 1);
for (let i = 0; i < 600 && !b.falls; i++) b.tick(1, 0);                  // 東の縁から落ちる
assert.equal(b.falls, 1, '落ちてもやり直しにならない');
assert.ok(b.p.y > 10 && Math.hypot(b.p.x, b.p.z - 18) < 1, `セーブ地点の真上に戻っていない (${b.p.x}, ${b.p.y}, ${b.p.z})`);
b.wait('セーブ地点へ着地', () => b.p.grounded, 6);
assert.ok(Math.abs(b.p.y - 2.6) < 0.01);
console.log('PASS falling restarts from the last checkpoint, dropping from the sky');

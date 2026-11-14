// もふもふ冒険を、でたらめな操作で長時間動かして「はまって動けなくなる」「数値がこわれる」場所を探す。
// 各ステージの各セーブ地点から始め、歩く・跳ぶ・つかむ・放す（ハンドルがあれば、それを回す・放す）を乱数で混ぜる。見つけたら場所を出して失敗する。
// そのあと、上下に動く床のすぐ横に立たせて、床にはさまれても歩いて出られることを確かめる。
// 使い方：node tools/fuzz-adventure.mjs [回数=40] [ステージ番号 …]（乱数の種は固定なので、同じ結果を再現できる）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kit, makeWorld, makePlayer } from '../apps/gallery/adventure-world.js';

let seed = 12345;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const [runsArg, ...onlyArgs] = process.argv.slice(2);
const runs = +runsArg || 40, DT = 1 / 30;
const dir = new URL('../apps/gallery/adventure-stages/', import.meta.url);
const all = fs.readdirSync(dir).map(f => /^s(\d+)\.js$/.exec(f)).filter(Boolean).map(m => +m[1]).sort((a, b) => a - b);
const only = onlyArgs.map(Number).filter(n => n > 0);
let total = 0;
for (const n of only.length ? only : all) {
  const st = (await import(new URL(`s${n}.js`, dir).href)).default(kit);
  for (let cp = 0; cp < st.cps.length; cp++) for (let run = 0; run < runs; run++) {
    const realRandom = Math.random; Math.random = rnd;                    // やり直しの落下位置も同じ乱数にそろえる
    const w = makeWorld(st), p = makePlayer(w);
    p.cp = cp; p.respawn();
    let now = rnd() * 20000, mx = 0, mz = 1, stuckT = 0, ghost = [];
    for (let i = 0; i < 30 * 45; i++) {                                  // 45 秒ぶん
      if (i % 20 === 0) { const a = rnd() * Math.PI * 2, go = rnd() < 0.85; mx = go ? Math.sin(a) : 0; mz = go ? Math.cos(a) : 0; }
      if (i % 20 === 0 && st.handles?.length) ghost = rnd() < 0.3 ? [Math.floor(rnd() * st.handles.length)] : [];   // ハンドルがあれば、いることにした仲間が、でたらめに回したり放したりする
      if (rnd() < 0.03) p.jump();
      if (rnd() < 0.02) p.grabStart(); else if (rnd() < 0.03) p.grabEnd();
      const x0 = p.x, z0 = p.z;
      now += 1000 * DT; w.step(DT, now, [[p.x, p.y, p.z, p.carry && !p.carry.heavy ? 2 : 1]], p.crank != null ? [...ghost, p.crank] : ghost); p.step(DT, mx, mz);   // 軽い箱を持っている間は、2 人ぶんの重さ。自分が回しているハンドルも渡す
      p.events.length = 0; total++;
      const at = `ステージ ${n}「${st.name}」 セーブ地点 ${cp} / ${run} 回目 (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`;
      assert.ok([p.x, p.y, p.z, p.vy, p.hvx, p.hvz].every(Number.isFinite), `数値がこわれた ${at}`);
      for (const c of w.crates) assert.ok([c.x, c.y, c.z].every(Number.isFinite), `箱の数値がこわれた ${at}`);
      // はまり：地面に立ち、何もつかまず、歩こうとしているのに動けない状態が続き、しかも 8 方向どこへも出られない
      const trying = (mx || mz) && p.grounded && !p.hang && !p.carry?.heavy;
      stuckT = trying && Math.hypot(p.x - x0, p.z - z0) < 1e-5 ? stuckT + DT : 0;
      if (stuckT > 1.5) {
        const free = [0, 1, 2, 3, 4, 5, 6, 7].some(k => !w.blocked(p.x + Math.sin(k * Math.PI / 4) * 0.1, p.z + Math.cos(k * Math.PI / 4) * 0.1, p.y));
        assert.ok(free, `はまって動けない ${at}`);
        stuckT = 0;
      }
    }
    Math.random = realRandom;
  }
  // 上下に動く床のすぐ横（縁から 0.2m 外。体の半径ぶん、床に重なる）に立っていても、はさまって動けなくならない。
  // 床を動かすふみ板と、乗ると動く床・てんびんの皿には「いることにした体」を 8 秒乗せ、床が行って帰る間、1 秒ごとに外へ歩けるかを確かめる
  for (const [mi, m0] of st.movers.entries()) if (m0.to?.[1] && m0.mode !== 'crumble') for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const w = makeWorld(st), p = makePlayer(w), m = w.movers[mi], b = m0.b;
    const x = (b.x0 + b.x1) / 2 + sx * ((b.x1 - b.x0) / 2 + 0.2), z = (b.z0 + b.z1) / 2 + sz * ((b.z1 - b.z0) / 2 + 0.2), y = w.floorY(x, z, Math.max(b.y1, b.y1 + m0.to[1]));
    if (y < -90) continue;                                                // そこには足場がない
    const signals = (m.on || []).map(i => w.plates[i]), ends = signals.filter(k => k.kind === 'rail');
    const ghosts = () => signals.filter(k => !k.kind).map(k => [k.x, k.y, k.z, 2])
      .concat(w.movers.filter(k => k.mode === 'ride' || k.mode === 'scale').map(k => [(k.box.x0 + k.box.x1) / 2, k.box.y1, (k.box.z0 + k.box.z1) / 2, 2]));
    // ハンドルで巻き上げる床は、その 8 秒の間ハンドルを回し、放してから戻りきるまで（hold ＋ down 秒）続ける。レバーで動く床は、つまみをその端へ寄せ、8 秒たったら反対の端へ寄せる
    for (let i = 0; i < 30 * (16 + (m.mode === 'crank' ? (m.hold ?? 12) + (m.down ?? 8) : 0)); i++) {
      const t = i % 30, walk = t >= 18, out = i < 30 * 8;                 // 毎秒：元の場所に置きなおして 0.6 秒じっとし、0.4 秒だけ外へ歩く
      if (!t) Object.assign(p, { x, y, z, vy: 0, hvx: 0, hvz: 0, grounded: true, hang: null });
      for (const k of ends) { const c = w.crates[k.crate], r = c.rail; c[r.axis] = out === (k.at === 'max') ? r.max : r.min; w.fit(c); }
      w.step(DT, (i + 1) * 1000 * DT, [[p.x, p.y, p.z], ...(out ? ghosts() : [])], out ? m.handles || [] : []); p.step(DT, walk ? sx : 0, walk ? sz : 0);
      p.events.length = 0; total++;
      if (t === 29) assert.ok(Math.hypot(p.x - x, p.z - z) > 0.3 || w.blocked(p.x, p.z, p.y)?.m !== m,
        `動く床 ${mi} の横で、はさまって動けない ステージ ${n}「${st.name}」 (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) ${i / 30 | 0} 秒め`);
    }
  }
}
console.log(`PASS fuzz: ${total} frames of random play, no stuck spots and no broken numbers`);

// もふもふ冒険を、でたらめな操作で長時間動かして「はまって動けなくなる」「数値がこわれる」場所を探す。
// 各ステージの各セーブ地点から始め、歩く・跳ぶ・つかむ・放すを乱数で混ぜる。見つけたら場所を出して失敗する。
// 使い方：node tools/fuzz-adventure.mjs [回数=40]（乱数の種は固定なので、同じ結果を再現できる）
import assert from 'node:assert/strict';
import { STAGES, makeWorld, makePlayer } from '../apps/gallery/adventure-world.js';

let seed = 12345;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const runs = +process.argv[2] || 40, DT = 1 / 30;
let total = 0;
STAGES.forEach((st, index) => {
  for (let cp = 0; cp < st.cps.length; cp++) for (let run = 0; run < runs; run++) {
    const w = makeWorld(st), p = makePlayer(w);
    p.cp = cp; p.respawn();
    const realRandom = Math.random; Math.random = rnd;                    // やり直しの落下位置も同じ乱数にそろえる
    let now = rnd() * 20000, mx = 0, mz = 1, stuckT = 0;
    for (let i = 0; i < 30 * 45; i++) {                                  // 45 秒ぶん
      if (i % 20 === 0) { const a = rnd() * Math.PI * 2, go = rnd() < 0.85; mx = go ? Math.sin(a) : 0; mz = go ? Math.cos(a) : 0; if (rnd() < 0.5) mz = Math.abs(mz); }
      if (rnd() < 0.03) p.jump();
      if (rnd() < 0.02) p.grabStart(); else if (rnd() < 0.03) p.grabEnd();
      const x0 = p.x, z0 = p.z;
      now += 1000 * DT; w.step(DT, now, [[p.x, p.y, p.z]]); p.step(DT, mx, mz);
      p.events.length = 0; total++;
      const at = `「${st.name}」 セーブ地点 ${cp} / ${run} 回目 (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`;
      assert.ok([p.x, p.y, p.z, p.vy, p.hvx, p.hvz].every(Number.isFinite), `数値がこわれた ${at}`);
      for (const c of w.crates) assert.ok([c.x, c.y, c.z].every(Number.isFinite), `箱の数値がこわれた ${at}`);
      // はまり：地面に立ち、何もつかまず、歩こうとしているのに、どの向きへも 3 秒動けない
      const trying = (mx || mz) && p.grounded && !p.hang && !p.carry?.heavy;
      stuckT = trying && Math.hypot(p.x - x0, p.z - z0) < 1e-5 ? stuckT + DT : 0;
      if (stuckT > 1.5) {                                                 // 壁に向かって歩いているだけかもしれないので、8 方向すべて試す
        const free = [0, 1, 2, 3, 4, 5, 6, 7].some(k => !w.blocked(p.x + Math.sin(k * Math.PI / 4) * 0.1, p.z + Math.cos(k * Math.PI / 4) * 0.1, p.y));
        assert.ok(free, `はまって動けない ${at}`);
        stuckT = 0;
      }
    }
    Math.random = realRandom;
  }
});
console.log(`PASS fuzz: ${total} frames of random play, no stuck spots and no broken numbers`);

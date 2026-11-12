// もふもふ美術館の「高さつきの当たり判定」を、描画も通信もなしで検査する。
// museum.html の冒頭（間取り〜 canBeAt）だけを取り出して動かす。
import fs from 'node:fs'; import assert from 'node:assert/strict';
const html = fs.readFileSync(new URL('../apps/gallery/museum.html', import.meta.url), 'utf8');
const src = html.slice(html.indexOf('const PLANS = ['), html.indexOf('console.assert(PLANS.length'));
const m = await import('data:text/javascript;base64,' + Buffer.from(src + '\nexport { C, H, STAIRS, RAIL, BENCH_TOP, cx, cz, supportAt, canBeAt, rampAt };').toString('base64'));
const { C, H, STAIRS, RAIL, BENCH_TOP, cx, cz, supportAt, canBeAt, rampAt } = m;

// ページと同じ動かし方：横へ動いて、足元の面に沿う／落ちる／跳ぶ
function walker(x, y, z) {
  const s = { x, y, z, vy: 0, grounded: true };
  s.step = (mx, mz, dt = 1 / 60) => {
    if (canBeAt(s.x + mx, s.z, s.y, s.x, s.z)) s.x += mx;
    if (canBeAt(s.x, s.z + mz, s.y, s.x, s.z)) s.z += mz;
    const floor = supportAt(s.x, s.z, s.y);
    if (s.grounded && s.vy <= 0 && s.y - floor < 0.45) s.y = floor;
    else { s.vy -= 14 * dt; s.y += s.vy * dt; s.grounded = s.y <= floor; if (s.grounded) { s.y = floor; s.vy = 0; } }
  };
  s.walk = (vx, vz, seconds) => { for (let i = 0; i < seconds * 60; i++) s.step(vx / 60, vz / 60); return s; };
  s.jump = () => { s.vy = 5.6; s.grounded = false; };
  return s;
}
const near = (a, b, eps = 0.02) => Math.abs(a - b) < eps;
const A = STAIRS[0], B = STAIRS[1];

// 1. 階段 A を下の端から歩いて上ると 2 階に着く。続けて階段 B で 3 階に着く
let w = walker(cx(5), 0, A.z).walk(4, 0, 4.2);
assert.ok(near(w.y, H) && w.x > A.x1, `階段 A を上れない (y=${w.y})`);
w = walker(cx(11), H, B.z).walk(-4, 0, 4.2);
assert.ok(near(w.y, 2 * H) && w.x < B.x1, `階段 B を上れない (y=${w.y})`);
// 2. 上の端から歩いて下りると 1 階に戻る（途中で浮かない）
w = walker(cx(11), H, A.z); let maxGap = 0;
for (let i = 0; i < 4.2 * 60; i++) { w.step(-4 / 60, 0); maxGap = Math.max(maxGap, w.y - supportAt(w.x, w.z, w.y)); }
assert.ok(near(w.y, 0) && maxGap < 1e-9, `階段を下りる途中で浮いた (gap=${maxGap})`);
console.log('PASS stairs: walk up A and B, walk down A');

// 3. 1 階：階段の横からも、階段の裏（高い側の下）からも入れない
assert.ok(!canBeAt(0, A.z + C / 2 - 0.1, 0, 0, A.z + C / 2 + 0.1), '1 階で階段の横から入れてしまう');
assert.ok(!canBeAt(A.x1 - 0.1, A.z, 0, A.x1 + 0.1, A.z), '1 階で階段の下にもぐれてしまう');
// 4. 2 階：吹き抜けの柵は歩いては越えられない（長い辺・下の端とも）。上の端からは下りられる
assert.ok(!canBeAt(0, A.z + C / 2 - 0.1, H, 0, A.z + C / 2 + 0.1), '2 階で柵を歩いて越えられてしまう');
assert.ok(!canBeAt(A.x0 + 0.1, A.z, H, A.x0 - 0.1, A.z), '2 階で下の端の柵を歩いて越えられてしまう');
assert.ok(canBeAt(A.x1 - 0.1, A.z, H, A.x1 + 0.1, A.z), '2 階から階段へ下りられない');
console.log('PASS stairs: side, underside and railings block walking');

// 5. 2 階で跳べば柵を越えられて、吹き抜けへ落ちて階段の面に着地する
w = walker(0, H, A.z + C / 2 + 0.6);
w.walk(0, -4, 0.05); assert.ok(w.z > A.z + C / 2, '跳ばずに柵を越えた');
w.jump(); w.walk(0, -4, 0.5);
assert.ok(Math.abs(w.z - A.z) < C / 2, `跳んでも柵を越えられない (z=${w.z})`);
w.walk(0, 0, 2);
assert.ok(w.grounded && near(w.y, rampAt(w.x, w.z).h), `階段の面に着地しない (y=${w.y})`);
// 6. 階段の上で跳べば横の柵を越えられて、下の階の床まで落ちる
w = walker(-2, rampAt(-2, A.z).h, A.z + 0.6);
w.walk(0, 4, 0.3); assert.ok(Math.abs(w.z - A.z) < C / 2, '跳ばずに階段の柵を越えた');
w.jump(); w.walk(0, 4, 0.5); w.walk(0, 0, 2);
assert.ok(w.z > A.z + C / 2 && w.grounded && near(w.y, 0), `階段から跳び下りられない (z=${w.z}, y=${w.y})`);
// 6b. 階段の中ほど（高さ 2.2m）からでも跳び下りられる。上の端近くでは上の階の柵に当たって出られない
w = walker(0, rampAt(0, A.z).h, A.z + 0.6); w.jump(); w.walk(0, 4, 0.5); w.walk(0, 0, 2);
assert.ok(w.z > A.z + C / 2 && near(w.y, 0), `階段の中ほどから跳び下りられない (z=${w.z}, y=${w.y})`);
w = walker(4.5, rampAt(4.5, A.z).h, A.z + 0.6); w.jump(); w.walk(0, 4, 0.5); w.walk(0, 0, 2);
assert.ok(Math.abs(w.z - A.z) < C / 2, '上の端近くで柵をすり抜けた');
console.log('PASS stairs: jump over the railing and fall');

// 7. ベンチ：歩いては通れない。跳べば乗れて、座面の高さに立つ。歩いて下りると床に落ちる
const bx = cx(6), bz = cz(2);                                          // 1 階・北の展示室のベンチ
w = walker(bx, 0, bz + 1.4).walk(0, -4, 0.5);
assert.ok(w.z > bz + 0.3, 'ベンチを歩いて通り抜けた');
w.jump(); w.walk(0, -4, 0.22); w.walk(0, 0, 1.5);
assert.ok(w.grounded && near(w.y, BENCH_TOP) && Math.abs(w.z - bz) < 0.36, `ベンチに乗れない (y=${w.y}, z=${w.z})`);
w.walk(0, -4, 0.6); w.walk(0, 0, 1);
assert.ok(w.grounded && near(w.y, 0) && w.z < bz - 0.3, `ベンチから下りられない (y=${w.y})`);
console.log('PASS bench: blocked on foot, standable after a jump');

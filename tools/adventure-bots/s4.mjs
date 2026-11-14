// ステージ 4「てんびん石切り場」を 1 人で解く手順：橋 X で島へ → のこぎりの床を北へ → 台車を踏み台に棚のでんち → 中の岸でレバー → 橋 Z で波止場、青い皿へ
// → 柱のあみ・木の橋でデッキへ → 重い箱を赤い皿へ → 上がった青い皿からでんちを取ってソケットへ → リフトで塔のゴール。
// そのあと fresh() で：ほかの道（先に重い箱・プレス機の下・ベルトに乗せたでんち・大砲・皿に乗って上がる）、仲間がいるときの答え、わざと悪い順番、できてはいけないこと
export default (b, { assert, fresh }) => {
  const X = 0, Z = 1, A = 2, PB = 3, LIFT = 4, SAW = 7;                              // 動く床の番号（5・6 はプレス機）
  const CELL = 0, BLOCK = 1, KNOB = 2, CART = 3;                                     // 箱の番号
  const near = (a, v, e = 0.05) => Math.abs(a - v) < e;
  const idle = (q, s) => { for (let i = 0; i < s * q.FPS; i++) q.tick(); };
  const move = (q, i, x, y, z) => { Object.assign(q.w.crates[i], { x, y, z, vy: 0, moved: true }); q.w.fit(q.w.crates[i]); };   // 検査のために、箱をその場所へ置く
  const onL = q => q.p.grounded && q.p.x > 12 && q.p.x < 20 && q.p.z > -7 && q.p.z < 3 && near(q.p.y, 0);

  // のこぎりの線（z 3）を x 31 で渡る：のこぎりが東へ遠ざかりはじめてから
  const passSaw = (q, z) => { q.wait('のこぎりが東へ遠ざかる', () => q.w.movers[SAW].f > 0.5 && q.w.movers[SAW].rise); q.go([31, z]); };
  // プレス機の 1 周（5.2 秒）のうち、ph ミリ秒めまで待つ
  const phase = (q, ph) => q.wait(`プレス機の ${ph} ミリ秒め`, () => { const t = Math.round(q.now) % 5200; return t >= ph && t < ph + 100; }, 6);
  // 台車を棚の前まで押し、上に登り、跳んでつかんで棚の上へ
  const shelf = q => {
    const car = q.w.crates[CART];
    if (car.x < 37.2) { q.go([31.5, 9.5]); q.push(CART, [car.x - 1.2, 12], 1, 0); }
    assert.ok(car.x > 37.2, `台車が棚の前まで行かない (x=${car.x})`);
    q.go([car.x - 1.5, 12]); q.go([car.x, 12]); assert.ok(near(q.p.y, 1.4), `台車に登れない ${q.where()}`);
    q.hoist([car.x, 12], [39, 12]); assert.ok(near(q.p.y, 3.4), `棚に登れない ${q.where()}`);
  };
  // 中の岸で、レバーのつまみを dx の向きの端まで押す
  const flip = (q, dx) => { const k = q.w.crates[KNOB]; q.push(KNOB, [k.x - dx * 0.85, 0.5], dx, 0); };
  // 波止場から、柱のあみを登り、木の橋でデッキへ
  // デッキの東の石垣（x 6.6〜7.0）を、from から跳んで越えて to へ（でんちを持っていても跳べる）
  const hop = (q, from, to) => { q.go(from); q.face(...to); q.p.jump(); q.go(to); };
  const toDeck = q => { q.climb([19, 18.6], [19, 20]); q.go([12, 20]); q.go([4, 20]); };
  // デッキで、でんちをソケットへ入れ、リフトで塔へ
  const finish = q => {
    const k0 = q.w.plates[0], lift = q.w.movers[LIFT];
    q.put(k0.x, k0.z); q.wait('ソケットが押される', () => k0.down, 3);
    q.go([-4.5, 20.5]); q.wait('リフトが下りてくる', () => lift.f < 0.1 && lift.fall); q.go([-4.5, 22.2]); q.go([-3.6, 22.5]);
    assert.ok(q.p.on === lift.box, `リフトに乗れていない ${q.where()}`);
    q.wait('リフトが塔の高さに着く', () => lift.f > 0.97, 10); q.go([0, 24]);
    assert.ok(q.p.goal && q.falls === 0, `ゴールに着いていない ${q.where()} 落ちた回数 ${q.falls}`);
  };
  // from から to へ歩き、縁で跳んでも、向こうの足場（beyond）に立てずに落ちる
  const cannotCross = (q, from, to, beyond, what) => {
    q.go(from); const f0 = q.falls; let got = false;
    q.go(to, () => { got ||= q.p.grounded && beyond(); return got || q.falls > f0; }, 10);
    assert.ok(!got && q.falls === f0 + 1, `${what}を、橋なしで渡れてしまう ${q.where()}`);
  };

  const { w, p } = b, m = w.movers, c = w.crates, k = w.plates;
  // 中の岸へ歩く。レバーは西なので、橋 X が上がっている
  b.go([9, 0]); b.go([18, -1]);
  b.wait('橋 X が上がる', () => m[X].f === 1 && m[Z].f === 0, 4);
  // 橋 X を渡って島へ。のこぎりの床を北へ
  b.go([29, 0]); b.go([31, 0.5]); passSaw(b, 6);
  // 台車を押して踏み台に、棚のでんちを取って、北の床へ下りる
  shelf(b); b.grab(CELL); b.go([39.5, 9]); b.go([33, 9]);
  // でんちを持って、のこぎりの床を南へ。橋 X で中の岸へ
  b.go([31, 5.5]); passSaw(b, -0.5); b.go([21, 0]); b.go([15, -2]);
  // でんちを置いて、レバーを東へ：橋 Z が上がり、橋 X が沈む
  b.put(13.5, -3); flip(b, 1);
  b.wait('橋が入れかわる', () => m[Z].f === 1 && m[X].f === 0, 6);
  // でんちを持って橋 Z で波止場へ。青い皿に乗せる
  b.grab(CELL); b.go([16, 2.5]); b.go([16, 14]); b.go([10.5, 15.5]); b.put(7.85, 15.5);
  b.wait('でんちが青い皿にのる', () => c[CELL].on === m[A].box, 3);
  b.go([12, 17]); idle(b, 1); assert.equal(m[A].f, 0, '赤い皿が空なのに、青い皿が上がった');
  // 柱のあみを登り、木の橋でデッキへ
  toDeck(b);
  // 重い箱を東へ押して、赤い皿の止めまで
  b.go([-2.5, 12]); b.push(BLOCK, [-1.2, 9.5], 1, 0);
  b.wait('赤い皿が沈み、青い皿がでんちを乗せて上がる', () => m[A].f === 1, 10);
  assert.ok(near(c[CELL].y, 5) && near(c[BLOCK].y, 0.05), `でんちがデッキの高さにない (y=${c[CELL].y})`);
  // 上がった青い皿に乗って、でんちを取る（2 対 2 で上がったまま）
  hop(b, [6.1, 16.6], [7.45, 16.6]); b.grab(CELL, [c[CELL].x - 0.6, c[CELL].z + 0.8]); b.tick();
  assert.ok(p.on === m[A].box && m[A].f === 1, `青い皿の上で、でんちを取れていない／皿が下がった ${b.where()}`);
  // ソケットへ入れて、リフトで塔のゴールへ（空になった青い皿は下り、重い箱はデッキの高さへ戻る）
  hop(b, [7.45, p.z], [6, p.z]); b.go([4, 14]); b.wait('青い皿が下り、重い箱がデッキの高さへ戻る', () => m[A].f === 0 && near(c[BLOCK].y, 5), 10);
  finish(b);

  // ── ほかの道：先にあみでデッキへ上がって重い箱を赤い皿へ／島へはプレス機の下を北へ／でんちはベルトに乗せて南へ／大砲で中の岸へ／でんちを持って青い皿に乗って上がる
  let q = fresh();
  // 広場のあみを登って、重い箱を赤い皿へ。青い皿が空なので、何も動かない
  q.climb([-4.5, 6.4], [-4.5, 8]); q.go([-2.5, 12]); q.push(BLOCK, [-1.2, 9.5], 1, 0);
  idle(q, 2); assert.ok(q.w.crates[BLOCK].on === q.w.movers[PB].box && q.w.movers[A].f === 0, '青い皿が空なのに、てんびんが動いた');
  // デッキから広場へ飛び下り、中の岸・橋 X で島へ
  q.go([2, 8]); q.go([2, 3]); q.go([9, 0]); q.go([18, -1]); q.go([29, 0]);
  // ベルトの南の端から、プレス機の下を北へ（上がっている間にくぐる）
  q.go([39, -2.6]); phase(q, 1000); q.go([39, 9.2]);
  // 棚のでんちを取り、ベルトの北の端に置いて、ひとりで南へ運ばせる
  shelf(q); q.grab(CELL); q.go([39.5, 9]); q.put(39, 7.3);
  q.wait('でんちがベルトにのる', () => q.w.crates[CELL].on?.belt, 2);
  // 自分はのこぎりの床を南へ。ベルトの南の端で、でんちを待って取る
  q.go([31, 5.5]); passSaw(q, -0.5); q.go([39.5, -3.6]);
  q.wait('でんちがプレス機の下をぬけて南の端に着く', () => q.w.crates[CELL].z < -1.8 && !q.w.crates[CELL].on?.belt, 20);
  q.grab(CELL);
  // でんちを持ったまま大砲に乗って、中の岸へ
  q.go([33, -5], () => !q.p.grounded && q.p.vy > 3); q.wait('着地', () => q.p.grounded, 6);
  assert.ok(onL(q) && q.p.carry === q.w.crates[CELL], `大砲で、でんちを持って中の岸に着いていない ${q.where()}`);
  // レバーを東へ。橋 Z で波止場へ
  q.put(13.5, -3); flip(q, 1); q.wait('橋が入れかわる', () => q.w.movers[Z].f === 1, 6);
  q.grab(CELL); q.go([16, 2.5]); q.go([16, 14]);
  // でんちを持って青い皿に乗る：持った人 2 対 重い箱 2 で、いっしょに上がる。デッキへ降りる
  q.go([10.5, 15.5]); q.go([7.85, 15.5]); q.wait('青い皿が、でんちを持った人を乗せて上がる', () => q.w.movers[A].f === 1, 10);
  hop(q, [7.45, 15.5], [5, 15.5]); finish(q);

  // ── 仲間がいるときの答え（いることにした仲間の体）
  // 2 人が赤い皿に乗れば、重い箱のかわりになる
  q = fresh(); move(q, CELL, 7.85, 0.05, 15.5); q.place(12, 0, 15.5, 3);
  q.friend = [7.85, 5, 9.5, 2]; q.wait('2 人が赤い皿に乗ると、青い皿がでんちを乗せて上がる', () => q.w.movers[A].f === 1, 10);
  toDeck(q); hop(q, [6.1, 16.6], [7.45, 16.6]); q.grab(CELL, [q.w.crates[CELL].x - 0.6, q.w.crates[CELL].z + 0.8]); hop(q, [7.45, q.p.z], [6, q.p.z]); q.go([4, 14]);
  q.friend = null; finish(q);
  // 2 人が赤い皿に乗っている間に、でんちを持って青い皿に乗れば、いっしょに上がる
  q = fresh(); move(q, CELL, 11, 0, 17); q.place(12, 0, 15.5, 3); q.grab(CELL);
  q.friend = [7.85, 5, 9.5, 2]; idle(q, 1); assert.equal(q.w.movers[A].f, 0, '青い皿が空なのに上がった');
  q.go([10.5, 15.5]); q.go([7.85, 15.5]); q.wait('でんちを持った人が上がる', () => q.w.movers[A].f === 1, 10);
  hop(q, [7.45, 15.5], [5, 15.5]); q.friend = null; finish(q);
  // 仲間がレバーを動かしてくれれば、中の岸で待つだけで橋が入れかわる
  q = fresh(); move(q, CELL, 15, 0, -4); q.place(14, 0, -3, 1); q.grab(CELL);
  move(q, KNOB, 16.8, 0, 0.5); q.wait('橋 Z が上がる', () => q.w.movers[Z].f === 1, 6);
  q.go([16, 2.5]); q.go([16, 14]); assert.ok(q.p.carry === q.w.crates[CELL] && q.falls === 0, `でんちを持って波止場に着けない ${q.where()}`);

  // ── わざと悪い順番：先にレバーを東へ → 手ぶらで波止場・デッキへ → 重い箱をデッキから落とす（元の場所へ戻る）→ 赤い皿へ → 木の橋から波止場へ飛び下りる
  // → レバーを西へ戻して島へ → 台車を押したあと、また奥へ引きもどす → でんちを島の外へ落とす（棚へ戻る）→ 取りなおす → 青い皿へ（すぐ上がる）→ デッキからでんちを取る
  q = fresh();
  q.go([9, 0]); q.go([14, 0.5]); flip(q, 1); q.wait('橋 Z が上がる', () => q.w.movers[Z].f === 1, 6);
  q.go([16, 2.5]); q.go([16, 14]); toDeck(q);
  q.go([2, 9.5]); q.grab(BLOCK, [1.2, 9.5]);                                       // 重い箱を西へ押して、デッキの縁から落とす
  for (let i = 0; i < 20 * q.FPS && q.w.crates[BLOCK].y > 4.9; i++) q.tick(-1, 0);
  q.p.grabEnd(); idle(q, 3);
  assert.ok(near(q.w.crates[BLOCK].x, 0) && near(q.w.crates[BLOCK].y, 5) && q.falls === 0, `落とした重い箱が、元の場所へ戻らない ${q.where()}`);
  q.go([-2.5, 12]); q.push(BLOCK, [-1.2, 9.5], 1, 0);
  q.go([4, 20]); q.go([12, 20]); q.go([12, 17]); assert.ok(near(q.p.y, 0), `木の橋から波止場へ下りていない ${q.where()}`);
  q.go([16, 14]); q.go([16, 2.5]); flip(q, -1); q.wait('橋 X が上がる', () => q.w.movers[X].f === 1, 6);
  q.go([21, 0]); q.go([29, 0]); q.go([31, 0.5]); passSaw(q, 6);
  q.go([31.5, 9.5]); q.push(CART, [31.8, 12], 1, 0); q.push(CART, [q.w.crates[CART].x - 1.2, 12], -1, 0);   // 押したあと、引きもどしてしまう
  assert.ok(q.w.crates[CART].x < 32.1, `台車がレールの西の端まで戻らない (x=${q.w.crates[CART].x})`);
  shelf(q); q.grab(CELL); q.go([41.7, 12]); q.face(43, 12); q.p.grabEnd();          // でんちを棚の東の外へ落とす
  q.wait('落としたでんちが棚へ戻る', () => near(q.w.crates[CELL].x, 40) && near(q.w.crates[CELL].y, 3.4), 6);
  q.grab(CELL); q.go([39.5, 9]); q.go([33, 9]); q.go([31, 5.5]); passSaw(q, -0.5); q.go([21, 0]); q.go([15, -2]);
  q.put(13.5, -3); flip(q, 1); q.wait('橋 Z が上がる', () => q.w.movers[Z].f === 1, 6);
  q.grab(CELL); q.go([16, 2.5]); q.go([16, 14]); q.go([10.5, 15.5]); q.put(7.85, 15.5);
  q.wait('重い箱がもう赤い皿にあるので、青い皿がすぐ上がる', () => q.w.movers[A].f === 1, 10);
  toDeck(q); q.go([5.5, 14]); q.grab(CELL, [6.95, q.w.crates[CELL].z]);   // デッキの石垣の上に立ったまま、皿のでんちを取る
  q.go([4, 14]); q.wait('青い皿が下りる', () => q.w.movers[A].f === 0, 10);
  finish(q);

  // ── できてはいけないこと
  // 橋 X が沈んでいる間（レバーが東）は、中の岸から島へ渡れない
  q = fresh(); q.go([9, 0]); q.go([14, 0.5]); flip(q, 1); q.wait('橋 X が沈む', () => q.w.movers[X].f === 0, 6);
  cannotCross(q, [19.4, 0], [31, 0], () => q.p.x > 29, '中の岸と島のすき間');
  // 橋 Z が沈んでいる間（レバーが西）は、中の岸から波止場へ渡れない
  q = fresh(); q.go([9, 0]); cannotCross(q, [16, 2.4], [16, 15], () => q.p.z > 12, '中の岸と波止場のすき間');
  // でんちがソケットにない間は、リフトが動かず、塔に上がれない（リフトに乗っても、塔の壁の前でも）
  q = fresh(); q.place(-4, 5, 11, 4); q.go([-4.5, 22.5]); idle(q, 5);
  assert.ok(q.w.movers[LIFT].f === 0 && !q.w.plates[0].down, 'でんちがないのに、リフトが動いた');
  assert.throws(() => q.go([0, 24], null, 5)); assert.ok(!q.p.goal);
  // 重い箱を塔の壁につけ、その上にでんちを積んで跳んでつかんでも、塔には届かない
  move(q, BLOCK, 0, 5, 20.2); move(q, CELL, 0, 6.4, 20.2); q.place(0, 7.2, 20.2); idle(q, 0.5);
  assert.ok(near(q.p.y, 7.2), `検査の前提：積んだでんちの上に立っていない ${q.where()}`);
  q.face(0, 24); q.p.jump(); q.p.grabStart(); let top = 0;
  for (let i = 0; i < 3 * q.FPS; i++) { q.tick(0, 1); top = Math.max(top, q.p.y); }
  assert.ok(top < 9 && !q.p.goal, `積んだ箱から、塔に手が届いてしまう (いちばん上 ${top.toFixed(2)})`);
  // 2 人でも：リフトの上の重い箱に仲間（の体）が立ち、その頭から跳んでつかんでも、塔には届かない
  move(q, BLOCK, -3.75, 5.2, 22.5); q.w.extra = [{ x0: -4, x1: -3.5, z0: 22.25, z1: 22.75, y0: 6.6, y1: 7.9, friend: true }];
  q.place(-3.75, 7.9, 22.5); idle(q, 0.5); assert.ok(near(q.p.y, 7.9), `検査の前提：仲間の頭の上に立っていない ${q.where()}`);
  q.face(0, 22.5); q.p.jump(); q.p.grabStart(); top = 0;
  for (let i = 0; i < 3 * q.FPS; i++) { q.tick(1, 0); top = Math.max(top, q.p.y); }
  assert.ok(top < 12 && !q.p.goal, `仲間の頭から、塔に手が届いてしまう (いちばん上 ${top.toFixed(2)})`);
  // 重い箱は、デッキの縁の石垣で止まり、広場や下の青い皿へは落ちない（落ちると、壁にめり込んで二度と動かせない）
  q = fresh(); q.place(-4, 5, 11, 4); move(q, BLOCK, 0, 5, 9); q.push(BLOCK, [0, 10.3], 0, -1);
  assert.ok(near(q.w.crates[BLOCK].y, 5) && q.w.crates[BLOCK].z > 8, `重い箱が、デッキから広場へ落ちた ${JSON.stringify([q.w.crates[BLOCK].x, q.w.crates[BLOCK].y, q.w.crates[BLOCK].z])}`);
  move(q, BLOCK, 4, 5, 15.5); q.push(BLOCK, [2.8, 15.5], 1, 0);
  assert.ok(near(q.w.crates[BLOCK].y, 5) && q.w.crates[BLOCK].x < 6, `重い箱が、デッキから青い皿へ落ちた ${JSON.stringify([q.w.crates[BLOCK].x, q.w.crates[BLOCK].y])}`);
};

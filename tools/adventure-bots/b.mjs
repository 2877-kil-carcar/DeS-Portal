// つないだステージ B「かざぐるま雲の谷」のつなぎ（風の灯台）を 1 人で解く手順。前半（s3.mjs）が柱の上のリフトで終わったところから始める：
// 見はり台へ跳ぶ → 大砲で灯台の庭へ → 扇風機を高台の北のかべぎわへ → 荷物を持って風で高台へ → 荷物を青い皿へ → 赤い皿を踏む（荷物が灯台のてっぺんへ飛び、橋があがる）→ 橋を渡って、雲の谷の広場へ。
// 番号はつなぎの中だけで数え、座標はステージ全体のもの（tools/test-adventure.mjs の view がそろえる）。fresh() は、つなぎの入口（見はり台のセーブ地点）から始める。
// そのあと fresh() で：まちがえても戻せる・仲間との答え・できてはいけないこと
export default (b, { assert, fresh }) => {
  const BLUE = 0, RED = 1, BRIDGE = 2;                                                // 動く床の番号
  const FAN = 0, LOAD = 1;                                                            // 箱の番号：扇風機・荷物
  const TOP = 0;                                                                      // 信号の番号：灯台のてっぺん
  const DECK = 0, HILL = 3, LIGHT = 4;                                                // 箱の番号：見はり台・高台・灯台
  const near = (a, v, e = 0.05) => Math.abs(a - v) < e;
  const idle = (q, s, mx = 0, mz = 0) => { for (let i = 0; i < s * q.FPS; i++) q.tick(mx, mz); };
  const move = (q, i, x, y, z) => { Object.assign(q.w.crates[i], { x, y, z, vy: 0, moved: true }); q.w.fit(q.w.crates[i]); };   // 検査のために、箱をその場所へ置く
  const on = (q, i) => q.w.groundBox(q.p.x, q.p.z, q.p.y) === q.w.stage.boxes[i];

  // 柱の上のリフトから、見はり台へ跳ぶ（入口のセーブ地点にふれる）
  const deck = q => {
    if (!on(q, DECK)) {                                                               // 助走して、リフトの南の縁で跳ぶ（下に広場があるので、自動では跳ばない）。fresh() は、はじめから見はり台にいる
      q.go([0, 1.2]); q.face(0, -4.5); while (q.p.z > -1.3) q.tick(0, -1);
      q.p.jump(); q.tick(0, -1); while (!q.p.grounded) q.tick(0, -1);
    }
    q.go([0, -4.5]);
    if (q.p.carry) { q.face(-1, -4.5); q.p.grabEnd(); }                             // 前半から持ってきた箱は、見はり台に置いていく
    assert.ok(on(q, DECK) && q.p.cp === 0, `見はり台に乗れない／入口のセーブ地点にふれない ${q.where()}`); };
  // 見はり台の大砲で、南の灯台の庭へ
  const fly = q => {
    q.go([0, -5.5]); q.go([0, -7.5], () => !q.p.grounded && q.p.vy > 3); q.wait('庭に着地', () => q.p.grounded, 8);
    assert.ok(near(q.p.y, 0) && Math.abs(q.p.x - 1) < 3 && Math.abs(q.p.z + 28) < 3 && q.p.cp === 1 && q.falls === 0, `大砲で、庭のセーブ地点に着いていない ${q.where()}`);
  };
  // 扇風機を高台の北のかべぎわに置き、荷物を持って風に乗り、高台へ
  const hill = q => {
    q.grab(FAN); q.put(18, -37.1); q.wait('扇風機の風が出る', () => q.w.winds.some(k => k.fan === q.w.crates[FAN] && k.active), 3);
    q.grab(LOAD); q.go([18, -35.9]); q.face(18, -37.1); q.p.jump(); q.go([18, -37.1], () => q.p.y > 4.6); q.go([18, -39.3]);
    assert.ok(near(q.p.y, 4) && q.p.carry === q.w.crates[LOAD], `荷物を持って、風で高台に乗れない ${q.where()}`);
  };
  // 荷物を青い皿へ。赤い皿を踏むと、荷物が灯台のてっぺんへ飛び、橋があがる
  const shoot = q => {
    q.go([18, -40]); q.put(16, -40); q.wait('荷物が青い皿にのる', () => q.w.crates[LOAD].on === q.w.movers[BLUE].box, 3);
    q.go([20, -40]); q.wait('荷物が灯台にのり、橋があがる', () => q.w.crates[LOAD].on === q.w.stage.boxes[LIGHT] && q.w.plates[TOP].down && q.w.movers[BRIDGE].f === 1, 8);
  };
  // 高台から下りて、橋を渡り、雲の谷の井戸の西のかべから、ふちを回って広場（後半のはじめのセーブ地点）へ
  const cross = q => {
    q.go([23, -38]); q.go([27, -30]); q.go([42.5, -30]);
    q.go([45, -21]); q.go([63, -21]); q.go([63, -30]); q.go([67.5, -30]); q.go([78, -35]);
    assert.ok(near(q.p.y, 0) && q.falls === 0, `橋を渡って、雲の谷の広場に着いていない ${q.where()}`);
  };
  // 4 人で投げる（ページの投げ方：持ち上げて 0.9m 上・0.75m 前、vy 6.5・横 4）。てっぺん top の足から、(ux, uz) の向きへ。届いたら true
  const thrown = (q, x, top, z, ux, uz, reached) => {
    q.place(x + ux * 0.75, top + 0.9, z + uz * 0.75); q.face(x + ux * 9, z + uz * 9); Object.assign(q.p, { vy: 6.5, kvx: 4 * ux, kvz: 4 * uz, grounded: false }); q.p.grabStart();
    for (let i = 0; i < 8 * q.FPS; i++) { q.tick(ux, uz); if ((q.p.grounded || q.p.hang) && reached()) return true; if (q.falls) return false; }
    return false;
  };

  // ── 1 人の基本の道 ──
  deck(b); fly(b); idle(b, 1);
  assert.ok(b.w.movers[BRIDGE].f === 0 && !b.w.plates[TOP].down, 'はじめから橋があがっているか、灯台が押されている');
  hill(b); shoot(b); cross(b);

  { // ── まちがえても戻せる：扇風機や荷物を谷へ落とすと、元の場所へ戻る。荷物なしで赤い皿を踏んでも何も飛ばず、下りればシーソーが戻る ──
    const q = fresh(); fly(q);
    q.grab(LOAD); q.go([-3.5, -42]); q.face(-6, -42); q.p.grabEnd();                 // 庭の西の縁から谷へ
    q.wait('落とした荷物が、元の場所へ戻る', () => near(q.w.crates[LOAD].x, 8) && near(q.w.crates[LOAD].z, -34) && q.w.crates[LOAD].on, 6);
    q.grab(FAN); q.go([-3.5, -42]); q.face(-6, -42); q.p.grabEnd();
    q.wait('落とした扇風機が、元の場所へ戻る', () => near(q.w.crates[FAN].x, 4) && near(q.w.crates[FAN].z, -38) && q.w.crates[FAN].on, 6);
    hill(q); q.go([18, -40.5]); q.face(18, -41.5); q.p.grabEnd();                   // 荷物を高台に置いたまま、赤い皿を踏む
    q.go([20, -40]); idle(q, 1); assert.ok(q.w.movers[RED].f === 1 && q.w.movers[BLUE].f === 1 && !q.w.plates[TOP].down, '空の青い皿で、何かが飛んだ');
    q.go([18, -39.5]); q.wait('赤い皿から下りると、シーソーが戻る', () => q.w.movers[RED].f === 0 && q.w.movers[BLUE].f === 0, 3);
    q.grab(LOAD); shoot(q); cross(q);
  }
  { // ── 青い皿（1.4m 四方）のはしに置いても、荷物は灯台のてっぺん（ふみ板と同じ 1.6m 四方）にのる。皿より外は、皿にのっていない（飛ばない） ──
    for (const [dx, dz] of [[0.84, 0], [-0.84, 0], [0, 0.84], [0, -0.84], [0.84, 0.84], [-0.84, 0.84]]) {
      const q = fresh(); move(q, LOAD, 16 + dx, 4, -40 + dz); idle(q, 0.2); q.place(20, 5.1, -40); idle(q, 4);
      const c = q.w.crates[LOAD];
      assert.ok(c.on === q.w.stage.boxes[LIGHT] && q.w.plates[TOP].down, `皿のはし (${dx}, ${dz}) の荷物が、灯台にのらない (${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)})`);
    }
  }
  { // ── 仲間と：仲間が赤い皿に乗れば、自分は高台に上がらなくてよいが、荷物は青い皿にのせる（シーソーは使う）。仲間も扇風機で上がる ──
    const q = fresh(); fly(q); hill(q); q.go([18, -40]); q.put(16, -40); q.go([18.5, -41]);
    q.friend = [20, 5.1, -40, 1]; q.wait('荷物が灯台にのり、橋があがる', () => q.w.plates[TOP].down && q.w.movers[BRIDGE].f === 1, 8); q.friend = null;
    cross(q);
  }

  { // ── できてはいけないこと ──
    // 灯台のてっぺんに何もなければ、橋はあがらない。14m は、跳んでも渡れない
    let q = fresh(); fly(q); q.go([27, -30]); idle(q, 1);
    assert.equal(q.w.movers[BRIDGE].f, 0, '灯台に何もないのに、橋があがった');
    assert.throws(() => q.go([42.5, -30], null, 8), /着けない/, '橋なしで、雲の谷へ渡れた');
    // 青い皿に乗った人は、赤い皿に仲間が跳び乗っても、灯台に届かない（人は箱より手前に落ちる。「つかむ」を押して前へ倒しつづけても）
    q = fresh(); q.place(16, 4.05, -40, 1); idle(q, 0.2); q.friend = [20, 5.1, -40, 1];
    let top = 0; for (let i = 0; i < 6 * q.FPS; i++) { if (!q.p.grab) q.p.grabStart(); q.tick(0, 1); if (q.p.grounded && q.p.y > 14) top = q.p.y; if (i > q.FPS && q.p.grounded) break; }
    assert.ok(top === 0 && !q.w.plates[TOP].down, `シーソーで飛ばされた人が、灯台にのった ${q.where()}`);
    q.friend = null;
    // 4 人でも：高台（4）に軽い箱 2 つと仲間 2 人を積み、てっぺんから灯台へ投げても、届かない（15）
    for (const [x, z] of [[16, -38.3], [15, -38.3], [17, -38.3]]) {
      q = fresh();
      assert.ok(!thrown(q, x, 4 + 1.6 + 2.6, z, 0, 1, () => q.p.y > 13), `高台から投げられた仲間が、灯台にのった (x ${x}) ${q.where()}`);
    }
    // 4 人でも：庭の東の縁に軽い箱 2 つと仲間 2 人を積み、雲の谷へ投げても、届かない（14m）
    for (const z of [-30, -24, -40]) {
      q = fresh();
      assert.ok(!thrown(q, 27.6, 1.6 + 2.6, z, 1, 0, () => q.p.x > 41 && q.p.y > -2), `庭から投げられた仲間が、雲の谷へ渡れた (z ${z}) ${q.where()}`);
    }
    // 4 人でも：市場から灯台の庭へは届かない（広場の南の縁 14m・東の屋根の南の縁 16m・西の塔の南東のかど。重い箱 1.4・軽い箱・仲間 2 人を積んで投げる）
    for (const [x, y, z, ux, uz] of [[0, 0, -7.6, 0, -1], [6, 0, -7.6, 0, -1], [12, 3.5, -5.6, 0, -1], [-8.4, 8.2, -5.6, 0.45, -0.89]]) {
      q = fresh();
      assert.ok(!thrown(q, x, y + 1.4 + 0.8 + 2.6, z, ux, uz, () => q.p.z < -21.5 && q.p.y > -1), `市場から投げられた仲間が、灯台の庭に届いた (${x}, ${y}, ${z}) ${q.where()}`);
    }
    // 4 人でも：東の屋根 A（3.5）の西の縁に軽い箱と扇風機 4 つ・仲間 2 人を積み、見はり台・大砲・リフトの方へ西へ投げても、風よけで届かない
    for (const z of [-4.75, -7.5, -1, -9.5]) {
      q = fresh();
      assert.ok(!thrown(q, 8.3, 3.5 + 3.2 + 2.6, z, -1, 0, () => q.p.y > 10), `屋根 A から投げられた仲間が、見はり台の高さに届いた (z ${z}) ${q.where()}`);
    }
    // 見はり台（11）へは、前半のゴールのリフトなしでは上がれない：西の塔のベランダ（7.7）から跳んでつかんでも、届かない
    q = fresh(); q.place(-3.4, 7.7, -1.2, 0); q.face(-1, -3.5); q.p.grabStart(); q.p.jump(); idle(q, 3, 0.6, -0.8); q.p.grabEnd();
    assert.ok(q.p.y < 10 && q.p.cp === 0 && !on(q, DECK), `ベランダから、見はり台に届いた ${q.where()}`);
    // 灯台の真上から見はり台の大砲へ戻る道はない（一方通行）。庭から落ちても、庭のセーブ地点からやり直す
    q = fresh(); fly(q); q.go([10, -21.5], () => q.falls === 1); q.wait('庭のセーブ地点からやり直す', () => q.p.grounded, 8);
    assert.ok(q.p.cp === 1 && near(q.p.y, 0) && Math.abs(q.p.z + 28) < 1.5, `庭から落ちて、庭のセーブ地点に戻らない ${q.where()}`);
  }
};

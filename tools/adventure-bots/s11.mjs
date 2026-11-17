// ステージ 11「みなとの工事場」を 1 人で解く手順：西のクレーンで沖の台のでんちを運ぶ → 東の鉄球を引いて放し、解体小屋の板を割ってでんちを取る
// → 南の水門のハンドルを回して飛び石を浮かべ、島のでんちを取る（島のハンドルで、もう一度上げて戻る）→ 3 つをソケットへ → 橋をわたって桟橋のゴールへ。
// そのあと fresh() で：やり直せること（弱い引き・落としたでんち・引いた水）・できてはいけないこと（4 人で積んで投げる・フックに乗る・水が低いときの飛び石）
export default (b, { assert, fresh }) => {
  const BRIDGE = 0, POOL = 1;                                                         // 動く床の番号
  const LX = 0, LZ = 1, LY = 2, CRANE_CELL = 3, BALL = 4, SHED_CELL = 5, ISLE_CELL = 6, STONE = 7;   // 箱の番号
  const near = (a, v, e = 0.05) => Math.abs(a - v) < e;
  const idle = (q, s) => { for (let i = 0; i < s * q.FPS; i++) q.tick(); };
  const move = (q, i, x, y, z) => { Object.assign(q.w.crates[i], { x, y, z, vy: 0, moved: true }); q.w.fit(q.w.crates[i]); };   // 検査のために、箱をその場所へ置く
  const board = q => q.w.stage.boxes.findIndex(k => k.planks);
  const broken = q => q.w.broken.has(board(q));
  const hook = q => q.w.cranes[0];
  // レバー i を、端まで押す（dir 1 で東＝max、-1 で西＝min）。レバーの列の西（x -10.9）か東（x -7.5）の通路を通って回りこむ
  const lever = (q, i, dir) => {
    const z = q.w.crates[i].z, lane = dir > 0 ? -10.9 : -7.5;
    q.go([lane, q.p.z]); q.go([lane, z]); q.push(i, [lane, z], dir, 0);
    const c = q.w.crates[i], r = { min: c.home.x, max: c.home.x + 1.6 };   // レバーは min の端に置いてある（view は rail をずらさないので、home から求める）
    assert.ok(near(c.x, dir > 0 ? r.max : r.min, 0.1), `レバー ${i} が端まで行かない (x=${c.x.toFixed(2)})`);
  };

  // 西：クレーンで沖の台のでんちを広場へ運び、ソケット 0 へ
  const craneRun = q => {
    const k = hook(q), c = q.w.crates[CRANE_CELL];
    q.go([-6, -3]);
    lever(q, LX, 1); lever(q, LZ, 1);                                                 // フックを、沖の台のでんちの真上へ
    lever(q, LY, 1); q.wait('フックが下りて開く', () => k.open && near(k.x, -29) && near(k.z, 2), 12);
    lever(q, LY, -1); assert.ok(c.hook != null, 'フックを閉じても、でんちを吊らない');
    q.wait('でんちが上がる', () => near(k.y, 4), 3);
    lever(q, LX, -1); q.wait('フックが広場の上へ戻る', () => near(k.x, -7), 10);
    lever(q, LY, 1); q.wait('フックが開いて、でんちを放す', () => c.hook == null && c.on && near(c.y, 0), 5);
    assert.ok(near(c.x, -7) && near(c.z, 2), `でんちが、フックの真下に落ちない (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`);
    q.go([-6, 0]); q.carry(CRANE_CELL, 0);
  };
  // 東：鉄球を西へ引ききって放すと、ふれて解体小屋の板を割る。鉄球の横を通って小屋に入り、でんちをソケット 1 へ
  const shed = q => {
    q.go([10, 3]); q.go([11.9, 0]);
    assert.ok(!broken(q), 'はじめから板が割れている');
    q.push(BALL, [11.9, 0], -1, 0);
    assert.ok(near(q.w.crates[BALL].x, 11.1, 0.1), `鉄球を引ききれない (x=${q.w.crates[BALL].x.toFixed(2)})`);
    q.wait('ふれた鉄球が板を割る', () => broken(q), 4);
    q.go([11, 1.1]); q.go([15, 1.1]); q.go([17, 0.5]);                                 // 戸口の北の端を通る（鉄球は戸口のまん中をふれている）
    q.grab(SHED_CELL); q.go([15, 1.1]); q.go([11, 1.1]); q.put(0, 7);
    q.wait('ソケット 1 にでんちが入る', () => q.w.plates[1].down, 3);
  };
  // 南：ハンドルを回して水を上げ、飛び石をわたって島へ。島のハンドルで、もう一度水を上げて戻り、でんちをソケット 2 へ
  const sluice = q => {
    const pool = q.w.movers[POOL];
    q.go([3, -7]); q.crank(0, () => pool.f === 1);
    assert.ok(near(q.w.crates[STONE].y + 1.4, 0, 0.02), `飛び石が岸の高さまで浮かばない (上面 ${(q.w.crates[STONE].y + 1.4).toFixed(2)})`);
    q.go([0, -9.6]); q.go([0, -25]);
    assert.ok(near(q.p.y, 0) && q.falls === 0, `飛び石をわたって、島に着けない ${q.where()}`);
    q.crank(1, () => pool.f === 1);                                                   // 島のハンドルを回すと、水が引くまでの時間が、また始めから
    q.grab(ISLE_CELL); q.go([0, -24.6]); q.go([0, -9.4]); q.put(4, 7);
    q.wait('ソケット 2 にでんちが入る', () => q.w.plates[2].down, 3);
  };
  // 橋があがったら、桟橋のゴールへ
  const finish = q => {
    q.wait('桟橋への橋があがる', () => q.w.movers[BRIDGE].f === 1, 4);
    q.go([0, 9]); q.go([0, 29]);
    assert.ok(q.p.goal && q.falls === 0, `ゴールに着いていない ${q.where()} 落ちた回数 ${q.falls}`);
  };

  { // ── 1 人の基本の道 ──
    const { w } = b;
    b.go([3, -5]); idle(b, 1);
    assert.ok(w.movers[BRIDGE].f === 0 && w.movers[POOL].f === 0, 'はじめから橋か水があがっている');
    craneRun(b);
    assert.equal(w.movers[BRIDGE].f, 0, 'でんち 1 つで、橋があがった');
    shed(b); sluice(b); finish(b);
  }

  { // ── 順番を変えても解ける（水門 → 小屋 → クレーン） ──
    const q = fresh(); q.go([3, -5]); sluice(q); shed(q); craneRun(q); finish(q);
  }

  // 検査のために、レバー i のつまみを f（0 が min の端、1 が max の端）へ寄せる（仲間が倒したことにする）
  const leverTo = (q, i, f) => { const c = q.w.crates[i]; c.x = c.home.x + f * 1.6; q.w.fit(c); };

  { // ── やり直せること ──
    // 鉄球：弱く引くと、はね返されて割れない。つかめば、ふれは止まる。そこから引ききって放せば割れる
    let q = fresh(); const ball = q.w.crates[BALL];
    q.go([10, 3]); q.grab(BALL, [11.9, 0]);
    while (ball.x > 12.1) q.tick(-1, 0);
    q.p.grabEnd(); idle(q, 4);
    assert.ok(!broken(q), `1m しか引かないのに、板が割れた (x=${ball.x.toFixed(2)})`);
    assert.ok(Math.abs(ball.x - 13.1) < 0.2, `弱いふれが、板に止められて小さくならない (x=${ball.x.toFixed(2)})`);
    q.grab(BALL, [12.25, 0]); idle(q, 0.2); const at = ball.x; idle(q, 0.5);
    assert.ok(!ball.v && near(ball.x, at, 0.1), 'つかんでいるのに、鉄球がふれる');
    while (ball.x > 11.15) q.tick(-1, 0);
    q.p.grabEnd(); q.wait('引ききって放すと、板が割れる', () => broken(q), 4);
    // クレーン：海の上でフックを開くと、でんちは落ちて、沖の台へ戻る
    q = fresh(); const k = hook(q), c = q.w.crates[CRANE_CELL];
    leverTo(q, LX, 1); leverTo(q, LZ, 1); leverTo(q, LY, 1); q.wait('フックが沖の台で開く', () => k.open && near(k.x, -29), 12);
    leverTo(q, LY, 0); q.tick(); assert.ok(c.hook != null, '閉じても吊らない');
    leverTo(q, LX, 0.5); q.wait('フックが海の上へ', () => near(k.x, -18) && near(k.y, 4), 6);
    leverTo(q, LY, 1); q.wait('海の上で開いたフックから落ちたでんちが、沖の台へ戻る', () => c.hook == null && near(c.x, -29) && near(c.y, 0) && near(c.z, 2), 6);
    // 水門：水は、放してから 20 秒たつと引きはじめ、飛び石も下りる。島に残っても、島のハンドルで上げて帰れる。飛び石に乗ったまま下りても、落ちない
    q = fresh(); const pool = q.w.movers[POOL], stone = q.w.crates[STONE + 2];
    q.go([3, -7]); q.crank(0, () => pool.f === 1); q.go([0, -9.6]); q.go([stone.x, stone.z]);
    q.wait('水が引きはじめる', () => pool.f < 1, 25); q.wait('水が引ききる', () => pool.f === 0, 10);
    assert.ok(near(q.p.y, stone.y + 1.4) && near(stone.y + 1.4, -8.3, 0.02) && q.falls === 0, `飛び石に乗ったまま、下りきれない ${q.where()}`);
    q.place(0, 0, -27, 3); q.crank(1, () => pool.f === 1); q.go([0, -24.6]); q.go([0, -9.4]);
    assert.ok(near(q.p.y, 0) && q.falls === 0, `島から、水を上げて帰れない ${q.where()}`);
    // 水が低いときに水路へ下りても、島のでんちは取れない。水に落ちると、セーブ地点からやり直し
    q = fresh(); q.go([0, -9.4]); q.go([0, -11.9], () => q.p.grounded && q.p.y < -8, 6);
    assert.ok(near(q.p.y, -8.3, 0.05), `水が低いのに、飛び石が下にない ${q.where()}`);
    q.go([1.3, -11.9], () => q.falls > 0, 4); q.wait('水に沈んで、やり直し', () => q.falls === 1, 3);
  }

  { // ── できてはいけないこと ──
    const throwFrom = (q, x, y, z, fx, fz, land, what) => {                         // (x, y, z) から (fx, fz) の向きへ投げられ（ページの投げ方：vy 6.5・横 4）、「つかむ」を押したまま
      q.place(x, y, z); q.face(x + fx, z + fz); Object.assign(q.p, { vy: 6.5, kvx: 4 * fx, kvz: 4 * fz, grounded: false }); q.p.grabStart();
      let ok = false, top = -99;
      for (let i = 0; i < 8 * q.FPS && !ok && q.falls === 0; i++) { q.tick(fx, fz); if (!q.falls) top = Math.max(top, q.p.y); ok = land() && (q.p.grounded || !!q.p.hang); }
      q.p.grabEnd(); assert.ok(!ok, `${what} ${q.where()}`);
      return top;
    };
    // でんちが 2 つでは、橋はあがらない。ソケットは、人が乗っても押されない。橋がなければ、桟橋へは渡れない
    let q = fresh();
    move(q, CRANE_CELL, -4, 0, 7); move(q, SHED_CELL, 0, 0, 7); idle(q, 2);
    assert.ok(q.w.plates[0].down && q.w.plates[1].down && q.w.movers[BRIDGE].f === 0, 'でんち 2 つで、橋があがった');
    q.place(4, 0, 6); q.friend = [4, 0, 7, 3]; idle(q, 2);
    assert.ok(!q.w.plates[2].down && q.w.movers[BRIDGE].f === 0, '人がソケットに乗って、橋があがった');
    q.friend = null; q.go([0, 9]); q.face(0, 30); for (let i = 0; i < q.FPS; i++) q.tick(0, 1);
    q.p.jump(); for (let i = 0; i < 3 * q.FPS; i++) q.tick(0, 1);
    assert.ok(q.falls === 1 && !q.p.goal, `橋なしで、桟橋へ渡れた ${q.where()}`);
    // 板張りは、鉄球を押しつけても、でんちや仲間がふれても割れない
    q = fresh(); q.go([10, 3]); q.push(BALL, [11.9, 0], 1, 0); idle(q, 2);
    move(q, CRANE_CELL, 13.4, 0, 1); q.friend = [13.3, 0, -1, 3]; idle(q, 2);
    assert.ok(!broken(q), '鉄球を押しつける・でんちや仲間がふれるだけで、板が割れた');
    q.friend = null;
    assert.throws(() => q.go([17, 0], null, 6), /着けない/, '板張りを通りぬけて、小屋に入れた');
    // 4 人でも：でんち 2 つと仲間 2 人を積んだてっぺん（4.2m）から投げても、沖の台・水門の島・桟橋（どれも 14m 先）には届かない
    const top = 1.6 + 2.6 + 0.9, isle = (x0, x1, z0, z1) => () => q.p.x > x0 && q.p.x < x1 && q.p.z > z0 && q.p.z < z1 && q.p.y > -1;
    for (const z of [-2.5, 0, 2.5]) { q = fresh(); throwFrom(q, -12.75, top, z, -1, 0, isle(-32.5, -25.5, -3.5, 3.5), `広場の西の縁から投げられて、沖の台に届いた (z ${z})`); }
    for (const x of [-3.5, 0, 3.5]) { q = fresh(); throwFrom(q, x, top, -10.75, 0, -1, isle(-4.5, 4.5, -34.5, -23.5), `広場の南の縁から投げられて、水門の島に届いた (x ${x})`); }
    for (const x of [-4.5, 0, 4.5]) { q = fresh(); throwFrom(q, x, top, 10.75, 0, 1, isle(-5.5, 5.5, 23.5, 32.5), `広場の北の縁から投げられて、桟橋に届いた (x ${x})`); }
    // 水が低いとき：いちばん南の飛び石（上面 -8.3）に仲間 2 人を積み、そのてっぺんから島へ投げても、島（8.3m 上）の縁に届かない
    q = fresh(); idle(q, 0.5); const last = q.w.crates[STONE + 4];
    assert.ok(near(last.y + 1.4, -8.3, 0.02), '検査の前提：水が低いのに、飛び石が下にない');
    let hi = throwFrom(q, 0, last.y + 1.4 + 2.6 + 0.9, last.z - 0.75, 0, -1, isle(-4.5, 4.5, -34.5, -23.5), '水が低いのに、飛び石の上の塔から投げられて、島に届いた');
    assert.ok(hi < -1, `水が低いのに、飛び石の上の塔から投げられて、島の縁の近くまで上がる (いちばん上 ${hi.toFixed(2)})`);
    // 4 人でも：小屋の壁ぎわに、でんち 2 つと仲間 3 人を積み、てっぺんから跳んでつかんでも、壁（14m）には届かない
    q = fresh(); move(q, CRANE_CELL, 13, 0, 3); move(q, SHED_CELL, 13, 0.8, 3); idle(q, 0.2);
    q.w.extra = [0, 1, 2].map(k => ({ x0: 12.75, x1: 13.25, z0: 2.75, z1: 3.25, y0: 1.6 + 1.3 * k, y1: 2.9 + 1.3 * k, friend: true }));
    q.place(13, 5.5, 3); idle(q, 0.2); assert.ok(near(q.p.y, 5.5), `検査の前提：積んだてっぺんに立っていない ${q.where()}`);
    q.face(14, 3); q.p.jump(); q.p.grabStart(); hi = 0;
    for (let i = 0; i < 3 * q.FPS; i++) { q.tick(1, 0); hi = Math.max(hi, q.p.y); }
    q.p.grabEnd(); assert.ok(hi < 11.5, `積み上げたてっぺんから、小屋の壁の上に届いてしまう (いちばん上 ${hi.toFixed(2)})`);
    // クレーンのフック（仲間が乗れる）が動ける所は、広場と沖の台の上だけ：小屋・水門の島・桟橋からは 14m 以上離れている（乗って行けるのは、行き止まりの沖の台だけ）
    q = fresh(); const s = q.w.stage, k = s.cranes[0], hx = [k.x[1], k.x[2]].sort((a, c) => a - c), hz = [k.z[1], k.z[2]].sort((a, c) => a - c);
    const far = bx => Math.hypot(Math.max(0, bx.x0 - (hx[1] + 0.4), hx[0] - 0.4 - bx.x1), Math.max(0, bx.z0 - (hz[1] + 0.4), hz[0] - 0.4 - bx.z1));
    for (const i of [2, 3, 4]) assert.ok(far(s.boxes[i]) >= 14, `クレーンのフックが、足場 ${i} の 14m 以内まで行く (${far(s.boxes[i]).toFixed(2)}m)`);
  }
};

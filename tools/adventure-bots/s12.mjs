// ステージ 12「しおかぜ灯台」を 1 人で解く手順：井戸のハンドルで水を満たし、浮いてきたでんちを岸壁の荷台（ソケット）へ
// → 東西の鉄球でくさびを割る → 窓の前の鉄球を南へ引いて放し、窓の板を割る → ジップラインで島へ → 島のレバーでクレーンを動かし、荷台のでんちを島のソケットへ → 灯台の庭のゴールへ。
// そのあと fresh() で：戻りのジップライン・やり直せること・できてはいけないこと（荷物を持ってジップライン・板があるうちのジップライン・井戸のあみ・4 人で積んで投げる）
// つないだステージでは、view が座標と番号をそろえる。ただし、とっての場所 r.at と、箱の c.hook（クレーンの番号）はずらさないので、ここでは読まない（c.hook は null かどうかだけ見る）
export default (b, { assert, fresh }) => {
  const GATE = 0, WELL = 1;                                                           // 動く床の番号
  const CELL = 0, BALL_A = 1, BALL_B = 2, LX = 3, LZ = 4, LY = 5;                     // 箱の番号
  const CRADLE = 0, SOCKET = 1;                                                       // 信号の番号
  const near = (a, v, e = 0.05) => Math.abs(a - v) < e;
  const idle = (q, s) => { for (let i = 0; i < s * q.FPS; i++) q.tick(); };
  const move = (q, i, x, y, z) => { Object.assign(q.w.crates[i], { x, y, z, vy: 0, moved: true }); q.w.fit(q.w.crates[i]); };   // 検査のために、箱をその場所へ置く
  const planksAt = (q, k) => q.w.stage.boxes.map((b, i) => b.planks ? i : -1).filter(i => i >= 0)[k];   // k 番目の板張り（0 くさび・1 窓）
  const broken = (q, k) => q.w.broken.has(planksAt(q, k));
  const hook = q => q.w.cranes[0];
  // 島のレバー i を、端まで押す（dir 1 で東＝max、-1 で西＝min）。レバーの列の西（x -7.4）か東（x -4）の通路を通って回りこむ
  const lever = (q, i, dir) => {
    const z = q.w.crates[i].z, lane = dir > 0 ? -7.4 : -4;
    q.go([q.p.x, 28]); q.go([lane, 28]); q.go([lane, z]); q.push(i, [lane, z], dir, 0);   // z 28 は、レバーの間の通り道
    const c = q.w.crates[i], r = { min: c.home.x, max: c.home.x + 1.6 };   // レバーは min の端に置いてある（view は rail をずらさないので、home から求める）
    assert.ok(near(c.x, dir > 0 ? r.max : r.min, 0.1), `レバー ${i} が端まで行かない (x=${c.x.toFixed(2)})`);
  };

  // 西：井戸に水を満たし、浮いてきたでんちを、岸壁の荷台へ
  const well = q => {
    const pool = q.w.movers[WELL], c = q.w.crates[CELL];
    q.go([-14, -3]); q.crank(0, () => pool.f === 1);
    q.wait('でんちが井戸の口まで浮いてくる', () => near(c.y + 0.8, 0, 0.02), 3);
    q.grab(CELL, [-20, -1.6]); q.go([-12, 0]); q.put(-6, 4);
    q.wait('でんちが荷台に入る', () => q.w.plates[CRADLE].down, 3);
  };
  // 北：東西の鉄球を西へ引ききって放し、くさびを割る → 窓の前の鉄球を東がわから南へ引ききって放し、窓の板を割る
  const balls = q => {
    q.go([-5, 6]); q.go([-4.4, 8.55]);
    q.push(BALL_A, [-4.4, 8.55], -1, 0);
    q.wait('東西の鉄球が、くさびを割る', () => broken(q, 0), 4);
    assert.ok(!broken(q, 1), 'くさびといっしょに、窓の板も割れた');
    q.go([-5, 6]); q.go([0.9, 6]); q.go([0.9, 9.6]);
    q.push(BALL_B, [0.9, 9.6], 0, -1);
    assert.ok(near(q.w.crates[BALL_B].z, 7.6, 0.1), `窓の前の鉄球を、南へ引ききれない (z=${q.w.crates[BALL_B].z.toFixed(2)})`);
    q.wait('窓の前の鉄球が、窓の板を割る', () => broken(q, 1), 4);
  };
  // ジップラインで島へ（先の端で、足が島につく）
  const zipOver = q => {
    q.go([2, 7]); q.go([2, 9.85]);
    q.hang(0, () => q.w.ropes[0].f === 1);
    assert.ok(near(q.p.y, 0) && q.p.z > 26 && q.falls === 0, `ジップラインで、島に着かない ${q.where()}`);
    q.wait('着地', () => q.p.grounded, 1);
  };
  // 島：クレーンで、荷台のでんちを島のソケットへ。灯台の庭の戸があいたら、ゴールへ
  const craneRun = q => {
    const k = hook(q), c = q.w.crates[CELL];
    lever(q, LX, 1); lever(q, LZ, 1);                                                 // フックを、岸壁の荷台の真上へ
    lever(q, LY, 1); q.wait('フックが荷台の上で下りて開く', () => k.open && near(k.x, -6) && near(k.z, 4), 14);
    lever(q, LY, -1); assert.ok(c.hook != null, 'フックを閉じても、荷台のでんちを吊らない');
    lever(q, LX, -1); lever(q, LZ, -1);
    q.wait('フックが、でんちを吊って島へ戻る', () => near(k.x, 4) && near(k.z, 29), 12);
    lever(q, LY, 1); q.wait('でんちが島のソケットに入る', () => c.hook == null && q.w.plates[SOCKET].down, 6);
    q.wait('灯台の庭の戸があく', () => q.w.movers[GATE].f === 1, 3);
    q.go([0, 30.5]); q.go([0, 36]);
    assert.ok(q.p.goal && q.falls === 0, `ゴールに着いていない ${q.where()} 落ちた回数 ${q.falls}`);
  };

  { // ── 1 人の基本の道 ──
    const { w } = b;
    b.go([0, -5]); idle(b, 1);
    assert.ok(w.movers[GATE].f === 0 && w.movers[WELL].f === 0 && !broken(b, 0) && !broken(b, 1), 'はじめから戸か水があがっているか、板が割れている');
    well(b); balls(b); zipOver(b); craneRun(b);
  }

  { // ── 順番を変えても解ける（鉄球 → 井戸）。でんちを置き忘れて島へ渡っても、戻りのジップラインで岸壁へ戻れる ──
    const q = fresh();
    q.go([0, -5]); balls(q); zipOver(q);
    q.go([-4, 26.4]); q.hang(1, () => q.w.ropes[1].f === 1);
    assert.ok(near(q.p.y, 0) && q.p.z < 10 && q.falls === 0, `戻りのジップラインで、岸壁に着かない ${q.where()}`);
    q.wait('着地', () => q.p.grounded, 1);
    q.go([-4, 6]); well(q); zipOver(q); craneRun(q);
  }

  { // ── やり直せること ──
    // 井戸：取りそこねたでんちは、水が引くと井戸の底へ戻る。井戸に下りても、あみを登って出られる
    let q = fresh(); const pool = q.w.movers[WELL], c = q.w.crates[CELL];
    q.go([-14, -3]); q.crank(0, () => pool.f === 1);
    q.wait('水が引ききる', () => pool.f === 0, 30);
    assert.ok(near(c.y, -10) && near(c.x, -20) && near(c.z, -0.6), `水が引いても、でんちが井戸の底へ戻らない (${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)})`);
    q.place(-20, -10, 0.5, 1); q.face(-20, 2); idle(q, 0.2);
    q.climb([-20, 0.5], [-20, 2.5]);
    assert.ok(near(q.p.y, 0) && q.falls === 0, `井戸のあみを登って出られない ${q.where()}`);
    // 海へ落としたでんちは、井戸の底へ戻る
    move(q, CELL, 5, 0, 9.5); q.place(5, 0, 8.6); q.face(5, 12); assert.equal(q.p.grabStart(), q.w.crates[CELL]);
    q.go([5, 9.9]); q.p.grabEnd();
    q.wait('海に落としたでんちが、井戸の底へ戻る', () => near(c.y, -10) && near(c.x, -20), 6);
    // 窓の前の鉄球を、くさびを割る前に引いても 0.25m しか動かず、放しても窓は割れない
    q = fresh(); q.go([0.9, 6]); q.go([0.9, 9.6]); q.push(BALL_B, [0.9, 9.6], 0, -1); idle(q, 3);
    assert.ok(q.w.crates[BALL_B].z > 9.3 && !broken(q, 1), `くさびがあるのに、窓の前の鉄球を引けた・窓が割れた (z=${q.w.crates[BALL_B].z.toFixed(2)})`);
  }

  { // ── できてはいけないこと ──
    // 窓の板があるうちは、ジップラインのとっては進まない（体が板に当たる）
    let q = fresh(); q.go([2, 7]); q.go([2, 9.85]); q.hang(0); idle(q, 2);
    assert.ok(q.p.z < 10.2 && q.w.ropes[0].f < 0.03, `窓の板があるのに、ジップラインが進んだ ${q.where()}`);
    q.p.grabEnd(); idle(q, 0.5);
    // でんちを持ったままでは、とってをつかめない（荷物はジップラインで運べない）
    q.go([2, 6]); balls(q);
    move(q, CELL, 2, 0, 8.5); q.go([2, 7.5]); q.face(2, 9); assert.equal(q.p.grabStart(), q.w.crates[CELL]);
    q.go([2, 9.85]); q.p.grabStart(); idle(q, 0.5);
    assert.ok(q.p.rope == null && q.p.carry === q.w.crates[CELL] && q.w.ropes[0].f === 0, 'でんちを持ったまま、ジップラインのとってをつかめた');
    // 井戸の底で、でんちを持ったままでは、あみを登れない
    q = fresh(); q.place(-20, -10, 0.3, 1); idle(q, 0.2); q.face(-20, -2); assert.equal(q.p.grabStart(), q.w.crates[CELL]);
    q.face(-20, 2); for (let i = 0; i < 2 * q.FPS; i++) q.tick(0, 1);
    q.p.grabStart(); for (let i = 0; i < 3 * q.FPS; i++) q.tick(0, 1);
    assert.ok(q.p.y < -9 && !q.p.hang, `でんちを持ったまま、井戸のあみを登れた ${q.where()}`);
    // 灯台の庭の戸は、でんちでしかあかない（4 人でソケットに乗っても）。庭の壁は 14m
    q = fresh(); q.place(4, 0, 28, 3); q.friend = [4, 0, 29, 3]; idle(q, 2);
    assert.ok(q.w.movers[GATE].f === 0, '人がソケットに乗って、戸があいた');
    q.friend = null;
    assert.throws(() => q.go([0, 34], null, 6), /着けない/, '戸が閉まっているのに、灯台の庭に入れた');
    // クレーンのレバーは島にしかない：島へ渡る前は、フックは動かない
    assert.ok(q.w.stage.crates.slice(LX, LY + 1).every(c => c.z > 26), 'クレーンのレバーが、島の外にある');
    // 4 人でも：岸壁の北の縁で、仲間 2 人を積んだてっぺんから（ほかに積める箱は、でんちだけ）島へ投げても、届かない（16m）
    for (const x of [-6, -3, 0, 3, 6]) {
      q = fresh(); const top = 0.8 + 2.6 + 0.9;
      q.place(x, top, 10.75); q.face(x, 40); Object.assign(q.p, { vy: 6.5, kvz: 4, grounded: false }); q.p.grabStart();
      let land = false;
      for (let i = 0; i < 8 * q.FPS && q.falls === 0 && !land; i++) { q.tick(0, 1); land = q.p.z > 25.5 && (q.p.grounded || !!q.p.hang); }
      assert.ok(!land, `岸壁の縁から投げられて、島に届いた (x ${x}) ${q.where()}`);
    }
  }
};

// つないだステージ A「ひだまり連絡船」のつなぎ（ひだまり桟橋）を 1 人で解く手順。前半（s1.mjs）が N2 のゴールの場所で終わったところから始める：
// N2 の北の縁から桟橋へおりる → 重い箱を北へ押して、点 2 つのおもさ板へ → LK で柱へ → でんちを持って南へおりる → ソケットへ → LK で港の南の岸へ。
// 番号はつなぎの中だけで数え、座標はステージ全体のもの（tools/test-adventure.mjs の view がそろえる）。fresh() は、つなぎの入口（N2 のセーブ地点）から始める。
// そのあと fresh() で：まちがった順番・落としたものが戻る・仲間との答え・できてはいけないこと
export default (b, { assert, fresh }) => {
  const LK = 2;                                                                       // 箱の番号：カタパルト
  const PLATE = 0, SOCK = 1;                                                          // 信号の番号
  const HEAVY = 0, CELL = 1;                                                          // 箱の番号
  const near = (a, v, e = 0.05) => Math.abs(a - v) < e;
  const idle = (q, s) => { for (let i = 0; i < s * q.FPS; i++) q.tick(); };
  const move = (q, i, x, y, z) => { Object.assign(q.w.crates[i], { x, y, z, vy: 0, moved: true }); q.w.fit(q.w.crates[i]); };   // 検査のために、箱をその場所へ置く
  const aim = q => q.w.stage.boxes[LK].aimV;
  const fly = q => { q.go([0, 62], () => !q.p.grounded && q.p.vy > 3); q.wait('着地', () => q.p.grounded, 8); };   // LK に乗って飛ぶ

  // N2 の北の縁から、4m 下の桟橋へおりる
  const down = q => { q.go([-3, 44.5]); q.go([-3, 49]); assert.ok(near(q.p.y, 0) && q.falls === 0, `桟橋におりていない ${q.where()}`); };
  // 重い箱を北へ押して、おもさ板へ（重さ 2 で板が押される）
  const heavy = q => {
    q.grab(HEAVY, [-5.5, 49.6]);
    for (let i = 0; !q.w.plates[PLATE].down; i++) { assert.ok(i < q.FPS * 10, `重い箱がおもさ板にのらない ${q.where()}`); q.tick(0, 1); }
    q.p.grabEnd(); q.go([-3.6, 59.6]);
  };
  // LK で柱へ。でんちを持って、柱の南の縁からおりる
  const pillar = q => {
    q.wait('LK が柱をねらう', () => aim(q)?.[2] < 0, 2); fly(q);
    assert.ok(near(q.p.y, 6) && Math.abs(q.p.x) < 3 && q.p.z > 53 && q.p.z < 59, `LK で柱に着いていない ${q.where()}`);
    q.grab(CELL); q.go([1.5, 51]);
    assert.ok(near(q.p.y, 0) && q.p.carry === q.w.crates[CELL], `でんちを持って柱からおりていない ${q.where()}`);
  };
  const plug = q => { q.go([5, 51]); q.put(5, 62); q.wait('ソケットにでんちが入る', () => q.w.plates[SOCK].down, 3); };
  // LK で港の南の岸へ（後半のはじめのセーブ地点にふれる）
  const port = q => {
    q.wait('LK が港をねらう', () => aim(q)?.[2] > 0, 2); q.go([2, 62]); fly(q);
    assert.ok(near(q.p.y, 0) && Math.abs(q.p.x) < 4 && q.p.z > 82 && q.p.z < 88 && q.falls === 0, `LK で港の南の岸に着いていない ${q.where()}`);
    q.go([0, 83]);
  };

  // ── 1 人の基本の道 ──
  down(b); idle(b, 0.5);
  assert.ok(aim(b) === null, 'はじめから LK が動いている');
  heavy(b); pillar(b); plug(b); port(b);

  { // ── まちがった順番：でんちを持ったまま LK に乗ると、ソケットが空なので柱へ飛ぶ（でんちは運び出せない）。重い箱だけで板に乗っても動かない ──
    const q = fresh(); down(q); move(q, CELL, 5, 0, 62); idle(q, 0.5);
    q.go([-3.6, 59.6]); q.go([0, 62]); idle(q, 0.5);
    assert.ok(q.p.grounded && near(q.p.y, 0.1) && aim(q) === null, `でんちだけで（板が空で）LK が動いた ${q.where()}`);
    q.go([-3.6, 51]); heavy(q); q.go([4, 59.9]); q.grab(CELL); q.go([2.2, 62]); fly(q);
    assert.ok(near(q.p.y, 6) && q.p.carry === q.w.crates[CELL], `でんちを持って LK に乗ったら、柱でないところへ飛んだ ${q.where()}`);
    q.go([1.5, 51]); plug(q); port(q);
  }

  { // ── 落としたものは元の場所へ戻る：重い箱を桟橋の北の縁から海へ／でんちを桟橋の東の縁から海へ ──
    const q = fresh(); down(q); q.grab(HEAVY, [-5.5, 49.6]);
    for (let i = 0; q.w.crates[HEAVY].y > -1; i++) { assert.ok(i < q.FPS * 16, `重い箱が海へ落ちない ${q.where()}`); q.tick(0, 1); }
    q.p.grabEnd();
    q.wait('重い箱が桟橋へ戻る', () => near(q.w.crates[HEAVY].z, 51) && q.w.crates[HEAVY].on, 6);
    q.go([-3, 52]); heavy(q); pillar(q);
    q.go([8.5, 51]); q.face(10, 51); q.p.grabEnd();
    q.wait('でんちが柱の上へ戻る', () => near(q.w.crates[CELL].y, 6) && q.w.crates[CELL].on, 6);
    q.go([-3.6, 59.6]); pillar(q); plug(q); port(q);
  }

  { // ── もどり道：重い箱を N2 の北の壁ぎわへ押せば、その上から跳んでつかんで N2 へ戻れる（なくしてはいけない） ──
    const q = fresh(); down(q); q.go([-3.8, 49.5]); q.go([-3.8, 52.6]); q.push(HEAVY, [-5.5, 52.4], 0, -1);   // 箱をよけて北へ回る
    const c = q.w.crates[HEAVY]; assert.ok(c.z < 47.5 && near(c.y, 0), `重い箱が N2 の壁ぎわまで行かない ${JSON.stringify([c.x, c.y, c.z])}`);
    q.place(c.x, 1.4, c.z); q.wait('重い箱の上', () => q.p.grounded, 3); q.hoist([c.x, c.z], [c.x, 44]);
    assert.ok(near(q.p.y, 4) && q.p.z < 46, `重い箱から N2 へ戻れない ${q.where()}`);
  }
  { // ── N2 の北の縁のはし（観覧車のおり場の真北）からおりても、入口のセーブ地点にふれている。桟橋から海へ落ちても、前半へは戻らない ──
    const q = fresh(); q.place(6.5, 4, 37); q.p.cp = -1;                               // -1：つなぎの 1 つ前（前半の N1 のセーブ地点）
    q.go([6.5, 45.6]); q.go([6.5, 50]); q.go([8.5, 58]); q.go([10, 58], () => q.falls === 1);
    q.wait('やり直し', () => q.p.grounded, 8);
    assert.ok(near(q.p.y, 4) && q.p.z > 37, `N2 のはしからおりると、入口のセーブ地点にふれない（前半からやり直し） ${q.where()}`);
  }

  { // ── 仲間がいれば：仲間 2 人が板に乗れば、重い箱はいらない（板は使う） ──
    const q = fresh(); down(q); q.friend = [-5.5, 0, 62, 2]; q.go([-3.6, 59.6]);
    pillar(q); plug(q); port(q); q.friend = null;
  }

  { // ── できてはいけないこと ──
    // 板だけでは、LK は柱をねらう（港へは、板とソケットの両方がいる。ソケットだけで動かないことは、上の「まちがった順番」で見た）
    let q = fresh(); down(q); move(q, HEAVY, -5.5, 0, 62); idle(q, 0.5);
    assert.ok(aim(q)?.[2] < 0, '板だけで、LK が柱でないところをねらった');
    // 1 人で柱へは登れない：柱の南の面に重い箱を寄せ、その上から跳んでつかんでも（箱の上 1.4 から 6 は 4.6）
    move(q, HEAVY, 0, 0, 52.2); idle(q, 0.5); q.place(0, 1.4, 52.2);
    q.wait('重い箱の上', () => q.p.grounded, 3);
    assert.ok(near(q.p.y, 1.4), `検査の前提：重い箱の上にいない ${q.where()}`);
    assert.throws(() => q.hoist([0, 52.2], [0, 55]), undefined, '重い箱から柱へ登れた');
    q.wait('着地', () => q.p.grounded, 3); assert.ok(q.p.y < 2, `重い箱から柱へ登れた ${q.where()}`);
    // N2 から柱へは跳べない（7m）
    q = fresh(); q.go([0, 45.6]);
    for (let i = 0; i < q.FPS * 4 && q.p.y > 1; i++) { if (q.p.grounded && q.p.z > 45.4) { q.p.jump(); q.p.grabStart(); } q.tick(0, 1); }
    q.wait('着地', () => q.p.grounded, 3); assert.ok(q.p.y < 0.5, `N2 から柱へ跳べた ${q.where()}`);
    // 4 人でも：桟橋の北の縁に重い箱、その上にでんちと仲間 2 人を積み、てっぺんから港へ投げても（ページの投げ方：0.9m 上・0.75m 前、vy 6.5・横 4）、届かない（14m）
    // 柱の北の縁（高さ 6）にでんちと仲間 2 人を積んでも、届かない（20m）
    for (const [x, top, z] of [[-6, 1.4 + 0.8 + 2.6, 65.3], [0, 1.4 + 0.8 + 2.6, 65.3], [6, 1.4 + 0.8 + 2.6, 65.3], [0, 6 + 0.8 + 2.6, 59]]) {
      q = fresh(); q.place(x, top + 0.9, z + 0.75 + 0.7); q.face(x, 120); Object.assign(q.p, { vy: 6.5, kvz: 4, grounded: false }); q.p.grabStart();
      let land = false;
      for (let i = 0; i < 8 * q.FPS && q.falls === 0 && !land; i++) { q.tick(0, 1); land = q.p.z > 79.5 && (q.p.grounded || !!q.p.hang); }
      assert.ok(!land && q.falls === 1, `積んだてっぺんから投げられた仲間が、港へ渡れた (x ${x}, 高さ ${top}) ${q.where()}`);
    }
    // 4 人でも：前半の N1（北の縁 z 27）で軽い箱 4 こと仲間 2 人を積み、桟橋へ投げても、届かない（19m）
    q = fresh(); q.place(0, 3.2 + 2.6 + 0.9, 27 + 0.75 + 0.7); q.face(0, 80); Object.assign(q.p, { vy: 6.5, kvz: 4, grounded: false }); q.p.grabStart();
    for (let i = 0; i < 8 * q.FPS && q.falls === 0 && !(i > 2 && (q.p.grounded || q.p.hang)); i++) q.tick(0, 1);   // 着いたら止まる（観覧車のかごに乗るのは、ふつうの道）
    assert.ok(!(q.p.z > 45.5 && q.p.y < 1), `N1 から投げられた仲間が、桟橋へ渡れた ${q.where()}`);
  }
};

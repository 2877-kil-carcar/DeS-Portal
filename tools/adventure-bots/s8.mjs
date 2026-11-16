// ステージ 8「ごとごと操車場」を 1 人で解く手順：貨車を東へ押して倉庫の板を割る → 荷台のコンテナを押し落として、おもさ板まで押す
// → 信号小屋に入って、ポイントのレバーを押しきる → 貨車を西へ戻すと分かれ目で止まる → 北へ押して行き止まりへ → 橋をわたって島のゴールへ。
// そのあと fresh() で：貨車を分かれ目より西へ戻してからポイントを切りかえる道・中から出る道（中の板）・やり直せること・できてはいけないこと
export default (b, { assert, fresh }) => {
  const DOOR = 0, BRIDGE = 1;                                                         // 動く床の番号
  const WAGON = 0, SKIP = 1, LEVER = 2;                                               // 箱の番号
  const near = (a, v, e = 0.05) => Math.abs(a - v) < e;
  const idle = (q, s) => { for (let i = 0; i < s * q.FPS; i++) q.tick(); };
  const move = (q, i, x, y, z) => { Object.assign(q.w.crates[i], { x, y, z, vy: 0, moved: true }); q.w.fit(q.w.crates[i]); };   // 検査のために、箱をその場所へ置く
  const board = q => q.w.stage.boxes.findIndex(k => k.planks);
  const broken = q => q.w.broken.has(board(q));
  // 重い箱 i を from からつかみ、until が合うまで (dx, dz) の向きへ押す（引く）。手が離れたら（段から下りたなど）、箱のうしろからつかみなおす
  const drag = (q, i, from, dx, dz, until, seconds = 40) => {
    const c = q.w.crates[i], keep = dx ? c.z : c.x, fix = v => Math.max(-0.5, Math.min(0.5, (keep - v) * 3));   // 押す向きと直角のずれ（歩いてきた勢いの残り）を、少しずつ戻す
    q.grab(i, from);
    for (let n = 0; !until(c); n++) {
      assert.ok(n < q.FPS * seconds, `箱 ${i} を思った所まで動かせない ${q.where()} 箱 ${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)}`);
      if (!q.p.carry) { q.wait('着地', () => q.p.grounded, 3); q.grab(i, [c.x - dx * 1.15, c.z - dz * 1.15]); }
      q.tick(dx || fix(c.x), dz || fix(c.z));
    }
    q.p.grabEnd();
  };
  // 敷居（0.5m）を跳んで越える
  const hop = (q, from, to) => { q.go(from); q.face(...to); q.p.jump(); q.go(to); };

  // 貨車を東へ押して、倉庫の板にぶつけて割る（ポイントは本線のままなので、分かれ目は通りすぎる）
  const ram = q => {
    const c = q.w.crates[WAGON];
    q.go([-6.3, -1.5]); q.push(WAGON, [-6.3, 0], 1, 0);
    assert.ok(broken(q), `貨車をぶつけても、倉庫の板が割れない (x=${c.x.toFixed(2)})`);
    assert.ok(q.w.smashed.includes(board(q)), '割れた知らせ（w.smashed）がない');
  };
  // 倉庫：荷台のコンテナを西へ押し落とし、そのまま構内のおもさ板まで押す（貨車の南を通る）
  const skip = q => {
    const c = q.w.crates[SKIP];
    q.go([8.5, -1.8]); q.go([13, -1.8]); q.go([14.5, -3.5]); q.go([19.3, -3.5]);
    assert.ok(near(q.p.y, 1), `荷台に上がれない ${q.where()}`);
    drag(q, SKIP, [19.3, -1.7], -1, 0, k => k.x <= -3);
    q.wait('おもさ板が押される', () => q.w.plates[0].down, 2);
  };
  // 信号小屋：戸があいている間に入り、レバーを東へ押しきって、ポイントを支線がわにする。戸があいているうちに出る
  const box = q => {
    q.wait('信号小屋の戸があく', () => q.w.movers[DOOR].f === 1, 3);
    hop(q, [-9.6, 0], [-12.4, 0]);
    q.go([-15, -4.5]); q.push(LEVER, [-18.95, -3], 1, 0);
    q.wait('ポイントのレバーの信号', () => q.w.plates[2].down, 2);
    q.go([-12.4, -0.5]); q.wait('戸があいている', () => q.w.movers[DOOR].f === 1, 3); hop(q, [-12.4, 0], [-9.6, 0]);
  };
  // 貨車を北の行き止まりへ（分かれ目にいる貨車を、南から押す）。橋があがったら、島のゴールへ
  const finish = q => {
    const c = q.w.crates[WAGON];
    assert.ok(c.rail === c.side && near(c.x, 1, 1e-6) && near(c.z, 0, 1e-6), `貨車が、分かれ目で支線に乗りかわっていない (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`);
    q.go([c.x - 1.5, -1.5]); q.push(WAGON, [1, -1.2], 0, 1);
    assert.ok(near(c.z, 14, 0.1), `貨車が行き止まりまで行かない (z=${c.z.toFixed(2)})`);
    q.wait('島への橋があがる', () => q.w.movers[BRIDGE].f === 1, 4);
    q.go([-5, 16]); q.go([-5, 37]);
    assert.ok(q.p.goal && q.falls === 0, `ゴールに着いていない ${q.where()} 落ちた回数 ${q.falls}`);
  };

  { // ── 1 人の基本の道：板を割る → コンテナ → 信号小屋 → 貨車を東から分かれ目へ戻して、北へ ──
    const { w } = b, c = w.crates[WAGON];
    b.go([0, -5]); idle(b, 1);
    assert.ok(w.movers[DOOR].f === 0 && w.movers[BRIDGE].f === 0, 'はじめから戸か橋があいている');
    ram(b); skip(b); box(b);
    assert.equal(w.movers[BRIDGE].f, 0, 'ポイントを切りかえただけで、橋があがった');
    b.go([11.2, -1.5]); b.push(WAGON, [11.2, 0], -1, 0);                              // 倉庫の入口から西へ押すと、分かれ目でぴたりと止まる
    finish(b);
  }

  { // ── 先に貨車を本線の西の端まで戻し、それからポイントを切りかえて、西から分かれ目へ ──
    const q = fresh(), c = q.w.crates[WAGON];
    q.go([0, -5]); ram(q);
    q.go([11.2, -1.5]); q.push(WAGON, [11.2, 0], -1, 0);
    assert.ok(near(c.x, -6, 0.1) && c.rail === c.main, `ポイントが本線なのに、貨車が分かれ目で止まった (x=${c.x.toFixed(2)})`);
    skip(q); box(q);
    q.go([-7.3, -1.5]); q.push(WAGON, [-7.2, 0], 1, 0);
    finish(q);
  }

  { // ── 中から出る道：コンテナがおもさ板から下りて戸が閉まっても、中の板を踏めば戸があく（中に閉じこめられない） ──
    const q = fresh(), door = q.w.movers[DOOR];
    move(q, SKIP, -3, 0, -1.7); q.place(-7, 0, -1.5, 2); q.wait('戸があく', () => door.f === 1, 3);
    hop(q, [-9.6, 0], [-12.4, 0]);
    move(q, SKIP, 5, 0, -5); q.wait('コンテナがどくと、戸が閉まる', () => door.f === 0, 5);
    q.go([-13, 2.5]); q.wait('中の板で戸があく', () => door.f === 1, 3);
    hop(q, [-12.4, 0.5], [-9.6, 0.5]);
    assert.ok(q.p.x > -10.5 && q.falls === 0, `信号小屋から出られない ${q.where()}`);
  }

  { // ── やり直せること：レバーを戻しても、支線の貨車は支線のまま。分かれ目まで戻すと本線にもどる／構内から落としたコンテナは、倉庫の荷台へ戻る ──
    const q = fresh(), c = q.w.crates[WAGON], k = q.w.crates[SKIP];
    move(q, LEVER, -16.4, 0, -3); move(q, WAGON, 1, 0, 8); q.place(1, 0, 10, 3); idle(q, 0.2);
    assert.ok(c.rail === c.side, '支線においた貨車が、支線のレールにいない');
    move(q, LEVER, -18, 0, -3); idle(q, 0.2);
    assert.ok(c.rail === c.side, 'レバーを戻したら、支線の貨車が支線から外れた');
    q.push(WAGON, [1, 9.2], 0, -1); assert.ok(near(c.z, 0, 1e-6) && c.rail === c.main, `分かれ目まで戻した貨車が、本線にもどらない (z=${c.z.toFixed(2)})`);
    q.go([-0.5, 1.5]); q.go([-1.5, -1.5]); q.push(WAGON, [-0.2, 0], 1, 0); assert.ok(c.x > 9.9, `本線にもどった貨車を、東へ押せない (x=${c.x.toFixed(2)})`);
    move(q, SKIP, -9, 0, 14); q.place(-6.5, 0, 14, 3); q.push(SKIP, [-7.8, 14], -1, 0);
    q.wait('構内から落としたコンテナが、荷台へ戻る', () => near(k.x, 18) && near(k.y, 1) && near(k.z, -1.7), 6);
    assert.equal(q.falls, 0);
  }

  { // ── できてはいけないこと ──
    const cannotHop = (q, from, to, what) => { q.go(from); q.face(...to); q.p.jump(); assert.throws(() => q.go(to, null, 4), /着けない/, what); };
    // はじめは、板張りで倉庫に入れない。コンテナがなければ（4 人でのっても）、信号小屋の戸はあかない
    let q = fresh(); q.go([0, -5]);
    assert.throws(() => q.go([14, -1.5], null, 6), /着けない/, '板張りを通りぬけて、倉庫に入れた');
    q = fresh(); q.place(-3, 0, -1.7); q.friend = [-3, 0, -1.2, 3]; idle(q, 1);
    assert.ok(q.w.plates[0].load === 4 && q.w.movers[DOOR].f === 0, `4 人でおもさ板にのったら、信号小屋の戸があいた (重さ ${q.w.plates[0].load})`);
    q.friend = null; cannotHop(q, [-9.6, 0], [-12.4, 0], '戸が閉まっているのに、信号小屋に入れた');
    // ポイントが本線のままなら、貨車は分かれ目を通りすぎ、北へは押せない
    q = fresh(); const c = q.w.crates[WAGON]; move(q, WAGON, 1, 0, 0); q.place(1, 0, -2.5); idle(q, 0.2);
    q.grab(WAGON, [1, -1.2]); for (let i = 0; i < q.FPS; i++) q.tick(0, 1); q.p.grabEnd();
    assert.ok(near(c.z, 0, 1e-6) && c.rail === c.main, `ポイントが本線なのに、貨車を北へ押せた (z=${c.z.toFixed(2)})`);
    // 人やコンテナが行き止まりに立っても、橋はあがらない（貨車だけ）。橋がなければ、島へは渡れない（14m）
    move(q, SKIP, 1, 0, 14); q.place(1, 0, 15.5); idle(q, 1); assert.equal(q.w.movers[BRIDGE].f, 0, '貨車でないもので、橋があがった');
    q = fresh(); q.place(-5, 0, 15, 3); q.face(-5, 30); for (let i = 0; i < 2 * q.FPS; i++) q.tick(0, 1);
    q.p.jump(); for (let i = 0; i < 3 * q.FPS; i++) q.tick(0, 1);
    assert.ok(q.falls === 1 && !q.p.goal, `橋なしで、島へ渡れた ${q.where()}`);
    const isle = q.w.stage.boxes[3], yard = q.w.stage.boxes[0];
    assert.ok(isle.z0 - yard.z1 >= 13.5, '島と構内の間が、14m より近い（投げられた仲間が届く）');
    // 4 人でも：コンテナを構内の北の縁に置き、その上に仲間 2 人、てっぺんの人が 4 人目を島へ投げても（ページの投げ方：0.9m 上・0.75m 前、vy 6.5・横 4）、届かない
    for (const cz of [17.7, 17.9, 18.1]) {
      q = fresh(); move(q, SKIP, -5, 0, cz); idle(q, 1);
      assert.ok(near(q.w.crates[SKIP].z, cz, 1e-6), `検査の前提：コンテナが構内の縁に止まらない (z=${q.w.crates[SKIP].z.toFixed(2)})`);
      // 投げる人は、コンテナ（1.4）と仲間 2 人（2.6）の上、北の縁ぎりぎり。投げられた人は、つかむを押したまま北へ
      q.place(-5, 4 + 0.9, cz + 1.2 + 0.75); q.face(-5, 40); Object.assign(q.p, { vy: 6.5, kvz: 4, grounded: false });
      let land = false; q.p.grabStart();
      for (let i = 0; i < 8 * q.FPS && q.falls === 0 && !land; i++) { q.tick(0, 1); land = q.p.z > isle.z0 - 0.5 && (q.p.grounded || !!q.p.hang); }
      assert.ok(!land && q.falls === 1, `コンテナの上の塔から投げられた仲間が、島へ渡れた (コンテナ z ${cz}) ${q.where()}`);
    }
    // 4 人でも：コンテナを倉庫の壁ぎわに置き、その上に仲間 3 人を積み、てっぺんから跳んでつかんでも、壁（12m）には届かない
    q = fresh(); move(q, SKIP, 9.5, 0, -4); idle(q, 0.2);
    q.w.extra = [0, 1, 2].map(k => ({ x0: 9.25, x1: 9.75, z0: -4.25, z1: -3.75, y0: 1.4 + 1.3 * k, y1: 2.7 + 1.3 * k, friend: true }));
    let top = 0;
    for (const [fx, fz] of [[1, 0], [0, -1]]) {
      q.place(9.5, 5.3, -4); idle(q, 0.2); assert.ok(near(q.p.y, 5.3), `検査の前提：積んだてっぺんに立っていない ${q.where()}`);
      q.face(9.5 + fx, -4 + fz); q.p.jump(); q.p.grabStart(); top = 0;
      for (let i = 0; i < 3 * q.FPS; i++) { q.tick(fx, fz); top = Math.max(top, q.p.y); }
      q.p.grabEnd(); assert.ok(top < 11.5, `積み上げたてっぺんから、壁の上に届いてしまう (いちばん上 ${top.toFixed(2)})`);
    }
  }
};

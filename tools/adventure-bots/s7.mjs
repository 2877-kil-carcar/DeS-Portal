// ステージ 7「とおせんぼ屋敷」を 1 人で解く手順：書庫（中二階のたんすを落として、板張りの戸口にぶつけて割る → 書斎のレバー）
// → 台所（木箱をホールの板にのせて引き戸をあけ、たんすを棚の下へ押して踏み台に → 棚のレバー）→ 西の引き戸から裏庭のゴールへ。
// そのあと fresh() で：順番を変えた道・たんすを階段から下ろす道・仲間がいるときの答え・中から出る道（たんすを中の板へ）・やり直せること・できてはいけないこと
export default (b, { assert, fresh }) => {
  const DOOR = 0, GATE = 1;                                                           // 動く床の番号
  const POT = 0, CHEST = 1, KCHEST = 2, L1 = 3, L2 = 4;                               // 箱の番号
  const near = (a, v, e = 0.05) => Math.abs(a - v) < e;
  const idle = (q, s) => { for (let i = 0; i < s * q.FPS; i++) q.tick(); };
  const move = (q, i, x, y, z) => { Object.assign(q.w.crates[i], { x, y, z, vy: 0, moved: true }); q.w.fit(q.w.crates[i]); };   // 検査のために、箱をその場所へ置く
  const board = q => q.w.stage.boxes.findIndex(k => k.planks);
  const broken = q => q.w.broken.has(board(q));
  // 重い箱 i を from からつかみ、until が合うまで (dx, dz) の向きへ押す（引く）
  const drag = (q, i, from, dx, dz, until) => {
    q.grab(i, from);
    for (let n = 0; !until(q.w.crates[i]); n++) { assert.ok(n < q.FPS * 20, `箱 ${i} を思った所まで動かせない ${q.where()} 箱 ${q.w.crates[i].x.toFixed(2)}, ${q.w.crates[i].z.toFixed(2)}`); q.tick(dx, dz); }
    q.p.grabEnd();
  };
  // 敷居（0.5m）を跳んで越える
  const hop = (q, from, to) => { q.go(from); q.face(...to); q.p.jump(); q.go(to); };

  // 書庫：中二階のたんすを西へ押し、手すりの切れ目から落とし、西の戸口の板へ押しつけて割る
  const library = q => {
    const c = q.w.crates[CHEST];
    q.go([0, 8]); q.go([0, 12]); q.go([7.7, 15.5]); q.go([7.7, 22.3]); q.go([5.5, 23]);
    assert.ok(near(q.p.y, 2.4), `中二階に上がれない ${q.where()}`);
    drag(q, CHEST, [5.2, 23], -1, 0, k => k.x <= -3);
    drag(q, CHEST, [-3, 24.2], 0, -1, k => k.y < 2);
    q.wait('たんすが下に落ちる', () => near(c.y, 0) && c.on, 4); q.wait('着地', () => q.p.grounded, 4);
    assert.ok(!broken(q), 'たんすが板にふれる前に、板が割れた');
    q.push(CHEST, [c.x + 1.2, c.z], -1, 0);
    assert.ok(broken(q), `たんすを押しつけても、板張りが割れない (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`);
    assert.deepEqual(q.w.smashed, [board(q)], '割れた知らせ（w.smashed）がない');
  };
  // 書斎：レバーを東へ押しきる（ランプが 1 つ光る）
  const study = q => {
    q.go([-7, 18.8]); q.go([-11, 18.8]); q.go([-17.85, 19.5]);
    q.push(L1, [-17.85, 18], 1, 0);
    q.wait('書斎のレバーの信号', () => q.w.plates[2].down, 2);
    q.go([-11, 18.8]); q.go([-7, 18.8]); q.go([0, 15]); q.go([0, 8]);
  };
  // 台所：木箱をホールの板にのせて戸をあけ、たんすを引いて押して棚の下へ、登って棚のレバーを北へ
  const kitchen = (q, potOnPlate = true) => {
    const k = q.w.crates[KCHEST], door = q.w.movers[DOOR];
    if (potOnPlate) q.carry(POT, 0);
    q.wait('台所の戸があく', () => door.f === 1, 3);
    hop(q, [7.6, 0], [10.6, 0]);
    drag(q, KCHEST, [14, 4.75], 0, -1, c => c.z <= -1.5);
    q.push(KCHEST, [k.x - 1.2, k.z], 1, 0);
    assert.ok(near(k.x, 21.6, 0.1), `たんすが棚の前まで行かない (x=${k.x})`);
    q.go([k.x - 1.6, k.z]); q.go([k.x, k.z]); assert.ok(near(q.p.y, 1.4), `たんすに登れない ${q.where()}`);
    q.hoist([k.x, k.z], [23.5, k.z]); assert.ok(near(q.p.y, 3.8), `棚に登れない ${q.where()}`);
    q.go([23.2, -6.6]); q.push(L2, [24.5, -6.35], 0, 1);
    q.wait('棚のレバーの信号', () => q.w.plates[3].down, 2);
    q.go([23.2, -4]); q.go([19.5, -4]);                                               // 棚から飛び下りる
    assert.ok(near(q.p.y, 0), `棚から下りていない ${q.where()}`);
  };
  const leaveKitchen = q => { q.wait('台所の戸があいている', () => q.w.movers[DOOR].f === 1, 3); hop(q, [10.6, 0], [7.6, 0]); };
  // 裏庭へ：引き戸があいたら、敷居を越えてゴールへ
  const finish = q => {
    q.wait('裏庭への戸があく', () => q.w.movers[GATE].f === 1, 3);
    q.go([-3, 5]); hop(q, [-7.6, 5], [-10.6, 5]); q.go([-20, 5]);
    assert.ok(q.p.goal && q.falls === 0, `ゴールに着いていない ${q.where()} 落ちた回数 ${q.falls}`);
  };

  { // ── 1 人の基本の道：書庫 → 台所 → 裏庭 ──
    const { w } = b;
    b.go([0, -10]); b.go([0, -5]);
    idle(b, 1); assert.ok(w.movers[DOOR].f === 0 && w.movers[GATE].f === 0, 'はじめから戸があいている');
    library(b); study(b);
    assert.equal(w.movers[GATE].f, 0, 'レバー 1 本で、裏庭への戸があいた');
    kitchen(b); leaveKitchen(b); finish(b);
  }

  { // ── 順番を変えて（台所 → 書庫）。書庫のたんすは、階段から押して下ろし、壁ぞいに北へ押して板を割る ──
    const q = fresh(), c = q.w.crates[CHEST];
    q.go([0, -5]); kitchen(q); leaveKitchen(q);
    q.go([0, 8]); q.go([0, 12]); q.go([7.7, 15.5]); q.go([7.7, 22.3]); q.go([5.5, 23]);
    q.push(CHEST, [c.x - 1.2, 23], 1, 0); assert.ok(near(c.x, 8, 0.1), `たんすが東の壁まで行かない (x=${c.x})`);
    drag(q, CHEST, [8, 24.2], 0, -1, k => k.z <= 15.5);                               // 階段を 1 段ずつ下ろす
    assert.ok(near(c.y, 0), `たんすが階段の下に下りていない (y=${c.y})`);
    drag(q, CHEST, [c.x - 1.2, c.z], -1, 0, k => k.x <= 4);                           // 東の壁ぎわから、西へ引き出す
    q.push(CHEST, [c.x + 1.2, c.z], -1, 0); assert.ok(near(c.x, -8, 0.1) && !broken(q), `たんすが西の壁まで行かない／板にふれずに割れた (x=${c.x})`);
    drag(q, CHEST, [c.x, c.z - 1.2], -0.3, 1, () => broken(q));                       // 壁へ寄せながら北へ押すと、戸口の板にふれて割れる
    study(q); finish(q);
  }

  { // ── 仲間と：仲間がホールの板にのれば、木箱はいらない。仲間が板を下りたら、たんすを中の板にのせて出る（中に閉じこめられない） ──
    const q = fresh(), door = q.w.movers[DOOR], k = q.w.crates[KCHEST];
    q.go([0, -5]); q.friend = [5.5, 0, -4, 1];
    kitchen(q, false);
    q.friend = null; q.wait('仲間が板を下りると、戸が閉まる', () => door.f === 0, 3);
    drag(q, KCHEST, [k.x - 1.2, k.z], -1, 0, c => c.x <= 12.1); drag(q, KCHEST, [k.x, k.z + 1.2], 0, -1, c => c.z <= -4);   // 棚の前から西へ引き、南へ押して、中の板へ
    q.wait('たんすで中の板が押される', () => q.w.plates[1].down, 2);
    leaveKitchen(q);
    // 仲間の頭を踏み台にして、たんすなしで棚へ上がれる（仲間がいるときの答え）。上がった先には、レバーしかない
    const r = fresh(); r.place(19, 0, -3, 4); r.w.extra = [{ x0: 21.75, x1: 22.25, z0: -3.25, z1: -2.75, y0: 0, y1: 1.3, friend: true }];
    r.go([20.4, -3]); r.go([22, -3]); assert.ok(near(r.p.y, 1.3), `仲間の頭に乗れない ${r.where()}`);
    r.hoist([22, -3], [23.5, -3]); assert.ok(near(r.p.y, 3.8), `仲間の頭から棚に上がれない ${r.where()}`);
  }

  { // ── やり直せること：レバーを戻すと戸が閉まり、また押せばあく／屋敷の外へ落とした木箱とたんすは、元の場所へ戻る ──
    const q = fresh(), gate = q.w.movers[GATE];
    move(q, L1, -15.4, 0, 18); move(q, L2, 24.5, 3.8, -3.9); q.place(-14, 0, 16, 3);
    q.wait('レバー 2 本で戸があく', () => gate.f === 1, 3);
    q.push(L1, [-14.55, 18], -1, 0); q.wait('レバーを戻すと戸が閉まる', () => gate.f === 0, 3);
    q.push(L1, [-17.85, 18], 1, 0); q.wait('押しなおすと戸があく', () => gate.f === 1, 3);
    move(q, POT, 0, 0, -21.5); q.place(0, 0, -20, 0); q.grab(POT); q.go([0, -22.8]); q.go([0, -23]); q.face(0, -25); q.p.grabEnd();
    q.wait('外へ落とした木箱が、ホールへ戻る', () => near(q.w.crates[POT].x, -5) && near(q.w.crates[POT].z, -5) && near(q.w.crates[POT].y, 0), 6);
    move(q, CHEST, 0, 0, -21); q.push(CHEST, [0, -19.8], 0, -1);
    q.wait('外へ落としたたんすが、中二階へ戻る', () => near(q.w.crates[CHEST].y, 2.4) && near(q.w.crates[CHEST].z, 23), 6);
    assert.equal(q.falls, 0);
  }

  { // ── できてはいけないこと ──
    const cannotHop = (q, from, to, what) => { q.go(from); q.face(...to); q.p.jump(); assert.throws(() => q.go(to, null, 4), /着けない/, what); };
    // 板に重しがなければ、台所へ入れない。レバーが 1 本なら、裏庭へ出られない。板張りがあれば、書斎へ入れない
    let q = fresh(); q.go([0, -5]);
    cannotHop(q, [7.6, 0], [10.6, 0], '重しなしで、台所へ入れた');
    // 自分で板にのって戸をあけ、板の東の角から走っても、戸が閉まるほうが早い
    q = fresh(); q.place(6.4, 0, -3.1); idle(q, 1); assert.equal(q.w.movers[DOOR].f, 1, '検査の前提：板にのっても、台所の戸があかない');
    cannotHop(q, [8.2, -0.5], [10.6, 0], '板から走って、閉まる前に台所へ入れた');
    q = fresh(); move(q, L1, -15.4, 0, 18); q.place(-3, 0, 5, 1); idle(q, 1);
    cannotHop(q, [-7.6, 5], [-10.6, 5], 'レバー 1 本で、裏庭へ出られた');
    q = fresh(); q.place(-5, 0, 19.5, 2); assert.throws(() => q.go([-11, 19.5], null, 4), /着けない/, '板張りを通りぬけた');
    // 木箱では、板張りは割れない（押しつけても、上に落としても）
    move(q, POT, -7.5, 0, 19.5); q.grab(POT); q.go([-8.1, 19.5]); q.face(-10, 19.5); q.p.grabEnd(); idle(q, 1);
    move(q, POT, -9, 4.5, 19.5); idle(q, 2); assert.ok(!broken(q), '木箱で、板張りが割れた');
    // 台所のたんすは、敷居で止まり、ホールへ出ない（引き戸にはさまれて動かなくなることもない）
    q = fresh(); q.place(16, 0, -3, 4); move(q, KCHEST, 13, 0, 0); move(q, POT, 20, 0, 6); q.friend = [5.5, 0, -4, 1];
    q.push(KCHEST, [14.2, 0], -1, 0); assert.ok(q.w.crates[KCHEST].x > 9.9, `台所のたんすが、敷居をこえた (x=${q.w.crates[KCHEST].x})`);
    // 台所の木箱を、棚の前に置いて踏み台にしても、棚には届かない（たんすがいる）
    move(q, KCHEST, 14, 0, 6); q.place(20.6, 0, -3); q.grab(POT); q.put(21.85, -3); idle(q, 0.3); q.place(q.w.crates[POT].x, 0.8, q.w.crates[POT].z); idle(q, 0.3);
    assert.ok(near(q.p.y, 0.8), `検査の前提：木箱の上に立っていない ${q.where()}`);
    q.face(23.5, -3); q.p.jump(); q.p.grabStart(); let top = 0;
    for (let i = 0; i < 3 * q.FPS; i++) { q.tick(1, 0); top = Math.max(top, q.p.y); }
    assert.ok(top < 3.8, `木箱の上から、棚に上がれてしまう (いちばん上 ${top.toFixed(2)})`);
    // 4 人でも：中二階に、たんす・木箱・仲間 3 人を積み、そのてっぺんから跳んでつかんでも、壁（12m）には届かない
    q = fresh(); q.place(-6, 2.4, 24.5, 2); move(q, CHEST, -7.5, 2.4, 24.5); move(q, POT, -7.5, 3.8, 24.5); idle(q, 0.2);
    q.w.extra = [0, 1, 2].map(k => ({ x0: -7.75, x1: -7.25, z0: 24.25, z1: 24.75, y0: 4.6 + 1.3 * k, y1: 5.9 + 1.3 * k, friend: true }));
    q.place(-7.5, 8.5, 24.5); idle(q, 0.3); assert.ok(near(q.p.y, 8.5), `検査の前提：積んだてっぺんに立っていない ${q.where()}`);
    for (const [fx, fz] of [[-1, 0], [0, 1]]) {
      q.place(-7.5, 8.5, 24.5); q.face(-7.5 + fx, 24.5 + fz); q.p.jump(); q.p.grabStart(); top = 0;
      for (let i = 0; i < 3 * q.FPS; i++) { q.tick(fx, fz); top = Math.max(top, q.p.y); }
      q.p.grabEnd(); assert.ok(top < 11.5, `積み上げたてっぺんから、壁の上に届いてしまう (いちばん上 ${top.toFixed(2)})`);
    }
    // 4 人でも：棚のレバーのつまみに木箱をのせ、仲間 2 人を積み、てっぺんの人が 4 人目を壁へ投げても（ページの投げ方：0.9m 上・0.75m 前、vy 6.5・横 4）、壁には届かない
    for (const [fx, fz] of [[0, -1], [1, 0]]) {
      q = fresh(); const lv = q.w.crates[L2]; move(q, POT, lv.x, 6, lv.z); q.place(23, 3.8, -2, 4); idle(q, 1);
      const base = q.w.crates[POT].y + 0.8; assert.ok(near(base, 5.2), `検査の前提：木箱がレバーの上にのらない (${base.toFixed(2)})`);
      q.place(lv.x + fx * 0.75, base + 2.6 + 0.9, lv.z + fz * 0.75); q.face(lv.x + fx * 2, lv.z + fz * 2);
      Object.assign(q.p, { vy: 6.5, kvx: fx * 4, kvz: fz * 4, grounded: false });
      q.w.extra = [0, 1].map(k => ({ x0: lv.x - 0.25, x1: lv.x + 0.25, z0: lv.z - 0.25, z1: lv.z + 0.25, y0: base + 1.3 * k, y1: base + 1.3 * k + 1.3, friend: true }));
      q.p.grabStart(); top = 0;
      for (let i = 0; i < 3 * q.FPS; i++) { q.tick(fx, fz); top = Math.max(top, q.p.y); }
      q.p.grabEnd(); assert.ok(top < 11.5, `棚の上の塔から投げられた仲間が、壁の上に届いてしまう (いちばん上 ${top.toFixed(2)})`);
    }
    // 2 人でも：壁や戸に向かって仲間を持ち上げても、仲間は壁の向こうに置かれない（持つ人の真上になる）。放しても、向こうへは出られない
    for (const [from, dx, to, what] of [[[-7, 2], -1, [-20, 5], 'ホールの西の壁'], [[7, 0], 1, [14, 0], '台所の戸']]) {
      q = fresh(); q.place(from[0], 0, from[1], 1); q.face(from[0] + dx * 5, from[1]); for (let i = 0; i < 2 * q.FPS; i++) q.tick(dx, 0);
      const [hx, hy, hz] = q.w.heldSpot(q.p.x, q.p.z, q.p.y, q.p.ry);
      assert.ok(Math.abs(hx) < 8.7, `${what}に向かって持ち上げた仲間が、壁の中に置かれた (x=${hx.toFixed(2)})`);
      q.place(hx, hy, hz); assert.throws(() => q.go(to, null, 4), /着けない/, `持ち上げられて放された仲間が、${what}の向こうへ出られた`);
    }
  }
};

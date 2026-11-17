// ステージ 9「そよかぜ浮島」を 1 人で解く手順：東（ジップライン）→ 西（ターザンロープ）→ 南（帆のいかだ）→ 北東（ふうせん）。どこもレバーを押してワープ台で戻る → 北の橋 → ゴール
// そのあと、別の順番・しくじり（途中で放す・いかだから箱を落とす・箱を置き去りにする）から戻れること、渡れてはいけない所（4 人で積んで投げる・せんぷうき箱・2 人でふうせん）を確かめる
export default (b, { assert, fresh }) => {
  const ZIP = 0, ROPE = 1, BALLOON = 2;                                               // ropes の番号
  const FAN = 0, LE = 1, LW = 2, LS = 3, LN = 4;                                       // 箱の番号
  const POND = 0, RAFT = 1, BRIDGE = 2;                                               // 動く床の番号
  const near = (a, v, e = 0.05) => Math.abs(a - v) < e;
  const idle = (q, s) => { for (let i = 0; i < s * q.FPS; i++) q.tick(); };
  const on = (q, box) => q.p.grounded && q.w.groundBox(q.p.x, q.p.z, q.p.y) === q.w.stage.boxes[box];
  // レバー i を、押しきるまで（max の端の信号が押されるまで）押す
  const lever = (q, i) => { const c = q.w.crates[i]; q.push(i, [c.x - 0.95, c.z], 1, 0); assert.ok(q.w.plates[i - 1].down, `レバー ${i} を押しきれない (x=${c.x.toFixed(2)})`); };
  // ワープ台 (x, z) に乗って、広場（セーブ地点 0 のそば）へ戻る
  const warp = (q, x, z) => { q.go([x, z], () => q.p.y > -0.1 && Math.hypot(q.p.x, q.p.z + 2) < 3, 10); idle(q, 0.3); assert.ok(near(q.p.y, 0) && q.p.cp === 0, `ワープ台で広場へ戻らない ${q.where()}`); };

  // 東：ジップラインのとってにつかまり、先の端（東の島の上）まで行ってから放す
  const east = q => {
    q.hang(ZIP, () => q.w.ropes[ZIP].f === 1);
    idle(q, 0.2); assert.ok(on(q, 1), `ジップラインで東の島に着かない ${q.where()}`);
    lever(q, LE); warp(q, 36, -1.5);
  };
  // 西：ロープにつかまり、向こうの端（ふれが止まりかけた所）で放す
  const west = q => {
    const r = q.w.ropes[ROPE];
    q.go([-11.8, 0]); q.hang(ROPE, () => r.a < -0.9 && r.av > -0.3);
    q.wait('西の島に下りる', () => q.p.grounded, 3); assert.ok(on(q, 2), `ロープで西の島に着かない ${q.where()}`);
    lever(q, LW); warp(q, -34, 2.5);
  };
  // 南：いかだに乗り、まん中のせんぷうき箱を北の縁に置く。南の島に着いたら下りる
  const south = q => {
    const m = q.w.movers[RAFT];
    q.go([0, -11.5]); q.grab(FAN); q.go([0, -13.95]); q.face(0, 0); q.p.grabEnd();
    q.wait('いかだが南の島に着く', () => near(m.box.z0, -30, 0.1) && !m.go, 15);
    q.go([0, -34]); assert.ok(on(q, 3), `いかだで南の島に着かない ${q.where()}`);
    lever(q, LS); warp(q, 4, -42);
  };
  // 北東：ふうせんにつかまって上がり、風で北東の島の上へ流れたら放す
  const northeast = q => {
    q.hang(BALLOON, () => q.p.x > 26.6 && q.p.z > 26.6);
    q.wait('北東の島に下りる', () => q.p.grounded, 3); assert.ok(on(q, 4), `ふうせんで北東の島に着かない ${q.where()}`);
    lever(q, LN); warp(q, 29.5, 24.5);
  };
  const exit = q => { q.wait('北の橋があがる', () => q.w.movers[BRIDGE].f === 1, 4); q.go([0, 13]); q.go([0, 31]); };

  // ── 1 人の基本の道 ──
  b.go([0, -2]); idle(b, 0.5);
  assert.ok(b.w.movers[BRIDGE].f === 0 && b.w.plates.every(k => !k.down), 'はじめから北の橋があがっているか、レバーが押されている');
  east(b); assert.equal(b.w.movers[BRIDGE].f, 0, 'レバー 1 本で北の橋があがった');
  west(b); south(b); northeast(b); exit(b);

  { // ── 別の順番。しくじっても戻れる ──
    const q = fresh(), { w, p } = q, z = w.ropes[ZIP], r = w.ropes[ROPE], bl = w.ropes[BALLOON], m = w.movers[RAFT], f = w.crates[FAN];
    // ジップラインを途中で放すと落ちて、広場からやり直し。とっては出発点へ戻り、もう一度つかめる
    q.hang(ZIP, () => z.f > 0.4); q.wait('落ちる', () => q.falls === 1, 6); q.wait('とってが戻る', () => z.f === 0, 6);
    assert.equal(p.cp, 0, 'ジップラインから落ちても、広場からやり直しにならない');
    // ロープを、ふれの途中（下の端）で放すと、すき間に落ちる。ロープは元の角度へ戻る
    q.go([-11.8, 0]); q.hang(ROPE, () => r.a < 0); q.wait('落ちる', () => q.falls === 2, 6); q.wait('ロープが戻る', () => r.a === r.rest, 4);
    // ふうせんを、風に流されている途中で放すと落ちる。ふうせんは元の場所へ戻る
    q.hang(BALLOON, () => p.x > 18); q.wait('落ちる', () => q.falls === 3, 6); q.wait('ふうせんが戻る', () => near(bl.at[1], bl.y) && bl.v.every(v => v === 0), 15);
    // いかだのせんぷうき箱を、池に落とす：沈んで、いかだのまん中へ戻る
    q.go([0, -11.5]); q.grab(FAN); q.go([-1.1, -14]); q.face(-5, -14); p.grabEnd();
    assert.ok(f.x < -1.6, `検査の前提：せんぷうき箱を池の上に放していない (${f.x})`);
    q.go([0, -10]); q.wait('池に落としたせんぷうき箱が、いかだへ戻る', () => f.on === m.box && near(f.x, 0) && near(f.z, -14), 3);
    // 南の島へ行き、せんぷうき箱を島に置き去りにして、ワープで戻る：だれも乗らないまま 8 秒で、いかだも箱も戻る
    q.go([0, -11.5]); q.grab(FAN); q.go([0, -13.95]); q.face(0, 0); p.grabEnd();
    q.wait('いかだが南の島に着く', () => near(m.box.z0, -30, 0.1) && !m.go, 15);
    q.grab(FAN); q.go([2, -33]); q.put(4, -33); lever(q, LS); warp(q, 4, -42);
    q.wait('いかだとせんぷうき箱が、元の場所へ戻る', () => m.o[2] === 0 && f.on === m.box && near(f.x, 0) && near(f.z, -14), 10);
    // そのあとも、ふつうに解ける（北東 → 西 → 東）
    northeast(q); west(q); east(q); exit(q);
    assert.ok(p.goal && q.falls === 3, `しくじったあとで、ゴールに着かない（${q.falls} 回落ちた） ${q.where()}`);
  }

  { // ── 手がふさがっていると、とって・ロープ・ふうせんにはつかまれない（荷物は運べない） ──
    const q = fresh(), { w, p } = q;
    q.go([0, -11.5]); q.grab(FAN);
    for (const [i, at] of [[ZIP, [11.4, -4]], [ROPE, [-11.8, 0]], [BALLOON, [10.5, 10.5]]]) {
      q.go(at); p.grabStart(); p.jump(); idle(q, 1);                                   // 「つかむ」を押しても、跳んでも
      assert.ok(p.rope == null && p.carry === w.crates[FAN], `箱を持ったまま、点 ${i} につかまれた`);
    }
  }

  { // ── 2 人でふうせんにつかまると、重くて上がらない（1 人が放すと、また上がる） ──
    const q = fresh(), bl = q.w.ropes[BALLOON];
    q.hang(BALLOON); idle(q, 2); const y1 = bl.at[1];
    bl.others = [[q.p.x + 0.45, q.p.y, q.p.z, 1]]; idle(q, 4);                         // 仲間が、あとから同じひもにつかまる
    assert.ok(near(bl.at[1], bl.y, 0.01) && y1 > bl.y + 1, `2 人でつかまっても、ふうせんが下がらない (${bl.at[1].toFixed(2)})`);
    bl.others = []; idle(q, 3); assert.ok(bl.at[1] > bl.y + 3, 'ひとりになっても、ふうせんが上がらない');
    q.p.grabEnd();
  }

  { // ── 渡れてはいけない所 ──
    // 4 人で：仲間 2 人を積んだてっぺん（広場の縁。せんぷうき箱をふみ台にしても）から投げても（ページの投げ方：0.9m 上・0.75m 前、vy 6.5・横 4）、離れ島にもゴールにも届かない
    const top = 0.8 + 2.6;
    for (const [x, z, dx, dz, box] of [[11.25, -4, 1, 0, 1], [-11.25, 0, -1, 0, 2], [5.5, -11.25, 0, -1, 3], [0, -11.25, 0, -1, 3], [11.25, 11.25, 0.7, 0.7, 4], [0, 11.25, 0, 1, 5], [-11.25, -11.25, 0, -1, 3]]) {
      const q = fresh();
      q.place(x + dx * 0.75, top + 0.9, z + dz * 0.75); q.face(x + dx * 9, z + dz * 9); Object.assign(q.p, { vy: 6.5, kvx: dx * 4, kvz: dz * 4, grounded: false }); q.p.grabStart();
      let land = false;
      for (let i = 0; i < 8 * q.FPS && !land; i++) { q.tick(dx, dz); land = on(q, box) || !!q.p.hang && q.p.hang.b === q.w.stage.boxes[box]; if (q.p.y < -11) break; }
      assert.ok(!land, `積んだてっぺんから投げられた仲間が、島 ${box} に届いた ${q.where()}`);
    }
    // せんぷうき箱の風で浮いて流れても、届かない（高い所の風にも入らない）
    for (const [x, z, dx, dz, box] of [[11.4, -4, 1, 0, 1], [-11.4, 0, -1, 0, 2], [11.4, 11.4, 0.7, 0.7, 4], [0, 11.4, 0, 1, 5]]) {
      const q = fresh(), { w, p } = q, f = w.crates[FAN];
      Object.assign(f, { x: x - dx * 1.5, y: 0, z: z - dz * 1.5, vy: 0 }); w.fit(f);
      Object.assign(w.ropes[BALLOON], { y: 99, b: [0, 99, 0] }); q.tick();            // 検査のために、ふうせんはどけておく（北東の角では、跳んだ手がふうせんのひもに届く）
      q.place(x - dx * 2.6, 0, z - dz * 2.6); q.grab(FAN); q.put(x, z); q.wait('風が出る', () => w.winds.some(k => k.fan === f && k.active), 3);
      q.face(f.x, f.z); p.jump(); p.grabStart(); let top = 0;
      for (let i = 0; i < 10 * q.FPS; i++) { q.tick(dx, dz); if (q.falls) break; top = Math.max(top, p.y); assert.ok(!on(q, box), `せんぷうき箱で、島 ${box} へ渡れた ${q.where()}`); }
      assert.ok(top > 3.5 && top < 8, `検査の前提：せんぷうき箱で浮いていない／高い所の風に入った（${top.toFixed(2)}m）`);
    }
    // 北の橋なしには、ゴールへ渡れない
    const q = fresh(); assert.throws(() => q.go([0, 27], null, 10), /着けない/, '北の橋なしで、ゴールへ渡れた');
  }
};

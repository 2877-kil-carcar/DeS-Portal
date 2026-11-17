// つないだステージ E「かぜのり群島」のつなぎ（みずうみの岩）を 1 人で解く手順。前半（s9.mjs）が北の島のゴールだった所で終わったところから始める：
// いかだに乗り、まん中のせんぷうき箱を南の縁に置く（北へ進む）→ 岩に下りる → ふうせんにつかまり、風で港の広場の上へ流れたら放す。
// 番号はつなぎの中だけで数え、座標はステージ全体のもの（tools/test-adventure.mjs の view がそろえる）。fresh() は、つなぎの入口（北の島のセーブ地点）から始める。
// そのあと fresh() で：しくじり（ふうせんを途中で放す・せんぷうき箱を岩に置き去り）から戻れること、できてはいけないこと（4 人で積んで投げる・せんぷうき箱・2 人でふうせん）
export default (b, { assert, fresh }) => {
  const RAFT = 1, FAN = 0, BALLOON = 0, ROCK = 0;
  const near = (a, v, e = 0.05) => Math.abs(a - v) < e;
  const idle = (q, s) => { for (let i = 0; i < s * q.FPS; i++) q.tick(); };
  const onRock = q => q.p.grounded && q.w.groundBox(q.p.x, q.p.z, q.p.y) === q.w.stage.boxes[ROCK];
  const harbor = q => q.p.grounded && near(q.p.y, 0) && q.p.z > 74.3 && Math.abs(q.p.x) < 15;   // 港の広場（後半の広場 z 74〜104）
  // いかだで岩へ
  const sail = q => {
    const m = q.w.movers[RAFT];
    q.go([0, 33.6]); q.grab(FAN, [0, 34.6]); q.go([0, 36]); q.face(0, 30); q.p.grabEnd();
    q.wait('いかだが岩に着く', () => near(m.box.z1, 52, 0.1) && !m.go, 15);
    q.go([0, 55.5]); assert.ok(onRock(q), `いかだで岩に着かない ${q.where()}`);
  };
  // ふうせんで港の広場へ
  const fly = q => { q.hang(BALLOON, () => q.p.z > 79.6); q.wait('港の広場に下りる', () => q.p.grounded, 4); assert.ok(harbor(q) && q.falls === 0, `ふうせんで港の広場に着かない ${q.where()}`); };

  // ── 1 人の基本の道 ──
  b.go([0, 30]); assert.equal(b.p.cp, 0, 'つなぎの入口のセーブ地点にふれていない');
  sail(b); assert.equal(b.p.cp, 1, '岩のセーブ地点にふれていない'); fly(b);

  { // ── 岩の南の縁（いかだのすぐそば）で次の仲間を待っていても、いかだは北の島へ戻る ──
    const q = fresh(), m = q.w.movers[RAFT];
    sail(q); q.go([0, 52.5]); q.place(0, 0, 52.25);
    q.wait('岸で待つ人がいても、いかだが北の島へ戻る', () => m.o[2] === 0, 12);
    assert.ok(onRock(q), `検査の前提：岩の縁に立っていない ${q.where()}`);
  }

  { // ── しくじっても戻れる ──
    const q = fresh(), { w, p } = q, m = w.movers[RAFT], f = w.crates[FAN], bl = w.ropes[BALLOON];
    // せんぷうき箱を岩に置き去りにすると、いかだが北の島へ戻るとき（だれも乗らないまま 8 秒）、箱もいかだへ戻る
    sail(q); q.grab(FAN); q.put(3, 57);
    q.wait('いかだとせんぷうき箱が、北の島へ戻る', () => m.o[2] === 0 && f.on === m.box && near(f.z, 35.6), 12);
    // ふうせんを、みずうみの上で放すと落ちて、岩からやり直し。ふうせんは岩へ戻る
    q.hang(BALLOON, () => p.z > 64); q.wait('落ちる', () => q.falls === 1, 6); q.wait('岩に下りる', () => p.grounded, 20);
    assert.ok(onRock(q), `ふうせんから落ちても、岩からやり直しにならない ${q.where()}`);
    // 岩のセーブ地点に空から落ちてくる間、北（ふうせんのほう）へ倒しつづけても、風で流されて岩から落ちない
    for (let k = 0; k < 6; k++) { p.respawn(); for (let i = 0; i < 4 * q.FPS && !p.grounded; i++) q.tick(0, 1); assert.ok(onRock(q) && q.falls === 1, `岩のセーブ地点に落ちてくる間に、岩から落ちた ${q.where()}`); }
    q.wait('ふうせんが戻る', () => near(bl.at[1], bl.y) && bl.v.every(v => v === 0), 15);
    // 2 人でつかまると重くて上がらない。ひとりになると上がる
    q.hang(BALLOON); idle(q, 2); bl.others = [[p.x + 0.45, p.y, p.z, 1]]; idle(q, 4);
    assert.ok(near(bl.at[1], bl.y, 0.01), `2 人でつかまっても、ふうせんが下がらない (${bl.at[1].toFixed(2)})`);
    bl.others = []; q.wait('港の上へ流れる', () => p.z > 79.6, 30); p.grabEnd(); q.wait('港の広場に下りる', () => p.grounded, 4);
    assert.ok(harbor(q) && q.falls === 1, `ひとりになったふうせんで、港へ着かない ${q.where()}`);
  }

  { // ── できてはいけないこと ──
    // いかだなしには、岩へ渡れない
    let q = fresh(); assert.throws(() => q.go([0, 54], null, 10), /着けない/, 'いかだなしで、岩へ渡れた');
    // 4 人で：仲間 2 人とせんぷうき箱を積んだてっぺんから投げても（ページの投げ方：0.9m 上・0.75m 前、vy 6.5・横 4）、北の島から岩へ、岩から港へ届かない
    for (const [x, z, land] of [[0, 33.75, onRock], [3, 33.75, onRock], [0, 59.75, harbor], [4, 59.75, harbor]]) {
      q = fresh();
      q.place(x, 0.8 + 2.6 + 0.9, z + 0.75); q.face(x, z + 9); Object.assign(q.p, { vy: 6.5, kvz: 4, grounded: false }); q.p.grabStart();
      let hit = false;
      for (let i = 0; i < 8 * q.FPS && !hit; i++) { q.tick(0, 1); hit = land(q) || !!q.p.hang && q.p.y > -1; if (q.p.y < -11) break; }
      assert.ok(!hit, `積んだてっぺんから投げられた仲間が、向こう岸に届いた (z ${z}) ${q.where()}`);
    }
    // せんぷうき箱の風で浮いて北へ流れても、届かない（岩の上の高い所の風にも入らない）
    for (const [z, land] of [[33.6, onRock], [59.6, harbor]]) {
      q = fresh(); const { w, p } = q, f = w.crates[FAN];
      w.movers[RAFT].idle = -100;                                                      // 検査のあいだ、せんぷうき箱がいかだへ戻らないように
      Object.assign(w.ropes[BALLOON], { y: 99, b: [0, 99, 0] });                        // 検査のために、ふうせんはどけておく
      Object.assign(f, { x: 0, y: 0, z: z - 1.5, vy: 0 }); w.fit(f); q.place(0, 0, z - 2.6); q.tick();
      q.grab(FAN); q.put(0, z); q.wait('風が出る', () => w.winds.some(k => k.fan === f && k.active), 3);
      q.face(f.x, f.z); p.jump(); p.grabStart(); let top = 0;
      for (let i = 0; i < 10 * q.FPS; i++) { q.tick(0, 1); if (q.falls) break; top = Math.max(top, p.y); assert.ok(!land(q), `せんぷうき箱で、向こう岸へ渡れた ${q.where()}`); }
      assert.ok(top > 3.5 && top < 8, `検査の前提：せんぷうき箱で浮いていない／高い所の風に入った（${top.toFixed(2)}m）`);
      if (land !== harbor) continue;
      // せんぷうき箱で浮いたてっぺんから、持っている仲間を北へ投げても（0.9m 上・風の柱のすぐ北、vy 6.5・横 4）、高い所の風に入らず、港へ届かない
      q.place(0, top + 0.9, f.z + 1.1); q.face(0, 80); Object.assign(p, { vy: 6.5, kvz: 4, grounded: false }); p.grabStart();
      for (let i = 0; i < 8 * q.FPS && p.y > -11; i++) {
        q.tick(0, 1);
        assert.ok(!w.windAt(p.x, p.y, p.z)?.push && !harbor(q) && !p.hang, `せんぷうき箱と投げで、高い所の風に入った／港へ届いた ${q.where()}`);
      }
    }
  }
};

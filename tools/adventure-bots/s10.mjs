// ステージ 10「くもまの見はらし港」を 1 人で解く手順：南東（ジップラインを島の上で放す）→ 西（ロープを 2 本乗りつぐ）→ 北東（水門で水を上げ、帆のいかだで沈んだ壁をこえる）
// → 北西（風のレバーを押して、ふうせん）。どこもレバーを押してワープ台で戻る → 北の橋 → ジップラインで岩へ → ロープでゴールへ
// そのあと、しくじり（放しそこね・水を上げない・せんぷうき箱を水路に落とす・風なしでふうせん）から戻れること、渡れてはいけない所（4 人で積んで投げる・せんぷうき箱）を確かめる
// つないだステージ E の後半としても動く（view ごしなので、座標は p と箱から読み、ropes の点の場所 at は読まない）
export default (b, { assert, fresh }) => {
  const ZIP = 0, ROPE1 = 1, ROPE2 = 2, BALLOON = 3, ZIP2 = 4, ROPE3 = 5;              // ropes の番号
  const FAN = 0, LSE = 1, LSW = 2, LE = 3, LNW = 4, WIND = 5;                         // 箱の番号
  const GATE = 0, RAFT = 1, BRIDGE = 2;                                               // 動く床の番号
  const near = (a, v, e = 0.05) => Math.abs(a - v) < e;
  const idle = (q, s) => { for (let i = 0; i < s * q.FPS; i++) q.tick(); };
  const on = (q, box) => q.p.grounded && q.w.groundBox(q.p.x, q.p.z, q.p.y) === q.w.stage.boxes[box];
  const lever = (q, i) => { const c = q.w.crates[i]; q.push(i, [c.x - 0.95, c.z], 1, 0); assert.ok(q.w.plates[i - 1].down, `レバー ${i} を押しきれない (x=${c.x.toFixed(2)})`); };
  // ワープ台 (x, z) に乗って、広場（セーブ地点 0 のそば）へ戻る
  const warp = (q, x, z) => { q.go([x, z], () => q.p.y > -0.1 && Math.hypot(q.p.x, q.p.z + 7) < 3, 10); idle(q, 0.3); assert.ok(near(q.p.y, 0) && q.p.cp === 0, `ワープ台で広場へ戻らない ${q.where()}`); };
  const swung = (q, i, s) => { const r = q.w.ropes[i]; return () => r.a * s > 0.85 && r.av * s < 0.3; };   // ロープ i が、s の向きの端まで来た
  const landed = (q, box, what) => { q.wait(what, () => q.p.grounded, 4); assert.ok(on(q, box), `${what}：着いた所がちがう ${q.where()}`); };

  // 南東：とってが島の上を通るとき（島の西の縁を、とってがこえたら）放す。前へ飛んで島に下りる
  const southeast = q => { q.hang(ZIP, () => q.p.x > 29); landed(q, 1, 'ジップラインを放して南東の島へ'); lever(q, LSE); warp(q, 39.5, -15.5); };
  // 西：1 本目で柱へ、柱の南の縁で 2 本目につかまり、南西の島へ
  const west = q => {
    q.go([-14.8, 0]); q.hang(ROPE1, swung(q, ROPE1, -1)); landed(q, 2, 'ロープで西の柱へ');
    q.go([-33.26, -1.2]); q.hang(ROPE2, swung(q, ROPE2, -1)); landed(q, 3, 'ロープで南西の島へ');
    lever(q, LSW); warp(q, -31.6, -23.4);
  };
  // 北東：ハンドルで水を上げ、いかだのせんぷうき箱を西の縁に置く（東へ進む）。沈んだ壁をこえて、東の島へ
  const northeast = q => {
    const m = q.w.movers[RAFT];
    q.crank(0, () => q.w.movers[GATE].f === 1); assert.ok(near(m.box.y1, 0, 0.01), `水を上げても、いかだが岸の高さまで上がらない (${m.box.y1})`); 
    q.go([14.4, 9]); q.grab(FAN, [16.7, 9.1]); q.go([17, 8]); q.face(10, 8); q.p.grabEnd();
    q.wait('いかだが東の島に着く', () => m.o[0] > 25 && !m.go, 20);
    q.go([46, 8]); assert.ok(on(q, 5), `いかだで東の島に着かない ${q.where()}`);
    lever(q, LE); warp(q, 50, 5);
  };
  // 北西：風のレバーを押しきってから、ふうせんにつかまる。北西の島の上で放す
  const northwest = q => {
    lever(q, WIND); q.hang(BALLOON, () => q.p.x < -30.6 && q.p.z > 30.6); landed(q, 6, 'ふうせんで北西の島へ');
    lever(q, LNW); warp(q, -28.5, 28.5);
  };
  // しめくくり：北の橋 → ジップラインで岩へ → ロープでゴールの島へ
  const finale = q => {
    q.wait('北の橋があがる', () => q.w.movers[BRIDGE].f === 1, 4); q.go([0, 16]); q.go([0, 33]);
    q.hang(ZIP2, () => q.w.ropes[ZIP2].f === 1); idle(q, 0.2); assert.ok(on(q, 8), `ジップラインで岩に着かない ${q.where()}`);
    q.go([0, 63.2]); q.hang(ROPE3, swung(q, ROPE3, 1)); landed(q, 9, 'ロープでゴールの島へ');
    q.go([0, 83]);
  };

  // ── 1 人の基本の道 ──
  b.go([0, -7]); idle(b, 0.5);
  assert.ok(b.w.movers[BRIDGE].f === 0 && b.w.plates.every(k => !k.down) && !b.w.winds[0].active, 'はじめから北の橋があがっているか、レバーが押されているか、北西の風が吹いている');
  southeast(b); west(b); northeast(b); northwest(b); finale(b);

  { // ── しくじっても戻れる ──
    const q = fresh(), { w, p } = q, m = w.movers[RAFT], f = w.crates[FAN], z = w.ropes[ZIP];
    // ジップラインを放しそこねると、何もない空の先の端まで行く。そこで放すと落ちて、広場からやり直し。とっては戻る
    q.hang(ZIP, () => z.f === 1); q.p.grabEnd(); q.wait('落ちる', () => q.falls === 1, 6); q.wait('とってが戻る', () => z.f === 0, 10);
    // 早く放しすぎても落ちる
    q.hang(ZIP, () => q.p.x > 22); q.wait('落ちる', () => q.falls === 2, 6); q.wait('とってが戻る', () => z.f === 0, 10);
    // 1 本目のロープで柱へ渡ったあと、2 本目を途中で放すと落ちて、柱からやり直し
    q.go([-14.8, 0]); q.hang(ROPE1, swung(q, ROPE1, -1)); landed(q, 2, 'ロープで西の柱へ');
    q.go([-33.26, -1.2]); q.hang(ROPE2, () => w.ropes[ROPE2].a < 0.2); q.wait('落ちる', () => q.falls === 3, 6);
    q.wait('柱に下りる', () => q.p.grounded, 20); assert.ok(on(q, 2), `2 本目のロープから落ちても、柱からやり直しにならない ${q.where()}`);
    q.hang(ROPE2, swung(q, ROPE2, -1)); landed(q, 3, 'ロープで南西の島へ'); lever(q, LSW); warp(q, -31.6, -23.4);
    // 水を上げずにいかだで出ると、沈んだ壁で止まる（壁に下りても、東の島には届かない）。下りると、8 秒でいかだもせんぷうき箱も戻る
    q.go([14.6, 9]); q.grab(FAN, [16.7, 9.1]); q.go([17, 8]); q.face(10, 8); p.grabEnd();
    q.wait('いかだが沈んだ壁で止まる', () => m.o[0] > 1 && !m.go, 6);
    assert.ok(near(m.box.x1, 20.5, 0.06), `いかだが沈んだ壁の手前で止まらない (x1=${m.box.x1})`);
    q.go([21, 8]); assert.ok(on(q, 4), `沈んだ壁に下りられない ${q.where()}`);
    for (let i = 0; i < 8 * q.FPS && q.falls === 3; i++) { if (q.p.grounded) q.p.jump(); q.tick(1, 0); assert.ok(!on(q, 5), '沈んだ壁から、東の島へ渡れた'); }   // 東へ跳んでも、水に落ちる
    assert.equal(q.falls, 4, '沈んだ壁から東へ跳んでも、水に落ちない'); q.wait('広場に下りる', () => q.p.grounded, 4);
    q.wait('いかだが戻る', () => m.o[0] === 0 && f.on === m.box && near(f.x, m.box.x0 + 1.5), 12);
    // せんぷうき箱を水路に落としても（浮かぶ。水が引くと底へ沈む）、だれも乗らないまま 8 秒で、いかだの上へ戻る
    q.crank(0, () => w.movers[GATE].f === 1); q.go([14.4, 9]); q.grab(FAN, [16.7, 9.1]); q.go([17.5, 9.3]); q.face(17.5, 20); p.grabEnd(); idle(q, 0.5);
    assert.ok(f.z > 9.5 && f.on !== m.box, `検査の前提：せんぷうき箱を水路に落としていない (${f.x}, ${f.z})`);
    q.go([14, 8]); q.wait('水路に落としたせんぷうき箱が、いかだへ戻る', () => f.on === m.box && near(f.x, m.box.x0 + 1.5) && near(f.z, 8), 12);
    // 北西：風のレバーを押さないと、ふうせんは上がるだけ。手を放すと広場に下りる
    q.hang(BALLOON, () => w.ropes[BALLOON].v[1] === 0 && q.p.y > 7); assert.ok(near(q.p.x, w.ropes[BALLOON].x, 0.01), '風がないのに、ふうせんが流れた');
    q.wait('広場に下りる', () => q.p.grounded, 4); assert.ok(on(q, 0), `風なしのふうせんから、広場に下りない ${q.where()}`);
    // そのあとも、ふつうに解ける
    southeast(q); northeast(q); northwest(q); finale(q);
    assert.ok(p.goal && q.falls === 4, `しくじったあとで、ゴールに着かない（${q.falls} 回落ちた） ${q.where()}`);
  }

  { // ── 渡れてはいけない所 ──
    const put = (q, i, x, y, z) => { const c = q.w.crates[i]; Object.assign(c, { x, y, z, vy: 0, moved: true }); q.w.fit(c); };   // 検査のために、箱をその場所へ置く
    // 4 人で：仲間 2 人を積んだてっぺんから投げても（せんぷうき箱をふみ台にしても）、離れ島にも北の島にも届かない。北の島・岩の縁からも（ジップラインでは箱を運べない）
    for (const [x, y, z, dx, dz, box, under] of [[14.25, 0, -12, 1, -0.35, 1, 0.8], [-14.25, 0, 0, -1, 0, 2, 0.8], [-14.25, 0, -14.25, -0.7, -0.7, 3, 0.8], [-14.25, 0, 14.25, -0.7, 0.7, 6, 0.8],
      [0, 0, 14.25, 0, 1, 7, 0.8], [0, 0, 36.25, 0, 1, 8, 0.8], [0, 0, 63.25, 0, 1, 9, 0], [-32, -1, -1.25, 0, -1, 3, 0], [14.25, 0, 12, 1, 0, 5, 0.8]]) {
      const q = fresh();
      q.place(x + dx * 0.75, y + under + 2.6 + 0.9, z + dz * 0.75); q.face(x + dx * 9, z + dz * 9); Object.assign(q.p, { vy: 6.5, kvx: dx * 4, kvz: dz * 4, grounded: false }); q.p.grabStart();
      let land = false;
      for (let i = 0; i < 8 * q.FPS && !land; i++) { q.tick(dx, dz); land = on(q, box) || !!q.p.hang && q.p.hang.b === q.w.stage.boxes[box]; if (q.p.y < -11) break; }
      assert.ok(!land, `積んだてっぺんから投げられた仲間が、島 ${box} に届いた ${q.where()}`);
    }
    // せんぷうき箱の風で浮いて流れても、届かない（北西の高い所の風にも入らない）
    for (const [x, y, z, dx, dz, box] of [[14.4, 0, -12, 1, 0, 1], [-14.4, 0, 0, -1, 0, 2], [-14.4, 0, 14.4, -0.7, 0.7, 6], [0, 0, 14.4, 0, 1, 7], [0, 0, 36.4, 0, 1, 8]]) {
      const q = fresh(), { w, p } = q, f = w.crates[FAN];
      w.movers[RAFT].idle = -100;                                                      // 検査のあいだ、せんぷうき箱がいかだへ戻らないように
      put(q, WIND, -8.4, 0, 13); put(q, FAN, x - dx * 1.5, y, z - dz * 1.5); q.place(x - dx * 2.6, y, z - dz * 2.6); q.tick();   // 北西の風も吹かせておく
      Object.assign(w.ropes[BALLOON], { y: 99, b: [0, 99, 0] });                        // 検査のために、ふうせんはどけておく（跳んだ手がひもに届く）
      q.grab(FAN); q.put(x, z); q.wait('風が出る', () => w.winds.some(k => k.fan === f && k.active), 3);
      q.face(f.x, f.z); p.jump(); p.grabStart(); let top = 0;
      for (let i = 0; i < 10 * q.FPS; i++) { q.tick(dx, dz); if (q.falls) break; top = Math.max(top, p.y - y); assert.ok(!on(q, box), `せんぷうき箱で、島 ${box} へ渡れた ${q.where()}`); }
      assert.ok(top > 3.5 && top < 8, `検査の前提：せんぷうき箱で浮いていない／高い所の風に入った（${top.toFixed(2)}m）`);
    }
    // 北の橋なしには、北の島へ渡れない
    const q = fresh(); assert.throws(() => q.go([0, 30], null, 10), /着けない/, '北の橋なしで、北の島へ渡れた');
  }
};

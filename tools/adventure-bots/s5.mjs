// ステージ 5「ほしぞら天文台」を 1 人で解く手順：西（ハンドルの橋）→ 東（箱を踏み台に、ハンドルのリフト）→ 南西（おもさ板とカタパルト）→ 北の橋 → 塔のリフト → 段の橋 → ゴール
// そのあと、別の道（南東のつばさ・扇風機・あみ・柱の板）、かぞえ錠の組み合わせ、仲間との答え、わざとまずい順番、渡れてはいけない所を確かめる
export default (b, { assert, fresh }) => {
  const isles = { SW1: 9, SM: 11, SF: 13 };                                           // 南西の島・南の島・西の島（boxes の番号）
  // のこぎり s の通り道の手前 from で待ち、のこぎりが横切る所（通り道の向き axis の位置 at）から遠ざかったとたんに、to へ渡る
  const pass = (x, s, axis, at, from, to) => {
    const box = x.w.movers[s].box, mid = () => axis === 'z' ? (box.z0 + box.z1) / 2 : (box.x0 + box.x1) / 2;
    x.go(from); let was = mid();
    x.wait(`のこぎり ${s} が遠ざかる`, () => { const v = mid(), away = Math.abs(v - at) > 2.7 && Math.abs(was - at) <= 2.7; was = v; return away; }, 10);
    x.go(to);
  };
  const socketed = (x, i) => { x.put(x.w.plates[i].x, x.w.plates[i].z); x.wait(`ソケット ${i} にでんちが入る`, () => x.w.plates[i].down, 3); };
  // 台（カタパルト・大砲）に乗って飛び、着いた足場が boxes[box] か確かめる
  const fly = (x, pad, box, what) => {
    x.go(pad, () => !x.p.grounded && x.p.vy > 3, 8); x.wait('着地', () => x.p.grounded, 6);
    if (box != null) assert.equal(x.w.groundBox(x.p.x, x.p.z, x.p.y), x.w.stage.boxes[box], `${what} ${x.where()}`);
  };
  const home = (x, i) => x.wait(`箱 ${i} が元の場所へ戻る`, () => { const c = x.w.crates[i]; return c.x === c.home.x && c.z === c.home.z && c.on; }, 4);
  // 横風の橋：風が吹いている間は待ち、やんだとたんに渡る
  const calm = (x, from, to) => { const k = x.w.winds[0]; x.go(from); x.wait('横風が吹く', () => k.active, 5); x.wait('横風がやむ', () => !k.active, 5); x.go(to); };
  // 検査のために、でんちをソケットに入れておく
  const plug = (x, cells) => { for (const [i, s] of cells) { const c = x.w.crates[i], k = x.w.plates[s]; Object.assign(c, { x: k.x, y: k.y, z: k.z, vy: 0 }); x.w.fit(c); } x.tick(); };
  // 渡れてはいけない：go が着けずに失敗すること
  const cannot = (x, what, target, seconds = 8) => assert.throws(() => x.go(target, null, seconds), /着けない/, what);
  // せんぷうき箱 4 を spot に置き、その風で浮いて、「つかむ」を押したまま (dx, dz) へ流れる。bad（着いてはいけない所に立った）にならないこと
  const drift = (x, spot, dx, dz, bad, what) => {
    const { p, w } = x, f = w.crates[4];
    x.put(...spot); x.wait('風が出る', () => w.winds.some(k => k.fan === f && k.active), 3);
    const y0 = p.y; let top = y0;
    x.face(f.x, f.z); p.jump(); p.grabStart();
    for (let i = 0; i < 10 * x.FPS; i++) { x.tick(dx, dz); top = Math.max(top, p.y); assert.ok(!bad(), `${what} ${x.where()}`); if (x.falls) break; }
    p.grabEnd(); assert.ok(top > y0 + 4.5, `検査の前提：扇風機の風で浮いていない（${(top - y0).toFixed(2)}m）`);
  };

  { // ── 1 人の基本の道（W → E → SW → 北） ──
    const { w, p } = b, m = w.movers, c = w.crates, k = w.plates;
    // 出発：北の橋は下がっている
    assert.equal(m[0].f, 0, 'でんちがないのに、北の橋があがっている');
    // 西：ハンドルを回して橋をのばし、のこぎりをよけて、でんちを取る
    b.go([-13.5, 0]); b.crank(0, () => m[1].f > 0.99);
    b.go([-22, 0]); b.go([-30.5, 0]);
    pass(b, 2, 'z', -2.2, [-30.7, -2.2], [-34, -2.2]); b.grab(0); pass(b, 2, 'z', -2.2, [-34.3, -2.2], [-30.7, -2.2]);
    // でんちを置いて、むこう岸のハンドルで橋をのばしなおし、持って帰る
    b.go([-30, -1.5]); b.face(-30, -3); b.p.grabEnd(); b.crank(1, () => m[1].f > 0.99); b.grab(0); b.go([-30, 0]);
    b.go([-22, 0]); b.go([-13, 0]); b.go([-5, 3]); socketed(b, 0);
    // 東：広場の箱を持って下の台地へ下り、台の前に置いて踏み台にする
    b.grab(5); b.go([9, 0]); b.go([20.5, 0]); b.go([22.5, 0]);
    pass(b, 4, 'z', -2.2, [24.1, -2.2], [27, -2.2]); b.go([27, 0]); b.put(28.5, 0);
    // 箱に跳びのり、跳んでつかんで台に上がり、でんちを取る
    b.go([26.9, 0]); b.face(c[5].x, c[5].z); p.jump(); b.go([c[5].x, c[5].z]); b.hoist([c[5].x, c[5].z], [29.7, 0]); b.grab(1);
    // でんちを持って飛び下り、のこぎりをよけて、リフトに置く。リフトの上のハンドルを回して、いっしょに上がる
    b.go([27.2, 0]); pass(b, 4, 'z', -2.2, [26.9, -2.2], [23.6, -2.2]); b.put(22, 0);
    b.crank(3, () => m[3].f === 1); b.grab(1);
    b.go([13, 0]); b.go([4, 3]); socketed(b, 1); assert.equal(m[0].f, 0, 'でんち 2 こで、北の橋があがった');
    // 南西：島の箱をおもさ板に置いて、カタパルトで南の島へ
    b.go([-6, -10]); b.grab(6); b.put(-10, -14.5);
    fly(b, [-8, -19.5], isles.SM, '箱 1 こで、南の島に着かない');
    // 南の島の箱を持って、大砲で帰る。2 こめをおもさ板に置くと、カタパルトが西の島へとばす
    b.grab(7); fly(b, [-4, -30], isles.SW1, '南の島の大砲で、もとの島に帰れない');
    b.put(-9, -14.5); b.wait('おもさ板に 2 こ', () => k[4].held >= 2, 3);
    fly(b, [-8, -19.5], isles.SF, '箱 2 こで、西の島に着かない');
    // でんちを持って、大砲で帰る
    b.grab(2); fly(b, [-25.3, -23.7], isles.SW1, '西の島の大砲で、もとの島に帰れない');
    b.go([-6, -10]); b.go([1.5, 3]); socketed(b, 2);
    // でんち 3 こで、北の橋があがる
    b.wait('北の橋があがる', () => m[0].f === 1, 6);
    b.go([0, 9.5]); b.go([0, 21]);
    // 塔のリフトに乗り、リフトの上のハンドルを回して、段へ上がる
    b.go([0, 27.5]); b.crank(5, () => m[5].f === 1); b.go([0, 30]);
    // のこぎりをよけて段の北へ。ハンドルで橋をのばし、渡ってゴール
    pass(b, 6, 'x', 2.2, [2.2, 32.5], [2.2, 36.4]);
    b.crank(6, () => m[7].f > 0.99); b.go([0, 37.6]); b.go([0, 47.5]);
  }

  { // ── かぞえ錠：4 つのうち 3 つ（どの 3 つでも）で北の橋があがり、2 つではあがらない ──
    const x = fresh(), m0 = x.w.movers[0];
    for (const set of [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3], [0, 1, 2, 3], [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]) {
      for (const c of x.w.crates.slice(0, 4)) { Object.assign(c, c.home, { vy: 0 }); x.w.fit(c); }
      plug(x, set.map(s => [s, s])); for (let i = 0; i < 4 * x.FPS; i++) x.tick();
      assert.equal(m0.f, set.length >= 3 ? 1 : 0, `ソケット ${set} で、北の橋が${set.length >= 3 ? 'あがらない' : 'あがる'}`);
    }
  }

  { // ── 渡れてはいけない所 ──
    let x = fresh();
    cannot(x, '北の橋なしで、すき間を渡れた（でんちなしでゴールへ行ける）', [0, 20]);
    assert.ok(!x.p.goal && x.falls > 0);
    x = fresh(); x.grab(4); drift(x, [0, 8.4], 0, 1, () => x.p.grounded && x.p.z > 18.8 && x.p.y > -1, '扇風機で、北の橋なしにすき間を渡れた');
    x = fresh(); x.go([-13.5, 0]); cannot(x, '西の橋なしで、すき間を渡れた', [-31, 0]);
    x = fresh(); x.go([-6, -10]); cannot(x, 'カタパルトなしで、南の島へ渡れた', [-7, -29]);
    x = fresh(); x.grab(4); x.go([-6, -10]); x.go([-4, -19.5]); drift(x, [-4, -20.4], 0, -1, () => x.p.grounded && x.p.z < -27, '扇風機で、カタパルトなしに南の島へ渡れた');
    x = fresh(); x.place(-9, 0, -30); cannot(x, '南の島から西の島へ、歩いて渡れた', [-20, -27]);
    x = fresh(); x.place(28.3, -5, 0, 2);
    assert.throws(() => x.hoist([28.3, 0], [29.7, 0]), /よじ登れない/, '踏み台なしで、東の台に登れた');
    x = fresh(); x.place(7.1, 0, -46); assert.throws(() => x.hoist([7.1, -46], [8.3, -46]), /よじ登れない/, '台車なしで、南東の棚に登れた');
    x = fresh(); plug(x, [[0, 0], [1, 1], [2, 2]]); x.place(-1, 4.5, 36.5, 6);
    cannot(x, '段の橋なしで、ゴールの台へ渡れた', [0, 46]);
    // 扇風機を持ちこめる所でも、風で流れて渡れないこと（扇風機は、検査のために足もとへ置く）
    const fanAt = (x, fx, fy, fz) => { Object.assign(x.w.crates[4], { x: fx, y: fy, z: fz }); x.w.fit(x.w.crates[4]); x.grab(4); };
    x = fresh(); plug(x, [[0, 0], [1, 1], [2, 2]]); x.place(-1, 4.5, 36.5, 6); fanAt(x, -2, 4.5, 36.5);
    drift(x, [0, 37.6], 0, 1, () => x.p.grounded && x.p.z > 44.3 && x.p.y > 4, '扇風機で、段の橋なしにゴールの台へ渡れた');
    x = fresh(); x.place(-9.5, 0, -29); fanAt(x, -9.5, 0, -30);
    drift(x, [-11.6, -29], -1, 0, () => x.p.grounded && x.p.x < -18.3, '扇風機で、南の島から西の島へ渡れた');
  }

  { // ── 別の道：南東（氷・横風・台車）で、でんちを取る。台車は一度もどしてから、もう一度押す ──
    const x = fresh(), { w, p } = x, c = w.crates;
    x.go([6, -9.5]); x.go([6, -20]);
    // 氷の橋をすべって渡り、横風の橋のはしで、風がやむのを待って渡る
    x.go([6, -28.5]); calm(x, [4.6, -28.5], [4.6, -37.6]);
    // 台車を棚の下まで押す（まちがえて一度引きもどしてから、もう一度押す）
    x.push(8, [3.4, -46], 1, 0); assert.ok(c[8].x > 6.7, `台車が棚まで行かない (${c[8].x})`);
    x.push(8, [c[8].x - 1.1, -46], -1, 0); assert.ok(c[8].x < 4.6, `台車を引きもどせない (${c[8].x})`);
    x.push(8, [c[8].x - 1.1, -46], 1, 0);
    // 台車に乗り、跳んでつかんで棚へ。でんちを持って、来た道を帰る
    x.go([c[8].x, -46]); assert.ok(Math.abs(p.y - 1.4) < 0.01, `台車に乗れない ${x.where()}`);
    x.hoist([c[8].x, -46], [8.3, -46]); x.grab(3);
    assert.equal(p.cp, 7, '棚のある島のセーブ地点にふれていない（帰りに落ちると、氷の手前からやり直しになる）');
    x.go([5, -42]); calm(x, [4.6, -37.6], [4.6, -28.5]);
    x.go([6, -21]); x.go([6, -10]); x.go([7, 0]); socketed(x, 3);
    assert.equal(x.falls, 0, `南東の道で落ちた（最後は ${x.fellAt} の近く）`);
  }
  { // ── 横風：風のくる西のはしなら、待たずにまっすぐ歩いても落ちない。まん中で逆らわずにいると、東へ落とされる ──
    const walk = lane => {
      const x = fresh(); x.go([6, -9.5]); x.go([6, -20]); x.go([6, -28.5]); x.go([lane, -28.5]); x.wait('横風が吹きはじめる', () => x.w.winds[0].began, 5);
      for (let i = 0; i < 5 * x.FPS && !x.falls && x.p.z > -38.3; i++) x.tick(0, -1);
      return x.falls;
    };
    assert.equal(walk(3.8), 0, '風のくる西のはしを歩いて、落ちた');
    assert.ok(walk(6) > 0, '横風の橋のまん中で、風に逆らわなくても落ちない（風が効いていない）');
  }

  { // ── 別の道：東の台へ扇風機で上がり、でんちはリフトにのせ、自分はあみで上がって、上のハンドルで運び上げる ──
    const x = fresh(), { w, p } = x, m = w.movers;
    // 扇風機を持って下の台地へ下り、のこぎりをよけて、台の前に置く。風に乗って台の上へ
    x.grab(4); x.go([9, 0]); x.go([20.5, 0]); x.go([22.5, 0]);
    pass(x, 4, 'z', -2.2, [24.1, -2.2], [27, -2.2]); p.grabEnd();
    x.fanUp(4, [28.5, 0], -1.6, [29.7, 0]); x.grab(1);
    // でんちをリフトにのせ、自分は手ぶらであみを登る
    x.go([27.2, 1]); pass(x, 4, 'z', -2.2, [26.9, -2.2], [23.6, -2.2]); x.put(22, 0);
    x.climb([21.35, -3.1], [20, -3.1]);
    // 上のハンドルを回して、でんちだけを運び上げる
    x.crank(2, () => m[3].f === 1); assert.ok(Math.abs(w.crates[1].y) < 0.01, `でんちが上に着かない (y=${w.crates[1].y})`);
    x.grab(1); x.go([13, 0]); x.go([4, 3]); socketed(x, 1);
    assert.equal(x.falls, 0, `扇風機とあみの道で落ちた（最後は ${x.fellAt} の近く）`);
  }

  { // ── 別の道：北はあみで段へ。段の箱を柱の板にのせると、ずっと渡れる橋ができる ──
    const x = fresh(), { w, p } = x, m = w.movers;
    plug(x, [[0, 0], [1, 1], [3, 3]]); x.wait('北の橋があがる', () => m[0].f === 1, 6);
    x.go([0, 9.5]); x.go([0, 19.5]); x.go([-3.25, 21]); x.climb([-3.25, 28.65], [-3.25, 30]);
    x.grab(9); pass(x, 6, 'x', 2.2, [2.2, 32.5], [2.2, 36.2]);
    x.go([3.5, 36.2]); x.go([5.7, 36.2]); p.grabEnd();                                     // 箱を持って柱へ跳びうつり、板に置く
    x.wait('柱の板の橋があがる', () => w.plates[5].down && m[8].f === 1, 6);
    x.go([3.4, 36.2]); x.go([4, 38.6]); x.go([4, 45]); x.go([0, 47.5]);
    assert.ok(p.goal && x.falls === 0, `柱の板の橋で、ゴールに着かない ${x.where()}`);
  }

  { // ── 仲間と：西のハンドルを仲間が回していれば、だれも回さずに渡れる ──
    const x = fresh(), m = x.w.movers;
    x.friend = [-19.5, 0, 2.5, 1]; x.friendGrip = 0;
    x.go([-13.5, 0]); x.wait('仲間のハンドルで橋がのびる', () => m[1].f > 0.99, 6);
    x.go([-22, 0]); x.go([-30.5, 0]); x.go([-14, 0]); x.friendGrip = null;
    assert.equal(x.falls, 0, '仲間がのばした橋から落ちた');
  }
  { // ── 仲間と：東の上のハンドルを仲間が回せば、でんちを持ったまま、リフトでいっしょに上がれる ──
    const x = fresh(), { w, p } = x, m = w.movers;
    x.place(22.6, -5, 0.5, 2); Object.assign(w.crates[1], { x: 22.5, y: -5, z: -0.6, vy: 0 }); w.fit(w.crates[1]); x.tick();
    x.face(22.5, -0.6); assert.equal(p.grabStart(), w.crates[1]);
    x.friend = [20, 0, 2.3, 1]; x.friendGrip = 2;
    x.wait('仲間のハンドルでリフトが上がる', () => m[3].f === 1, 8);
    assert.ok(Math.abs(p.y) < 0.01 && p.carry === w.crates[1], `でんちを持ったまま上がれない ${x.where()}`);
    x.friendGrip = null;
  }
  { // ── 仲間と：おもさ板に 2 人いれば、すぐに西の島へとべる ──
    const x = fresh();
    x.friend = [-9.5, 0, -14.5, 2]; x.go([-6, -10]);
    fly(x, [-8, -19.5], isles.SF, '仲間 2 人のおもさで、西の島に着かない'); assert.equal(x.falls, 0);
  }
  { // ── 仲間と：東の台と南東の棚は、仲間の頭を踏み台にして登れる ──
    // 仲間（w.extra の体。頭の高さ 1.3m）が台の前に立ち、その頭へ跳びのってから、跳んでつかむ
    const head = (x, hx, y, hz, top, what) => {
      x.w.extra = [{ x0: hx - 0.25, x1: hx + 0.25, z0: hz - 0.25, z1: hz + 0.25, y0: y, y1: y + 1.3, friend: true }];
      x.go([hx - 0.95, hz]); x.face(hx, hz); x.p.jump(); x.go([hx, hz]);
      assert.ok(Math.abs(x.p.y - y - 1.3) < 0.01, `仲間の頭に乗れない ${x.where()}`);
      x.hoist([hx, hz], top); assert.ok(x.p.y > y + 2.9, `${what} ${x.where()}`);
    };
    let x = fresh(); x.place(27.3, -5, 1.5, 2); head(x, 28.45, -5, 0, [29.7, 0], '仲間の頭から、東の台に登れない');
    x = fresh(); x.place(6, 0, -44); head(x, 7.15, 0, -46, [8.3, -46], '仲間の頭から、南東の棚に登れない');
  }

  { // ── わざとまずい順番でも、1 人で最後まで行ける ──
    const x = fresh(), { w, p } = x, m = w.movers, c = w.crates, k = w.plates;
    // 南西：おもりなしでカタパルトに乗っても、とばない
    x.go([-6, -10]); x.go([-8, -19.5]); for (let i = 0; i < x.FPS; i++) x.tick();
    assert.ok(p.grounded && p.y < 0.2, 'おもりなしで、カタパルトがとばした');
    x.grab(6); x.put(-10, -14.5); fly(x, [-8, -19.5], isles.SM, '箱 1 こで、南の島に着かない');
    // 南の島の箱を、島の外へ落としてしまう。元の場所に戻ったのを、もう一度取る
    x.grab(7); x.go([-10, -35.9]); x.face(-10, -40); p.grabEnd(); home(x, 7);
    x.grab(7); fly(x, [-4, -30], isles.SW1, '南の島の大砲で、もとの島に帰れない');
    x.put(-9, -14.5); fly(x, [-8, -19.5], isles.SF, '箱 2 こで、西の島に着かない');
    x.grab(2); fly(x, [-25.3, -23.7], isles.SW1, '西の島の大砲で、もとの島に帰れない');
    x.go([-6, -10]); x.go([1.5, 3]); socketed(x, 2);
    // 東：先に上のハンドルで空のリフトを上げてしまう。広場の箱は、一度、広場の外へ落としてしまう
    x.go([13, 0]); x.crank(2, () => m[3].f === 1);
    x.grab(5); x.go([8.7, -7.5]); x.face(10, -7.5); p.grabEnd(); home(x, 5);
    x.grab(5); x.go([9, 0]); x.go([19, 2.6]); x.go([22, 2.6]);                           // 上がったままのリフトの横から、下の台地へ飛び下りる
    assert.ok(Math.abs(p.y + 5) < 0.01, `下の台地に下りていない ${x.where()}`);
    x.go([24.1, 2.6]); pass(x, 4, 'z', 2.2, [24.1, 2.2], [27, 2.2]); x.go([27, 0]); x.put(28.5, 0);
    x.go([26.9, 0]); x.face(c[5].x, c[5].z); p.jump(); x.go([c[5].x, c[5].z]); x.hoist([c[5].x, c[5].z], [29.7, 0]); x.grab(1);
    x.go([27.2, 0]); pass(x, 4, 'z', -2.2, [26.9, -2.2], [23.6, -2.2]);
    x.wait('リフトが下りてくる', () => m[3].f === 0, 25); x.put(22, 0);
    x.crank(3, () => m[3].f === 1); x.grab(1); x.go([13, 0]); x.go([4, 3]); socketed(x, 1);
    // 西：橋をのばして渡り、むこうで橋が岸の中へもどりきるまで待ってしまう。むこう岸のハンドルでのばしなおす
    x.go([-13.5, 0]); x.crank(0, () => m[1].f > 0.99); x.go([-22, 0]); x.go([-30.5, 0]);
    pass(x, 2, 'z', -2.2, [-30.7, -2.2], [-34, -2.2]); x.grab(0); pass(x, 2, 'z', -2.2, [-34.3, -2.2], [-30.7, -2.2]);
    x.wait('橋が岸の中へもどる', () => m[1].f === 0, 25);
    x.go([-30, -1.5]); x.face(-30, -3); x.p.grabEnd(); x.crank(1, () => m[1].f > 0.99); x.grab(0); x.go([-30, 0]); x.go([-22, 0]); x.go([-13, 0]); x.go([-5, 3]); socketed(x, 0);
    // 北：先に地面のハンドルで空のリフトを上げてしまう。下りてくるのを待ってから、乗って回す
    x.wait('北の橋があがる', () => m[0].f === 1, 6); x.go([0, 9.5]); x.go([0, 21]);
    x.go([3, 25]); x.crank(4, () => m[5].f === 1); x.wait('リフトが下りてくる', () => m[5].f === 0, 25);
    x.go([0, 27.5]); x.crank(5, () => m[5].f === 1); x.go([0, 30]);
    pass(x, 6, 'x', 2.2, [2.2, 32.5], [2.2, 36.4]); x.crank(6, () => m[7].f > 0.99); x.go([0, 37.6]); x.go([0, 47.5]);
    assert.ok(p.goal && x.falls === 0, `まずい順番で、ゴールに着かない（${x.falls} 回落ちた） ${x.where()}`);
  }
};

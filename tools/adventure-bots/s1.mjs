// ステージ 1「ひだまり広場」を 1 人で解く手順と、ほかの道・できてはいけないことの検査
// b は自動操縦（tools/test-adventure.mjs の makeBot）。fresh() は同じステージをもう 1 回、最初から始める
// 動く床：0 北のかぎの橋／1〜3・9 観覧車／4 でんち 3 つのリフト／5 トロッコ／6・7 回る床／8 南のかぎの橋
// 箱：0 でんち A（西）／1 でんち B（東）／2 でんち C（南）／3 西の段の箱／4 南の箱
export default (b, { assert, fresh }) => {
  const SOCK = [[-3, 4.5], [0, 4.5], [3, 4.5]];
  const near = (a, v) => Math.abs(a - v) < 0.01;

  // 持っているでんちを、ハブのソケット s に置く
  const socketIn = (x, s) => {
    x.go([x.p.x < -6 ? -6 : x.p.x > 6 ? 6 : x.p.x, x.p.z < -6 ? -6 : x.p.z]);
    x.put(...SOCK[s]); x.wait(`ソケット ${s} にでんちが入る`, () => x.w.plates[s].down, 3);
  };
  // 西：段を 1.0 → 2.6 とよじ登る
  const westSteps = x => {
    x.go([-8, 0]); x.go([-16, -4]);
    x.go([-21, -4]); assert.ok(near(x.p.y, 1), `T1 に登れていない ${x.where()}`);
    x.go([-20.2, 0.6]); assert.ok(near(x.p.y, 2.6), `T2 に登れていない ${x.where()}`);
  };
  // 西：T3 のでんち A を取って、東の崖から W0 へ飛びおりる
  const westCell = x => {
    assert.ok(near(x.p.y, 5), `T3 に登れていない ${x.where()}`);
    x.grab(0); x.go([-14, 5]); assert.ok(near(x.p.y, 0), `W0 におりていない ${x.where()}`);
    x.go([-12, 0]); x.go([-7, 0]);
  };
  // 回る床 m が岸（x が 29.5 なら D2、20.5 なら D1）に近づいて来るのを待つ
  const docking = (x, ex) => [6, 7].find(m => { const [cx, cz] = x.center(m); return Math.abs(cx - ex) < 0.8 && (ex > 25 ? cz < -9.5 : cz > -9.5); });
  // 東：D2 から回る床に乗り、D1 でおりる
  const carouselBack = x => {
    x.go([32.5, -8]);
    x.wait('回る床が D2 に来る', () => docking(x, 29.5) != null);
    const m = docking(x, 29.5);
    x.go(() => x.center(m), () => x.p.on === x.w.movers[m].box && Math.hypot(x.center(m)[0] - x.p.x, x.center(m)[1] - x.p.z) < 0.5);
    x.wait('回る床が D1 に着く', () => x.center(m)[0] < 20.9);
    x.go([17, -8]); x.go([15, -3]); x.go([7, 0]);
  };
  // 東：トロッコで E2 へ行き、でんち B を取って、回る床で帰る
  const east = x => {
    x.go([7, 0]); x.go([17, 0]);
    x.tram(5, [33, 0]);
    x.grab(1); carouselBack(x);
  };
  // 南：低い出っぱりの重い箱を、北へ押してふみ板にのせる。押したら S1 へよじ登る
  const pushOn = x => {
    x.go([5, -19.3]); x.grab(4, [7.75, -19.3]);
    for (let i = 0; !x.w.plates[3].down; i++) { assert.ok(i < x.FPS * 10, `重い箱がふみ板に乗らない ${x.where()}`); x.tick(0, 1); }
    x.p.grabEnd(); x.go([4, x.p.z]);
  };
  // 南：箱をふみ板にのせ、橋を渡り、トランポリンで柱へ。でんち C を持って帰る
  const south = x => {
    x.go([0, -8]); x.go([0, -14]);
    pushOn(x);
    x.wait('南の橋があがる', () => x.w.movers[8].f === 1, 6);
    x.go([0, -20]); x.go([0, -31.5]);
    x.go([0, -33.5], () => x.p.y > 3.2); x.go([0, -34.9]);          // トランポリンで跳ねて、柱の上へ
    assert.ok(near(x.p.y, 3), `柱に乗れていない ${x.where()}`);
    x.grab(2); x.go([2.6, -35]); x.go([1.2, -30.5]); x.go([0, -21]); x.go([0, -9]); x.go([0, -6]);
  };
  // 北：橋を渡り、観覧車のいちばん下で乗って、北側で N2 へおりてゴール
  const wheel = x => {
    x.wait('北の橋があがる', () => x.w.movers[0].f === 1, 6);
    x.go([1.5, 6]); x.go([0, 9]); x.go([0, 20]); x.go([0, 26.3]);
    const low = () => [1, 2, 3, 9].find(m => Math.abs(x.center(m)[1] - 31.1) < 0.5 && x.w.movers[m].box.y1 < 0.3);   // いちばん下へ着く少し手前
    x.wait('観覧車のかごが下に来る', () => low() != null);
    const car = low();
    x.go(() => x.center(car), () => x.p.on === x.w.movers[car].box && Math.abs(x.center(car)[1] - x.p.z) < 0.5);
    x.wait('かごが N2 の横へ下りてくる', () => x.center(car)[1] > 33.4 && x.w.movers[car].box.y1 > 3.9 && x.w.movers[car].box.y1 < 5.2);
    x.go([0, 42]);
  };

  // ── 決めた道：西（段のぼり）と東（トロッコ・回る床）で、でんち 2 つ ──
  assert.ok(b.w.movers[0].f === 0 && b.w.floorY(0, 12, 0) < -12, '北の橋が最初からある');
  westSteps(b);
  b.hoist([-20.2, 1.3], [-20.2, 3.5]);                                   // T3 へは、跳んでつかむ（+2.4）
  westCell(b); socketIn(b, 0);
  assert.equal(b.w.movers[0].f, 0, 'でんち 1 つで北の橋があがった');
  east(b); socketIn(b, 1);
  wheel(b);
  assert.ok(b.p.goal, 'ゴールしていない');

  const done = (x, what) => assert.ok(x.p.goal && x.falls === 0, `${what}：ゴールできない、または落ちた（${x.falls} 回）${x.where()}`);
  const idle = (x, s) => { for (let i = 0; i < s * x.FPS; i++) x.tick(); };
  // 同じ道を、観覧車・回る床の時計がちがう所から（運まかせで通っていないこと）
  for (const s of [2.3, 5.9, 9.4, 13.7]) {
    const x = fresh(); idle(x, s);
    westSteps(x); x.hoist([-20.2, 1.3], [-20.2, 3.5]); westCell(x); socketIn(x, 0); east(x); socketIn(x, 1); wheel(x);
    done(x, `決めた道（${s} 秒待ってから）`);
  }

  // 西の別の道：T2 の箱を踏み台にして T3 へ（箱の上から +1.6）
  let x = fresh(); westSteps(x);
  x.face(-21.5, 1.4); x.p.jump();                                        // 箱に跳びのる
  for (let i = 0; !(x.p.grounded && near(x.p.y, 3.4)); i++) { assert.ok(i < x.FPS * 3, `箱に乗れない ${x.where()}`); x.tick(-0.6, 0.4); }
  x.go([-21.5, 3.5]); westCell(x); socketIn(x, 0);
  // 南が東のかわり：西 ＋ 南
  south(x); socketIn(x, 2); wheel(x); done(x, '西 ＋ 南');

  // 南が西のかわり：南 ＋ 東。東は回る床で行き、回る床で帰る
  x = fresh(); south(x); socketIn(x, 2);
  x.go([7, 0]); x.go([15, -3]); x.go([18.5, -8]);
  x.wait('回る床が D1 に来る', () => docking(x, 20.5) != null);
  const m = docking(x, 20.5);
  x.go(() => x.center(m), () => x.p.on === x.w.movers[m].box && Math.hypot(x.center(m)[0] - x.p.x, x.center(m)[1] - x.p.z) < 0.5);
  x.wait('回る床が D2 に着く', () => x.center(m)[0] > 29.1);
  x.go([33, -8]); x.go([34, -2]);
  assert.equal(x.w.movers[5].f, 0, 'トロッコが動いた');
  x.grab(1); carouselBack(x); socketIn(x, 1); wheel(x); done(x, '南 ＋ 東（回る床で行き帰り）');

  // でんち 3 つ：リフトが動く（2 つでは動かない）。リフトで N2 へ
  x = fresh(); westSteps(x); x.hoist([-20.2, 1.3], [-20.2, 3.5]); westCell(x); socketIn(x, 0); east(x); socketIn(x, 1);
  idle(x, 3); assert.equal(x.w.movers[4].f, 0, 'でんち 2 つでリフトが動いた');
  south(x); socketIn(x, 2);
  x.go([1.5, 6]); x.go([0, 9]); x.go([0, 20]); x.go([5.5, 26.3]);
  x.board(4); x.go(() => x.center(4)); x.ride(4, 1); x.go([5.5, 40]); x.go([0, 42]);
  done(x, 'でんち 3 つでリフト');

  // 2 人で：仲間の頭を踏み台にして T3 へ（仲間は T2 の上、T3 の前に立つ。頭の高さ 3.9）
  x = fresh(); westSteps(x);
  x.w.extra = [{ x0: -20.45, x1: -19.95, z0: 1.25, z1: 1.75, y0: 2.6, y1: 3.9, friend: true }];
  x.go([-20.2, 1.5]); assert.ok(near(x.p.y, 3.9), `仲間の頭に乗れていない ${x.where()}`);
  x.go([-20.2, 3.5]); x.w.extra = []; westCell(x); assert.equal(x.falls, 0, '仲間の頭で T3 へ行く道で落ちた');
  // 2 人で：仲間が南のふみ板に乗っている間、橋がある（箱はいらない）
  x = fresh(); x.go([0, -8]); x.go([0, -14]); x.friend = [7.75, -0.45, -14, 1];
  x.wait('仲間で南の橋があがる', () => x.w.movers[8].f === 1, 6);
  x.go([0, -20]); x.go([0, -31.5]); x.go([0, -33.5], () => x.p.y > 3.2); x.go([0, -34.9]); x.grab(2); x.go([2.6, -35]); x.go([1.2, -30.5]); x.go([0, -21]); x.go([0, -9]);
  assert.equal(x.falls, 0, '仲間がふみ板にいるのに、南で落ちた');
  x.friend = null; x.wait('仲間が下りると、南の橋がしずむ', () => x.w.movers[8].f === 0, 6);
  // 2 人で：仲間がトロッコに乗って E2 へ来られる
  x = fresh(); x.friend = [20.5, 0, 0, 1];
  x.wait('仲間を乗せてトロッコが E2 へ', () => x.w.movers[5].f === 1, 8);
  assert.ok(Math.abs(x.friend[0] - 29.5) < 0.05, `仲間がトロッコと一緒に運ばれていない (x=${x.friend[0]})`);
  x.friend = [32, 0, 0, 1]; x.wait('仲間がおりると、トロッコが帰る', () => x.w.movers[5].f === 0, 8);

  // いちばん悪い順番：でんちと箱を落とし、取りに戻っても 1 人で終われる
  x = fresh();
  x.go([0, 6.6]); idle(x, 2); assert.equal(x.w.movers[0].f, 0, '何もしないのに北の橋があがった');
  x.go([0, -8]); x.go([0, -14]); x.go([5, -19.3]); x.grab(4, [7.75, -19.3]);   // 南の重い箱を、出っぱりの北の端から落とす
  for (let i = 0; x.w.crates[4].y > -1; i++) { assert.ok(i < x.FPS * 12, `重い箱が落ちない ${x.where()}`); x.tick(0, 1); }
  x.p.grabEnd();
  x.wait('落ちた箱が元の場所へ戻る', () => near(x.w.crates[4].x, 7.75) && near(x.w.crates[4].z, -18) && x.w.crates[4].on, 6);
  x.go([4, x.p.z]);
  south(x);
  x.go([0, -8.5]); x.put(-3, -8.5);                                      // でんち C を南の橋の横から落とす
  x.wait('でんち C が柱へ戻る', () => near(x.w.crates[2].y, 3) && x.w.crates[2].on, 6);
  x.go([0, -14]); x.go([0, -20]); x.go([0, -31.5]); x.go([0, -33.5], () => x.p.y > 3.2); x.go([0, -34.9]);
  x.grab(2); x.go([2.6, -35]); x.go([1.2, -30.5]); x.go([0, -21]); x.go([0, -9]); x.go([0, -6]); socketIn(x, 2);
  x.go([7, 0]); x.go([17, 0]); x.tram(5, [33, 0]); x.grab(1); x.put(35, 5.7);   // でんち B を E2 の北から落とす
  x.wait('でんち B が E2 へ戻る', () => near(x.w.crates[1].x, 36) && x.w.crates[1].on, 6);
  x.grab(1); carouselBack(x);
  assert.equal(x.w.movers[5].f, 0, 'トロッコが E1 へ帰っていない');
  socketIn(x, 1);
  x.grab(1, [0, 3.4]); x.go([0, 1]); x.put(0, -3);                       // 入れたでんちを抜くと、橋がしずむ
  x.wait('でんちを抜くと北の橋がしずむ', () => x.w.movers[0].f === 0, 6);
  x.grab(1); socketIn(x, 1); wheel(x); done(x, 'いちばん悪い順番');

  // 詰ませようとした後：でんち B とふつうの箱を北の N1 に（橋は下りている）、でんち A を S2 に置き、でんち C は柱（落とせば戻る家）。
  // それでも、重い箱はかならず南の出っぱりにあるので、1 人で S2 の 2 つを持ち帰ってゴールできる
  x = fresh();
  for (const [i, px, py, pz] of [[1, 3, 0, 22], [3, -3, 0, 22], [0, 3, 0, -36]]) { const c = x.w.crates[i]; Object.assign(c, { x: px, y: py, z: pz, moved: true }); x.w.fit(c); }
  idle(x, 1); south(x); socketIn(x, 2);
  x.go([0, -8]); x.go([0, -20]); x.go([0, -31.5]); x.grab(0); x.go([0, -21]); x.go([0, -9]); x.go([0, -6]); socketIn(x, 0);
  wheel(x); done(x, '詰ませようとした後');
  // 重い箱は、S1 へ押し上げられない（段の下で止まる）
  x = fresh(); x.go([0, -14]); x.go([5, -16]); x.grab(4, [9.2, -18]);
  for (let i = 0; i < x.FPS * 4; i++) x.tick(-1, 0);
  x.p.grabEnd(); assert.ok(x.w.crates[4].x > 6.6 && near(x.w.crates[4].y, -0.45), `重い箱が S1 へ上がった (${x.w.crates[4].x}, ${x.w.crates[4].y})`);

  // 時計がちがう所から：南 ＋ 東（回る床で行き帰り）と、でんち 3 つのリフト
  const eastByCarousel = x => {
    x.go([7, 0]); x.go([15, -3]); x.go([18.5, -8]);
    x.wait('回る床が D1 に来る', () => docking(x, 20.5) != null);
    const m = docking(x, 20.5);
    x.go(() => x.center(m), () => x.p.on === x.w.movers[m].box && Math.hypot(x.center(m)[0] - x.p.x, x.center(m)[1] - x.p.z) < 0.5);
    x.wait('回る床が D2 に着く', () => x.center(m)[0] > 29.1);
    x.go([33, -8]); x.go([34, -2]); x.grab(1); carouselBack(x); socketIn(x, 1);
  };
  for (const s of [1.7, 4.4, 7.1, 11.3]) {
    x = fresh(); idle(x, s); south(x); socketIn(x, 2); eastByCarousel(x); wheel(x); done(x, `南 ＋ 東（${s} 秒待ってから）`);
  }
  for (const s of [0.9, 2.6, 4.1]) {
    x = fresh(); idle(x, s);
    for (const i of [0, 1, 2]) { const c = x.w.crates[i]; Object.assign(c, { x: SOCK[i][0], y: 0, z: SOCK[i][1], moved: true }); x.w.fit(c); }
    idle(x, s); x.go([1.5, 6]); x.go([0, 9]); x.go([0, 20]); x.go([5.5, 26.3]);
    x.board(4); x.go(() => x.center(4)); x.ride(4, 1); x.go([5.5, 40]); x.go([0, 42]);
    done(x, `リフト（${s} 秒ずらして）`);
  }

  // ソケットの組み合わせ：どの 2 つでも北の橋があがり、1 つ以下ではあがらない。3 つでリフトが動く
  for (const set of [[], [0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2]]) {
    x = fresh();
    set.forEach(s => { const c = x.w.crates[s]; Object.assign(c, { x: SOCK[s][0], y: 0, z: SOCK[s][1], moved: true }); x.w.fit(c); });
    idle(x, 6);
    assert.equal(x.w.movers[0].f, set.length >= 2 ? 1 : 0, `ソケット [${set}] で北の橋がまちがっている`);
    assert.equal(x.w.movers[4].f > 0, set.length === 3, `ソケット [${set}] でリフトがまちがっている`);
  }

  // できてはいけないこと：かぎの橋がないすき間（10m）は、跳んでつかんでも渡れない
  const leap = (x, from, dz) => {
    x.go(from);
    for (let i = 0; i < x.FPS * 8 && !x.falls; i++) {
      if (x.p.grounded && Math.abs(x.p.z) > 6.4 + (dz < 0 ? 14 : 0) - 0.1) { x.p.jump(); x.p.grabStart(); }
      x.tick(0, dz);
    }
    assert.equal(x.falls, 1, `かぎの橋なしで、すき間を渡れてしまう ${x.where()}`);
  };
  x = fresh(); leap(x, [0, 5.5], 1); assert.ok(!x.p.goal);
  x = fresh(); x.go([0, -8]); leap(x, [0, -19.5], -1);
  // でんち 1 つでも渡れない（ゴールに着けない）
  x = fresh(); westSteps(x); x.hoist([-20.2, 1.3], [-20.2, 3.5]); westCell(x); socketIn(x, 0); leap(x, [0, 5.5], 1); assert.ok(!x.p.goal);
};

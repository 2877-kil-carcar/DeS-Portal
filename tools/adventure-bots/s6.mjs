// ステージ 6「ぎったん雲の谷」を 1 人で解く手順：西の井戸（シーソーででんちを飛ばし、あみで出る）→ 東（ハンドルの橋）→ 北の橋 → 砂ぶくろとシーソーで塔へ
// そのあと、順番を変えた道・わざとまずい順番・仲間との答え・渡れてはいけない所を確かめる
export default (b, { assert, fresh }) => {
  const rim = 5, tower = 15;                                                          // 井戸の北のふち・塔（boxes の番号）
  const sockets = [[-2.5, 3.5], [2.5, 3.5]];
  const socketed = (x, i) => { x.go(sockets[i]); x.put(x.w.plates[i].x, x.w.plates[i].z); x.wait(`ソケット ${i} にでんちが入る`, () => x.w.plates[i].down, 3); };
  // のこぎり s の通り道の手前 from で待ち、のこぎりが横切る所（z = at）から遠ざかったとたんに、to へ渡る
  const pass = (x, s, at, from, to) => {
    const box = x.w.movers[s].box, mid = () => (box.z0 + box.z1) / 2;
    x.go(from); let was = mid();
    x.wait(`のこぎり ${s} が遠ざかる`, () => { const v = mid(), away = Math.abs(v - at) > 2.7 && Math.abs(was - at) <= 2.7; was = v; return away; }, 10);
    x.go(to);
  };
  const cannot = (x, what, target, seconds = 8) => assert.throws(() => x.go(target, null, seconds), /着けない/, what);
  // 検査のために、でんちをソケットに入れておく
  const plug = x => { for (const i of [0, 1]) { const c = x.w.crates[i], k = x.w.plates[i]; Object.assign(c, { x: k.x, y: k.y, z: k.z, vy: 0 }); x.w.fit(c); } x.tick(); };

  // 西の井戸：でんちを青い皿に置き、段から赤い皿へ乗って飛ばす。井戸の北のふちに着いたのを確かめる
  const pitFling = x => {
    const { w } = x, c = w.crates[0], [A, Bp] = [w.movers[1], w.movers[2]];
    x.go([-10.5, 0]); x.go([-16, 4]); x.go([-19.5, 4]);                               // ふちから井戸の底へ飛び下りる
    assert.ok(Math.abs(x.p.y + 7) < 0.01, `井戸の底に下りていない ${x.where()}`);
    x.grab(0); x.put(-26, 0); x.wait('でんちが青い皿にのる', () => c.on === A.box, 3);
    x.go([-19.25, 2.4]); x.go([-19.25, 0]);                                          // 段へよじ登る
    assert.ok(Math.abs(x.p.y + 5.9) < 0.01, `段に上がっていない ${x.where()}`);
    x.go([-22, 0]);                                                                    // 赤い皿が沈み、でんちが飛ぶ（皿に乗りきる前に飛ぶこともある）
    x.wait('でんちが北のふちに着く', () => c.on === w.stage.boxes[rim], 5);
    assert.ok(Bp.f === 1 && A.f === 1, '赤い皿に乗っているのに、シーソーが戻った');
  };
  // 井戸から南のあみで出て、ふちを回って、でんちを広場のソケットへ
  const pitHome = x => {
    x.go([-24, -4]); x.climb([-24, -5.3], [-24, -8]);
    x.go([-32, -8]); x.go([-32, 8]); x.grab(0); x.go([-15, 8]); x.go([-15, 0]); x.go([-10.5, 0]); socketed(x, 0);
  };
  // 東：ハンドルで橋をのばして渡り、のこぎりをよけて、でんちを取る。むこう岸のハンドルでのばしなおして帰る
  const east = x => {
    const m = x.w.movers;
    x.go([4, 0]); x.go([13.5, 0]); x.crank(0, () => m[3].f > 0.99);
    x.go([22, 0]); x.go([32.5, 0]);
    pass(x, 4, -2.2, [32.7, -2.2], [36, -2.2]); x.grab(1); pass(x, 4, -2.2, [36.3, -2.2], [32.7, -2.2]);
    x.go([32, -1.5]); x.face(32, -3); x.p.grabEnd(); x.crank(1, () => m[3].f > 0.99); x.grab(1); x.go([32, 0]);
    x.go([22, 0]); x.go([13, 0]); socketed(x, 1);
  };
  // 砂ぶくろを持って、段から棚へ跳び上がり、ベルトの西の端に置く
  const load = x => {
    const { p } = x;
    x.grab(2); x.go([-9, 26.4]); x.face(-9, 29); p.jump(); x.go([-8.1, 29]);
    assert.ok(Math.abs(p.y - 1.1) < 0.01, `砂ぶくろを持って段に上がれない ${x.where()}`);
    x.face(-6, 29); p.jump(); x.go([-7.2, 29]);
    assert.ok(Math.abs(p.y - 2.2) < 0.01, `砂ぶくろを持って棚に上がれない ${x.where()}`);
    x.put(-6.2, 29);
  };
  // 北：橋を渡り、砂ぶくろをベルトに置いて、飛び下り、青い皿で待つ
  const north = x => {
    const m = x.w.movers;
    x.wait('北の橋があがる', () => m[0].f === 1, 6); x.go([0, 9.5]); x.go([0, 23]);
    load(x); x.go([-6.5, 32]); x.go([0, 33]);
  };
  const launch = x => {
    const { p } = x;
    x.wait('砂ぶくろが赤い皿に落ちて、飛ぶ', () => !p.grounded && p.vy > 3, 8); x.wait('着地', () => p.grounded, 6);
    assert.equal(x.w.groundBox(p.x, p.z, p.y), x.w.stage.boxes[tower], `塔に着かない ${x.where()}`);
    x.go([0, 44]);
  };

  { // ── 1 人の基本の道（西 → 東 → 北） ──
    const { w } = b;
    assert.equal(w.movers[0].f, 0, 'でんちがないのに、北の橋があがっている');
    pitFling(b); pitHome(b);
    east(b);
    north(b); launch(b);
  }

  { // ── 順番を変えて（東 → 西） ──
    const x = fresh(); east(x); pitFling(x); pitHome(x); north(x); launch(x);
    assert.ok(x.p.goal && x.falls === 0, `東から回って、ゴールに着かない（${x.falls} 回落ちた） ${x.where()}`);
  }

  { // ── わざとまずい順番：でんちを置かずに赤い皿を踏む／砂ぶくろだけ先に落としてしまう。どちらも、やりなおせる ──
    const x = fresh(), { w, p } = x, c = w.crates, m = w.movers;
    x.go([-10.5, 0]); x.go([-16, 4]); x.go([-19.5, 4]);
    x.go([-19.25, 2.4]); x.go([-19.25, 0]); x.go([-22, 0]); x.wait('空のまま赤い皿が沈む', () => m[2].f === 1, 2);
    x.go([-19.5, 3]); x.wait('だれもいない赤い皿が戻る', () => m[2].f === 0, 3);
    // でんちを持ったまま青い皿に立っても、赤い皿に何もなければ飛ばない
    x.grab(0); x.go([-26, 0]); for (let i = 0; i < x.FPS; i++) x.tick(); assert.ok(p.grounded && m[1].f === 0, 'でんちを持って青い皿に立つだけで、動いた');
    x.put(-26, 1.2); x.wait('でんちが青い皿にのる', () => c[0].on === m[1].box, 3);
    x.go([-19.25, 2.4]); x.go([-19.25, 0]); x.go([-22, 0]); x.wait('でんちが北のふちに着く', () => c[0].on === w.stage.boxes[rim], 6);
    pitHome(x); east(x);
    // 北：青い皿に乗る前に、砂ぶくろが赤い皿に落ちてしまう。赤い皿から拾って下りると、シーソーが戻る
    x.wait('北の橋があがる', () => m[0].f === 1, 6); x.go([0, 9.5]); x.go([0, 23]);
    load(x); x.go([-7.2, 26]); x.wait('砂ぶくろが赤い皿に落ちて、空の青い皿が上がる', () => m[5].f === 1 && c[2].on === m[6].box, 10);
    x.go([0, 26.6]); x.grab(2); x.go([0, 24]); x.wait('砂ぶくろを下ろすと、シーソーが戻る', () => m[5].f === 0, 3); p.grabEnd();
    load(x); x.go([-6.5, 32]); x.go([0, 33]); launch(x);
    assert.ok(p.goal && x.falls === 0, `まずい順番で、ゴールに着かない（${x.falls} 回落ちた） ${x.where()}`);
  }

  { // ── 仲間と：赤い皿に仲間が跳び乗れば、青い皿の人が塔へ飛ぶ。砂ぶくろはいらない ──
    const x = fresh(), m = x.w.movers;
    plug(x); x.wait('北の橋があがる', () => m[0].f === 1, 6); x.go([0, 9.5]); x.go([0, 23]); x.go([0, 33]);
    for (let i = 0; i < x.FPS; i++) x.tick(); assert.ok(x.p.grounded && m[5].f === 0, '仲間がいないのに、青い皿が動いた');
    x.friend = [0, m[6].box.y1, 29, 1]; launch(x);
    assert.ok(x.p.goal && x.falls === 0, `仲間に飛ばしてもらって、ゴールに着かない ${x.where()}`);
  }
  { // ── 仲間と：砂ぶくろを持って青い皿に立つ（重さ 2）と、仲間 1 人では飛ばない。2 人なら飛ぶ ──
    const x = fresh(), m = x.w.movers;
    plug(x); x.wait('北の橋があがる', () => m[0].f === 1, 6); x.go([0, 9.5]); x.go([0, 23]); x.grab(2); x.go([0, 33]);
    x.friend = [0, m[6].box.y1, 29, 1]; for (let i = 0; i < 2 * x.FPS; i++) x.tick();
    assert.ok(x.p.grounded && m[5].f === 0, '重さ 2 の青い皿が、重さ 1 の仲間で上がった');
    x.friend = [0, m[6].box.y1, 29, 2]; launch(x);
    assert.ok(x.p.carry === x.w.crates[2], '砂ぶくろを持ったまま飛んでいない');
  }

  { // ── 渡れてはいけない所 ──
    let x = fresh();
    cannot(x, '北の橋なしで、すき間を渡れた（でんちなしでゴールへ行ける）', [0, 20]);
    assert.ok(!x.p.goal && x.falls > 0);
    x = fresh(); x.go([13.5, 0]); cannot(x, '東の橋なしで、すき間を渡れた', [33, 0]);
    x = fresh(); plug(x); x.wait('北の橋があがる', () => x.w.movers[0].f === 1, 6); x.go([0, 9.5]); x.go([0, 23]); x.go([-4, 33]);
    cannot(x, 'シーソーなしで、塔へ渡れた', [-2, 42]);
    // 井戸の中から、でんちを持ったまま、あみは登れない（手ぶらでないとつかめない）。段や赤い皿の上から、ふちへ跳んでも届かない
    x = fresh(); x.place(-21, -7, 3); x.grab(0); x.go([-24, -4]);
    assert.throws(() => x.climb([-24, -5.3], [-24, -8]), /あみをつかめない/, 'でんちを持ったまま、あみを登れた');
    x = fresh(); x.place(-19.25, -5.9, 0);
    assert.throws(() => x.hoist([-19.25, -1], [-15, 0]), /よじ登れない/, '井戸の段から、ふちへ登れた');
  }
};

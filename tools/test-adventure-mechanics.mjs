// もふもふ冒険の「しくみ」を 1 つずつ、小さな検査用ステージで確かめる（ステージの中身には依存しない）。
// めり込みからの脱出・プレス機・セーブ地点・信号と条件・空中でつかむ・でんちとソケット・おもさ板・乗ると動く床・せんぷうき箱・あみ・てんびん・カタパルト・レールの箱・まきあげハンドル。
// そのあとに、見直しで見つかった不具合の検査：動く床と壁の間からの脱出・あみを遠めからつかむ・ハンドルから手が離れる距離・「放した」知らせの合わせ方（w.release）・
// 重い箱をつかんだままのカタパルト・load: n の猶予・乗ると動く床とてんびんの「行ったり来たりしない」「あとから入った端末」・箱の上のせんぷうき箱・跳んでつかむ（hoist）。
// 見直し（2 回め）の検査：仲間の頭の上のせんぷうき箱・動く床が人や箱を動かない箱の中へ運ばない・遠ざかった重い箱から手が離れる・同じハンドルを 2 人で回す・
// となり合うソケット・あみの真下からつかまない・うすい壁ごしに箱を置かない・となりの岸に立つ人は乗っていない扱い・遅れて見える仲間とリフト・レールの箱の c.on・いることにした仲間。
// 最後に、ステージの点検（tools/lint-adventure.mjs）が、わざと入れたまちがいを見つけることも確かめる。
// 使い方：node tools/test-adventure-mechanics.mjs          … 毎秒 60 コマで
//         FPS=20 node tools/test-adventure-mechanics.mjs   … 遅い端末のコマ数で
import assert from 'node:assert/strict';
import { kit, makeWorld, REACH } from '../apps/gallery/adventure-world.js';
import { makeBot } from './test-adventure.mjs';
import { lint } from './lint-adventure.mjs';
const { B, P, CP, wind, gust, saw, cannon, cell, socket, WP, fan, net, launcher, lever, cart, railEnd } = kit;
const FPS = +process.env.FPS || 60;

let seed = 7;
Math.random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;      // やり直しの落下位置を、毎回同じにする
const floor = B(0, 0, 0, 24, 24, 1);                                               // 検査用の広場（x・z とも -12〜12、上面の高さ 0）
const bot = o => makeBot({ name: 'しくみの検査', kill: -12, boxes: [floor], plates: [], movers: [], crates: [], cps: [CP(0, 0, 0)], goal: { x: 99, y: 0, z: 99 }, ...o });
const run = (b, seconds, mx = 0, mz = 0) => { for (let i = 0; i < seconds * FPS; i++) b.tick(mx, mz); };
// スティックを (mx, mz) へ倒したまま、条件が合うまで進める
const hold = (b, what, mx, mz, pred, seconds = 4) => { for (let i = 0; !pred(); i++) { assert.ok(i < seconds * FPS, `「${what}」にならない ${b.where()}`); b.tick(mx, mz); } };
const near = (a, v, eps = 0.02) => Math.abs(a - v) < eps;
const move = (c, x, y, z) => Object.assign(c, { x, y, z, vy: 0 });                 // 検査のために、箱をその場所へ置く
const group = (name, check) => { check(); console.log(`PASS ${name}`); };

group('めり込みからの脱出：近い面へ向かえば歩いて出られる。奥へは進めない', () => {
  const wall = B(0, 3, 5, 4, 2, 3);                                                // x -2〜2、z 4〜6
  const lift = { b: B(6, 0, -5, 3, 3, 0.5, 3), to: [0, 1.5, 0], mode: 'hold', on: [0] };   // x 4.5〜7.5。上がりきると、体の高さに止まる
  const b = bot({ boxes: [floor, wall], plates: [P(-9, 0, -9)], movers: [lift] }), { p, w } = b;
  b.place(0, 0, 3.9);                                                              // 壁の南の面に 0.1m めり込んでいる
  assert.equal(w.blocked(p.x, p.z, p.y), wall);
  run(b, 0.5, 0, 1); assert.ok(p.z <= 3.9 + 1e-9, `壁の奥へ進めてしまう (z=${p.z})`);
  run(b, 0.5, 0, -1); assert.ok(p.z < 3.6 && !w.blocked(p.x, p.z, p.y), `壁から出られない (z=${p.z})`);
  b.place(1.6, 0, 5);                                                              // 壁のまん中（東の面がいちばん近い）
  run(b, 0.5, -1, 0); assert.ok(p.x >= 1.6 - 1e-9, `遠い面へ向かって進めてしまう (x=${p.x})`);
  run(b, 1.5, 1, 0); assert.ok(p.x > 2.3 && !w.blocked(p.x, p.z, p.y), `近い面から出られない (x=${p.x})`);
  // 上がってくる床の縁から 0.2m 外に立っていても、はさまって動けなくならない
  b.place(4.3, 0, -5); b.friend = [-9, 0, -9, 1];
  b.wait('床が上がりきる', () => w.movers[0].f === 1, 3);
  assert.equal(w.blocked(p.x, p.z, p.y), w.movers[0].box, '検査の前提：上がった床が体に重なっている');
  run(b, 0.5, -1, 0); assert.ok(p.x < 4.0 && !w.blocked(p.x, p.z, p.y), `上がった床の横から動けない (x=${p.x})`);
  assert.equal(b.falls, 0);
});

group('プレス機：crush: true の動く床だけがつぶす。ほかの動く床は体をすり抜け、壁へ押しこまない', () => {
  const press = crush => ({ b: B(0, 4.5, 5, 3, 3, 2.5, 4), to: [0, -1.9, 0], mode: 'hold', on: [0], crush });   // 下りると、地面から 0.1m 上まで来る
  const pan = { b: B(-6, 3, 5, 3, 3, 0.4, 3), to: [0, -2.9, 0], mode: 'hold', on: [0] };                       // うすい床：下りきると上面が 0.1
  const wall = B(8, 3, -5, 1, 6, 3);                                                                            // x 7.5〜8.5
  const pusher = { b: B(3, 2, -5, 2, 1.2, 2, 4), to: [5, 0, 0], mode: 'hold', on: [0], speed: 9 };              // 東へ 5m。壁を通りぬけて止まる
  const make = crush => bot({ boxes: [floor, wall], plates: [P(-9, 0, -9)], movers: [press(crush), pan, pusher] });

  let b = make(false), { p, w } = b;
  b.place(1, 0, 5); b.friend = [-9, 0, -9, 1]; run(b, 2);
  assert.equal(b.falls, 0, 'crush のない床につぶされた');
  assert.equal(w.blocked(p.x, p.z, p.y), w.movers[0].box, '検査の前提：下りた床が体に重なっている');
  run(b, 1.5, 1, 0); assert.ok(p.x > 1.8 && !w.blocked(p.x, p.z, p.y), `下りた床の中から出られない (x=${p.x})`);

  b = make(false); ({ p, w } = b);
  b.place(-6, 0, 5); b.friend = [-9, 0, -9, 1]; run(b, 2);
  assert.ok(b.falls === 0 && near(p.y, 0.1) && p.on === w.movers[1].box, `下りてきたうすい床の上に乗れていない (y=${p.y})`);

  b = make(false); ({ p, w } = b);
  b.place(5.5, 0, -5); b.friend = [-9, 0, -9, 1];
  for (let i = 0; i < 2 * FPS; i++) { b.tick(); assert.ok(w.blocked(p.x, p.z, p.y) !== wall && p.x <= 7.2 + 1e-9, `押し出し壁に、壁の中へ押しこまれた (x=${p.x})`); }
  assert.equal(w.movers[2].f, 1); assert.equal(b.falls, 0);
  run(b, 1.5, -1, 0); assert.ok(p.x < 6.7 && !w.blocked(p.x, p.z, p.y), `押し出し壁と壁の間から出られない (x=${p.x})`);

  b = make(true);
  b.place(1, 0, 5); b.friend = [-9, 0, -9, 1]; run(b, 2);
  assert.equal(b.falls, 1, 'crush: true のプレス機につぶされない');
});

group('セーブ地点：最後にふれた地点が、やり直しの場所になる', () => {
  const b = bot({ cps: [CP(0, 0, 0, 'a'), CP(7, 0, 0, 'b'), CP(-7, 0, 0, 'c', 1)] }), { p } = b;
  let caught = 0; const push = p.events.push.bind(p.events); p.events.push = e => { caught += e === 'cp'; return push(e); };
  assert.deepEqual([p.cp, p.near, [...p.seen], caught], [0, 0, [0], 0], '出発点に下りただけで「セーブ」になる');
  b.go([3.5, 0]); assert.deepEqual([p.cp, p.near, caught], [0, -1, 0]);              // どの地点の外でもない
  b.go([7, 0]); assert.deepEqual([p.cp, p.near, [...p.seen], caught], [1, 1, [0, 1], 1]);
  p.jump(); run(b, 2); assert.equal(caught, 1, '地点の中で跳ぶたびに「セーブ」になる');
  b.go([0, 0]); assert.deepEqual([p.cp, p.near, caught], [0, 0, 2], '前の地点へ戻っても、そこがやり直しの場所にならない');
  b.go([-5.5, 0]); assert.deepEqual([p.cp, p.near], [0, -1], '半径 1 の地点に、1.5m 手前でふれたことになる');
  b.go([-6.5, 0]); assert.deepEqual([p.cp, p.near, [...p.seen].sort(), caught], [2, 2, [0, 1, 2], 3]);
  b.go([-3, 0]); b.go([-6.5, 0]); assert.deepEqual([p.cp, caught], [2, 3], 'いまの地点に入りなおしただけで「セーブ」になる');
  b.place(-7, -13, 0); b.tick();                                                    // 落ちた
  assert.ok(b.falls === 1 && p.y > 10 && Math.hypot(p.x + 7, p.z) < 1, `最後にふれた地点の真上に戻っていない ${b.where()}`);
});

group('信号と条件：w.test（全部・どれか・need 個・重さ・not）と、w.step の体の重さ', () => {
  const gate = extra => ({ b: B(11, 0, 0, 1, 1, 0.5, 4), to: [0, 2, 0], mode: 'hold', on: [0, 1], ...extra });
  const b = bot({ plates: [P(-9, 0, -9), P(-6, 0, -9), P(-3, 0, -9)], movers: [gate(), gate({ any: true })], winds: [wind(9, 9, 2, 2, 0, 3, [1, 2])],
    objective: { label: 'でんち', on: [0, 1], need: 2 }, yaw: 1, deco: [B(0, 9, 0, 1, 1, 1), { beacon: [3, 0, 3], color: '#ff0000' }] });   // 見た目だけの項目は、あっても動きに関わらない
  const { w } = b, on = (...i) => i.map(k => [w.plates[k].x, 0, w.plates[k].z]);
  const step = bodies => { for (let i = 0; i < FPS; i++) w.step(1 / FPS, 0, bodies); };
  assert.equal(w.list.length, 3, '見た目だけの deco が、当たりのある箱に入っている');
  step(on(0));                                                                      // 重さを省いた体は 1。grips も省ける
  assert.deepEqual(w.plates.map(k => [k.down, k.load]), [[true, 1], [false, 0], [false, 0]]);
  assert.deepEqual([w.test({}), w.test({ not: true }), w.test({ on: [0, 1] }), w.test({ on: [0, 1], any: true }), w.test({ on: [0, 1, 2], need: 1 }), w.test({ on: [0, 1, 2], need: 2 })],
    [true, true, false, true, true, false]);
  assert.deepEqual([w.test({ on: [0, 1], not: true }), w.test({ on: [0], not: true }), w.test({ on: [0], load: 2 }), w.test({ on: [1, 2], any: true })], [true, false, false, false]);
  assert.deepEqual([w.movers[0].f, w.movers[1].f, w.winds[0].active], [0, 1, false], '「全部」の門が 1 枚で開く／「どれか」の門が開かない');
  step([[-9, 0, -9, 2], [-3, 0, -9]]);                                              // 軽い箱を持った人（重さ 2）と、もう 1 人
  assert.deepEqual([w.test({ on: [0], load: 2 }), w.test({ on: [0, 2], load: 2 }), w.test({ on: [0, 2], load: 2, any: true }), w.test({ on: [0, 1, 2], need: 2 }), w.test({ on: [0, 1, 2], need: 2, not: true })],
    [true, false, true, true, false]);
  assert.equal(w.winds[0].active, true, 'kit.wind の on は「どれか 1 枚」のはず');
  step(on(0, 1)); assert.equal(w.movers[0].f, 1, '「全部」の門が、2 枚押しても開かない');
});

group('空中でつかむ：押している間ずっと、縁に届いたとたんにつかまる', () => {
  const ledge = B(0, 2.4, 8, 6, 4, 3.4), b = bot({ boxes: [floor, ledge], crates: [{ x: 5, y: 0, z: 0, s: 0.8 }] }), { p } = b;
  b.place(0, 0, 5.69); p.ry = 0; p.jump(); p.grabStart();                           // 跳んだ直後に押す（縁にはまだ届かない）
  assert.equal(p.hang, null, '空中で、ふつうの壁に張りついた');
  hold(b, '押したまま前へ倒して、縁をよじ登る', 0, 1, () => p.grounded && !p.hang && near(p.y, 2.4));
  p.grabEnd(); b.place(0, 0, 5.69); p.ry = 0; p.jump(); run(b, 1.5, 0, 1);
  assert.ok(!p.hang && near(p.y, 0), '「つかむ」を押していないのに、ぶら下がった');
  p.grabStart(); assert.ok(p.hang?.flat && !p.hang.climb, '地面からは、届かない壁に張りつくはず'); p.grabEnd();
  b.grab(0); b.go([0, 5.2]); p.ry = 0; p.jump();                                    // 箱を持っている間は、手がふさがっている
  for (let i = 0; i < FPS; i++) { b.tick(0, 1); assert.equal(p.hang, null, '箱を持ったまま、縁につかまった'); }
});

group('でんちとソケット：でんちだけが入り、かぞえ錠は need 個で開く', () => {
  const lock = (z, extra) => ({ b: B(11, 0, z, 1, 3, 0.5, 3), to: [0, 2, 0], mode: 'hold', on: [0, 1, 2], ...extra });
  const b = bot({ plates: [socket(-4, 0, 5), socket(0, 0, 5), socket(4, 0, 5), P(7, 0, -5)], movers: [lock(-4, { need: 2 }), lock(0, { need: 3 }), lock(4, { need: 2, not: true })],
    crates: [cell(-4, 0, -3), cell(0, 0, -3), cell(4, 0, -3), { x: -7, y: 0, z: -3, s: 0.8 }] });
  const { w, p } = b, [k0, k1] = w.plates, [m2, m3, mNot] = w.movers, [c0, c1, c2, box] = w.crates;
  b.go([-4, 5]); run(b, 0.5); assert.ok(!k0.down && k0.load === 0, '体でソケットが押された');
  b.grab(3); b.put(-4, 5); run(b, 1); assert.ok(!k0.down && Math.hypot(box.x + 4, box.z - 5) < 0.5, 'ふつうの箱でソケットが押された');
  b.grab(3); b.put(-9, 2);
  b.carry(0, 0); c0.moved = false; run(b, 2);
  assert.ok(Math.hypot(c0.x + 4, c0.z - 5) < 0.01 && !c0.moved, `でんちがソケットのまん中へ寄っていない (${c0.x}, ${c0.z})`);
  assert.deepEqual([m2.f, m3.f, mNot.f], [0, 0, 1], '2 個いる錠が、でんち 1 個で動いた');
  b.carry(1, 1); b.wait('2 個めで錠が開く', () => m2.f === 1 && mNot.f === 0, 4); assert.equal(m3.f, 0, '3 個いる錠が、2 個で動いた');
  b.grab(2); b.put(0, 5); run(b, 1);                                                // 入っているソケットへ、もう 1 個を置こうとする（上に積まれるか、横に置かれる）
  assert.ok(Math.max(Math.abs(c2.x - c1.x), Math.abs(c2.y - c1.y), Math.abs(c2.z - c1.z)) >= 0.8 - 1e-6 && k1.load === 1 && Math.hypot(c1.x, c1.z - 5) < 0.01, '入っているソケットに、でんちが重なって入った');
  b.grab(0); b.tick(); assert.ok(!k0.down, 'でんちを持ち上げても、ソケットが押されたまま');
  move(c2, 4, 0, -3); p.grabEnd(); move(c0, 0.85, 0, 5); run(b, 1);                 // となりにぴったり置いても、まん中の 1 個に重なるまでは寄らない
  assert.ok(c0.x - c1.x >= 0.8 - 1e-6, `ソケットの中のでんちに、もう 1 個が重なった (${c0.x - c1.x})`);
  b.wait('1 個に減ると錠が戻る', () => m2.f === 0 && mNot.f === 1, 4);
  b.grab(0, [1.8, 4]); b.put(7, -5); b.wait('でんちは、ふつうのふみ板も押せる', () => w.plates[3].down, 3);
  move(c2, 4, -13, -3); b.tick(); assert.deepEqual([c2.x, c2.y, c2.z], [4, 0, -3], '落としたでんちが、元の場所へ戻らない');
  b.carry(0, 0); b.carry(2, 2); b.wait('3 個で、3 個いる錠が開く', () => m3.f === 1, 4);
});

group('おもさ板：重さの合計が need 以上で押され、足りなくなっても 0.4 秒は押されたまま', () => {
  const b = bot({ boxes: [floor, B(-6, 1, 6.6, 3, 1, 1)], plates: [WP(0, 0, 5, 2), WP(-6, 0, 5, 2), P(6, 0, 5), WP(7, 0, -7, 2)],
    crates: [{ x: 3, y: 0, z: -3, s: 0.8 }, { x: 5, y: 0, z: -3, s: 0.8 }, { x: -6, y: 0, z: 1, s: 1.4, heavy: true }, { x: 7, y: 0, z: -7, s: 0.8, mass: 2 }] });
  const { w, p } = b, [wp, wpHeavy, plain, wpMass] = w.plates;
  assert.deepEqual([wp.down, wpHeavy.down, plain.down, wpMass.down, wpMass.load], [false, false, false, true, 2], 'mass: 2 の箱 1 個で押されるはず');
  b.go([0, 5]); run(b, 0.5); assert.deepEqual([wp.down, wp.load], [false, 1], '1 人で押された');
  b.go([0, 1]);
  b.friend = [0, 0, 5, 2]; b.tick(); assert.ok(wp.down, '重さ 2 の体で押されない');
  b.friend = null; b.tick(); b.friend = [0, 0, 5, 2]; run(b, 0.2); assert.ok(wp.down, '1 コマ外れただけで、ちらついた');
  b.friend = null; run(b, 0.3); assert.ok(wp.down && wp.load === 0, '0.4 秒たつ前に戻った');
  run(b, 0.2); assert.ok(!wp.down, '0.5 秒たっても押されたまま');
  b.friend = [6, 0, 5, 1]; b.tick(); assert.ok(plain.down); b.friend = null; b.tick(); assert.ok(!plain.down, 'ふつうのふみ板まで、押されたままになる');
  b.grab(0); b.go([0, 5]); run(b, 0.2); assert.deepEqual([wp.down, wp.load], [true, 2], '箱を持って乗っても押されない');
  b.go([0, 2.5]); b.put(-0.7, 5); b.go([0, 2.5]); run(b, 0.6); assert.deepEqual([wp.down, wp.load], [false, 1], '軽い箱 1 個で押された');
  b.grab(1); b.put(0.7, 5); b.go([0, 2.5]); run(b, 0.2); assert.deepEqual([wp.down, wp.load], [true, 2], '軽い箱 2 個で押されない');
  assert.deepEqual([w.test({ on: [0], load: 2 }), w.test({ on: [0], load: 3 })], [true, false]);
  b.grab(1); b.go([0, 2.5]); run(b, 0.6); assert.deepEqual([wp.down, wp.load], [false, 1], '持ち上げた箱が、まだ数えられている'); p.grabEnd();
  b.push(2, [-6, -0.3], 0, 1); b.go([-6, 2]); run(b, 0.6); assert.deepEqual([wpHeavy.down, wpHeavy.load], [true, 2], `重い箱 1 個で押されない (z=${w.crates[2].z})`);
});

group('乗ると動く床：乗ると行き先へ、だれもいなくなると出発点へ帰る', () => {
  const tram = { b: B(7.5, 0, 0, 3, 3, 0.5, 3), to: [4, 0, 0], mode: 'ride' };                       // 西の島（x 〜6）から東の島（x 13〜）へ
  const lift = { b: B(0, 0.3, 5, 3, 3, 0.3, 3), to: [0, 3, 0], mode: 'ride', need: 2, speed: 1 };    // 2 人ぶんの重さで上がるリフト（地面の上に置いてある）
  const make = () => bot({ boxes: [B(-2, 0, 0, 16, 16, 1), B(18, 0, 0, 10, 10, 1)], movers: [tram, lift], crates: [{ x: -3, y: 0, z: -3, s: 0.8 }] });
  let b = make(), { w, p } = b, [t, l] = w.movers, c = w.crates[0];
  b.place(5.6, 0, 0); run(b, 2); assert.equal(t.f, 0, 'そばに立っただけで動き出した（乗る前に逃げてしまう）');   // 床の縁（x 6）の 0.4m 手前
  b.tram(0, [15, 0]); assert.ok(p.x > 13 && t.f < 0.03 && b.falls === 0);
  b.place(0, 0, -3);
  b.grab(0); b.put(6.55, 0); run(b, 3); assert.ok(c.on === t.box && t.f === 0, '箱だけで動き出した');
  b.go([5.6, 1.1]); b.go([7.5, 1.1]); b.wait('箱を乗せたまま向こう岸へ', () => t.f === 1, 4); assert.ok(near(c.x, 10.55, 0.4) && c.on === t.box);
  b.go([15, 1.1]); b.wait('箱を乗せたまま帰る', () => t.f === 0, 6); assert.ok(near(c.x, 6.55, 0.4) && c.on === t.box, `置いていった箱が、床と一緒に帰らない (x=${c.x})`);

  b.place(0, 0, 2); b.go([0, 5]); run(b, 3); assert.ok(l.f === 0 && l.wt === 1, '手ぶらの 1 人で、2 人ぶんのリフトが動いた');
  b.grab(0, [5.6, 0]); b.go([0, 5]); b.wait('箱を持って乗ると上がる', () => l.f === 1, 5); assert.ok(near(p.y, 3.3));
  p.grabEnd(); b.wait('箱を置くと 1 人ぶんに戻り、下りはじめる', () => l.f < 0.5, 6);
  b.friend = [0, l.box.y1, 5, 1]; b.tick(); assert.ok(l.rise, '2 人で乗っても上がらない'); b.friend = null;

  b = make(); ({ w, p } = b); [t, l] = w.movers;                                    // 遅れて見える仲間：床の後ろへ 0.5m はみ出ていても、乗っている扱い
  b.friend = [7.5, 0, 0, 1]; b.tick();
  for (let i = 0; t.f < 1; i++) { assert.ok(i < 4 * FPS, '少しはみ出た仲間を、乗っていない扱いにした'); b.friend = [t.box.x0 - 0.5, 0, 0, 1]; b.tick(); }
  b.friend = null; run(b, 1.4); assert.equal(t.f, 1, 'だれもいなくなって 1.5 秒たつ前に帰りはじめた');
  run(b, 0.3); assert.ok(t.f < 1, '1.5 秒たっても帰らない');
  b.wait('出発点へ帰る', () => t.f === 0, 4);
  b.friend = [0, 0.3, 5, 2]; b.wait('リフトが上がる', () => { b.friend[1] = l.box.y1; return l.f === 1; }, 5);
  b.go([0, 5]); b.friend = null;                                                    // 上がったリフトの真下に立つ
  b.wait('下りてきたリフトは体をすり抜け、体は上に乗る', () => l.f === 0, 8);
  assert.ok(b.falls === 0 && near(p.y, 0.3) && p.on === l.box, `下りてきたリフトの上に乗れていない ${b.where()}`);
});

group('せんぷうき箱：置いてある間だけ真上に風。持っている間は浮かない。つかまなければ 6.5m の段には届かない', () => {
  const low = B(-8, 4, 6, 6, 6, 5), high = B(8, 6.5, 6, 6, 6, 7.5);                 // 風で上がれる段（4m）と、上がれない段（6.5m）。どちらも南の面が z 3
  const make = () => bot({ boxes: [floor, low, high], crates: [fan(0, 0, -4), { x: 3, y: 0, z: -4, s: 0.8 }] });
  let b = make(), { w, p } = b, [f, box] = w.crates, zone = w.winds[0];
  assert.deepEqual([zone.active, zone.x0, zone.x1, zone.z0, zone.z1, zone.y0, zone.y1], [true, -1, 1, -5, -3, 0.9, 4.3]);
  b.place(0.85, 0, -4); run(b, 1); assert.ok(p.grounded && p.y === 0, '箱の横の地面に立っているだけで浮いた');
  p.jump(); let top = 0, dip = 99;
  for (let i = 0; i < 12 * FPS; i++) { b.tick(Math.sign(-p.x) * (Math.abs(p.x) > 0.05), 0); top = Math.max(top, p.y); if (i > 4 * FPS) dip = Math.min(dip, p.y); }
  assert.ok(top > 5.0 && top < 5.7 && dip > 3.5, `風で浮く高さがちがう（いちばん上 ${top}、浮いている間のいちばん下 ${dip}）`);
  b.go([-3, -4]);
  move(box, 0, 0.8, -4); run(b, 2); assert.deepEqual([box.y, f.y, box.on], [0.8, 0, f.box], '風で、箱が浮いた');
  move(box, 3, 0, -4); run(b, 0.1);
  b.go([-3, -2]); b.grab(1, [3, -2.95]); b.place(0.9, 0, -4); p.jump(); b.wait('ほかの箱を持ったままでも浮く', () => p.y > 3 && p.carry === box, 3);
  b.go([3, -4]); p.grabEnd(); b.go([3, -2]); b.go([-1.5, -2]);
  b.grab(0); assert.equal(zone.active, true); b.tick(); assert.equal(zone.active, false, '持っている間も風が出ている');
  p.jump(); top = 0; for (let i = 0; i < 1.5 * FPS; i++) { b.tick(); top = Math.max(top, p.y); }
  assert.ok(top < 1.3, `せんぷうき箱を持ったまま浮いた (${top})`);
  p.grabEnd(); run(b, 0.5); assert.equal(zone.active, true);
  move(f, f.x, 6, f.z); run(b, 0.2); assert.equal(zone.active, false, '落ちている間も風が出ている');
  run(b, 2); assert.ok(zone.active && near(zone.y0, 0.9));
  move(f, f.x, -13, f.z); b.tick(); b.tick(); assert.deepEqual([f.x, f.y, f.z, zone.x0, zone.z0], [0, 0, -4, -1, -5], '落とした箱が元の場所へ戻らない');
  b.fanUp(0, [-8, 2], 4, [-8, 5]); assert.ok(near(p.y, 4) && b.falls === 0, `風で 4m の段に上がれない ${b.where()}`);

  for (const cargo of [false, true]) {                                             // 6.5m の段：つかまなければ（荷物を持っていれば、つかめない）届かない
    b = make(); ({ w, p } = b); [f, box] = w.crates;
    b.grab(0); b.put(8, 2); if (cargo) b.grab(1);
    b.go([f.x, f.z - 0.95]); b.face(f.x, f.z); run(b, 0.3); p.jump(); top = 0;
    for (let i = 0; i < 20 * FPS; i++) { b.tick(Math.sign(8 - p.x) * (Math.abs(8 - p.x) > 0.05), 1); top = Math.max(top, p.y); assert.ok(!(p.grounded && p.y > 6), '風で 6.5m の段に乗れてしまう'); }
    assert.ok(top > 5 && top < 6.5 - 0.35 && (!cargo || p.carry === box), `6.5m の段に届く高さまで浮いた (${top})`);
  }
});

group('あみ：手ぶらで登れる。てっぺんの近くで、ふつうのぶら下がりに変わる', () => {
  const north = net(B(0, 5, 9, 6, 4, 6)), west = net(B(-9, 5, 0, 2, 6, 6), 'e'), plain = B(9, 5, 0, 2, 6, 6), hung = net(B(0, 5, -9, 6, 2, 3));   // hung は下の端が地面から 2m 上
  const panel = net(B(10.1, 5, 0, 0.2, 2, 6)), low = net(B(8, 1.5, 9, 4, 4, 2.5));  // あみのない壁の東の面に重ねた、うすいあみの板（壁より先に書く）と、手の届く高さのあみ
  const b = bot({ boxes: [floor, north, west, panel, plain, hung, low], crates: [{ x: 4, y: 0, z: 0, s: 0.8 }] }), { p } = b;
  b.place(8, 0, 6.69); p.ry = 0; p.grabStart();
  assert.ok(p.hang?.b === low && !p.hang.flat && !p.hang.climb, 'てっぺんに手が届くあみは、ふつうにぶら下がるはず'); p.grabEnd();
  b.place(0.5, 0, 6.6); p.ry = 0.4; p.grabStart();
  assert.ok(p.hang?.climb && p.hang.b === north && p.ry === 0, 'あみをつかめない／あみにまっすぐ向いていない');
  run(b, 1, 0, 1); assert.ok(near(p.y, 1.2, 0.1) && near(p.x, 0.5), `登る速さがちがう (y=${p.y})`);
  run(b, 1, 1, 0); assert.ok(near(p.x, 1.5, 0.1) && near(p.y, 1.2, 0.1), `横へ動く速さがちがう (x=${p.x})`);
  hold(b, '下りきると、地面に立つ', 0, -1, () => !p.hang); b.tick();
  assert.ok(p.grounded && p.y === 0);
  p.grabEnd(); p.grabStart(); run(b, 1, 0, 1);
  hold(b, '横へ外れると、手が放れる', 1, 0, () => !p.hang);
  assert.ok(p.x >= 3.3 && p.y > 1, `あみの横の端より先まで張りついている ${b.where()}`);
  hold(b, '「つかむ」を押したままでも、地面まで落ちる', 1, 0, () => p.grounded && p.y === 0, 1.5); p.grabEnd();
  b.place(0, 0, 6.69); p.ry = 0; p.grabStart(); let swap = null;                    // てっぺんの近くで、ふつうのぶら下がりに変わる高さ
  for (let i = 0; i < 8 * FPS && (p.hang || p.y < 5); i++) { b.tick(0, 1); if (swap == null && p.hang && !p.hang.flat) swap = p.y; }
  assert.ok(near(swap, 5 - REACH, 0.1) && p.grounded && p.y === 5, `ぶら下がりに変わる高さがちがう (${swap})／登りきれない ${b.where()}`);
  p.grabEnd();

  b.place(0, 0, 5.3); p.ry = 0; p.jump(); p.grabStart(); assert.equal(p.hang, null);   // 空中で押したまま近づくと、あみにつかまる
  hold(b, '空中であみにつかまる', 0, 1, () => p.hang, 1);
  assert.ok(p.hang.climb && p.y > 0.1); p.grabEnd(); b.wait('着地', () => p.grounded, 2);

  b.grab(0); b.go([0, 6.69]); b.face(0, 9);
  assert.ok(p.grabStart() === null && !p.hang, '箱を持ったまま、あみをつかめた');
  p.jump(); for (let i = 0; i < FPS; i++) { b.tick(0, 1); assert.equal(p.hang, null, '箱を持ったまま、空中であみにつかまった'); }
  b.go([0, 3]); p.grabEnd();

  b.go([7.69, 0]); assert.throws(() => b.go([9, 0], null, 4), 'あみのない同じ高さの壁を、登れてしまう');
  b.place(7.69, 0, 0); p.ry = Math.PI / 2; p.grabStart(); run(b, 1, 1, 0);
  assert.ok(p.hang?.flat && !p.hang.climb && p.y === 0, 'あみのない壁を登れた'); p.grabEnd();
  b.place(-9, 0, -3.31); p.ry = 0; p.grabStart();                                   // climbFaces: 'e' の箱の、南の面
  assert.ok(p.hang?.flat && !p.hang.climb, '登れる面をしぼったのに、ほかの面も登れる'); p.grabEnd();
  b.place(0, 0, 0); b.climb([-7.69, 0], [-9, 0]); assert.ok(p.grounded && p.y === 5 && b.falls === 0, `あみを登りきれない ${b.where()}`);
  b.place(11.4, 0, 0); b.climb([10.51, 0], [9, 0]); assert.ok(p.grounded && p.y === 5 && b.falls === 0, `壁に重ねたあみの板を登りきれない ${b.where()}`);

  b.place(0, 0, -7.69); p.ry = Math.PI; p.grabStart(); assert.equal(p.hang, null, '手の届かない高さのあみを、地面からつかめた');
  p.grabEnd(); p.jump(); p.grabStart(); b.wait('跳べば、下の端に届く', () => p.hang, 1);
  assert.ok(p.hang.climb && p.hang.b === hung && Math.abs(Math.sin(p.ry)) < 1e-9 && Math.cos(p.ry) === -1);
  hold(b, '下の端から外れると、「つかむ」を押したままでも地面まで落ちる', 0, 1, () => p.grounded && p.y === 0, 1.5);
});

group('てんびん：A に荷があり、B がそれ以上に重いと A が上がる（同じ重さなら上がる）。A が空になると元へ戻る', () => {
  const H = 2.95, deck = B(-7, 3, 0, 6, 8, 4), stopper = B(-2.25, 4.2, 0, 0.3, 3, 1.2, 1), upper = B(4.8, 3, 0, 6, 8, 0.5);   // 上の台（x -10〜-4）・B の皿の先の止め・A の皿の東の上段
  const panA = { b: B(1, 0.05, 0, 1.6, 3, 0.4, 3), to: [0, H, 0], mode: 'scale', pair: 'q', side: 'A' };
  const panB = { b: B(-3.2, 3, 0, 1.6, 3, 0.4, 3), to: [0, -H, 0], mode: 'scale', pair: 'q', side: 'B' };
  const make = () => {
    const b = bot({ boxes: [floor, deck, stopper, upper], movers: [panA, panB], crates: [cell(5, 0, -6), { x: -7, y: 3, z: 0, s: 1.4, heavy: true }, { x: 5, y: 0, z: 6, s: 0.8 }] });
    const step = b.w.step; b.w.step = (...a) => { step(...a); assert.equal(b.w.movers[0].f, b.w.movers[1].f, '2 枚の皿の動きがずれた'); };
    return b;
  };
  let b = make(), { w, p } = b, [A, Bp] = w.movers, [c, block, box] = w.crates;
  run(b, 1); assert.equal(A.f, 0);
  b.grab(0); b.put(1, 0); b.go([5, -6]); run(b, 2);
  assert.ok(c.on === A.box && A.wt === 1 && A.f === 0, 'B が空なのに A が上がった');
  b.place(-8.3, 3, 0); b.push(1, [-8.3, 0], 1, 0);
  assert.ok(near(block.x, -3.1, 0.05) && block.on === Bp.box, `重い箱が、止めの手前で皿のまん中に止まらない (x=${block.x})`);
  b.wait('B が沈み、A がでんちを乗せて上がる', () => A.f === 1, 6);
  assert.ok(near(c.y, 3) && near(block.y, 0.05), `でんちが上の高さに着いていない (y=${c.y})`);
  b.place(4, 3, 0); b.go([1.6, 0.9]); run(b, 1.5); assert.deepEqual([A.wt, Bp.wt, A.f], [2, 2, 1], '同じ重さ（2 対 2）で A が下がった');
  b.face(c.x, c.z); assert.equal(p.grabStart(), c); run(b, 1.5); assert.deepEqual([A.wt, A.f], [2, 1], 'でんちを持ち上げたら A が下がった');
  b.go([4, 0]); b.wait('A が空になると元へ戻る', () => A.f === 0, 8);
  assert.ok(near(block.y, 3) && block.on === Bp.box && b.falls === 0, `重い箱が上の台の高さに戻っていない (y=${block.y})`);
  run(b, 2); assert.equal(A.f, 0, 'A が空なのに動いた');

  b = make(); ({ w, p } = b); [A, Bp] = w.movers; [c, block, box] = w.crates;
  const onB = wt => [-3.2, Bp.box.y1, 0, wt];
  b.go([1, 0.9]); b.friend = onB(1); b.tick(); run(b, 1);                          // 1 対 1：同じ重さなら上がる。速さは毎秒 0.8m
  assert.ok(near(A.f, 0.8 / H, 0.03) && near(p.y, 0.05 + A.f * H), `上がる速さがちがう (f=${A.f})`);
  b.friend = null; const f0 = A.f; run(b, 0.5); assert.ok(A.f > f0, 'B が軽くなって 0.6 秒たつ前に下がりはじめた');
  run(b, 0.3); const f1 = A.f; run(b, 0.2); assert.ok(A.f < f1, 'B が軽くなって 0.6 秒たっても上がりつづける');
  b.wait('元へ戻る', () => A.f === 0, 4);
  b.grab(2, [5, 5.05]); b.go([1, 0.9]); b.friend = onB(1); run(b, 2);               // 2 対 1：A のほうが重いと上がらない
  assert.deepEqual([A.wt, Bp.wt, A.f], [2, 1, 0], 'A のほうが重いのに上がった');
  b.go([4, 0.9]); p.grabEnd(); run(b, 1);
  move(c, 1, 0.05, 0); b.friend = onB(2); b.wait('でんちだけを乗せた A が上がる', () => { b.friend = onB(2); return A.f === 1; }, 6);
  b.go([1, 1]); b.friend = null;                                                    // 上がった A の真下に立つ
  b.wait('下りてきた皿は体をすり抜け、体は上に乗る', () => A.f === 0, 8);
  assert.ok(b.falls === 0 && near(p.y, 0.05) && p.on === A.box, `下りてきた皿の上に乗れていない ${b.where()}`);
});

group('カタパルト：条件が合う間だけ打ち出す。板の重さでねらいが変わる', () => {
  const pad = () => launcher(0, 0.1, 2.5, [{ on: [0], v: [0, 11, 12] }, { on: [0], load: 2, v: [-8.5, 12, 8.5] }]);
  const mid = B(0, 0, 15, 6, 6, 1), roof = B(-8.7, 3, 11.2, 6, 6, 1);              // 近いねらいと、遠いねらいの着地点を中心にした 6m 四方の島
  const make = () => { const la = pad(); return [bot({ boxes: [B(0, 0, 0, 8, 8, 1), la, mid, roof], plates: [WP(-2.5, 0, -1)], crates: [{ x: 2.5, y: 0, z: -1.6, s: 0.8 }, { x: 2.5, y: 0, z: -3, s: 0.8 }] }), la]; };
  const fly = b => { b.go([0, 2.5], () => !b.p.grounded && b.p.vy > 3, 6); b.wait('着地', () => b.p.grounded, 6); return b.w.groundBox(b.p.x, b.p.z, b.p.y); };
  let [b, la] = make(), { w, p } = b;
  b.go([0, 2.5]); run(b, 1); assert.ok(p.grounded && near(p.y, 0.1) && la.aimV === null, '条件が合っていないのに打ち出された');
  b.friend = [-2.5, 0, -1, 1]; b.tick();                                            // 仲間が板に乗ったとたん、上に立っている人が飛ぶ
  assert.ok(!p.grounded && p.vy > 3, '板が押されても、乗っている人が飛ばない');
  b.wait('着地', () => p.grounded, 6); assert.equal(w.groundBox(p.x, p.z, p.y), mid);
  b.place(0, 0.1, 2.5); b.tick(); assert.ok(!p.grounded && p.vy > 3, '条件が合っている間に乗りなおしても、飛ばない');
  b.friend = null; b.wait('着地', () => p.grounded, 6);

  [b, la] = make(); ({ w, p } = b);                                                 // 箱 1 個：近いねらい。もう 1 個は手に持ったまま飛ぶ
  b.carry(0, 0); b.grab(1); assert.equal(fly(b), mid, `近いねらいの島に着地していない ${b.where()}`);
  assert.ok(p.carry === w.crates[1] && near(w.crates[1].y, p.y + 0.55) && b.falls === 0, '持っていた箱を、飛んでいる間に落とした');

  [b, la] = make(); ({ w, p } = b);                                                 // 箱 2 個：遠いねらい。台の上に置いた箱は飛ばない
  b.grab(0); b.put(-2.5, -1.7); b.grab(1); b.put(-2.5, -0.3); b.wait('重さ 2', () => w.plates[0].load === 2, 2);
  assert.deepEqual(la.aimV, [-8.5, 12, 8.5], '条件が合うねらいのうち、最後に書いたものが選ばれていない');
  assert.equal(fly(b), roof, `遠いねらいの島に着地していない ${b.where()}`); assert.ok(near(p.y, 3) && b.falls === 0);
  move(w.crates[1], 0, 0.1, 2.5); run(b, 1); assert.ok(w.crates[1].y === 0.1 && la.aimV, '台の上の箱が打ち出された');

  // 何もしないで飛んだときの、てっぺんの高さ（台から）と、台から T m 上を落ちながら通るときの水平距離（60 コマでの実測。20 コマでも 0.25m 以内）
  for (const [v, apex, at] of [[[0, 9, 7], 4.0, { 0: 6.7 }], [[0, 9, 10], 4.0, { 0: 9.6 }], [[0, 11, 12], 6.0, { 0: 12.5, 3: 11.7 }], [[0, 12, 12], 7.1, { 0: 12.9, 3: 12.3 }],
    [[0, 12, 15], 7.1, { 0: 16.1, 3: 15.4 }], [[0, 13, 5.6], 8.3, { 5: 5.7, 8: 5.0 }], [[0, 14, 6], 9.7, { 8: 6.0 }], [[-8.5, 12, 8.5], 7.1, { 0: 12.9, 3: 12.3 }]]) {
    const t = bot({ kill: -40, boxes: [B(0, 0, -6, 4, 6, 1), launcher(0, 0.1, 0, [{ v }, { on: [0], not: true, v }, { on: [0], v: [0, 1, 0] }])], plates: [P(0, 0, -8)], cps: [CP(0, 0, -6)] }), q = t.p;
    t.place(0, 0.1, 0); t.tick(); let top = 0, prev = [q.x, q.y, q.z]; const got = {};
    while (q.y > -1) {
      t.tick(); top = Math.max(top, q.y - 0.1);
      for (const T in at) if (got[T] == null && q.vy < 0 && prev[1] - 0.1 >= T && q.y - 0.1 < T) { const k = (prev[1] - 0.1 - T) / (prev[1] - q.y); got[T] = Math.hypot(prev[0] + (q.x - prev[0]) * k, prev[2] + (q.z - prev[2]) * k); }
      prev = [q.x, q.y, q.z];
    }
    assert.ok(near(top, apex, 0.3), `[${v}] のてっぺんが ${apex} でなく ${top.toFixed(2)}`);
    for (const T in at) assert.ok(near(got[T], at[T], 0.25), `[${v}] が台から ${T}m 上を通る距離が ${at[T]} でなく ${got[T]?.toFixed(2)}`);
  }
});

group('レールの箱：レールの向きに、端から端までだけ動く。落ちない。どこでも重さ 0。1 人で動かせる。台車は踏み台になる', () => {
  const shelf = B(11, 3.8, -6, 2, 4, 4.8);                                          // 高さ 3.8m の段（西の面が x 10）。台車は、東の端（まん中が x 9.3）で、この段にぴったり付く
  const gate = (x, on) => ({ b: B(x, 0, 10, 1, 1, 0.5, 4), to: [0, 2, 0], mode: 'hold', on: [on] });   // レバーの端ごとに上がる橋のかわり
  const panA = { b: B(-6, 0.05, -6, 1.6, 3, 0.4, 3), to: [0, 2, 0], mode: 'scale', pair: 'q', side: 'A' };
  const panB = { b: B(-9, 2.05, -6, 1.6, 3, 0.4, 3), to: [0, -2, 0], mode: 'scale', pair: 'q', side: 'B' };
  const b = bot({ boxes: [floor, shelf], movers: [gate(-3, 0), gate(3, 1), panA, panB],
    plates: [railEnd(0, 'min'), railEnd(0, 'max'), P(4, 0, 4.5), WP(5, 0, -6, 2), socket(-6, 2, 6)],   // つまみの下にふみ板、台車の下におもさ板、宙に浮いた箱の下にソケット
    // つまみのレールは x 4〜5.6。z も 4.5 にして、「レールと直角に動かない」のが、端の決まり（min〜max）のおかげではないことを確かめる
    crates: [lever(4, 0, 4.5, 'x'), cart(5, 0, -6, 'x', 5, 9.3), { ...cart(-6, 2, 6, 'z', 6, 6), tag: 'cell' }, cart(-9, 2.05, -6, 'z', -6, -6), { x: 6, y: 0, z: 8, s: 1.4, heavy: true }] });
  const { w, p } = b, [knob, car, floating, onPan, plain] = w.crates, [atMin, atMax, under, wp, sock] = w.plates, [gMin, gMax, A, Bp] = w.movers;
  assert.deepEqual([w.stage.crates[0], w.stage.crates[1], railEnd(3, 'max')], [{ x: 4, y: 0, z: 4.5, s: 0.6, heavy: true, solo: true, rail: { axis: 'x', min: 4, max: 5.6 } },
    { x: 5, y: 0, z: -6, s: 1.4, heavy: true, solo: true, rail: { axis: 'x', min: 5, max: 9.3 } }, { kind: 'rail', crate: 3, at: 'max' }], 'kit の lever・cart・railEnd が作るデータがちがう');
  const one = 1.3 / FPS;                                                            // 押しつづけたときに 1 コマで進む長さ（毎秒 1.2m）に、少しのゆとり。レールの端では、ここまで手前で止まる
  b.friend = [-6, 0.05, -6, 1]; run(b, 2); b.friend = null;                         // A の皿に仲間が 1 人。B の皿には、レールの箱だけ
  assert.deepEqual([atMin.down, atMin.load, atMax.down, gMin.f, gMax.f], [true, 1, false, 1, 0], 'つまみが min の端にあるのに、min の信号だけが押されていない');
  assert.deepEqual([under.load, wp.load, sock.load, under.down, wp.down, sock.down], [0, 0, 0, false, false, false], 'レールの箱が、ふみ板・おもさ板・ソケットを押した');
  assert.deepEqual([A.wt, Bp.wt, A.f], [1, 0, 0], 'てんびんが、皿の上のレールの箱を数えた');
  assert.deepEqual([floating.x, floating.y, floating.z, onPan.y], [-6, 2, 6, 2.05], '下に床のないレールの箱が、落ちた（か、元の場所へ戻った）');

  b.place(1.5, 0, 4.5); b.grab(0, [3.1, 4.5]); run(b, 1);                           // つまみの西に立って、つかむ（歩いてきた勢いで、つまみが少し動く。それが収まるまで待つ）
  const at = [knob.x, p.x], off = p.x - knob.x;
  run(b, 1, 0, 1); run(b, 1, 0, -1);
  assert.ok(near(knob.x, at[0], 0.01) && near(p.x, at[1], 0.01) && knob.z === 4.5 && p.z === 4.5, `レールと直角の向きに動いた (${knob.x}, ${knob.z}) ${b.where()}`);
  run(b, 1, -1, 0); assert.ok(knob.x >= 4 && knob.x < 4 + one && knob.z === 4.5, `min の端で止まらない (x=${knob.x})`);
  for (let i = 0; i < FPS; i++) p.step(1 / FPS, 1, 0, 'stuck');                     // 'stuck'（人数が足りない）を渡されても、solo の箱は 1 人で動かせる
  assert.ok(knob.x > 4.5 && knob.x < 5.2 && knob.z === 4.5 && near(p.x - knob.x, off, 1e-9), `solo: true の箱が、1 人で動かせない (x=${knob.x})`);
  b.tick(); assert.deepEqual([atMin.down, atMax.down], [false, false], 'つまみがまん中にあるのに、端の信号が押されている');
  p.grabEnd(); b.push(0, [knob.x - 0.9, 4.5], 1, 0);                                // 止まるまで東へ押す
  assert.ok(knob.x <= 5.6 && knob.x > 5.6 - one && knob.z === 4.5 && knob.y === 0, `max の端で止まらない (x=${knob.x})`);
  b.wait('max の端で、上がる橋が入れかわる', () => atMax.down && !atMin.down && gMin.f === 0 && gMax.f === 1, 3);
  const left = knob.x; run(b, 2); assert.equal(knob.x, left, '置いたレールの箱が、ひとりでに動いた');
  b.grab(0, [knob.x - 0.9, 4.5]); hold(b, '同じ側から引いて、min の端まで戻す', -1, 0, () => atMin.down && knob.x < 4 + one, 6);
  run(b, 1, -1, 0); assert.ok(knob.x >= 4 && p.grabEnd() === knob, `min の端より先へ動いた (x=${knob.x})`);
  b.wait('min の端で、上がる橋が元に戻る', () => gMin.f === 1 && gMax.f === 0, 3);
  b.place(3.5, 0, 8); b.grab(4, [4.7, 8]); run(b, 2); const rest = plain.x;         // ふつうの重い箱は、'stuck' では動かない（歩いてきた勢いが消えてから比べる）
  for (let i = 0; i < FPS; i++) p.step(1 / FPS, 1, 0, 'stuck');
  assert.ok(near(plain.x, rest, 0.001), `ふつうの重い箱が、'stuck' でも動いた (${plain.x - rest})`); p.grabEnd();

  b.place(9.6, 0, -6); p.ry = Math.PI / 2; p.jump(); p.grabStart(); run(b, 2, 1, 0);   // 台車なしでは、段に手が届かない
  assert.ok(!p.hang && p.grounded && p.y === 0, '台車がなくても、3.8m の段に手が届く'); p.grabEnd();
  b.place(2, 0, -6); b.push(1, [3.9, -6], 1, 0);
  assert.ok(car.x <= 9.3 && car.x > 9.3 - one && car.z === -6 && car.y === 0 && wp.load === 0, `台車が、レールの端（段のすぐ手前）で止まらない (x=${car.x})`);
  b.go([car.x, -6]); assert.ok(near(p.y, 1.4), `台車の上に登れない ${b.where()}`);
  b.face(11, -6); p.jump(); p.grabStart();
  hold(b, '台車の上から跳んでつかみ、3.8m の段へよじ登る', 1, 0, () => p.grounded && near(p.y, 3.8));
  p.grabEnd(); assert.equal(b.falls, 0);
});

group('まきあげハンドル：つかんでいる間だけ進み、放すと hold 秒止まってから戻る。箱より先につかむ。回している間は動かない', () => {
  const far = (x, h) => ({ b: B(x, 0, -9, 2, 2, 0.5, 3), to: [0, 12, 0], mode: 'crank', handles: [h], up: 2, hold: 3, down: 2 });   // 2 秒で 12m 上がる（ふつうの上限の毎秒 3.5m より速い）
  // 動く床：0 はハンドル 0 で動く／1 は同じハンドルで動く、秒数を省いた床（4・12・8 秒）／2 はリフト（上のハンドル 1 と、地面のハンドル 2）／3 は「仲間の端末」の役で、知らせだけで動かす
  const b = bot({ movers: [far(-9, 0), { b: B(-6, 0, -9, 2, 2, 0.5, 3), to: [0, 2, 0], mode: 'crank', handles: [0] },
      { b: B(6, 0.3, -5, 3, 3, 0.3, 3), to: [0, 3, 0], mode: 'crank', handles: [1, 2], up: 3, hold: 2, down: 2 }, far(-3, 3)],
    handles: [{ x: 0, y: 0, z: 5 }, { x: 7.1, y: 0.3, z: -5, ride: 2 }, { x: 3.4, y: 0, z: -5 }, { x: -9, y: 0, z: 9 }, { x: -9, y: 1.2, z: 5 }],
    crates: [{ x: 0.3, y: 0, z: 5.2, s: 0.8 }, { x: 5.2, y: 0.3, z: -5, s: 0.8 }], winds: [gust(0, 4.2, 3, 3, 0, 3, [2, 0])] });   // ハンドル 0 の前には、箱と、止まない横風。リフトの上には荷物
  const { w, p } = b, [fast, slow, lift, echo] = w.movers, [beside, cargo] = w.crates, H = w.handles;
  const grip = (x, z, ry) => { p.grabEnd(); b.place(x, 0, z); p.ry = ry; return p.grabStart(); };   // その場所に、その向きで立って「つかむ」

  assert.ok(grip(0, 4.2, 0) === null && p.crank === 0 && !p.carry, 'そばに箱があると、ハンドルをつかめない');
  run(b, 1, 1, 0.3);                                                                // 回している間は、歩けず、向きも変わらず、横風にも流されない
  assert.deepEqual([p.x, p.z, p.ry, p.crank], [0, 4.2, 0, 0], 'ハンドルを回している間に、動いた');
  assert.ok(near(fast.f, 0.5, 0.01) && near(slow.f, 0.25, 0.01), `up 秒で行ききる速さになっていない (${fast.f}, ${slow.f})`);
  assert.deepEqual([lift.f, echo.f], [0, 0], 'ほかのハンドルで動く床まで、動いた');
  fast.rel = { f: 0.1, t: 0 }; b.tick();                                            // つかんでいる間によそから届いた「放した」の知らせは、捨てられる
  assert.ok(fast.rel === null && fast.f > 0.5, 'つかんでいる間に、よそから書かれた rel で動いた');
  run(b, 1); assert.equal(fast.f, 1);
  p.grabEnd(); const f0 = slow.f; assert.equal(p.crank, null);
  run(b, 2.5); assert.deepEqual([fast.f, slow.f], [1, f0], '放してから hold 秒たつ前に、戻りはじめた');
  assert.ok(p.x > 1, '放したあとは、横風に流されるはず');
  echo.rel = { ...fast.rel };                                                       // 仲間の端末：放したときの f と時刻だけを受け取って書きこむ → 同じ式から、まったく同じ位置になる
  const both = seconds => { for (let i = 0; i < seconds * FPS; i++) { b.tick(); assert.equal(echo.f, fast.f, 'よそから rel を書きこんだ床が、ちがう位置になった'); } };
  both(1.5); assert.ok(near(fast.f, 0.5, 0.1), `hold 秒のあと、down 秒で戻りきる速さになっていない (${fast.f})`);   // 放してから 4 秒：戻りはじめて 1 秒
  both(1.5); assert.equal(fast.f, 0);
  run(b, 6); assert.equal(slow.f, f0, '秒数を省いた床が、放してから 12 秒たつ前に戻りはじめた');   // ここで、放してから 11.5 秒
  run(b, 2.5); assert.ok(near(slow.f, f0 - 0.25, 0.03), `秒数を省いた床が、8 秒で戻りきる速さになっていない (${slow.f})`);   // 14 秒：戻りはじめて 2 秒
  run(b, 3); assert.equal(slow.f, 0);

  grip(-9, 8.2, Math.PI); assert.equal(p.crank, null, '背を向けたまま、ハンドルをつかめた');
  grip(-9, 7.9, 0); assert.equal(p.crank, null, '1m より遠いハンドルをつかめた');
  grip(-9, 4.2, 0); assert.equal(p.crank, null, '高さが 1m 以上ちがうハンドルをつかめた');
  grip(-9, 8.2, 0); assert.equal(p.crank, 3);
  p.grabEnd(); p.jump(); b.tick(); p.grabStart(); assert.equal(p.crank, null, '空中で、ハンドルをつかめた');
  p.grabEnd(); b.wait('着地', () => p.grounded, 2);
  assert.ok(grip(1.5, 5.2, -Math.PI / 2) === beside && p.crank === null, 'ハンドルのそばの箱を、箱のほうを向いても取れない');
  grip(0, 4.2, 0); assert.equal(p.crank, 0); p.jump(); b.tick(); assert.equal(p.crank, null, '跳んでも、ハンドルをつかんだまま');
  p.grabEnd(); b.wait('着地', () => p.grounded, 2);
  grip(0, 4.2, 0); assert.equal(p.crank, 0); p.respawn(); assert.ok(p.crank === null && !p.grab, 'やり直しても、ハンドルをつかんだまま');
  b.wait('空から着地', () => p.grounded, 6);

  b.go([6.3, -4]); b.crank(1, () => lift.f === 1);                                  // リフトと一緒に動くハンドルを回せば、荷物ごと上がる
  assert.ok(near(p.y, 3.3) && near(cargo.y, 3.3) && cargo.on === lift.box && near(H[1].y, 3.3) && p.crank === null, `リフトの上のハンドルで、荷物と一緒に上がれない ${b.where()}`);
  b.wait('放したリフトが、人と荷物を乗せたまま下りてくる', () => lift.f === 0, 5);
  assert.ok(near(p.y, 0.3) && near(cargo.y, 0.3) && near(H[1].y, 0.3), `リフトと一緒に下りていない ${b.where()}`);
  b.go([6.3, -2.5]); b.go([3.5, -3.6]); b.crank(2, () => lift.f === 1);             // 地面のハンドルでも、同じリフトが上がる（荷物だけが上へ着く）
  assert.ok(p.y === 0 && near(cargo.y, 3.3) && cargo.on === lift.box && b.falls === 0, `地面のハンドルで、リフトの荷物が上へ着かない (y=${cargo.y})`);
});

// ── ここから、見直し（1 回め）で見つかった不具合の検査 ──

group('動く床と壁の間：crush のない床にはさまれても、面に沿って横へ歩けば出られる', () => {
  // 押し出し壁（高さ 2m。跳んでも乗れない）が、壁の 0.5m 手前で止まる
  let b = bot({ boxes: [floor, B(8, 3, 0, 1, 8, 3)], plates: [P(-9, 0, -9)], movers: [{ b: B(1, 2, 0, 2, 3, 2, 4), to: [5, 0, 0], mode: 'hold', on: [0], speed: 2 }] }), { p, w } = b;
  b.place(4, 0, 0); b.friend = [-9, 0, -9, 1]; run(b, 4);
  assert.ok(w.movers[0].f === 1 && near(p.x, 7.2) && w.blocked(p.x, p.z, p.y) === w.movers[0].box, `検査の前提：押し出し壁と壁の間にはさまれている ${b.where()}`);
  run(b, 2.5, 0, 1); assert.ok(p.z > 1.8 && !w.blocked(p.x, p.z, p.y) && b.falls === 0, `押し出し壁と壁の間から、横へ出られない ${b.where()}`);
  // 厚い床が、壁のとなりへ下りてくる。体は、壁に近い側の下にいる
  b = bot({ boxes: [floor, B(2.5, 4, 0, 1, 8, 4)], plates: [P(-9, 0, -9)], movers: [{ b: B(0, 5, 0, 3, 3, 2.5, 4), to: [0, -2.4, 0], mode: 'hold', on: [0] }] }); ({ p, w } = b);
  b.place(1, 0, 0); b.friend = [-9, 0, -9, 1]; run(b, 3);
  assert.equal(w.blocked(p.x, p.z, p.y), w.movers[0].box, '検査の前提：下りた床が体に重なっている');
  run(b, 1, 1, 0); run(b, 2.5, 0, 1); assert.ok(p.z > 1.8 && !w.blocked(p.x, p.z, p.y) && b.falls === 0, `下りた床と壁の間から、横へ出られない ${b.where()}`);
});

group('あみ：遠めからつかんでも登りきれる。登っている間は、足が地面を離れた扱い', () => {
  const b = bot({ boxes: [floor, net(B(0, 5, 9, 6, 4, 6))], plates: [P(-9, 0, -9)], movers: [{ b: saw(4, 0, 6.5), to: [-6, 0, 0], mode: 'hold', on: [0] }] }), { p } = b;   // のこぎりは、ふみ板で、あみの下の地面を通る
  b.place(0, 0, 6.2); p.ry = 0; p.grabStart();                                      // あみの面（z 7）から 0.8m 手前
  assert.ok(p.hang?.climb && near(p.z, 6.65), `つかんだあみの、面のすぐ前へ寄っていない (z=${p.z})`);
  run(b, 2.5, 0, 1); assert.ok(near(p.y, 3, 0.1) && !p.grounded && p.on === null, '地面からつかんで登っている間も、地面に立っている扱いのまま');
  b.friend = [-9, 0, -9, 1]; run(b, 3); assert.equal(b.falls, 0, '3m 上を登っているのに、下を通ったのこぎりでやり直しになった');
  hold(b, '遠めからつかんだあみを、てっぺんまで登る', 0, 1, () => p.grounded && p.y === 5, 4);
  b.place(0, 0, 5.3); p.ry = 0; p.jump(); p.grabStart();
  hold(b, '空中でつかまったあみを、てっぺんまで登る', 0, 1, () => p.grounded && p.y === 5, 8);
  p.grabEnd(); b.place(-2, 0, 6.6); p.ry = 0; p.grabStart(); run(b, 1, 0, 1);
  p.grabEnd(); p.jump(); assert.ok(p.vy <= 0, 'あみから手を放したあと、空中で跳べた');
});

group('まきあげハンドル：ハンドルが 1m より遠くへ離れると、手が離れる。一緒に動く人は、つかんだまま', () => {
  // 0：リフト（上のハンドル 0 が一緒に上がる）／1：ふみ板で東へすべる台／2：動かないハンドル 1 で上がる門
  const b = bot({ plates: [P(-9, 0, -9)], handles: [{ x: 7.1, y: 0.3, z: -5, ride: 0 }, { x: -6, y: 0.3, z: 6.2 }],
    movers: [{ b: B(6, 0.3, -5, 3, 3, 0.3, 3), to: [0, 3, 0], mode: 'crank', handles: [0], up: 3 }, { b: B(-6, 0.3, 5, 3, 3, 0.3, 3), to: [4, 0, 0], mode: 'hold', on: [0], speed: 1 },
      { b: B(0, 0, -9, 2, 2, 0.5, 3), to: [0, 2, 0], mode: 'crank', handles: [1], up: 10 }] }), { p, w } = b, [lift, deck, gate] = w.movers, H = w.handles;
  b.place(8, 0, -5); p.ry = -Math.PI / 2; p.grabStart(); assert.equal(p.crank, 0);  // リフトの横の地面から、リフトの上のハンドルを回す
  hold(b, 'ハンドルが 1m 上へ離れて、手が離れる', 0, 0, () => p.crank === null, 3);
  assert.ok(!p.grab && near(H[0].y - p.y, 1, 0.1) && lift.f < 0.3, `高さが 1m 離れる前に（か、離れても）手が離れない (差 ${H[0].y - p.y})`);
  const f0 = lift.f; run(b, 1); assert.equal(lift.f, f0, '手が離れたのに、リフトが上がりつづける');
  b.place(6.3, lift.box.y1, -5); p.ry = Math.PI / 2; p.grabStart(); assert.equal(p.crank, 0);   // リフトに乗って回す人は、ハンドルと一緒に上がる
  for (let i = 0; lift.f < 1; i++) { assert.ok(i < 4 * FPS && p.crank === 0, `リフトに乗って回しているのに、手が離れた ${b.where()}`); b.tick(); }
  assert.ok(near(p.y, 3.3)); p.grabEnd();
  b.place(-6, 0.3, 5.5); p.ry = 0; b.tick(); p.grabStart(); assert.equal(p.crank, 1);          // すべる台に乗って、地面のハンドルを回す
  b.friend = [-9, 0, -9, 1];
  hold(b, '台に運ばれてハンドルが 1m 横へ離れ、手が離れる', 0, 0, () => p.crank === null, 3);
  assert.ok(!p.grab && near(Math.hypot(H[1].x - p.x, H[1].z - p.z), 1, 0.1) && gate.f > 0, `横へ 1m 離れる前に（か、離れても）手が離れない ${b.where()}`);
});

group('まきあげハンドルの「放した」知らせ（w.release）：遅れて届いても、全員の端末で同じ位置になる', () => {
  const st = { name: '知らせの検査', kill: -12, boxes: [floor], plates: [], crates: [], cps: [CP(0, 0, 0)], goal: { x: 99, y: 0, z: 99 }, handles: [{ x: 0, y: 0, z: 4 }, { x: 0, y: 0, z: 9 }],
    movers: [{ b: B(0, 0, 6.5, 2, 2, 0.5, 3), to: [0, 6, 0], mode: 'crank', handles: [0, 1], up: 8, hold: 1, down: 2 }] };
  // 端末 k（0 と 1）の人は、ハンドル hs[k] を、1 秒めから until[k] ミリ秒めまでつかむ。仲間の「つかんでいる」は 0.3 秒遅れて見え、「放した」の知らせは late[k] ミリ秒遅れて仲間へ届く。
  // 知らせを受けた端末は、その仲間の「つかんでいる」を、見え方が変わるまで grips に入れない（quiet。ヘッダーに書いた adventure.html の決まり）
  const sync = (until, late, hs = [0, 1]) => {
    const ws = [makeWorld(st), makeWorld(st)], mail = [], quiet = [false, false], grip = (k, t) => t > 1000 && t < until[k];
    for (let i = 1, prev = 0; i <= 12 * FPS; i++) {
      const now = i * 1000 / FPS;
      for (const k of [0, 1]) if (grip(k, prev) && !grip(k, now)) {                 // 手を放したコマ：自分の端末に書き、同じ値を仲間へ送る
        const rel = { f: ws[k].movers[0].f, t: prev };
        ws[k].release(0, rel); mail.push({ to: 1 - k, at: prev + late[k], rel });
      }
      for (const m of mail) if (!m.done && now >= m.at) { m.done = true; ws[m.to].release(0, m.rel); quiet[m.to] = true; }
      for (const k of [0, 1]) {
        const mate = grip(1 - k, now - 300);                                        // 仲間の「つかんでいる」の、この端末での見え方
        if (!mate) quiet[k] = false;
        ws[k].step(1 / FPS, now, [], [grip(k, now) && hs[k], mate && !quiet[k] && hs[1 - k]].filter(h => h !== false));
      }
      if (now > Math.max(...until) + 1000) assert.equal(ws[0].movers[0].f, ws[1].movers[0].f, `2 台の端末で、床の位置がちがう（${until} / ${late}、${now | 0} ミリ秒め）`);
      prev = now;
    }
    assert.deepEqual(ws[0].movers[0].rel, ws[1].movers[0].rel, `2 台の端末に残った rel がちがう（${until} / ${late}）`);
    assert.equal(ws[0].movers[0].f, 0);
    return ws[0].movers[0].rel;
  };
  let rel = sync([3000, 0], [50, 50]);                                              // 1 人で回して放す。知らせが、「つかんでいる」が消えるより先に届く
  assert.ok(near(rel.f, 0.25, 0.01) && near(rel.t, 3000, 60), `放した人の f と時刻が残っていない ${JSON.stringify(rel)}`);
  rel = sync([3000, 0], [600, 50]);                                                 // 知らせが、「つかんでいる」が消えたあとに届く（仲間の端末が自分で決めた値は、捨てられる）
  assert.ok(near(rel.t, 3000, 60), `知らせが遅れると、放した人の時刻が残らない ${JSON.stringify(rel)}`);
  rel = sync([3000, 3100], [50, 50]);                                               // 2 人で回して、0.1 秒ちがいで放す（おたがい、相手がまだつかんでいるように見えている）
  assert.ok(near(rel.t, 3100, 60), `最後に放した人の時刻が残っていない ${JSON.stringify(rel)}`);
  rel = sync([3000, 3100], [400, 50]);                                              // 先に放した人の知らせが、あとから放した人の知らせより遅く届く
  assert.ok(near(rel.t, 3100, 60), `古い知らせで、新しい知らせが上書きされた ${JSON.stringify(rel)}`);
  for (const late of [[50, 50], [600, 50]]) {                                       // 2 人が同じハンドルを回していて、1 人が先に放す。もう 1 人が回している間は、床は進みつづける（1 秒めから 6 秒めまで ＝ 5/8）
    rel = sync([3000, 6000], late, [0, 0]);
    assert.ok(near(rel.t, 6000, 60) && near(rel.f, 0.625, 0.01), `同じハンドルを回している仲間が放したら、自分が回していても床が止まった ${JSON.stringify(rel)}`);
  }
});

group('カタパルト：重い箱をつかんだまま乗ると、手が離れて人だけが飛ぶ。load: n の条件も、軽くなってから 0.4 秒は前のまま', () => {
  const b = bot({ boxes: [floor, launcher(0, 0.1, 0, [{ v: [0, 9, 7] }])], crates: [{ x: 0, y: 0, z: 3, s: 1.4, heavy: true }], cps: [CP(0, 0, -8)] }), { p, w } = b, c = w.crates[0];
  b.place(0, 0, 1.9); p.ry = 0; assert.equal(p.grabStart(), c);
  hold(b, '重い箱を引きながら台に乗って、飛ぶ', 0, -1, () => !p.grounded && p.vy > 3, 3);
  assert.ok(!p.carry && !p.grab, '飛んだのに、重い箱をつかんだまま');
  const at = c.z; b.wait('着地', () => p.grounded, 6);
  assert.ok(c.z === at && at > 2 && c.y === 0 && b.falls === 0, `重い箱が、飛んだ人に引きずられた (z ${at} → ${c.z}, y=${c.y})`);

  const t = bot({ plates: [WP(0, 0, 5, 2)] }), k = t.w.plates[0], strong = { on: [0], load: 2 };
  t.friend = [0, 0, 5, 2]; t.tick(); assert.ok(t.w.test(strong));
  t.friend = [0, 0, 5, 1]; run(t, 0.3); assert.ok(k.load === 1 && t.w.test(strong), '重さが減ったとたんに、load: 2 の条件が外れた（仲間の位置のゆれで、ねらいがちらつく）');
  run(t, 0.2); assert.ok(!t.w.test(strong) && t.w.test({ on: [0], load: 1 }), '重さが減って 0.5 秒たっても、load: 2 の条件が合ったまま');
});

group('乗ると動く床：乗っている人を、壁の中へ運ばない。下りてくる床の下にいる人で、行ったり来たりしない。行き先にいる仲間の足元へ行く', () => {
  const west = B(-4, 0, 0, 8, 8, 1), east = B(15, 0, 0, 8, 8, 1), tram = { b: B(1.5, 0, 0, 3, 3, 0.5, 3), to: [8, 0, 0], mode: 'ride' };   // 西の島（x -8〜0）から東の島（x 11〜）へ
  const make = o => bot({ boxes: [west, east], movers: [tram], cps: [CP(-6.5, 0, 3)], ...o });
  let b = make({ boxes: [west, east, B(5, 3, 0, 0.6, 3, 2.5)] }), { p, w } = b;      // 途中に、床の 0.5m 上から 3m 上までの梁（x 4.7〜5.3）
  b.go([1.5, 0]);
  for (let i = 0; i < 6 * FPS; i++) { b.tick(); assert.ok(b.falls > 0 || p.x <= 4.4 + 1e-6, `乗っている人が、梁を通りぬけて運ばれた (x=${p.x})`); }

  b = make(); ({ p, w } = b); const t = w.movers[0];                                // あとから入った端末：仲間は、行き先に着いた床の上（こちらでは、宙に浮いて見える）
  b.friend = [10.9, 0, 0, 1]; run(b, 2); assert.equal(t.f, 0, '行き先の岸の縁に立っている仲間で、床が動いた');
  b.friend = [9.5, 0, 0, 1]; b.wait('行き先にいる仲間の足元へ、床が行く', () => t.f === 1, 5);
  b.friend = null; b.wait('出発点へ帰る', () => t.f === 0, 6);

  b = make({ movers: [{ b: B(-4, 0.3, 0, 3, 3, 0.3, 3), to: [0, 3, 0], mode: 'ride', speed: 1 }] }); ({ p, w } = b); const l = w.movers[0];
  b.friend = [-4, 0.3, 0, 1]; b.wait('仲間を乗せて、リフトが上がる', () => { b.friend[1] = l.box.y1; return l.f === 1; }, 5);
  b.place(-4, 0, 0); b.friend = null;                                               // 上がったリフトの真下に立つ。仲間は降りた
  b.wait('リフトが下りはじめる', () => l.f < 1, 3); run(b, 9);
  assert.ok(l.f === 1 && near(p.y, 3.3) && p.on === l.box && b.falls === 0, `下りてきたリフトが、下にいた人を乗せて上がっていない（行ったり来たりしている） f=${l.f} ${b.where()}`);
});

group('てんびん：皿の横に立った人では、上がり下がりをくり返さない。上がった皿の上にいる仲間の足元へ行く', () => {
  const H = 2.95, panA = { b: B(1, 0.05, 0, 1.6, 3, 0.4, 3), to: [0, H, 0], mode: 'scale', pair: 'q', side: 'A' }, panB = { b: B(-3.2, 3, 0, 1.6, 3, 0.4, 3), to: [0, -H, 0], mode: 'scale', pair: 'q', side: 'B' };
  const make = () => bot({ boxes: [floor, B(-7, 3, 0, 6, 8, 4)], movers: [panA, panB], crates: [{ x: -3.2, y: 3, z: 0, s: 1.4, heavy: true }], cps: [CP(6, 0, 6)] });   // B の皿に、はじめから重い箱
  let b = make(), { p, w } = b, A = w.movers[0];
  b.friend = [1, 0.05, 0, 1]; b.wait('仲間を乗せて、A が上がる', () => { b.friend[1] = A.box.y1; return A.f === 1; }, 6);
  b.place(2, 0, 0); b.friend = null; run(b, 8);                                     // 仲間が降り、自分は A の皿の縁から 0.2m 外の地面に立ったまま
  for (let i = 0; i < 4 * FPS; i++) { b.tick(); assert.ok(A.f === 0 && p.y === 0, `皿の横に立っているだけで、皿が上がり下がりをくり返す (f=${A.f})`); }

  b = make(); ({ p, w } = b); A = w.movers[0];                                      // あとから入った端末：仲間は、上がった A の皿の上（こちらでは、宙に浮いて見える）
  b.friend = [1, 0.05 + H, 0, 1]; b.wait('上がった皿の上にいる仲間の足元へ、皿が行く', () => A.f === 1, 6);
  assert.ok(near(w.crates[0].y, 0.05), 'B の皿の重い箱が、一緒に下りていない');
  b.friend = null; b.wait('元へ戻る', () => A.f === 0, 8);
});

group('せんぷうき箱：ほかの箱（台車も）の上に置いてある間は、風が出ない', () => {
  const b = bot({ crates: [fan(0, 0, -4), { x: 3, y: 0, z: -4, s: 0.8 }, cart(-3, 0, -4, 'x', -3, -1)] }), { w } = b, [f, box, car] = w.crates, zone = w.winds[0];
  run(b, 0.2); assert.equal(zone.active, true);
  move(f, 3, 0.8, -4); run(b, 0.5); assert.ok(f.on === box.box && !zone.active, '箱の上に置いたせんぷうき箱から、風が出ている（箱の高さだけ、高い段に届いてしまう）');
  move(f, -3, 1.4, -4); run(b, 0.5); assert.ok(f.on === car.box && !zone.active, '台車の上に置いたせんぷうき箱から、風が出ている');
  move(f, 0, 0, -4); run(b, 0.5); assert.equal(zone.active, true);
});

group('跳んでつかむ（hoist）：2.4m の段と、台車の上から 3.8m の段によじ登る', () => {
  const b = bot({ boxes: [floor, B(0, 2.4, 8, 6, 4, 3.4), B(11, 3.8, -6, 2, 4, 4.8)], crates: [cart(9.3, 0, -6, 'x', 5, 9.3)] }), { p } = b;
  b.go([0, 5.69]); assert.throws(() => b.go([0, 8], null, 3), '跳んでつかまないと届かない段を、歩くだけで登れた');
  b.hoist([0, 5.69], [0, 8]); assert.ok(p.grounded && near(p.y, 2.4) && b.falls === 0, `2.4m の段に登れていない ${b.where()}`);
  b.go([0, 3]); b.go([7.5, -6]); b.go([9.3, -6]); assert.ok(near(p.y, 1.4), `台車の上に登れない ${b.where()}`);
  b.hoist([9.3, -6], [11, -6]); assert.ok(p.grounded && near(p.y, 3.8) && b.falls === 0, `台車の上から、3.8m の段に登れていない ${b.where()}`);
});

// ── ここから、見直し（2 回め）で見つかった不具合の検査 ──

group('せんぷうき箱：仲間の頭の上に置いてある間も、風が出ない', () => {
  const b = bot({ crates: [fan(0, 0, -4)] }), { w } = b, f = w.crates[0], head = { x0: 2.75, x1: 3.25, z0: -4.25, z1: -3.75, y0: 0, y1: 1.3, friend: true };   // adventure.html が w.extra に入れる、仲間の体と同じ形
  w.extra = [head]; b.tick(); move(f, 3, 1.3, -4); run(b, 0.5);
  assert.ok(f.on === head && !w.winds[0].active, '仲間の頭の上に置いたせんぷうき箱から、風が出ている（仲間の背の高さだけ、高い段に届いてしまう）');
});

group('動く床：乗っている人も荷物も、動かない箱の中へは運ばれない（上へも、横へも）', () => {
  const slab = B(4.6, 2.3, 0, 3, 6, 0.3), base = B(0, -1, 0, 24, 24, 1);             // リフト（x 0〜3）のすぐ東に、動かないひさし（x 3.1〜6.1、高さ 2.0〜2.3）
  const b = bot({ boxes: [base, slab], movers: [{ b: B(1.5, 0, 0, 3, 3, 0.5, 3), to: [0, 4, 0], mode: 'ride', speed: 1 }], crates: [cell(3.1, 0, 1)], cps: [CP(-8, -1, 0)] }), { p, w } = b, c = w.crates[0];
  b.place(1.5, 0, 0); run(b, 0.3); b.place(3.1, w.movers[0].box.y1, -1);            // 動き出してから、床の縁（0.1m 外。頭の上は、ひさし）へ
  for (let i = 0; i < 7 * FPS; i++) {
    b.tick();
    assert.ok(w.blocked(p.x, p.z, p.y) !== slab && p.on !== slab, `上がる床に乗っている人が、動かないひさしを通りぬけた ${b.where()}`);
    assert.ok(w.blocked(c.x, c.z, c.y, c.box, 0.4, 0.8) !== slab && c.on !== slab, `上がる床に乗っている箱が、動かないひさしを通りぬけた (y=${c.y})`);
  }
  assert.equal(b.falls, 0);
  const beam = B(5, 3, 0, 0.6, 6, 2.7);                                             // 行き来する床の 0.3m 上から始まる梁（x 4.7〜5.3）。人は通れない
  const t = bot({ boxes: [base, beam], movers: [{ b: B(0, 0, 0, 2, 2, 0.5, 3), to: [10, 0, 0], mode: 'always', period: 6000 }], crates: [cell(0, 0, 0)], cps: [CP(-8, -1, -8)] }), k = t.w.crates[0];
  for (let i = 0; i < 6 * FPS; i++) { t.tick(); assert.ok(t.w.blocked(k.x, k.z, k.y, k.box, 0.4, 0.8) !== beam && k.x < 5, `動く床に乗っている箱が、梁を通りぬけて運ばれた (x=${k.x})`); }
});

group('重い箱・レバー：つかめる距離より遠くへ離れると、手が離れる', () => {
  const b = bot({ boxes: [B(-5, 0, 0, 6, 6, 1), B(5, 0, 6, 30, 4, 1)], crates: [lever(-2.3, 0, 0.6, 'z')], cps: [CP(-5, 0, -2)],
    movers: [{ b: B(0, 0, 0, 3, 3, 0.5, 3), to: [8, 0, 0], mode: 'ride', speed: 1 }] }), { p, w } = b, knob = w.crates[0];   // 岸のつまみを、トロッコの上からつかむ
  b.place(-1.1, 0, 0.6); p.ry = -Math.PI / 2; b.tick(); assert.equal(p.grabStart(), knob);
  hold(b, 'トロッコに運ばれて、つまみから手が離れる', 0, 0, () => !p.carry, 2);
  assert.ok(!p.grab && Math.hypot(knob.x - p.x, knob.z - p.z) < 1.5, `つまみから離れすぎるまで、手が離れない ${b.where()}`);
  run(b, 0.5, 0, 1); assert.equal(knob.z, 0.6, '遠くから、つまみを動かせた');
});

group('でんちとソケット：となり合うソケットの境目に置いた 1 個は、1 個ぶんにしか数えない', () => {
  const b = bot({ plates: [socket(0, 0, 0), socket(1.6, 0, 0)], crates: [cell(0.8, 0, 0)], movers: [{ b: B(0, 0, 8, 3, 3, 0.5, 3), to: [0, 4, 0], mode: 'hold', on: [0, 1], need: 2 }], cps: [CP(-8, 0, -8)] }), { w } = b;
  for (let i = 0; i < 3 * FPS; i++) { b.tick(); assert.ok(w.plates[0].load + w.plates[1].load === 1 && w.movers[0].f === 0, 'でんち 1 個で、ソケット 2 つが押された（2 個いる錠が開く）'); }
});

group('あみ：真下や中からは、つかまない（面の前へ寄るときに、間の壁を飛びこえない）', () => {
  const b = bot({ boxes: [floor, net(B(0, 5, 0, 6, 6, 3.4)), B(1, 1.5, 0, 0.2, 6, 1.5)] }), { p } = b;   // 宙に浮いたあみ（下の端は 1.6m）の下に、高さ 1.5m の柵（x 0.9〜1.1）
  b.place(0.5, 0, 0); p.ry = Math.PI / 2; p.jump(); b.tick(); p.grabStart();
  for (let i = 0; i < FPS; i++) { const x = p.x; b.tick(); assert.ok(Math.abs(p.x - x) < 0.7 && p.x < 0.9, `あみをつかんだとたんに、柵の向こうへ飛んだ (x ${x} → ${p.x})`); }
});

group('軽い箱：うすい壁にくっついて置いても、壁の向こうには置かれない', () => {
  const b = bot({ boxes: [floor, B(0, 3, 1, 8, 0.2, 3)], crates: [{ x: 0, y: 0, z: -2, s: 0.8 }] }), { p, w } = b, c = w.crates[0];   // 壁は z 0.9〜1.1
  b.grab(0); b.place(0, 0, 0.584); p.ry = 0; b.tick(); p.grabEnd(); run(b, 0.5);    // 毎秒 60 コマで壁へ歩きつづけると、ここで止まる
  assert.ok(c.z < 0.5 && c.y === 0, `壁の向こうに置かれた (z=${c.z})`);
});

group('乗ると動く床・てんびん：となりの岸に立っている人は、乗っていない扱い。遅れて見える仲間は、乗っている扱い', () => {
  const west = B(-4, 0, 0, 8, 8, 1), east = B(15, 0, 0, 8, 8, 1), tram = { b: B(1.5, 0, 0, 3, 3, 0.5, 3), to: [8, 0, 0], mode: 'ride' };   // 行き先では、床は x 8〜11。東の岸は x 11〜
  let b = bot({ boxes: [west, east], movers: [tram], cps: [CP(-6.5, 0, 3)] }), { w } = b; const t = w.movers[0];
  b.friend = [1.5, 0, 0, 1]; b.wait('仲間を乗せて、行き先に着く', () => t.f === 1, 6);
  assert.ok(near(b.friend[0], 9.5), `いることにした仲間が、床と一緒に運ばれていない (x=${b.friend[0]})`);
  b.friend = [11.3, 0, 0, 1]; b.wait('仲間が岸へ降りて、床のすぐそば（0.3m）に立ち止まると、床は帰る（あとから入った端末と、同じ位置になる）', () => t.f === 0, 8);

  const H = 2.95, panA = { b: B(1, 0.05, 0, 1.6, 3, 0.4, 3), to: [0, H, 0], mode: 'scale', pair: 'q', side: 'A' }, panB = { b: B(-3.2, 3, 0, 1.6, 3, 0.4, 3), to: [0, -H, 0], mode: 'scale', pair: 'q', side: 'B' };
  b = bot({ boxes: [floor, B(-7, 3, 0, 6, 8, 4), B(4.8, 3, 0, 6, 8, 0.5)], movers: [panA, panB], crates: [{ x: -3.2, y: 3, z: 0, s: 1.4, heavy: true }], cps: [CP(6, 0, 6)] }); ({ w } = b); const A = w.movers[0];
  b.friend = [1, 0.05, 0, 1]; b.wait('仲間を乗せて、A が上がる', () => A.f === 1, 6);
  b.friend = [2.05, 3, 0, 1]; b.wait('仲間が上の段へ降りて、皿のすぐそば（0.25m）に立ち止まると、皿は戻る', () => A.f === 0, 8);
  b.friend = [-3.2, 3, 0, 1]; b.place(1, 0.05, 0); b.tick();                        // B の皿（重い箱つき）に仲間が乗ったまま、一緒に下りる
  b.wait('いることにした仲間が、皿に乗ったまま下りる', () => A.f === 1 && near(b.friend[1], 0.05), 6);

  // 2 人ぶんのリフト（上下の速さは、決まりの上限の毎秒 1m）。仲間の体は、0.6 秒遅れて上がってくるように見える
  b = bot({ movers: [{ b: B(0, 0.3, 5, 3, 3, 0.3, 3), to: [0, 3, 0], mode: 'ride', need: 2, speed: 1 }] }); ({ w } = b); const l = w.movers[0], tops = [];
  b.place(-0.5, 0.3, 5);
  for (let i = 0; l.f < 1; i++) {
    assert.ok(i < 6 * FPS && !l.fall, `2 人で乗っているのに、リフトが途中で下がった (f=${l.f})`);
    tops.push(l.box.y1); b.friend = [0.5, tops[Math.max(0, i - Math.round(0.6 * FPS))], 5, 1]; b.tick();
  }
  b = bot({ movers: [{ b: B(0, 0.3, 5, 3, 3, 0.3, 3), to: [0, 3, 0], mode: 'ride', need: 2, speed: 1 }] });   // いることにした仲間を、置いたままにしても、リフトと一緒に上がる
  b.place(-0.5, 0.3, 5); b.friend = [0.5, 0.3, 5, 1]; b.wait('仲間と 2 人で、リフトが上がりきる', () => b.w.movers[0].f === 1, 5);
});

group('レールの箱：足元の床（c.on）を持つ。ほかの箱と同じ決まりで、置き場所を仲間へ知らせられる', () => {
  const b = bot({ crates: [lever(4, 0, 4.5, 'x')] }), knob = b.w.crates[0];
  b.place(1.5, 0, 4.5); b.push(0, [3.1, 4.5], 1, 0);
  assert.ok(knob.moved && !knob.held && knob.on === floor && knob.x > 5.5, `動かしたレールの箱に、足元の床がない (on=${knob.on})`);
});

group('いることにした仲間（b.friend・b.friendGrip）：ハンドルを回せる', () => {
  const b = bot({ movers: [{ b: B(6, 0.3, -5, 3, 3, 0.3, 3), to: [0, 3, 0], mode: 'crank', handles: [0], up: 3 }], handles: [{ x: 3.4, y: 0, z: -5 }] }), { p, w } = b;
  b.place(6, 0.3, -5); b.friend = [2.6, 0, -5, 1]; b.friendGrip = 0;
  b.wait('仲間が地面のハンドルを回して、リフトが上がる', () => w.movers[0].f === 1 && near(p.y, 3.3), 4);
  b.friendGrip = null; run(b, 1); assert.ok(w.movers[0].rel, '仲間が放しても、放した扱いにならない');
});

group('ステージの点検（lint）：正しいステージは通し、わざと入れたまちがいは 1 つずつ見つける', () => {
  const plainBox = B(26, 0.1, 2, 2, 2, 0.3), spare = Array.from({ length: 200 }, (_, i) => B(100 + 3 * i, 0, 100, 2, 2, 1));
  const check = edit => {
    const st = { name: '点検の検査', kill: -12, goal: { x: 0, y: 0, z: -9 }, cps: [CP(0, 0, 0, 'a'), CP(24, 0, 0, 'b')],
      boxes: [floor, B(24, 0, 0, 6, 6, 1), cannon(26, 0.1, 2, [-15, 12, 0]), net(B(-9, 5, 9, 6, 6, 6)), launcher(9, 0.1, 9, [{ on: [0], v: [0, 9, -7] }])],   // 広場・東の島・島の大砲（広場へ飛ぶ）・あみの台
      plates: [socket(-4, 0, 5), socket(0, 0, 5), railEnd(2, 'min'), railEnd(2, 'max')],
      handles: [{ x: 5, y: 0, z: -9 }, { x: 8.5, y: 0.3, z: -9, ride: 2 }],
      movers: [{ b: B(13.5, 0, 0, 3, 3, 0.5, 3), to: [6, 0, 0], mode: 'ride' },                     // 広場から島へのトロッコ（帰り道は、島の大砲）
        { b: B(-4.5, 5, 9, 3, 3, 0.5, 3), to: [0, -5, 0], mode: 'ride', speed: 1 },                 // あみの台から地面へ下りるリフト（帰り道は、あみ）
        { b: B(7.5, 0.3, -9, 3, 3, 0.3, 3), to: [0, 3, 0], mode: 'crank', handles: [0, 1] },
        { b: B(2, 0, 9, 3, 1, 0.5, 4), to: [0, 2, 0], mode: 'hold', on: [0, 1], need: 1 }],
      crates: [cell(-4, 0, -3), cell(0, 0, -3), lever(4, 0, -3, 'x')] };
    edit?.(st); return lint(st);
  };
  assert.deepEqual(check(), [], '正しいステージで、まちがいが見つかった');
  for (const [word, edit] of [
    ['200 個まで', st => st.boxes.push(...spare)],
    ['ない信号 9', st => { st.movers[3].on = [0, 9]; }],
    ['ない信号 7', st => { st.boxes[4].launch.aims[0].on = [7]; }],
    ['ない信号 5', st => { st.objective = { label: 'でんち', on: [0, 5], need: 1 }; }],
    ['ないハンドル 4', st => { st.movers[2].handles = [0, 4]; }],
    ['ハンドルがない', st => { st.movers[2].handles = []; }],
    ['ない動く床 8', st => { st.handles[1].ride = 8; }],
    ['レールの端', st => { st.plates[2] = railEnd(0, 'min'); }],
    ['真下に、床がない', st => { st.crates[0].y = 2; }],
    ['外に置いてある', st => { st.crates[2].x = 3; }],
    ['ソケットを 2 個', st => { st.crates[1] = { x: 0, y: 0, z: -3, s: 0.8 }; }],
    ['真上', st => st.boxes.push(B(1.2, 9, 0, 1, 1, 1))],                             // 地点のまん中から 0.7m ずれた箱と、0.7m 手前まで来る動く床（3m 四方に入る）
    ['真上', st => st.movers.push({ b: B(8, 4, 0, 3, 3, 0.5, 3), to: [-5.8, 0, 0], mode: 'always', period: 4000 })],
    ['のこぎり', st => st.movers.push({ b: saw(5, 0, 0), to: [-2.5, 0, 0], mode: 'always', period: 2000 })],
    ['6m より近い', st => st.cps.push(CP(4, 0, 4, 'c'))],
    ['毎秒 1m', st => { st.movers[1].speed = 2; }],
    ['up と down', st => { st.movers[2].down = 0; }],
    ['2 枚で 1 組', st => st.movers.push({ b: B(0, 0.05, -6, 1.6, 3, 0.4, 3), to: [0, 2, 0], mode: 'scale', pair: 'z', side: 'A' })],   // 相手の皿がない
    ['2m より近い', st => { st.plates.push(WP(9, 0, 6.2, 2)); st.boxes[4].launch.aims[0].on = [4]; }],   // 台（z 7.8〜）の 0.4m 手前に、それを動かすおもさ板
    ['kill（-12）より下', st => st.movers.push({ b: B(0, -6, 15, 3, 6, 1, 3), to: [0, 6, 0], mode: 'hold', on: [0] })],   // 6m 下に止めた、かぎの橋（落とした箱が、上に残る）
    ['帰る道がない', st => { st.boxes[2] = plainBox; }],                              // 島の大砲を、ただの箱にする
    ['帰る道がない', st => { st.boxes[3] = B(-9, 5, 9, 6, 6, 6); }],                 // あみを、ただの壁にする
  ]) { const found = check(edit); assert.ok(found.length === 1 && found[0].includes(word), `「${word}」だけを見つけるはずが：${JSON.stringify(found)}`); }
  assert.deepEqual(check(st => st.movers.push({ b: B(0, -13, 15, 3, 6, 1, 3), to: [0, 13, 0], mode: 'hold', on: [0] })), [], 'kill より下に止めた橋が、まちがいと言われた');
  // 大砲がなくても帰り道になるもの：島を出発点にする 2 台めのトロッコ／行き来する床
  for (const back of [{ b: B(19.5, 0, 4, 3, 3, 0.5, 3), to: [-6, 0, 0], mode: 'ride' }, { b: B(13.5, 0, -4, 3, 3, 0.5, 3), to: [6, 0, 0], mode: 'always', period: 4000 }])
    assert.deepEqual(check(st => { st.boxes[2] = plainBox; st.movers.push(back); }), [], '帰り道があるのに、ないと言われた');
});

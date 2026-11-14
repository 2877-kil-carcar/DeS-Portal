// ステージ 2「くるくる港」を 1 人で解く手順：荷物を LA の板へ → 時計島へ飛ぶ → 大砲で帰る → 東（ベルト・重さの橋）で でんち A → 西（メリーゴーラウンド・高い段）で でんち B → とうのカタパルトで塔の上へ
// 手順のほかに、別の道（屋根の でんち C・北からの重さの橋・はしけ・くずれる床・荷物の踏み台・輪の両まわり）、仲間との答え、かぞえ錠の組み合わせ、
// わざと悪い順番、できてはいけないこと（錠なしで橋のすき間を渡る・錠が閉じたまま塔へ）も、新しいボット fresh() で確かめる
const tools = (b, assert) => {
  const { w, p } = b, m = w.movers, k = w.plates, c = w.crates, S = w.stage.boxes;
  const T = {
    w, p, m, k, c, S, quayS: S[0], isleM: S[1], tower: S[2], roof: S[3], quayE: S[7], isleE: S[8], quayN: S[10], quayW: S[12], ledge: S[13], LA: S[17], LG: S[18],
    idle: s => { for (let i = 0; i < s * b.FPS; i++) b.tick(); },
    at: () => w.groundBox(p.x, p.z, p.y),
    // カタパルトか大砲の台 (x, z) に乗って飛び、着いた足場を返す
    fly: (x, z) => { b.go([x, z], () => !p.grounded && p.vy > 3, 15); b.wait('着地', () => p.grounded, 8); return T.at(); },
    // メリーゴーラウンドの台が (x, z) のそばに来たら乗り、until（台のまん中）になるまで乗っていく
    spin: (x, z, until) => {
      const near = () => [3, 4].find(i => Math.hypot(b.center(i)[0] - x, b.center(i)[1] - z) < 1.6);
      b.wait('メリーゴーラウンドが来る', () => near() != null, 20); const i = near();
      b.go(() => b.center(i), () => p.on === m[i].box && Math.hypot(b.center(i)[0] - p.x, b.center(i)[1] - p.z) < 0.6);
      b.wait('メリーゴーラウンドで向こうへ', () => until(b.center(i)), 20);
    },
    // はしけ：from の端（0 東の桟橋・1 北の岸）に来たら乗り、反対の端で off へ降りる
    ferry: (from, off) => {
      b.wait('はしけが来る', () => Math.abs(m[2].f - from) < 0.02, 12);
      b.go(() => b.center(2), () => p.on === m[2].box && Math.abs(b.center(2)[0] - p.x) < 0.6);
      b.wait('はしけで向こうへ', () => Math.abs(m[2].f - (1 - from)) < 0.02, 12); b.go(off);
    },
    socketIn: s => { b.put(k[s].x, k[s].z); b.wait(`ソケット ${s} が押される`, () => k[s].down, 3); },
    // 南の岸：西の渡り廊下の荷物（3）を取って、LA の板へ置く
    parcelOnLA: () => { b.go([-5, 0]); b.grab(3); b.go([-5, 0]); b.put(k[3].x, k[3].z); b.wait('LA の板が押される', () => k[3].down, 3); },
    // 南の岸から、渡り廊下と北行きのベルトで東の岸へ
    toEast: () => { b.go([5, 0]); b.go([21.5, 0]); b.go([21.5, 13]); b.go([20, 16]); },
    // 東の岸：荷物 2 こを点 2 つの板へ置いて橋を上げ、小島 EI の でんち A を取って東の岸へ戻る
    eastCell: () => {
      b.grab(4); b.go([23, 22.6]); b.put(23, 20.6); T.idle(1);
      assert.ok(!k[4].down && m[0].f === 0, '荷物 1 こで、東の橋が上がった');
      b.grab(5); b.go([20, 17.5]); b.put(23, 19.4); b.wait('東の橋が上がる', () => m[0].f === 1, 4);
      b.go([25, 18.5]); b.go([26.5, 20]); b.go([37, 20]); b.grab(0);
      b.go([26.5, 20]); b.go([25, 17]);
    },
    // 東の岸から、南行きのベルトと渡り廊下で南の岸へ
    eastHome: () => { b.go([18.5, 14.5]); b.go([18.5, 1]); b.go([6, 0]); b.go([0, 2]); },
    // 南の岸から、渡り廊下とメリーゴーラウンドで西の岸へ
    // 荷物に跳び乗る（軽い箱には、つかんでよじ登れない）
    mount: (x, z) => { b.face(x, z); p.jump(); b.go([x, z]); assert.ok(Math.abs(p.y - 0.8) < 0.01, `荷物の上に乗れない ${b.where()}`); },
    toWest: () => { b.go([-5, 0]); b.go([-12, -1.2]); b.go([-13.3, 5.8]); T.spin(-15.5, 6, ([, z]) => z > 10.3); b.go([-20, 13.3]); b.go([-20, 17]); },
    // 西の岸から、メリーゴーラウンドと渡り廊下で南の岸へ
    westHome: () => { b.go([-20, 15]); b.go([-20, 12.6]); T.spin(-20, 10.5, ([x]) => x > -15.8); b.go([-12.5, 5.5]); b.go([-12, -1.2]); b.go([-5, 0]); b.go([0, 2]); },
    // 北の岸：荷物 2 こを点 2 つの板へ置いて、時計島への橋を上げる
    northBridge: () => {
      b.grab(6); b.go([-3, 45.5]); b.put(-3, 43.6); T.idle(1);
      assert.ok(!k[5].down && m[1].f === 0, '荷物 1 こで、北の橋が上がった');
      b.grab(7); b.go([0, 41.2]); b.put(-3, 42.4); b.wait('北の橋が上がる', () => m[1].f === 1, 4);
    },
  };
  return T;
};

export default (b, { assert, fresh }) => {
  const T = tools(b, assert), { p, c, fly } = T;

  // 1. LA に乗っても、板に重さがなければ飛ばない
  b.go([0, 4.5]); T.idle(1);
  assert.ok(p.grounded && Math.abs(p.y - 0.1) < 0.01 && T.LA.aimV === null, `重さがないのに LA が動いた ${b.where()}`);
  // 西の渡り廊下の荷物を取って、LA の板へ置く
  T.parcelOnLA();
  // LA で時計島へ。ソケットと塔を見てから、大砲で帰る
  assert.equal(fly(0, 4.5), T.isleM, `LA で時計島に着いていない ${b.where()}`);
  assert.equal(fly(3, 16), T.quayS, `大砲で南の岸に帰れていない ${b.where()}`);

  // 2. 東：北行きのベルトで東の岸へ。荷物 2 こで橋を上げ、でんち A を取って、南行きのベルトで帰る
  T.toEast(); T.eastCell(); T.eastHome();
  // でんちを持ったまま LA で飛び、ソケット 0 へ。1 こでは、とうのカタパルトは動かない
  assert.equal(fly(0, 4.5), T.isleM, `でんちを持って時計島に着いていない ${b.where()}`);
  assert.equal(p.carry, c[0], 'でんちを飛んでいる間に落とした');
  T.socketIn(0); T.idle(1);
  assert.ok(T.LG.aimV === null, 'でんち 1 こで、とうのカタパルトが動いた');
  assert.equal(fly(3, 16), T.quayS, `大砲で南の岸に帰れていない ${b.where()}`);

  // 3. 西：メリーゴーラウンドで西の岸へ。高い段（2.2m）へ跳んでつかんで登り、でんち B を取って下りる
  T.toWest();
  b.hoist([-23, 19.6], [-23, 21.2]); assert.ok(Math.abs(p.y - 2.2) < 0.01, `高い段に登れていない ${b.where()}`);
  b.grab(1); b.go([-23, 18.5]);
  // メリーゴーラウンドで帰り、LA で飛んでソケット 1 へ
  T.westHome();
  assert.equal(fly(0, 4.5), T.isleM, `でんち B を持って時計島に着いていない ${b.where()}`);
  T.socketIn(1);

  // 4. でんち 2 こで、とうのカタパルトが動く。塔の上へ飛んで、ゴール
  b.wait('とうのカタパルトが動く', () => T.LG.aimV, 2);
  assert.equal(fly(0, 21), T.tower, `塔の上に着いていない ${b.where()}`);
  b.go([0, 27]);

  for (const route of Object.values(routes)) route(fresh(), assert);
};
export const routes = { roofByLongShot, ringOtherWay, ringBothWays, worstOrder, friends, lockSubsets, impossible };

// 輪を両まわり：南→西（メリーゴーラウンド）→北（くずれる床）→東（はしけを北の岸から）→南（ベルト）、
// 南→東→北（はしけ）→西（くずれる床を、荷物を持って西へ）→南（メリーゴーラウンド）。どのつなぎも、両方の向きに通れる
function ringBothWays(b, assert) {
  const T = tools(b, assert), { p } = T;
  T.toWest(); b.go([-18.5, 46]); b.go([-3, 46]);
  assert.equal(T.at(), T.quayN, `くずれる床を東へ渡れない ${b.where()}`);
  b.go([6, 46]); T.ferry(1, [20, 46]); assert.equal(T.at(), T.S[9], `はしけで東の桟橋に着いていない ${b.where()}`);
  b.go([20, 26]); b.go([20, 16]); T.eastHome(); assert.equal(T.at(), T.quayS);
  T.toEast(); b.go([20, 26]); b.go([20, 46]); b.go([17.6, 46]); T.ferry(0, [5, 46]);
  b.grab(6); b.go([-6, 46]); b.go([-18.5, 46]);                                     // 荷物を持って、くずれる床を西へ
  assert.equal(T.at(), T.S[11], `くずれる床を、荷物を持って西へ渡れない ${b.where()}`);
  b.go([-18.5, 26]); b.go([-18.5, 17]); T.westHome();
  assert.ok(T.at() === T.quayS && b.falls === 0, `両まわりで落ちた（${b.falls} 回）${b.where()}`);
}

// 別の道：荷物 2 こを LA の板に置くと、遠いねらいで西の屋根 X へ。でんち C を取り、屋根から時計島へ下りる
function roofByLongShot(b, assert) {
  const T = tools(b, assert), { p, k, c, fly } = T;
  T.parcelOnLA();
  // 東の荷物を 1 こ持ち帰って、LA の板の 2 こめにする
  T.toEast(); b.grab(4); b.go([20, 16]); T.eastHome();
  b.go([-3.6, 0.4]); b.put(-3.6, 2.3); b.wait('板の重さが 2', () => k[3].load === 2, 2);
  assert.deepEqual(T.LA.aimV, [-9.5, 12, 8.5], '荷物 2 こで、遠いねらいにならない');
  assert.equal(fly(0, 4.5), T.roof, `遠いねらいで屋根に着いていない ${b.where()}`);
  b.grab(2); b.go([-8, 15.2]); b.go([-5.5, 15.2]);                                  // でんち C を持って、屋根の東の端から時計島へ下りる
  assert.equal(T.at(), T.isleM, `屋根から時計島へ下りられない ${b.where()}`);
  T.socketIn(2); assert.equal(b.falls, 0, '屋根の道で落ちた');
}

// 輪を逆まわり：西の岸の荷物を踏み台に でんち B → くずれる床を、でんちを持って北の岸へ → 重さの橋で時計島（ソケット 1）。
// 大砲で帰り、東の でんち A を はしけで北の岸へ → 重さの橋で時計島（ソケット 0）→ ゴール
function ringOtherWay(b, assert) {
  const T = tools(b, assert), { p, m, k, c, fly } = T;
  T.toWest();
  b.grab(8); b.go([-18.4, 23]); b.put(-19.6, 23);                                   // 荷物を高い段の東の面に寄せて置き、それに乗ってから段へ
  T.mount(-19.6, 23);
  b.go([-21.5, 23]); assert.ok(Math.abs(p.y - 2.2) < 0.01, `荷物から高い段へ登れない ${b.where()}`);
  b.grab(1); b.go([-21.5, 25.5]); b.go([-18.5, 27]);                                // 段の北から、西の桟橋へ下りる
  b.go([-18.5, 46]); b.go([-7.5, 46]); b.go([-3, 46]);                              // でんちを持ったまま、くずれる床を東へ渡る
  assert.equal(T.at(), T.quayN, `くずれる床を、でんちを持って渡れない ${b.where()}`);
  b.put(2, 46); T.northBridge();
  b.grab(1); b.go([5.5, 39.6]); b.go([5.5, 28]);                                  // 重さの橋で時計島へ
  assert.equal(T.at(), T.isleM, `北の橋で時計島に着いていない ${b.where()}`);
  b.go([5.5, 23]); T.socketIn(1);
  assert.equal(fly(3, 16), T.quayS, `大砲で南の岸に帰れていない ${b.where()}`);
  T.toEast(); T.eastCell();
  b.go([25, 24]); b.go([20, 26.5]); b.go([20, 46]); b.go([17.6, 46]);                               // 東の桟橋を北へ。はしけで北の岸へ
  T.ferry(0, [5, 46]); assert.equal(T.at(), T.quayN, `はしけで北の岸に着いていない ${b.where()}`);
  b.go([5.5, 41]); b.go([5.5, 39.6]); b.go([5.5, 23]); T.socketIn(0);
  b.wait('とうのカタパルトが動く', () => T.LG.aimV, 2);
  assert.equal(fly(0, 21), T.tower, `塔の上に着いていない ${b.where()}`); b.go([0, 27]);
  assert.ok(p.goal && b.falls === 0, `逆まわりでゴールできない（落ちた回数 ${b.falls}）`);
}

// わざと悪い順番：荷物なしで東へ → でんち A を海へ落とし、元の場所から取りなおす → でんちを LA の板に置いて（まちがい）手ぶらで飛ぶ →
// 大砲で帰って でんちを板から取り、荷物を海へ落として取りなおし、板に置いて でんちを持って飛ぶ → 屋根の でんち C は、手に持って飛んだ荷物を踏み台に → ゴール
function worstOrder(b, assert) {
  const T = tools(b, assert), { p, m, k, c, fly } = T;
  T.toEast(); T.eastCell(); b.go([26.5, 20]);
  b.go([41.5, 20]); b.face(43, 20); p.grabEnd();                                    // 小島の東の端で、でんちを海へ落とす
  b.wait('落ちた でんちが、元の場所へ戻る', () => c[0].x === 39 && c[0].z === 20 && c[0].on, 6);
  b.grab(0); b.go([26.5, 20]); b.go([25, 17]); T.eastHome();
  b.go([-3, 0.5]); b.put(k[3].x, k[3].z); b.wait('でんちで LA の板が押される', () => k[3].down, 3);
  assert.equal(fly(0, 4.5), T.isleM, `LA で時計島に着いていない ${b.where()}`);
  assert.equal(fly(3, 16), T.quayS, `大砲で南の岸に帰れていない ${b.where()}`);
  b.go([-4.5, 0.6]); b.grab(0); b.go([-1.5, -2]); b.put(-1.5, -4);                  // でんちを板から取って、わきへ置く
  b.go([-5, 0]); b.grab(3); b.go([-8, -1.5]); b.face(-8, -3); p.grabEnd();          // 荷物を渡り廊下の南へ落とす
  b.wait('落ちた荷物が、元の場所へ戻る', () => c[3].x === -11 && c[3].on, 6);
  T.parcelOnLA();
  b.go([-0.5, -2.5]); b.grab(0); b.go([0, 2]);
  assert.equal(fly(0, 4.5), T.isleM, `でんちを持って時計島に着いていない ${b.where()}`);
  T.socketIn(0);
  assert.equal(fly(3, 16), T.quayS, `大砲で南の岸に帰れていない ${b.where()}`);
  // 屋根：東の荷物を持って LA で飛び、屋根の東の壁に寄せて置いて登る（0.8 ＋ 2.2）
  T.toEast(); b.grab(5); b.go([20, 16]); T.eastHome();
  assert.equal(fly(0, 4.5), T.isleM, `荷物を持って時計島に着いていない ${b.where()}`);
  b.go([-3, 14.6]); b.go([-5.4, 15]); b.put(-6.6, 15);
  T.mount(-6.6, 15);
  b.hoist([-6.6, 15], [-8.5, 15]); assert.equal(T.at(), T.roof, `荷物から屋根へ登れない ${b.where()}`);
  b.grab(2); b.go([-8, 15.8]); b.go([-5.5, 15.8]); T.socketIn(2);
  b.wait('とうのカタパルトが動く', () => T.LG.aimV, 2);
  assert.equal(fly(0, 21), T.tower, `塔の上に着いていない ${b.where()}`); b.go([0, 27]);
  assert.ok(p.goal && b.falls === 0, `悪い順番でゴールできない（落ちた回数 ${b.falls}）`);
}

// 仲間との答え（いることにした仲間の体）：LA の板を踏んで飛ばす／重さ 2 で屋根へ飛ばす／東の板に荷物 1 こと仲間で橋を上げる
function friends(b, assert) {
  const T = tools(b, assert), { p, m, k } = T, onLA = wt => [k[3].x, 0, k[3].z, wt];
  b.go([0, 4.5]); T.idle(0.5); b.friend = onLA(1); b.tick();                         // LA の上で待っていると、仲間が板を踏んだとたんに飛ぶ
  assert.ok(!p.grounded && p.vy > 3, '仲間が板を踏んでも飛ばない');
  b.wait('着地', () => p.grounded, 8); assert.equal(T.at(), T.isleM, `近いねらいで時計島に着いていない ${b.where()}`);
  b.friend = null; T.fly(3, 16);
  b.friend = onLA(2); b.go([0, 2]); assert.equal(T.fly(0, 4.5), T.roof, `仲間 2 人ぶんの重さで、屋根に着いていない ${b.where()}`);   // 仲間 2 人（か、荷物を持った仲間）
  b.friend = null; b.go([-8, 12]); b.go([-5.5, 15.2]); T.fly(3, 16);
  T.toEast(); b.grab(4); b.go([23, 22.6]); b.put(23, 20.6);
  b.go([20, 17]); b.friend = [23, 0, 19.3, 1]; b.wait('荷物 1 こと仲間で、東の橋が上がる', () => m[0].f === 1, 4);
  b.go([25, 18.5]); b.go([26.5, 20]); b.go([37, 20]); assert.equal(T.at(), T.isleE);
  assert.equal(b.falls, 0, '仲間との答えで落ちた');
}

// かぞえ錠：ソケット 3 つのうち、どの 2 つでも（3 つでも）とうのカタパルトが動き、1 つでは動かない
function lockSubsets(b, assert) {
  const T = tools(b, assert), { w, k, c } = T;
  for (let mask = 0; mask < 8; mask++) {
    [0, 1, 2].forEach(i => Object.assign(c[i], mask >> i & 1 ? { x: k[i].x, y: 0, z: k[i].z } : c[i].home, { vy: 0 }));
    w.crates.forEach(w.fit); T.idle(0.5);
    const n = [0, 1, 2].filter(i => mask >> i & 1).length;
    assert.equal(!!T.LG.aimV, n >= 2, `ソケット ${[0, 1, 2].filter(i => mask >> i & 1)} で、とうのカタパルトが${n >= 2 ? '動かない' : '動いた'}`);
  }
}

// できてはいけないこと：錠なしで橋のすき間を渡る・南の岸から時計島へ跳ぶ・錠が閉じたまま塔へ・荷物なしで屋根へ・板を走りぬけて LA で飛ぶ
function impossible(b, assert) {
  const T = tools(b, assert), { p, m, k } = T, cant = (what, to, s = 8) => assert.throws(() => b.go(to, null, s), undefined, what);
  b.go([-4.5, 3]); b.go([0, 4.5]); T.idle(0.5);                                     // 板を下りて 2m 先の LA へ：0.4 秒の猶予では間に合わない
  assert.ok(p.grounded && T.LA.aimV === null, '1 人で板を走りぬけて、LA で飛べた');
  b.go([0, 5.4]); cant('南の岸から時計島へ跳べた', [0, 15]); assert.ok(b.falls > 0, '南の岸から時計島へ向かって、落ちなかった');
  b.wait('やり直しで着地', () => p.grounded, 6); assert.equal(T.at(), T.quayS);
  T.parcelOnLA(); T.fly(0, 4.5); b.go([5, 22]);                                     // 時計島のセーブ地点にふれておく
  cant('錠が閉じたまま、塔に登れた', [0, 27]); assert.ok(p.y < 1, '錠が閉じたまま、塔に登れた');
  b.go([0, 21]); T.idle(1); assert.ok(p.grounded && T.LG.aimV === null, 'でんちなしで、とうのカタパルトが動いた');
  assert.throws(() => b.hoist([-6.65, 15], [-8.5, 15]), undefined, '荷物なしで、時計島から屋根へ登れた');
  b.wait('着地', () => p.grounded, 3); assert.equal(T.at(), T.isleM);
  const f0 = b.falls; cant('橋なしで、時計島から北の岸へ渡れた', [5.5, 42]); assert.ok(b.falls > f0 && m[1].f === 0);
  b.wait('やり直しで着地', () => p.grounded, 6); assert.equal(T.at(), T.isleM);
  T.fly(3, 16); T.toEast();
  const f1 = b.falls; cant('橋なしで、小島 EI へ渡れた', [38, 20]); assert.ok(b.falls > f1 && m[0].f === 0);
}

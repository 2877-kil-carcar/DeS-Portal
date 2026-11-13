/* もふもふ冒険の「世界」：足場・仕掛け・箱と、キャラの動き。
   描画も通信も含まない（adventure.html が描き、tools/test-adventure.mjs がこのまま動かして「1 人で解けるか」を検査する）。
   足場はすべて、軸にそろった箱。キャラは半径 R・高さ BODY の円柱として当たりを取る。
   shortcut: 箱は回転しない・転がらない。シーソーや振り子のような仕掛けが要るなら、物理エンジンへ移す */
// 動きは「ゆっくり・ねっとり」：歩きは遅く、滑り出しと止まり際が長く、ふわっと跳ぶ
export const R = 0.3, BODY = 1.4, STEP = 0.35, REACH = 1.7, GRAV = 10, JUMP = 4.75, SPEED = 2.8, BOUNCE = 8.5;

/* 箱：中心 x・上面の高さ・中心 z・幅・奥行・厚み・色番号
   色 0 草 / 1 石 / 2 木 / 3 動く床 / 4 門・押し出し壁 / 5 氷 / 6 トランポリン / 7 ベルトコンベア / 9 くずれる床 */
const B = (x, top, z, w, d, h = 1, c = 0) => ({ x0: x - w / 2, x1: x + w / 2, y0: top - h, y1: top, z0: z - d / 2, z1: z + d / 2, c });
const ice = b => Object.assign(b, { ice: true, c: 5 });                     // 氷：滑る
const pad = (x, top, z) => Object.assign(B(x, top, z, 2, 2, 0.3, 6), { bounce: BOUNCE });   // トランポリン：乗ると高く跳ねる（約 3.5m）
const belt = (b, vx, vz) => Object.assign(b, { belt: [vx, vz], c: 7 });     // ベルトコンベア：乗っている人と箱を運ぶ
const P = (x, y, z) => ({ x, y, z, w: 1.6, d: 1.6 });                       // ふみ板
const CP = (x, y, z, hint) => ({ x, y, z, hint });                          // セーブ地点（先頭が出発点）
const crumble = (x, top, z) => ({ b: B(x, top, z, 3, 2, 0.4, 9), to: [0, -16, 0], mode: 'crumble', speed: 9 });   // くずれる床：乗ると 1 秒後に落ち、しばらくして戻る
// 風：下から吹き上げる（on のふみ板のどれかが押されている間だけ。on がなければ常に）
const wind = (x, z, w, d, y0, y1, on) => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0, y1, up: 7, on });

/* 動く床・門（movers）: b を to だけ動かす。
   mode 'always' 行ったり来たりし続ける／'loop' ふみ板（on）が押されている間だけ行き来し、離すと元へ戻る／'hold' 押されている間だけ動いた先にいる
        'timed' 押すと動き、離してから hold ミリ秒は動いた先にいる／'crumble' 乗ると落ちる
   on が複数のとき、any: true なら「どれか 1 枚」、なければ「全部」。period は片道にかける時間（ミリ秒）
   orbit があれば、b の位置を中心に半径 orbit の円を回る（plane 'xz' 水平のメリーゴーラウンド／'zy' 縦の観覧車。period は 1 周の時間） */
export const STAGES = [
  { name: 'そらの小島', sky: ['#5fb4f2', '#d9f1ff'], kill: -12,
    boxes: [B(0, 0, 0, 8, 8, 3), B(0, 0, 7.75, 6, 4.5, 3), B(0, 1, 13, 6, 4, 4), B(0, 2.6, 21, 10, 12, 5.6, 1), B(0, 2.6, 31, 3, 8, 1, 2),
      B(0, 2.6, 39, 8, 8, 3), pad(0, 2.7, 42), B(0, 5.6, 47, 8, 6, 2, 1), B(0, 5.6, 62.5, 8, 8, 2), B(0, 11.6, 74, 8, 8, 2, 1), B(0, 11.6, 94.5, 8, 8, 3)],
    plates: [P(3, 2.6, 22)],
    movers: [{ b: B(0, 5.8, 28, 3, 0.6, 3.2, 4), to: [0, -3.3, 0], mode: 'hold', on: [0] },
      crumble(0, 5.6, 51.1), crumble(0, 5.6, 53.2), crumble(0, 5.6, 55.3), crumble(0, 5.6, 57.4),
      { b: B(0, 5.6, 68.25, 3, 3, 0.5, 3), to: [0, 6, 0], mode: 'always', period: 5000 },
      { b: B(0, 11.6, 84, 3, 3, 0.5, 3), orbit: 4.5, plane: 'xz', period: 14000, phase: 0 },
      { b: B(0, 11.6, 84, 3, 3, 0.5, 3), orbit: 4.5, plane: 'xz', period: 14000, phase: 0.5 }],
    crates: [{ x: -3, y: 2.6, z: 19, s: 0.8 }],
    cps: [CP(0, 0, 0, 'ジャンプですき間を越えよう。高い段は「つかむ」を押したまま前へ倒すとよじ登れる'),
      CP(0, 2.6, 18, '箱をつかんで、黄色いふみ板まで運ぼう（だれかが乗ってもOK）'), CP(0, 2.6, 39, 'ピンクの台に乗ると大ジャンプ'),
      CP(0, 5.6, 47, 'ひび割れた床は、乗るとすぐ落ちる。止まらず渡ろう'), CP(0, 5.6, 62.5, '動く床に乗って上へ'), CP(0, 11.6, 74, '回る床に乗って、向こう岸のゴールへ')],
    goal: { x: 0, y: 11.6, z: 95.5 } },
  { name: 'からくり工場', sky: ['#7a8cf0', '#ffe9d6'], kill: -12,
    boxes: [B(0, 0, 0, 12, 12, 3), B(0, 3, 15, 12, 18, 6, 1), B(0, 3, 29, 3, 10, 1, 2), B(0, 3, 38, 8, 8, 3, 1), belt(B(0, 3, 50, 4, 16, 1), 0, -1.1),
      B(0, 3, 62, 8, 8, 3, 1), B(0, 3, 71, 3, 10, 1, 2), B(0, 3, 80, 8, 8, 3, 1), B(0, 3, 102, 8, 8, 3, 1), pad(0, 3.1, 104),
      B(0, 6, 109.5, 6, 6, 2, 1), pad(0, 6.1, 111.5), B(0, 9, 117, 6, 6, 2, 1), B(0, 9, 132, 8, 8, 3)],
    plates: [P(-4, 3, 18), P(4, 3, 18), P(0, 3, 60), P(2, 9, 116), P(3, 9, 130)],
    movers: [{ b: B(0, 6.2, 25, 3, 0.6, 3.2, 4), to: [0, -3.3, 0], mode: 'hold', on: [0, 1] },
      { b: B(-6, 4.6, 47, 4, 1.2, 1.6, 4), to: [6, 0, 0], mode: 'always', period: 3400, speed: 9 },      // 押し出し壁（左から）
      { b: B(0, 4.6, 53, 4, 1.2, 1.6, 4), to: [6, 0, 0], mode: 'always', period: 3400, speed: 9 },       // 押し出し壁（右へ引っ込む。左のと逆のタイミング）
      { b: B(0, 6.2, 71, 3, 0.6, 3.2, 4), to: [0, -3.3, 0], mode: 'timed', on: [2], hold: 8000 },
      { b: B(-2.5, 3, 86.5, 3, 3, 0.5, 3), to: [5, 0, 0], mode: 'always', period: 4200 },
      { b: B(2.5, 3, 91, 3, 3, 0.5, 3), to: [-5, 0, 0], mode: 'always', period: 4200 },
      { b: B(-2.5, 3, 95.5, 3, 3, 0.5, 3), to: [5, 0, 0], mode: 'always', period: 4200 },
      { b: B(0, 3, 124, 3, 8, 0.5, 2), to: [0, 6, 0], mode: 'hold', on: [3, 4], any: true }],
    crates: [{ x: 3, y: 0, z: 1, s: 1.4, heavy: true }, { x: -2, y: 3, z: 10, s: 0.8 }, { x: 2, y: 3, z: 10, s: 0.8 }, { x: -2, y: 9, z: 116, s: 0.8 }],
    cps: [CP(0, 0, 0, '重い箱を壁ぎわまで押して、足場にしよう（2人以上いるときは2人でつかむ）。箱の縁は、跳んでからつかむと登れる'),
      CP(0, 3, 9, 'ふみ板2枚を同時に押すと門が開く'), CP(0, 3, 38, 'ベルトは逆向きに流れる。赤い壁が引っ込んだすきに進もう'),
      CP(0, 3, 62, 'ふみ板を踏むと、しばらくの間だけ門が開く。急いで！'), CP(0, 3, 80, '動く床をタイミングよく渡ろう'),
      CP(0, 3, 102, 'ピンクの台で上へ、上へ'), CP(0, 9, 117, 'ふみ板が押されている間だけ橋が上がる')],
    goal: { x: 0, y: 9, z: 133 } },
  { name: 'かぜの塔', sky: ['#f08a5d', '#ffe2a8'], kill: -12,
    boxes: [B(0, 0, 0, 14, 14, 3), B(0, 1.5, 9, 6, 4, 4.5, 1), B(0, 3, 13, 6, 4, 6, 1), B(0, 10, 23, 10, 8, 3), ice(B(0, 10, 36.25, 5, 18.5, 1)),
      B(0, 10, 51, 8, 8, 3), B(0, 10, 57.5, 3, 3, 0.5, 1), B(0, 17, 64, 8, 8, 2, 1), B(0, 22, 81, 8, 6, 2),
      B(0, 25, 87, 8, 6, 6, 1), B(0, 25, 98.5, 4, 4, 2), pad(0, 25.1, 99.5), B(0, 28, 105, 6, 6, 2)],
    plates: [P(-5, 0, 4), P(4, 10, 21), P(3, 10, 50), P(3, 17, 62)],
    winds: [wind(0, 57.5, 3, 3, 10, 19.5, [2, 3])],
    movers: [{ b: B(0, 3, 16.75, 3, 3, 0.5, 3), to: [0, 7, 0], mode: 'loop', on: [0, 1], any: true, period: 5000 },
      // 観覧車：いちばん下で手前（南）へ向かって来て、手前側を上り、てっぺんを越えて、奥側を下りる。下で乗って、奥側の高い足場で降りる
      { b: B(0, 22, 71, 3, 3, 0.5, 3), orbit: 5, plane: 'zy', period: -20000, phase: 0 },
      { b: B(0, 22, 71, 3, 3, 0.5, 3), orbit: 5, plane: 'zy', period: -20000, phase: 1 / 3 },
      { b: B(0, 22, 71, 3, 3, 0.5, 3), orbit: 5, plane: 'zy', period: -20000, phase: 2 / 3 },
      crumble(0, 25, 91.1), crumble(0, 25, 93.2), crumble(0, 25, 95.3)],
    crates: [{ x: -3, y: 0, z: -3, s: 0.8 }, { x: -3, y: 10, z: 50, s: 0.8 }, { x: 3, y: 22, z: 80, s: 1.4, heavy: true }],
    cps: [CP(0, 0, 0, 'ふみ板が押されている間、エレベーターが動く'), CP(0, 10, 23, '氷の上はよく滑る。早めに向きを決めよう'),
      CP(0, 10, 51, 'ふみ板が押されている間、風が吹き上げる。風に乗って上へ'), CP(0, 17, 64, '観覧車がいちばん下に来たら飛び乗ろう。ぐるっと回って、奥の高い足場で降りる'),
      CP(0, 22, 81, '重い箱を壁に寄せて登ろう'), CP(0, 25, 87, 'くずれる床を渡って、ピンクの台でゴールへ！')],
    goal: { x: 0, y: 28, z: 105.5 } },
];

export function makeWorld(stage) {
  const w = { stage, list: [] };
  w.movers = stage.movers.map(m => ({ ...m, f: 0, o: [0, 0, 0], d: [0, 0, 0], clock: 0, box: { ...m.b } }));
  w.movers.forEach(m => { m.box.m = m; });
  w.plates = stage.plates.map(p => ({ ...p, down: false }));
  w.winds = (stage.winds || []).map(z => ({ ...z, active: false }));
  w.crates = stage.crates.map((c, id) => ({ ...c, id, home: { ...c }, vy: 0, held: null, on: null, box: { c: 2 } }));
  const fit = c => { const h = c.s / 2, b = c.box; b.x0 = c.x - h; b.x1 = c.x + h; b.z0 = c.z - h; b.z1 = c.z + h; b.y0 = c.y; b.y1 = c.y + c.s; b.crate = c; };
  w.fit = fit;
  const relist = () => { w.list = [...stage.boxes, ...w.movers.map(m => m.box), ...w.crates.filter(c => !c.held).map(c => c.box)]; };

  // (x, z) の真下で、足の高さ y から歩いて上がれる範囲にある、いちばん高い箱（なければ null ＝ 下は空）
  w.groundBox = (x, z, y, skip) => {
    let best = null;
    for (const b of w.list) if (b !== skip && x > b.x0 - 0.15 && x < b.x1 + 0.15 && z > b.z0 - 0.15 && z < b.z1 + 0.15 && b.y1 <= y + STEP && (!best || b.y1 > best.y1)) best = b;
    return best;
  };
  w.floorY = (x, z, y) => w.groundBox(x, z, y)?.y1 ?? -99;
  // 足の高さ y・半径 r・高さ h の体が (x, z) に入れないか
  w.blocked = (x, z, y, skip, r = R, h = BODY) => {
    for (const b of w.list) if (b !== skip && x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r && b.y1 > y + STEP && b.y0 < y + h) return b;
    return null;
  };
  // 向き (fx, fz) の目の前にある「よじ登れる縁」：上面が手の届く高さにあり、その上に立てる箱
  w.ledge = (x, z, y, fx, fz) => {
    const qx = x + fx * 0.6, qz = z + fz * 0.6; let best = null;
    for (const b of w.list) {
      if (qx > b.x0 - 0.05 && qx < b.x1 + 0.05 && qz > b.z0 - 0.05 && qz < b.z1 + 0.05 && b.y1 > y + 0.4 && b.y1 <= y + REACH && b.y0 < y + BODY
        && (!best || b.y1 > best.y1) && !w.blocked(qx, qz, b.y1, b)) best = b;
    }
    return best;
  };
  // その場所に吹いている風（なければ null）
  w.windAt = (x, y, z) => w.winds.find(k => k.active && x > k.x0 && x < k.x1 && z > k.z0 && z < k.z1 && y > k.y0 - 0.2 && y < k.y1) || null;

  /* 1 コマ進める。now は時刻（ミリ秒。全員の端末で同じ動きになるよう、動く床は時刻から位置を決める）、
     bodies は全員の足の位置 [[x, y, z], …]（ふみ板を押す・くずれる床を落とす） */
  w.step = (dt, now, bodies) => {
    const press = bodies.concat(w.crates.filter(c => !c.held).map(c => [c.x, c.y, c.z]));
    for (const p of w.plates) p.down = press.some(q => Math.abs(q[0] - p.x) < p.w / 2 + 0.15 && Math.abs(q[2] - p.z) < p.d / 2 + 0.15 && q[1] > p.y - 0.1 && q[1] < p.y + 0.3);
    const anyDown = on => !on || on.some(i => w.plates[i].down);
    for (const k of w.winds) k.active = anyDown(k.on);
    for (const m of w.movers) {
      let o;
      if (m.orbit) {                                                                  // 円を回る
        const a = (now / m.period + m.phase) * Math.PI * 2, r = m.orbit;
        o = m.plane === 'zy' ? [0, -r * Math.cos(a), r * Math.sin(a)] : [r * Math.cos(a), 0, r * Math.sin(a)];
      } else {
        const on = m.on ? (m.any ? anyDown(m.on) : m.on.every(i => w.plates[i].down)) : true;
        let target;
        if (m.mode === 'crumble') {                                                   // 乗られたら 1 秒後に落ち、3.5 秒後に戻りはじめる
          const b = m.box, stood = press.some(q => q[0] > b.x0 - 0.15 && q[0] < b.x1 + 0.15 && q[2] > b.z0 - 0.15 && q[2] < b.z1 + 0.15 && Math.abs(q[1] - b.y1) < 0.2);
          if (m.clock > 0 || stood) m.clock += dt;
          if (m.clock > 5.5) m.clock = 0;
          target = m.clock > 1 && m.clock < 3.5 ? 1 : 0;
        } else if (m.mode === 'timed') { if (on) m.until = now + m.hold; target = now < (m.until || 0) ? 1 : 0; }
        else {
          const wave = 1 - Math.abs((now / (m.period || 1) % 2) - 1), smooth = wave * wave * (3 - 2 * wave);   // 行き来（端でゆっくり）
          target = m.mode === 'hold' ? +on : m.mode === 'always' || on ? smooth : 0;
        }
        const max = (m.speed || 3.5) / Math.hypot(...m.to) * dt;                      // 急には動かない（ふつうは毎秒 3.5m まで）
        m.f += Math.max(-max, Math.min(max, target - m.f));
        o = m.to.map(v => v * m.f);
      }
      o.forEach((v, i) => { m.d[i] = v - m.o[i]; }); m.o = o;
      const b = m.box, s = m.b;
      b.x0 = s.x0 + o[0]; b.x1 = s.x1 + o[0]; b.y0 = s.y0 + o[1]; b.y1 = s.y1 + o[1]; b.z0 = s.z0 + o[2]; b.z1 = s.z1 + o[2];
    }
    for (const c of w.crates) {
      if (c.held) continue;
      if (c.on?.m) { c.x += c.on.m.d[0]; c.y += c.on.m.d[1]; c.z += c.on.m.d[2]; }                          // 動く床に乗っていれば一緒に動く
      if (c.on?.belt) { const nx = c.x + c.on.belt[0] * dt, nz = c.z + c.on.belt[1] * dt; if (!w.blocked(nx, nz, c.y, c.box, c.s / 2, c.s)) { c.x = nx; c.z = nz; } }
      const g = w.groundBox(c.x, c.z, c.y, c.box), gy = g ? g.y1 : -99;
      if (c.vy <= 0 && c.y - gy < 0.05) { c.y = gy; c.vy = 0; c.on = g; }
      else { c.on = null; c.vy -= GRAV * dt; c.y += c.vy * dt; if (c.y <= gy) { c.y = gy; c.vy = 0; } }
      if (c.y < stage.kill) { Object.assign(c, c.home, { vy: 0 }); c.moved = true; }                          // 落とした箱は元の場所へ戻る
      fit(c);
    }
    relist();
  };
  w.crates.forEach(fit); relist();
  return w;
}

/* キャラ 1 人ぶんの動き。step(dt, mx, mz, drag) の (mx, mz) は進みたい向き（長さ 1 まで）。
   drag は重い箱をつかんでいるとき：'drive' 自分が動かす／'follow' ほかの人が動かしていて、箱と一緒に引かれる／'stuck' 人数が足りず動かせない。
   起きたことは events にたまる（'cp' セーブ地点に着いた／'fell' 落ちてやり直し／'goal' ゴール） */
export function makePlayer(w) {
  const st = w.stage, p = { ry: 0, hvx: 0, hvz: 0, kvx: 0, kvz: 0, cp: 0, events: [], frozen: false };
  const facing = () => [Math.sin(p.ry), Math.cos(p.ry)];
  p.facing = facing;
  // セーブ地点の真上、空から落ちてくる
  p.respawn = () => {
    const c = st.cps[p.cp];
    p.grabEnd(); Object.assign(p, { x: c.x + (Math.random() - 0.5), y: c.y + 14, z: c.z + (Math.random() - 0.5), vy: 0, grounded: false, on: null, hvx: 0, hvz: 0, kvx: 0, kvz: 0 });
  };
  p.jump = () => { if (p.grounded && !p.hang && !p.frozen) { p.vy = JUMP; p.grounded = false; } };

  /* つかむ（押している間ずっと）：目の前の箱 → 持つ（重い箱は押し引き）／登れる縁 → ぶら下がる（前へ倒すとよじ登る）／壁 → 張りつく。
     戻り値は、つかんだ箱（なければ null） */
  p.grabStart = () => {
    if (p.grab || p.frozen) return null;
    p.grab = true;
    const [fx, fz] = facing();
    if (p.grounded) for (const c of w.crates) {                                      // 箱をつかむのは地面にいるときだけ（跳んでつかめば、箱の縁をよじ登れる）
      const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz);
      if (!c.held && d < c.s / 2 + 0.95 && (dx * fx + dz * fz) / d > 0.5 && Math.abs(c.y - p.y) < 1.2 && w.groundBox(p.x, p.z, p.y) !== c.box) {
        p.carry = c; p.off = [p.x - c.x, p.z - c.z]; if (!c.heavy) c.held = 'me';
        return c;
      }
    }
    const edge = w.ledge(p.x, p.z, p.y, fx, fz);
    if (edge) { p.hang = { b: edge }; p.vy = 0; }
    else { const wall = w.blocked(p.x + fx * 0.6, p.z + fz * 0.6, p.y); if (wall) { p.hang = { b: wall, flat: true }; p.vy = 0; } }
    return null;
  };
  // 放す。持っていた軽い箱は目の前（ふさがっていれば後ろ）に置く。戻り値は、放した箱
  p.grabEnd = () => {
    const c = p.carry; p.grab = false; p.hang = null; p.carry = null;
    if (c && !c.heavy) {
      const [fx, fz] = facing();
      // 斜めを向いていても体と重ならない距離に置く（重なると、箱にはさまって動けなくなる）
      for (const k of [0.95, -0.95]) { c.x = p.x + fx * k; c.z = p.z + fz * k; if (!w.blocked(c.x, c.z, c.y, c.box, c.s / 2, c.s)) break; }
      c.held = null; c.vy = 0; c.moved = true; w.fit(c);
    }
    return c || null;
  };

  p.step = (dt, mx, mz, drag = 'drive') => {
    if (p.frozen) { p.hvx = p.hvz = 0; p.walk = false; return; }                     // 仲間に持ち上げられている間は、呼び出し側が位置を決める
    if (p.on?.m) { p.x += p.on.m.d[0]; p.y += p.on.m.d[1]; p.z += p.on.m.d[2]; }     // 動く床に乗っていれば一緒に動く
    if (p.hang?.b.m) { const d = p.hang.b.m.d; p.x += d[0]; p.y += d[1]; p.z += d[2]; }
    if (p.on?.belt && !w.blocked(p.x + p.on.belt[0] * dt, p.z + p.on.belt[1] * dt, p.y)) { p.x += p.on.belt[0] * dt; p.z += p.on.belt[1] * dt; }   // ベルトに運ばれる
    const hit = w.blocked(p.x, p.z, p.y);                                            // 動く床や壁に押されたら、その動きのぶん押し出される
    if (hit?.m) { p.x += hit.m.d[0]; p.z += hit.m.d[2]; if (w.blocked(p.x, p.z, p.y) === hit && hit.m.d[1] < 0) p.y = hit.y0 - BODY; }

    const [fx, fz] = facing(), len = Math.hypot(mx, mz), input = len > 0.05 && !p.hang;
    const heavy = p.carry?.heavy ? p.carry : null;
    if (p.hang) {
      p.hvx = p.hvz = 0;
      if (!p.hang.flat && (mx * fx + mz * fz) > 0.3) {                                // 前へ倒している間、体をゆっくり引き上げる
        p.y += 1.6 * dt;
        if (p.y >= p.hang.b.y1) { p.y = p.hang.b.y1; p.x += fx * 0.65; p.z += fz * 0.65; p.hang = null; p.vy = 0; p.grounded = true; }
      }
    } else if (heavy && drag === 'follow') {                                         // ほかの人が動かしている重い箱に、つかんだまま引かれていく
      p.hvx = p.hvz = 0; p.x = heavy.x + p.off[0]; p.z = heavy.z + p.off[1];
    } else {
      const speed = heavy ? (drag === 'stuck' ? 0 : 1.2) : p.carry ? 2.3 : SPEED;
      if (input && !heavy) {                                                          // もたもた振り向く（重い箱をつかんでいる間は、向きを変えない）
        let d = Math.atan2(mx, mz) - p.ry; d = Math.atan2(Math.sin(d), Math.cos(d));
        p.ry += d * Math.min(1, dt * 4.5);
      }
      // 慣性：滑り出しが遅れ、止まるときに流れる。氷の上ではほとんど止まれない
      const ease = 1 - Math.exp(-dt * (p.on?.ice ? (input ? 1.2 : 0.4) : (input ? 4 : 5)));
      p.hvx += ((input ? mx * speed : 0) - p.hvx) * ease; p.hvz += ((input ? mz * speed : 0) - p.hvz) * ease;
      for (const axis of [0, 1]) {
        const ax = axis ? 0 : (p.hvx + p.kvx) * dt, az = axis ? (p.hvz + p.kvz) * dt : 0;
        if (!ax && !az) continue;
        if (heavy) {                                                                  // 重い箱：箱が進めるときだけ、箱ごと進む
          if (w.blocked(heavy.x + ax, heavy.z + az, heavy.y, heavy.box, heavy.s / 2, heavy.s) || w.blocked(p.x + ax, p.z + az, p.y, heavy.box)) continue;
          heavy.x += ax; heavy.z += az; heavy.moved = true; w.fit(heavy);
        } else if (w.blocked(p.x + ax, p.z + az, p.y, hit?.crate ? hit : undefined)) continue;   // 箱にめり込んでいたら、その箱は無視して抜け出せる
        p.x += ax; p.z += az;
      }
      const decay = Math.exp(-dt * 4.5); p.kvx *= decay; p.kvz *= decay;
    }
    p.walk = Math.hypot(p.hvx, p.hvz) > 0.4;

    // 上下動：歩いているだけなら足元の面に沿う。足元がなくなれば落ち、跳べば上がる。風の中では吹き上げられる
    const blow = !p.hang && w.windAt(p.x, p.y, p.z);
    if (blow) { p.vy = Math.min(blow.up, p.vy + 28 * dt); p.grounded = false; }
    const g = w.groundBox(p.x, p.z, p.y), gy = g ? g.y1 : -99;
    if (!p.hang) {
      if (p.grounded && p.vy <= 0 && p.y - gy < 0.45) p.y = gy;
      else { p.vy -= GRAV * dt; p.y += p.vy * dt; p.grounded = p.y <= gy; if (p.grounded) { p.y = gy; p.vy = 0; } }
      if (p.grounded && g?.bounce) { p.vy = g.bounce; p.grounded = false; }           // トランポリン
    }
    p.on = p.grounded ? g : null;
    p.falling = !p.grounded && !p.hang && p.vy < -8;                                 // 長く落ちている（空から落ちてくる姿勢にする）
    if (p.carry && !p.carry.heavy) { const c = p.carry, [ax, az] = facing(); c.x = p.x + ax * 0.75; c.y = p.y + 0.55; c.z = p.z + az * 0.75; }

    if (p.y < st.kill) { p.respawn(); p.events.push('fell'); }
    if (p.grounded) {
      st.cps.forEach((c, i) => { if (i > p.cp && Math.hypot(c.x - p.x, c.z - p.z) < 2.2 && Math.abs(c.y - p.y) < 1) { p.cp = i; p.events.push('cp'); } });
      if (!p.done && Math.hypot(st.goal.x - p.x, st.goal.z - p.z) < 1.6 && Math.abs(st.goal.y - p.y) < 1) { p.done = true; p.events.push('goal'); }
    }
  };
  p.respawn();
  return p;
}

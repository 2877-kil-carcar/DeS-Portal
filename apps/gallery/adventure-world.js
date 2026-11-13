/* もふもふ冒険の「世界」：足場・動く床・箱・ふみ板と、キャラの動き。
   描画も通信も含まない（adventure.html が描き、tools/test-adventure.mjs がこのまま動かして「1 人で解けるか」を検査する）。
   足場はすべて、軸にそろった箱。キャラは半径 R・高さ BODY の円柱として当たりを取る。
   shortcut: 箱は回転しない・転がらない。シーソーや振り子のような仕掛けが要るなら、物理エンジンへ移す */
export const R = 0.3, BODY = 1.4, STEP = 0.35, REACH = 1.7, GRAV = 14, JUMP = 5.6, SPEED = 4;

// 箱：中心 x・上面の高さ・中心 z・幅・奥行・厚み・色番号（0 草 / 1 石 / 2 木 / 3 動く床 / 4 門）
const B = (x, top, z, w, d, h = 1, c = 0) => ({ x0: x - w / 2, x1: x + w / 2, y0: top - h, y1: top, z0: z - d / 2, z1: z + d / 2, c });
const P = (x, y, z) => ({ x, y, z, w: 1.6, d: 1.6 });                       // ふみ板
const CP = (x, y, z, hint) => ({ x, y, z, hint });                          // セーブ地点（先頭が出発点）

/* 動く床・門（movers）: b を to だけ動かす。
   mode 'always' 行ったり来たりし続ける／'loop' ふみ板（on）が押されている間だけ行き来し、離すと元へ戻る／'hold' 押されている間だけ動いた先にいる
   on が複数のとき、any: true なら「どれか 1 枚」、なければ「全部」。period は片道にかける時間（ミリ秒） */
export const STAGES = [
  { name: 'そらの小島', sky: ['#5fb4f2', '#d9f1ff'], kill: -12,
    boxes: [B(0, 0, 0, 8, 8, 3), B(0, 0, 8, 6, 4, 3), B(0, 1, 13, 6, 4, 4), B(0, 2.6, 21, 10, 12, 5.6, 1), B(0, 2.6, 31, 3, 8, 1, 2),
      B(0, 2.6, 39, 8, 8, 3), B(0, 8.6, 51, 8, 6, 2, 1), B(0, 8.6, 71, 8, 8, 3)],
    plates: [P(3, 2.6, 22)],
    movers: [{ b: B(0, 5.8, 28, 3, 0.6, 3.2, 4), to: [0, -3.3, 0], mode: 'hold', on: [0] },
      { b: B(0, 2.6, 45.75, 3, 3, 0.5, 3), to: [0, 6, 0], mode: 'always', period: 5000 },
      { b: B(0, 8.6, 57, 3, 3, 0.5, 3), to: [0, 0, 8.5], mode: 'always', period: 5000 }],
    crates: [{ x: -3, y: 2.6, z: 19, s: 0.8 }],
    cps: [CP(0, 0, 0, 'ジャンプですき間を越えよう。高い段は「つかむ」を押したまま前へ倒すとよじ登れる'),
      CP(0, 2.6, 18, '箱をつかんで、黄色いふみ板まで運ぼう（だれかが乗ってもOK）'), CP(0, 2.6, 39, '動く床に乗って上へ'), CP(0, 8.6, 51, '動く床で向こう岸のゴールへ')],
    goal: { x: 0, y: 8.6, z: 72 } },
  { name: 'つみきの城', sky: ['#7a8cf0', '#ffe9d6'], kill: -12,
    boxes: [B(0, 0, 0, 12, 12, 3), B(0, 3, 15, 12, 18, 6, 1), B(0, 3, 29, 3, 10, 1, 2), B(0, 3, 38, 8, 8, 3), B(0, 3, 60, 8, 8, 3, 1), B(0, 3, 76, 8, 8, 3)],
    plates: [P(-4, 3, 18), P(4, 3, 18), P(3, 3, 58), P(3, 3, 74)],
    movers: [{ b: B(0, 6.2, 25, 3, 0.6, 3.2, 4), to: [0, -3.3, 0], mode: 'hold', on: [0, 1] },
      { b: B(-2.5, 3, 44.5, 3, 3, 0.5, 3), to: [5, 0, 0], mode: 'always', period: 3500 },
      { b: B(2.5, 3, 49, 3, 3, 0.5, 3), to: [-5, 0, 0], mode: 'always', period: 3500 },
      { b: B(-2.5, 3, 53.5, 3, 3, 0.5, 3), to: [5, 0, 0], mode: 'always', period: 3500 },
      { b: B(0, -3, 68, 3, 8, 0.5, 2), to: [0, 6, 0], mode: 'hold', on: [2, 3], any: true }],
    crates: [{ x: 3, y: 0, z: 1, s: 1.4, heavy: true }, { x: -2, y: 3, z: 10, s: 0.8 }, { x: 2, y: 3, z: 10, s: 0.8 }, { x: -2, y: 3, z: 60, s: 0.8 }],
    cps: [CP(0, 0, 0, '重い箱を壁ぎわまで押して、足場にしよう（2人以上いるときは2人でつかむ）'), CP(0, 3, 9, 'ふみ板2枚を同時に押すと門が開く'),
      CP(0, 3, 38, '動く床をタイミングよく渡ろう'), CP(0, 3, 60, 'ふみ板が押されている間だけ橋が上がる')],
    goal: { x: 0, y: 3, z: 77 } },
  { name: 'ゆうやけの塔', sky: ['#f08a5d', '#ffe2a8'], kill: -12,
    boxes: [B(0, 0, 0, 14, 14, 3), B(0, 1.5, 9, 6, 4, 4.5, 1), B(0, 3, 13, 6, 4, 6, 1), B(0, 10, 23, 10, 8, 3), B(0, 10, 39, 10, 8, 3),
      B(0, 13, 46, 10, 6, 6, 1), B(0, 13, 53, 4, 4, 1, 2), B(0, 14, 58.5, 4, 4, 1, 2), B(0, 15, 64.5, 6, 6, 1)],
    plates: [P(-5, 0, 4), P(4, 10, 21), P(-4, 10, 21), P(4, 10, 37)],
    movers: [{ b: B(0, 3, 16.75, 3, 3, 0.5, 3), to: [0, 7, 0], mode: 'loop', on: [0, 1], any: true, period: 5000 },
      { b: B(0, 10, 28.75, 3, 3, 0.5, 3), to: [0, 0, 4.5], mode: 'loop', on: [2, 3], any: true, period: 4000 }],
    crates: [{ x: -3, y: 0, z: -3, s: 0.8 }, { x: -4, y: 10, z: 25, s: 0.8 }, { x: 3, y: 10, z: 38, s: 1.4, heavy: true }],
    cps: [CP(0, 0, 0, 'ふみ板が押されている間、エレベーターが動く'), CP(0, 10, 23, '次のふみ板で、動く床を動かそう'),
      CP(0, 10, 39, '重い箱を壁に寄せて登ろう'), CP(0, 13, 46, 'あと少し！')],
    goal: { x: 0, y: 15, z: 64.5 } },
];

export function makeWorld(stage) {
  const w = { stage, list: [] };
  w.movers = stage.movers.map(m => ({ ...m, f: 0, d: [0, 0, 0], box: { ...m.b } }));
  w.movers.forEach(m => { m.box.m = m; });
  w.plates = stage.plates.map(p => ({ ...p, down: false }));
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

  /* 1 コマ進める。now は時刻（ミリ秒。全員の端末で同じ動きになるよう、動く床は時刻から位置を決める）、
     bodies は全員の足の位置 [[x, y, z], …]（ふみ板を押す） */
  w.step = (dt, now, bodies) => {
    const press = bodies.concat(w.crates.filter(c => !c.held).map(c => [c.x, c.y, c.z]));
    for (const p of w.plates) p.down = press.some(q => Math.abs(q[0] - p.x) < p.w / 2 + 0.15 && Math.abs(q[2] - p.z) < p.d / 2 + 0.15 && q[1] > p.y - 0.1 && q[1] < p.y + 0.3);
    for (const m of w.movers) {
      const on = !m.on || (m.any ? m.on.some(i => w.plates[i].down) : m.on.every(i => w.plates[i].down));
      const wave = 1 - Math.abs((now / (m.period || 1) % 2) - 1), smooth = wave * wave * (3 - 2 * wave);   // 行き来（端でゆっくり）
      const target = m.mode === 'hold' ? +on : m.mode === 'always' || on ? smooth : 0;
      const len = Math.hypot(...m.to), max = 3.5 / len * dt, f0 = m.f;                                      // 急には動かない（毎秒 3.5m まで）
      m.f += Math.max(-max, Math.min(max, target - m.f));
      m.to.forEach((v, i) => { m.d[i] = v * (m.f - f0); });
      const b = m.box, s = m.b, f = m.f;
      b.x0 = s.x0 + m.to[0] * f; b.x1 = s.x1 + m.to[0] * f; b.y0 = s.y0 + m.to[1] * f; b.y1 = s.y1 + m.to[1] * f; b.z0 = s.z0 + m.to[2] * f; b.z1 = s.z1 + m.to[2] * f;
    }
    for (const c of w.crates) {
      if (c.held) continue;
      if (c.on?.m) { c.x += c.on.m.d[0]; c.y += c.on.m.d[1]; c.z += c.on.m.d[2]; }                          // 動く床に乗っていれば一緒に動く
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
   drag は重い箱をつかんでいるとき：'drive' 自分が動かす／'follow' ほかの人が動かす／'stuck' 人数が足りず動かせない。
   起きたことは events にたまる（'cp' セーブ地点に着いた／'fell' 落ちてやり直し／'goal' ゴール） */
export function makePlayer(w) {
  const st = w.stage, p = { ry: 0, hvx: 0, hvz: 0, kvx: 0, kvz: 0, cp: 0, events: [], frozen: false };
  const facing = () => [Math.sin(p.ry), Math.cos(p.ry)];
  p.facing = facing;
  // セーブ地点の真上、空から落ちてくる
  p.respawn = () => {
    const c = st.cps[p.cp];
    p.grabEnd(); Object.assign(p, { x: c.x + (Math.random() - 0.5), y: c.y + 14, z: c.z + (Math.random() - 0.5), vy: 0, grounded: false, on: null, hvx: 0, hvz: 0, kvx: 0, kvz: 0, air: 14 });
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
        p.carry = c; if (!c.heavy) c.held = 'me';
        return c;
      }
    }
    const edge = w.ledge(p.x, p.z, p.y, fx, fz);
    if (edge) { p.hang = { b: edge }; p.vy = 0; }
    else { const wall = w.blocked(p.x + fx * 0.6, p.z + fz * 0.6, p.y); if (wall) { p.hang = { b: wall, flat: true }; p.vy = 0; } }
    return null;
  };
  // 放す。持っていた箱は目の前（ふさがっていれば後ろ）に置く。戻り値は、放した箱
  p.grabEnd = () => {
    const c = p.carry; p.grab = false; p.hang = null; p.carry = null;
    if (c && !c.heavy) {
      const [fx, fz] = facing();
      for (const k of [0.75, -0.75]) { c.x = p.x + fx * k; c.z = p.z + fz * k; if (!w.blocked(c.x, c.z, c.y, c.box, c.s / 2, c.s)) break; }
      c.held = null; c.vy = 0; c.moved = true; w.fit(c);
    }
    return c || null;
  };

  p.step = (dt, mx, mz, drag = 'drive') => {
    if (p.frozen) { p.hvx = p.hvz = 0; p.walk = false; return; }                     // 仲間に持ち上げられている間は、呼び出し側が位置を決める
    if (p.on?.m) { p.x += p.on.m.d[0]; p.y += p.on.m.d[1]; p.z += p.on.m.d[2]; }     // 動く床に乗っていれば一緒に動く
    if (p.hang?.b.m) { const d = p.hang.b.m.d; p.x += d[0]; p.y += d[1]; p.z += d[2]; }
    const hit = w.blocked(p.x, p.z, p.y);                                            // 動く床や門に押されたら、その動きのぶん押し出される
    if (hit?.m) { p.x += hit.m.d[0]; p.z += hit.m.d[2]; if (w.blocked(p.x, p.z, p.y) === hit && hit.m.d[1] < 0) p.y = hit.y0 - BODY; }

    const [fx, fz] = facing(), len = Math.hypot(mx, mz), input = len > 0.05 && !p.hang;
    if (p.hang) {
      p.hvx = p.hvz = 0;
      if (!p.hang.flat && (mx * fx + mz * fz) > 0.3) {                                // 前へ倒している間、体を引き上げる
        p.y += 2.4 * dt;
        if (p.y >= p.hang.b.y1) { p.y = p.hang.b.y1; p.x += fx * 0.65; p.z += fz * 0.65; p.hang = null; p.vy = 0; p.grounded = true; }
      }
    } else {
      const heavy = p.carry?.heavy, speed = (heavy ? 1.6 : p.carry ? 3.2 : SPEED) * (heavy && drag === 'stuck' ? 0 : 1);
      if (input) {
        let d = Math.atan2(mx, mz) - p.ry; d = Math.atan2(Math.sin(d), Math.cos(d));
        if (!heavy) p.ry += d * Math.min(1, dt * 7);                                  // 重い箱をつかんでいる間は、向きを変えない
      }
      const ease = 1 - Math.exp(-dt * (input ? 7 : 5));                              // 慣性：滑り出しが遅れ、止まるときに少し流れる
      p.hvx += ((input ? mx * speed : 0) - p.hvx) * ease; p.hvz += ((input ? mz * speed : 0) - p.hvz) * ease;
      const c = heavy ? p.carry : null;
      for (const axis of [0, 1]) {
        const ax = axis ? 0 : (p.hvx + p.kvx) * dt, az = axis ? (p.hvz + p.kvz) * dt : 0;
        if (!ax && !az) continue;
        if (c && drag === 'drive') {                                                  // 重い箱：箱が進めるときだけ、箱ごと進む
          if (w.blocked(c.x + ax, c.z + az, c.y, c.box, c.s / 2, c.s) || w.blocked(p.x + ax, p.z + az, p.y, c.box)) continue;
          c.x += ax; c.z += az; c.moved = true; w.fit(c);
        } else if (w.blocked(p.x + ax, p.z + az, p.y)) continue;
        p.x += ax; p.z += az;
      }
      if (c && Math.hypot(c.x - p.x, c.z - p.z) > c.s / 2 + 1.3) p.grabEnd();          // 箱から離れすぎたら手が離れる
      const decay = Math.exp(-dt * 4.5); p.kvx *= decay; p.kvz *= decay;
    }
    p.walk = Math.hypot(p.hvx, p.hvz) > 0.5;

    // 上下動：歩いているだけなら足元の面に沿う。足元がなくなれば落ち、跳べば上がる
    const g = w.groundBox(p.x, p.z, p.y), gy = g ? g.y1 : -99;
    if (!p.hang) {
      if (p.grounded && p.vy <= 0 && p.y - gy < 0.45) p.y = gy;
      else { p.vy -= GRAV * dt; p.y += p.vy * dt; p.grounded = p.y <= gy; if (p.grounded) { p.y = gy; p.vy = 0; } }
    }
    p.on = p.grounded ? g : null; p.air = Math.max(0, p.y - gy);
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

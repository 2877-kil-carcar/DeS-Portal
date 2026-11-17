// もふもふ冒険の各ステージが「1 人で最後まで解ける」ことを、描画も通信もなしで検査する。
// 自動操縦：目的地へ歩き、足元がなくなれば跳び、登れる縁があればつかんでよじ登る（跳ばないと届かない段は hoist、あみは climb）。
// ステージごとの手順は tools/adventure-bots/sN.mjs（ステージ apps/gallery/adventure-stages/sN.js と 1 対 1）。
// つないだステージ（adventure-stages/c.js など）は、前半・後半のボット sN.mjs と、つなぎのボット（c.mjs など）を続けて動かす（下の「つないだステージ」）。
// 使い方：node tools/test-adventure.mjs            … 全ステージ
//         node tools/test-adventure.mjs 3 5 c      … ステージ 3 と 5 と、つないだステージ c だけ
//         VIEW=1 node tools/test-adventure.mjs 8   … そのうえ、ボット s8.mjs が、ずらした後半としても（view ごしに）全部動くかを確かめる
//         FPS=20 node tools/test-adventure.mjs     … 遅い端末のコマ数（毎秒 20 コマ）で
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { kit, makeWorld, makePlayer } from '../apps/gallery/adventure-world.js';
const FPS = +process.env.FPS || 60, DT = 1 / FPS;

// cp を渡すと、そのセーブ地点から始める（ページの「後半から」と同じ）
export function makeBot(stage, cp = 0) {
  const w = makeWorld(stage), p = makePlayer(w), name = stage.name;
  if (cp) { p.cp = cp; p.seen.add(cp); p.respawn(); }
  let now = 0, falls = 0;
  const where = () => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
  // friend：いることにする仲間の体 [x, y, z, 重さ]（2 人で解く答えを、通信なしで確かめる）。いなければ null。動く床の上に置けば、床と一緒に運ばれる
  // friendGrip：その仲間が回しているハンドルの番号（なければ null）
  const api = { w, p, FPS, friend: null, friendGrip: null, get falls() { return falls; }, get now() { return now; } };
  const tick = api.tick = (mx = 0, mz = 0) => {
    const me = [p.x, p.y, p.z, p.carry && !p.carry.heavy ? 2 : 1], f = api.friend;  // 軽い箱を持っている間は、2 人ぶんの重さ
    const g = f && w.groundBox(f[0], f[2], f[1]), deck = g && Math.abs(f[1] - g.y1) < 0.05 && g.m;   // 仲間が立っている動く床（宙に浮いて見える仲間は、運ばれない）
    now += 1000 * DT; w.step(DT, now, f ? [me, f] : [me], [p.crank, api.friendGrip].filter(h => h != null));
    if (deck) deck.d.forEach((v, i) => { f[i] += v; });
    p.step(DT, mx, mz);
    if (p.events.includes('fell')) { falls++; api.fellAt = api.last; }
    if (p.events.includes('goal')) p.goal = true;
    p.events.length = 0; api.last = where();
    for (const m of w.movers) { m.rise = m.f > (m.pf ?? m.f); m.fall = m.f < (m.pf ?? m.f); m.pf = m.f; }   // 動く床が、いまどちらへ動いているか
    for (const k of w.winds) { k.began = k.active && !k.was; k.was = k.active; }
  };
  api.where = where;
  api.wait = (what, pred, seconds = 30) => { for (let i = 0; i < seconds * FPS; i++) { if (pred()) return; tick(); } assert.fail(`${name}: 「${what}」を待ちきれない ${where()}`); };
  // target は [x, z] か、それを返す関数（動く床を追うとき）。until があれば、着くかわりにその条件で終わる（風に乗っている間など）
  api.go = (target, until, seconds = 25) => {
    for (let i = 0; i < seconds * FPS; i++) {
      const [tx, tz] = typeof target === 'function' ? target() : target, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (until ? until() : d < 0.3 && p.grounded) { if (!p.carry) p.grabEnd(); return; }
      if (d < 0.05) { tick(); continue; }
      const fx = dx / d, fz = dz / d, [hx, hz] = p.facing(), aligned = hx * fx + hz * fz > 0.95;
      if (!p.carry) {
        if (p.grab && !p.hang) p.grabEnd();
        if (aligned && !p.grab) {                                             // 重い箱は、跳んでからつかむと登れる（地面でつかむと押し引きになる）
          const e = w.ledge(p.x, p.z, p.y, hx, hz);
          if (e?.crate?.heavy && p.grounded) p.jump(); else if (e && !(e.crate && !e.crate.heavy) && (p.grounded || e.crate)) p.grabStart();
        }
      }
      if (p.grounded && aligned && d > 0.9 && !w.groundBox(p.x + fx * 0.5, p.z + fz * 0.5, p.y)) p.jump();
      tick(fx, fz);
    }
    assert.fail(`${name}: 目的地 ${typeof target === 'function' ? target() : target} に着けない ${where()}`);
  };
  api.face = (x, z) => { p.ry = Math.atan2(x - p.x, z - p.z); };
  // 箱 i のそばへ行ってつかむ（from: つかむときに立つ場所。省くと、いまいる側から近づく）
  api.grab = (i, from) => {
    const c = w.crates[i], d0 = Math.hypot(p.x - c.x, p.z - c.z);
    api.go(from || [c.x + (p.x - c.x) / d0, c.z + (p.z - c.z) / d0]); api.face(c.x, c.z);
    assert.equal(p.grabStart(), c, `${name}: 箱 ${i} をつかめない ${where()}`);
  };
  // 持っている軽い箱を、(x, z) の上に置く
  api.put = (x, z) => { const ux = x - p.x, uz = z - p.z, u = Math.hypot(ux, uz); api.go([x - ux / u * 0.95, z - uz / u * 0.95]); p.grabEnd(); };
  // 軽い箱 i を、ふみ板 plate の上へ運んで置く
  api.carry = (i, plate) => {
    const t = w.plates[plate];
    api.grab(i); api.put(t.x, t.z);
    api.wait(`ふみ板 ${plate} が押される`, () => t.down, 3);
  };
  // 重い箱 i を、進めなくなるまで (dx, dz) の向きへ押す
  api.push = (i, from, dx, dz) => {
    api.grab(i, from);
    let last = 1e9, still = 0;
    for (let n = 0; n < FPS * 40 && still < FPS / 2; n++) { tick(dx, dz); const c = w.crates[i], q = c.x * dx + c.z * dz; still = Math.abs(q - last) < 1e-4 ? still + 1 : 0; last = q; }
    p.grabEnd();
  };
  api.center = m => { const k = w.movers[m].box; return [(k.x0 + k.x1) / 2, (k.z0 + k.z1) / 2]; };
  // 動く床 m に、近くへ来たときに飛び乗る
  api.hop = (m, reach = 1.2) => { const k = w.movers[m].box; api.wait(`動く床 ${m} が近づく`, () => p.grounded && Math.abs(api.center(m)[0] - p.x) < reach && Math.abs(k.y1 - p.y) < 0.3); api.go(() => api.center(m)); };
  // 動く床 m に乗ったまま、行き先（frac = 1）か出発点（0）に着くのを待つ
  api.ride = (m, frac) => api.wait(`動く床 ${m} が${frac ? '行き先' : '出発点'}に着く`, () => Math.abs(w.movers[m].f - frac) < 0.03);
  // 上下する床 m が下りてくるのを待つ（上がっている間に踏み出すと、床の下へ落ちる）
  api.board = m => { let prev = 2; api.wait(`動く床 ${m} が下りてくる`, () => { const f = w.movers[m].f, ok = f < 0.3 && f < prev; prev = f; return ok; }); };
  // 乗ると動く床 m（mode 'ride'）で向こう岸へ渡り、off へ降りる。だれもいなくなった床が、出発点へ帰ることも確かめる
  api.tram = (m, off) => {
    const k = w.movers[m];
    api.go(() => api.center(m)); api.wait(`乗ると動く床 ${m} が行き先に着く`, () => k.f > 0.97);
    api.go(off);
    api.wait(`乗ると動く床 ${m} が出発点へ帰る`, () => k.f < 0.03, (k.wait ?? 1.5) + Math.hypot(...k.to) / (k.speed || 2.5) + 2);
  };
  // せんぷうき箱 i を spot に置き、その風に乗って高さ ledgeY を越えてから、landing へ降りる
  api.fanUp = (i, spot, ledgeY, landing) => {
    const c = w.crates[i];
    api.grab(i); api.put(...spot); api.wait(`せんぷうき箱 ${i} の風が出る`, () => w.winds.some(k => k.fan === c && k.active), 3);
    api.face(c.x, c.z); p.jump();
    api.go([c.x, c.z], () => p.y > ledgeY);
    api.go(landing);
  };
  // あみを登る：foot（あみの前の地面）へ行き、top（登った先）の向きにあみをつかんで、てっぺんまで登る
  api.climb = (foot, top) => {
    api.go(foot); api.face(...top); p.grabStart();
    assert.ok(p.hang?.climb, `${name}: あみをつかめない ${where()}`);
    const net = p.hang.b, [fx, fz] = p.facing();
    for (let n = 0; p.hang || p.y < net.y1 - 0.01; n++) { assert.ok(p.hang && n < FPS * 40, `${name}: あみを登りきれない ${where()}`); tick(fx, fz); }
    p.grabEnd(); api.go(top);
  };
  // 跳んでつかまないと届かない段（地面から 1.7〜2.4m。箱や台車の上からなら、そこから 2.4m まで）をよじ登る：
  // foot（段の前）へ行き、top（登った先）のほうを向いて跳び、「つかむ」を押したまま前へ倒しつづける
  api.hoist = (foot, top) => {
    api.go(foot); api.face(...top); const [fx, fz] = p.facing(), from = p.y;
    p.jump(); p.grabStart();
    for (let n = 0; !(p.grounded && p.y > from + 1.2); n++) { assert.ok(n < FPS * 6, `${name}: 跳んでつかんでも、段によじ登れない ${where()}`); tick(fx, fz); }
    p.grabEnd(); api.go(top);
  };
  // ハンドル h のそばへ行ってつかみ、pred が合うまで回しつづけてから放す
  api.crank = (h, pred) => {
    const k = w.handles[h], d0 = Math.hypot(p.x - k.x, p.z - k.z), ux = (p.x - k.x) / d0, uz = (p.z - k.z) / d0;
    api.go(() => [k.x + ux * 0.5, k.z + uz * 0.5]); api.face(k.x, k.z); p.grabStart();   // 動く床に付いたハンドルは、床と一緒に動くので追いかける
    assert.equal(p.crank, h, `${name}: ハンドル ${h} をつかめない ${where()}`);
    tick(); api.wait(`ハンドル ${h} を回しきる`, pred, 60); p.grabEnd();               // 少なくとも 1 コマは回す（もう行ききっている床も、止まっている時間が数えなおしになる）
  };
  // とって・ロープ・ふうせん i（ropes の番号）の真下（from があれば、そこ：点が足場の外にあるとき）へ行ってつかみ、pred が合うまでつかまってから放す（放すと、点の速さのまま飛ぶ。pred を省くと放さない）
  api.hang = (i, pred, from) => {
    const r = w.ropes[i]; api.go(from || (() => [r.at[0], r.at[2]])); p.grabStart();
    assert.equal(p.rope, i, `${name}: とって・ロープ・ふうせん ${i} をつかめない ${where()}`);
    if (pred) { api.wait(`とって・ロープ・ふうせん ${i} を放すとき`, pred, 60); p.grabEnd(); }
  };
  // 検査のために、キャラをその場所へ置く（セーブ地点 cp も指定できる）
  api.place = (x, y, z, cp) => { Object.assign(p, { x, y, z, vy: 0, hvx: 0, hvz: 0, grounded: true }); if (cp != null) p.cp = cp; };
  api.wait('空から着地', () => p.grounded, 6);
  return api;
}

/* つないだステージ（adventure-join.js）の一部分 part を、その部分だけのステージと同じ座標・番号で見せる自動操縦（部分ごとのボットを、そのまま動かすため）。
   読むときは、ずらした座標（x・x0・x1・z・z0・z1）と番号（配列の添え字・p.cp・p.near・p.seen・p.crank・p.rope・w.broken・w.smashed・信号の crate・ハンドルの ride）から part の分を引き、
   書くときは足す。p.goal は、前半（part.end がある）では「前半のゴールの場所に立っている」。
   shortcut: レールの min・max・ポイントの at・to・ropes の点の場所 at と、w.test・w.smash・w.release に渡す番号は、ずらさない（いまのボットは読まない）。読むボットができたら、ここに足す */
export function view(b, part) {
  const [dx, dz] = part.off, base = part.base, D = { x: dx, x0: dx, x1: dx, z: dz, z0: dz, z1: dz };
  const INDEX = { cp: 'cps', near: 'cps', crank: 'handles', rope: 'ropes', crate: 'crates', ride: 'movers', id: 'crates' }, SETS = { broken: 'boxes', smashed: 'boxes', seen: 'cps' };
  const XZ = new Set(['groundBox', 'floorY', 'blocked', 'wall', 'ledge', 'footing', 'heldSpot']);   // (x, z, y, …) を受け取る関数
  const shift = k => D[k] ?? (INDEX[k] ? base[INDEX[k]] : 0), proxies = new WeakMap(), raw = new WeakMap();
  const unwrap = v => raw.get(v) ?? v;
  const toWorld = (v, k) => typeof v === 'number' ? v + shift(k) : !v || typeof v !== 'object' ? v : raw.has(v) ? raw.get(v)
    : Array.isArray(v) ? v.map(e => toWorld(e)) : Object.fromEntries(Object.entries(v).map(([key, e]) => [key, toWorld(e, key)]));
  const wrap = (v, skip = 0) => {                                                     // skip：配列の先頭から、見せない数（ほかの部分のもの）
    if (!v || typeof v !== 'object') return v;
    if (proxies.has(v)) return proxies.get(v);
    const list = Array.isArray(v), index = k => list && typeof k === 'string' && /^\d+$/.test(k);
    const px = new Proxy(v, {
      get(t, k) {
        if (index(k)) return wrap(t[+k + skip]);
        if (list) return k === 'length' ? t.length - skip : t[k];
        const e = t[k];
        if (typeof e === 'number') return e - shift(k);
        if (k === 'goal' && t === b.p && part.end) { const g = part.end; return Math.hypot(t.x - g.x, t.z - g.z) < 1.6 && Math.abs(t.y - g.y) < 1; }
        if (SETS[k] && e && typeof e === 'object') { const s = [...e].map(i => i - base[SETS[k]]).filter(i => i >= 0); return e instanceof Set ? new Set(s) : s; }
        if (typeof e === 'function') return (...a) => {
          if (!XZ.has(k)) return wrap(e.apply(t, a.map(unwrap)));
          const r = e.call(t, a[0] + dx, a[1] + dz, ...a.slice(2).map(unwrap));
          return k === 'heldSpot' ? [r[0] - dx, r[1], r[2] - dz] : wrap(r);
        };
        return wrap(e, (t === b.w || t === b.w.stage) && base[k] != null ? base[k] : 0);
      },
      set(t, k, e) { if (index(k)) t[+k + skip] = toWorld(e); else t[k] = toWorld(e, k); return true; },
    });
    proxies.set(v, px); raw.set(px, v);
    return px;
  };
  const P = q => q && [q[0] + dx, q[1] + dz], T = q => typeof q === 'function' ? () => P(q()) : P(q), C = i => i + base.crates, M = i => i + base.movers;
  return {
    w: wrap(b.w), p: wrap(b.p), FPS: b.FPS, tick: b.tick, wait: b.wait, where: b.where,
    get falls() { return b.falls; }, get now() { return b.now; }, get fellAt() { return b.fellAt; },
    get friend() { const f = b.friend; return f && [f[0] - dx, f[1], f[2] - dz, f[3]]; }, set friend(f) { b.friend = f && [f[0] + dx, f[1], f[2] + dz, f[3]]; },
    get friendGrip() { return b.friendGrip == null ? null : b.friendGrip - base.handles; }, set friendGrip(h) { b.friendGrip = h == null ? null : h + base.handles; },
    go: (t, until, s) => b.go(T(t), until, s), face: (x, z) => b.face(x + dx, z + dz), put: (x, z) => b.put(x + dx, z + dz),
    grab: (i, from) => b.grab(C(i), P(from)), carry: (i, k) => b.carry(C(i), k + base.plates), push: (i, from, ux, uz) => b.push(C(i), P(from), ux, uz),
    center: m => { const [x, z] = b.center(M(m)); return [x - dx, z - dz]; },
    hop: (m, reach) => b.hop(M(m), reach), ride: (m, f) => b.ride(M(m), f), board: m => b.board(M(m)), tram: (m, off) => b.tram(M(m), P(off)),
    fanUp: (i, spot, y, landing) => b.fanUp(C(i), P(spot), y, P(landing)), climb: (f, t) => b.climb(P(f), P(t)), hoist: (f, t) => b.hoist(P(f), P(t)),
    crank: (h, pred) => b.crank(h + base.handles, pred), hang: (i, pred, from) => b.hang(i + base.ropes, pred, P(from)), place: (x, y, z, cp) => b.place(x + dx, y, z + dz, cp == null ? cp : cp + base.cps),
  };
}

// ここから下は、このファイルを直接動かしたときだけ（tools/test-adventure-mechanics.mjs は makeBot だけを借りる）
// ステージのファイル名：sN.js（ひとつのステージ）と、a.js〜（2 つをつないだステージ）。引数の数字 N は sN、文字はそのファイル
const dir = new URL('../apps/gallery/adventure-stages/', import.meta.url);
const all = fs.readdirSync(dir).map(f => /^(s\d+|[a-z])\.js$/.exec(f)?.[1]).filter(Boolean).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
const only = process.argv.slice(2).map(a => /^\d+$/.test(a) ? 's' + a : a);
const bot = async id => (await import(new URL(`./adventure-bots/${id}.mjs`, import.meta.url).href)).default;
const STOP = new Error('ここまで');                                                    // 部分のボットが、ほかの道を試しはじめた（fresh() を呼んだ）
for (const id of path.basename(process.argv[1] || '') !== 'test-adventure.mjs' ? [] : only.length ? only : all) {
  const stage = (await import(new URL(`${id}.js`, dir).href)).default(kit), label = `stage ${id} 「${stage.name}」`;
  const done = (b, what) => {
    assert.ok(b.p.goal, `${stage.name}: ${what}でゴールに着いていない ${b.where()}`);
    assert.equal(b.falls, 0, `${stage.name}: ${what}の途中で ${b.falls} 回落ちた（最後は ${b.fellAt} の近く）`);
  };
  if (!stage.parts) {
    const fresh = () => makeBot(stage), b = fresh();
    await (await bot(id))(b, { assert, fresh, stage });
    done(b, '');
    console.log(`PASS ${label} is solvable alone`);
    continue;
  }
  /* つないだステージ：部分ごとのボット（前半 parts[0].id・つなぎ＝このステージのファイル名・後半 parts[2].id）を、view で座標と番号をそろえて動かす。
     部分のボットは、はじめの道を b で進み、最初の fresh() でその部分を終える（ほかの道は、その部分だけのステージ sN で確かめている） */
  const parts = stage.parts, scripts = [await bot(parts[0].id), await bot(id), await bot(parts[2].id)];
  const play = async (b, k, fresh) => { const v = view(b, parts[k]); try { await scripts[k](v, { assert, fresh, stage: v.w.stage }); } catch (e) { if (e !== STOP) throw e; } };
  const stop = () => { throw STOP; };
  const b = makeBot(stage);
  for (const k of [0, 1, 2]) await play(b, k, stop);
  done(b, '最初から');
  const half = makeBot(stage, parts[2].cp);                                           // 「後半から」：後半のはじめのセーブ地点から
  assert.equal(half.p.cp, parts[2].cp);
  await play(half, 2, stop); done(half, '後半から');
  // つなぎのボットは、ほかの道・できてはいけないことまで全部。fresh() は、つなぎの入口のセーブ地点から始める
  await play(makeBot(stage, parts[1].cp), 1, () => view(makeBot(stage, parts[1].cp), parts[1]));
  console.log(`PASS ${label} is solvable alone (start to finish, from the second half, and the link checks)`);
}
// VIEW=1：部分のボットが view ごしに動くかを確かめる。どのステージ sN も、自分どうしをつないだ（後半を 300m 東へずらした）ステージの後半として、ほかの道まで全部動かす
if (process.env.VIEW && path.basename(process.argv[1] || '') === 'test-adventure.mjs') {
  const { join } = await import('../apps/gallery/adventure-join.js');
  for (const id of (only.length ? only : all).filter(i => i[0] === 's')) {
    const make = (await import(new URL(`${id}.js`, dir).href)).default;
    const stage = join(kit, { name: 'view', first: [id, make], second: [id, make], off: [300, 40], link: ({ CP }) => ({ cps: [CP(300, -50, 300, '')] }) });
    const part = stage.parts[2], fresh = () => view(makeBot(stage, part.cp), part), b = fresh();
    await (await bot(id))(b, { assert, fresh, stage: b.w.stage });
    assert.ok(b.p.goal && b.falls === 0, `${id}: view ごしでは、ゴールに着かない／落ちた ${b.where()}`);
    console.log(`PASS stage ${id} bot also runs as the shifted second half of a joined stage`);
  }
}

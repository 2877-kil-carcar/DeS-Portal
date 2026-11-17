/* もふもふ冒険：2 つのステージを「つなぎ」でつないで、1 本の長いステージにする（adventure-stages/ の a.js〜d.js が使う）。
   部分（parts）は [前半, つなぎ, 後半] の 3 つ。どの配列（boxes・plates・movers・crates・handles・winds・cps・warps・deco・ropes・cranes）も、この順にならべる。
   座標：前半とつなぎは、そのまま。後半だけ off = [東へ, 北へ]（m）ずらす（上下にはずらさない：kill より下にしまう床が、kill より上に出てしまう）。
   番号：条件の on・レールの端（railEnd）の箱・ハンドルの ride・動く床の handles・objective は、それぞれの部分の中で数えた番号で書き、ここで前の部分の数を足す。
         つなぎ（link）も、つなぎの中だけで数えた番号で書く（座標はステージ全体のもの）。てんびん・シーソーの組の名前は、部分ごとに別のものになる。
   ゴール：前半のゴールはなくなり、parts[0].end に残る（自動操縦が「前半の終わり」に使う。つなぎは、そこから始める）。後半のゴールが、ステージのゴール。
   セーブ地点：前半・後半の hint の前に、その部分の名前をつける。parts[k].cp は、その部分のはじめのセーブ地点の番号（ページの「後半から」は parts[2].cp から始める）。
   目標（objective）：parts[k].objective。ページは、最後にふれたセーブ地点の部分の目標を出す（つなぎに目標がなければ、出さない）。
   parts[k].base は、その部分の番号に足した数、parts[k].off は、ずらした座標（tools/test-adventure.mjs の view が、部分ごとの自動操縦に使う） */
const LISTS = ['boxes', 'plates', 'movers', 'crates', 'handles', 'winds', 'cps', 'warps', 'deco', 'ropes', 'cranes'];

// ステージ s を off だけずらし、番号に base を足した写しを作る（tag は、てんびん・シーソーの組の名前の前につける）
function move(s, [dx, dz], base, tag) {
  const at = o => ({ ...o, ...('x' in o && { x: o.x + dx }), ...('x0' in o && { x0: o.x0 + dx, x1: o.x1 + dx }), ...('z' in o && { z: o.z + dz }), ...('z0' in o && { z0: o.z0 + dz, z1: o.z1 + dz }) });
  const on = c => c.on ? { ...c, on: c.on.map(i => i + base.plates) } : c;
  const d = axis => axis === 'x' ? dx : dz;
  const rail = r => ({ ...r, min: r.min + d(r.axis), max: r.max + d(r.axis) });
  return {
    boxes: s.boxes.map(b => b.launch ? { ...at(b), launch: { ...b.launch, aims: b.launch.aims.map(on) } } : at(b)),
    plates: s.plates.map(p => p.kind === 'rail' ? { ...p, crate: p.crate + base.crates } : at(p)),
    movers: s.movers.map(m => ({ ...on(m), b: at(m.b), ...(m.handles && { handles: m.handles.map(h => h + base.handles) }), ...(m.pair != null && { pair: tag + m.pair }) })),
    crates: s.crates.map(c => ({ ...at(c), ...(c.rail && { rail: rail(c.rail) }),
      ...(c.fork && { fork: { ...on(c.fork), at: c.fork.at + d(c.rail.axis), to: c.fork.to + d(c.rail.axis === 'x' ? 'z' : 'x') } }) })),
    handles: (s.handles || []).map(h => ({ ...at(h), ...(h.ride != null && { ride: h.ride + base.movers }) })),
    winds: (s.winds || []).map(k => on(at(k))),
    cps: s.cps.map(at),
    warps: (s.warps || []).map(k => ({ ...at(k), to: [k.to[0] + dx, k.to[1], k.to[2] + dz] })),
    ropes: (s.ropes || []).map(at),                                                 // ジップラインの to は、はじめの点からの向きなので、ずらさない
    cranes: (s.cranes || []).map(k => Object.fromEntries(['x', 'z', 'y'].map(a => { const v = k[a], e = a === 'y' ? 0 : d(a); return [a, Array.isArray(v) ? [v[0] + base.crates, v[1] + e, v[2] + e] : v + e]; }))),   // クレーン：レバーの番号と、x・z の場所
    deco: (s.deco || []).map(o => o.beacon ? { ...o, beacon: [o.beacon[0] + dx, o.beacon[1], o.beacon[2] + dz] } : at(o)),
    goal: s.goal && at(s.goal), objective: s.objective && on(s.objective),
  };
}

/* first・second は [ファイル名, 作り方]（例 ['s4', s4]。ファイル名で、自動操縦 tools/adventure-bots/s4.mjs が見つかる）。
   link(kit) は、つなぎの中身 { boxes, plates, movers, crates, cps, … }。cps の先頭が、つなぎの入口（前半のゴールのそば）のセーブ地点 */
export function join(kit, { name, sky, yaw, first: [id0, make0], second: [id2, make2], off, link }) {
  const a = make0(kit), b = make2(kit), l = { boxes: [], plates: [], movers: [], crates: [], ...link(kit) };
  if (a.kill !== b.kill) throw new Error(`${name}: 前半と後半の kill がちがう（${a.kill}・${b.kill}）`);
  if (!l.cps?.length) throw new Error(`${name}: つなぎに、入口のセーブ地点がない`);
  const st = { name, sky: sky || a.sky, kill: a.kill, yaw: yaw ?? a.yaw, parts: [] };
  for (const k of LISTS) st[k] = [];
  [[a, [0, 0], id0, a.name], [l, [0, 0], null, name], [b, off, id2, b.name]].forEach(([s, o, id, title], k) => {
    const base = Object.fromEntries(LISTS.map(key => [key, st[key].length])), part = move(s, o, base, k + ':');
    if (k !== 1) part.cps = part.cps.map(c => ({ ...c, hint: `${title}：${c.hint}` }));   // つなぎのセーブ地点の hint は、書いたとおり
    for (const key of LISTS) st[key].push(...part[key]);
    st.parts.push({ id, name: title, off: o, base, cp: base.cps, objective: part.objective, yaw: s.yaw, ...(k === 0 && { end: part.goal }) });
    if (k === 2) st.goal = part.goal;
  });
  st.objective = st.parts[0].objective;                                               // ページの目標は parts から選ぶ。これは、点検（lint）と古い読み手のため
  return st;
}

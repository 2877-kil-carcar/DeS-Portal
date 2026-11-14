// もふもふ冒険のステージの「作りまちがい」を、動かす前に点検する（自動操縦 tools/test-adventure.mjs より先に走らせる）。
// 見るもの：当たりのある箱は 200 個まで／条件・ハンドル・レールの端が指す番号があるか／巻き上げる床の up・down は 0 より大きいか／てんびんは A と B の 2 枚で 1 組か／
//           カタパルトを動かすおもさ板は、台から 2m 以上離れているか／止まっている動く床から、歩いて出られるか（出られないなら kill より下に止めてあるか）／
//           箱の置き場所に床があるか（レールの箱は、レールの中にあるか）／
//           錠が見るソケットの数だけ、でんちがあるか／セーブ地点の真上（3m 四方・高さ 14m）を箱や動く床が通らないか、2.5m 以内をのこぎりが通らないか、
//           ほかのセーブ地点と 6m 以上離れているか／乗ると動く床・てんびんの上下の速さは毎秒 1m までか／乗ると動く床の行き先から、その床なしで帰れるか
// 使い方：node tools/lint-adventure.mjs          … 全ステージ
//         node tools/lint-adventure.mjs 3 5      … ステージ 3 と 5 だけ
// 見つけたら「NG stage 番号「名前」: 内容」を出して、失敗（終了コード 1）で終わる
import fs from 'node:fs';
import path from 'node:path';
import { kit, makeWorld, makePlayer, STEP, BODY } from '../apps/gallery/adventure-world.js';

// 動く床がいることのある場所：道のり（回る床は 1 周）を 48 に刻んだ箱の列
const sweep = m => Array.from({ length: 49 }, (_, k) => {
  const f = k / 48, a = f * Math.PI * 2, r = m.orbit, s = m.b;
  const o = !r ? m.to.map(v => v * f) : m.plane === 'zy' ? [0, -r * Math.cos(a), r * Math.sin(a)] : [r * Math.cos(a), 0, r * Math.sin(a)];
  return { ...s, x0: s.x0 + o[0], x1: s.x1 + o[0], y0: s.y0 + o[1], y1: s.y1 + o[1], z0: s.z0 + o[2], z1: s.z1 + o[2] };
});
// 2 つの箱の、水平のすき間（重なっていれば 0）
const gap = (a, b) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1));

// ステージ 1 つを点検して、見つけたまちがいの文を返す（なければ空）
export function lint(stage) {
  const out = [], need = (ok, text) => { if (!ok) out.push(text); };
  const { boxes, plates, movers, crates, cps } = stage, handles = stage.handles || [], w = makeWorld(stage);
  need(w.list.length <= 200, `当たりのある箱が ${w.list.length} 個ある（200 個まで）`);

  // 足場 A から足場 B へ「行ける」：すき間 1.5m 以内で、上がる高さが 2.4m まで（トランポリンからは 5.2m まで。あみは何 m でも。下りるのは何 m でも）
  const walk = (A, B) => A.at.some(a => B.at.some(b => gap(a, b) <= 1.5 && (b.y1 - a.y1 <= (a.bounce ? 5.2 : 2.4) || b.climb)));

  // 番号：条件（動く床・風・カタパルトのねらい・objective）、ハンドル、レールの端
  const conds = [...movers.map((m, i) => [`動く床 ${i}`, m]), ...(stage.winds || []).map((k, i) => [`風 ${i}`, k]),
    ...boxes.flatMap((b, i) => (b.launch?.aims || []).map((a, j) => [`箱 ${i}（カタパルト）のねらい ${j}`, a])), ...(stage.objective ? [['objective', stage.objective]] : [])];
  for (const [name, c] of conds) {
    const sockets = {};                                                              // この錠が見ているソケットの数（入れる箱の種類ごと）
    for (const i of c.on || []) { need(plates[i], `${name} の条件が、ない信号 ${i} を指している`); const tag = plates[i]?.needs; if (tag) sockets[tag] = (sockets[tag] || 0) + 1; }
    for (const tag in sockets) { const have = crates.filter(k => k.tag === tag).length; need(have >= sockets[tag], `${name} の錠はソケットを ${sockets[tag]} 個見ているのに、入れる箱（${tag}）が ${have} 個しかない`); }
  }
  movers.forEach((m, i) => {
    if (m.mode === 'crank') need(m.handles?.length, `動く床 ${i}（crank）に、ハンドルがない`);
    if (m.mode === 'crank') need((m.up ?? 4) > 0 && (m.down ?? 8) > 0, `動く床 ${i}（crank）の up と down は、0 より大きくする（0 だと、位置が数でなくなる）`);
    if (m.mode === 'scale') need(['AB', 'BA'].includes(movers.filter(k => k.mode === 'scale' && k.pair === m.pair).map(k => k.side).join('')), `動く床 ${i}（scale）の組 ${m.pair} が、A と B の 2 枚で 1 組になっていない`);
    // 止まっている場所（かぎの橋を下に止めた所など）に落ちた箱や人が、歩いて出られるか。出られないなら、kill より下に止める（落ちたものが、元の場所へ戻る）
    if (m.to && !['always', 'crumble'].includes(m.mode)) need(m.b.y1 < stage.kill || boxes.some(b => walk({ at: [m.b] }, { at: [b], ...b })),
      `動く床 ${i} は、止まっている場所（上面 ${m.b.y1}）から歩いて出られる足場がなく、落とした箱や人が上に残る。上面を kill（${stage.kill}）より下にする`);
    for (const h of m.handles || []) need(handles[h], `動く床 ${i} が、ないハンドル ${h} を指している`);
    const speed = m.speed || { ride: 2.5, scale: 0.8 }[m.mode];                      // 乗ると動く床・てんびんは、人を乗せて上下する（速いと、足が床から離れる）
    if (m.mode === 'ride' || m.mode === 'scale') need(speed * Math.abs(m.to[1]) / Math.hypot(...m.to) <= 1 + 1e-9, `動く床 ${i}（${m.mode}）の上下の速さが、毎秒 1m をこえている`);
  });
  handles.forEach((h, i) => need(h.ride == null || movers[h.ride], `ハンドル ${i} が、ない動く床 ${h.ride} に付いている`));
  // おもさ板（と load: n の条件）は、下りてから 0.4 秒は押されたまま。台に近いと、1 人で板を走りぬけて飛べてしまう
  boxes.forEach((b, i) => (b.launch?.aims || []).forEach(a => (a.on || []).forEach(k => { const p = plates[k]; if (p?.w && (p.need || a.load)) need(gap(b, { x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2 }) >= 2, `箱 ${i}（カタパルト）と、それを動かす信号 ${k} が、2m より近い`); })));
  plates.forEach((p, i) => { if (p.kind === 'rail') need(crates[p.crate]?.rail && ['min', 'max'].includes(p.at), `信号 ${i}（レールの端）が、レールの箱でない箱 ${p.crate} か、'min'・'max' でない端を指している`); });

  // 箱：置き場所の真下に床があるか（なければ、落ちては戻るのをくり返す）。レールの箱は、レールの中にあるか（外にあると、二度と動かせない）
  w.crates.forEach((c, i) => {
    const g = w.groundBox(c.x, c.z, c.y, c.box), r = c.rail;
    need(g && Math.abs(g.y1 - c.y) < 0.05, `箱 ${i} (${c.x}, ${c.y}, ${c.z}) の真下に、床がない`);
    if (r) need(['x', 'z'].includes(r.axis) && c[r.axis] >= r.min && c[r.axis] <= r.max, `箱 ${i} が、自分のレール（${r.axis} の ${r.min}〜${r.max}）の外に置いてある`);
  });

  // セーブ地点：やり直しは真上 14m から落ちてくる。その通り道と着地点が、いつも空いているか
  const solid = [...boxes.map((b, i) => [b, `箱 ${i}`]), ...movers.flatMap((m, i) => sweep(m).map(b => [b, `動く床 ${i}`]))];
  cps.forEach((c, i) => {
    const column = ([b]) => b.x1 > c.x - 1.5 && b.x0 < c.x + 1.5 && b.z1 > c.z - 1.5 && b.z0 < c.z + 1.5 && b.y1 > c.y + STEP && b.y0 < c.y + 14 + BODY;
    const near = ([b]) => b.hurt && gap(b, { x0: c.x, x1: c.x, z0: c.z, z1: c.z }) < 2.5 && b.y1 > c.y && b.y0 < c.y + 14 + BODY;
    need(!solid.some(column), `セーブ地点 ${i} (${c.x}, ${c.y}, ${c.z}) の真上（3m 四方・高さ 14m）に、${solid.find(column)?.[1]} が入る`);
    need(!solid.some(near), `セーブ地点 ${i} (${c.x}, ${c.y}, ${c.z}) から 2.5m 以内に、のこぎり（${solid.find(near)?.[1]}）が来る`);
    cps.forEach((k, j) => need(j <= i || Math.hypot(k.x - c.x, k.y - c.y, k.z - c.z) >= 6, `セーブ地点 ${i} と ${j} が、6m より近い`));
  });

  /* 乗ると動く床（ride）は、空になると出発点へ帰る。だから行き先には、その床を使わない帰り道がいる。
     足場（箱・動く床）から足場へ「行ける」とみなすのは：すき間 1.5m 以内で、上がる高さが 2.4m まで（トランポリンからは 5.2m まで。あみは何 m でも。下りるのは何 m でも）／
     ほかの乗ると動く床は、出発点から行き先へだけ／大砲台・カタパルトは、実際に飛ばして着いた足場へ。錠や時間は見ない（開けられるものとして数える）
     shortcut: 風・ワープ・せんぷうき箱・箱の踏み台は帰り道に数えない。それを帰り道にするステージができたら、ここに足す */
  const nodes = [...boxes.map(b => ({ at: [b], b })), ...movers.flatMap((m, i) => m.mode === 'ride' ? [{ at: [m.b], b: m.b, m: i }, { at: [sweep(m)[48]], b: m.b, far: i }] : [{ at: sweep(m), b: m.b, m: i }])];
  const fly = (from, v) => {                                                         // 箱 from の上から速さ v で飛んだ先の足場
    const p = makePlayer(w);
    Object.assign(p, { x: (from.x0 + from.x1) / 2, y: from.y1 + 0.01, z: (from.z0 + from.z1) / 2, vy: v[1], kvx: v[0], kvz: v[2], grounded: false });
    for (let i = 0; i < 900 && !p.grounded && !p.events.length; i++) p.step(1 / 60, 0, 0);
    const g = p.grounded && w.groundBox(p.x, p.z, p.y);
    return g && (g.m ? nodes.find(n => n.m === w.movers.indexOf(g.m)) : nodes[boxes.indexOf(g)]);
  };
  for (const n of nodes) n.shots = [n.b.fling, ...(n.b.launch?.aims || []).map(a => a.v)].filter(Boolean).map(v => fly(n.at[0], v));
  movers.forEach((m, i) => {
    if (m.mode !== 'ride') return;
    const seen = new Set([nodes.find(n => n.far === i)]);                            // 行き先に着いた床から、たどれる足場を広げていく
    for (const A of seen) for (const B of nodes) if (B.far == null ? walk(A, B) || A.shots.includes(B) : A.m === B.far) seen.add(B);
    need([...seen].some(n => n.m === i), `乗ると動く床 ${i} の行き先から、その床を使わずに出発点へ帰る道がない`);
  });
  return out;
}

// ここから下は、このファイルを直接動かしたときだけ（tools/test-adventure-mechanics.mjs は lint だけを借りる）
const dir = new URL('../apps/gallery/adventure-stages/', import.meta.url);
const all = fs.readdirSync(dir).map(f => /^s(\d+)\.js$/.exec(f)).filter(Boolean).map(m => +m[1]).sort((a, b) => a - b);
const only = process.argv.slice(2).map(Number).filter(n => n > 0);
for (const n of path.basename(process.argv[1] || '') !== 'lint-adventure.mjs' ? [] : only.length ? only : all) {
  const stage = (await import(new URL(`s${n}.js`, dir).href)).default(kit), found = lint(stage);
  for (const text of found) console.log(`NG stage ${n} 「${stage.name}」: ${text}`);
  if (found.length) process.exitCode = 1; else console.log(`PASS stage ${n} 「${stage.name}」 has no authoring mistakes`);
}

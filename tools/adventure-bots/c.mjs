// つないだステージ C「てんびん貨物線」のつなぎ（石切り場の駅）を 1 人で解く手順。前半（s4.mjs）が塔のてっぺんで終わったところから始める：
// 塔の大砲で駅へ → 重い石を赤い皿へ → 木箱を青い皿へ（赤い皿が井戸へ沈み、底の板でポイントが切りかわる）→ 貨車を東へ、分かれ目で止まる → 北へ押して橋 → 操車場へ。
// 番号はつなぎの中だけで数え、座標はステージ全体のもの（tools/test-adventure.mjs の view がそろえる）。fresh() は、つなぎの入口（塔のてっぺんのセーブ地点）から始める。
// そのあと fresh() で：順番が逆でも井戸から出られる・仲間が青い皿に乗る答え・できてはいけないこと
export default (b, { assert, fresh }) => {
  const BLUE = 0, RED = 1, BRIDGE = 2, SIGNAL = 3;                                    // 動く床の番号
  const CART = 0, STONE = 1, BOX = 2;                                                 // 箱の番号
  const WELL = 0;                                                                     // 信号の番号：井戸の底の板
  const near = (a, v, e = 0.05) => Math.abs(a - v) < e;
  const idle = (q, s) => { for (let i = 0; i < s * q.FPS; i++) q.tick(); };
  const move = (q, i, x, y, z) => { Object.assign(q.w.crates[i], { x, y, z, vy: 0, moved: true }); q.w.fit(q.w.crates[i]); };   // 検査のために、箱をその場所へ置く
  const hop = (q, from, to) => { q.go(from); q.face(...to); q.p.jump(); q.go(to); };

  // 塔のてっぺんの大砲で、北の駅へ（つなぎの入口のセーブ地点にふれてから）
  const fly = q => {
    q.go([0, 23]); q.go([0, 26], () => !q.p.grounded && q.p.vy > 3); q.wait('駅に着地', () => q.p.grounded, 8);
    assert.ok(near(q.p.y, 0) && Math.abs(q.p.x) < 2.5 && q.p.z > 38.5 && q.p.z < 43.5 && q.falls === 0, `大砲で、駅のまん中に着いていない ${q.where()}`);
  };
  // 重い石を東から押して、赤い皿の止めまで（皿の上で止まる）
  const stone = q => {
    q.go([9.5, 44.5]); q.push(STONE, [11.5, 41.5], -1, 0);                           // 止めの北をまわって、石の東へ
    assert.ok(q.w.crates[STONE].on === q.w.movers[RED].box, `重い石が赤い皿にのらない ${JSON.stringify([q.w.crates[STONE].x, q.w.crates[STONE].z])}`);
  };
  // 木箱を青い皿へ
  const box = q => { q.grab(BOX); q.go([0, 41.5]); q.put(2.3, 41.5);   // 皿の西のはしに置く（自分は皿に乗らない）
    q.wait('木箱が青い皿にのる', () => q.w.crates[BOX].on === q.w.movers[BLUE].box, 3); };
  const sunk = q => q.wait('赤い皿が井戸へ沈み、底の板が押される', () => q.w.movers[RED].f === 1 && q.w.plates[WELL].down && q.w.movers[SIGNAL].f === 1, 8);
  // 貨車を東へ押すと分かれ目で止まる。北の行き止まりまで押すと、橋があがる。敷居を跳んで、橋を渡って操車場へ
  const train = q => {
    const c = q.w.crates[CART];
    q.go([c.x - 1.2, 47.5]); q.push(CART, [c.x - 1.2, 46], 1, 0);
    assert.ok(c.rail === c.side && near(c.x, 3, 1e-6), `貨車が、分かれ目で支線に乗りかわらない (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`);
    q.go([1.5, 44.5]); q.push(CART, [3, 44.6], 0, 1);
    assert.ok(near(c.z, 49.5, 0.1), `貨車が北の行き止まりまで行かない (z=${c.z.toFixed(2)})`);
    q.wait('操車場への橋があがる', () => q.w.movers[BRIDGE].f === 1, 4);
  };
  const cross = q => {
    hop(q, [-3, 50.9], [-3, 53]); q.go([-3, 66.5]); q.go([0, 69]);
    assert.ok(near(q.p.y, 0) && q.p.z > 66 && q.falls === 0, `橋を渡って、操車場に着いていない ${q.where()}`);
  };

  // ── 1 人の基本の道 ──
  fly(b); idle(b, 1);
  assert.ok(b.w.movers[BRIDGE].f === 0 && !b.w.plates[WELL].down, 'はじめから橋があがっているか、井戸の底の板が押されている');
  stone(b); idle(b, 1);
  assert.ok(b.w.movers[RED].f === 0, '青い皿が空なのに、赤い皿が沈んだ');
  box(b); sunk(b); train(b); cross(b);

  { // ── 順番が逆（先に木箱）：石を押した自分も、赤い皿と一緒に井戸へ沈む。跳んでつかんで出られ、底の板は押されたまま ──
    const q = fresh(); fly(q); box(q); idle(q, 1);
    assert.equal(q.w.movers[BLUE].f, 0, '赤い皿が空なのに、青い皿が上がった');
    stone(q); sunk(q);
    assert.ok(q.p.y < -1, `検査の前提：自分が井戸の中にいない ${q.where()}`);
    q.hoist([7.6, 41.5], [9.5, 41.5]); idle(q, 1);
    assert.ok(near(q.p.y, 0) && q.w.plates[WELL].down && q.falls === 0, `井戸から出られない／出たら底の板がはなれた ${q.where()}`);
    q.go([9.5, 45]); train(q); cross(q);                                             // 沈んだ井戸の北をまわって、貨車へ
  }

  { // ── 仲間がいれば：仲間が青い皿に乗れば、木箱はいらない（てんびんは使う） ──
    const q = fresh(); fly(q); stone(q); q.go([9.5, 44]);
    q.friend = [3, 0.05, 41.5, 1]; sunk(q);
    train(q); q.friend = null;
  }

  { // ── できてはいけないこと ──
    // てんびんを使わないと、ポイントは本線のまま：貨車は分かれ目を通りすぎ、橋はあがらない
    let q = fresh(); fly(q); const c = q.w.crates[CART];
    q.go([c.x - 1.2, 47.5]); q.push(CART, [c.x - 1.2, 46], 1, 0);
    assert.ok(c.rail === c.main && c.x > 8.9 && q.w.movers[BRIDGE].f === 0, `ポイントが本線なのに、貨車が分かれ目で止まった (x=${c.x.toFixed(2)})`);
    // 赤い皿（井戸のふた）に何人のっても、青い皿が空なら沈まず、底の板には届かない
    q.go([7, 41.5]); q.friend = [7, 0.05, 42, 3]; idle(q, 2);
    assert.ok(q.w.movers[RED].f === 0 && !q.w.plates[WELL].down, '青い皿が空なのに、赤い皿が沈んだ／底の板が押された');
    q.friend = null;
    // 重い石は、橋の手前の敷居で止まる（操車場へ持ちこめない）。敷居のはしを押しても、橋にはのらない
    q = fresh(); fly(q); move(q, CART, 3, 0, 49.5); q.wait('橋があがる', () => q.w.movers[BRIDGE].f === 1, 4);
    for (const x of [-3, -0.4, -5.6]) {
      move(q, STONE, x, 0, 49.5); q.place(x, 0, 47.5); idle(q, 0.3); q.push(STONE, [x, 48.3], 0, 1);
      const s = q.w.crates[STONE];
      assert.ok(s.z < 51.6 - 0.69 || (s.y < -1 && s.z < 52), `重い石が、敷居をこえて橋へ出た (x ${x} → ${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)})`);
      q.wait('石が駅へ戻る／止まる', () => near(s.y, 0), 6);
    }
    // 4 人でも：駅の北の縁に重い石、その上に木箱と仲間 2 人を積み、てっぺんから操車場へ投げても（ページの投げ方：0.9m 上・0.75m 前、vy 6.5・横 4）、届かない（14m）
    for (const [x, sz] of [[5, 51.2], [9, 51.2], [-8, 51.2]]) {
      q = fresh(); const top = 1.4 + 0.8 + 2.6;
      q.place(x, top + 0.9, sz + 0.75 + 0.7); q.face(x, 80); Object.assign(q.p, { vy: 6.5, kvz: 4, grounded: false }); q.p.grabStart();
      let land = false;
      for (let i = 0; i < 8 * q.FPS && q.falls === 0 && !land; i++) { q.tick(0, 1); land = q.p.z > 65.5 && (q.p.grounded || !!q.p.hang); }
      assert.ok(!land && q.falls === 1, `積んだてっぺんから投げられた仲間が、操車場へ渡れた (x ${x}) ${q.where()}`);
    }
    // 4 人でも：石切り場のデッキの北の縁（高さ 5）に重い箱と仲間 2 人を積み、てっぺんから駅へ投げても、届かない（16m 先・5m 下）
    for (const x of [-6.5, 4, 6.5]) {
      q = fresh(); q.place(x, 5 + 1.4 + 2.6 + 0.9, 21 + 0.7 + 0.75); q.face(x, 50); Object.assign(q.p, { vy: 6.5, kvz: 4, grounded: false }); q.p.grabStart();
      let land = false;
      for (let i = 0; i < 8 * q.FPS && !land; i++) { q.tick(0, 1); land = q.p.z > 36.5 && (q.p.grounded || !!q.p.hang) && q.p.y > -1; if (q.p.y < -11) break; }
      assert.ok(!land, `デッキから投げられた仲間が、駅に届いた (x ${x}) ${q.where()}`);
    }
  }
};

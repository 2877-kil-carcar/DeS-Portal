// つないだステージ D「ほしみ屋敷」のつなぎ（屋敷の裏の物置場）を 1 人で解く手順。前半（s7.mjs）が裏庭のゴールだった所で終わったところから始める：
// 物置場のたんすを西へ、物置の戸の前まで押す → 南へ押して戸の板を割る → 中のでんちを、橋のたもとのソケットへ（天文台への橋があがる）→ 敷居を跳んで、橋を渡って天文台の広場へ。
// 番号はつなぎの中だけで数え、座標はステージ全体のもの（tools/test-adventure.mjs の view がそろえる）。fresh() は、つなぎの入口（裏庭のセーブ地点）から始める。
// そのあと fresh() で：戸口にたんすが残っても入れる・落としたでんちが戻る・できてはいけないこと（4 人で積んで投げることも）
export default (b, { assert, fresh }) => {
  const BRIDGE = 0;                                                                   // 動く床の番号
  const CHEST = 0, CELL = 1;                                                          // 箱の番号
  const SOCKET = 0;                                                                   // 信号の番号
  const near = (a, v, e = 0.05) => Math.abs(a - v) < e;
  const idle = (q, s) => { for (let i = 0; i < s * q.FPS; i++) q.tick(); };
  const move = (q, i, x, y, z) => { Object.assign(q.w.crates[i], { x, y, z, vy: 0, moved: true }); q.w.fit(q.w.crates[i]); };   // 検査のために、箱をその場所へ置く
  const broken = q => q.w.broken.has(q.w.stage.boxes.findIndex(k => k.planks));
  const hop = (q, from, to) => { q.go(from); q.face(...to); q.p.jump(); q.go(to); };
  // 重い箱 i を from からつかみ、until が合うまで (dx, dz) の向きへ押す（引く）
  const drag = (q, i, from, dx, dz, until) => {
    q.grab(i, from);
    for (let n = 0; !until(q.w.crates[i]); n++) { assert.ok(n < q.FPS * 20, `箱 ${i} を思った所まで動かせない ${q.where()}`); q.tick(dx, dz); }
    q.p.grabEnd();
  };

  // たんすを西へ、物置の戸の前まで押す
  const west = q => { q.go([-21, 5]); drag(q, CHEST, [-30.8, 7], -1, 0, k => k.x <= -41); };
  // 北から南へ押して、戸の板を割る。たんすは物置の奥の壁まで行く
  const smash = q => {
    const c = q.w.crates[CHEST];
    q.go([c.x + 1.2, 8.2]); assert.ok(!broken(q), 'たんすが戸にふれる前に、板が割れた');
    q.push(CHEST, [c.x, 8.2], 0, -1);
    assert.ok(broken(q) && c.z < 0, `たんすを押しつけても、物置の戸の板が割れない (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`);
  };
  // でんちを橋のたもとのソケットへ。橋があがる
  const plug = q => {
    q.go([-41, 5]); q.go([-41, 2.5]); q.grab(CELL); q.go([-41, 5]); q.put(-40, 10);   // 戸口を通って入り、出る
    q.wait('ソケットにでんちが入る', () => q.w.plates[SOCKET].down, 3);
    q.wait('天文台への橋があがる', () => q.w.movers[BRIDGE].f === 1, 4);
  };
  // 敷居を跳んで、橋を渡って天文台の広場へ（後半のはじめのセーブ地点のそば）
  const cross = q => {
    hop(q, [-44.1, 6.5], [-46.5, 6.5]); q.go([-86, 6.5]); q.go([-96, -6]);
    assert.ok(near(q.p.y, 0) && q.falls === 0, `橋を渡って、天文台の広場に着いていない ${q.where()}`);
  };

  // ── 1 人の基本の道 ──
  b.go([-21, 5]); assert.equal(b.p.cp, 0, 'つなぎの入口のセーブ地点にふれていない');
  idle(b, 1); assert.ok(b.w.movers[BRIDGE].f === 0 && !b.w.plates[SOCKET].down && !broken(b), 'はじめから橋があがっているか、ソケットが押されているか、戸の板が割れている');
  west(b); smash(b); plug(b); cross(b);

  { // ── 戸口のすぐ前でたんすを止めても、引きもどせば物置に入れる。物置場の外へ落としたでんちは、物置の中へ戻る ──
    const q = fresh(), c = q.w.crates[CHEST];
    west(q); q.go([c.x + 1.2, 8.2]); drag(q, CHEST, [c.x, 8.2], 0, -1, () => broken(q));
    drag(q, CHEST, [c.x, c.z + 1.2], 0, 1, k => k.z >= 7);
    q.go([-41, 5]); q.go([-41, 2.5]); q.grab(CELL); q.go([-41, 5]); q.go([-44.6, 11]); q.face(-50, 11); q.p.grabEnd();
    q.wait('落としたでんちが、物置の中へ戻る', () => near(q.w.crates[CELL].x, -43.4) && near(q.w.crates[CELL].y, 0) && near(q.w.crates[CELL].z, 1.5), 6);
    plug(q); cross(q);
  }

  { // ── できてはいけないこと ──
    // 橋がなければ、天文台へは渡れない（落ちる）
    let q = fresh();
    assert.throws(() => q.go([-50, 10], null, 15), /着けない/, '橋なしで、天文台へ渡れた');
    assert.ok(q.falls > 0, '橋なしで西の縁から出ても、落ちない');
    // ソケットには、でんちのほかは効かない：仲間 3 人がのっても、橋はあがらない
    q = fresh(); q.go([-38, 8]); q.friend = [-40, 0, 10, 3]; idle(q, 2);
    assert.ok(q.w.movers[BRIDGE].f === 0, '仲間がソケットにのって、橋があがった');
    q.friend = null;
    // 戸の板を割るまで、物置には入れない。でんちを戸に押しつけても、仲間が戸の前にいても、板は割れない
    assert.throws(() => q.go([-41, 1], null, 4), /着けない/, '戸の板を通りぬけた');
    move(q, CELL, -41, 0, 4.75); q.friend = [-40, 0, 4.7, 3]; idle(q, 1);
    move(q, CELL, -41, 4, 4.75); idle(q, 2);
    assert.ok(!broken(q), 'でんちか仲間で、物置の戸の板が割れた');
    q.friend = null;
    // たんすは、橋の手前の敷居で止まり、天文台へ持ちこめない。敷居の外で押し出したたんすは、橋の横を落ちて、物置場へ戻る
    q = fresh(); move(q, CELL, -40, 0, 10); q.wait('橋があがる', () => q.w.movers[BRIDGE].f === 1, 4);
    for (const z of [5.2, 6.5, 7.8]) {
      move(q, CHEST, -42.5, 0, z); q.place(-41.3, 0, z); idle(q, 0.3); q.push(CHEST, [-41.3, z], -1, 0);
      const c = q.w.crates[CHEST];
      assert.ok(c.x > -44.6 + 0.69 && near(c.y, 0), `たんすが、敷居をこえて橋へ出た (z ${z} → ${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)})`);
    }
    move(q, CHEST, -42.5, 0, 9.6); q.place(-41.3, 0, 9.6); idle(q, 0.3); drag(q, CHEST, [-41.3, 9.6], -1, 0, k => k.y < -0.5);
    q.wait('落としたたんすが、物置場へ戻る', () => near(q.w.crates[CHEST].x, -32) && near(q.w.crates[CHEST].y, 0) && near(q.w.crates[CHEST].z, 7), 6);
    assert.equal(q.falls, 0, `たんすを押し出したときに、自分も落ちた ${q.where()}`);
    // 4 人でも：物置場の西の縁に、たんす・でんち・仲間 2 人を積み（敷居の上でも）、てっぺんから天文台へ投げても（ページの投げ方：0.9m 上・0.75m 前、vy 6.5・横 4）、届かない（18m 以上）
    for (const z of [6.5, 10, 11.5]) {
      q = fresh(); const top = 0.5 + 1.4 + 0.8 + 2.6;
      q.place(-44.3 - 0.75, top + 0.9, z); q.face(-100, z); Object.assign(q.p, { vy: 6.5, kvx: -4, grounded: false }); q.p.grabStart();
      let land = false;
      for (let i = 0; i < 8 * q.FPS && !land; i++) { q.tick(-1, 0); land = q.p.x < -58 && (q.p.grounded || !!q.p.hang) && q.p.y > -6; if (q.p.y < -11) break; }
      assert.ok(!land, `積んだてっぺんから投げられた仲間が、天文台に届いた (z ${z}) ${q.where()}`);
    }
  }
};

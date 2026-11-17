// つないだステージ F「はとば大工事」のつなぎ（船だまりの水門）を 1 人で解く手順。前半（s11.mjs）が桟橋のゴールだった所で終わったところから始める：
// 上げ下げのレバーを奥へ（フックが水たまりの上で下りて開く）→ ハンドルで水を上げる（木箱が浮いてくる）→ レバーを戻す（閉じて吊る）→ 前後のレバーを奥へ（戸口の板が割れる）
// → 敷居を跳んで、通路から灯台の岸壁へ。番号はつなぎの中だけで数え、座標はステージ全体のもの（tools/test-adventure.mjs の view がそろえる）。fresh() は、つなぎの入口から始める。
// そのあと fresh() で：順番を変えた道（水を先に上げる）・やり直せること（どこから押しこんだ木箱も吊れる）・できてはいけないこと（手で木箱を引き上げる・水が低いときに吊る・敷居の先へ木箱を押す・4 人で積んで壁を越える）
export default (b, { assert, fresh }) => {
  const POOL = 0;                                                                     // 動く床の番号
  const LZ = 0, LY = 1, CARGO = 2;                                                    // 箱の番号
  const near = (a, v, e = 0.05) => Math.abs(a - v) < e;
  const idle = (q, s) => { for (let i = 0; i < s * q.FPS; i++) q.tick(); };
  const move = (q, i, x, y, z) => { Object.assign(q.w.crates[i], { x, y, z, vy: 0, moved: true }); q.w.fit(q.w.crates[i]); };   // 検査のために、箱をその場所へ置く
  const broken = q => q.w.broken.has(q.w.stage.boxes.findIndex(k => k.planks));
  const hook = q => q.w.cranes[0];
  const hop = (q, from, to) => { q.go(from); q.face(...to); q.p.jump(); q.go(to); };
  // レバー i を端まで押す（dir 1 で東＝max、-1 で西＝min）。レバーの西（x -1.9）か東（x 1.4）の通路を通る
  const lever = (q, i, dir) => {
    const z = q.w.crates[i].z, lane = dir > 0 ? -1.9 : 1.4;
    const side = Math.abs(q.p.x + 1.9) < Math.abs(q.p.x - 1.4) ? -1.9 : 1.4;          // いまいる側の通路へ出てから回りこむ（z 42 は、2 本のレバーの間の通り道）
    q.go([side, q.p.z]); q.go([side, 42]); q.go([lane, 42]); q.go([lane, z]); q.push(i, [lane, z], dir, 0);
    const c = q.w.crates[i], r = c.rail;
    assert.ok(near(c.x, dir > 0 ? r.max : r.min, 0.1), `レバー ${i} が端まで行かない (x=${c.x.toFixed(2)})`);
  };
  const raise = q => { const pool = q.w.movers[POOL]; q.go([-2.5, 38.5]); q.crank(0, () => pool.f === 1); };
  const top = q => q.w.crates[CARGO].y + 1.4;
  // 浮いた木箱を吊って、戸口の板へ。敷居を跳んで、通路から灯台の岸壁（後半のはじめのセーブ地点のそば）へ
  const lift = q => {
    const k = hook(q), c = q.w.crates[CARGO];
    lever(q, LY, -1); assert.ok(c.hook != null, `浮いてきた木箱を吊らない (上面 ${top(q).toFixed(2)}、フックの底 ${k.y.toFixed(2)})`);
    q.wait('木箱が上がる', () => near(k.y, 3), 3);
    lever(q, LZ, 1); q.wait('吊った木箱が、戸口の板を割る', () => broken(q), 6);
  };
  const cross = q => {
    q.go([-3, 46]); q.go([-7, 46.5]); hop(q, [-7, 48.6], [-7, 50.5]); q.go([-7, 61]); q.go([-7, 65]);
    assert.ok(near(q.p.y, 0) && q.falls === 0, `通路を通って、灯台の岸壁に着いていない ${q.where()}`);
  };

  // ── 1 人の基本の道：フックを下ろして開く → 水を上げる → 閉じて吊る → 戸口へ ──
  b.go([0, 33]); assert.equal(b.p.cp, 0, 'つなぎの入口のセーブ地点にふれていない');
  idle(b, 1); assert.ok(!broken(b) && b.w.movers[POOL].f === 0 && near(top(b), -5.3, 0.02), 'はじめから板が割れているか、水が上がっている');
  lever(b, LY, 1); b.wait('フックが水たまりの上で下りて開く', () => hook(b).open, 6);
  raise(b); b.wait('木箱が浮いてくる', () => near(top(b), -1.3, 0.02), 3);
  lift(b); cross(b);

  { // ── 水を先に上げてから、フックを下ろして開き、閉じても吊れる ──
    const q = fresh();
    raise(q); lever(q, LY, 1); q.wait('フックが下りて開く', () => hook(q).open, 6);
    lift(q); cross(q);
  }

  { // ── やり直せること ──
    // 水が引くと、吊らなかった木箱は下へ戻る。もう一度上げれば、また浮いてくる。岸から落ちた木箱は、杭の上へ戻る
    const q = fresh(), pool = q.w.movers[POOL], c = q.w.crates[CARGO];
    raise(q); q.wait('水が引ききる', () => pool.f === 0, 45);
    assert.ok(near(top(q), -5.3, 0.02), `水が引いても、木箱が下りない (上面 ${top(q).toFixed(2)})`);
    move(q, CARGO, 6, 0, 36); q.place(4.5, 0, 36); q.push(CARGO, [4.5, 36], 1, 0);
    q.wait('岸から落とした木箱が、水たまりへ戻る', () => near(c.x, -7) && near(c.z, 40) && near(top(q), -5.3, 0.02), 8);
    assert.equal(q.falls, 0);
  }

  { // ── 岸に落ちた木箱を、水たまりの西・東・南・北のどこから押しこんでも、浮いてきたところをフックで吊れる（吊れない所に浮いたままにならない） ──
    const leverTo = (q, i, f) => { const c = q.w.crates[i], r = c.rail; c.x = r.min + f * (r.max - r.min); q.w.fit(c); };   // レバーをその割合の所へ（はじめと終わりの 5% はきかない）
    for (const [x, z, fx, fz, dx, dz] of [[-9.1, 41, -10.4, 41, 1, 0], [-4.9, 43, -3.6, 43, -1, 0], [-7.6, 38.3, -7.6, 37, 0, 1], [-6.4, 44.9, -6.4, 46.2, 0, -1]]) {
      const q = fresh(), c = q.w.crates[CARGO], k = hook(q);
      move(q, CARGO, x, 0, z); q.place(fx, 0, fz); idle(q, 0.3); q.push(CARGO, [fx, fz], dx, dz); q.p.grabEnd();
      q.wait('押した木箱が、水たまりへ落ちる', () => top(q) < -4, 6);
      const hz = Math.min(47.6, Math.max(40, c.z));
      leverTo(q, LZ, 0.05 + 0.9 * (hz - 40) / 7.6); leverTo(q, LY, 1);
      q.wait('フックが木箱の上で下りて開く', () => k.open && near(k.z, hz), 8);
      q.place(-2.5, 0, 38.5); raise(q); q.wait('木箱が浮いてくる', () => near(top(q), -1.3, 0.02), 3);
      leverTo(q, LY, 0); q.tick();
      assert.ok(c.hook != null, `${dx ? (dx > 0 ? '西' : '東') : (dz > 0 ? '南' : '北')}から押しこんだ木箱を、フックで吊れない (木箱 ${c.x.toFixed(2)}, ${c.z.toFixed(2)}、フック ${k.x.toFixed(2)}, ${k.z.toFixed(2)})`);
    }
  }

  { // ── できてはいけないこと ──
    // 水を上げても、浮いた木箱（上面 -1.3）は、岸からつかめない（引き上げられない）
    let q = fresh(); raise(q); q.wait('木箱が浮いてくる', () => near(top(q), -1.3, 0.02), 3);
    q.go([-5.6, 40]); q.face(-7, 40); const got = q.p.grabStart(); q.p.grabEnd();
    assert.ok(got !== q.w.crates[CARGO], '浮いた木箱を、岸から手でつかめた');
    // 水が低いうちに、フックを下ろして閉じても、木箱は吊れない
    q = fresh(); lever(q, LY, 1); q.wait('フックが下りて開く', () => hook(q).open, 6); lever(q, LY, -1); idle(q, 0.5);
    assert.ok(q.w.crates[CARGO].hook == null, '水が低いのに、木箱を吊った');
    // 戸口の板は、人や、ほかの箱がふれても割れない。板があるうちは、通路へ行けない
    q.friend = [-7, 0, 47.2, 3]; idle(q, 1); q.friend = null;
    assert.ok(!broken(q), '仲間がふれて、戸口の板が割れた');
    assert.throws(() => { q.go([-3, 46]); q.go([-7, 50], null, 6); }, /着けない/, '戸口の板を通りぬけた');
    // 木箱は敷居で止まり、通路（灯台）へは持ちこめない
    q = fresh(); move(q, CARGO, -7, 0, 50.9); q.place(-7, 0, 52); idle(q, 0.3);
    for (const x of [-8.2, -7, -5.8]) {
      move(q, CARGO, x, 0, 47); q.place(x, 0, 45.8); idle(q, 0.3); q.push(CARGO, [x, 45.8], 0, 1);
      const c = q.w.crates[CARGO];
      assert.ok(c.z < 49 - 0.69 && near(c.y, 0), `木箱が、敷居をこえて通路へ出た (x ${x} → ${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)})`);
    }
    // 北の壁は東西に 14m ずつはみ出していて、回りこめない
    const s = q.w.stage, wall = s.boxes.filter(k => k.y1 === 14 && k.z0 > 47 && k.z1 < 49);
    assert.ok(Math.min(...wall.map(k => k.x0)) <= -12 - 14 && Math.max(...wall.map(k => k.x1)) >= 12 + 14, '北の壁が、船だまりの東西の端から 14m はみ出していない');
    // 4 人でも：壁ぎわに木箱（水から出せたとしても 1.4m）と仲間 3 人を積み、てっぺんから跳んでつかんでも、壁（14m）には届かない
    q = fresh(); move(q, CARGO, 0, 0, 46.9); idle(q, 0.2);
    q.w.extra = [0, 1, 2].map(k => ({ x0: -0.25, x1: 0.25, z0: 46.65, z1: 47.15, y0: 1.4 + 1.3 * k, y1: 2.7 + 1.3 * k, friend: true }));
    q.place(0, 5.3, 46.9); idle(q, 0.2); assert.ok(near(q.p.y, 5.3), `検査の前提：積んだてっぺんに立っていない ${q.where()}`);
    q.face(0, 50); q.p.jump(); q.p.grabStart(); let hi = 0;
    for (let i = 0; i < 3 * q.FPS; i++) { q.tick(0, 1); hi = Math.max(hi, q.p.y); }
    q.p.grabEnd(); assert.ok(hi < 11.5, `積み上げたてっぺんから、北の壁の上に届いてしまう (いちばん上 ${hi.toFixed(2)})`);
    // 船だまりと、灯台の岸壁（後半）の間は 14m（通路のほかは空）
    const yard = s.boxes[1], shore = s.boxes[s.parts[2].base.boxes - s.parts[1].base.boxes + 1];   // 後半の 1 番の箱が岸壁（view は、つなぎの番号で数える）
    assert.ok(shore.z0 - yard.z1 >= 14, `船だまりと灯台の岸壁が、14m より近い (${(shore.z0 - yard.z1).toFixed(2)})`);
  }
};

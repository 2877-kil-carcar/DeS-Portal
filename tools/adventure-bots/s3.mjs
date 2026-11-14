// ステージ 3「かざぐるま市場」を 1 人で解く手順：箱 2 つをおもさ板へ → リフトでせんぷうき箱を北の屋根へ → 出窓の箱を持って風で西の塔へ → 箱を持ってゴールのリフト
// 箱 0（広場）・1（東の小島）・2（出窓）、3 はせんぷうき箱。動く床 0〜3 くずれる床、4 A と B の間のリフト、5 ゴールのリフト
export default (b, { assert, fresh }) => {
  const near = (a, v) => Math.abs(a - v) < 0.01, idle = (q, s, mx = 0, mz = 0) => { for (let i = 0; i < s * q.FPS; i++) q.tick(mx, mz); };
  const land = (q, mx, mz) => { q.tick(mx, mz); for (let i = 0; !q.p.grounded; i++) { assert.ok(i < 3 * q.FPS, `着地しない ${q.where()}`); q.tick(mx, mz); } };   // 跳んだあと、着地するまで倒しつづける
  const set = (q, i, x, y, z) => { const c = q.w.crates[i]; Object.assign(c, { x, y, z, vy: 0, moved: true }); q.w.fit(c); };   // 検査のために箱を置く
  const toA = q => { q.go([4.6, 0]); q.go([10, 0]); assert.ok(near(q.p.y, 3.5), `トランポリンで東の屋根に乗れていない ${q.where()}`); };
  const liftToB = q => { q.go([8.8, 9.5]); q.board(4); q.go(() => q.center(4)); q.ride(4, 1); q.go([3, 9.5]); assert.ok(near(q.p.y, 5), `リフトから北の屋根へ移れない ${q.where()}`); };
  const perch = q => { q.go([-3, 14]); q.go([1.8, 14]); assert.ok(near(q.p.y, 8), `トランポリンで出窓に乗れていない ${q.where()}`); q.grab(2); q.go([3, 11]); };
  const fanToC = q => {
    const f = q.w.crates[3], c = q.p.carry;
    q.go([f.x + 1.1, f.z]); q.face(f.x, f.z); q.p.jump(); q.go([f.x, f.z], () => q.p.y > 8.7); q.go([-12, 12]);
    assert.ok(near(q.p.y, 8.2) && q.p.carry === c, `風で西の塔に乗れていない ${q.where()}`);
  };
  const fanByA = q => {                                                      // せんぷうき箱を東の屋根の壁ぎわに置き、広場の箱を持って風で東の屋根へ（トランポリンは通らない）
    q.grab(3); q.go([4.6, 3]); q.put(7.3, 4); q.wait('風が出る', () => q.w.winds[0].active, 3);
    q.grab(0); q.go([4.6, 3]); q.go([6.2, 4]); q.face(7.3, 4); q.p.jump(); q.go([7.3, 4], () => q.p.y > 3.9); q.go([10, 4]);
    assert.ok(near(q.p.y, 3.5) && q.p.carry === q.w.crates[0], `風で、箱を持って東の屋根に乗れない ${q.where()}`);
  };
  const goalRide = q => { q.go([-9.6, -4]); q.go(() => q.center(5)); q.ride(5, 1); q.go([0, 0]); };
  const finished = (q, what) => assert.ok(q.p.goal && q.falls === 0, `${what}：ゴールに着かない／落ちた (${q.falls}、${q.fellAt}) ${q.where()}`);
  const crumbleBack = q => q.wait('くずれる床が戻る', () => q.w.movers.slice(0, 4).every(m => m.f === 0 && m.clock === 0), 10);

  // ── いちばんふつうの道（1 人・手ぶらから） ──
  const { w, p } = b;
  b.grab(0); toA(b);                                                         // 箱を持って、トランポリンで東の屋根へ
  b.put(12.4, -2);                                                           // おもさ板に 1 つめ
  b.go([15.4, 2]); b.go([24, 2]);                                            // くずれる床を渡る
  b.grab(1); crumbleBack(b);
  b.go([15.4, 2]); b.put(13.6, -2);                                          // 箱を持って帰り、おもさ板に 2 つめ
  b.wait('リフトが動く', () => w.plates[0].down && w.movers[4].f > 0.1, 4);
  b.go([10, -4]); b.go([6, -4]);                                             // 広場へ飛びおりる
  b.grab(3); toA(b); liftToB(b);                                             // せんぷうき箱を持って、トランポリンとリフトで北の屋根へ
  b.put(-7, 13); b.wait('せんぷうき箱の風が出る', () => w.winds[0].active, 3);   // 西の塔の壁ぎわに置く
  perch(b);                                                                  // トランポリンで出窓へ。箱を持って飛びおりる
  fanToC(b);                                                                 // 箱を持ったまま風に乗り、西の塔へ
  goalRide(b);                                                               // 箱を持ってゴールのリフトへ（2 人ぶんの重さ）

  // ── できてはいけないこと ──
  let q = fresh();
  q.go([-7.3, 3.5]); q.climb([-7.3, 3.5], [-10, 3.5]);                       // 手ぶらなら、西の塔のあみを登れる
  q.go([-9.6, -4]); q.go(() => q.center(5)); idle(q, 3);
  assert.equal(q.w.movers[5].f, 0, '手ぶらの 1 人で、ゴールのリフトが動いた');
  q.go([-5.4, -3]); q.face(0, 0); q.p.grabStart(); q.p.jump(); idle(q, 3, 0.8, 0.6);   // 止まったリフトの東の端から柱のほうへ跳んでつかもうとしても、広場へ落ちる
  assert.ok(!q.p.goal && q.p.y < 1 && q.falls === 0, `リフトなしでゴールに届いた ${q.where()}`); q.p.grabEnd();

  q = fresh();                                                               // おもさ板に箱 1 つでは、リフトは動かない
  set(q, 0, 12.4, 3.5, -2); idle(q, 3); assert.ok(!q.w.plates[0].down && q.w.movers[4].f === 0, '箱 1 つでリフトが動いた');
  q.grab(3); toA(q); q.go([8.8, 9.5]); q.go(() => q.center(4));             // 止まったリフトから、せんぷうき箱を持って北の屋根へは跳び乗れない
  assert.throws(() => q.go([3, 9.5], null, 4)); idle(q, 1);
  assert.ok(q.p.y < 4 && q.p.carry === q.w.crates[3], `荷物を持って、止まったリフトから北の屋根へ跳び乗れた ${q.where()}`);
  q.p.grabEnd(); q.hoist([5.7, 9.5], [3, 9.5]);                              // 手ぶらなら、跳んでつかんで 2.35m の段を登れる
  assert.ok(near(q.p.y, 5) && q.falls === 0, `手ぶらで止まったリフトから北の屋根へ登れない ${q.where()}`);

  q = fresh();                                                               // 止まったリフトに箱 1 つの踏み台を置いても、せんぷうき箱を持って北の屋根へは上がれない（おもさ板を飛ばせない）
  const deck = q.w.movers[4].box.y1; set(q, 0, 5.5, deck, 9.5); set(q, 3, 7.4, deck, 9.5);
  q.place(7.9, deck, 9.5); q.tick(); q.face(7.4, 9.5); q.p.grabStart(); q.go([6.7, 9.5]);
  for (const k of [0, 1]) { q.face(0, 9.5); q.p.jump(); land(q, -1, 0); }   // 箱の上へ跳び乗り、そこから北の屋根へ跳ぶ
  idle(q, 1, -1, 0); assert.ok(q.p.y < 4 && q.p.carry === q.w.crates[3], `箱 1 つの踏み台で、せんぷうき箱を持って北の屋根に乗れた ${q.where()}`);

  q = fresh();                                                               // 広場のせんぷうき箱では、荷物を西の塔（8.2m）へ上げられない
  q.grab(3); q.put(-7.3, -1); q.grab(0); q.go([-6.2, -1]); q.face(-7.3, -1); q.p.jump();
  let top = 0; for (let i = 0; i < 12 * q.FPS; i++) { q.tick(-1, 0); top = Math.max(top, q.p.y); assert.ok(!(q.p.grounded && q.p.y > 7), '広場の風で、荷物を持って西の塔に乗れた'); }
  assert.ok(top > 4 && top < 8.2 - 0.35 && q.p.carry === q.w.crates[0], `広場の風で浮く高さがおかしい (${top})`);

  q = fresh();                                                               // 広場の風なら、荷物を北の屋根（5m）へは上げられる。でも箱 1 つの踏み台では、荷物を持って西の塔へは届かない
  q.grab(3); q.put(4, 7.3); q.grab(0); q.go([4, 6.2]); q.face(4, 7.3); q.p.jump(); q.go([4, 7.3], () => q.p.y > 5.05); q.go([4, 10]);
  assert.ok(near(q.p.y, 5) && q.p.carry === q.w.crates[0], `広場の風で、荷物を持って北の屋根に乗れない ${q.where()}`);
  q.put(-7.5, 11); perch(q); q.go([-6.3, 11]); q.face(-7.5, 11); q.p.jump(); land(q, -1, 0);   // 箱の上へ跳び乗る
  assert.ok(near(q.p.y, 5.8), `踏み台の箱に乗れない ${q.where()}`); q.p.jump(); land(q, -1, 0); idle(q, 1, -1, 0);
  assert.ok(q.p.y < 8 && q.p.carry === q.w.crates[2] && q.falls === 0, `箱 1 つの踏み台で、荷物を持って西の塔に届いた ${q.where()}`);

  // ── ほかの道 ──
  q = fresh();                                                               // 2 人の近道：あみで西の塔へ登り、仲間と 2 人でゴールのリフトに乗る（箱もせんぷうき箱もいらない）
  q.friend = [-6.5, 8.2, -4, 1]; idle(q, 2); assert.equal(q.w.movers[5].f, 0, '仲間 1 人だけで、ゴールのリフトが動いた');
  q.go([-7.3, 3.5]); q.climb([-7.3, 3.5], [-10, 3.5]); goalRide(q); finished(q, '2 人の近道');

  q = fresh();                                                               // 広場から東の屋根へは、せんぷうき箱の風でも上がれる（箱を持ったまま）
  fanByA(q); assert.equal(q.falls, 0);

  q = fresh();                                                               // 出窓へは、せんぷうき箱の風でも上がれる（北の屋根へは、広場からあみで登る）
  set(q, 3, -7, 5, 13);                                                      // せんぷうき箱は、もう北の屋根にあることにする
  q.go([0, 7.4]); q.climb([0, 7.4], [0, 10]);
  q.fanUp(3, [2.5, 11.3], 8.3, [3, 13]); assert.ok(near(q.p.y, 8) && q.falls === 0, `風で出窓に乗れない ${q.where()}`);
  q.grab(2); q.go([4.6, 13]); q.go([4.6, 10.5]); assert.ok(near(q.p.y, 5) && q.p.carry === q.w.crates[2]);

  q = fresh();                                                               // 箱を持った仲間がおもさ板に立てば、箱 2 つのかわりになる
  q.friend = [13, 3.5, -2, 2]; q.wait('リフトが動く', () => q.w.movers[4].f > 0.1, 4);
  q.grab(3); toA(q); liftToB(q); assert.ok(q.p.carry === q.w.crates[3] && q.falls === 0);

  for (const delay of [0, 0.6, 1.3, 2.1, 2.9, 3.6]) {                       // リフトの動きの、どの時点から始めても乗れる
    q = fresh(); set(q, 0, 12.4, 3.5, -2); set(q, 1, 13.6, 3.5, -2); idle(q, delay);
    q.grab(3); toA(q); liftToB(q); assert.ok(q.p.carry === q.w.crates[3] && q.falls === 0, `リフトの時点 ${delay}`);
  }

  // ── わるい順番：まちがえて、落として、置きっぱなしにしても、1 人で最後まで行ける ──
  q = fresh();
  q.grab(3); toA(q); q.go([8.8, 9.5]); q.go(() => q.center(4));             // せんぷうき箱を先に持って行っても、リフトは動かない
  assert.throws(() => q.go([3, 9.5], null, 3)); q.go([2, -6]);
  q.put(2, -9); q.wait('落としたせんぷうき箱が、広場へ戻る', () => near(q.w.crates[3].x, 4) && near(q.w.crates[3].z, -5) && q.w.crates[3].on, 6);   // 広場の南の端から落とす
  toA(q); q.go([15.4, 2]); q.go([24, 2]); q.grab(1); crumbleBack(q);                 // 小島の箱を先に取る
  q.go([15.4, 2]); q.go([15.4, 6]); q.face(17, 6); q.p.grabEnd(); q.wait('落とした箱が、小島へ戻る', () => near(q.w.crates[1].x, 25) && q.w.crates[1].on, 6);   // 帰り道で落とす
  crumbleBack(q); q.go([15.4, 2]); q.go([24, 2]); q.grab(1); crumbleBack(q); q.go([15.4, 2]); q.put(13.6, -2);
  q.go([10.5, -4.5]); q.wait('板から下りると、リフトが戻る', () => q.w.movers[4].f === 0, 6); idle(q, 2); assert.equal(q.w.movers[4].f, 0, '箱 1 つでリフトが動いた');
  q.go([10, -4]); q.go([6, -4]);                                             // 広場の箱は、風で上げる
  fanByA(q);
  q.put(12.4, -2); q.wait('リフトが動く', () => q.w.movers[4].f > 0.1, 4);
  q.go([9, 6.5]); q.go([6, 6.5]);                                             // 広場へおりて、壁ぎわのせんぷうき箱を取りに行く
  q.grab(3, [6.2, 4]); q.go([4.6, 1.5]); toA(q); liftToB(q); q.put(-7, 13);
  perch(q); q.go([-3, 12]); q.go([-3, 15.2]); q.put(-3, 17); q.wait('落とした箱が、出窓へ戻る', () => near(q.w.crates[2].x, 3) && near(q.w.crates[2].y, 8) && q.w.crates[2].on, 6);   // 北の屋根の奥から落とす
  perch(q); fanToC(q);
  q.go([-9.6, -4]); q.go(() => q.center(5)); q.wait('ゴールのリフトが半分まで上がる', () => q.w.movers[5].f > 0.5, 8);   // 上がる途中で、箱をリフトに置いて広場へ飛びおりる
  q.p.grabEnd(); q.go([-4, -6], null, 8); assert.ok(q.p.y < 1 && !q.p.goal && q.w.crates[2].on === q.w.movers[5].box, `箱をリフトに置いて飛びおりられない ${q.where()}`);
  q.wait('ゴールのリフトが、箱を乗せたまま西の塔へ帰る', () => q.w.movers[5].f === 0, 10);   // 柱の上に動かない台がないので、置いた箱は、かならずリフトごと帰ってくる
  q.climb([-7.3, 3.5], [-10, 3.5]); q.grab(2, [q.w.crates[2].x - 1, q.w.crates[2].z]);   // リフトの上で持てば、そのまま動き出す
  q.go(() => q.center(5)); q.ride(5, 1); q.go([0, 0]); finished(q, 'わるい順番');

  q = fresh();                                                               // 箱を持ったまま広場へ落ちても、もう一度上げなおせる
  set(q, 0, 12.4, 3.5, -2); set(q, 1, 13.6, 3.5, -2); set(q, 3, -7, 5, 13); set(q, 2, -3, 0, 0); q.grab(2); q.go([0, -5]);
  q.wait('リフトが動く', () => q.w.movers[4].f > 0.1, 4); toA(q); liftToB(q); fanToC(q); goalRide(q); finished(q, '箱を持って落ちたあと');
};

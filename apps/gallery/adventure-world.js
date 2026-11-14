/* もふもふ冒険の「世界」：足場・仕掛け・箱と、キャラの動き。
   描画も通信も含まない（adventure.html が描き、tools/test-adventure.mjs がこのまま動かして「1 人で解けるか」を検査する）。
   足場はすべて、軸にそろった箱。キャラは半径 R・高さ BODY の円柱として当たりを取る。
   shortcut: 箱は回転しない・転がらない。シーソーや振り子のような仕掛けが要るなら、物理エンジンへ移す */
// 動きは「ゆっくり・ねっとり」：歩きは遅く、滑り出しと止まり際が長く、ふわっと跳ぶ
export const R = 0.3, BODY = 1.4, STEP = 0.35, REACH = 1.7, GRAV = 10, JUMP = 4.75, SPEED = 2.8, BOUNCE = 8.5;

/* 箱：中心 x・上面の高さ・中心 z・幅・奥行・厚み・色番号
   色 0 草 / 1 石 / 2 木 / 3 動く床 / 4 門・押し出し壁 / 5 氷 / 6 トランポリン / 7 ベルトコンベア / 9 くずれる床 / 11 ふみ板カタパルト */
const B = (x, top, z, w, d, h = 1, c = 0) => ({ x0: x - w / 2, x1: x + w / 2, y0: top - h, y1: top, z0: z - d / 2, z1: z + d / 2, c });
const ice = b => Object.assign(b, { ice: true, c: 5 });                     // 氷：滑る
const pad = (x, top, z) => Object.assign(B(x, top, z, 2, 2, 0.3, 6), { bounce: BOUNCE });   // トランポリン：乗ると高く跳ねる（約 3.5m）
const belt = (b, vx, vz) => Object.assign(b, { belt: [vx, vz], c: 7 });     // ベルトコンベア：乗っている人と箱を運ぶ
const P = (x, y, z) => ({ x, y, z, w: 1.6, d: 1.6 });                       // ふみ板
const CP = (x, y, z, hint, r) => ({ x, y, z, hint, r });                    // セーブ地点（先頭が出発点）。r はふれたことになる半径（省くと 2.2）
const crumble = (x, top, z) => ({ b: B(x, top, z, 3, 2, 0.4, 9), to: [0, -16, 0], mode: 'crumble', speed: 9 });   // くずれる床：乗ると 1 秒後に落ち、しばらくして戻る
// 風：下から吹き上げる（on のふみ板のどれかが押されている間だけ。on がなければ常に）
const wind = (x, z, w, d, y0, y1, on) => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0, y1, up: 7, on, any: true });
// 横風：period ミリ秒ごとに「吹く・やむ」をくり返し、吹いている間は push（毎秒 m）の向きへ流される
const gust = (x, z, w, d, y0, y1, push, period) => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0, y1, push, period });
const saw = (x, floor, z) => Object.assign(B(x, floor + 0.6, z, 1.2, 1.2, 0.6, 8), { hurt: true });   // のこぎり：さわるとやり直し（色 8）。高さ 0.6m で、うまく跳べば越えられる
const cannon = (x, top, z, v) => Object.assign(B(x, top, z, 2, 2, 0.3, 10), { fling: v });   // 大砲台：乗ると [横 x, 上, 横 z] の速さで打ち出される（色 10）
const warp = (x, y, z, to) => ({ x, y, z, to });                           // ワープ台：乗ると to へ飛ぶ
const cell = (x, y, z) => ({ x, y, z, s: 0.8, tag: 'cell' });               // でんち：軽い箱。ソケットに置くと、そのソケットが「押された」になる
const socket = (x, y, z) => ({ x, y, z, w: 1.6, d: 1.6, needs: 'cell' });   // ソケット：でんちだけが押せるふみ板（体やふつうの箱では押せない）
const WP = (x, y, z, need) => ({ x, y, z, w: 2.4, d: 2.4, need });          // おもさ板：のっている重さの合計が need 以上で押される
const fan = (x, y, z) => ({ x, y, z, s: 0.8, fan: true });                  // せんぷうき箱：軽い箱。置いてある間、真上に風を出す
const net = (b, climbFaces) => Object.assign(b, { climb: true, climbFaces });   // あみ：つかむと登れる壁。climbFaces（'s' 'n' 'e' 'w' をならべた文字）で、登れる面をしぼれる
const launcher = (x, top, z, aims) => Object.assign(B(x, top, z, 2.4, 2.4, 0.3, 11), { launch: { aims } });   // ふみ板カタパルト：条件が合っている間だけ打ち出す（色 11）
// レールの箱：重い箱と同じに押し引きするが、レール（axis 'x' か 'z' の向きに min〜max）の上だけを動く。1 人で動かせ、落ちず、ふみ板も押さない
const cart = (x, y, z, axis, min, max) => ({ x, y, z, s: 1.4, heavy: true, solo: true, rail: { axis, min, max } });   // 台車：押して踏み台にする
const lever = (x, y, z, axis) => { const v = axis === 'x' ? x : z; return { x, y, z, s: 0.6, heavy: true, solo: true, rail: { axis, min: v, max: v + 1.6 } }; };   // レバーのつまみ：置いた場所が min の端。1.6m 先が max の端
const railEnd = (crate, at) => ({ kind: 'rail', crate, at });               // レールの端の信号（plates に書く）：箱 crate が、その端（'min' か 'max'）にある間「押された」になる

/* 動く床・門（movers）: b を to だけ動かす。
   mode 'always' 行ったり来たりし続ける／'loop' ふみ板（on）が押されている間だけ行き来し、離すと元へ戻る／'hold' 押されている間だけ動いた先にいる
        'timed' 押すと動き、離してから hold ミリ秒は動いた先にいる／'crumble' 乗ると落ちる
   on が複数のとき、any: true なら「どれか 1 枚」、なければ「全部」。period は片道にかける時間（ミリ秒）
   orbit があれば、b の位置を中心に半径 orbit の円を回る（plane 'xz' 水平のメリーゴーラウンド／'zy' 縦の観覧車。period は 1 周の時間） */

/* ── ステージを作る人へ：あとから足した項目の書き方 ──
   ステージには、次の項目も書ける（adventure.html だけが使い、この世界は読まない）。
     yaw        はじめのカメラの向き（ラジアン）
     objective  { label: 'でんち', on: [信号の番号…], need: 2 }　画面に出す「でんち 1/2」
     deco       見た目だけの形（当たりはない）。B(…) の箱か、{ beacon: [x, y, z], color: '#rrggbb' }（目じるしの柱）

   信号（plates。番号は書いた順）：どれも down（押されている）と load（のっている重さ）を持つ。
     P(x, y, z)          ふつうのふみ板（1.6m 四方）。体か箱がのれば押される
     socket(x, y, z)     ソケット。でんち cell(x, y, z) を置いたときだけ押される（体やふつうの箱では押されない）。置いたでんちは、まん中へ寄る。
                         でんち 1 個は、ソケット 1 つぶん。ソケットどうしは、まん中を 2m 以上離す（近いと、境目に置いたでんちが、先に書いたソケットへ寄る）
     WP(x, y, z, need)   おもさ板（2.4m 四方）。のっている重さの合計が need 以上で押される：人 1、軽い箱を持った人 2、軽い箱 1、重い箱 2。
                         足りなくなっても 0.4 秒は押されたまま（load は、そのコマの重さのまま。条件の load: n が見る重さ held は、軽くなってから 0.4 秒は前のまま）
     railEnd(箱の番号, 'min' か 'max')　レールの端。その番号のレールの箱（下の lever・cart）が、その端から 0.25m 以内にある間、押されている。
                         場所（x・y・z）は持たない。レバーなら、min と max の 2 つを書く（つまみがまん中にある間は、どちらも押されていない）
   条件（movers・winds・カタパルトのねらいに書く）：on: [信号…] が全部押されている間。any: true で「どれか 1 つ」、need: k で「k 個以上」。
     load: n を足すと、「押されている」のかわりに「重さが n 以上」で数える（どの信号でも、軽くなってから 0.4 秒は前の重さで数える）。not: true で逆になる。on がなければ「いつも」。

   movers に足せるもの
     crush: true  下りてきたとき、地面との間にはさまれた人がやり直しになる（プレス機）。これがない動く床は体をすり抜け、人は歩いて出るか、上に乗る
                  （床と壁の間にはさまれても、面に沿って横へ歩けば出られる）。shortcut: 三方を壁で囲んだ行き止まりへ人を押しこむ床からは、出られない。そういう置き方をするなら crush: true にする
                  乗っている人と箱は、動かない箱（壁・天井）の中へは運ばれない。人は、横の壁に当たると床の上をすべる。上がる床の縁に立っていて、頭の上に動かないひさしがあれば、
                  人はそこに残り、床だけがすり抜けて上がる（人は床の下へ落ちる）。箱は、当たった所に残り、床が先へ行けば落ちる
     lamps: true  条件の信号を、床のそばのランプで見せる（見た目だけ）
     { b, to, mode: 'ride', need: 1, speed: 2.5, wait: 1.5 }　乗ると動く床。人が縁から 0.2m 中まで乗ると to へ動き、だれもいなくなって wait 秒たつと出発点へ帰る
                  （動き出したあとは、縁から 0.6m 外・上面の 1m 下までにいる人も乗っている扱い：遅れて見える仲間を落とさない。ただし、床の縁のあたりで、となりの岸など
                  別の足場に立っている人は数えない）。need: 2 は「2 人」か「軽い箱を持った 1 人」。箱だけでは動かない。on は見ない。
                  下りてくる床の真下に立っている人は、床が足元（0.25m 上）まで来てから数える（それより早く数えると、床が逃げては戻るのをくり返す）。
                  かならず出発点へ帰るので、行き先の岸には別の帰り道を作る。上下に動かすなら、上下の速さは毎秒 1m まで
     { b: 皿A, to: [0, H, 0], mode: 'scale', pair: 'q', side: 'A' } と { b: 皿B, to: [0, -H, 0], mode: 'scale', pair: 'q', side: 'B' }　てんびん（2 枚で 1 組）。
                  はじめは A が下、B が上。A に重さがあり、B が A 以上に重い間（同じ重さでもよい）、A が H 上がり、B が H 下がる（毎秒 0.8m）。そうでなくなると元へ戻る。
                  皿の重さ＝皿の上の人（乗るまでは縁から 0.15m 外まで。だれかが乗ったあとは 0.3m 外・上面の 1m 下まで。となりの足場に立っている人は数えない）＋皿にのっている箱。
                  軽くなっても 0.6 秒は前の重さのまま
     ride と scale の床は、いまの重さを wt に持つ。どちらも、通信では何も送らない：行き先に着いた床の上にいるはずの仲間（行き先の床の縁から 0.15m より中にいるか、
                  縁のあたりで宙に浮いて見える＝足元 0.5m 以内に床がない）も、乗っている扱いにする。あとから入った端末や、しばらく止まっていた端末でも、床が仲間の足元へ行き、
                  全員が立ち止まれば、どの端末でも床は同じ場所になる。だから、行き先で床が着く場所のまん中に、別の足場があって人が立てるなら、そこに立つだけで床が来る
     { b, to, mode: 'crank', handles: [ハンドルの番号…], up: 4, hold: 12, down: 8 }　ハンドルで巻き上げる床。handles のどれかを、だれかがつかんでいる間、
                  up 秒で to まで行く速さで進む。放すと hold 秒そのまま止まり、そのあと down 秒で戻りきる速さで戻る（どれも秒。省くと 4・12・8。'timed' の hold はミリ秒なので注意）。
                  速さの上限（speed）は効かない。on は見ない。橋なら両岸に、リフトなら「リフトの上（ride）」と「地面」の両方に、ハンドルを置く
   handles（ステージの項目。番号は書いた順）　[{ x, y, z }, { x, y, z, ride: 動く床の番号 }]　まきあげハンドル。ride を書くと、その床に付いて一緒に動く。当たりはない。
                  地面に立ち、1m 以内（高さの差も 1m 未満）で、ハンドルのほうを向いて「つかむ」と回す。そばに箱があっても、ハンドルが先。
                  回している間は、歩けず、向きも変わらず、横風にも流されない（乗っている床には運ばれる）。放す・地面を離れる・やり直しで、手が離れる。
                  ハンドルが 1m より遠く（横か、高さ）へ離れても、手が離れる（p.crank が null、p.grab が false になる）。リフトに乗って、リフトの上のハンドルを回す人は、
                  一緒に上がるので離れない。地面からリフトの上のハンドルを回すと、リフトが 1m 上がった所で手が離れる（だから地面には、動かないハンドルを置く）
   crates に足せるもの
     cell(x, y, z)  でんち（軽い箱）。落とすと元の場所へ戻る
     fan(x, y, z)   せんぷうき箱（軽い箱）。置いてある間だけ、箱のまん中から前後左右 1m・箱の上面から 0.1〜3.5m 上に、人だけを吹き上げる風を出す。
                    持っている間・落ちている間・ほかの箱（台車も）や仲間の頭の上に置いてある間は止まる
     軽い箱は、放すと目の前 0.95m に置かれる。そこか、そこまでの途中がふさがっていれば（うすい壁や門でも）、後ろに置かれる
     重い箱（レールの箱も）は、つかんだまま、つかめる距離より遠く（横 箱の半分＋1m、高さ 1.2m）へ離れると、手が離れる（動く床に運ばれながら、岸のレバーは動かせない）
     mass: n        おもさ板・てんびんで数える重さ（省くと、軽い箱 1・重い箱 2）
     lever(x, y, z, 'x' か 'z')　レバーのつまみ（0.6m のレールの箱。レールは 1.6m）。置いた場所が min の端で、そこから +1.6m が max の端。端から押して、反対の端の信号が押されるまで 1.4 秒
     cart(x, y, z, 'x' か 'z', min, max)　台車（1.4m のレールの箱）。押して踏み台にする：上から跳んでつかめば、台車の床から 4.1m の段まで届く（設計は 3.8m まで）
       レールの箱＝ { heavy: true, solo: true, rail: { axis, min, max } }。重い箱と同じに押し引きするが、レールの向き（axis）にだけ、箱のまん中が min〜max の間だけ動く
       （押しつづけると、端の手前で止まる。残るすき間は、1 コマに進む長さより短い＝毎秒 20 コマで 0.06m まで）。落ちない。元の場所へ戻らない。置いた所にそのままいる。ふみ板・おもさ板・ソケット・てんびん・くずれる床には、重さ 0（のっていない扱い）。
       y は、下の床の上面に合わせて書く（自分では下りない）。動く床には運ばれないので、動く床の上には置かない。上に置いた軽い箱や、乗った人は、押しても一緒には動かない
     solo: true     重い箱を、部屋に何人いても 1 人で動かせる（ふつうの重い箱は、2 人以上いると 2 人でつかまないと動かない）
   boxes に足せるもの
     net(B(…), 面)  あみ。手ぶらでつかむと登れる壁（上下は毎秒 1.2m、左右は 1m。てっぺんの 1.7m 下からは、ふつうのよじ登り）。横や下へ外れると落ちる。
                    つかむと、面のすぐ前（0.35m）へ体が寄る（寄る長さは 0.6m まで。宙に浮いたあみの真下や中からは、つかめない。外の面からつかむ）。
                    登っている間は、足が地面を離れた扱い（跳べない。下の床やベルトに運ばれない）。
                    面は、登れる面をならべた文字（'s' 南・'n' 北・'e' 東・'w' 西。省くと 4 面とも）。壁の一部だけをあみにするには、壁の箱を分けるか、
                    うすいあみの板を壁の手前に重ねて、boxes の中で壁より先に書く（あとに書くと、つかめない）
     launcher(x, top, z, [{ v: [横 x, 上, 横 z], on, need, load, not }, …])　ふみ板カタパルト（2.4m 四方）。条件が合うねらいのうち、最後に書いたものの速さで、
                    乗った人を打ち出す（持っている軽い箱ごと。置いてある箱は飛ばない。重い箱をつかんでいたら、手が離れて人だけが飛ぶ）。どれも合わない間は、ただの床。いまのねらいは、箱の aimV（なければ null）
                    おもさ板や load: n で動かすなら、板の縁と台の縁を 2m 以上離す（板を下りても 0.4 秒は押されたままなので、1.55m までは、1 人で板を走りぬけて飛べてしまう）
   CP(x, y, z, hint, r)　最後にふれたセーブ地点が、やり直しの場所になる（前の地点へ戻れば、そこになる）。r は、ふれたことになる半径（省くと 2.2）

   ── adventure.html へ：ハンドルと、巻き上げる床の合わせ方 ──
   w.handles[i] が、ハンドルのいまの場所。p.crank が、自分が回しているハンドルの番号（なければ null）。p.grabStart() は、ハンドルをつかんだときも null を返す。
   w.step(dt, now, bodies, grips) の grips には、自分の p.crank と、仲間が回しているハンドルの番号（仲間ごとの s[7]）を、全部入れる（同じ番号が 2 つあってもよい）。
   巻き上げる床 m は、だれもつかんでいない間、m.rel = { f, t }（手が離れたときの f と、そのときの now）だけから位置を決める。
   自分の手が離れたら（p.crank が番号から null に変わったコマ。放した・跳んだ・ハンドルが遠ざかった・やり直し）、そのハンドルで動く床ごとに、
     rel = { f: w.movers[番号].f, t: 最後の w.step に渡した now } を作り、w.release(番号, rel) を呼び、同じ rel を、だれが放したか（自分の番号）と一緒に仲間へ知らせる
     （ほかの人がまだつかんでいても、かならず知らせる。items に、もっと新しい t の知らせがあれば、上書きしない）。
   仲間が手を放した知らせを受けたら（あとから入ったときに items から読んだ知らせも同じ）、w.release(番号, rel) を呼び、その仲間の s[7] を、次に値が変わるまで grips に入れない
   （「つかんでいる」の知らせが遅れて残っていても、数えない。同じハンドルをつかんでいる、ほかの人や自分は、そのまま数える）。w.release は、t の新しい知らせを残す。
   その床のハンドルを、まだほかのだれかが本当につかんでいれば、床は進みつづけ、その人が放したときの知らせで決まる。こうして、最後に放した人の rel が、全員の端末に残る。
   shortcut: 放してから、仲間の端末で s[7] が消える前に同じハンドルをつかみなおすと、その仲間の端末では、次に放すまで床が進まない（放した知らせで、同じ位置にそろう）

   ── adventure.html へ：そのほかに読むもの・渡すもの ──
   w.extra      毎コマ、仲間の体の箱（friend: true）を入れる。箱が上に乗ることも、せんぷうき箱の風を止めることもある
   w.winds      風の一覧。ステージに書いた風のあとに、せんぷうき箱 1 個につき 1 つ（.fan がその箱）。吹いている間は .active が true。風の柱は x0・x1・z0・z1・y0・y1（せんぷうき箱の風は、毎コマ箱に合わせて変わる）
   p.near       いま中にいるセーブ地点の番号（どこにもいなければ -1）。p.seen は、これまでにふれた地点の番号の Set。p.cp が、やり直しの場所
   箱の記録     置いた箱（c.moved で、c.held でなく、足元の床 c.on がある。レールの箱も、動かしている間ずっと c.on を持つ）だけを書く。動く床の上なら（c.on.m がある）、
                その床の番号 w.movers.indexOf(c.on.m) と、床のいまのずれ c.on.m.o を引いた場所を書き、受けた端末は、自分の端末でのその床の o を足す

   ── 寸法のめやす：この世界を毎秒 60・30・20 コマで動かして測った値（「〜」は、コマ数による幅） ──
   段差　歩いて上がれる 0.35／跳んで乗れる 1.35〜1.4（箱を持っていても同じ。設計は 1.1 まで）／立ったままつかめる 1.7／跳んでつかめる 2.7（設計は 2.4 まで）。
         1.7〜1.9 の壁は作らない（地面からつかむと、張りつくだけで登れない）。持っている箱を段の上へ置けるのは、地面から 0.9、跳んで 1.9〜1.95 まで
   すき間（同じ高さ）　ふつうは 1.5 まで。助走して跳ぶと 2.95〜3.1（早めに踏み切ると 2.6）、軽い箱を持って 2.45〜2.6（早めで 2.1）。
         「つかむ」を押したまま跳ぶと、向こう岸の縁をつかんで 3.9〜4.15 まで渡れる（向こう岸が 1m 低いと 4.5、2m 低いと 4.8。縁に置いた重い箱の上からは 4.55、軽い箱を 2 段に積んだ上からは 4.65）。
         投げられた仲間は 8.0 まで渡れる（縁をつかめば 8.95、投げる人が箱の上なら 9.3）。
   渡らせないすき間（ステージを作るときは、この 3 つの値を使う）
         荷物を持った人を渡らせない　　3.6 以上
         手ぶらの人も渡らせない　　　　5.4 以上
         かぎの橋をかけるすき間　　　　10（投げられた仲間も渡れない）
         せんぷうき箱を持ちこめる岸では、風で上がってから流れて、荷物を持って 4.1（向こう岸が 2m 低いと 4.5）、手ぶらでつかんで 5.7（同 6.1）まで渡れる。
         その岸のすき間は、荷物を止めるなら 4.6 以上（向こう岸が低いなら 5.0 以上）、人も止めるなら 6.2 以上（同 6.6 以上）にする
   かぎの橋　下に止めてある床が、すき間（10m）いっぱいに上がってくる形にする（沈む壁にはしない）。止めておく床の上面は、やり直しの高さ kill より下にする
         （6m 下に止めるなら kill は -5.5 など、止めた床より上。kill が -12 なら 13m 下に止める）。kill より上に止めると、すき間へ落とした箱や人が、その床の上に残って戻れない
   道幅　空に面した通り道は幅 3 以上、荷物を取る足場は 3×3 以上。荷物を運ぶ所の横風は毎秒 2m まで。氷の上と、幅 4 未満の足場には横風を置かない
   トランポリン　台から 3.4〜3.55 上がる。そのまま乗れる段は 3.85 まで、つかめば 5.2 まで
   せんぷうき箱　箱を置いた床から、はじめに 5.2〜5.5 まで上がり、そのあとは 3.65〜5.5 の間を上下する（箱を持っていても同じ）。
         風で上がらせる段は 3.0〜4.5（3.6 までは、いつ横へ動いても乗れる）。箱は壁から 0.6 以内に置かせる。箱の上か、箱から 1m 以内で跳べば、風に入る。
         そのまま乗れる段は 5.55〜5.8 まで → 荷物を風で上げさせない段は 6.5 以上。手ぶらで「つかむ」を押していれば 7.0〜7.2 まで登れる → 人も登らせない段は 7.6 以上。
         高さは、せんぷうき箱を置いた床から測る（ほかの箱や、仲間の頭の上に置くと、風は止まる）
   カタパルト　何もしないで飛んだときの、てっぺんの高さ（台から）と、台から T 上を落ちながら通るときの水平距離（60 コマ。20 コマでは、てっぺんが 0.15〜0.25 低く、距離のずれは 0.15 以内）
         [0, 9, 7]     てっぺん 4.0　T0 で 6.7          [0, 9, 10]   てっぺん 4.0　T0 で 9.6
         [0, 11, 12]   てっぺん 6.0　T0 で 12.5、T3 で 11.7   [0, 12, 12]  てっぺん 7.1　T0 で 12.9、T3 で 12.3
         [0, 12, 15]   てっぺん 7.1　T0 で 16.1、T3 で 15.4   [0, 13, 5.6] てっぺん 8.3　T5 で 5.7、T8 で 5.0
         [0, 14, 6]    てっぺん 9.7　T8 で 6.0
         ほかの向きへ飛ばすには、横の速さ（x と z）を同じ大きさのまま回す。着地させる足場は、この着地点を中心に 6×6 以上 */
// ステージのファイル（adventure-stages/sN.js）へ渡す「作り方」一式
export const kit = { B, ice, pad, belt, P, CP, crumble, wind, gust, saw, cannon, warp, cell, socket, WP, fan, net, launcher, lever, cart, railEnd };

export function makeWorld(stage) {
  const w = { stage, list: [], extra: [] };                                          // extra：呼び出し側が毎コマ入れる箱（仲間の体。friend: true）
  w.movers = stage.movers.map(m => ({ ...m, f: 0, o: [0, 0, 0], d: [0, 0, 0], clock: 0, idle: 99, wt: 0, low: 0, box: { ...m.b } }));
  w.movers.forEach(m => { m.box.m = m; if (m.pair) m.twin = w.movers.find(k => k !== m && k.pair === m.pair); });
  w.plates = stage.plates.map(p => ({ ...p, down: false, load: 0, held: 0, low: 0, lost: 9 }));
  w.warps = stage.warps || [];
  w.handles = (stage.handles || []).map(h => ({ ...h }));                            // ハンドルの、いまの場所（ride の床に付いたものは、床と一緒に動く）
  w.crates = stage.crates.map((c, id) => ({ ...c, id, home: { ...c }, vy: 0, held: null, on: null, box: { c: 2 } }));
  w.winds = (stage.winds || []).map(z => ({ ...z, active: false })).concat(w.crates.filter(c => c.fan).map(c => ({ fan: c, up: 5, active: false })));
  const pads = stage.boxes.filter(b => b.launch);
  const fit = c => { const h = c.s / 2, b = c.box; b.x0 = c.x - h; b.x1 = c.x + h; b.z0 = c.z - h; b.z1 = c.z + h; b.y0 = c.y; b.y1 = c.y + c.s; b.crate = c; };
  w.fit = fit;
  const relist = () => { w.list = [...stage.boxes, ...w.movers.map(m => m.box), ...w.crates.filter(c => !c.held).map(c => c.box), ...w.extra]; };

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
  // 動かない箱（壁・床）だけを見る blocked：動く床・箱・仲間の体は数えない（w.list は動かない箱が先なので、動かない箱に当たっていれば、それが返る）
  w.wall = (x, z, y, skip, r, h) => { const k = w.blocked(x, z, y, skip, r, h); return k && !k.m && !k.crate && !k.friend ? k : null; };
  // 足元の箱。ただし、上がってくる動く床に乗ると動かない箱（天井・ひさし）にめり込むなら、その床は足元に数えず、その下を返す（床は、体や箱をすり抜けて上がる）
  w.footing = (x, z, y, skip, r, h) => {
    const g = w.groundBox(x, z, y, skip);
    return g?.m && g.y1 > y + 1e-6 && w.wall(x, z, g.y1, skip, r, h) ? w.groundBox(x, z, g.y1 - STEP - 1e-6, skip) : g;
  };
  // その場所に吹いている風（なければ null）
  w.windAt = (x, y, z) => w.winds.find(k => k.active && x > k.x0 && x < k.x1 && z > k.z0 && z < k.z1 && y > k.y0 - 0.2 && y < k.y1) || null;

  // 条件（動く床・風・カタパルトのねらいで共通）：on の信号のうち、押されている（load があれば、重さが load 以上の）ものが need 個以上あるか。not で逆になる
  w.test = c => !c.on || !c.not === (c.on.filter(i => c.load ? w.plates[i].held >= c.load : w.plates[i].down).length >= (c.need ?? (c.any ? 1 : c.on.length)));

  // 手を放した知らせ：巻き上げる床 i は、これからは rel = { f, t }（放したときの f と時刻）から位置を決める。知らせどうしでは、t の新しいほうが残る
  w.release = (i, rel) => {
    const m = w.movers[i];
    if (!(m.last?.t > rel.t)) m.last = { f: rel.f, t: rel.t };                       // last：これまでに届いた知らせのうち、いちばん新しいもの
    m.rel = m.last;                                                                  // この端末が自分で決めていた値（下の w.step）は、知らせが届くたびに捨てる
  };

  /* 1 コマ進める。now は時刻（ミリ秒。全員の端末で同じ動きになるよう、動く床は時刻から位置を決める）、
     bodies は全員の足の位置と重さ [[x, y, z, wt], …]（ふみ板を押す・くずれる床を落とす。wt は軽い箱を持っている人が 2、省くと 1）、
     grips は、だれかがにぎっているハンドルの番号 */
  w.step = (dt, now, bodies, grips = []) => {
    const loose = w.crates.filter(c => !c.held && !c.rail), mass = c => c.mass ?? (c.heavy ? 2 : 1);   // レールの箱は、どこでも重さ 0（ふみ板・ソケット・てんびん・くずれる床に数えない）
    const press = bodies.concat(loose.map(c => [c.x, c.y, c.z, mass(c)]));
    const over = (q, p) => Math.abs(q[0] - p.x) < p.w / 2 + 0.15 && Math.abs(q[2] - p.z) < p.d / 2 + 0.15 && q[1] > p.y - 0.1 && q[1] < p.y + 0.3;
    const used = new Set();                                                           // もうソケットに入っている箱（1 個の箱は、ソケット 1 つぶんにしか数えない）
    for (const p of w.plates) {
      if (p.kind === 'rail') { const c = w.crates[p.crate]; p.load = +(Math.abs(c[c.rail.axis] - c.rail[p.at]) < 0.25); }   // レールの端：箱が、その端から 0.25m 以内にある間
      else if (p.needs) {                                                             // ソケット：合う箱だけが入る。入った箱は、まん中へ寄せる（ほかの箱に重なるなら寄せない）
        const c = loose.find(c => c.tag === p.needs && !used.has(c) && over([c.x, c.y, c.z], p));
        p.load = c ? 1 : 0; used.add(c);
        if (c?.on) { const k = Math.min(1, 8 * dt), nx = c.x + (p.x - c.x) * k, nz = c.z + (p.z - c.z) * k; if (!w.blocked(nx, nz, c.y, c.box, c.s / 2, c.s)) { c.x = nx; c.z = nz; } }
      } else p.load = press.reduce((n, q) => n + (over(q, p) ? q[3] ?? 1 : 0), 0);   // のっている体と箱の重さの合計
      const ok = p.load >= (p.need || 1);
      p.lost = ok ? 0 : p.lost + dt;
      p.down = ok || (p.need > 0 && p.lost < 0.4);                                    // おもさ板は、足りなくなっても 0.4 秒は押されたまま（仲間の位置のゆれで、ちらつかないように）
      p.low = p.load < p.held ? p.low + dt : 0;                                       // 条件の load: n が見る重さ（held）も、軽くなってから 0.4 秒は前のまま
      if (p.load > p.held || p.low >= 0.4) p.held = p.load;
    }
    for (const k of w.winds) {
      const c = k.fan;                                                                // せんぷうき箱の風は、箱について回る。持っている間・落ちている間・ほかの箱や仲間の頭の上にある間は止まる
      if (c) Object.assign(k, { active: !c.held && !!c.on && !c.on.crate && !c.on.friend, x0: c.x - 1, x1: c.x + 1, z0: c.z - 1, z1: c.z + 1, y0: c.y + c.s + 0.1, y1: c.y + c.s + 3.5 });
      else k.active = w.test(k) && (!k.period || Math.floor(now / k.period) % 2 === 0);
    }
    for (const b of pads) { b.aimV = null; for (const a of b.launch.aims) if (w.test(a)) b.aimV = a.v; }   // カタパルト：条件が合うねらいのうち、最後に書いたものが勝つ
    /* 床 b（o だけずらした場所）の上にいる体の重さの合計：縁から pad の外まで、上面の below 下から 1m 上まで。
       own なら、床の縁のあたり（縁の 0.15m 中より外）にいる体は、その床に立っているか、宙に浮いている（足元 0.5m 以内に床がない）ときだけ数える。
       となりの岸に立っている人は、床のすぐそばにいても、乗っていない */
    const aboard = (b, pad, below, o = [0, 0, 0], own) => bodies.reduce((n, q) => {
      const x = q[0] - o[0], y = q[1] - o[1], z = q[2] - o[2], within = e => x > b.x0 - e && x < b.x1 + e && z > b.z0 - e && z < b.z1 + e;
      const g = own && !within(-0.15) && w.groundBox(q[0], q[2], q[1]);
      return n + (within(pad) && y > b.y1 - below && y < b.y1 + 1 && !(g && g !== b && g.y1 > q[1] - 0.5) ? q[3] ?? 1 : 0);
    }, 0);
    /* 乗ると動く床・てんびんの皿 m に乗っている体の重さ。まだだれも乗っていない間（fresh）は、せまく数える（縁から near の外まで）：横に立った人や、
       下りてくる床の下にいる人まで数えると、床が逃げては戻るのをくり返す。乗ったあとは、遅れて見える仲間も数えるよう、広く取る（縁から wide の外まで、上面の 1m 下まで）。
       行き先に着いた床の上にいるはずの体も、同じ決まりで数える（あとから入った端末や、しばらく止まっていた端末でも、床が仲間の足元へ行き、全員の端末で同じ位置になる） */
    const riders = (m, fresh, near, wide) => Math.max(aboard(m.box, fresh ? near : wide, fresh ? 0.25 : 1, undefined, !fresh), aboard(m.b, wide, 1, m.to, true));
    for (const m of w.movers) if (m.mode === 'scale') {                               // てんびんの皿の重さ（体と、のっている箱）。軽くなっても 0.6 秒は前の重さのまま
      const k = loose.reduce((n, c) => n + (c.on === m.box ? mass(c) : 0), 0), v = k + riders(m, m.wt <= k, 0.15, 0.3);
      m.low = v < m.wt ? m.low + dt : 0;
      if (v > m.wt || m.low >= 0.6) m.wt = v;
    }
    for (const m of w.movers) {
      let o;
      if (m.orbit) {                                                                  // 円を回る
        const a = (now / m.period + m.phase) * Math.PI * 2, r = m.orbit;
        o = m.plane === 'zy' ? [0, -r * Math.cos(a), r * Math.sin(a)] : [r * Math.cos(a), 0, r * Math.sin(a)];
      } else {
        const on = w.test(m);
        let target;
        if (m.mode === 'crumble') {                                                   // 乗られたら 1 秒後に落ち、3.5 秒後に戻りはじめる
          const b = m.box, stood = press.some(q => q[0] > b.x0 - 0.15 && q[0] < b.x1 + 0.15 && q[2] > b.z0 - 0.15 && q[2] < b.z1 + 0.15 && Math.abs(q[1] - b.y1) < 0.2);
          if (m.clock > 0 || stood) m.clock += dt;
          if (m.clock > 5.5) m.clock = 0;
          target = m.clock > 1 && m.clock < 3.5 ? 1 : 0;
        } else if (m.mode === 'timed') { if (on) m.until = now + m.hold; target = now < (m.until || 0) ? 1 : 0; }
        else if (m.mode === 'ride') {                                                 // 乗ると動く床：乗っている間は行き先へ。だれもいなくなって wait 秒たつと、出発点へ帰る
          const wait = m.wait ?? 1.5;
          m.wt = riders(m, m.idle > wait, -0.2, 0.6);                                      // 動き出すのは、縁から 0.2m 中まで乗ってから（近づいただけで動くと、乗る前に逃げてしまう）。動き出したあとは、0.6m はみ出ていても乗っている扱い
          m.idle = m.wt >= (m.need || 1) ? 0 : m.idle + dt;
          target = m.idle > wait ? 0 : 1;
        } else if (m.mode === 'scale') { const a = m.side === 'A' ? m : m.twin; target = +(a.wt >= 1 && a.twin.wt >= a.wt); }   // てんびん：A に荷があり、B がそれ以上に重いと、A が上がる
        else if (m.mode === 'crank') {                                                // ハンドルで巻き上げる床：だれかがつかんでいる間は進む。放すと hold 秒止まり、そのあと戻る
          if (m.handles.some(h => grips.includes(h))) { m.rel = null; m.f = Math.min(1, m.f + dt / (m.up ?? 4)); }
          else {                                                                      // 放したあとは、放したときの f と時刻（rel）だけから位置を決める（全員の端末で、同じ瞬間に戻りはじめる）
            m.rel ||= { f: m.f, t: now };                                             // 知らせがまだ届いていなければ、この端末で決めておく（届けば、w.release がそちらに替える）
            m.f = Math.max(0, Math.min(1, m.rel.f - Math.max(0, (now - m.rel.t) / 1000 - (m.hold ?? 12)) / (m.down ?? 8)));
          }
          target = m.f;                                                               // 決めた秒数どおりに動く（下の「急には動かない」は効かない）
        } else {
          const wave = 1 - Math.abs((now / (m.period || 1) % 2) - 1), smooth = wave * wave * (3 - 2 * wave);   // 行き来（端でゆっくり）
          target = m.mode === 'hold' ? +on : m.mode === 'always' || on ? smooth : 0;
        }
        const max = (m.speed || { ride: 2.5, scale: 0.8 }[m.mode] || 3.5) / Math.hypot(...m.to) * dt;   // 急には動かない（ふつうは毎秒 3.5m まで）
        m.f += Math.max(-max, Math.min(max, target - m.f));
        o = m.to.map(v => v * m.f);
      }
      o.forEach((v, i) => { m.d[i] = v - m.o[i]; }); m.o = o;
      const b = m.box, s = m.b;
      b.x0 = s.x0 + o[0]; b.x1 = s.x1 + o[0]; b.y0 = s.y0 + o[1]; b.y1 = s.y1 + o[1]; b.z0 = s.z0 + o[2]; b.z1 = s.z1 + o[2];
    }
    w.handles.forEach((h, i) => { if (h.ride != null) { const s = stage.handles[i], o = w.movers[h.ride].o; h.x = s.x + o[0]; h.y = s.y + o[1]; h.z = s.z + o[2]; } });
    for (const c of w.crates) {
      if (c.held) continue;
      const h = c.s / 2;
      if (c.rail) { c.on = w.groundBox(c.x, c.z, c.y, c.box); continue; }             // レールの箱は落ちない・元の場所へ戻らない・動く床に運ばれない（置いた所にそのままいる）。足元の床だけ覚える
      if (c.on?.m) {                                                                  // 動く床に乗っていれば一緒に動く。動かない箱の中へは運ばれない（そこに残り、床だけが先へ行く）
        const [dx, dy, dz] = c.on.m.d;
        if (!w.wall(c.x + dx, c.z + dz, c.y + dy, c.box, h, c.s)) { c.x += dx; c.y += dy; c.z += dz; }
      }
      if (c.on?.belt) { const nx = c.x + c.on.belt[0] * dt, nz = c.z + c.on.belt[1] * dt; if (!w.blocked(nx, nz, c.y, c.box, h, c.s)) { c.x = nx; c.z = nz; } }
      const g = w.footing(c.x, c.z, c.y, c.box, h, c.s), gy = g ? g.y1 : -99;
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
   drag は重い箱をつかんでいるとき：'drive' 自分が動かす／'follow' ほかの人が動かしていて、箱と一緒に引かれる／'stuck' 人数が足りず動かせない
   （solo: true の箱は 1 人で動かせる。'stuck' を渡されても動くので、呼び出し側は solo の箱に 'stuck' を出さなくてよい）。
   crank は、いま回しているハンドルの番号（なければ null）。起きたことは events にたまる（'cp' セーブ地点に着いた／'fell' 落ちてやり直し／'goal' ゴール） */
export function makePlayer(w) {
  const st = w.stage, p = { ry: 0, hvx: 0, hvz: 0, kvx: 0, kvz: 0, cp: 0, near: -1, seen: new Set([0]), events: [], frozen: false, crank: null };   // near：いま中にいるセーブ地点／seen：これまでにふれた地点
  const facing = () => [Math.sin(p.ry), Math.cos(p.ry)];
  p.facing = facing;
  // セーブ地点の真上、空から落ちてくる
  p.respawn = () => {
    const c = st.cps[p.cp];
    p.grabEnd(); Object.assign(p, { x: c.x + (Math.random() - 0.5), y: c.y + 14, z: c.z + (Math.random() - 0.5), vy: 0, grounded: false, on: null, hvx: 0, hvz: 0, kvx: 0, kvz: 0 });
  };
  const die = () => { p.respawn(); p.events.push('fell'); };
  p.jump = () => { if (p.grounded && !p.hang && !p.frozen) { p.vy = JUMP; p.grounded = false; } };

  // 目の前の縁にぶら下がる。縁がなければ壁に張りつく（あみなら登れる。ふつうの壁に張りつくのは flat のときだけ）
  const cling = flat => {
    const [fx, fz] = facing(), edge = w.ledge(p.x, p.z, p.y, fx, fz), wall = edge ? null : w.blocked(p.x + fx * 0.6, p.z + fz * 0.6, p.y);
    if (edge) p.hang = { b: edge };
    else if (wall) {
      const out = [wall.z0 - p.z, p.z - wall.z1, wall.x0 - p.x, p.x - wall.x1], k = out.indexOf(Math.max(...out));   // いま向き合っている面（南・北・西・東の順）
      const x = k === 2 ? wall.x0 - R - 0.05 : k === 3 ? wall.x1 + R + 0.05 : p.x, z = k === 0 ? wall.z0 - R - 0.05 : k === 1 ? wall.z1 + R + 0.05 : p.z;   // その面のすぐ前
      // あみの真下や中にいて、面のすぐ前まで 0.6m より遠いときは、つかまない（そこまで寄せると、間にある壁を飛びこえてしまう）
      const climb = !!wall.climb && (wall.climbFaces || 'snwe').includes('snwe'[k]) && Math.abs(x - p.x) + Math.abs(z - p.z) <= 0.6;
      if (!climb && !flat) return;
      p.hang = { b: wall, flat: true, climb };
      if (climb) {                                                                    // あみには、まっすぐ向き合い、面のすぐ前へ寄る（遠めからつかんでも、てっぺんに手が届くように）
        p.ry = [0, Math.PI, Math.PI / 2, -Math.PI / 2][k];
        if (!w.blocked(x, z, p.y)) { p.x = x; p.z = z; }
      }
    }
    if (p.hang) { p.vy = 0; p.grounded = false; p.on = null; }                       // つかまったら、足は地面を離れた扱い（下の床に運ばれない・下ののこぎりに当たらない・跳べない）
  };

  /* つかむ（押している間ずっと）：目の前のハンドル → 回す／目の前の箱 → 持つ（重い箱は押し引き）／登れる縁 → ぶら下がる（前へ倒すとよじ登る）／壁 → 張りつく（あみは登れる）。
     戻り値は、つかんだ箱（なければ null） */
  p.grabStart = () => {
    if (p.grab || p.frozen) return null;
    p.grab = true;
    const [fx, fz] = facing();
    if (p.grounded) for (const [i, h] of w.handles.entries()) {                      // ハンドルが先（そばに箱があっても、ハンドルを回す。箱を取りたければ、箱のほうを向く）
      const dx = h.x - p.x, dz = h.z - p.z, d = Math.hypot(dx, dz);
      if (d < 1 && Math.abs(h.y - p.y) < 1 && (dx * fx + dz * fz) / d > 0.5) { p.crank = i; return null; }
    }
    if (p.grounded) for (const c of w.crates) {                                     // 箱をつかむのは地面にいるときだけ（跳んでつかめば、箱の縁をよじ登れる）
      const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz);
      if (!c.held && d < c.s / 2 + 0.95 && (dx * fx + dz * fz) / d > 0.5 && Math.abs(c.y - p.y) < 1.2 && w.groundBox(p.x, p.z, p.y) !== c.box) {
        p.carry = c; p.off = [p.x - c.x, p.z - c.z]; if (!c.heavy) c.held = 'me';
        return c;
      }
    }
    cling(p.grounded);                                                               // 空中では、ふつうの壁には張りつかない（早めに押しても、縁に届くまで待てるように）
    return null;
  };
  // 放す。持っていた軽い箱は目の前（ふさがっていれば後ろ）に置く。戻り値は、放した箱
  p.grabEnd = () => {
    const c = p.carry; p.grab = false; p.hang = null; p.carry = null; p.crank = null;
    if (c && !c.heavy) {
      const [fx, fz] = facing();
      // 斜めを向いていても体と重ならない距離に置く（重なると、箱にはさまって動けなくなる）。そこまでの途中もふさがっていないこと（うすい壁の向こうへは置かない）
      for (const k of [0.95, -0.95]) { c.x = p.x + fx * k; c.z = p.z + fz * k; if (![1, 0.5].some(t => w.blocked(p.x + fx * k * t, p.z + fz * k * t, c.y, c.box, c.s / 2, c.s))) break; }
      c.held = null; c.vy = 0; c.moved = true; w.fit(c);
    }
    return c || null;
  };

  p.step = (dt, mx, mz, drag = 'drive') => {
    if (p.frozen) { p.hvx = p.hvz = 0; p.walk = false; return; }                     // 仲間に持ち上げられている間は、呼び出し側が位置を決める
    const d = (p.on || p.hang?.b)?.m?.d;                                             // 動く床に乗っている・ぶら下がっていれば一緒に動く。動かない箱の中へは運ばれない（横は、床の上をすべる。上は、そこに残って床がすり抜ける）
    if (d) {
      if (d[0] && !w.wall(p.x + d[0], p.z, p.y)) p.x += d[0];
      if (d[2] && !w.wall(p.x, p.z + d[2], p.y)) p.z += d[2];
      if (d[1] <= 0 || !w.wall(p.x, p.z, p.y + d[1])) p.y += d[1];
    }
    const far = p.carry;                                                             // つかんでいる重い箱が、つかめる距離より遠くへ離れても、手が離れる（床に運ばれながら、遠くのレバーを動かせないように）
    if (far?.heavy && (Math.hypot(far.x - p.x, far.z - p.z) > far.s / 2 + 1 || Math.abs(far.y - p.y) > 1.2)) p.grabEnd();
    const h = w.handles[p.crank];                                                    // ハンドルが 1m より遠く（横か、高さ）へ離れたら、手が離れる（つかめる距離と同じ）
    if (h && (Math.hypot(h.x - p.x, h.z - p.z) > 1 || Math.abs(h.y - p.y) > 1)) { p.crank = null; p.grab = false; }
    if (p.on?.belt && !w.blocked(p.x + p.on.belt[0] * dt, p.z + p.on.belt[1] * dt, p.y)) { p.x += p.on.belt[0] * dt; p.z += p.on.belt[1] * dt; }   // ベルトに運ばれる
    const hit = w.blocked(p.x, p.z, p.y);                                            // 動く床や壁に押されたら、その動きのぶん押し出される
    if (hit?.m) {
      if (hit.m.crush && hit.m.d[1] < -1e-4 && p.grounded && hit.y0 > p.y + 0.3) return die();   // 上から下りてきたプレス機（crush: true）と地面にはさまれた。ほかの動く床は、体をすり抜ける
      if (!w.blocked(p.x + hit.m.d[0], p.z + hit.m.d[2], p.y, hit)) { p.x += hit.m.d[0]; p.z += hit.m.d[2]; }   // 壁の中へは押しこまない
    }
    if (p.grab && !p.hang && !p.carry && p.crank == null && !p.grounded) cling(false);                // 空中で「つかむ」を押している間は、縁やあみに届いたとたんにつかまる

    const [fx, fz] = facing(), len = Math.hypot(mx, mz), input = len > 0.05 && !p.hang;
    const heavy = p.carry?.heavy ? p.carry : null;
    // めり込んでいる箱 hit の、いちばん近い面までの深さ（これが減る向きへは、いつでも出られる）
    const depth = (x, z) => Math.min(x - hit.x0, hit.x1 - x, z - hit.z0, hit.z1 - z);
    if (p.hang?.climb) {                                                              // あみ：前後で上り下り、左右で横へ動く
      const b = p.hang.b, u = mx * fx + mz * fz, s = mx * fz - mz * fx, nx = p.x + fz * s * dt, nz = p.z - fx * s * dt, ny = p.y + 1.2 * u * dt, qx = nx + fx * 0.6, qz = nz + fz * 0.6;
      const off = qx <= b.x0 - R || qx >= b.x1 + R || qz <= b.z0 - R || qz >= b.z1 + R || b.y0 >= ny + BODY;   // あみの横か下へ外れる
      p.hvx = p.hvz = 0;
      if ((off || ny + 0.4 < b.y1) && [null, b].includes(w.blocked(nx, nz, ny))) { p.x = nx; p.y = ny; p.z = nz; if (off) p.hang = null; }   // 外れたら、手を放して落ちる
      const top = p.hang && w.ledge(p.x, p.z, p.y, fx, fz);
      if (top) p.hang = { b: top };                                                   // てっぺんに手が届いたら、ふつうのぶら下がりへ（そのまま前へ倒せばよじ登る）
      else if (p.hang && u < 0 && p.y <= w.floorY(p.x, p.z, p.y)) { p.hang = null; p.grounded = true; }   // 下りきって、足が地面についた
    } else if (p.hang) {
      p.hvx = p.hvz = 0;
      if (!p.hang.flat && (mx * fx + mz * fz) > 0.3) {                                // 前へ倒している間、体をゆっくり引き上げる
        p.y += 1.6 * dt;
        if (p.y >= p.hang.b.y1) { p.y = p.hang.b.y1; p.x += fx * 0.65; p.z += fz * 0.65; p.hang = null; p.vy = 0; p.grounded = true; }
      }
    } else if (p.crank != null) p.hvx = p.hvz = p.kvx = p.kvz = 0;                   // ハンドルを回している間は、歩かない・向きも変えない（乗っている床には運ばれる）
    else if (heavy && drag === 'follow') {                                           // ほかの人が動かしている重い箱に、つかんだまま引かれていく
      p.hvx = p.hvz = 0; p.x = heavy.x + p.off[0]; p.z = heavy.z + p.off[1];
    } else {
      const speed = heavy ? (drag === 'stuck' && !heavy.solo ? 0 : 1.2) : p.carry ? 2.3 : SPEED, rail = heavy?.rail;   // solo の箱は、人数が足りなくても 1 人で動かせる
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
          const to = axis ? heavy.z + az : heavy.x + ax;                              // レールの箱は、レールの向きにだけ、端から端までしか進まない
          if (rail && ((rail.axis === 'x') === !!axis || to < rail.min || to > rail.max)) continue;
          if (w.blocked(heavy.x + ax, heavy.z + az, heavy.y, heavy.box, heavy.s / 2, heavy.s) || w.blocked(p.x + ax, p.z + az, p.y, heavy.box)) continue;
          heavy.x += ax; heavy.z += az; heavy.moved = true; w.fit(heavy);
        } else if (w.blocked(p.x + ax, p.z + az, p.y, hit && (hit.crate || hit.friend || depth(p.x + ax, p.z + az) <= depth(p.x, p.z)) ? hit : undefined)) continue;   // 箱や仲間にめり込んでいたら、それは無視して抜け出せる。壁や動く床からは、奥へ向かわない向きへだけ動ける（面に沿って横へも出られる：動く床と壁の間にはさまれたとき）
        p.x += ax; p.z += az;
      }
      const decay = Math.exp(-dt * (p.grounded ? 4.5 : 0.8)); p.kvx *= decay; p.kvz *= decay;   // 打ち出された勢いは、空中ではあまり落ちない
    }
    p.walk = Math.hypot(p.hvx, p.hvz) > 0.4;

    // 上下動：歩いているだけなら足元の面に沿う。足元がなくなれば落ち、跳べば上がる。風の中では吹き上げられる
    const blow = !p.hang && w.windAt(p.x, p.y, p.z);
    if (blow?.up) { p.vy = Math.min(blow.up, p.vy + 28 * dt); p.grounded = false; }
    if (blow?.push && p.crank == null && !w.blocked(p.x + blow.push[0] * dt, p.z + blow.push[1] * dt, p.y)) { p.x += blow.push[0] * dt; p.z += blow.push[1] * dt; }   // 横風に流される
    const g = w.footing(p.x, p.z, p.y), gy = g ? g.y1 : -99;
    if (!p.hang) {
      if (p.grounded && p.vy <= 0 && p.y - gy < 0.45) p.y = gy;
      else { p.vy -= GRAV * dt; p.y += p.vy * dt; p.grounded = p.y <= gy; if (p.grounded) { p.y = gy; p.vy = 0; } }
      if (p.grounded && g?.bounce) { p.vy = g.bounce; p.grounded = false; }           // トランポリン
      const shot = p.grounded && (g?.fling || g?.aimV);                               // 大砲台・カタパルト（カタパルトは、条件が合っている間だけ）
      if (shot) { [p.kvx, p.vy, p.kvz] = shot; p.grounded = false; }
    }
    p.on = p.grounded ? g : null;
    if (!p.grounded) { p.crank = null; if (p.carry?.heavy) p.grabEnd(); }            // 地面を離れたら、ハンドルからも重い箱からも手が離れる（つかんだまま飛ぶと、箱を空中で引きずる）
    p.falling = !p.grounded && !p.hang && p.vy < -8;                                 // 長く落ちている（空から落ちてくる姿勢にする）
    if (p.carry && !p.carry.heavy) { const c = p.carry, [ax, az] = facing(); c.x = p.x + ax * 0.75; c.y = p.y + 0.55; c.z = p.z + az * 0.75; }

    // 落ちた・のこぎりにさわった（乗った）→ セーブ地点からやり直し
    if (p.y < st.kill || (p.grounded && g?.hurt) || w.blocked(p.x, p.z, p.y, undefined, R + 0.08)?.hurt) return die();
    p.warpT = Math.max(0, (p.warpT || 0) - dt);
    if (p.grounded && !p.warpT) for (const k of w.warps) {                            // ワープ台（続けて飛ばないよう、着いてから 1.5 秒は働かない）
      if (Math.hypot(k.x - p.x, k.z - p.z) > 0.8 || Math.abs(k.y - p.y) > 0.5) continue;
      if (p.carry?.heavy) p.grabEnd();
      [p.x, p.y, p.z] = k.to; p.hvx = p.hvz = 0; p.warpT = 1.5; p.on = null; p.events.push('warp');
      break;
    }
    if (p.grounded) {
      const i = st.cps.findIndex(c => Math.hypot(c.x - p.x, c.z - p.z) < (c.r || 2.2) && Math.abs(c.y - p.y) < 1);
      if (i !== p.near) {                                                             // 入った瞬間だけ：最後にふれたセーブ地点が、やり直しの場所になる（前の地点へ戻ってもよい）
        p.near = i;
        if (i >= 0) { p.seen.add(i); if (i !== p.cp) { p.cp = i; p.events.push('cp'); } }
      }
      if (!p.done && Math.hypot(st.goal.x - p.x, st.goal.z - p.z) < 1.6 && Math.abs(st.goal.y - p.y) < 1) { p.done = true; p.events.push('goal'); }
    }
  };
  p.respawn();
  return p;
}

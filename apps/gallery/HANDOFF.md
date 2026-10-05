# 引き継ぎメモ

作業フォルダ: `C:\Users\LogicArt\Desktop\gallery`

---

## 1. ファイル構成

| ファイル | 役割 | 状態 |
|---|---|---|
| `poker-game.html` | ポーカーゲーム本体 | 修正済み |
| `daifugo.html` | 大富豪ロビー＋ルール設定画面 | 作成済み |
| `daifugo-rules.js` | 大富豪ルール定義・エンコード（daifugo.htmlが読み込む） | 作成済み |
| `daifugo-game.html` | 大富豪ゲーム本体 | **未作成（次のタスク）** |

---

## 2. poker-game.html の変更内容

### じゃんけん廃止
- じゃんけん機能（CSS / HTML / 関数すべて）を削除
- カード交換順は**ランダム自動決定**に変更
- `shufflePids(pids)` でシャッフル → `exchangeOrder` にセット
- ゲーム開始・次ラウンド開始ともにランダム順

### 修正されたバグ
- `_chooseJanken` で `update()` に文字列を渡していた → `set()` に修正
- `jankenCheckPending` フラグを `await` の後に設定していた → 前に移動
- `gs.pids` が Firebase からオブジェクトで返る場合に `.every()` が失敗 → `Array.isArray` ガード追加

---

## 3. daifugo.html / daifugo-rules.js の内容

### 概要
- Firebase Realtime Database 使用（パス: `rooms_daifugo/{code}`）
- 最大6人、カジノグリーンテーマ
- ホストのみルール変更可、非ホストは閲覧のみ
- ルールID（12文字）でルール設定を共有できる（nanaRevo追加で37bit→hex10文字）

### ファイル分割の注意点
`daifugo-rules.js` は **ESモジュールではなく** `window.DaifugoRules` にグローバル公開している。
理由: `file://` プロトコルで直接HTMLを開く場合に `import` が動かないため。

```html
<!-- daifugo.html での読み込み方 -->
<script src="daifugo-rules.js"></script>
<script type="module">
  const { DEFAULT_RULES, CATEGORIES, SUB_ITEMS, encodeRuleId, decodeRuleId } = window.DaifugoRules;
</script>
```

### ルール設定画面のカテゴリ（表示順）

| 行 | カテゴリ |
|---|---|
| 1 | 革命・階段・縛り |
| 2 | 8切り・11バック・禁止あがり |
| 3 | 都落ち・Joker効果・9リバース |
| 4 | 5スキップ・7渡し・10捨て |
| 5 | 12ボンバー・カード交換 |

### ルールID形式
- **12文字**: 10 hex chars（37 bool bits）+ 2 decimal digits（3ステート値）
- 3ステート部: `cardExchange[0-2]*9 + forbiddenWin2[0-2]*3 + forbiddenWinJoker[0-2]`（max 26）
- 旧形式（9文字・10文字・11文字）の後方互換読み込みあり

### 各ルールキー一覧（RULE_BOOL_KEYS 順）

```
bits 0-7:  revolution, revolutionReturn, revolutionOptional, stairRevolution,
           coudetar, omen, emperor, revolutionJoker
bit 8:     nanaRevo
bits 9-11: stair, stairEffect, stairStackable
bits 12-14: markShibari, numberShibari, bothShibari
bits 15-20: eightCut, fourStop, sandstorm, ambulance, rokuro, spadeThree
bit 21:    elevenBack
bits 22-25: forbiddenWin, forbiddenWin8, forbiddenWinSpade3, forbiddenWin3Rev
bits 26-31: jokerEffect, nineReverse, fiveSkip, sevenPass, tenDiscard, queenBomber
bits 32-33: toshiochi, gekokujo
bits 34-36: poorCardChoice, noJokerExchange, tenpenchi
3ステート: cardExchange('off'/'simultaneous'/'receive-first'), forbiddenWin2, forbiddenWinJoker
```

### 革命カテゴリのサブ設定

| キー | 内容 | 依存 |
|---|---|---|
| `revolution` | 革命（4枚出しで強弱逆転） | — |
| `revolutionReturn` | 革命返し可能 | revolution ON |
| `revolutionOptional` | 革命するかどうか選択できる | revolution ON |
| `stairRevolution` | 階段革命（4枚以上の階段で発動） | revolution + stair ON |
| `coudetar` | クーデター（9×3枚） | revolution ON |
| `omen` | オーメン（6×3枚、以降革命禁止） | revolution ON |
| `emperor` | エンペラー（全マーク含む連続4枚） | revolution ON |
| `revolutionJoker` | ジョーカー含み革命（3枚+Joker） | revolution ON |
| `nanaRevo` | ナナサン革命（7×3枚） | revolution ON |

### 階段カテゴリのサブ設定

| キー | 内容 | 依存 |
|---|---|---|
| `stair` | 階段（同マーク連続3枚以上） | — |
| `stairStackable` | ON=場の最小値より大きい最小値の階段を出せる / OFF=場の最大値より大きい最小値の階段しか出せない | stair ON |
| `stairEffect` | 階段中のカード効果発動 | stair ON |

### カード交換カテゴリのサブ設定

| キー | 内容 |
|---|---|
| `cardExchange` | OFF / ON同時 / ONもらってから渡す（3択） |
| `poorCardChoice` | 大貧民・貧民も渡すカードを自分で選べる |
| `noJokerExchange` | Jokerを交換対象外にする |
| `tenpenchi` | 天変地異（カード交換後に大貧民↔大富豪・貧民↔富豪の手札を全交換） |

---

## 4. 大富豪ゲーム仕様（daifugo-game.html 実装待ち）

### UIレイアウト
- 自分は画面下、他プレイヤーは左・上・右に配置
- カードはグラフィカルなカード画像（マークと数字を大きく見やすく）
- 5ラウンド終了後は結果画面を表示
  - 全員に「ロビーに戻る」ボタンを表示
  - 非ホスト：ロビーに戻ると「ホストが開始するまで待機」表示
  - ホスト：ロビーに戻ると「ゲームを開始する」ボタンを表示（daifugo.htmlの待機画面と同じフロー）

### 基本仕様
- プレイヤー: 2〜6人
- ラウンド数: 5ラウンド
- カード: 54枚（Joker 2枚含む）
- 手番: ダイヤの3を持つプレイヤーから開始（全ラウンド共通）
- ポイント: 順位点（大富豪+2 / 富豪+1 / 平民0 / 貧民-1 / 大貧民-2 / 失格は確定順位のポイント）
- 同点: 同順位（例：2人が同点2位なら2人とも2位、次は4位）
- UIテーマ: ブラック＆レッド（背景ほぼ黒、アクセント赤）
- フォント: Kaisei Decol（タイトル）+ Noto Sans JP（本文）

### 階級

| 順位 | 名称 |
|---|---|
| 1位 | 大富豪 |
| 2位 | 富豪 |
| 中間 | 平民（3人以上の場合） |
| 下から2位 | 貧民 |
| 最下位 | 大貧民 |

### カードの強さ（通常時）
弱 3-4-5-6-7-8-9-10-J-Q-K-A-2-Joker 強

### Jokerのルール
- 単体で出せる（最強）
- スペード3返しON時のみ ♠3 で返せる（場が流れる）
- Joker+同数字3枚 = 4枚出し扱い（ジョーカー含み革命ONで革命）
- 階段でJokerをワイルドカードとして補完に使える（例：♥3・♥4・Joker → ♥3-4-5の階段）
- Joker効果ON時：7渡し・10捨て・Qボンバーの上限+1枚

### 手札表示
- 自分の手札のみ表示
- セキュリティルールは全公開（UI上で他者の手札は見えない）

### カード交換
- ラウンド1は交換なし
- 大富豪 ↔ 大貧民: 2枚交換
- 富豪 ↔ 貧民: 1枚交換
- 交換方式はルール設定に従う（同時 or もらってから渡す）
- 大貧民・貧民: 最弱カードが自動で渡る（選択不可）
- 富豪・大富豪: 任意のカードを選んで返す
- poorCardChoice ONの場合のみ: 大貧民・貧民も渡すカードを自分で選べる

### 天変地異
- カード交換後に**大貧民の手札が10以下のカードしかない場合**に自動発動
- 大貧民 ↔ 大富豪 の手札を全交換
- 貧民 ↔ 富豪 の手札を全交換

### 都落ち（toshiochi ON時）
- 前ラウンドの大富豪が今ラウンドで1位でないと確定した瞬間（誰かが先に1位通過）にリタイア
- リタイアは大貧民から順に埋まる（2人目は貧民、3人目は平民...）

### 下剋上（gekokujo ON時）
- 前ラウンドの大貧民が1位通過した瞬間にラウンド終了
- 次ラウンドの階級は前ラウンドの位置をそのまま全入れ替え
  - 大貧民 ↔ 大富豪 / 貧民 ↔ 富豪 / 平民 → 平民
- 禁止あがりで既にリタイア割り当てがあっても下剋上が上書きして全入れ替え適用

### リタイア（禁止あがり・都落ち・切断）
- リタイアは大貧民から順に埋まる（発生順）
- 下剋上が発生した場合は全てリセットして入れ替えを適用
- **切断検知**: Firebase onDisconnect で検知 → 即リタイア扱い
  - 残りプレイヤーでゲーム継続
  - 次ラウンドから参加プレイヤーリストより除外
  - スコアは残す
- 残り1人になったらゲーム終了 → 結果画面表示

### 禁止あがりの詳細

**2あがり禁止（forbiddenWin2）**
- OFF：制限なし
- やさしい：2のみであがると失格。階段・エンペラー等2以外の数字を含む出し方であがった場合は失格にならない
- ON：2を含む出し方であがると全て失格（階段・エンペラー等も含む）

**Jokerあがり禁止（forbiddenWinJoker）**
- OFF：制限なし
- やさしい：Jokerのみであがると失格。他の数字を含む出し方であがった場合は失格にならない
- ON：Jokerを含む出し方であがると全て失格

**8あがり禁止（forbiddenWin8）**
- 8のみ（単体・複数枚）であがると失格
- 階段等8以外の数字を含む出し方であがった場合は失格にならない

**♠3あがり禁止（forbiddenWinSpade3）**
- ♠3のみであがると失格

### 3あがり禁止（forbiddenWin3Rev）
- 革命中またはイレブンバック中に3で上がると失格（両方に適用）

### パスのルール
- 一度パスすると次に場が流れるまで出せない
- 失格プレイヤーは永遠にパス（自動スキップ）
- 全員パスしたら場が流れ、最後に出したプレイヤーの次の人から開始

### しばりルール
- **数字縛り**: 連続した数字を2回続けて出すと発動。場が流れるまで続きの数字しか出せない
  - 例：5→6と出ると縛り発動 → 次は7、その次は8...（場が流れるまで継続）
  - 革命中は逆順（例：8→7で発動 → 次は6しか出せない）
  - 縛り中にパスしても縛りは解除されず次のプレイヤーに引き継がれる
- **マーク縛り**: 同じマークを2回続けて出すと発動。以降そのマークしか出せない
  - 例：♥5→♥9と出ると縛り発動 → 以降♥しか出せない
- **両縛り（激縛り）**: マークと数字の両方が縛られる
  - 例：♥5→♥6と出ると縛り発動 → 次は♥7しか出せない
- 複数枚出しでも判定（例：♥5+♠5 → ♥6+♠6 で両縛り発動 → 次は♥7+♠7のみ）
- 場が流れると縛り解除

### 5スキップ
- 5を出した枚数分、次のプレイヤーをスキップ
- 例：5×2枚 → 次の2人がスキップされる

### 9リバース
- 9を出すと手番の順序が逆回転
- 次に9が出るたびにトグル（逆転↔通常）
- 場が流れると解除（通常に戻る）

### イレブンバック
- Jを出すと場が流れるまで強弱逆転
- 場流れで解除（場を流した本人が次の手番）

### 7渡し
- 渡す枚数は出した7の枚数が上限（1枚〜出した7の枚数まで自由に選べる）
- 渡すカードの種類も自分で選ぶ
- Joker効果ONで上限+1枚

### 10捨て
- 捨てる枚数は出した10の枚数が上限（1枚〜出した10の枚数まで自由に選べる）
- 捨てるカードは自分で選ぶ
- Joker効果ONで上限+1枚

### QボンバーB（12ボンバー）
- Q×n枚 → n種類の数字を宣言 → 全員がその数字のカードをすべて捨てる
- Joker効果ONで宣言できる数字+1種類

### スペード3返し
- Joker単体に対してのみ ♠3 で返せる
- ♠3を出すと場が流れ、出したプレイヤーが次の手番

### 4止め
- 4×2枚で場が流れる + 出したプレイヤーが次の手番

### 砂嵐・救急車・ろくろ首
- 砂嵐：3×3枚で場が流れる + 出したプレイヤーが次の手番（**場の強さに関係なく常に出せる**）
  - ただしオーメン発動中は砂嵐の効果が無効（通常の3×3枚出しとして扱う）
  - 場を流すだけで革命・イレブンバックなどの継続効果は解除しない
  - 8切り・4止めが出ている場に重ねて出せる
- 救急車：9×2枚で場が流れる + 出したプレイヤーが次の手番
- ろくろ首：6×2枚で場が流れる + 出したプレイヤーが次の手番

### 8切り
- 8を出すと場が流れる + 出したプレイヤーが次の手番
- Jokerを含む8切りは通常の8切りと同じ（追加効果なし）

---

## 5. Firebase 構造

```
rooms_daifugo/{code}/
  code: string
  status: 'waiting' | 'playing' | 'finished'
  host: pid
  players: { [pid]: { name, index, ready } }
  rules: { ...DEFAULT_RULES }
  createdAt: number

  game/
    round: number              // 現在のラウンド (1-5)
    turn: pid                  // 現在の手番
    direction: 1 | -1          // 手番の順序（9リバース用）
    turnOrder: [pid]           // 手番順リスト
    field: [{ suit, number }]  // 場のカード
    fieldPid: pid              // 場を出したプレイヤー
    passCount: number          // 連続パス数
    revolution: bool           // 革命中
    elevenBack: bool           // イレブンバック中
    shibari: null | { type: 'mark'|'number'|'both', value }  // 縛り状態
    rankings: [pid]            // 前ラウンドの順位順
    scores: { [pid]: number }  // 累計ポイント
    finished: [pid]            // あがり順
    disqualified: [pid]        // 失格順（1人目→大貧民、2人目→貧民...）
    forbidden: { [pid]: bool } // 永遠パス状態
    phase: 'exchange' | 'playing' | 'result'

  hands/{pid}: [{ suit, number }]   // 各自の手札（自分のみ参照）

  exchange/
    offers/{pid}: [{ suit, number }]  // 渡すカード（確定分）

rooms_poker/{code}/
  （既存の構造を維持）
```

---

## 6. 次のタスク

1. **daifugo-game.html を作成** — 大富豪ゲーム本体
   - daifugo.html の `hostStartGame()` から遷移
   - daifugo-rules.js を同様に `<script src>` で読み込む
   - ゲームロジック全実装（手札管理・出せるカード判定・ターン管理・ルール適用）
   - UIテーマ: ブラック＆レッド

2. **index.html に大富豪へのリンクを追加**

// ===================================================
//  daifugo-rules.js
//  大富豪 ルール定義・エンコード/デコード
//  ※ ES module ではなくグローバル変数として公開
// ===================================================

// ------- デフォルト値 -------
const DEFAULT_RULES = {
  // 革命
  revolution: false,
  revolutionReturn: false,
  revolutionOptional: false,
  stairRevolution: false,
  coudetar: false, omen: false, emperor: false, revolutionJoker: false, nanaRevo: false,
  // 階段
  stair: false, stairEffect: false, stairStackable: false,
  // 縛り
  markShibari: false, numberShibari: false, bothShibari: false,
  // 8切り系
  eightCut: false, fourStop: false, sandstorm: false,
  ambulance: false, rokuro: false, spadeThree: false,
  // 11バック
  elevenBack: false,
  // 禁止上がり
  forbiddenWin: false, forbiddenWin2: 'off', forbiddenWinJoker: 'off',
  forbiddenWin8: false, forbiddenWinSpade3: false, forbiddenWin3Rev: false,
  // 特殊カード効果
  jokerEffect: false, nineReverse: false, fiveSkip: false,
  sevenPass: false, tenDiscard: false, queenBomber: false,
  // 階級変動
  toshiochi: false, gekokujo: false,
  // カード交換
  cardExchange: 'off', poorCardChoice: false, noJokerExchange: false, tenpenchi: false,
};

// ------- bool キー (bit 順) 合計36個 → 9 hex chars -------
const RULE_BOOL_KEYS = [
  // bits 0-7: 革命
  'revolution','revolutionReturn','revolutionOptional','stairRevolution',
  'coudetar','omen','emperor','revolutionJoker','nanaRevo',
  // bits 8-10: 階段
  'stair','stairEffect','stairStackable',
  // bits 11-13: 縛り
  'markShibari','numberShibari','bothShibari',
  // bits 14-19: 8切り系
  'eightCut','fourStop','sandstorm','ambulance','rokuro','spadeThree',
  // bit 20: 11バック
  'elevenBack',
  // bits 21-24: 禁止上がり
  'forbiddenWin','forbiddenWin8','forbiddenWinSpade3','forbiddenWin3Rev',
  // bits 25-30: 特殊カード効果
  'jokerEffect','nineReverse','fiveSkip','sevenPass','tenDiscard','queenBomber',
  // bits 31-32: 階級変動
  'toshiochi','gekokujo',
  // bits 33-35: カード交換 bool部
  'poorCardChoice','noJokerExchange','tenpenchi',
];

// ------- 3ステート値マッピング -------
const CARD_EX_MAP  = { 'off':0, 'simultaneous':1, 'receive-first':2 };
const CARD_EX_RMAP = ['off','simultaneous','receive-first'];
const THREE_MAP    = { 'off':0, 'yasashii':1, 'on':2 };
const THREE_RMAP   = ['off','yasashii','on'];

// ------- エンコード: ルール → 11文字ID -------
// 9 hex (36 bool bits) + 2 decimal (3ステート, max 26)
function encodeRuleId(r) {
  let n = 0n;
  RULE_BOOL_KEYS.forEach((k, i) => { if (r[k]) n |= (1n << BigInt(i)); });
  const hexPart = n.toString(16).toUpperCase().padStart(9, '0');
  const ce  = CARD_EX_MAP[r.cardExchange] ?? 0;
  const fw2 = THREE_MAP[r.forbiddenWin2]  ?? 0;
  const fwj = THREE_MAP[r.forbiddenWinJoker] ?? 0;
  const t   = ce * 9 + fw2 * 3 + fwj;
  return hexPart + t.toString().padStart(2, '0');
}

// ------- デコード (後方互換あり) -------
function decodeRuleId(id) {
  if (!id || id.length < 9) return null;
  try {
    const result = { ...DEFAULT_RULES };
    if (id.length >= 11) {
      const n = BigInt('0x' + id.slice(0, 9));
      RULE_BOOL_KEYS.forEach((k, i) => { result[k] = !!(n & (1n << BigInt(i))); });
      const t   = parseInt(id.slice(9)) || 0;
      result.cardExchange      = CARD_EX_RMAP[Math.floor(t / 9)] ?? 'off';
      const rem = t % 9;
      result.forbiddenWin2     = THREE_RMAP[Math.floor(rem / 3)] ?? 'off';
      result.forbiddenWinJoker = THREE_RMAP[rem % 3] ?? 'off';
    } else {
      // legacy 8hex + 1-2digits
      const legacyKeys = [
        'revolution','coudetar','omen','emperor','revolutionJoker',
        'stair','stairEffect',
        'markShibari','numberShibari','bothShibari',
        'eightCut','fourStop','sandstorm','ambulance','rokuro','spadeThree',
        'elevenBack',
        'forbiddenWin','forbiddenWin8','forbiddenWinSpade3','forbiddenWin3Rev',
        'jokerEffect','nineReverse','fiveSkip','sevenPass','tenDiscard','queenBomber',
        'toshiochi','gekokujo','tenpenchi','poorCardChoice','noJokerExchange',
      ];
      const n = BigInt('0x' + id.slice(0, 8));
      legacyKeys.forEach((k, i) => { result[k] = !!(n & (1n << BigInt(i))); });
      const t = parseInt(id.slice(8)) || 0;
      if (id.length >= 10) {
        result.cardExchange      = CARD_EX_RMAP[Math.floor(t / 9)] ?? 'off';
        const rem = t % 9;
        result.forbiddenWin2     = THREE_RMAP[Math.floor(rem / 3)] ?? 'off';
        result.forbiddenWinJoker = THREE_RMAP[rem % 3] ?? 'off';
      } else {
        result.forbiddenWin2     = THREE_RMAP[Math.floor(t / 3)] ?? 'off';
        result.forbiddenWinJoker = THREE_RMAP[t % 3] ?? 'off';
      }
    }
    return result;
  } catch (e) { return null; }
}

// ------- カテゴリ一覧 -------
const CATEGORIES = [
  {
    id:'revolution', name:'革命',
    catDesc:'4枚同数字を一度に出すと強弱が逆転するルール群。\n例：ふだん最強の「2」が最弱になり「3」が最強になる。革命返しをONにすると、革命中にさらに4枚出すと元の強さに戻る。',
    keys:['revolution','revolutionReturn','revolutionOptional','stairRevolution','coudetar','omen','emperor','revolutionJoker','nanaRevo'],
  },
  {
    id:'stair', name:'階段',
    catDesc:'同じマークで連続した数字を3枚以上同時に出せるルール。\n例：♥3・♥4・♥5 の3枚を一気に出せる。\n「重ねられる」ONにすると階段の場には階段でしか返せない。OFFにすると階段を出したら場が流れる。',
    keys:['stair','stairEffect','stairStackable'],
  },
  {
    id:'shibari', name:'縛り',
    catDesc:'同じマークや数字を2回連続で出すと「縛り」が発動し、以降その条件を満たすカードしか出せなくなるルール。\n例：♠マークを2回連続で出すと♠縛り発動。場が流れると縛りは解除される。',
    keys:['markShibari','numberShibari','bothShibari'],
  },
  {
    id:'eightcut', name:'8切り',
    catDesc:'特定のカードで場を強制的に流すルール群。出したプレイヤーが次の手番を得る。\n例：8を1枚出すだけで場が流れ、次も自分から始まる。',
    keys:['eightCut','fourStop','sandstorm','ambulance','rokuro','spadeThree'],
  },
  {
    id:'elevenback', name:'11バック',
    catDesc:'Jを出すと「イレブンバック」が発動し、その場が流れるまでの間だけ強弱が逆転するルール。\n例：発動中は3が最強・2が最弱になる。次に場が流れると自動で解除される。',
    keys:['elevenBack'],
  },
  {
    id:'forbidden', name:'禁止あがり',
    catDesc:'特定のカードで「あがり」することを禁止するルール。禁止カードで上がろうとすると失格（永遠にパス）になる。\n例：2あがり禁止がONの場合、2を出して手札が0になってもあがりと認められない。',
    keys:['forbiddenWin','forbiddenWin2','forbiddenWinJoker','forbiddenWin8','forbiddenWinSpade3','forbiddenWin3Rev'],
  },
  {
    id:'toshiochi', name:'都落ち',
    catDesc:'前ラウンドの大富豪が1位でなければ大貧民に降格するルール。\n例：前ラウンド大富豪だったプレイヤーが2位以下だった場合、次ラウンドは大貧民として扱われる。',
    keys:['toshiochi','gekokujo'],
  },
  {
    id:'joker', name:'Joker効果',
    catDesc:'Jokerを含めてカードを出した際に特殊カードの効果枚数が増加するルール。\n例：7渡しをJoker含みで出した場合、通常より1枚多く渡せる。',
    keys:['jokerEffect'],
  },
  {
    id:'ninereverse', name:'9リバース',
    catDesc:'9を出すと手番の順番が逆回転するルール。\n例：時計回りに進んでいた手番が、9を出した瞬間から反時計回りになる。次に9が出るか場が流れるまで継続。',
    keys:['nineReverse'],
  },
  {
    id:'fiveskip', name:'5スキップ',
    catDesc:'5を出すと次のプレイヤーのターンをスキップするルール。\n例：Aさんが5を出すと、次のBさんのターンが飛ばされCさんの手番になる。',
    keys:['fiveSkip'],
  },
  {
    id:'sevenpass', name:'7渡し',
    catDesc:'7を出した枚数分のカードを次のプレイヤーに渡すルール（渡すカードは自分で選ぶ）。\n例：7を2枚出したら、手札から好きな2枚を選んで次の人に渡す。',
    keys:['sevenPass'],
  },
  {
    id:'tendiscard', name:'10捨て',
    catDesc:'10を出した枚数分のカードを自分で選んで捨てるルール。\n例：10を3枚出したら、手札から好きな3枚を選んで捨てられる。',
    keys:['tenDiscard'],
  },
  {
    id:'queenbomber', name:'12ボンバー',
    catDesc:'Qを複数枚出すと、出した枚数分の数字を宣言し全員がその数字のカードをすべて捨てるルール。\n例：Q×2枚で「KとA」と宣言すると、全員の手札からKとAが全て捨てられる。',
    keys:['queenBomber'],
  },
  {
    id:'cardexchange', name:'カード交換',
    catDesc:'ラウンド終了後に階級に応じてカードを交換するルール。大富豪↔大貧民、富豪↔貧民の間で行われる。\n例：大貧民は好きなカード2枚を大富豪に渡し、大富豪は任意の2枚を返す。',
    keys:['cardExchange','poorCardChoice','noJokerExchange','tenpenchi'],
  },
];

// ------- サブ項目 -------
const SUB_ITEMS = {
  revolution: [
    {
      key:'revolution', label:'革命', type:'bool',
      desc:'4枚同数字を一度に出すと強弱が逆転する。',
      example:'例：4×5を出す → 以降2が最弱・3が最強に。革命返しON時はもう一度4枚出すと元に戻る。',
    },
    {
      key:'revolutionReturn', label:'革命返し', type:'bool', depends:'revolution',
      dependsLabel:'革命ON 時のみ有効',
      desc:'革命中にさらに4枚出しをすると、元の強弱に戻る（革命返し）。',
      example:'例：革命中に誰かが4×Kを出す → 再び2が最強・3が最弱に戻る。\nOFF：一度発動した革命は覆せない。',
    },
    {
      key:'revolutionOptional', label:'革命するかどうか選択', type:'bool', depends:'revolution',
      dependsLabel:'革命ON 時のみ有効',
      desc:'革命条件を満たした時に、革命を発動するかしないかをプレイヤーが選べる。',
      example:'例 OFF：4枚出しは自動で革命発動。\n例 ON：「革命しますか？」の確認が入り、しないことも選択できる。',
    },
    {
      key:'stairRevolution', label:'階段革命', type:'bool', dependsAll:['revolution','stair'],
      dependsLabel:'革命ON かつ 階段ON 時のみ有効',
      desc:'同マーク連続4枚以上の階段を出すと革命が発動する。',
      example:'例：♥3・♥4・♥5・♥6 の4枚階段 → 革命発動。3枚以下の階段では発動しない。',
    },
    {
      key:'coudetar', label:'クーデター', type:'bool', depends:'revolution',
      dependsLabel:'革命ON 時のみ有効',
      desc:'9を3枚同時に出すと革命が発動する。',
      example:'例：♠9・♥9・♦9 の3枚を同時に出すと強弱逆転が発動。',
    },
    {
      key:'omen', label:'オーメン', type:'bool', depends:'revolution',
      dependsLabel:'革命ON 時のみ有効',
      desc:'6を3枚同時に出すと革命が発動し、以降その場では革命が禁止になる。',
      example:'例：オーメン発動後は、誰が4枚出しても革命にならない（その場限り）。',
    },
    {
      key:'emperor', label:'エンペラー', type:'bool', depends:'revolution',
      dependsLabel:'革命ON 時のみ有効',
      desc:'4種類すべてのマークを含む連続した4枚を同時に出すと革命が発動する。',
      example:'例：♠5・♥6・♦7・♣8（♠♥♦♣ 全マーク含む連続数字4枚）で革命成立。',
    },
    {
      key:'revolutionJoker', label:'ジョーカー含み革命', type:'bool', depends:'revolution',
      dependsLabel:'革命ON 時のみ有効',
      desc:'4枚出しにJokerを混ぜても革命が成立する（同数字3枚＋Joker1枚）。',
      example:'例：同数字3枚＋Joker1枚 の計4枚出しで革命成立。Joker単体では革命にならない。',
    },
    {
      key:'nanaRevo', label:'ナナサン革命', type:'bool', depends:'revolution',
      dependsLabel:'革命ON 時のみ有効',
      desc:'7を3枚同時に出すと革命が発動する。',
      example:'例：♠7・♥7・♦7 の3枚を同時に出すと強弱逆転が発動。',
    },
  ],

  stair: [
    {
      key:'stair', label:'階段', type:'bool',
      desc:'同じマークで連続した数字を3枚以上同時に出せる。',
      example:'例：♦3・♦4・♦5 → 有効。♦3・♦5・♦6 → 連続でないためNG。',
    },
    {
      key:'stairStackable', label:'階段を重ねられる', type:'bool', depends:'stair',
      dependsLabel:'階段ON 時のみ有効',
      desc:'ON：場の階段の最小値より大きい最小値の階段を出せる（重ね可）。OFF：場の階段の最大値より大きい最小値の階段しか出せない（重ね不可）。',
      example:'例 ON：場に♥3-4-5 → ♠4-5-6（最小4>3）でOK。\n例 OFF：場に♥3-4-5（最大5）→ ♠6-7-8（最小6>5）でないとNG。',
    },
    {
      key:'stairEffect', label:'階段中のカード効果', type:'bool', depends:'stair',
      dependsLabel:'階段ON 時のみ有効',
      desc:'階段の中に特殊カード（8・J等）が含まれる場合、そのカード効果が発動する。',
      example:'例：♣6・♣7・♣8 の階段を出すと8切りも発動して場が流れる（8切りON時）。',
    },
  ],

  shibari: [
    {
      key:'markShibari', label:'マーク縛り', type:'bool',
      desc:'同じマークを2回続けて出すと発動。以降そのマークしか出せなくなる。',
      example:'例：♥5の後に♥9を出すと♥縛り発動。以降は♥のカードしか出せない。場が流れると解除。',
    },
    {
      key:'numberShibari', label:'数字縛り', type:'bool',
      desc:'連続した数字を2回続けて出すと発動。次のプレイヤーは続きの数字しか出せなくなる。',
      example:'例：5の後に6を出すと縛り発動。次のプレイヤーは7しか出せない。',
    },
    {
      key:'bothShibari', label:'両縛り', type:'bool',
      desc:'マークと数字の両方が縛られる。同じマークで連続した数字を2回続けると発動。',
      example:'例：♥5の後に♥6を出すと縛り発動。次のプレイヤーは♥7しか出せない。',
    },
    { key:null, label:'縛り発動回数', type:'fixed', value:'2回' },
  ],

  eightcut: [
    {
      key:'eightCut', label:'8切り', type:'bool',
      desc:'8を出すと場が強制的に流れる。出したプレイヤーが次の手番を得る。',
      example:'例：相手が強いカードを出していても8を1枚出すだけで場を流せる。',
    },
    {
      key:'fourStop', label:'4止め', type:'bool',
      desc:'4を2枚同時に出すと場が流れる。出したプレイヤーが次の手番を得る。',
      example:'例：場に5が出ていても4×2枚で場流し。ただし4×1枚では発動しない。',
    },
    {
      key:'sandstorm', label:'砂嵐', type:'bool',
      desc:'3を3枚同時に出すと場が流れる。出したプレイヤーが次の手番を得る。',
      example:'例：通常最弱の3が3枚あれば切り札になる。',
    },
    {
      key:'ambulance', label:'救急車', type:'bool',
      desc:'9を2枚同時に出すと場が流れる。出したプレイヤーが次の手番を得る。',
      example:'例：9×2で場を流すと9リバースも回避できる（9リバースON時）。',
    },
    {
      key:'rokuro', label:'ろくろ首', type:'bool',
      desc:'6を2枚同時に出すと場が流れる。出したプレイヤーが次の手番を得る。',
      example:'例：6はふだん弱いカードだが、2枚あれば場を流す切り札になる。',
    },
    {
      key:'spadeThree', label:'スペード3返し', type:'bool',
      desc:'Joker単体に対してのみ♠3で返すことができ、場が流れて出したプレイヤーが次の手番を得る。',
      example:'例：相手がJoker1枚を出したとき、♠3を持っていれば返せる。',
    },
  ],

  elevenback: [
    {
      key:'elevenBack', label:'イレブンバック', type:'bool',
      desc:'Jを出すと「イレブンバック」が発動し、次に場が流れるまで強弱が一時的に逆転する。',
      example:'例：発動中は3が最強・2が最弱になる。次の場流れで自動解除。',
    },
  ],

  forbidden: [
    {
      key:'forbiddenWin', label:'禁止あがり（マスター）', type:'bool',
      desc:'禁止あがりルール全体のON/OFF。OFFにすると以下の設定は全て無効になる。',
    },
    {
      key:'forbiddenWin2', label:'2あがり禁止', type:'three', depends:'forbiddenWin',
      desc:'2を含む出し方であがると失格になる。',
      example:'「やさしい」：2のみであがると失格。階段・エンペラー等2以外の数字を含む出し方であがった場合は失格にならない。\n「ON」：2を含む出し方であがると全て失格（階段・エンペラー等も含む）。',
    },
    {
      key:'forbiddenWinJoker', label:'Jokerあがり禁止', type:'three', depends:'forbiddenWin',
      desc:'Jokerを含む出し方であがると失格になる。',
      example:'「やさしい」：Jokerのみであがると失格。他の数字を含む出し方であがった場合は失格にならない。\n「ON」：Jokerを含む出し方であがると全て失格。',
    },
    {
      key:'forbiddenWin8', label:'8あがり禁止', type:'bool',
      depends:'eightCut', dependsLabel:'8切りON 時のみ有効',
      desc:'8を出して手札が0枚になってもあがりと認められない。場は流れるがあがりにはならない。',
      example:'例：8×1枚が最後の手札でも出せるが、あがりにならず永遠パスになる。',
    },
    {
      key:'forbiddenWinSpade3', label:'♠3あがり禁止', type:'bool',
      depends:'spadeThree', dependsLabel:'スペード3返しON 時のみ有効',
      desc:'♠3を出して手札が0枚になってもあがりと認められない。',
      example:'例：♠3が最後の1枚でも出せるが、あがりにならず永遠パスになる。',
    },
    {
      key:'forbiddenWin3Rev', label:'3あがり禁止（革命中）', type:'bool',
      depends:'revolution', dependsLabel:'革命ON 時のみ有効',
      desc:'革命中に3を出して手札が0枚になってもあがりと認められない。',
      example:'例：革命中は3が最強だが、3だけで上がることは禁止される。',
    },
  ],

  toshiochi: [
    {
      key:'toshiochi', label:'都落ち', type:'bool',
      desc:'前ラウンドの大富豪が今ラウンドで1位でないと確定した瞬間（誰かが先に1位通過）にリタイア。リタイアは大貧民から順に埋まる。',
      example:'例：大富豪だったAさんが他の人に先に上がられた瞬間、Aさんは大貧民確定でリタイア。',
    },
    {
      key:'gekokujo', label:'下剋上', type:'bool',
      desc:'前ラウンドの大貧民が1位通過した瞬間にラウンド終了。次ラウンドの階級が全入れ替えになる。',
      example:'例：大貧民だったAさんが1位通過 → 大貧民↔大富豪・貧民↔富豪が入れ替わり。禁止あがりで既にリタイア割り当てがあっても下剋上が上書きして全入れ替え適用。',
    },
  ],

  joker: [
    {
      key:'jokerEffect', label:'Joker効果倍増', type:'bool',
      desc:'Jokerを含めてカードを出すと、特殊カード効果の枚数が1枚増加する。',
      example:'例：7×1枚＋Joker1枚で出すと、7渡しで2枚渡せる（通常は1枚）。10捨てJoker含みなら2枚捨てられる。',
    },
  ],

  ninereverse: [
    {
      key:'nineReverse', label:'9リバース', type:'bool',
      desc:'9を出すと手番の順番が逆回転する。次に9が出るか場が流れるまで継続。',
      example:'例：A→B→C→D の順番で進んでいたところ、Bが9を出すとB→A→D→C→B...の順に。',
    },
  ],

  fiveskip: [
    {
      key:'fiveSkip', label:'5スキップ', type:'bool',
      desc:'5を出すと直後の1人のターンをスキップさせる。',
      example:'例：Aが5を出すとBのターンが飛ばされCの手番になる。',
    },
  ],

  sevenpass: [
    {
      key:'sevenPass', label:'7渡し', type:'bool',
      desc:'7を出した枚数分のカードを次のプレイヤーに渡す（渡すカードは自分で選ぶ）。',
      example:'例：7×3枚出し → 手札から好きな3枚を選んで右隣に渡す。Joker効果ONなら4枚渡す。',
    },
  ],

  tendiscard: [
    {
      key:'tenDiscard', label:'10捨て', type:'bool',
      desc:'10を出した枚数分のカードを自分で選んで捨てる。',
      example:'例：10×2枚出し → 手札の中から不要な2枚を選んでゲームから除外できる。',
    },
  ],

  queenbomber: [
    {
      key:'queenBomber', label:'クイーンボンバー', type:'bool',
      desc:'Qを複数枚出すと「数字」を出した枚数分だけ宣言し、全員がその数字のカードを手札から全て捨てる。',
      example:'例：Q×2枚 → 「KとA」と宣言。全員の手札からKとAが全て捨てられる。',
    },
  ],

  cardexchange: [
    {
      key:'cardExchange', label:'カード交換方式', type:'threeCustom',
      values:['simultaneous','receive-first','off'],
      labels:['ON同時','ONもらってから渡す','OFF'],
      desc:'ラウンド終了後、大富豪↔大貧民・富豪↔貧民の間でカード交換を行う。',
      example:'「同時」：お互いが同時に渡すカードを選ぶ。\n「もらってから渡す」：上位者が先にもらってから、渡すカードを選ぶ。',
    },
    {
      key:'poorCardChoice', label:'貧民のカード選択', type:'bool',
      desc:'ONにすると、貧民（下位者）も渡すカードを自分で選べる。OFFだと最弱カードが自動で渡される。',
      example:'例 OFF：貧民の手札の中で最も弱いカードが大富豪に自動で渡される。',
    },
    {
      key:'noJokerExchange', label:'Jokerを交換しない', type:'bool',
      desc:'ONにすると、Jokerは交換対象外になる。大貧民がJokerを持っていても渡さなくてよい。',
      example:'例：大貧民の手札がJokerのみの場合、交換が免除される。',
    },
    {
      key:'tenpenchi', label:'天変地異', type:'bool',
      desc:'カード交換後に大貧民の手札が10以下のカードしかない場合に自動発動。大貧民↔大富豪・貧民↔富豪の手札を丸ごと交換するルール。',
      example:'例：カード交換後に大貧民の手札がすべて10以下 → 自動で大富豪と手札を全交換。',
    },
  ],
};

// ------- グローバル公開 -------
window.DaifugoRules = {
  DEFAULT_RULES,
  RULE_BOOL_KEYS,
  CATEGORIES,
  SUB_ITEMS,
  encodeRuleId,
  decodeRuleId,
};

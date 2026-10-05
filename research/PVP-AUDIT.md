# PvP情報監査 / 2026-10-04

## 結論

熊モデルのPvP転用を全面撤回し、33英雄91スキルを文面分類へ再整理しました。これは「全33体のPvP内部処理を実測検証した」という意味ではありません。今回、英雄別の再現可能な統制PvP実験は0件です。個別スタックを確定○×にせず、公式一般則と不確実性を併記します。

## 重要な訂正

- ジェシー/ジャセル/ジェロニモの第1は、殺傷力Eという熊換算を撤回し与ダメAの文面分類へ。
- ウェイン第3はCRITへ分離。全兵種会心率25%が公開本文。Sへの換算・盾除外・会心倍率は未確認。乗り手は第1のみなので会心を乗り手推薦理由にしない。
- レネはSを追加ダメージの表示分類として使用するが、他Sとの同加算枠とはしない。2025年9月の調整報告があり旧重複説を確定採用しない。
- レネ第2/3のF/M、ブラッドリー第2やエディス第1のMなど熊専用変換を削除。
- ミア第2は資料がAttack/more damageで相違。Aは暫定分類。
- スタック一般則は公式FAQに基づくが、個別の加算式・抽選・上書きは未確定。
- 攻撃＝火力だけ、防衛＝耐久だけという推薦を撤回。双方に火力と耐久の役割を説明。
- リオン第3の100%は公式Wiki/Forgeの1%を採用。自己累積と乗り手重複を区別。

## 採否を判断した資料

- [Century Games / Combat FAQ](https://centurygames.helpshift.com/hc/en/64-whiteout-survival/faq/8048-combat-faq/) [official-general] — 集結・駐屯のスキル範囲と同時ターン。英雄別の隠れた計算式はない。
- [Century Games / 同一スキル重複](https://centurygames.helpshift.com/hc/en/64-whiteout-survival/faq/8050-if-the-4-skills-of-the-rally-members-are-the-same-as-the-captain-s-will-the-effects-be-stackable/) [official-general] — 集結主と参加者の同スキルは重複可という一般回答。各英雄の倍率・上書き・抽選方式は未記載。
- [Century Games / スキル説明](https://centurygames.helpshift.com/hc/en/64-whiteout-survival/faq/8052-about-skill-descriptions/) [official-general] — 被ダメ軽減と敵与ダメ軽減は異なる主体。単純加算でないと説明。
- [Century Games / 異なるレベルの重複](https://centurygames.helpshift.com/hc/en/64-whiteout-survival/faq/6627-are-skills-of-different-level-stackable/) [official-general] — スキルレベルが異なっても効果は重複するとの一般則。
- [Reddit / Mixed Heroes on offensive rallies](https://www.reddit.com/r/whiteoutsurvival/comments/1qgt8ce/mixed_heroes_on_offensive_rallies/) [community-report] — PvPの混成採用・兵種条件の経験談。実験条件・全戦報を揃えた再現可能な検証ではない。
- [Reddit / Defensive rally joiners](https://www.reddit.com/r/whiteoutsurvival/comments/1qkqjyf/defensive_rally_joiners/) [community-report] — 攻撃側にも耐久、防衛側にも火力が役立つという主張。Mia重複の効率低下は経験談で確定式なし。
- [Reddit / Rally joiner question](https://www.reddit.com/r/whiteoutsurvival/comments/1sub9j3/rally_joiner_question/) [community-report] — PvPと熊は目的が異なるという議論。比較検証の十分な生データはない。
- [Reddit / Norah as rally joiner in Gen 5](https://www.reddit.com/r/whiteoutsurvival/comments/1rvc4e4/norah_as_rally_joiner_in_gen_5/) [community-report] — 盾弓編成でのNorah複数採用例。最適人数・固定比率の証明にはしない。
- [Reddit / SvS castle battle joiners attack & garrison](https://www.reddit.com/r/whiteoutsurvival/comments/1uipny4/svs_castle_battle_joiners_attack_garrison_g9/) [community-report] — Gen7/8の編成例。AhmoseとGatotの干渉説は投稿者の主張で再現データなし。
- [Reddit / Renee Rally Stacking Adjustment](https://www.reddit.com/r/whiteoutsurvival/comments/1n7y0qa/renee_rally_stacking_adjustment/) [community-disputed] — 2025-09-04の調整報告。掲載画像は運営通知とされるが、この監査では画像本文を読めていない。コメントの完全非重複説と効果減少説が対立。
- [Reddit / Renee Nerfed](https://www.reddit.com/r/whiteoutsurvival/comments/1n8162b/renee_nerfed/) [community-disputed] — 調整後も重複する/しないという報告が対立。サポート回答の伝聞もあり、更新後の式は確定不可。
- [Reddit / Is Renee better than Norah](https://www.reddit.com/r/whiteoutsurvival/comments/1qrj6qc/is_renee_better_than_norah/) [community-report] — 2026年のPvP乗り手として槍編成で採用する議論。複数重ねない提案は実測確定ではない。
- [Whiteout Survival Wiki / Wayne](https://www.whiteoutsurvival.wiki/heroes/wayne/) [published-description] — 第1の周期追加攻撃・第2の対象兵種・第3の全兵種会心率を本文確認。会心倍率と内部分類は未掲載。
- [WSCO / Wayne](https://www.whiteoutsurvival-community.com/guides/heroes/en/wayne.html) [secondary-description] — 公開スキル本文は一致。独立実機テストではない。
- [Whiteout Survival Data / Generation 6](https://whiteoutdata.com/heroes/generation-6-heroes/) [secondary-description] — ウェインの公開倍率と周期を照合。内部会心式はない。
- [Whiteout Guide Notes / Rally Comps × Joiner Skills](https://blog.astris.kr/en/posts/adb04f46-d525-46a6-810c-940b72f26c77) [rejected-for-engine-proof] — PvP対象だが数式根拠は別ゲームKingshot。effect_opのWoS一次資料なし。主の同枠を全除外する断定、全兵種軽減のAhmoseを全スキル盾限定とする記述などを採用しない。
- [ほわほわ / 集結と駐屯](https://note.com/wosjapan/n/nf5aba687aed3) [secondary-hypothesis] — 記事自身が内部識別子の根拠はKingshotでWoS公式確認なしと明記。WoS確定式としての転載はしない。
- [WoS Guru / Heroes](https://wosguru.com/heroes) [rejected-for-mechanics-proof] — Sergeyを30%とする箇所、探索/遠征の混同、Ahmoseの軽減対象誤読などあり。非スタック断定の根拠として不採用。
- [Whiteout Survival Handbook / Ahmose](https://whiteoutsurvivalhandbook.com/guides/whiteoutsurvival-ahmose-guide-2026) [rejected] — 乗り手に第3遠征効果まで寄与するとする記載が公式一般則と不整合。
- [WOS Nerds / bear-calc](https://github.com/wosnerdwarriors/website-index/tree/main/bear-calc) [out-of-scope] — 熊専用モデル。PvPの計算枠・推薦・重複判定には使用しない。

## 全英雄の用途監査（いずれも順位ではなく推論）

|英雄|第1の整理枠|用途/条件|注意点|
|---|---|---|---|
|バシティ|D|耐久補助候補：全兵種の常時20%軽減で前線の維持を狙う。|同じ軽減を持つセルゲイとの比較はスキルLvと既存効果で判断。火力は直接増えない。|
|ジャセル|A|火力補助候補：全兵種へ常時25%与ダメージ増加。相手を早く減らす目的。|日本語の一部攻略で攻撃力と書かれるが、採用本文は与ダメージ。ジェシーと別枠扱いしない。|
|ジェシー|A|火力補助候補：全兵種へ常時25%与ダメージ増加。防衛でも敵を減らす火力候補。|乗り手では第2の軽減を付与しない。同英雄が主にいても一律失格にはしない。|
|リンセツ|H|耐久補助候補：敵全部隊の攻撃力を常時20%下げる。攻撃側の前線維持にも使える。|敵与ダメージ低下Jや味方被ダメ軽減Dと同一効果と決めつけない。|
|ルム・ボーガン|J|耐久補助候補：敵全兵種の与ダメージを常時20%下げる。|過去の調整に言及する投稿があるが日時・内部式は未確認。攻撃力低下Hとは区別。|
|パトリック|C|耐久補助候補：全兵種のHP25%増加。攻撃・駐屯の双方で生存を支援。|HP25%を軽減25%や勝率25%増加へ換算しない。第2の攻撃力は乗り手では使わない。|
|ソユン|B|火力補助候補：全兵種の攻撃力25%増加。攻防双方の攻撃支援。|与ダメ増加Aと表記を分ける。既存バフとの内部合算式は未確認。|
|セルゲイ|D|耐久補助候補：全兵種の被ダメージを常時20%軽減。|一部攻略の30%は採用しない。20%を5人分足して無敵とは計算しない。|
|ジェロニモ|A|火力補助候補：第1は全兵種の与ダメージ25%増加。|乗り手価値に第2・第3や専用装備を加算しない。SSRだから同効果のSRより必ず強いとはしない。|
|ジャスミン|D|確率型・比較候補：40%抽選で全兵種の被ダメージを最大50%軽減。|平均20%軽減と即断しない。抽選単位・複数採用の独立性は未確認。|
|ナタリア|D|確率型・比較候補：40%抽選で全兵種の被ダメージを最大50%軽減。|第2・第3の火力は乗り手に含めない。確率型を一律非スタックとしない。|
|ジンマン|DEF,C|耐久補助候補：全兵種の防御10%とHP10%を同時に補助。|HP25%のパトリックより必ず弱いとは断定不可。主・相手の効果と比較。|
|アロンゾ|E|確率型・比較候補：40%抽選で全兵種の殺傷力を最大50%増加。|複数コピーで確率だけ上がる、同英雄は無効という断定は根拠不足。|
|フリント|A|盾火力・条件付き：常時の盾兵与ダメージ100%増加。盾火力を使う編成なら比較候補。|旧型の20%着火・3ターン持続という投稿は現本文と異なる。盾以外へは適用しない。|
|フレンダー|B,DEF|攻防両用候補：全兵種に攻撃15%・防御10%を同時付与。|攻撃の数値だけでソユン以下と決めず、耐久も必要かを見る。乗り手に第2・第3は含めない。|
|グレッグ|A|確率・持続型候補：20%抽選で与ダメージ40%増加が3ターン続く。|20%×40%=平均8%と断定しない。継続中の再抽選・延長・重複の処理は未確認。|
|ローガン|H|耐久補助候補：敵全兵種の攻撃力20%低下。リンセツと同じ効果種類の候補。|探索の確率防御スキルと混同しない。第1遠征は本文上常時。|
|ミア|G|確率型・比較候補：攻撃時50%で対象の被ダメージ最大50%増加。|PvPで複数の伸びが小さいとの報告あり。ただし1体超は完全無効との確定証拠なし。|
|アクモス|D|周期耐久・条件付き：盾兵の周期停止に合わせ、味方盾の被ダメ70%、味方槍弓30%を2ターン軽減。|攻撃停止の代償あり。複数非スタック説・ガトとの干渉説は未検証。敵兵種別の軽減と誤読しない。|
|リオン|A|確率火力・比較候補：40%抽選で全兵種の与ダメージ最大50%増加。|殺傷力Eへ置換しない。複数抽選の計算式は不明。第3の累積攻撃は乗り手では使わない。|
|レイナ|A'|通常攻撃・条件付き：全兵種の通常攻撃ダメージ30%増加。|追加攻撃や会心へ同率適用されるかは未確認。内部ダメージ分類を推測して合計倍率を出さない。|
|グウェン|G|対象弱体・比較候補：本文上は攻撃対象の被ダメージ25%増加。|熊モデルの15%換算や非重複をPvPへ転用しない。通常/スキルへの適用範囲は未確認。|
|ヘクトー|D|確率耐久・比較候補：40%抽選で全兵種の被ダメージ最大50%軽減。|第2・第3の攻撃効果は乗り手に含めない。常時50%軽減ではない。|
|ノラ|A,D|盾弓編成・候補：盾と弓に与ダメ15%増加・被ダメ15%軽減。PvP盾弓編成で採用例あり。|槍は第1の対象外。複数採用例はあるが3体/4体が常に最適という証明はない。|
|レネ|S|槍編成・要検証候補：2ターンごとの印により翌ターンに最大200%の槍兵追加ダメージ。|2025年9月の重複調整報告後も内部処理は未確定。旧来の複数レネ推奨を復活させない。|
|ウェイン|S|周期攻撃・条件付き：第1は4ターンごとの全部隊追加攻撃。攻撃でも駐屯でも火力補助になりうる。|第3の会心と第2の対槍弓効果は乗り手では供給しない。4ターン周期の初回位置・重複は未確認。|
|無名|D|盾耐久・条件付き：盾兵が受ける通常ダメージ25%・スキルダメージ30%をそれぞれ軽減。|相手のダメージ内訳と盾の比重で価値が変化。30%を味方全部隊へ広げない。|
|ブラッドリー|B|火力補助候補：第1は全兵種の攻撃力25%増加。弓ゼロの集結でも対象は全部隊。|乗り手では対槍盾の第2・周期第3は使わない。ソユンと別の加算枠とは断定しない。|
|エディス|D,A|槍弓編成・条件付き：弓兵の被ダメ20%軽減と槍兵の与ダメ20%増加。|盾には第1の直接効果なし。弓ゼロなら軽減部分、槍ゼロなら火力部分の対象がない。|
|ゴードン|S,J|槍編成・条件付き：槍2回攻撃ごとに追加ダメージ100%と、対象の与ダメ20%低下を1ターン付与。|追加攻撃と毒を分ける。槍ゼロや毒の重複・上書き処理は未確認で、熊モデルの未計上を無効の根拠にしない。|
|ガト|DEF|盾耐久・条件付き：盾兵の防御力30%増加。前線を支えたい攻防双方の候補。|第2のシールド・第3の敵攻撃低下は乗り手では使わない。防御30%と被ダメ30%を同一視しない。|
|ヘンドリック|F|敵防御低下・候補：敵全兵種の防御力25%低下。PvPでの採用報告あり。|1体限定説と一般重複則があるが、英雄別の式は未確認。25%×4で防御0とは計算しない。|
|ソニヤ|A|火力補助候補：第1は全兵種の与ダメージ20%増加。|乗り手で槍限定なのは第1ではない。第2の追加的効果や第3の眩暈を推薦理由に含めない。|

## 実装用ファイル

pvp-audit.json の heroReplacements は旧英雄配列の置換案。model・bear用推薦・熊stack flagを除き、attack/defense/pvp推薦とsourceIdsを追加。sourcesも対応して更新すること。アプリ本体はこの担当では編集していません。

## 検証を次に行う場合

同一の主・参加人数・兵種比率・兵数・Tier・装備・バフ・相手を固定し、英雄なし/1体/2体/主との同一の各条件を集結対駐屯で比較。開始時兵数、損害、通常/スキル内訳、ターン数、発動数を保存。確率型は単発戦報で断定しない。1体でも主の第2/3や専用装備を混入させない。

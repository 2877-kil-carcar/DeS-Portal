# DeS gift-code proxy

Cloudflare Workers用の固定中継です。送信先はCentury Games公式交換APIだけに固定し、DeS PortalのGitHub Pagesと指定したローカル確認Originだけを許可します。任意URLを転送する機能はありません。

Cloudflare上のWorker名：`des-giftcode-proxy`

## Discord自動交換の追加（実装済み・本番未有効化）

2026-10-07。v3.32で手動・Discord自動交換を同じサーバーキューへ統合しました。
手動の一括交換ボタンは残ります。新方式が有効な場合、手動とDiscordは同じ `RedeemQueue` を使います。

### 調査結果

- フロント：フレームワークなしのHTML/CSS/JavaScript。GitHub Pages配信。
- 旧一括処理：`apps/redeem/redeem.js` の `startBtn` ハンドラー内。ブラウザで1人ずつ交換、2.2秒間隔、混雑時最大3回、再試行間隔5秒。
- 1人分の交換：`apps/redeem/api.js` → 既存Worker → Century Games交換API。
- 保存先：Firebaseプロジェクト `des-portal-gift-code` のFirestore。
- `redeemPlayers/{fid}`：fid, kid, name, updatedAt。
- `redeemHistory/{encodeURIComponent(cdk)}--{fid}`：cdk, fid, msg, atText, updatedAt。
- `redeemMeta/local-v1`：旧ローカル保存の移行マーカー。
- 認証：Firebase匿名認証。READMEに匿名利用者の一律読み書き許可の記録あり。本番ルールを今回再取得・変更はしていません。
- 旧結果保存：20000/40008/40011/40016を完了として保存。失敗と進捗はブラウザ内のみ。
- `redeem_backend.py` は旧ローカル用。現在の公開画面からは呼ばれていません。

### 変更ファイルと構成

| ファイル | 役割 |
|---|---|
| `apps/redeem/protocol.js` | 既存署名・エラー分類をブラウザとサーバーで共通化 |
| `apps/redeem/api.js` | 登録ID確認・旧方式の互換アダプター |
| `apps/redeem/cloud.js` | 既存共有保存を維持し、手動API用のFirebase IDトークンを取得 |
| `apps/redeem/jobs.js` | 共通キューの開始・中止・状況取得 |
| `apps/redeem/redeem.js`, `index.html` | 手動ボタン、ジョブ一覧、進捗、未完了分の再実行 |
| `cloudflare-worker/automation-worker.mjs` | 既存中継を残したAPI入口・毎分の新着確認 |
| `cloudflare-worker/batch-queue.mjs` | 全実行経路共通の永続キューとDiscord読込位置 |
| `cloudflare-worker/services.mjs` | Firebaseトークン検証・Firestore・公式交換API接続 |
| `cloudflare-worker/discord.mjs` | 投稿元チェックとコード抽出 |
| `cloudflare-worker/wrangler.jsonc` | Durable Objectと毎分Cronの構成。初期設定は無効 |

Botによる約1分間隔の公式REST API読込 → コード抽出 → 共通キュー → 登録プレイヤー取得 → 1人ずつ交換 → 既存Firestore成功履歴とジョブ全結果保存。
常時起動PCは不要。Discord用と手動用の交換ループは分けません。
導入前の旧Workerで動く期間だけ従来のブラウザ一括処理を残しています。
新方式有効化後、旧画面からの直接交換は409で拒否し、再読込を案内します（登録ID確認は引き続き利用可能）。

### API・認証

- `POST /api/gift-code/redeem`：外部連携用。`Authorization: Bearer <GIFT_CODE_API_SECRET>`、本文 `{"code":"ABC123"}`。同じコードは既存ジョブを返すだけで再実行しません。
- `POST /api/gift-code/manual`：手動ボタン用。Firebase IDトークンの署名・期限・発行元・プロジェクトを検証。
- `GET /api/gift-code/jobs?code=ABC123`：同じ認証で進捗・個別結果取得。code省略で最新20件。
- `POST /api/gift-code/cancel`：同じ認証で中止要求。
- 内蔵Discord読込は同じWorker内から共通キューへ直接登録。秘密付きHTTP呼出しは外部Botを使う場合に使用します。
- CORSは認証の代替ではありません。外部連携APIはシークレット必須です。
- 手動機能は従来どおり匿名利用者が操作できます。管理者専用への変更はしていません。自動APIのシークレットで手動機能まで管理者限定になるわけではありません。
- ジョブDBはDurable Object内部のSQLiteで、公開Firestoreルール経由では書き換えできません。

### 重複防止・復旧

- `gift_codes.code` がPRIMARY KEY。前後空白を除去しますが大文字小文字は変更しません。
- detected_at / started_at / finished_at / updated_at / status、投稿元、プレイヤー別状態・試行回数・結果を永続保存。
- pending → processing → completed / failed。中止時はcancelled。
- 同じコードの同時受付・Discord再投稿は1つのジョブへまとめます。違うコードも全体で順番に交換します。
- 登録済み成功履歴をスキップ。API混雑・頻度制限は最大3回。無効・期限切れコードは後続を停止。
- Durable Object Alarmで1人ずつ実行。例外時も次回を予約し、Cronでも再開予約を補助。
- 読込・履歴保存は失敗回数を記録し最大5回でfailed。processingのまま永久放置しません。
- 交換成功が確認できた後に履歴保存だけ失敗した場合、再送せず保存だけを再試行します。
- 交換リクエスト送信中に切断・プロセス終了した場合はunknown（結果未確認）。自動再送せずゲーム内確認を案内します。
- 外部交換APIとローカルDBは単一トランザクションにできないため、公式側の厳密なexactly-once交換は保証しません。
- 手動の「未完了分を再実行」は明示的な操作として許可。unknownがある場合は受取確認を促します。新規登録分も取得し直します。

### Discord設定に必要なもの

対象サーバー：1371886406485540935。対象チャンネル：1377263260029550742。
ユーザー確認：Bot追加権限あり、Botは未作成。

1. https://discord.com/developers/applications でアプリとBotを作成。
2. Bot設定のMessage Content Intentを有効化。
3. 対象サーバーへbotスコープで追加。対象チャンネルのView ChannelとRead Message Historyを許可。投稿・管理者権限は不要。
4. 正規投稿のユーザー/Bot IDを `DISCORD_AUTHOR_IDS`（カンマ区切り）、Webhook投稿の場合は `DISCORD_WEBHOOK_IDS` に設定。メッセージのWebhook IDはBotによる読込で確認。
5. 実投稿1件の本文・Embed構造を確認し、抽出テストへ追加。現在は見出し「New Whiteout Survival Gift Code!」と、明示されたCode/Gift Code/CDK等の行またはEmbed欄に対応。画像のみ・自由文から推測したコードは自動実行しません。
6. 初回接続は最新メッセージを基準点にし、過去投稿を一斉交換しません。以後の新着を取得します。

Botが設置できない場合は、対象がDiscordのアナウンスチャンネルなら「フォロー」で自分のサーバーへ配信し、その配信をBotで読みます。元の投稿者が公開したメッセージのみが対象です。それも不可の場合は、許可された公開フィード等が必要です。self-botは使いません。

### Cloudflare秘密設定と公開順序

Worker名は既存の `des-giftcode-proxy`。秘密値をチャット・Git・フロントへ入れないこと。

- `DISCORD_BOT_TOKEN`：Discord Botトークン。
- `FIREBASE_API_KEY`：既存Webアプリと同じFirebase公開設定。Workerも既存方針どおり匿名認証し、現在のFirestoreルールの範囲で読込・書込します。管理者鍵は作成・保存しません。
- `GIFT_CODE_API_SECRET`：十分な乱数の外部連携用シークレット。CloudflareのSecretに設定。

1. 進行中の旧方式交換が終了していることを確認。
2. Cloudflareで秘密設定を登録し、無効状態の設定ファイルでWorkerをデプロイ。
3. 更新フロントをGitHub Pagesへ公開。無効状態では既存手動機能が動作。
4. Bot読込・正規投稿元・抽出・Firebase権限を確認。
5. `AUTOMATION_ENABLED=true` で手動処理を共通キューへ切替。
6. 合成データでのテストと、管理下のテスト用プレイヤーで実接続を確認後、`DISCORD_ENABLED=true` に設定。
7. `jobs`のDiscord確認時刻、コードの状態、個別結果を確認。

有効化後にAUTOMATION_ENABLEDをfalseへ戻す場合は、実行中キューを中止し処理終了を確認してからにしてください。進行中に旧方式へ戻すと二重送信の危険があります。
無料枠は存在しますが、CPU時間・リクエスト数・ストレージ制限があります。完全無料の無制限運用は保証しません。

### 検証済み／未検証

- `node tools/test-redeem-automation.mjs`：実SQLiteの一意制約、同時20受付、手動/Discord共通キュー、履歴スキップ、再試行、中止、クラッシュ復旧、認証検証。
- `node tools/test-redeem-jobs-ui.cjs`：サーバー処理への手動ボタン接続、状況表示、中止、再実行、結果未確認の確認、接続障害時に旧方式へ勝手に切替しないこと。
- 既存 `test-redeem-api.cjs` / `test-redeem-cloud.cjs` / `test-redeem-ui.cjs` / `test-redeem-worker.mjs`：すべて成功。
- Wrangler 4.148.0でDurable Object・1分間隔Cronを含む本番デプロイ成功。
- Bot追加、Message Content Intent、対象チャンネル読込、サーバーID一致、正規Webhook `1509347866823622737`、実投稿からのコード抽出を確認済み。初回は最新メッセージを基準点にし、過去コードは自動実行しません。
- Firebase匿名認証での本番Firestore接続と、本番コードを使った実交換は未検証。未検証を正常動作確認済みとは扱いません。

一次資料（2026-10-07確認）：
- https://docs.discord.com/developers/resources/message#get-channel-messages
- https://docs.discord.com/developers/events/gateway#message-content-intent
- https://support.discord.com/hc/en-us/articles/360032008192-Announcement-Channel-FAQ
- https://developers.cloudflare.com/durable-objects/api/alarms/
- https://developers.cloudflare.com/durable-objects/platform/pricing/

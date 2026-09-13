# フォーム送信設定

このLPのフォーム送信はNetlify Forms専用です。

## 送信先

送信内容はNetlify管理画面のFormsに保存されます。メール通知先はコードではなくNetlify側で設定します。

設定場所:

```text
Project configuration
Notifications
Emails and webhooks
Form submission notifications
```

## フォーム名

```text
leaseback-contact
```

Netlifyが検出できるように、`index.html` に静的なフォーム定義を置いています。

## Chatwork通知

フォームがNetlify Formsに保存・検証された後、`netlify/functions/submission-created.mjs` がChatwork通知とGoogleスプレッドシート転記を行います。一方の失敗で他方の処理が止まらないよう、両方を独立して実行します。
ブラウザにはAPIトークンを置かないため、トークンがサイト閲覧者に公開されることはありません。

### 1. Chatworkで用意するもの

1. 通知の投稿元にするChatworkアカウントを通知先ルームへ参加させます。
2. そのアカウントで、画面右上の利用者名から `サービス連携` を開きます。
3. `APIトークン` を発行してコピーします。
4. 通知先ルームをブラウザで開き、URL末尾の数字を確認します。

URLが次の場合、ルームIDは `123456789` です。

```text
https://www.chatwork.com/#!rid123456789
```

### 2. Netlifyに入力する値

Netlify管理画面で次の場所を開きます。

```text
Project configuration
Environment variables
```

以下の3項目を登録します。

| Key | Value |
| --- | --- |
| `CHATWORK_API_TOKEN` | Chatworkで発行したAPIトークン |
| `CHATWORK_ROOM_ID` | 通知先のルームID（数字のみ） |
| `CHATWORK_TO_ACCOUNT_IDS` | To通知する担当者のアカウントID。複数人はカンマ区切り |

本番のTo通知先は宮澤さん・岩瀬さん・山中さんです（2026-09-14にルーム参加者情報で確認）。

| 担当者 | アカウントID |
| --- | --- |
| 宮澤伸幸 | `11488891` |
| 岩瀬迪土 | `11536195` |
| 山中 | `10942288` |

設定値は `11488891,11536195,10942288` です。未設定や不正なIDがある場合は、Toなしの通知を送らずエラーにします。担当者を変更する場合は、通知ルームへの参加とIDを確認して更新してください。

各Toの横にはChatworkのアカウント名を表示します（公式の `[To:ID] [pname:ID]` 記法）。

通知にはNetlifyが記録した受付日時を `問い合わせ日時：2026/09/14 06:18:44（日本時間）` の形式で表示します。利用者が入力した日時や処理実行時刻は使いません。受付日時が欠けた場合もエラーにします。

環境変数を保存したら、サイトを再デプロイします。

### 3. 通知を送らずに確認する

`node --test "tests/*.test.mjs"` は外部通信を模擬して検証します。実際のフォーム送信・メール・Chatwork通知・シート書き込みは行いません。

Chatworkのルーム情報をGETで取得すれば、APIトークンの有効性と参加権限を投稿せず確認できます。

### 4. 実送信での確認

クライアントへのテスト通知が許可された場合のみ実施します。

1. 公開サイトのフォームからテストデータを1件送信します。
2. NetlifyのForms画面に送信内容が保存されていることを確認します。
3. Chatworkの指定ルームに「リースバックLP｜新規お問い合わせ（自動通知）」が届くことを確認します。

Chatwork通知に失敗した場合でも、問い合わせ原本はNetlify Formsに残ります。通知エラーはNetlifyのFunctionsログで確認できます。APIトークンを再発行すると以前のトークンは無効になるため、Netlify側の値も更新してください。

## Googleスプレッドシート転記

本番環境のFunctionsで、次の環境変数を使用します。プレビュー環境では有効にしません。

| Key | 内容 |
| --- | --- |
| `GOOGLE_SHEETS_ENABLED` | `true` のとき転記する |
| `GOOGLE_SHEETS_WEBHOOK_URL` | 公開済みGASウェブアプリの `/exec` URL |
| `GOOGLE_SHEETS_WEBHOOK_SECRET` | GASのスクリプトプロパティ `WEBHOOK_SECRET` と同じ値。32文字以上 |

GASプロジェクト: https://script.google.com/home/projects/1X4MDVp4BsrCthVOS7-euiY3yFuM_FYvB6CmFHz1cLxaNRzy5Uwg-Kv27/edit

転記先: https://docs.google.com/spreadsheets/d/1EQFmTO6gig3oSexkphOO5rMBACELFQjoIWa7PYNKMwA/edit?gid=0

`netlify/lib/google-sheets.mjs` は、問い合わせID・受付日時・入力データをHMAC-SHA256で署名して送ります。GASは署名と時刻を検証し、既存行の末尾へ追記します。転記先の列は1行目の見出し名で判定するため、業務用の列追加・列の並べ替えに追従します。

「連携ID」列で重複登録を防ぎます。列がなければ、次の正常な問い合わせを転記するときに使用中の最終列の右側へ追加します。2026-09-14時点の22列構成ではW列に相当します。既存の担当者・査定状況・状況、備考・NA・追客欄や既存行は変更しません。過去の未転記分を自動で再送・補完する処理はありません。

必須の見出しは「ステータス、問い合わせ日時、送信元、物件種別、都道府県、市区町村、売却希望時期、お名前、電話番号、メールアドレス、同意状況、送信ページ」です。必須見出しが消えたり重複した場合は、誤った列へ書き込まずエラーにします。

日時はChatworkと同じ日本時間の数値型日時として保存し、秒まで表示します。電話番号は文字列として扱い、先頭の0や+を保持します。入力値を数式として実行させません。

接続障害・HTTP 429/5xx・GASの一時エラーは最大3回試行します。失敗はFunctionsログに連携名のみを残し、個人情報や秘密鍵は出力しません。再試行を使い切った場合は原本をNetlify Formsで確認して対応してください。Chatwork APIには同じ重複防止がないため、イベント全体の手動再実行は通知が重複する可能性があります。

公開URLへのGETはサービス状態のみを返し、転記や通知は行いません。POSTによる確認は本番シートへ書き込むため、テスト転記が許可された場合だけ実施します。

GASの変更は `integrations/google-sheets.gs` を上記プロジェクトのコードに反映し、`checkConfiguration`（読み取りのみ）で見出しと秘密鍵の存在を確認します。その後「デプロイを管理」から既存デプロイを新バージョンへ更新します。実行ユーザー・公開範囲・秘密鍵・URLは維持します。GETが `version: 2` を返すことを確認してください。`checkConfiguration` やGETは転記・通知を実行しません。

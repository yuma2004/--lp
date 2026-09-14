# リースバックLPの構造とバージョンの違い

更新日：2026年9月14日

この文書はリポジトリ内の実装を説明します。ローカルの変更が公開サイトに反映されるのは、Netlifyの本番デプロイが完了した後です。公開中の版は、Netlifyのデプロイ履歴とコミットで確認します。

## ページと役割

| URL | ファイル | 役割・構成 |
| --- | --- | --- |
| `/` | `index.html` | ルートの本番LP。共通の基本デザインを使用 |
| `/lp/1/` | `lp/1/index.html` | ルートの既存デザインを独立したファイル群として保持する版 |
| `/lp/2/` | `lp/2/index.html` | 弁護士監修・担当営業の紹介を含む版。PCでは冒頭以降を中央の縦並びに調整 |
| `/lp/3/` | `lp/3/index.html` | lp/2を複製し、無料相談CTA・専用サンクスページ・下部構成を変更した版 |
| `/test/` | `test/index.html` | 表示確認用。入力内容を保存せず、通知・広告計測を行わない |
| `/thanks.html` | `thanks.html` | ルート・lp/1・lp/2の送信完了ページ |
| `/lp/3/thanks.html` | `lp/3/thanks.html` | lp/3専用の送信完了ページ。電話番号と急ぎの方向けの案内を掲載 |
| `/test/thanks.html` | `test/thanks.html` | 電話案内付きサンクスページの表示確認用 |
| `/privacy-policy.html` | `privacy-policy.html` | 全ページ共通のプライバシーポリシー |
| `/operator.html` | `operator.html` | 全ページ共通の運営者情報 |

`/test/` はlp/3と別のページです。既に確認用として変更された文言を含むため、lp/3の本番データ送信・計測処理の複製元には使用しません。

## バージョン別の仕様

| 項目 | ルート `/` | lp/1 | lp/2 | lp/3 | `/test/` |
| --- | --- | --- | --- | --- | --- |
| 都道府県の選択 | 独自UI | 標準プルダウン | 標準プルダウン | 標準プルダウン | 標準プルダウン |
| 同意の初期状態 | チェック済み | チェック済み | チェック済み | チェック済み | チェック済み |
| 主なCTA | 無料査定はこちら | 無料査定はこちら | 最短即日査定はこちら | 無料相談はこちら | 無料相談はこちら |
| CTAの補足文 | 弁護士監修あり！最短即日回答！ | 弁護士監修あり！最短即日回答！ | お電話は1社のみ！最短即日査定 | お電話は1社のみ！最短即日査定 | 弁護士監修あり！最短即日査定！ |
| 送信ボタン | 無料査定を申し込む | 無料査定を申し込む | 最短即日査定を申し込む | 入力した内容で相談する | 入力した内容で相談する |
| フォーム下の電話案内 | あり | あり | あり | なし | あり |
| フォーム下の安心案内3項目 | あり | あり | あり | なし | あり |
| サンクスページの電話案内 | なし | なし | なし | あり | あり |
| 本番受付・通知・計測 | 有効 | 有効 | 有効 | 有効 | 無効 |
| 記録する送信元 | `main-variant-b-form` | `lp-1` | `lp-2` | `lp-3` | `test-environment`。外部には送らない |

標準プルダウンはHTMLの `select` を使用します。都道府県の選択肢は、東京都・神奈川県・千葉県・埼玉県・大阪府・奈良県・福岡県・長野県・山梨県・熊本県・長崎県・高知県・その他です。`data-native-prefecture` 属性によって、JavaScriptによる独自UIへの置き換えを止めます。

同意チェックは利用者が解除できます。`required` を維持しているため、解除した状態ではフォームを送信できません。

### lp/3のCTAと下部構成

補足文は4か所で、次の表記に統一しています。

```text
＼ お電話は1社のみ！最短即日査定 ／
```

フォームへ移動するCTAは、冒頭・悩み紹介後・比較後・FAQ・フォーム直前の5か所です。文言はすべて「無料相談はこちら」、移動先は `#final-inputs` です。フォーム送信ボタンは「入力した内容で相談する」です。

lp/3ではPCでも冒頭・フォーム直前のCTA補足文を表示します。補足文4か所はPC・スマートフォン共通です。CTAボタンはPCで5か所、スマートフォンではFAQ内を除く4か所に表示します。lp/2のPCでは、冒頭の補足文とフォーム直前のCTAブロックを非表示にする既存の仕様を維持しています。

フォーム下の `.closing-phone` と `.closing-trust` をHTMLから削除しています。後者は「秘密厳守」「相談無料」「しつこい営業なし」の案内です。フォームの後には、イエトクのロゴ・運営会社情報・ポリシーへのリンクが続きます。冒頭や本文中の電話案内、専用サンクスページの電話番号は掲載しています。

## ページの基本構造

```text
冒頭：ロゴ、見出し、CTA、電話案内
  ↓
悩みの紹介
  ↓
リースバックの仕組み
  ↓
サポート・安心材料
  ↓
弁護士監修の紹介（lp/2・lp/3・test）
  ↓
通常売却との比較
  ↓
利用事例
  ↓
相談から契約までの流れ・スタッフ紹介
  ↓
FAQ
  ↓
最終案内・フォーム
  ↓
電話案内・安心案内（lp/3では省略）
  ↓
ロゴ・運営会社情報・ポリシーリンク
```

## ファイル構成

```text
index.html                         ルートのLP
thanks.html                        ルート・lp/1・lp/2共通のサンクス
privacy-policy.html                共通ポリシー
operator.html                      共通運営者情報
assets/
  variant-b/                       基本CSS・画面動作・画像
  form-submit.js                   ルートの本番送信処理
  thanks-tracking.js               共通サンクスの計測開始判定
  affilicode-tracking.js            共通の広告識別子保存・成果計測
  gtm.js                           GTMの読み込み
  thanks.css                       サンクスページの基本スタイル
lp/
  1/
    index.html
    shared/                        lp/1内に置いた基本素材・処理のコピー
  2/
    index.html
    shared/                        lp/2内に置いた基本素材・処理のコピー
    assets/variant-b/              lp/2専用の追加CSS・画像
  3/
    index.html
    thanks.html                    電話案内付き専用サンクス
    shared/                        lp/2から複製。計測処理はlp/3のURLに対応
    assets/
      variant-b/                   lp/2から複製した追加CSS・画像
      thanks-contact.css           専用サンクスの電話案内・見出しの調整
test/
  index.html
  thanks.html
  assets/                          確認用の追加CSS・画像・模擬送信処理
netlify/
  functions/submission-created.mjs  Netlifyの問い合わせ受付イベント
  lib/                             Chatwork通知・GAS連携処理
integrations/google-sheets.gs       GASのコード控え
tests/                             外部通信を模擬する自動テスト
_redirects                         URLの転送・管理ファイルの公開防止
_headers                           セキュリティ・検索除外・キャッシュ設定
netlify.toml                       ビルド・Functionsの設定
```

`lp/*/shared/` は各バージョンの中に置いたコピーです。名前が `shared` でも、他バージョンやルートの `assets/` と自動同期する仕組みはありません。`lp/2` を更新しても `lp/3` は変わりません。

一方、ポリシーと運営者情報は全ページで同じファイルを参照します。`test/` はルートの基本CSS・画像・画面動作も参照するため、ルートの `assets/` の変更が確認用ページへ影響する場合があります。

### CSSの適用順序

lp/2・lp/3のLPは次の順でCSSを読み込みます。後から読み込むルールによって表示が上書きされます。

1. `shared/variant-b/mobile.css`：基本のレイアウト・フォーム・画像
2. `assets/variant-b/overrides.css`：追加調整
3. `assets/variant-b/fullscreen-desktop.css`：PC向けの配置
4. `assets/variant-b/reading-layout.css`：PCの本文を中央の縦並びへ調整

PC用の切り替え基準は横幅900pxです。CSSを変更するときは、同じセレクターに後続の上書きがあるかを確認します。

lp/3のサンクスページは `shared/thanks.css` の後に `assets/thanks-contact.css` を読み込みます。

## フォーム受付・通知の流れ

```text
本番LPのフォーム
  → 入力チェック・同意チェック
  → Netlify FormsへPOST /（フォーム名：leaseback-contact）
      ├→ Netlify側に原本を保存
      ├→ Netlify側で設定したメール通知
      └→ submission-created
          ├→ Chatworkへ担当者To・問い合わせ日時付きの通知
          └→ 署名付きでGASへ送信 → スプレッドシートへ転記
  → ブラウザは送信成功後に対象のサンクスページへ移動
```

全本番LPでフォーム名は共通です。バージョンの識別には隠し項目の「送信元」を使い、「送信ページ」には実際のURLを記録します。lp/3でも既存のChatwork・シート連携を使用します。連携設定の詳細は [FORM_SETUP.md](FORM_SETUP.md) を参照してください。

サンクスへの遷移はNetlifyの受付成功を示します。Chatwork・GASの成功は別途確認が必要です。両連携は独立して実行され、失敗はFunctionsログに記録されます。

`integrations/google-sheets.gs` をローカルで変更しても、公開中のGASには自動反映されません。GASの変更には、Apps Script側での保存と既存デプロイの更新が必要です。

## サンクスページと成果計測

送信処理は、成功時に `sessionStorage` の `leaseback_submission_pending` を設定します。サンクスページの `thanks-tracking.js` はこの値を一度だけ消費してGTM・成果計測を読み込みます。直接表示や再読み込みでは計測しません。

| 対象 | 遷移先 | 使用する計測ファイル |
| --- | --- | --- |
| ルート・lp/1・lp/2 | `/thanks.html` | `/assets/thanks-tracking.js` と `/assets/affilicode-tracking.js` |
| lp/3 | `/lp/3/thanks.html` | `/lp/3/shared/thanks-tracking.js` と `/lp/3/shared/affilicode-tracking.js` |
| test | `/test/thanks.html` | 計測なし |

lp/3の成果計測は `/lp/3/thanks.html` と、Netlifyの拡張子なしURL `/lp/3/thanks` に対応します。サンクスのURLを変える場合は、フォームの `action`・`data-success-url`、計測スクリプトの読み込み先、成果計測のURL判定を併せて確認します。GTMコンテナの設定はリポジトリ外で管理されます。

## 修正するファイルの目安

| 修正内容 | 主な変更先 |
| --- | --- |
| 特定版の文言・フォーム項目・下部ブロック | 対象の `lp/N/index.html` |
| lp/2・lp/3のPCの読み幅・余白 | 対象の `assets/variant-b/reading-layout.css` |
| 特定版の基本表示・画面動作 | 対象の `shared/variant-b/` |
| lp/3の電話付きサンクス | `lp/3/thanks.html` と `lp/3/assets/thanks-contact.css` |
| 全版のChatwork・シート連携 | `netlify/lib/` とNetlifyの本番環境変数 |
| GASの転記仕様 | `integrations/google-sheets.gs` とApps Scriptの既存デプロイ |

## 検証と公開

`node --test "tests/*.test.mjs"` で、公開ファイルの参照・本番フォームの識別・通知と転記・lp/3の送信遷移と成果計測を検証します。外部通信は模擬し、実際のフォーム送信・メール通知・Chatwork投稿・シートへの転記は行いません。

表示確認ではPC・スマートフォンの両方を確認します。確認用の `/test/` は本番LPそのものではないため、変更した `/lp/N/` の画面も確認対象です。実際の本番フォームを送る検証は、通知を送ってよいと明示された場合だけ行います。

本番への公開手順は [README.md](README.md) を参照してください。`main` へのpushはNetlifyの公開を起動するため、ローカル確認と分けて実施します。この文書と `FORM_SETUP.md` はNetlifyの静的公開から除外しています。

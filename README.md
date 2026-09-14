# リースバックLP

Netlifyで公開する静的LPです。1つのNetlifyサイトで本番とクライアント確認用ページを運用します。

ページ構成・バージョンごとの違い・修正箇所の目安は [LP_STRUCTURE.md](LP_STRUCTURE.md) にまとめています。

## 公開範囲

- 本番: `/`。広告計測と `leaseback-contact` のNetlify Forms送信を有効にします。
- 番号付き本番LP: `/lp/1/`、`/lp/2/`、`/lp/3/`。各版を独立したファイル群で管理し、受付・通知は共通です。
- クライアント確認: `/test/`。パスワードなしで閲覧でき、広告計測・フォーム保存・営業通知を行いません。
- `/thanks.html` は本番フォームの送信成功直後だけコンバージョンを送ります。直接表示や再読み込みでは送りません。
- lp/3は電話案内付きの `/lp/3/thanks.html` へ遷移し、同じく送信成功直後だけ計測します。
- サイト全体に `noindex, nofollow, noarchive` を付け、検索結果への掲載を抑止します。

`/test/` はURLを知っている人なら閲覧できます。検索結果への掲載は抑止していますが、機密情報は置かないでください。

## ディレクトリ

```text
index.html                 本番LP
assets/                    本番とテストで共有する素材・処理
lp/1/, lp/2/, lp/3/        番号付きLPと各版の素材・処理
test/                      クライアント確認用ページと専用素材
tests/                     デプロイ前の自動テスト
netlify/functions/         本番フォームの受付イベント
netlify/lib/               Chatwork通知・Googleスプレッドシート連携
integrations/              GASコードの控え
LP_STRUCTURE.md            全体構造・版ごとの仕様・修正箇所の案内
```

`test/` は確認サイト、`tests/` は自動テストです。共有CSSや共有JavaScriptの変更は両方に反映されるため、本番とテストの表示を確認してください。テストだけの変更は `test/` 内に置きます。

## 変更と公開

1. 作業ブランチで変更します。
2. `node --test "tests/*.test.mjs"` を実行します。Netlifyでもデプロイ前に同じテストが走ります。
3. NetlifyのDraft Deployで本番LPと `/test/` を確認します。
4. 承認後、`allpass-blip/leaseback` の `main` へfast-forwardでpushします。
5. 同じコミットを `yuma2004/--lp` の `main` にpushし、2つのリポジトリを一致させます。
6. NetlifyのProduction Deployが対象コミットで完了したことを確認します。

履歴の書き換えやforce pushは行いません。公開後に問題が出た場合は、Netlifyで直前の成功デプロイを再公開してから、問題のコミットを `git revert` し、両方の `main` へpushします。

## Netlify設定

- Base directory: 未指定
- Build command: `node --test "tests/*.test.mjs"`（`netlify.toml` で設定済み）
- Publish directory: `.`
- フォーム通知: Netlify管理画面の `Form submission notifications`
- Chatwork通知: [FORM_SETUP.md](FORM_SETUP.md) の手順に従います。

GitHubリポジトリの非公開化は別作業です。現状では秘密情報をコミットしないでください。

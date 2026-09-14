import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([
  ".claude",
  ".codex-remote-attachments",
  ".git",
  ".impeccable",
  ".netlify",
  ".playwright-cli",
  "design",
  "output",
  "sites-test-backup",
  "tests",
  "tmp",
]);

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function filesUnder(directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      return [];
    }
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function localTarget(sourceFile, reference) {
  const clean = reference.split("#", 1)[0].split("?", 1)[0];
  if (!clean || /^(?:https?:|tel:|mailto:|data:|javascript:)/i.test(clean)) return null;

  if (clean === "/") return join(root, "index.html");
  const target = clean.startsWith("/")
    ? join(root, clean.slice(1))
    : resolve(dirname(sourceFile), clean);
  return clean.endsWith("/") ? join(target, "index.html") : target;
}

test("本番LPはルートにあり、Netlifyフォームと外部GTMローダーを使う", () => {
  const html = read("index.html");
  assert.match(html, /<script src="\/assets\/gtm\.js\?v=20260829"><\/script>/);
  assert.match(html, /name="leaseback-contact"/);
  assert.match(html, /data-netlify="true"/);
  assert.match(html, /netlify-honeypot="bot-field"/);
  assert.doesNotMatch(html, /function\(w,d,s,l,i\)/);
});

test("クライアント確認用ページは計測も本番送信も行わない", () => {
  const html = read("test/index.html");
  const formScript = read("test/assets/form-submit.js");
  assert.doesNotMatch(html, /googletagmanager|affilicode|data-netlify|form-name/i);
  assert.match(html, /\.\/assets\/form-submit\.js/);
  assert.match(html, /\.\.\/assets\/variant-b\/mobile\.css/);
  assert.match(html, /\.\/assets\/variant-b\/overrides\.css/);
  assert.doesNotMatch(html, /(?:src|href)=["']\/(?:test\/)?assets\//);
  assert.match(formScript, /event\.preventDefault\(\)/);
  assert.doesNotMatch(formScript, /fetch\s*\(/);
});

test("確認用LPはリースバック訴求と更新済みの査定導線を表示する", () => {
  const html = read("test/index.html");
  assert.match(html, /自宅を売っても[\s\S]*住み続けられる！[\s\S]*<h1>リースバック一括査定<br \/>最高額で自宅が売れる<\/h1>/);
  assert.doesNotMatch(html, /住み続けれる！|自宅を売却しても|そのまま住み続ける/);
  assert.equal((html.match(/class="hero-needs__item"/g) ?? []).length, 0);
  assert.equal((html.match(/弁護士監修あり！最短即日査定！/g) ?? []).length, 4);
  assert.equal((html.match(/無料相談はこちら/g) ?? []).length, 5);
  assert.doesNotMatch(html, /class="floating-cta/);
  assert.doesNotMatch(html, /こんなお悩みに|売却後も、賃貸として今の家に住める。|複数社の買取価格と家賃条件を無料で比較できます。/);
  assert.doesNotMatch(html, /監修の範囲|リースバック業務の監修|契約上の確認点を整理/);
  assert.doesNotMatch(html, /弁護士と連携した相談体制|提携|セミナー/);
});

test("/test配下はパスワードなしで公開する", () => {
  const config = read("netlify.toml");
  const testHtml = read("test/index.html");
  const testThanks = read("test/thanks.html");
  assert.doesNotMatch(config, /test-auth|\[\[edge_functions\]\]/);
  assert.equal(existsSync(join(root, "netlify/edge-functions/test-auth.ts")), false);
  assert.doesNotMatch(`${testHtml}${testThanks}`, /logout|type="password"/i);
  assert.match(config, /command = "node --test \\"tests\/\*\.test\.mjs\\""/);
});

test("旧LP経路はルートへ恒久転送し、旧ページは残さない", () => {
  const redirects = read("_redirects");
  for (const route of ["/index.html", "/variant-b", "/variant-b-desktop"]) {
    assert.match(redirects, new RegExp(`^${route.replace("/", "\\/")}\\S* \\/ 301!$`, "m"));
  }
  assert.doesNotMatch(redirects, /^\/ \/variant-b\/ 200!$/m);
  assert.equal(existsSync(join(root, "variant-b")), false);
  assert.equal(existsSync(join(root, "variant-b-desktop")), false);
});

test("番号付きLPは独立した実体を持ち、本番と同じ受付・計測を使う", () => {
  for (const version of [1, 2, 3]) {
    const html = read(`lp/${version}/index.html`);
    assert.match(html, /name="leaseback-contact"/);
    assert.match(html, /data-netlify="true"/);
    assert.match(html, /name="form-name" value="leaseback-contact"/);
    assert.match(html, /netlify-honeypot="bot-field"/);
    const successUrl = version === 3 ? "/lp/3/thanks.html" : "/thanks.html";
    assert.ok(html.includes(`data-success-url="${successUrl}"`));
    assert.ok(html.includes(`action="${successUrl}"`));
    assert.ok(html.includes(`name="送信元" value="lp-${version}"`));
    assert.ok(html.includes(`name="送信ページ" value="/lp/${version}/"`));
    assert.match(html, /src="\.\/shared\/gtm\.js/);
    assert.match(html, /src="\.\/shared\/affilicode-tracking\.js/);
    assert.match(html, /src="\.\/shared\/form-submit\.js/);
    assert.doesNotMatch(html, /leaseback-contact-test|test-environment|テスト環境|["'](?:\.\.\/|\/)assets\//);
    assert.match(read(`lp/${version}/shared/form-submit.js`), /fetch\("\/",/);
    assert.match(read(`lp/${version}/shared/form-submit.js`), /leaseback_submission_pending/);
    assert.doesNotMatch(read('_redirects'), new RegExp(`^/lp/${version}/? / 301!$`, 'm'));
  }
  assert.match(read('lp/2/index.html'), /reading-layout\.css/);
  assert.match(read('lp/3/index.html'), /reading-layout\.css/);
  assert.doesNotMatch(read('lp/1/index.html'), /reading-layout\.css/);
});


test("制作資料と作業ファイルはWeb公開から除外する", () => {
  const excluded = new Set(read(".netlifyignore").split(/\r?\n/).map((line) => line.trim()));
  for (const directory of ["design/", ".codex-remote-attachments/", "tests/", "integrations/", "tmp/", "output/"]) {
    assert.ok(excluded.has(directory), `${directory} must not be published`);
  }
  assert.ok(excluded.has("LP_STRUCTURE.md"));
});

test("コンバージョンは本番フォーム送信直後の一度だけ許可する", () => {
  const submit = read("assets/form-submit.js");
  const thanks = read("assets/thanks-tracking.js");
  const affiliate = read("assets/affilicode-tracking.js");
  assert.match(submit, /sessionStorage\.setItem\("leaseback_submission_pending", "1"\)/);
  assert.match(thanks, /sessionStorage\.getItem\(marker\) !== "1"/);
  assert.match(thanks, /sessionStorage\.removeItem\(marker\)/);
  assert.match(thanks, /window\.__leasebackConversionReady = true/);
  assert.match(affiliate, /window\.__leasebackConversionReady === true/);
});

test("本番と確認用の完了ページは共通スタイルを使う", () => {
  const production = read("thanks.html");
  const preview = read("test/thanks.html");
  const stylesheetPattern = /href="(\/assets\/thanks\.css\?v=\d+)"/;

  for (const html of [production, preview]) {
    assert.match(html, stylesheetPattern);
    assert.doesNotMatch(html, /<style>/);
  }

  assert.equal(
    production.match(stylesheetPattern)[1],
    preview.match(stylesheetPattern)[1],
  );
});

test("ローカルのバックアップはGitとNetlifyの対象外にする", () => {
  assert.match(read(".gitignore"), /^sites-test-backup\/$/m);
  assert.match(read(".netlifyignore"), /^sites-test-backup\/$/m);
});

test("公開HTMLとCSSのローカル参照先が存在する", () => {
  const missing = [];
  for (const file of filesUnder()) {
    const extension = extname(file).toLowerCase();
    if (extension !== ".html" && extension !== ".css") continue;
    const contents = readFileSync(file, "utf8");
    const references = extension === ".html"
      ? [...contents.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map((match) => match[1])
      : [...contents.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((match) => match[1]);

    for (const reference of references) {
      const target = localTarget(file, reference);
      if (target && !existsSync(target)) {
        missing.push(`${file.slice(root.length + 1)} -> ${reference}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

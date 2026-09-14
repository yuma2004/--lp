import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = path => readFileSync(new URL(`../lp/3/${path}`, import.meta.url), "utf8");
const pendingKey = "leaseback_submission_pending";

function pageSession(pathname, storage = new Map()) {
  const loadedScripts = [];
  const conversions = [];
  const context = {
    location: { pathname, search: "" },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    localStorage: { getItem: () => null },
    document: {
      cookie: "",
      createElement: () => ({}),
      head: { appendChild(script) { loadedScripts.push(script.src); } },
    },
    XMLHttpRequest: class {
      open(method, url) { this.method = method; this.url = url; }
      send() { conversions.push({method: this.method, url: this.url}); }
    },
  };
  context.window = context;
  return {context, loadedScripts, conversions, storage};
}

function openThanks(session) {
  runInNewContext(read("shared/thanks-tracking.js"), session.context);
  for (const src of session.loadedScripts.filter(src => src.includes("affilicode-tracking.js"))) {
    assert.equal(src.split("?")[0], "/lp/3/shared/affilicode-tracking.js");
    runInNewContext(read("shared/affilicode-tracking.js"), session.context);
  }
}

test("lp/3送信成功後だけ専用サンクスで計測し、再読込や直接表示では計測しない", () => {
  for (const path of ["/lp/3/thanks.html", "/lp/3/thanks"]) {
    const storage = new Map([[pendingKey, "1"]]);
    const first = pageSession(path, storage);
    openThanks(first);
    assert.equal(first.conversions.length, 1);
    assert.deepEqual(first.conversions[0], {method:"GET", url:"https://all-pass.net/track.php?p=pid373z5nmix"});
    assert.ok(first.loadedScripts.includes("/lp/3/shared/gtm.js?v=20260829"));
    assert.equal(storage.has(pendingKey), false);
    // A second script execution on the same page must not double count.
    runInNewContext(read("shared/affilicode-tracking.js"), first.context);
    assert.equal(first.conversions.length, 1);
    const reload = pageSession(path, storage);
    openThanks(reload);
    assert.deepEqual(reload.loadedScripts, []);
    assert.deepEqual(reload.conversions, []);
    const direct = pageSession(path);
    openThanks(direct);
    assert.deepEqual(direct.loadedScripts, []);
  }
});

test("lp/3のLP表示・他のサンクスURLではlp/3の成果を発火しない", () => {
  for (const path of ["/lp/3/", "/thanks.html", "/test/thanks.html", "/lp/2/thanks.html"]) {
    const session = pageSession(path);
    session.context.__leasebackConversionReady = true;
    runInNewContext(read("shared/affilicode-tracking.js"), session.context);
    assert.deepEqual(session.conversions, []);
  }
});

test("ブラウザ保存領域を使えなくてもサンクス表示を妨げず、計測しない", () => {
  const session = pageSession("/lp/3/thanks.html");
  session.context.sessionStorage.getItem = () => { throw new Error("Storage disabled"); };
  assert.doesNotThrow(() => openThanks(session));
  assert.deepEqual(session.loadedScripts, []);
});

function formSession({valid = true, status = 200} = {}) {
  const html = read("index.html");
  const session = pageSession("/lp/3/");
  const calls = [];
  const button = {disabled:false, textContent:"入力した内容で相談する"};
  const message = {textContent:"", dataset:{}};
  const fields = new Map([...html.matchAll(/<input\b[^>]*type="hidden"[^>]*>/g)].map(([tag]) => [
    tag.match(/name="([^"]+)"/)?.[1], tag.match(/value="([^"]*)"/)?.[1],
  ]));
  fields.set("お名前", "local-only");
  let submitHandler;
  const form = {
    dataset: {successUrl:html.match(/data-success-url="([^"]+)"/)[1]},
    querySelector: selector => selector === '[type="submit"]' ? button : message,
    querySelectorAll: () => [],
    reportValidity: () => valid,
    addEventListener(event, handler) { assert.equal(event, "submit"); submitHandler = handler; },
    reset() {},
  };
  session.context.document.addEventListener = (event, handler) => { assert.equal(event, "DOMContentLoaded"); handler(); };
  session.context.document.querySelectorAll = () => [form];
  session.context.location.href = "https://example.test/lp/3/?utm_source=local";
  session.context.FormData = class { constructor(target) { assert.equal(target, form); this.fields = new Map(fields); } set(k,v) {this.fields.set(k,v);} [Symbol.iterator]() {return this.fields[Symbol.iterator]();} };
  session.context.URLSearchParams = URLSearchParams;
  session.context.fetch = async (url, options) => { calls.push({url, options}); return {ok:status===200}; };
  runInNewContext(read("shared/form-submit.js"), session.context);
  return {...session, calls, button, message, async submit() {
    let prevented = false;
    submitHandler({preventDefault() {prevented = true;}});
    await new Promise(setImmediate);
    assert.equal(prevented, true);
  }};
}

test("lp/3の本番フォーム名・送信元・送信ページを保持して専用サンクスへ遷移する（通信はモック）", async () => {
  const session = formSession();
  await session.submit();
  assert.equal(session.calls.length, 1);
  assert.equal(session.calls[0].url, "/");
  assert.equal(session.calls[0].options.method, "POST");
  const data = new URLSearchParams(session.calls[0].options.body);
  assert.equal(data.get("form-name"), "leaseback-contact");
  assert.equal(data.get("送信元"), "lp-3");
  assert.equal(data.get("送信ページ"), "https://example.test/lp/3/?utm_source=local");
  assert.equal(session.storage.get(pendingKey), "1");
  assert.equal(session.context.location.href, "/lp/3/thanks.html");
});

test("入力不備・同意未選択の検証エラーでは送信も計測許可も行わない", async () => {
  const session = formSession({valid:false});
  await session.submit();
  assert.deepEqual(session.calls, []);
  assert.equal(session.storage.has(pendingKey), false);
  assert.equal(session.context.location.href, "https://example.test/lp/3/?utm_source=local");
});

test("フォームの送信失敗では遷移せず、送信ボタンと入力可能状態を戻す", async () => {
  const session = formSession({status:503});
  await session.submit();
  assert.equal(session.context.location.href, "https://example.test/lp/3/?utm_source=local");
  assert.equal(session.storage.has(pendingKey), false);
  assert.equal(session.button.disabled, false);
  assert.equal(session.button.textContent, "入力した内容で相談する");
  assert.equal(session.message.dataset.status, "error");
});

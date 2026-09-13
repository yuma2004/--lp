import assert from "node:assert/strict";
import test from "node:test";
import { buildChatworkMessage, notifySubmission } from "../netlify/lib/chatwork.mjs";
import handler from "../netlify/functions/submission-created.mjs";

const env = { CHATWORK_API_TOKEN: "mock-token", CHATWORK_ROOM_ID: "123", CHATWORK_TO_ACCOUNT_IDS: "111,222,333" };
const payload = { form_name: "leaseback-contact", created_at: "2026-09-13T21:18:44Z", data: { お名前: "通知処理のローカル検証", 送信元: "lp-2", 市区町村: "新宿区", 送信ページ: "https://example.test/lp/2/" } };

test("form-nameがデータに含まれない実際のNetlify形式でも通知する", async () => {
  const calls = [];
  const result = await notifySubmission(payload, { env, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response(null, { status: 200 });
  }});
  assert.deepEqual(result, { sent: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.chatwork.com/v2/rooms/123/messages");
  assert.equal(calls[0].options.method, "POST");
  assert.match(calls[0].options.body.get("body"), /送信元：lp-2/);
  assert.match(calls[0].options.body.get("body"), /^\[To:111\] \[pname:111\]\n\[To:222\] \[pname:222\]\n\[To:333\] \[pname:333\]\n/);
  assert.match(calls[0].options.body.get("body"), /問い合わせ日時：2026\/09\/14 06:18:44（日本時間）/);
  assert.match(calls[0].options.body.get("body"), /市区町村：新宿区/);
});

test("全本番URLを共通のフォームとして扱う", async () => {
  for (const source of ["production", "lp-1", "lp-2", "lp-3"]) {
    let calls = 0;
    await notifySubmission({ ...payload, data: { ...payload.data, 送信元: source } }, {
      env, fetchImpl: async () => { calls++; return new Response(); },
    });
    assert.equal(calls, 1, source);
  }
});

test("テスト・別フォーム・スパムは通知せず、正式フォーム名を優先する", async () => {
  for (const input of [
    {}, { form_name: "leaseback-contact-test", data: payload.data },
    { form_name: "other", data: { "form-name": "leaseback-contact" } },
    { ...payload, spam: true }, { ...payload, data: { "bot-field": "spam" } },
  ]) {
    assert.deepEqual(await notifySubmission(input, { env, fetchImpl: () => assert.fail("外部送信禁止") }), { skipped: true });
  }
});

test("一時的なHTTP障害と接続障害を最大3回まで再試行する", async () => {
  for (const failure of [429, 503, "network"]) {
    let calls = 0;
    const waits = [];
    const result = await notifySubmission(payload, { env, sleep: async ms => waits.push(ms), fetchImpl: async () => {
      calls++;
      if (calls === 3) return new Response();
      if (failure === "network") throw new TypeError("mock connection failure");
      return new Response(null, { status: failure });
    }});
    assert.deepEqual(result, { sent: true });
    assert.deepEqual(waits, [500, 1000]);
    assert.equal(calls, 3);
  }
});

test("認証エラーは再試行せず、設定不足では外部接続しない", async () => {
  let calls = 0;
  await assert.rejects(notifySubmission(payload, { env, fetchImpl: async () => {
    calls++; return new Response(null, { status: 401 });
  }}), /HTTP 401/);
  assert.equal(calls, 1);
  await assert.rejects(notifySubmission(payload, { env: {}, fetchImpl: () => assert.fail("外部接続禁止") }), /must be configured/);
});

test("Netlifyの生リクエストを受け付けて通知処理につなぐ（外部通信はモック）", async (t) => {
  const previous = { token: process.env.CHATWORK_API_TOKEN, room: process.env.CHATWORK_ROOM_ID, to: process.env.CHATWORK_TO_ACCOUNT_IDS };
  const previousSheetsEnabled = process.env.GOOGLE_SHEETS_ENABLED;
  process.env.GOOGLE_SHEETS_ENABLED = "false";
  process.env.CHATWORK_API_TOKEN = env.CHATWORK_API_TOKEN;
  process.env.CHATWORK_ROOM_ID = env.CHATWORK_ROOM_ID;
  process.env.CHATWORK_TO_ACCOUNT_IDS = env.CHATWORK_TO_ACCOUNT_IDS;
  t.after(() => {
    if (previousSheetsEnabled === undefined) delete process.env.GOOGLE_SHEETS_ENABLED;
    else process.env.GOOGLE_SHEETS_ENABLED = previousSheetsEnabled;
    for (const [key, value] of [["CHATWORK_API_TOKEN",previous.token],["CHATWORK_ROOM_ID",previous.room],["CHATWORK_TO_ACCOUNT_IDS",previous.to]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const mock = t.mock.method(globalThis, "fetch", async () => new Response());
  const response = await handler(new Request("https://example.test/.netlify/functions/submission-created", {method:"POST",body:JSON.stringify({payload})}));
  assert.equal(response.status, 204);
  assert.equal(mock.mock.callCount(), 1);
});

test("Chatwork記法を入力値から注入できない", () => {
  const message = buildChatworkMessage({
    お名前: "[To:999] 攻撃者",
    メールアドレス: "[info]test@example.com[/info]",
  }, env.CHATWORK_TO_ACCOUNT_IDS, payload.created_at);
  assert.match(message, /お名前：［To:999］ 攻撃者/);
  assert.match(message, /メールアドレス：［info］test@example\.com［\/info］/);
  assert.doesNotMatch(message, /^\[To:999\]/m);
});

test("通知先IDは重複を除いて全員をToに記載する", () => {
  const message = buildChatworkMessage({}, "123, 456,123", payload.created_at);
  assert.match(message, /^\[To:123\] \[pname:123\]\n\[To:456\] \[pname:456\]\n/);
  assert.equal(message.match(/\[To:123\]/g).length, 1);
  assert.match(message, /物件種別：未入力/);
});

test("Toの未設定・不正値と日時の欠落では、通知せず設定エラーにする", async () => {
  for (const to of [undefined, "", "123,invalid,456", "123,", "0", "[To:123]"]) {
    await assert.rejects(notifySubmission(payload, {
      env: {...env, CHATWORK_TO_ACCOUNT_IDS: to}, fetchImpl: () => assert.fail("外部送信禁止"),
    }), /CHATWORK_TO_ACCOUNT_IDS/);
  }
  for (const created_at of [undefined, "invalid", 123456]) {
    await assert.rejects(notifySubmission({...payload, created_at}, {
      env, fetchImpl: () => assert.fail("外部送信禁止"),
    }), /created_at/);
  }
});

test("受付日時をJSTで表示し、入力された日時や実行時刻を使用しない", () => {
  for (const [input, expected] of [
    ["2026-12-31T15:00:00Z", "2027/01/01 00:00:00"],
    ["2026-09-14T06:18:44+09:00", "2026/09/14 06:18:44"],
  ]) {
    const message = buildChatworkMessage({問い合わせ日時:"偽の日時"}, env.CHATWORK_TO_ACCOUNT_IDS, input);
    assert.ok(message.includes(`問い合わせ日時：${expected}（日本時間）`));
    assert.doesNotMatch(message, /偽の日時/);
  }
});

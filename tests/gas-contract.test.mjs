import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createHmac } from "node:crypto";
import { buildEnvelope, syncSubmission } from "../netlify/lib/google-sheets.mjs";
import { notifySubmission } from "../netlify/lib/chatwork.mjs";
import { processSubmission } from "../netlify/lib/process-submission.mjs";

const secret = "local-only-test-secret-".repeat(3);
const payload = { id: "local_test_123", form_name: "leaseback-contact", created_at: "2026-09-13T21:18:44Z", data: { お名前: "=IMPORTXML()", 電話番号: "09000000000", 送信元: "lp-2" } };
const source = readFileSync(new URL("../integrations/google-sheets.gs", import.meta.url), "utf8");
const requiredHeaders = ["ステータス", "問い合わせ日時", "送信元", "物件種別", "都道府県", "市区町村", "売却希望時期", "お名前", "電話番号", "メールアドレス", "同意状況", "送信ページ"];
// Actual header layout read from the live sheet on 2026-09-14. No customer data.
const currentHeaders = [...requiredHeaders, "担当者", "査定状況", "状況、備考", "NA", "追い１", "追い２", "追い３", "追い４", "追い５", "追い６"];

function gas({ headers = currentHeaders, records = [], lockAvailable = true, failFirstFlush = false, maxRows = 1000, maxColumns = 26 } = {}) {
  const rows = structuredClone([headers, ...records]);
  const formats = new Map();
  let writes = 0;
  let releases = 0;
  let flushes = 0;
  const sheet = {
    getName: () => "シート1",
    getSheetId: () => 0,
    getLastRow: () => rows.length,
    getLastColumn: () => Math.max(...rows.map(row => row.reduce((last, value, i) => value !== "" ? i + 1 : last, 0))),
    getMaxRows: () => maxRows,
    getMaxColumns: () => maxColumns,
    insertRowsAfter(after, count) { assert.equal(after, maxRows); maxRows += count; writes++; },
    insertColumnsAfter(after, count) { assert.equal(after, maxColumns); maxColumns += count; writes++; },
    getRange(row, col, height = 1, width = 1) {
      assert.ok(row >= 1 && col >= 1 && height >= 1 && width >= 1);
      assert.ok(row + height - 1 <= maxRows && col + width - 1 <= maxColumns);
      return {
        getDisplayValues: () => Array.from({length:height}, (_,i) => Array.from({length:width}, (_,j) => String(rows[row-1+i]?.[col-1+j] ?? ""))),
        setValue(value) { this.setValues([[value]]); },
        setNumberFormat(value) {
          for (let i = 0; i < height; i++) for (let j = 0; j < width; j++) formats.set(`${row+i}:${col+j}`, value);
          writes++;
        },
        setValues(values) {
          assert.equal(values.length, height);
          values.forEach((values,i) => {
            assert.equal(values.length, width);
            rows[row-1+i] ??= [];
            values.forEach((value,j) => rows[row-1+i][col-1+j] = value);
          });
          writes++;
        },
        createTextFinder(id) { return {
          matchEntireCell(value) { assert.equal(value, true); return this; },
          useRegularExpression(value) { assert.equal(value, false); return this; },
          findNext() { return rows.slice(row-1, row-1+height).some(values => values[col-1] === id) ? {} : null; },
        }; },
      };
    },
  };
  const context = {
    console: { log() {} },
    ContentService: { MimeType:{JSON:"json"}, createTextOutput: value => ({setMimeType:()=>JSON.parse(value)}) },
    PropertiesService: {getScriptProperties:()=>({getProperty:()=>secret})},
    Utilities:{Charset:{UTF_8:"utf8"},computeHmacSha256Signature:(value,key)=>Array.from(createHmac("sha256",key).update(value).digest())},
    SpreadsheetApp:{
      openById: id => { assert.equal(id,"1EQFmTO6gig3oSexkphOO5rMBACELFQjoIWa7PYNKMwA"); return {getSheets:()=>[sheet]}; },
      flush() { if (++flushes === 1 && failFirstFlush) throw new Error("Simulated lost acknowledgement"); },
    },
    LockService:{getScriptLock:()=>({tryLock:()=>lockAvailable,releaseLock(){ releases++; }})},
  };
  runInNewContext(source,context);
  return { context, rows, formats, counts: () => ({writes, releases}),
    post: envelope => context.doPost({postData:{contents:JSON.stringify(envelope)}}),
    cell: (row, name) => rows[row-1][rows[0].indexOf(name)],
  };
}

test("現行22列の業務欄を維持して末尾に転記し、W列の連携IDで重複を防ぐ", () => {
  const existing = currentHeaders.map((name, i) => i >= 12 ? `existing-${name}` : "existing");
  existing[15] = "=COUNTA(A2:A2)";
  const {post, rows, cell} = gas({records:[existing]});
  const envelope = buildEnvelope(payload, secret);
  assert.deepEqual(post(envelope), {ok:true});
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0].slice(0,22), currentHeaders);
  assert.deepEqual(rows[1], existing);
  assert.equal(rows[0][22], "連携ID");
  assert.equal(cell(3, "連携ID"), payload.id);
  assert.equal(cell(3, "ステータス"), "未対応");
  assert.equal(cell(3, "担当者"), "");
  assert.equal(cell(3, "査定状況"), "");
  assert.equal(cell(3, "お名前"), "'=IMPORTXML()");
  assert.equal(cell(3, "電話番号"), "09000000000");
  assert.deepEqual(post(envelope), {ok:true, duplicate:true});
  assert.equal(rows.length, 3);
});

test("旧13列・追加列・列の並べ替えに追従し、既存の連携IDを使う", () => {
  for (const headers of [
    [...requiredHeaders, "備考"],
    ["担当者", "連携ID", ...requiredHeaders.toReversed(), "独自の列"],
    [...currentHeaders.toReversed(), "連携ID"],
  ]) {
    const {post, rows, cell} = gas({headers});
    assert.equal(post(buildEnvelope(payload, secret)).ok, true);
    assert.equal(cell(2, "送信元"), "lp-2");
    assert.equal(cell(2, "電話番号"), "09000000000");
    assert.equal(cell(2, "連携ID"), payload.id);
    assert.equal(rows[0].filter(name => name === "連携ID").length, 1);
    assert.equal(post(buildEnvelope(payload, secret)).duplicate, true);
  }
});

test("見出しのない列にもデータがあれば、そのさらに右側にID列を追加する", () => {
  const existing = [...currentHeaders.map(() => ""), "=1+1"];
  const {post, rows} = gas({records:[existing]});
  assert.equal(post(buildEnvelope(payload, secret)).ok, true);
  assert.equal(rows[1][22], "=1+1");
  assert.equal(rows[0][23], "連携ID");
  assert.equal(rows[2][23], payload.id);
});

test("日付は日本時間の数値型日時として保存し、電話の先頭0と+を保つ", () => {
  for (const [created_at, expected, phone] of [
    [payload.created_at, "2026-09-14T06:18:44.000Z", "09000000000"],
    ["2026-12-31T15:00:00Z", "2027-01-01T00:00:00.000Z", "+819000000000"],
  ]) {
    const {post, cell, rows, formats} = gas();
    assert.equal(post(buildEnvelope({...payload, created_at, data:{電話番号:phone, 問い合わせ日時:"偽の日時"}}, secret)).ok, true);
    assert.equal(typeof cell(2, "問い合わせ日時"), "number");
    assert.equal(new Date(Math.round((cell(2, "問い合わせ日時") - 25569) * 86400000)).toISOString(), expected);
    assert.equal(formats.get(`2:${rows[0].indexOf("問い合わせ日時")+1}`), "yyyy/mm/dd hh:mm:ss");
    assert.equal(cell(2, "電話番号"), phone.startsWith("+") ? "'" + phone : phone);
    assert.equal(formats.get(`2:${rows[0].indexOf("電話番号")+1}`), "@");
  }
});

test("必須見出しの欠落・重複や連携ID重複では誤った列へ書き込まない", () => {
  for (const headers of [
    currentHeaders.filter(name => name !== "電話番号"),
    [...currentHeaders, "問い合わせ日時"],
    [...currentHeaders, "連携ID", "連携ID"],
  ]) {
    const {post, counts, context} = gas({headers});
    assert.deepEqual(post(buildEnvelope(payload, secret)), {ok:false, retryable:false});
    assert.throws(() => context.checkConfiguration(), /Missing or duplicate/);
    assert.equal(counts().writes, 0);
    assert.equal(counts().releases, 1);
  }
});

test("列・行の上限なら拡張して追記し、既存セルを上書きしない", () => {
  const {post, cell} = gas({maxRows:1, maxColumns:22});
  assert.equal(post(buildEnvelope(payload, secret)).ok, true);
  assert.equal(cell(2, "連携ID"), payload.id);
});

test("ロック競合では書き込まず、書き込み後の応答障害による再試行で重複しない", () => {
  const locked = gas({lockAvailable:false});
  assert.deepEqual(locked.post(buildEnvelope(payload, secret)), {ok:false, retryable:true});
  assert.equal(locked.counts().writes, 0);
  const retried = gas({failFirstFlush:true});
  assert.deepEqual(retried.post(buildEnvelope(payload, secret)), {ok:false, retryable:true});
  assert.deepEqual(retried.post(buildEnvelope(payload, secret)), {ok:true, duplicate:true});
  assert.equal(retried.rows.length, 2);
  assert.equal(retried.counts().releases, 2);
});

test("不正署名・期限切れ・改ざんで書き込まず、GETと設定確認も書き込みゼロ", () => {
  const {post, rows, context, counts} = gas();
  const envelope = buildEnvelope(payload, secret);
  for (const rejected of [
    {...envelope,signature:"0".repeat(64)},
    buildEnvelope(payload,secret,Date.now()-600000),
    {...envelope,payload:envelope.payload.replace("lp-2","lp-1")},
    {...envelope,timestamp:"invalid"},
    buildEnvelope({...payload,data:[]},secret),
  ]) assert.equal(post(rejected).ok, false);
  assert.deepEqual(context.doGet(), {ok:true,service:"leaseback-sheets",version:2});
  context.checkConfiguration();
  assert.equal(rows.length, 1);
  assert.equal(counts().writes, 0);
});

test("NetlifyイベントからTo・日時のCW通知と署名付きGAS転記までを外部通信なしで通す", async () => {
  const simulated = gas();
  const env = {
    CHATWORK_API_TOKEN:"mock", CHATWORK_ROOM_ID:"123", CHATWORK_TO_ACCOUNT_IDS:"111,222,333",
    GOOGLE_SHEETS_ENABLED:"true", GOOGLE_SHEETS_WEBHOOK_URL:"https://script.google.com/macros/s/mock/exec",
    GOOGLE_SHEETS_WEBHOOK_SECRET:secret,
  };
  const messages = [];
  await processSubmission(payload, {
    notify: input => notifySubmission(input, {env, fetchImpl: async (_, options) => {
      messages.push(options.body.get("body")); return new Response();
    }}),
    sync: input => syncSubmission(input, {env, fetchImpl: async (_, options) => {
      return new Response(JSON.stringify(simulated.post(JSON.parse(options.body))));
    }}),
    log() {},
  });
  assert.equal(messages.length, 1);
  assert.match(messages[0], /^\[To:111\] \[pname:111\]\n\[To:222\] \[pname:222\]\n\[To:333\] \[pname:333\]/);
  assert.match(messages[0], /問い合わせ日時：2026\/09\/14 06:18:44（日本時間）/);
  assert.equal(simulated.cell(2,"連携ID"), payload.id);
  assert.equal(simulated.cell(2,"送信元"), payload.data.送信元);
});

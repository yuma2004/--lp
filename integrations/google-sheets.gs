// Standalone webhook for 【イエトク】ユーザー管理シート. No Chatwork/mail calls.
const LEASEBACK_SPREADSHEET_ID = '1EQFmTO6gig3oSexkphOO5rMBACELFQjoIWa7PYNKMwA';
const LEASEBACK_SHEET_ID = 0;
const LEASEBACK_HEADERS = [
  'ステータス', '問い合わせ日時', '送信元', '物件種別', '都道府県', '市区町村',
  '売却希望時期', 'お名前', '電話番号', 'メールアドレス', '同意状況', '送信ページ'
];

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function targetSheet_() {
  const book = SpreadsheetApp.openById(LEASEBACK_SPREADSHEET_ID);
  const sheet = book.getSheets().find(function (item) {
    return item.getSheetId() === LEASEBACK_SHEET_ID;
  });
  if (!sheet) throw new Error('Target sheet is missing');
  return sheet;
}

function sheetSchema_(sheet) {
  // getLastColumn includes operational data/formulas even under a blank header.
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const columns = Object.create(null);
  LEASEBACK_HEADERS.concat(['連携ID']).forEach(function (name) {
    const matches = [];
    headers.forEach(function (header, i) {
      if (header.trim() === name) matches.push(i + 1);
    });
    if (matches.length > 1 || (name !== '連携ID' && matches.length !== 1)) {
      throw new Error('Missing or duplicate sheet header: ' + name);
    }
    columns[name] = matches[0] || lastColumn + 1;
  });
  return { columns: columns, width: Math.max(lastColumn, columns['連携ID']),
    needsIdHeader: columns['連携ID'] > lastColumn };
}

// Read-only configuration check. Never appends a row or sends a notification.
function checkConfiguration() {
  const sheet = targetSheet_();
  const schema = sheetSchema_(sheet);
  const secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  if (!secret || secret.length < 32) throw new Error('Set WEBHOOK_SECRET (32+ characters)');
  console.log('Configuration OK: ' + sheet.getName() + ', ID column ' +
    schema.columns['連携ID'] + ', JST dates. No data written.');
}

function verifyEnvelope_(envelope, secret) {
  if (!secret || secret.length < 32 || !envelope ||
      typeof envelope.payload !== 'string' || envelope.payload.length > 30000 ||
      !Number.isSafeInteger(envelope.timestamp) ||
      Math.abs(Date.now() - envelope.timestamp) > 5 * 60 * 1000 ||
      !/^[a-f0-9]{64}$/.test(envelope.signature || '')) return false;
  const bytes = Utilities.computeHmacSha256Signature(
    String(envelope.timestamp) + '.' + envelope.payload, secret, Utilities.Charset.UTF_8);
  const expected = bytes.map(function (b) {
    return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
  }).join('');
  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ envelope.signature.charCodeAt(i);
  }
  return difference === 0;
}

function cellText_(value) {
  const text = typeof value === 'string' ? value.trim().slice(0, 2000) : '';
  // Prevent formulas and preserve phone numbers with their leading zero.
  return /^[=+@-]/.test(text) ? "'" + text : text;
}

function submissionValues_(submission) {
  if (!submission || !/^[a-zA-Z0-9_-]{1,128}$/.test(submission.id || '') ||
      typeof submission.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(submission.createdAt)) ||
      !submission.data || typeof submission.data !== 'object' || Array.isArray(submission.data)) {
    throw new Error('Invalid submission');
  }
  const values = Object.create(null);
  LEASEBACK_HEADERS.forEach(function (name) { values[name] = cellText_(submission.data[name]); });
  values['ステータス'] = '未対応';
  // Sheets date serial, explicitly JST. Keep dates numeric and sortable, regardless
  // of the spreadsheet/script timezone, without changing the workbook's settings.
  values['問い合わせ日時'] = Date.parse(submission.createdAt) / 86400000 + 25569 + 9 / 24;
  values['連携ID'] = submission.id;
  return values;
}

function doPost(e) {
  let submission;
  let values;
  try {
    if (!e || !e.postData || e.postData.contents.length > 40000) {
      return json_({ ok: false, retryable: false });
    }
    const envelope = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    if (!verifyEnvelope_(envelope, secret)) return json_({ ok: false, retryable: false });
    submission = JSON.parse(envelope.payload);
    values = submissionValues_(submission);
  } catch (_) {
    return json_({ ok: false, retryable: false });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return json_({ ok: false, retryable: true });
  try {
    const sheet = targetSheet_();
    let schema;
    try { schema = sheetSchema_(sheet); }
    catch (_) { return json_({ ok: false, retryable: false }); }
    const idColumn = schema.columns['連携ID'];
    const lastRow = sheet.getLastRow();
    if (!schema.needsIdHeader && lastRow > 1 && sheet.getRange(2, idColumn, lastRow - 1, 1)
        .createTextFinder(submission.id).matchEntireCell(true).useRegularExpression(false)
        .findNext()) {
      return json_({ ok: true, duplicate: true });
    }
    if (schema.width > sheet.getMaxColumns()) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), schema.width - sheet.getMaxColumns());
    }
    if (schema.needsIdHeader) sheet.getRange(1, idColumn).setValue('連携ID');
    const nextRow = lastRow + 1;
    if (nextRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 1);
    // Existing records, statuses, notes and their order are preserved.
    const row = Array(schema.width).fill('');
    Object.keys(values).forEach(function (name) { row[schema.columns[name] - 1] = values[name]; });
    const range = sheet.getRange(nextRow, 1, 1, schema.width);
    range.setNumberFormat('@');
    sheet.getRange(nextRow, schema.columns['問い合わせ日時']).setNumberFormat('yyyy/mm/dd hh:mm:ss');
    // ID and contact data are saved in one operation, so a retry can detect success.
    range.setValues([row]);
    SpreadsheetApp.flush();
    return json_({ ok: true });
  } catch (_) {
    return json_({ ok: false, retryable: true });
  } finally {
    lock.releaseLock();
  }
}

// Opening the deployment URL is always read-only and discloses no contact data.
function doGet() {
  return json_({ ok: true, service: 'leaseback-sheets', version: 2 });
}

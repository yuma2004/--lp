const CHATWORK_API_BASE = "https://api.chatwork.com/v2";
const TARGET_FORM = "leaseback-contact";

const NOTIFICATION_FIELDS = [
  "物件種別",
  "都道府県",
  "市区町村",
  "売却希望時期",
  "お名前",
  "電話番号",
  "メールアドレス",
  "同意状況",
  "送信元",
  "送信ページ",
];

function fieldValue(data, key) {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value : "未入力";
}

// Prevent user input from being interpreted as Chatwork message notation.
function sanitize(value, maxLength = 500) {
  return String(value)
    .replaceAll("[", "［")
    .replaceAll("]", "］")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function toMentions(rawAccountIds) {
  const ids = typeof rawAccountIds === "string"
    ? rawAccountIds.split(",").map((id) => id.trim()) : [];
  if (!ids.length || ids.some((id) => !/^[1-9]\d*$/.test(id))) {
    throw new Error("CHATWORK_TO_ACCOUNT_IDS must contain valid account IDs");
  }
  return [...new Set(ids)].map((id) => `[To:${id}] [pname:${id}]`);
}

function inquiryDate(createdAt) {
  if (typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt))) {
    throw new Error("Submission created_at must be a valid timestamp");
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(createdAt));
  const date = Object.fromEntries(parts.map(({type, value}) => [type, value]));
  return `${date.year}/${date.month}/${date.day} ${date.hour}:${date.minute}:${date.second}（日本時間）`;
}

export function buildChatworkMessage(data, toAccountIds, createdAt) {
  const mentions = toMentions(toAccountIds);
  const heading = `${mentions.join("\n")}\nフォームから新しいお問い合わせがありました。`;

  const details = NOTIFICATION_FIELDS.map((key) => {
    return `${key}：${sanitize(fieldValue(data, key))}`;
  });

  return [
    heading,
    "[info][title]リースバックLP｜新規お問い合わせ（自動通知）[/title]",
    `問い合わせ日時：${inquiryDate(createdAt)}`,
    ...details,
    "[/info]",
  ].join("\n");
}

async function postToChatwork({ token, roomId, message, fetchImpl, sleep }) {
  const endpoint = `${CHATWORK_API_BASE}/rooms/${encodeURIComponent(roomId)}/messages`;
  const body = new URLSearchParams({ body: message });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-ChatWorkToken": token,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      if (attempt === 2) throw new Error("Chatwork connection failed after 3 attempts");
      await sleep(500 * 2 ** attempt);
      continue;
    }

    if (response.ok) return;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 2) {
      throw new Error(`Chatwork API returned HTTP ${response.status}`);
    }

    await sleep(500 * 2 ** attempt);
  }
}

export async function notifySubmission(payload, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const data = payload?.data || {};
  // Netlify stores the form identity in payload.form_name, not in data.
  // The typed formSubmitted adapter drops that metadata; use the raw event.
  const formName = payload?.form_name || data["form-name"];
  if (formName !== TARGET_FORM || payload?.spam === true || data["bot-field"]) {
    return { skipped: true };
  }

  const token = env.CHATWORK_API_TOKEN?.trim();
  const roomId = env.CHATWORK_ROOM_ID?.trim();

  if (!token || !/^\d+$/.test(roomId || "")) {
    throw new Error(
      "CHATWORK_API_TOKEN and CHATWORK_ROOM_ID must be configured in Netlify",
    );
  }

  const message = buildChatworkMessage(
    data,
    env.CHATWORK_TO_ACCOUNT_IDS,
    payload.created_at,
  );

  await postToChatwork({ token, roomId, message, fetchImpl, sleep });
  return { sent: true };
}

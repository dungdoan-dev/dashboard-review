import { createSign } from "node:crypto";

import { LEDGER_SHEETS } from "./ledger-sheets.ts";

type ServiceKey = { client_email: string; private_key: string; token_uri: string };
let cached: { token: string; expires: number } | null = null;

function serviceKey(): ServiceKey {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Chưa cấu hình tài khoản đọc Google Sheet.");
  try { return JSON.parse(raw) as ServiceKey; } catch { throw new Error("Tài khoản đọc Google Sheet cấu hình sai (không phải JSON)."); }
}

async function accessToken() {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const key = serviceKey();
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iss: key.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: key.token_uri, iat: now, exp: now + 3000 })}`;
  const assertion = `${unsigned}.${createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url")}`;
  const res = await fetch(key.token_uri, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  const body = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Không đăng nhập được Google (kiểm tra tài khoản đọc Google Sheet).");
  cached = { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3000) * 1000 };
  return cached.token;
}

async function sheetsGet(path: string) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, { headers: { authorization: `Bearer ${await accessToken()}` }, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 403 || res.status === 404 ? "Không mở được Google Sheet của khách sạn này (chưa chia sẻ cho tài khoản đọc?)." : `Google Sheet lỗi ${res.status}.`);
  return body;
}

/** The ledger tab(s) of one hotel for a month: tabs are named per month ("BK 08/2026"); a single ledger tab is used as is. null when the hotel has no sheet, [] when no tab fits. */
export async function readLedgerTabs(hotel: number, month: string) {
  const sheetId = LEDGER_SHEETS[hotel];
  if (!sheetId) return null;
  const [year, mm] = month.split("-");
  return readTabs(sheetId, (titles) => {
    const ledgers = titles.filter((t) => /bk/i.test(t));
    const ofMonth = (tabs: string[]) => tabs.filter((t) => t.includes(`${mm}/${year}`) || t.includes(`${mm}-${year}`) || t.includes(month));
    const named = ofMonth(ledgers);
    const outside = titles.filter((t) => plain(t).startsWith("dv ngoai")), outsideNamed = ofMonth(outside); // the "DV NGOÀI mm/yyyy" tab rides along, last: a ledger parser must meet the ledgers first
    const dv = outsideNamed.length ? outsideNamed : outside.length === 1 ? outside : [];
    return named.length || ledgers.length === 1 ? [...(named.length ? named : ledgers), ...dv] : [];
  });
}

const KHO_KINDS = ["minibar", "amenities", "vat tu", "do vai"];
const plain = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/đ/g, "d").replace(/\s+/g, " ").trim();

/** Per kind of kho the tab of the month ("MINIBAR 10/2026"), else the one tab without a month ("MINIBAR"); month is "yyyy-mm". */
export function stockTabs(titles: string[], month: string) {
  const tabs = titles.map((title) => {
    const m = plain(title).match(/^(.*?)\s*(?:(\d{1,2})[/-](\d{4}))?$/)!;
    return { title, kind: m[1], month: m[2] ? `${m[3]}-${m[2].padStart(2, "0")}` : "" };
  }).filter((t) => KHO_KINDS.includes(t.kind));
  return KHO_KINDS.flatMap((kind) => {
    const mine = tabs.filter((t) => t.kind === kind), hit = mine.find((t) => t.month === month) ?? mine.find((t) => !t.month);
    return hit ? [hit.title] : [];
  });
}

/** The kho sheets of one hotel for a month: its spreadsheet has one tab per kind of kho and month (MINIBAR 10/2026, AMENITIES 10/2026, VẬT TƯ 10/2026, ĐỒ VẢI 10/2026), each with all its lists. null when the hotel has no sheet, [] when none of them is there. */
export async function readStockSheets(hotel: number, month: string) {
  const sheetId = LEDGER_SHEETS[hotel];
  if (!sheetId) return null;
  return readTabs(sheetId, (titles) => stockTabs(titles, month));
}

/** Tab titles of the spreadsheet; then the values of the chosen tabs as plain rows (numbers stay numbers, dates come as Excel serials, like a file read by XLSX). */
export async function readTabs(spreadsheetId: string, choose: (titles: string[]) => string[]): Promise<{ name: string; gid: number; rows: unknown[][] }[]> {
  const meta = await sheetsGet(`${spreadsheetId}?fields=sheets.properties(title,sheetId)`) as { sheets?: { properties: { title: string; sheetId: number } }[] };
  const gids = new Map((meta.sheets ?? []).map((s) => [s.properties.title, s.properties.sheetId]));
  const titles = choose([...gids.keys()]);
  if (!titles.length) return [];
  const query = titles.map((t) => `ranges=${encodeURIComponent(`'${t.replace(/'/g, "''")}'`)}`).join("&");
  const data = await sheetsGet(`${spreadsheetId}/values:batchGet?${query}&valueRenderOption=UNFORMATTED_VALUE`) as { valueRanges?: { values?: unknown[][] }[] };
  return titles.map((name, i) => ({ name, gid: gids.get(name) ?? 0, rows: data.valueRanges?.[i]?.values ?? [] }));
}

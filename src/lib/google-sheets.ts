import { createSign } from "node:crypto";

import type { SheetKind } from "./ledger-sheets.ts";
import { isKiotvietTab } from "./kiotviet.ts";

type ServiceKey = { client_email: string; private_key: string; token_uri: string };
let cached: { token: string; expires: number } | null = null;

function serviceKey(): ServiceKey {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Chưa cấu hình tài khoản đọc Google Sheet.");
  try { return JSON.parse(raw) as ServiceKey; } catch { throw new Error("Tài khoản đọc Google Sheet cấu hình sai (không phải JSON)."); }
}

/** The address a sheet must be shared with (view only) for the app to read it; "" when the account is not configured. */
export function serviceAccountEmail() {
  try { return serviceKey().client_email; } catch { return ""; }
}

async function accessToken() {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const key = serviceKey();
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iss: key.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly", aud: key.token_uri, iat: now, exp: now + 3000 })}`;
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
  if (!res.ok) throw new Error(res.status === 403 || res.status === 404 ? "Không mở được Google Sheet này (chưa chia sẻ cho tài khoản đọc?)." : `Google Sheet lỗi ${res.status}.`);
  return body;
}

const plain = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/đ/g, "d").replace(/\s+/g, " ").trim();
/** Tabs whose name carries the month: "BK THU 08/2026", "BK THU 08-2026" or the plain "2026-08". */
const ofMonth = (tabs: string[], month: string) => { const [year, mm] = month.split("-"); return tabs.filter((t) => t.includes(`${mm}/${year}`) || t.includes(`${mm}-${year}`) || t.includes(month)); };
const hasMonth = (t: string) => /\d{1,2}[/-]\d{4}/.test(t);

const FNB_LEDGER = /^(bk thu|bk chi|thu minimart|chi minimart)( |$)/;
const isIncomeTab = (t: string) => /^(bk thu|thu minimart)( |$)/.test(plain(t));

/**
 * The ledger tabs of a sheet for a month ("yyyy-mm").
 * hotel: a file of one month has the tabs "BK THU" and "BK CHI" without the month (used as they are); a file of several months names them per month ("BK THU 08/2026"); a single ledger tab is used as is; the "DV NGOÀI mm/yyyy" tab rides along, last: a ledger parser must meet the ledgers first.
 * fnb: the thu tab then the chi tab of the month, "BK THU / BK CHI mm-yyyy" (cafe) or "THU MINIMART / CHI MINIMART mm-yyyy" (mini mart); a file whose tabs carry no month is used as is.
 * [] when no tab fits.
 */
export function ledgerTabs(titles: string[], month: string, kind: SheetKind = "hotel") {
  if (kind === "fnb") {
    const mine = titles.filter((t) => FNB_LEDGER.test(plain(t))), named = ofMonth(mine, month);
    const use = named.length ? named : mine.length && !mine.some(hasMonth) ? mine : [];
    return [...use.filter(isIncomeTab), ...use.filter((t) => !isIncomeTab(t))];
  }
  const ledgers = titles.filter((t) => /bk/i.test(t));
  const named = ofMonth(ledgers, month);
  const outside = titles.filter((t) => plain(t).startsWith("dv ngoai")), outsideNamed = ofMonth(outside, month);
  const dv = outsideNamed.length ? outsideNamed : outside.length === 1 ? outside : [];
  const use = named.length ? named : ledgers.length === 1 || (ledgers.length && !ledgers.some(hasMonth)) ? ledgers : []; // a file of one month: tabs without the month (BK THU, BK CHI)
  return use.length ? [...use, ...dv] : [];
}

/** The ledger tab(s) of one sheet for a month (rows as for an uploaded file); [] when no tab fits. */
export async function readLedgerTabs(sheetId: string, month: string, kind: SheetKind = "hotel") {
  return readTabs(sheetId, (titles) => ledgerTabs(titles, month, kind));
}

/** The KiotViet export tabs of an F&B sheet (KIOTVIET CAFE, KIOTVIET MINIMART); [] when the staff has pasted none. */
export async function readKiotvietTabs(sheetId: string) {
  return readTabs(sheetId, (titles) => titles.filter(isKiotvietTab));
}

/** The kinds of kho of a sheet (tab names without the month, plain). */
export const KHO_KINDS: Record<SheetKind, string[]> = {
  hotel: ["minibar", "amenities", "vat tu", "do vai"],
  fnb: ["nguyen lieu cafe", "nguyen lieu an sang", "vat tu"],
};

/** Per kind of kho the tab of the month ("MINIBAR 10/2026"), else the one tab without a month ("MINIBAR"); month is "yyyy-mm". */
export function stockTabs(titles: string[], month: string, kinds: string[] = KHO_KINDS.hotel) {
  const tabs = titles.map((title) => {
    const m = plain(title).match(/^(.*?)\s*(?:(\d{1,2})[/-](\d{4}))?$/)!;
    return { title, kind: m[1], month: m[2] ? `${m[3]}-${m[2].padStart(2, "0")}` : "" };
  }).filter((t) => kinds.includes(t.kind));
  return kinds.flatMap((kind) => {
    const mine = tabs.filter((t) => t.kind === kind), hit = mine.find((t) => t.month === month) ?? mine.find((t) => !t.month);
    return hit ? [hit.title] : [];
  });
}

/** The kho sheets of one spreadsheet for a month: one tab per kind of kho and month (hotel: MINIBAR 10/2026, AMENITIES 10/2026, VẬT TƯ 10/2026, ĐỒ VẢI 10/2026; fnb: NGUYÊN LIỆU CAFE, NGUYÊN LIỆU ĂN SÁNG, VẬT TƯ), each with all its lists. [] when none of them is there. */
export async function readStockSheets(sheetId: string, month: string, kind: SheetKind = "hotel") {
  const sheets = await readTabs(sheetId, (titles) => stockTabs(titles, month, KHO_KINDS[kind]));
  if (!sheets.length) return [];
  return withRedCells(sheetId, sheets);
}

/** What a sheet has for a month, for Cài đặt → Link Google Sheet: the tabs found and what is missing. Pure: tested without Google. */
export function checkTabs(titles: string[], kind: SheetKind, month: string) {
  const ledger = ledgerTabs(titles, month, kind), stock = stockTabs(titles, month, KHO_KINDS[kind]), mm = `${month.slice(5)}-${month.slice(0, 4)}`;
  const messages: string[] = [];
  if (kind === "fnb") {
    if (!ledger.some(isIncomeTab)) messages.push(`Thiếu tab thu: “BK THU” hoặc “THU MINIMART” (có thể kèm tháng ${mm} nếu một file có nhiều tháng).`);
    if (!ledger.some((t) => !isIncomeTab(t))) messages.push(`Thiếu tab chi: “BK CHI” hoặc “CHI MINIMART” (có thể kèm tháng ${mm} nếu một file có nhiều tháng).`);
  } else if (!ledger.length) messages.push(`Thiếu tab bảng kê: “BK THU” và “BK CHI” (có thể kèm tháng ${mm} nếu một file có nhiều tháng).`);
  if (!stock.length) messages.push(`Thiếu tab kho (${KHO_KINDS[kind].map((k) => k.toUpperCase()).join(", ")}; có thể kèm tháng ${mm} nếu một file có nhiều tháng).`);
  return { ledger, stock, messages };
}

/** Opens the sheet with the service account and reports what it has for the month. Throws the "cannot open" message when it is not shared. */
export async function checkSheet(sheetId: string, kind: SheetKind, month: string) {
  const meta = await sheetsGet(`${sheetId}?fields=properties.title,sheets.properties.title`) as { properties?: { title: string }; sheets?: { properties: { title: string } }[] };
  const titles = (meta.sheets ?? []).map((s) => s.properties.title);
  return { name: meta.properties?.title ?? "", titles, ...checkTabs(titles, kind, month) };
}

/** Adds to each tab the cells with a red background (the finance team marks items bought and used at once): `red` = [row, col] 0-based, only cells that hold a value. shortcut: only strong red (#ff0000 and close), a pale pink is not read. */
async function withRedCells(spreadsheetId: string, sheets: { name: string; gid: number; rows: unknown[][] }[]) {
  const query = sheets.map((s) => `ranges=${encodeURIComponent(`'${s.name.replace(/'/g, "''")}'`)}`).join("&");
  const grid = await sheetsGet(`${spreadsheetId}?${query}&includeGridData=true&fields=sheets(properties.title,data(startRow,startColumn,rowData(values(effectiveFormat(backgroundColor)))))`) as { sheets?: { properties: { title: string }; data?: { startRow?: number; startColumn?: number; rowData?: { values?: { effectiveFormat?: { backgroundColor?: { red?: number; green?: number; blue?: number } } }[] }[] }[] }[] };
  return sheets.map((s) => {
    const red: [number, number][] = [];
    for (const d of grid.sheets?.find((g) => g.properties.title === s.name)?.data ?? []) d.rowData?.forEach((row, r) => row.values?.forEach((cell, c) => {
      const b = cell.effectiveFormat?.backgroundColor, at = [(d.startRow ?? 0) + r, (d.startColumn ?? 0) + c] as [number, number];
      if (b && (b.red ?? 0) >= 0.9 && (b.green ?? 0) <= 0.2 && (b.blue ?? 0) <= 0.2 && String(s.rows[at[0]]?.[at[1]] ?? "").trim()) red.push(at);
    }));
    return { ...s, red };
  });
}

/** The Google Sheets files directly inside a Drive folder (shared with the service account; needs the Drive API enabled in its project). */
export async function folderSheets(folderId: string): Promise<{ id: string; name: string }[]> {
  const q = `'${folderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.spreadsheet'`;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, fields: "files(id,name)", pageSize: "100", supportsAllDrives: "true", includeItemsFromAllDrives: "true" })}`, { headers: { authorization: `Bearer ${await accessToken()}` }, cache: "no-store" });
  const body = await res.json().catch(() => ({})) as { files?: { id: string; name: string }[] };
  if (!res.ok) throw new Error(res.status === 403 || res.status === 404 ? "Không mở được thư mục Google Drive (chưa chia sẻ cho tài khoản đọc, hoặc chưa bật Drive API?)." : `Google Drive lỗi ${res.status}.`);
  return body.files ?? [];
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

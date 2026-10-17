// Reconcile the monthly hotel cash ledger ("Bảng kê thu tiền khách sạn", Excel) with the bookings stored from Blue Jay. Pure functions: tested by bluejay-reconcile.test.ts.
// The ledger is cash-basis: an OTA pays the room money weeks later ("Agoda tt tháng 6"), while the hotel collects services and direct-guest room money on the spot.
// So only money the hotel really collects is compared: direct guests -> whole payment, OTA bookings -> services. OTA room money is not compared.
// Imports use ".ts" because tests run this with plain Node.
import { OTA_CHANNELS, type RevenueBooking } from "./bluejay-revenue.ts";

const TOLERANCE = 1; // VND, same as the revenue report
const DAY = 86_400_000;
const OTA = new Set(OTA_CHANNELS);
const PRIOR = /tháng\s*\d{1,2}|kỳ trước/i; // "Agoda tt tháng 6": settlement of an earlier stay

export type LedgerLine = { row: number; date: string; id: string; platform: string; service: string; note: string; stayMonth: string; isRoom: boolean; collected: number; counted: number }; // stayMonth: yyyy-mm of the stay a room payment is for, or ""
export type Ledger = {
  lines: LedgerLine[];
  noId: { rows: number; collected: number; deductions: number }; // card totals, commissions, interest: summary lines without a booking id
  countedByDay: Record<string, number>;                           // "Tiền so Bluejay" per day, every dated row (with or without id)
  daily: { date: string; value: number }[] | null;               // the sheet's own "doanh thu theo ngày" block, when present
  hotel: string; month: string;                                    // from the "KHÁCH SẠN" and "KỲ BÁO CÁO" cells above the header ("" when the file has none); month is yyyy-mm
  hasCounted: boolean;                                            // the sheet has a "Tiền so Bluejay" column (the monthly workbook may not)
  from: string; to: string; warnings: string[];
};

const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/đ/g, "d").replace(/\s+/g, " ").trim();
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Excel serial, Date, dd/mm/yyyy or yyyy-mm-dd -> yyyy-mm-dd, or null. */
export function ledgerDate(v: unknown): string | null {
  if (typeof v === "number" && v > 30_000 && v < 80_000) return isoOf(Date.UTC(1899, 11, 30) + Math.round(v) * DAY);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return isoOf(v.getTime());
  const s = String(v ?? "").trim();
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Booking ids come with stray spaces or line breaks ("1669108698399193\n", "009873 "); compared case-insensitively. */
export const cleanId = (v: unknown) => String(v ?? "").replace(/\s+/g, "").toUpperCase();

/** "09/2026", "2026-09", "Tháng 9/2026", an Excel date or a Date -> yyyy-mm, or "" when it is not a month with a year. */
export function monthOf(v: unknown): string {
  const date = typeof v === "number" || v instanceof Date ? ledgerDate(v) : null;
  if (date) return date.slice(0, 7);
  const s = norm(v);
  const my = s.match(/(?:^|\D)(\d{1,2})\s*[/.-]\s*(\d{4})(?:\D|$)/) ?? s.match(/thang\s*(\d{1,2})\s*(?:nam)?\s*(\d{4})/);
  if (my) return `${my[2]}-${my[1].padStart(2, "0")}`;
  const ym = s.match(/^(\d{4})-(\d{1,2})/);
  return ym ? `${ym[1]}-${ym[2].padStart(2, "0")}` : "";
}

/** rows: the sheet as an array of rows (XLSX.utils.sheet_to_json with header: 1). Throws when the header row is not recognised. */
export function parseLedger(rows: unknown[][]): Ledger {
  const head = rows.findIndex((r) => r.some((c) => norm(c) === "id he thong"));
  if (head < 0) throw new Error("Không nhận ra bảng kê: không thấy cột “ID HỆ THỐNG”.");
  const cols = (re: RegExp, from = head, to = head + 2) => {
    for (let i = from; i <= to && i < rows.length; i++) { const c = rows[i].findIndex((cell) => re.test(norm(cell))); if (c >= 0) return c; }
    return -1;
  };
  const col = { date: cols(/^ngay thang$/), id: cols(/^id he thong$/), platform: cols(/^nen tang$/), service: cols(/^dich vu$/), note: cols(/^((ghu|ghi) chu|noi dung)$/), deposit: cols(/^tien coc da nhan$/), deduct: cols(/^(khoan )?giam tru doanh thu$/), total: cols(/^tong tien$/), counted: cols(/^tien so bluejay$/) };
  const stay = cols(/^ky luu tru duoc thanh toan$/);
  const dailyDate = cols(/^(doanh thu|thu tien) theo ngay$/);
  // "Tiền so bluejay" can also head the daily block on the right; the per-line column is the one left of that block.
  if (dailyDate >= 0 && col.counted > dailyDate) col.counted = -1;
  const missing = Object.entries({ "NGÀY THÁNG": col.date, "ID HỆ THỐNG": col.id, "NỀN TẢNG": col.platform, "DỊCH VỤ": col.service, "TIỀN CỌC ĐÃ NHẬN": col.deposit, "Giảm trừ doanh thu": col.deduct }).filter(([, c]) => c < 0).map(([name]) => name);
  if (missing.length) throw new Error(`Bảng kê thiếu cột: ${missing.join(", ")}.`);
  // Money columns run from "TIỀN CỌC ĐÃ NHẬN" up to the sheet's own "Tổng tiền" total (not collected twice) or the deductions block, whichever comes first.
  const moneyEnd = Math.min(...[col.total, col.deduct].filter((c) => c > col.deposit));
  const deductEnd = col.counted > col.deduct ? col.counted : col.deduct + 2; // hoa hồng nền tảng + các khoản giảm trừ khác

  // "KHÁCH SẠN" and "KỲ BÁO CÁO" cells above the header: the value is the cell to the right, or the text after a colon in the same cell.
  const meta = (re: RegExp) => {
    for (let i = 0; i < head; i++) for (let c = 0; c < rows[i].length; c++) {
      const raw = String(rows[i][c] ?? ""), label = norm(raw).match(re);
      if (!label) continue;
      if (label[1]?.trim()) return raw.slice(raw.indexOf(":") + 1).trim();
      const next = rows[i].slice(c + 1, c + 7).find((v) => v !== "" && v != null);
      if (next !== undefined && !/^(khach san|ky bao cao)/.test(norm(next))) return next; // an empty input cell must not pick up the next label
    }
    return "";
  };
  const hotel = String(meta(/^khach san\s*:?\s*(.*)$/)).trim();
  const month = monthOf(meta(/^ky bao cao(?: \(thang\/nam\))?\s*:?\s*(.*)$/));

  const lines: LedgerLine[] = [];
  const noId = { rows: 0, collected: 0, deductions: 0 };
  const warnings: string[] = [];
  const countedByDay: Record<string, number> = {};
  let from = "", to = "";
  for (let i = head + 1; i < rows.length; i++) {
    const r = rows[i];
    const date = ledgerDate(r[col.date]);
    if (!date) continue; // sub-header, TỔNG and blank rows
    if (!from || date < from) from = date;
    if (!to || date > to) to = date;
    let collected = 0, deductions = 0;
    for (let c = col.deposit; c < moneyEnd; c++) collected += num(r[c]);
    for (let c = col.deduct; c < deductEnd; c++) deductions += num(r[c]);
    const counted = col.counted >= 0 ? num(r[col.counted]) : 0;
    countedByDay[date] = (countedByDay[date] ?? 0) + counted;
    const id = cleanId(r[col.id]);
    if (!id) { noId.rows++; noId.collected += collected; noId.deductions += deductions; continue; }
    const service = String(r[col.service] ?? "").trim(); // "Tiền phòng" and "Cọc phòng" (room deposit) are room money, the rest is service
    lines.push({
      row: i + 1, date, id, platform: String(r[col.platform] ?? "").trim(), service, note: col.note >= 0 ? String(r[col.note] ?? "").trim() : "", stayMonth: stay >= 0 ? monthOf(r[stay]) : "",
      isRoom: /^(tien|coc) phong$/.test(norm(service)), collected, counted,
    });
  }
  if (!lines.length) throw new Error("Bảng kê không có dòng giao dịch nào có ngày và ID.");

  // The sheet's own daily block (dates under "DOANH THU / THU TIỀN THEO NGÀY", amount under "Tiền TK so bluejay"); only checkable when the sheet has the per-line column to add up.
  let daily: Ledger["daily"] = null;
  const dateCol = dailyDate;
  let valueCol = -1; // the amount column of the daily block: right of its date column
  for (let i = head; i <= head + 2 && i < rows.length && valueCol < 0; i++) valueCol = rows[i].findIndex((cell, c) => c > dateCol && /^tien (tk )?so bluejay$/.test(norm(cell)));
  if (col.counted >= 0 && dateCol >= 0 && valueCol >= 0) {
    daily = [];
    for (let i = head + 1; i < rows.length; i++) {
      const date = ledgerDate(rows[i][dateCol]);
      if (date && typeof rows[i][valueCol] === "number") daily.push({ date, value: rows[i][valueCol] as number });
    }
  }
  return { lines, noId, countedByDay, daily, hotel, month, hasCounted: col.counted >= 0, from, to, warnings };
}

/** Cheap checks of the file against what the user selected: wrong hotel, dates outside the stated month. */
export function ledgerWarnings(ledger: Ledger, hotelName: string): string[] {
  const out: string[] = [];
  const a = norm(ledger.hotel), b = norm(hotelName);
  if (a && b && !a.includes(b) && !b.includes(a)) out.push(`File ghi khách sạn “${ledger.hotel}” nhưng đang chọn “${hotelName}”. Kiểm tra lại khách sạn trước khi tin kết quả.`);
  if (ledger.month) {
    const outside = ledger.lines.filter((l) => l.date.slice(0, 7) !== ledger.month).length;
    if (outside) out.push(`${outside} dòng có ngày nằm ngoài kỳ báo cáo ${ledger.month.slice(5)}/${ledger.month.slice(0, 4)} ghi trong file.`);
  }
  return out;
}

/** The monthly workbook has many sheets ("DOANH THU KS.", "BK THU TIỀN KS", ...): the ledger is the first sheet that parses, tried by name first. */
export function parseLedgerWorkbook(sheets: { name: string; rows: unknown[][] }[]): Ledger & { sheet: string } {
  const ordered = [...sheets].sort((a, b) => Number(/bk thu tien/.test(norm(b.name))) - Number(/bk thu tien/.test(norm(a.name))));
  let reason = "";
  for (const sheet of ordered) {
    try { return { ...parseLedger(sheet.rows), sheet: sheet.name }; } catch (e) { if (!reason || /bk thu tien/.test(norm(sheet.name))) reason = e instanceof Error ? e.message : String(e); }
  }
  throw new Error(sheets.length > 1 ? `Không thấy sheet bảng kê thu tiền trong file. ${reason}` : reason || "File không có sheet nào.");
}

export type Kind = "diff" | "ok" | "ledger-only" | "bj-only" | "prior";
export const KIND_LABELS: Record<Kind, string> = {
  diff: "Lệch số tiền", ok: "Khớp", "ledger-only": "Có trong bảng kê, không có trong Blue Jay", "bj-only": "Có trong Blue Jay, chưa có trong bảng kê", prior: "Thanh toán kỳ trước",
};
export type Item = {
  kind: Kind; id: string; channel: string; room: string; checkIn: string; checkOut: string; status: string;
  basis: "payment" | "service" | null; excel: number; bluejay: number; diff: number; lines: number; notes: string[];
};
export type Reconciliation = {
  items: Item[];
  counts: Record<Kind, number>;
  totals: { excelCollected: number; excelCounted: number; excelNoId: number; deductions: number };
  fileIssues: { duplicates: LedgerLine[][]; noMoney: LedgerLine[]; dailyMismatch: { date: string; ledger: number; sheet: number; diff: number }[] };
};

const keyOf = (b: RevenueBooking) => `${b.code}|${b.room}|${b.roomType}`;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** bookings: stored Blue Jay bookings of ONE hotel, one record per booking (latest snapshot). from/to: the ledger period. */
export function reconcile(ledger: Ledger, bookings: RevenueBooking[], from = ledger.from, to = ledger.to): Reconciliation {
  const byId = new Map<string, RevenueBooking[]>();
  for (const b of bookings) for (const key of new Set([cleanId(b.ref), cleanId(b.code)])) if (key) byId.set(key, [...(byId.get(key) ?? []), b]);

  const groups = new Map<string, LedgerLine[]>();
  for (const l of ledger.lines) groups.set(l.id, [...(groups.get(l.id) ?? []), l]);

  const used = new Set<string>();
  const items: Item[] = [];
  for (const [id, lines] of groups) {
    const matched = [...new Map((byId.get(id) ?? []).map((b) => [keyOf(b), b])).values()];
    const notes = [...new Set([...lines.map((l) => l.note), ...lines.map((l) => (l.stayMonth ? `Thanh toán cho kỳ lưu trú ${l.stayMonth.slice(5)}/${l.stayMonth.slice(0, 4)}` : ""))].filter(Boolean))];
    const base = { id, lines: lines.length, notes };
    if (!matched.length) {
      const period = ledger.month || from.slice(0, 7); // a room payment marked as for an earlier stay month is an earlier-period settlement, whatever the note says
      const earlier = lines.some((l) => l.stayMonth && l.stayMonth < period) || lines.some((l) => PRIOR.test(l.note));
      items.push({ ...base, kind: earlier ? "prior" : "ledger-only", channel: lines[0].platform, room: "", checkIn: "", checkOut: "", status: "", basis: null, excel: sum(lines.map((l) => l.collected)), bluejay: 0, diff: sum(lines.map((l) => l.collected)) });
      continue;
    }
    matched.forEach((b) => used.add(keyOf(b)));
    const stays = matched.filter((b) => b.stay);
    const first = matched[0];
    // OTA room money arrives later, and a direct stay that began before the period had its room money collected in an earlier ledger: both compare services only.
    const early = !OTA.has(first.channel) && Boolean(first.checkIn) && first.checkIn < from;
    const serviceOnly = OTA.has(first.channel) || early;
    const basis = serviceOnly ? "service" : "payment";
    const excel = sum(lines.filter((l) => !serviceOnly || !l.isRoom).map((l) => l.collected));
    const bluejay = sum(stays.map((b) => (serviceOnly ? b.servicePrice : b.payment)));
    const diff = excel - bluejay;
    const extra = [...notes];
    if (!stays.length) extra.push("Đặt phòng đã hủy / no-show trong Blue Jay");
    if (early) extra.push("Lưu trú bắt đầu trước kỳ: tiền phòng đã thu ở bảng kê tháng trước, chỉ so tiền dịch vụ");
    if (stays.some((b) => /đã nhận phòng/i.test(b.status))) extra.push("Khách đang ở: Blue Jay chưa chốt thanh toán");
    items.push({ ...base, notes: extra, kind: Math.abs(diff) <= TOLERANCE ? "ok" : "diff", channel: first.channel, room: [...new Set(matched.map((b) => b.room))].join(", "), checkIn: first.checkIn, checkOut: first.checkOut, status: first.status, basis, excel, bluejay, diff });
  }

  // Blue Jay money the ledger never mentions: direct-guest payments and OTA service money are collected by the hotel, so they must be in the ledger.
  for (const b of bookings) {
    if (used.has(keyOf(b)) || !b.stay || b.checkIn > to || (b.checkOut || b.checkIn) < from) continue;
    const ota = OTA.has(b.channel);
    const amount = ota || b.checkIn < from ? b.servicePrice : b.payment;
    if (amount <= TOLERANCE) continue;
    items.push({ kind: "bj-only", id: b.ref || b.code, channel: b.channel, room: b.room, checkIn: b.checkIn, checkOut: b.checkOut, status: b.status, basis: amount === b.servicePrice && (ota || b.checkIn < from) ? "service" : "payment", excel: 0, bluejay: amount, diff: -amount, lines: 0, notes: [] });
  }

  const order: Record<Kind, number> = { diff: 0, "ledger-only": 1, "bj-only": 2, prior: 3, ok: 4 };
  items.sort((a, b) => order[a.kind] - order[b.kind] || Math.abs(b.diff) - Math.abs(a.diff) || a.id.localeCompare(b.id));
  const counts: Record<Kind, number> = { diff: 0, ok: 0, "ledger-only": 0, "bj-only": 0, prior: 0 };
  for (const it of items) counts[it.kind]++;

  const seen = new Map<string, LedgerLine[]>();
  for (const l of ledger.lines) { const k = [l.date, l.id, l.service, l.collected, l.counted].join("|"); seen.set(k, [...(seen.get(k) ?? []), l]); }
  const dailyMismatch = (ledger.daily ?? []).map((d) => ({ date: d.date, ledger: ledger.countedByDay[d.date] ?? 0, sheet: d.value, diff: (ledger.countedByDay[d.date] ?? 0) - d.value })).filter((d) => Math.abs(d.diff) > TOLERANCE);

  return {
    items, counts,
    totals: { excelCollected: sum(ledger.lines.map((l) => l.collected)), excelCounted: sum(Object.values(ledger.countedByDay)), excelNoId: ledger.noId.collected, deductions: ledger.noId.deductions },
    fileIssues: { duplicates: [...seen.values()].filter((g) => g.length > 1), noMoney: ledger.lines.filter((l) => l.collected === 0 && l.counted === 0), dailyMismatch },
  };
}

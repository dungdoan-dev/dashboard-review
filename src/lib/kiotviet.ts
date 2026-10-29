// The weekly KiotViet export "Báo cáo bán hàng theo hàng hóa" pasted by the staff into a tab of the F&B Google Sheet: tab "KIOTVIET CAFE" (Ăn sáng, cafe, and VTDC HCM) or "KIOTVIET MINIMART" (mini mart),
// compared with the staff's own BK THU / THU MINIMART by day. One row of the export is one item of one invoice; the day is the invoice's time, the money is "Doanh thu chi tiết" (after discount),
// "Giá trị niêm yết chi tiết" the list price. The export has no payment method, so only the day's total can be compared. Pure functions: tested by kiotviet.test.ts. Imports use ".ts" because tests run this with plain Node.
import { fnbSales, type FnbIncomeLine } from "./fnb-ledger.ts";

const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/đ/g, "d").replace(/\s+/g, " ").trim();
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** The two standard tab names; the unit is told by the name (accents, case and spaces ignored: "Kiotviet Mini Mart" is fine). */
export const KIOTVIET_TABS = { cafe: "KIOTVIET CAFE", mart: "KIOTVIET MINIMART" };
const tabKey = (name: string) => norm(name).replace(/[\s_-]/g, "");
export const isKiotvietTab = (name: string) => tabKey(name) === "kiotvietcafe" || tabKey(name) === "kiotvietminimart";
export const isMartTab = (name: string) => tabKey(name) === "kiotvietminimart";

export type KiotvietDay = { date: string; invoices: number; listed: number; revenue: number };
export type KiotvietItem = { group: string; name: string; qty: number; listed: number; revenue: number };
export type KiotvietExport = { days: KiotvietDay[]; items: KiotvietItem[]; lines: number; invoices: number; duplicates: number; tabs: number };

/** Day of the invoice time: an Excel serial with the time as a fraction (the day is its whole part, never rounded up), or text "dd/mm/yyyy hh:mm". */
function dayOf(v: unknown): string | null {
  if (typeof v === "number" && v > 30_000 && v < 80_000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5).toISOString().slice(0, 10);
  const m = String(v ?? "").trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/** The export of one or more tabs. Columns are found by name; an invoice that appears in two tabs (weeks pasted overlapping) is counted once, from the first tab that has it. */
export function parseKiotviet(tabs: { name: string; rows: unknown[][] }[]): KiotvietExport {
  const days = new Map<string, { invoices: Set<string>; listed: number; revenue: number }>();
  const items = new Map<string, KiotvietItem>(); // by group and name
  const owner = new Map<string, number>(); // invoice -> index of the tab it was first seen in
  let lines = 0, duplicates = 0;
  tabs.forEach((tab, t) => {
    const head = tab.rows.findIndex((r) => r.some((c) => norm(c) === "ma hoa don") && r.some((c) => norm(c) === "thoi gian"));
    if (head < 0) throw new Error(`Tab “${tab.name}” không phải báo cáo KiotViet: không thấy cột “Mã hóa đơn” và “Thời gian”.`);
    const names = tab.rows[head].map(norm), at = (n: string) => names.indexOf(n);
    const c = { inv: at("ma hoa don"), time: at("thoi gian"), revenue: at("doanh thu chi tiet"), listed: at("gia tri niem yet chi tiet"), group: at("nhom hang"), item: at("ten hang"), qty: at("sl") };
    if (c.revenue < 0) throw new Error(`Tab “${tab.name}” thiếu cột “Doanh thu chi tiết” (xuất báo cáo “Bán hàng theo hàng hóa” có chi tiết hóa đơn).`);
    const skipped = new Set<string>();
    for (const r of tab.rows.slice(head + 1)) {
      const inv = String(r[c.inv] ?? "").trim(), date = dayOf(r[c.time]);
      if (!inv || !date) continue;
      const first = owner.get(inv);
      if (first === undefined) owner.set(inv, t);
      else if (first !== t) { skipped.add(inv); continue; }
      const d = days.get(date) ?? days.set(date, { invoices: new Set(), listed: 0, revenue: 0 }).get(date)!;
      const revenue = num(r[c.revenue]), listed = c.listed >= 0 ? num(r[c.listed]) : 0;
      d.invoices.add(inv); d.revenue += revenue; d.listed += listed; lines++;
      const group = c.group >= 0 ? String(r[c.group] ?? "").trim() : "", name = c.item >= 0 ? String(r[c.item] ?? "").trim() : "", key = `${group}\u0000${name}`;
      const it = items.get(key) ?? items.set(key, { group, name, qty: 0, listed: 0, revenue: 0 }).get(key)!;
      it.qty += c.qty >= 0 ? num(r[c.qty]) : 0; it.listed += listed; it.revenue += revenue;
    }
    duplicates += skipped.size;
  });
  return { days: [...days].map(([date, d]) => ({ date, invoices: d.invoices.size, listed: d.listed, revenue: d.revenue })).sort((a, b) => a.date.localeCompare(b.date)), items: [...items.values()].sort((a, b) => b.revenue - a.revenue), lines, invoices: owner.size, duplicates, tabs: tabs.length };
}

export type KiotvietRow = { date: string; invoices: number; listed: number; discount: number; kiot: number; book: number; hotel: number; diff: number };

/** Day by day: KiotViet revenue against what the staff typed (cash + bank + POS of the counter). Only days between the first and last day of the export are compared, so a week pasted alone does not flag the rest of the month. */
export function compareKiotviet(kv: KiotvietExport, lines: FnbIncomeLine[]) {
  if (!kv.days.length) return { rows: [] as KiotvietRow[], from: "", to: "", kiot: 0, book: 0, diff: 0, discount: 0, invoices: 0, bad: 0 };
  const from = kv.days[0].date, to = kv.days[kv.days.length - 1].date;
  const book = new Map<string, { sales: number; hotel: number }>();
  for (const l of lines) if (l.date >= from && l.date <= to) { const b = book.get(l.date) ?? { sales: 0, hotel: 0 }; b.sales += fnbSales(l); b.hotel += l.hotel; book.set(l.date, b); }
  const byDay = new Map(kv.days.map((d) => [d.date, d]));
  const rows = [...new Set([...byDay.keys(), ...book.keys()])].sort().map((date): KiotvietRow => {
    const k = byDay.get(date), b = book.get(date);
    const kiot = k?.revenue ?? 0, typed = b?.sales ?? 0;
    return { date, invoices: k?.invoices ?? 0, listed: k?.listed ?? 0, discount: k ? k.listed - k.revenue : 0, kiot, book: typed, hotel: b?.hotel ?? 0, diff: kiot - typed };
  });
  const sum = (f: (r: KiotvietRow) => number) => rows.reduce((t, r) => t + f(r), 0);
  return { rows, from, to, kiot: sum((r) => r.kiot), book: sum((r) => r.book), diff: sum((r) => r.diff), discount: sum((r) => r.discount), invoices: sum((r) => r.invoices), bad: rows.filter((r) => Math.abs(r.diff) >= 1).length };
}

export type KiotvietPeriod = { label: string; from: string; to: string; invoices: number; listed: number; discount: number; revenue: number };

/** The export by week (the columns of the weekly report: label, from, to) and by group of goods: list price, discount (negative, as the finance team shows it) and net revenue. */
export function kiotvietSummary(kv: KiotvietExport, columns: { label: string; from: string; to: string }[]) {
  const weeks = columns.map((c): KiotvietPeriod => {
    const days = kv.days.filter((d) => d.date >= c.from && d.date <= c.to);
    const sum = (f: (d: KiotvietDay) => number) => days.reduce((t, d) => t + f(d), 0);
    return { label: c.label, from: c.from, to: c.to, invoices: sum((d) => d.invoices), listed: sum((d) => d.listed), discount: sum((d) => d.revenue - d.listed), revenue: sum((d) => d.revenue) };
  });
  const groups = new Map<string, { group: string; qty: number; listed: number; revenue: number }>();
  for (const it of kv.items) { const g = groups.get(it.group) ?? groups.set(it.group, { group: it.group, qty: 0, listed: 0, revenue: 0 }).get(it.group)!; g.qty += it.qty; g.listed += it.listed; g.revenue += it.revenue; }
  return { weeks, groups: [...groups.values()].sort((a, b) => b.revenue - a.revenue), items: kv.items };
}

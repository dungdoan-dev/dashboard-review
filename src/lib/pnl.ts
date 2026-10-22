// The yearly result of one hotel, laid out like the accountant's sheet "BẢNG KẾT QUẢ HOẠT ĐỘNG KINH DOANH" (months in columns): room money by check-out day from Blue Jay, services by the day they were sold, deductions and costs from the month's ledger tabs.
// Costs are the ledger's payments filed in the five report groups (see reportGroup), each counted in the month its "Nội dung chi" names ("lương tháng 7" paid in August is July's cost), else in the month it was paid.
// Pure functions: tested by pnl.test.ts. Imports use ".ts" because tests run this with plain Node.
import { EXPENSES } from "./expense-kinds.ts";
import type { RangeHotel } from "./bluejay-range.ts";
import { REPORT_GROUPS, UNLISTED, reportGroup, type ExpenseLine, type ReportRow } from "./finance-summary.ts";

const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/đ/g, "d").replace(/\s+/g, " ").trim();

/** Room money of the stays that check out in the range, like Blue Jay's own "doanh thu theo phòng" report: whole stays, M-Standard and Unassigned ones too, and what was kept from cancellations and no-shows. */
export const roomByCheckout = (h: Pick<RangeHotel, "bookings" | "excludedRoom">) => Math.round(h.bookings.reduce((s, b) => s + (b.stay ? b.roomInWeek : b.roomPrice), 0) + (h.excludedRoom ?? 0));

/** Rooms of a hotel, to turn nights slept into an occupancy. shortcut: only Sontra is known, the others show no occupancy; add a hotel here (or read it from Blue Jay) when its room count is needed. */
export const HOTEL_ROOMS: Record<number, number> = { 5381: 15 };

export type MonthData = {
  rooms: number; room: number; services: Record<string, number>; // from Blue Jay: nights slept, room money of the stays checked out in the month, service money by Blue Jay group
  commission: number; otherDeduction: number;                    // from the income ledger
  expenses: ExpenseLine[] | null;                                // null: the month has no expense tab
};

/** The months a line is for: every "tháng 7", "tháng 5,6/26", "tháng 8/2026" in its text, as yyyy-mm; a month without a year is the one nearest the payment date. [] when the text names none. */
export function noteMonths(note: string, date: string): string[] {
  const out: string[] = [];
  const [py, pm] = date.split("-").map(Number);
  for (const m of norm(note).matchAll(/thang\s*(\d{1,2}(?:\s*(?:,|va|-)\s*\d{1,2})*)(?:\s*\/\s*(\d{4}|\d{2}))?(?!\d)/g)) {
    for (const part of m[1].split(/\s*(?:,|va|-)\s*/)) {
      const month = Number(part);
      if (month < 1 || month > 12) continue;
      let year = m[2] ? (m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])) : py;
      if (!m[2]) year = [py - 1, py, py + 1].reduce((best, y) => (Math.abs((y * 12 + month) - (py * 12 + pm)) < Math.abs((best * 12 + month) - (py * 12 + pm)) ? y : best));
      const key = `${year}-${String(month).padStart(2, "0")}`;
      if (!out.includes(key)) out.push(key);
    }
  }
  return out;
}

/** Every expense line of every month tab, moved to the month(s) its text names (a line naming several months is split evenly, the dong left over goes to the last), else left in the month it was paid. */
export function lineMonths(lines: ExpenseLine[]) {
  const byMonth = new Map<string, ExpenseLine[]>();
  const put = (month: string, line: ExpenseLine) => byMonth.set(month, [...(byMonth.get(month) ?? []), line]);
  for (const line of lines) {
    const months = noteMonths(line.note, line.date);
    if (!months.length) { put(line.date.slice(0, 7), line); continue; }
    const keys = ["cash", "bank", "visa", "commission", "cardFee"] as const, left = { ...line };
    months.forEach((month, i) => {
      const part = { ...line };
      for (const k of keys) { part[k] = i === months.length - 1 ? left[k] : Math.round(line[k] / months.length); left[k] -= part[k]; }
      put(month, part);
    });
  }
  return byMonth;
}

/** Costs of the lines in the report groups, each group with its expenses (transfers between funds are not costs). Groups in the report's order; "Chưa phân loại" only when there is one. */
export function costTree(expenses: ExpenseLine[]) {
  const listed = new Map(EXPENSES.map(([, name, , group]) => [norm(name), { name, group }]));
  const tree = new Map<string, Map<string, number>>(REPORT_GROUPS.map((g) => [g, new Map()]));
  for (const e of expenses) {
    const paid = e.cash + e.bank + e.visa, k = listed.get(norm(e.kind));
    if (k?.group.startsWith("Điều chuyển")) continue;
    const group = k ? reportGroup(e.kind, e.note, k.group) : UNLISTED, name = k?.name ?? (e.kind || "(trống)");
    if (!tree.has(group)) tree.set(group, new Map());
    tree.get(group)!.set(name, (tree.get(group)!.get(name) ?? 0) + paid);
  }
  const order = EXPENSES.map((e) => e[1]);
  return [...tree].filter(([g, m]) => g !== UNLISTED || m.size).map(([group, m]) => ({
    group, total: [...m.values()].reduce((a, b) => a + b, 0),
    kinds: [...m].map(([name, total]) => ({ name, total })).sort((a, b) => (order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99)),
  }));
}

/** The five revenue lines of the sheet: room money, then Blue Jay's service groups by name, anything else is "Thu khác". */
export function revenueLines(m: Pick<MonthData, "room" | "services">) {
  const out = { "Tiền phòng": m.room, "Minibar": 0, "Giặt ủi": 0, "Dịch vụ ngoài": 0, "Thu khác": 0 };
  for (const [group, value] of Object.entries(m.services)) {
    const n = norm(group);
    out[/minibar/.test(n) ? "Minibar" : /giat/.test(n) ? "Giặt ủi" : /dich vu ngoai|dv ngoai|dich vu khac/.test(n) ? "Dịch vụ ngoài" : "Thu khác"] += value;
  }
  return out;
}

export type PnlRow = ReportRow & { cost?: boolean }; // cost: a row that needs the month's expense tab (costs and profit): shown as "–" for a month without it

/** The rows of the sheet. values: one per month (12) then the year; a month without data counts as 0. */
export function pnlRows(months: (MonthData | null)[]): PnlRow[] {
  const withTotal = (v: number[]) => [...v, v.reduce((a, b) => a + b, 0)];
  const each = (f: (m: MonthData) => number) => withTotal(months.map((m) => (m ? f(m) : 0)));
  const sum = (...ls: number[][]) => ls[0].map((_, i) => ls.reduce((a, l) => a + l[i], 0));
  const neg = (l: number[]) => l.map((v) => 0 - v);
  const row = (label: string, values: number[], kind: ReportRow["kind"] = "line", cost = false): PnlRow => ({ label, kind, values, cost });

  const lines = Object.keys(revenueLines({ room: 0, services: {} })).map((name) => row(name, each((m) => revenueLines(m)[name as "Tiền phòng"])));
  const gross = sum(...lines.map((l) => l.values));
  const deductions = [row("Hoa hồng nền tảng", each((m) => m.commission)), row("Phí quẹt thẻ, giảm giá khách hàng", each((m) => m.otherDeduction))];
  const deductionTotal = sum(...deductions.map((l) => l.values));

  const trees = months.map((m) => (m?.expenses ? costTree(m.expenses) : []));
  const groups = [...new Set([...REPORT_GROUPS, ...trees.flatMap((t) => t.map((g) => g.group))])];
  const costRows: PnlRow[] = [];
  groups.forEach((group, i) => {
    const total = withTotal(trees.map((t) => t.find((g) => g.group === group)?.total ?? 0));
    costRows.push(row(`${i + 1}. ${group}`, total, "total", true));
    const names = [...new Set(trees.flatMap((t) => t.find((g) => g.group === group)?.kinds.map((k) => k.name) ?? []))];
    for (const name of names) costRows.push(row(name, withTotal(trees.map((t) => t.find((g) => g.group === group)?.kinds.find((k) => k.name === name)?.total ?? 0)), "line", true));
  });
  const costTotal = sum(...costRows.filter((r) => r.kind === "total").map((r) => r.values));
  const revenue = sum(gross, neg(deductionTotal));
  return [
    row("I. TỔNG DOANH THU (I = 1 − 2)", revenue, "total"),
    row("1. Doanh thu khách sạn", gross, "total"), ...lines,
    row("2. Các khoản giảm trừ doanh thu", deductionTotal, "total"), ...deductions,
    row("II. TỔNG CHI PHÍ HĐKD", costTotal, "total", true), ...costRows,
    row("III. LỢI NHUẬN THUẦN TỪ HĐKD (III = I − II)", sum(revenue, neg(costTotal)), "total", true),
  ];
}

// The weekly management table (the finance team's "BC Doanh thu, CP" and "BC TH"): one column per week of the month and one for the month, blocks one under the other.
// Hotel revenue from Blue Jay by check-out day, the hotel's money in and out from its ledger, then each F&B unit from its ledger. Pure function: tested by ql-report.test.ts. Imports use ".ts" because tests run this with plain Node.
import type { CheckoutDay } from "./bluejay-checkout.ts";
import { weekColumns, type Balances, type ExpenseLine, type FinanceReport, type FinanceSummary, type ReportRow } from "./finance-summary.ts";
import { EXPENSES, FNB_EXPENSES, MART_EXPENSES } from "./expense-kinds.ts";
import { costTree } from "./pnl.ts";
import type { FnbReport } from "./fnb-ledger.ts";
import type { LedgerEntry } from "./bluejay-reconcile.ts";

export const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
};

/** days: the hotel's days by check-out; finance: financeReport over the same month; fnb: fnbReport of the F&B ledger. Any of them may be missing: its blocks are left out. */
export function qlWeekly(month: string, input: { days?: CheckoutDay[]; finance?: FinanceReport; fnb?: FnbReport }) {
  const columns = weekColumns(monthRange(month));
  const sumDays = <T extends { date: string }>(list: T[], f: (d: T) => number) => columns.map((c) => list.filter((d) => d.date >= c.from && d.date <= c.to).reduce((s, d) => s + f(d), 0));
  const add = (...lists: number[][]) => columns.map((_, i) => lists.reduce((s, l) => s + l[i], 0));
  const row = (label: string, values: number[], kind: ReportRow["kind"] = "line"): ReportRow => ({ label, kind, values });
  const section = (label: string) => row(label, columns.map(() => 0), "section");
  const rows: ReportRow[] = [];
  let hotelTotal: number[] | null = null;
  // Breakfast and cafe of hotel guests charged to the room: collected by the hotel, so inside the hotel's revenue, but they are the F&B unit's sales
  const via = add(columns.map(() => 0), ...(input.fnb?.units ?? []).map((u) => sumDays(u.days, (x) => x.hotel))), hasVia = via.some((v) => v);
  let hotelNet: number[] | null = null;

  if (input.days) {
    const d = input.days;
    const room = sumDays(d, (x) => x.room), service = sumDays(d, (x) => x.service), excluded = sumDays(d, (x) => x.excludedRoom + x.excludedService);
    hotelTotal = add(room, service, excluded);
    rows.push(section("KHÁCH SẠN · DOANH THU THEO NGÀY TRẢ PHÒNG (Blue Jay)"), row("Đêm của đặt phòng", sumDays(d, (x) => x.rooms)), row("Tiền phòng", room), row("Tiền dịch vụ", service),
      row("Tổng doanh thu (không tính M-Standard / Unassigned)", add(room, service), "total"), row("M-Standard / Unassigned", excluded), row("Tổng doanh thu có M-Standard / Unassigned", hotelTotal, "total"));
    hotelNet = hasVia ? add(hotelTotal, via.map((v) => 0 - v)) : hotelTotal;
    if (hasVia) rows.push(row("Trừ: Ăn sáng, cafe thu qua khách sạn (ghi vào phòng)", via.map((v) => 0 - v)), row("Doanh thu khách sạn sau trừ Ăn sáng, cafe", hotelNet, "total"));
    const deduction = input.finance?.rows.find((r) => r.label.startsWith("Giảm trừ doanh thu"));
    if (deduction) rows.push(row("Giảm trừ doanh thu (hoa hồng, phí quẹt thẻ)", deduction.values), row("Doanh thu sau giảm trừ", add(hotelNet, deduction.values), "total")); // the deduction is negative
  }
  if (input.finance) {
    const from = input.finance.rows.findIndex((r) => r.label.startsWith("2. "));
    rows.push(section("KHÁCH SẠN · TIỀN THU VÀ CHI THEO BẢNG KÊ"), ...input.finance.rows.slice(Math.max(from, 0)).filter((r) => !r.label.startsWith("Thu theo dịch vụ − chi"))); // block 1 of the ledger report is by service on the day of receipt: the Blue Jay block above is the revenue
  }
  let sales: number[] | null = null;
  for (const u of input.fnb?.units ?? []) {
    const counter = sumDays(u.days, (x) => x.income), hotel = sumDays(u.days, (x) => x.hotel), thu = add(counter, hotel), chi = sumDays(u.days, (x) => x.expense);
    sales = sales ? add(sales, thu) : thu;
    rows.push(section(u.label.toUpperCase()), row("Thu bán hàng", thu, "total"), row("Thu tiền mặt", sumDays(u.days, (x) => x.cash)), row("Thu chuyển khoản (gồm POS)", sumDays(u.days, (x) => x.bank)), ...(hotel.some((v) => v) ? [row("Thu qua khách sạn (ghi vào phòng, tiền ở khách sạn)", hotel)] : []), row("Chi", chi, "total"), row("Thu − chi", add(thu, chi.map((v) => 0 - v))));
  }
  if (hotelNet && sales) rows.push(section("TỔNG"), row("Doanh thu khách sạn + thu bán hàng Ăn sáng, cafe, mini mart", add(hotelNet, sales), "total")); // hotelNet: the part moved to the F&B unit is counted once
  return { columns, rows };
}

export type FundLine = { label: string; fund: "cash" | "bank" | "card"; open: number | null; in: number; out: number; net: number; close: number | null; total?: boolean }; // open: the typed opening balance, null when the tabs have none; close = open + net

/** Opening balance, money in and out and closing balance of each fund over the month (the finance team's "BC DÒNG TIỀN"), then the totals of cash and bank over the units (a missing opening counts as 0 there). Transfers between funds (withdrawals) are inside. */
export function qlFunds(input: { hotel?: FinanceSummary; balances?: Balances; fnb?: FnbReport }): FundLine[] {
  const lines: FundLine[] = [];
  const h = input.hotel;
  if (h) for (const [fund, label, paid] of [["cash", "tiền mặt", h.expense.total.cash], ["bank", "tài khoản ngân hàng", h.expense.total.bank], ["card", "thẻ visa", h.expense.total.visa]] as const) {
    const open = fund === "cash" ? input.balances?.openCash ?? null : fund === "bank" ? input.balances?.openBank ?? null : null, net = h.funds[fund];
    lines.push({ label: `Khách sạn · ${label}`, fund, open, in: h.income.taken[fund] - h.income.deposit[fund] + h.income.advance[fund], out: paid, net, close: open === null ? null : open + net });
  }
  for (const u of input.fnb?.units ?? []) lines.push(
    { label: `${u.label} · tiền mặt`, fund: "cash", open: u.balances.openCash, in: u.sales.cash + u.other.cash, out: u.spent.cash, net: u.funds.cash, close: u.balances.openCash === null ? null : u.balances.openCash + u.funds.cash },
    { label: `${u.label} · ngân hàng (gồm POS)`, fund: "bank", open: u.balances.openBank, in: u.sales.bank + u.sales.pos + u.other.bank, out: u.spent.bank + u.spent.visa, net: u.funds.bank, close: u.balances.openBank === null ? null : u.balances.openBank + u.funds.bank });
  for (const [fund, label] of [["cash", "Tổng tiền mặt"], ["bank", "Tổng ngân hàng"]] as const) {
    const own = lines.filter((l) => l.fund === fund);
    const sum = (f: (l: FundLine) => number) => own.reduce((t, l) => t + f(l), 0);
    if (own.length > 1) lines.push({ label, fund, open: sum((l) => l.open ?? 0), in: sum((l) => l.in), out: sum((l) => l.out), net: sum((l) => l.net), close: sum((l) => l.open ?? 0) + sum((l) => l.net), total: true });
  }
  return lines;
}

export type BookCol = { label: string; side: "in" | "out"; memo?: boolean }; // memo: shown, but not part of this book's balance (another account)
export type Book = { cols: BookCol[]; opening: number; rows: { date: string; open: number; values: number[]; close: number }[]; total: { values: number[]; close: number }; sheetClose: number | null };

/** The finance team's "TK TM" (cash book) and "TK TG NH" (bank book), day by day for the month: opening balance, money in and out per unit, closing balance. Cash: the hotel and both F&B units in one drawer; bank: the hotel's account, the F&B accounts only listed beside it.
 * Opening balances are the ones typed at the top of the ledger tabs (0 when there is none). sheetClose: the closing balance the sheet itself shows, to compare with, when every tab that has an opening also has a closing. The hotel's cash in includes the deposits of guests not yet staying (as in the fund panel of BK THU). */
export function qlBooks(month: string, input: { hotel?: { summary: FinanceSummary; balances: Balances }; fnb?: FnbReport }) {
  const { from, to } = monthRange(month);
  const dates: string[] = [];
  for (let d = from; d <= to; d = new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10)) dates.push(d);
  const units = input.fnb?.units ?? [];
  const build = (cols: (BookCol & { open?: number | null; close?: number | null; by: Map<string, number> })[]): Book => {
    const counted = cols.filter((c) => !c.memo);
    const opening = counted.reduce((t, c) => t + (c.open ?? 0), 0);
    const delta = (date: string) => counted.reduce((t, c) => t + (c.by.get(date) ?? 0) * (c.side === "in" ? 1 : -1), 0);
    let open = opening;
    const rows = dates.map((date) => { const values = cols.map((c) => c.by.get(date) ?? 0), close = open + delta(date); const row = { date, open, values, close }; open = close; return row; });
    const owners = new Set(counted.map((c) => c.label.split(" · ")[0]));
    const known = [...owners].every((o) => counted.some((c) => c.label.startsWith(o) && c.open != null && c.close != null));
    return { cols: cols.map(({ label, side, memo }) => ({ label, side, memo })), opening, rows, total: { values: cols.map((c) => dates.reduce((t, d) => t + (c.by.get(d) ?? 0), 0)), close: open }, sheetClose: known && owners.size ? [...owners].reduce((t, o) => t + (counted.find((c) => c.label.startsWith(o))?.close ?? 0), 0) : null };
  };
  const hotelDay = (pick: (d: FinanceSummary["fundDaily"][number]) => number) => new Map((input.hotel?.summary.fundDaily ?? []).map((d) => [d.date, pick(d)]));
  const unitDay = (u: FnbReport["units"][number], pick: (d: FnbReport["units"][number]["days"][number]) => number) => new Map(u.days.map((d) => [d.date, pick(d)]));
  const cash: (BookCol & { open?: number | null; close?: number | null; by: Map<string, number> })[] = [];
  const bank: typeof cash = [];
  const h = input.hotel;
  if (h) {
    cash.push({ label: "Khách sạn · thu", side: "in", by: hotelDay((d) => d.cash.in + d.cash.adv), open: h.balances.openCash, close: h.balances.closeCash }, { label: "Khách sạn · chi", side: "out", by: hotelDay((d) => d.cash.out) });
    bank.push({ label: "Khách sạn · thu", side: "in", by: hotelDay((d) => d.bank.in + d.bank.adv), open: h.balances.openBank, close: h.balances.closeBank }, { label: "Khách sạn · chi", side: "out", by: hotelDay((d) => d.bank.out) });
  }
  for (const u of units) {
    cash.push({ label: `${u.label} · thu`, side: "in", by: unitDay(u, (d) => d.inCash), open: u.balances.openCash, close: u.balances.closeCash }, { label: `${u.label} · chi`, side: "out", by: unitDay(u, (d) => d.outCash) });
    bank.push({ label: `${u.label} · thu (gồm POS)`, side: "in", memo: true, by: unitDay(u, (d) => d.inBank) }, { label: `${u.label} · chi`, side: "out", memo: true, by: unitDay(u, (d) => d.outBank) });
  }
  return { cash: build(cash), bank: build(bank) };
}

export type KqRow = ReportRow & { stt?: string; code?: string; note?: string };
const KQ_GROUPS = ["Chi phí đầu tư, sự kiện", "Chi phí vận hành", "Chi phí nhân sự", "Chi phí khác", "Chi dịch vụ ngoài & nộp thuế"]; // the order of the finance team's sheet (REPORT_GROUPS has the last two the other way round)
// The units name some kinds differently ("Chi Marketing – OTA" at the hotel, "Chi Marketing" at the mini mart): kinds are put on one line by their code, under the first name met (the hotel's).
const plain = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/đ/g, "d").replace(/[–—-]/g, " ").replace(/\s+/g, " ").trim();
const CODE_OF = new Map([...EXPENSES, ...FNB_EXPENSES, ...MART_EXPENSES].map(([code, name]) => [plain(name), code]));
const kindKey = (name: string) => CODE_OF.get(plain(name)) ?? name;
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

/** The month's result laid out like the finance team's "BẢNG KẾT QUẢ HOẠT ĐỘNG KINH DOANH" (STT, Chỉ tiêu, Mã số, Ghi chú), one column per unit and a total: revenue (hotel by check-out day, with M-Standard / Unassigned, F&B sales),
 * deductions, costs by group in the finance team's order, profit. hotel: the ledger's summary and expense lines of the month. */
export function qlResult(month: string, input: { days?: CheckoutDay[]; hotel?: { summary: FinanceSummary; expenses: ExpenseLine[] }; fnb?: FnbReport }) {
  const { from, to } = monthRange(month);
  type Unit = { label: string; room: number; service: number; sales: number; commission: number; otherDeduction: number; tree: ReturnType<typeof costTree> };
  const units: Unit[] = [];
  const via = input.days ? (input.fnb?.units ?? []).reduce((t, u) => t + u.sales.hotel, 0) : 0; // breakfast and cafe charged to hotel rooms: inside the hotel's service revenue, moved to the F&B unit
  if (input.days || input.hotel) {
    const d = (input.days ?? []).filter((x) => x.date >= from && x.date <= to), inc = input.hotel?.summary.income;
    units.push({
      label: "Khách sạn", room: d.reduce((t, x) => t + x.room + x.excludedRoom, 0), service: d.reduce((t, x) => t + x.service + x.excludedService, 0) - via, sales: 0,
      commission: inc?.commission ?? 0, otherDeduction: inc?.otherDeduction ?? 0,
      tree: input.hotel ? costTree(input.hotel.expenses.filter((e) => e.date >= from && e.date <= to)) : [],
    });
  }
  for (const u of input.fnb?.units ?? []) units.push({ label: u.label, room: 0, service: 0, sales: u.sales.total + u.sales.hotel, commission: 0, otherDeduction: 0, tree: u.tree });
  const withTotal = (v: number[]) => [...v, v.reduce((a, b) => a + b, 0)];
  const each = (f: (u: Unit) => number) => withTotal(units.map(f));
  const row = (label: string, values: number[], kind: ReportRow["kind"] = "line", extra: { stt?: string; code?: string; note?: string } = {}): KqRow => ({ label, kind, values, ...extra });
  const gross = each((u) => u.room + u.service + u.sales), commission = each((u) => u.commission), other = each((u) => u.otherDeduction);
  const deduction = commission.map((v, i) => v + other[i]), revenue = gross.map((v, i) => v - deduction[i]);
  const groups = [...KQ_GROUPS, ...new Set(units.flatMap((u) => u.tree.map((g) => g.group)).filter((g) => !KQ_GROUPS.includes(g)))];
  const costRows: KqRow[] = [];
  groups.forEach((group, i) => {
    costRows.push(row(group, each((u) => u.tree.find((g) => g.group === group)?.total ?? 0), "total", { stt: String(i + 1), code: ROMAN[i] }));
    const kindsOf = (u: Unit) => u.tree.find((g) => g.group === group)?.kinds ?? [];
    const names = new Map<string, string>();
    for (const u of units) for (const k of kindsOf(u)) if (!names.has(kindKey(k.name))) names.set(kindKey(k.name), k.name);
    for (const [key, name] of names) costRows.push(row(name, each((u) => kindsOf(u).filter((k) => kindKey(k.name) === key).reduce((t, k) => t + k.total, 0))));
  });
  const cost = withTotal(units.map((_, i) => costRows.filter((r) => r.kind === "total").reduce((t, r) => t + r.values[i], 0)));
  const rows: KqRow[] = [
    row("I, TỔNG DOANH THU (I=1-2)", revenue, "total"),
    row("Doanh thu khách sạn và bán hàng", gross, "total", { stt: "1", code: "I" }),
    row("Tiền phòng", each((u) => u.room), "line", { code: "1.1", note: "Theo ngày trả phòng, gồm M-Standard / Unassigned" }),
    row("Tiền dịch vụ", each((u) => u.service), "line", { code: "1.2", note: `Minibar, giặt ủi, dịch vụ ngoài, thu khác: Blue Jay chỉ trả gộp theo đặt phòng${via ? "; đã trừ Ăn sáng, cafe thu qua khách sạn" : ""}` }),
    row("Thu bán hàng", each((u) => u.sales), "line", { code: "1.3", note: via ? "Ăn sáng, cafe, mini mart; Ăn sáng, cafe gồm phần thu qua khách sạn" : "Ăn sáng, cafe, mini mart" }),
    row("Các khoản giảm trừ doanh thu", deduction, "total", { stt: "2", code: "II" }),
    row("Hoa hồng nền tảng", commission, "line", { code: "2.1" }), row("Phí quẹt thẻ, giảm giá khách hàng", other, "line", { code: "2.2" }),
    row("II, TỔNG CHI PHÍ HĐKD (II = 1+2+3+4+5)", cost, "total"), ...costRows,
    row("III, Lợi nhuận thuần từ HĐKD (III = I-II)", revenue.map((v, i) => v - cost[i]), "total", { code: "VI" }),
  ];
  return { columns: [...units.map((u) => u.label), "Tổng"], rows };
}

export type PartyLine = { date: string; what: string; note: string; cash: number; bank: number; card: number };
export type Party = { label: string; thu: PartyLine[]; chi: PartyLine[] };
const lineTotal = (l: PartyLine) => l.cash + l.bank + l.card;
export const partyTotals = (lines: PartyLine[]) => lines.reduce((t, l) => ({ cash: t.cash + l.cash, bank: t.bank + l.bank, card: t.card + l.card, all: t.all + lineTotal(l) }), { cash: 0, bank: 0, card: 0, all: 0 });

/** The money in (thu) and out (chi) of each party, line by line, to check against the accountant's files: the hotel, then every F&B unit. The amounts are the ones of "Dòng tiền" (qlFunds): hotel thu = takings - deposits already received + deposits of guests not staying yet,
 * F&B thu = counter sales + other money in (POS and transfers count as bank). Hotel lines are cut to the month; the F&B lines are those of the unit's tabs (a line outside the month is already reported in the notes). */
export function qlParties(month: string, input: { hotel?: { entries: LedgerEntry[]; expenses: ExpenseLine[] }; fnb?: FnbReport }): Party[] {
  const { from, to } = monthRange(month);
  const byDate = (a: PartyLine, b: PartyLine) => a.date.localeCompare(b.date);
  const chiOf = (list: ExpenseLine[]) => list.map((e): PartyLine => ({ date: e.date, what: e.kind, note: e.note, cash: e.cash, bank: e.bank, card: e.visa })).filter((l) => lineTotal(l) !== 0).sort(byDate);
  const parties: Party[] = [];
  const h = input.hotel;
  if (h) parties.push({
    label: "Khách sạn",
    thu: h.entries.filter((e) => e.date >= from && e.date <= to).map((e): PartyLine => ({
      date: e.date, what: [e.service, e.platform].filter(Boolean).join(" · "), note: [e.id, e.note].filter(Boolean).join(" · "),
      cash: e.taken.cash - e.deposit.cash + e.advance.cash, bank: e.taken.bank - e.deposit.bank + e.advance.bank, card: e.taken.card - e.deposit.card + e.advance.card,
    })).filter((l) => lineTotal(l) !== 0).sort(byDate),
    chi: chiOf(h.expenses.filter((e) => e.date >= from && e.date <= to)),
  });
  for (const u of input.fnb?.units ?? []) parties.push({
    label: u.label,
    thu: u.ledger.income.map((l): PartyLine => ({ date: l.date, what: l.seller || "Thu bán hàng", note: l.note, cash: l.cash + l.otherCash, bank: l.bank + l.pos + l.otherBank, card: 0 })).filter((l) => lineTotal(l) !== 0).sort(byDate),
    chi: chiOf(u.ledger.expense),
  });
  return parties;
}

// The weekly management table (the finance team's "BC Doanh thu, CP" and "BC TH"): one column per week of the month and one for the month, blocks one under the other.
// Hotel revenue from Blue Jay by check-out day, the hotel's money in and out from its ledger, then each F&B unit from its ledger. Pure function: tested by ql-report.test.ts. Imports use ".ts" because tests run this with plain Node.
import type { CheckoutDay } from "./bluejay-checkout.ts";
import { REPORT_GROUPS, weekColumns, type ExpenseLine, type FinanceReport, type FinanceSummary, type ReportRow } from "./finance-summary.ts";
import { costTree } from "./pnl.ts";
import type { FnbReport } from "./fnb-ledger.ts";

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

  if (input.days) {
    const d = input.days;
    const room = sumDays(d, (x) => x.room), service = sumDays(d, (x) => x.service), excluded = sumDays(d, (x) => x.excludedRoom + x.excludedService);
    hotelTotal = add(room, service, excluded);
    rows.push(section("KHÁCH SẠN · DOANH THU THEO NGÀY TRẢ PHÒNG (Blue Jay)"), row("Đêm của đặt phòng", sumDays(d, (x) => x.rooms)), row("Tiền phòng", room), row("Tiền dịch vụ", service),
      row("Tổng doanh thu (không tính M-Standard / Unassigned)", add(room, service), "total"), row("M-Standard / Unassigned", excluded), row("Tổng doanh thu có M-Standard / Unassigned", hotelTotal, "total"));
    const deduction = input.finance?.rows.find((r) => r.label.startsWith("Giảm trừ doanh thu"));
    if (deduction) rows.push(row("Giảm trừ doanh thu (hoa hồng, phí quẹt thẻ)", deduction.values), row("Doanh thu sau giảm trừ", add(hotelTotal, deduction.values), "total")); // the deduction is negative
  }
  if (input.finance) {
    const from = input.finance.rows.findIndex((r) => r.label.startsWith("2. "));
    rows.push(section("KHÁCH SẠN · TIỀN THU VÀ CHI THEO BẢNG KÊ"), ...input.finance.rows.slice(Math.max(from, 0)).filter((r) => !r.label.startsWith("Thu theo dịch vụ − chi"))); // block 1 of the ledger report is by service on the day of receipt: the Blue Jay block above is the revenue
  }
  let sales: number[] | null = null;
  for (const u of input.fnb?.units ?? []) {
    const thu = sumDays(u.days, (x) => x.income), chi = sumDays(u.days, (x) => x.expense);
    sales = sales ? add(sales, thu) : thu;
    rows.push(section(u.label.toUpperCase()), row("Thu bán hàng", thu, "total"), row("Thu tiền mặt", sumDays(u.days, (x) => x.cash)), row("Thu chuyển khoản (gồm POS)", sumDays(u.days, (x) => x.bank)), row("Chi", chi, "total"), row("Thu − chi", add(thu, chi.map((v) => 0 - v))));
  }
  if (hotelTotal && sales) rows.push(section("TỔNG"), row("Doanh thu khách sạn + thu bán hàng Ăn sáng, cafe, mini mart", add(hotelTotal, sales), "total"));
  return { columns, rows };
}

export type FundLine = { label: string; fund: "cash" | "bank" | "card"; in: number; out: number; net: number; total?: boolean };

/** Money in and out of each fund over the month (the finance team's "BC DÒNG TIỀN" without the typed opening and closing balances), then the totals of cash and bank over the units. Transfers between funds (withdrawals) are inside. */
export function qlFunds(input: { hotel?: FinanceSummary; fnb?: FnbReport }): FundLine[] {
  const lines: FundLine[] = [];
  const h = input.hotel;
  if (h) for (const [fund, label, paid] of [["cash", "tiền mặt", h.expense.total.cash], ["bank", "tài khoản ngân hàng", h.expense.total.bank], ["card", "thẻ visa", h.expense.total.visa]] as const) {
    lines.push({ label: `Khách sạn · ${label}`, fund, in: h.income.taken[fund] - h.income.deposit[fund] + h.income.advance[fund], out: paid, net: h.funds[fund] });
  }
  for (const u of input.fnb?.units ?? []) lines.push(
    { label: `${u.label} · tiền mặt`, fund: "cash", in: u.sales.cash + u.other.cash, out: u.spent.cash, net: u.funds.cash },
    { label: `${u.label} · ngân hàng (gồm POS)`, fund: "bank", in: u.sales.bank + u.sales.pos + u.other.bank, out: u.spent.bank + u.spent.visa, net: u.funds.bank });
  for (const [fund, label] of [["cash", "Tổng tiền mặt"], ["bank", "Tổng ngân hàng"]] as const) {
    const own = lines.filter((l) => l.fund === fund);
    if (own.length > 1) lines.push({ label, fund, in: own.reduce((t, l) => t + l.in, 0), out: own.reduce((t, l) => t + l.out, 0), net: own.reduce((t, l) => t + l.net, 0), total: true });
  }
  return lines;
}

/** The month's result like the finance team's "KQ HĐKD", one column per unit and a total: revenue (hotel by check-out day, with M-Standard / Unassigned, F&B sales), deductions, costs by report group, profit. hotel: the ledger's summary and expense lines of the month. */
export function qlResult(month: string, input: { days?: CheckoutDay[]; hotel?: { summary: FinanceSummary; expenses: ExpenseLine[] }; fnb?: FnbReport }) {
  const { from, to } = monthRange(month);
  type Unit = { label: string; room: number; service: number; sales: number; deduction: number; tree: ReturnType<typeof costTree> };
  const units: Unit[] = [];
  if (input.days || input.hotel) {
    const d = (input.days ?? []).filter((x) => x.date >= from && x.date <= to);
    units.push({
      label: "Khách sạn", room: d.reduce((t, x) => t + x.room + x.excludedRoom, 0), service: d.reduce((t, x) => t + x.service + x.excludedService, 0), sales: 0,
      deduction: input.hotel ? input.hotel.summary.income.commission + input.hotel.summary.income.otherDeduction : 0,
      tree: input.hotel ? costTree(input.hotel.expenses.filter((e) => e.date >= from && e.date <= to)) : [],
    });
  }
  for (const u of input.fnb?.units ?? []) units.push({ label: u.label, room: 0, service: 0, sales: u.sales.total, deduction: 0, tree: u.tree });
  const withTotal = (v: number[]) => [...v, v.reduce((a, b) => a + b, 0)];
  const each = (f: (u: Unit) => number) => withTotal(units.map(f));
  const row = (label: string, values: number[], kind: ReportRow["kind"] = "line"): ReportRow => ({ label, kind, values });
  const gross = each((u) => u.room + u.service + u.sales), deduction = each((u) => u.deduction);
  const revenue = gross.map((v, i) => v - deduction[i]);
  const groups = [...new Set([...REPORT_GROUPS, ...units.flatMap((u) => u.tree.map((g) => g.group))])];
  const costRows: ReportRow[] = [];
  groups.forEach((group, i) => {
    costRows.push(row(`${i + 1}. ${group}`, each((u) => u.tree.find((g) => g.group === group)?.total ?? 0), "total"));
    const names = [...new Set(units.flatMap((u) => u.tree.find((g) => g.group === group)?.kinds.map((k) => k.name) ?? []))];
    for (const name of names) costRows.push(row(name, each((u) => u.tree.find((g) => g.group === group)?.kinds.find((k) => k.name === name)?.total ?? 0)));
  });
  const cost = withTotal(units.map((_, i) => costRows.filter((r) => r.kind === "total").reduce((t, r) => t + r.values[i], 0)));
  return {
    columns: [...units.map((u) => u.label), "Tổng"],
    rows: [
      row("I. TỔNG DOANH THU (I = 1 − 2)", revenue, "total"),
      row("1. Doanh thu bán hàng và phòng", gross, "total"), row("Tiền phòng (gồm M-Standard / Unassigned)", each((u) => u.room)), row("Tiền dịch vụ", each((u) => u.service)), row("Thu bán hàng", each((u) => u.sales)),
      row("2. Các khoản giảm trừ doanh thu (hoa hồng, phí quẹt thẻ)", deduction, "total"),
      row("II. TỔNG CHI PHÍ HĐKD", cost, "total"), ...costRows,
      row("III. LỢI NHUẬN THUẦN TỪ HĐKD (III = I − II)", revenue.map((v, i) => v - cost[i]), "total"),
    ],
  };
}

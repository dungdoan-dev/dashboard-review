// Income and expense of one hotel for a period, from the two monthly ledgers ("Bảng kê thu" parsed by parseLedger, "Bảng kê chi" by parseExpenses below).
// Pure functions: tested by finance-summary.test.ts. Imports use ".ts" because tests run this with plain Node.
import { addDays, isoWeek, mondayOf } from "./bluejay-metrics.ts";
import { ledgerDate, type Funds, type LedgerEntry } from "./bluejay-reconcile.ts";
import { EXPENSES } from "./expense-kinds.ts";

/** A row that is only a fee or a commission taken off a payout: no booking id and a negative amount, or a card settlement line (the card fee as a negative amount). The same money is in the deduction columns. */
const isFeeRow = (e: LedgerEntry) => (!e.id && sum(e.taken) < 0) || /^tien quet the/.test(norm(e.service));
const isTransfer = (e: LedgerEntry) => /(^| )(luan chuyen|rut tien)( |$)/.test(norm(`${e.service} ${e.note}`));
const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/đ/g, "d").replace(/[–—-]/g, " ").replace(/\s+/g, " ").trim();
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export type ExpenseLine = { row: number; date: string; kind: string; note: string; cash: number; bank: number; visa: number; commission: number; cardFee: number }; // cash, bank, visa: paid out of that fund; commission, cardFee: taken off the takings (no payment)

/** rows: the sheet as an array of rows (XLSX.utils.sheet_to_json with header: 1). Columns are found by their names, so the finance team's sheet and the template both read. */
export function parseExpenses(rows: unknown[][]): ExpenseLine[] {
  const head = rows.findIndex((r) => r.some((c) => norm(c) === "hang muc") && r.some((c) => norm(c) === "noi dung chi"));
  if (head < 0) throw new Error("Không nhận ra bảng kê chi: không thấy cột “Hạng mục” và “Nội dung chi”.");
  const at = (re: RegExp) => { for (let i = head; i <= head + 1 && i < rows.length; i++) { const c = rows[i].findIndex((cell) => re.test(norm(cell))); if (c >= 0) return c; } return -1; };
  const col = { date: at(/^ngay$/), kind: at(/^hang muc$/), note: at(/^noi dung chi$/), cash: at(/^chi tien mat$/), bank: at(/^chi tien ck$/), visa: at(/^chi tien ck the visa$/), commission: at(/^hoa hong nen tang$/), cardFee: at(/^phi quet the$/) };
  const missing = Object.entries({ "Ngày": col.date, "Chi tiền mặt": col.cash, "Chi tiền CK": col.bank, "Chi tiền CK thẻ visa": col.visa }).filter(([, c]) => c < 0).map(([name]) => name);
  if (missing.length) throw new Error(`Bảng kê chi thiếu cột: ${missing.join(", ")}.`);
  const lines: ExpenseLine[] = [];
  for (let i = head + 1; i < rows.length; i++) {
    const r = rows[i], date = ledgerDate(r[col.date]);
    if (!date) continue; // sub-header, TỔNG and blank rows
    lines.push({ row: i + 1, date, kind: String(r[col.kind] ?? "").trim(), note: String(r[col.note] ?? "").trim(), cash: num(r[col.cash]), bank: num(r[col.bank]), visa: num(r[col.visa]), commission: num(r[col.commission]), cardFee: num(r[col.cardFee]) });
  }
  return lines;
}

const zero = (): Funds => ({ cash: 0, bank: 0, card: 0 });
const add = (a: Funds, b: Funds): Funds => ({ cash: a.cash + b.cash, bank: a.bank + b.bank, card: a.card + b.card });
const sum = (f: Funds) => f.cash + f.bank + f.card;

export const REPORT_GROUPS = ["Chi phí đầu tư, sự kiện", "Chi phí vận hành", "Chi phí nhân sự", "Chi dịch vụ ngoài & nộp thuế", "Chi phí khác"];
export const UNLISTED = "Chưa phân loại (hạng mục không có trong danh mục)";

/**
 * The accountant's weekly report groups costs by the OLD categories ("Chi thuế nhà thầu", "Phí quẹt thẻ", ...); the 16 expenses of the template are coarser, so a few of them straddle groups
 * and the line's own words decide. Checked against the accountant's August figures (BC Doanh thu, CP, weeks 32 to 35): 43 of 45 lines fall in the same group, the 2 others were reclassified by the accountant when the sheet moved to the template.
 */
export function reportGroup(kind: string, note: string, listGroup: string): string {
  const k = norm(kind), t = norm(note);
  if (/^chi thue phap ly pccc/.test(k)) return /nha thau/.test(t) ? "Chi phí vận hành" : /pccc|cong an|giay phep|chu ky so|khai bao|so khai|dang ky|an ninh/.test(t) ? "Chi phí khác" : "Chi dịch vụ ngoài & nộp thuế";
  if (/^chi marketing ota/.test(k)) return /hoa hong|^hh /.test(t) ? "Chi phí vận hành" : "Chi dịch vụ ngoài & nộp thuế";
  if (/^chi dien nuoc vien thong/.test(k)) return /sms/.test(t) ? "Chi phí khác" : /quet the|phi ck|phi chuyen|phi ngan hang/.test(t) ? "Chi phí vận hành" : "Chi dịch vụ ngoài & nộp thuế";
  if (/^chi dich vu ngoai phan mem/.test(k)) return /thuong dv ngoai|thuong doanh thu|luong/.test(t) ? "Chi phí nhân sự" : /bluejay|phan mem|kiotviet|chu ky so/.test(t) ? "Chi phí khác" : "Chi dịch vụ ngoài & nộp thuế";
  return listGroup;
}

export type FundDay = { in: number; adv: number; out: number }; // in: takings - deposits of staying guests; adv: deposits not staying yet; out: paid
export type FinanceSummary = {
  from: string; to: string;
  income: {
    taken: Funds & { total: number };                                    // deposits of staying guests + cash + account + card: the hotel's takings
    deposit: Funds & { total: number };                                  // the part of taken that is a deposit of a guest now staying (received earlier: not new money in the funds)
    advance: Funds & { total: number };                                  // "Cọc ... chưa ở": deposits of guests who have not stayed yet
    pos: number;                                                         // POS cafe
    byService: { name: string; total: number }[];                        // takings by service, biggest first
    revenueByService: { name: string; total: number }[];                 // the same without the rows that only carry a fee or a commission as a negative amount (they are in the deductions already)
    byPlatform: { name: string; total: number }[];
    transferByFund: Funds;                                               // the same, split by fund
    transfer: number;                                                    // money moved between the hotel's own funds ("Luân chuyển", "Rút tiền"): in taken, not in byService, byPlatform or daily
    commission: number; otherDeduction: number;                          // taken off the takings by OTAs and banks (not paid out)
  };
  expense: {
    byKind: { code: string; name: string; group: string; cash: number; bank: number; visa: number; total: number }[]; // every listed kind, in list order
    total: { cash: number; bank: number; visa: number; all: number };
    transfer: number;                                                    // the part of total in the kind "Điều chuyển tiền" (not a cost): the funds move, the profit does not

    byGroup: { group: string; total: number }[];                         // costs by report group (see reportGroup), transfers left out; "Chưa phân loại" last, only when there is one
    commission: number; cardFee: number;                                 // the expense ledger's own columns "Hoa hồng nền tảng" and "Phí quẹt thẻ": to cross-check the income ledger's deductions
    unlisted: { row: number; kind: string; amount: number }[];           // lines whose kind is not in the list: counted in the total, not in byKind
  };
  daily: { date: string; income: number; expense: number }[];
  outside: { incomeLines: number; expenseLines: number; expenseAmount: number }; // lines of the two ledgers that fall outside from..to and are left out of everything above
  fundDaily: { date: string; cash: FundDay; bank: FundDay }[];           // per day and fund, in the terms of the sổ quỹ and sổ tiền gửi (see fund-books.ts)
  funds: Funds;                                                          // movement per fund like the finance team's sổ quỹ and sổ tiền gửi: (takings - deposits of staying guests + new deposits) - expense; card -> visa account
};

/** Everything between from and to (inclusive, yyyy-mm-dd); omitted: every line given. */
export function summarizeFinance(entries: LedgerEntry[], expenses: ExpenseLine[], range?: { from: string; to: string }, list: typeof EXPENSES = EXPENSES): FinanceSummary {
  const inside = (d: string) => !range || (d >= range.from && d <= range.to);
  const inc = entries.filter((e) => inside(e.date)), exp = expenses.filter((e) => inside(e.date));
  const outsideExp = expenses.filter((e) => !inside(e.date));
  const taken = inc.reduce((s, e) => add(s, e.taken), zero()), deposit = inc.reduce((s, e) => add(s, e.deposit), zero()), advance = inc.reduce((s, e) => add(s, e.advance), zero());
  const pos = inc.reduce((s, e) => s + e.pos, 0);
  const real = inc.filter((e) => !isTransfer(e));
  const group = (key: (e: LedgerEntry) => string, from = real) => {
    const m = new Map<string, number>();
    for (const e of from) { const t = sum(e.taken); if (t) m.set(key(e) || "(chưa ghi)", (m.get(key(e) || "(chưa ghi)") ?? 0) + t); }
    return [...m].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  };
  const kinds = new Map(list.map(([code, name, , grp]) => [norm(name), { code, name, group: grp, cash: 0, bank: 0, visa: 0, total: 0 }]));
  const unlisted: FinanceSummary["expense"]["unlisted"] = [];
  const total = { cash: 0, bank: 0, visa: 0, all: 0 };
  const groups = new Map<string, number>(REPORT_GROUPS.map((g) => [g, 0]));
  for (const e of exp) {
    const paid = e.cash + e.bank + e.visa, k = kinds.get(norm(e.kind));
    if (!k?.group.startsWith("Điều chuyển")) { const g = k ? reportGroup(e.kind, e.note, k.group) : UNLISTED; groups.set(g, (groups.get(g) ?? 0) + paid); }
    total.cash += e.cash; total.bank += e.bank; total.visa += e.visa; total.all += paid;
    if (k) { k.cash += e.cash; k.bank += e.bank; k.visa += e.visa; k.total += paid; } else if (paid) unlisted.push({ row: e.row, kind: e.kind, amount: paid });
  }
  const days = new Map<string, { income: number; expense: number }>();
  const day = (d: string) => { let x = days.get(d); if (!x) days.set(d, (x = { income: 0, expense: 0 })); return x; };
  for (const e of real) day(e.date).income += sum(e.taken);
  for (const e of exp) if (!kinds.get(norm(e.kind))?.group.startsWith("Điều chuyển")) day(e.date).expense += e.cash + e.bank + e.visa;
  const fd = new Map<string, { cash: FundDay; bank: FundDay }>();
  const fday = (d: string) => { let x = fd.get(d); if (!x) fd.set(d, (x = { cash: { in: 0, adv: 0, out: 0 }, bank: { in: 0, adv: 0, out: 0 } })); return x; };
  for (const e of inc) { const x = fday(e.date); x.cash.in += e.taken.cash - e.deposit.cash; x.cash.adv += e.advance.cash; x.bank.in += e.taken.bank - e.deposit.bank; x.bank.adv += e.advance.bank; }
  for (const e of exp) { const x = fday(e.date); x.cash.out += e.cash; x.bank.out += e.bank; }
  const dates = [...inc, ...exp].map((x) => x.date).sort();
  return {
    from: range?.from ?? dates[0] ?? "", to: range?.to ?? dates.at(-1) ?? "",
    income: {
      taken: { ...taken, total: sum(taken) }, deposit: { ...deposit, total: sum(deposit) }, advance: { ...advance, total: sum(advance) }, pos,
      transferByFund: inc.filter(isTransfer).reduce((x, e) => add(x, e.taken), zero()),
      transfer: inc.filter(isTransfer).reduce((x, e) => x + sum(e.taken), 0),
      byService: group((e) => e.service),
      revenueByService: group((e) => e.service, real.filter((e) => !isFeeRow(e))), byPlatform: group((e) => e.platform),
      commission: inc.reduce((s, e) => s + e.commission, 0), otherDeduction: inc.reduce((s, e) => s + e.otherDeduction, 0),
    },
    outside: { incomeLines: entries.length - inc.length, expenseLines: outsideExp.length, expenseAmount: outsideExp.reduce((x, e) => x + e.cash + e.bank + e.visa, 0) },
    expense: { byKind: [...kinds.values()], byGroup: [...groups].filter(([g, v]) => g !== UNLISTED || v).map(([group, v]) => ({ group, total: v })), commission: exp.reduce((x, e) => x + e.commission, 0), cardFee: exp.reduce((x, e) => x + e.cardFee, 0), total, transfer: [...kinds.values()].filter((k) => k.group.startsWith("Điều chuyển")).reduce((x, k) => x + k.total, 0), unlisted },
    fundDaily: [...fd].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
    daily: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
    funds: { cash: taken.cash - deposit.cash + advance.cash - total.cash, bank: taken.bank - deposit.bank + advance.bank - total.bank, card: taken.card - deposit.card + advance.card - total.visa },
  };
}

// ---- the weekly report, laid out like the finance team's sheet "BC Doanh thu, CP" ----
export type ReportRow = { label: string; kind: "section" | "total" | "line"; values: number[] };
export type FinanceReport = { columns: { label: string; from: string; to: string }[]; rows: ReportRow[] };

/** One column per week (Monday to Sunday, cut to from..to) and a last one for the whole period. */
export function weekColumns(range: { from: string; to: string }): FinanceReport["columns"] {
  const columns: FinanceReport["columns"] = [];
  for (let monday = mondayOf(range.from); monday <= range.to; monday = addDays(monday, 7)) {
    const from = monday < range.from ? range.from : monday, end = addDays(monday, 6), to = end > range.to ? range.to : end;
    columns.push({ label: `Tuần ${isoWeek(monday)}`, from, to });
  }
  columns.push({ label: "Cả kỳ", from: range.from, to: range.to });
  return columns;
}

/** The revenue lines: a service of the income ledger goes to the first line whose pattern fits, anything else is "Thu khác". */
const REVENUE_LINES: [string, RegExp][] = [
  ["Tiền phòng", /^(tien phong|coc phong|(nang|lang) hang phong)$/], // "Lâng hạng phòng" is how the sheet spells it
  ["Minibar", /^minibar$/],
  ["Giặt ủi", /^giat ui$/],
  ["Dịch vụ ngoài", /^dich vu ngoai$/],
  ["Dịch vụ khách sạn, phụ thu", /^(dich vu ks|phu thu|combo an sang|tien pos cafe)$/],
];

/** One column per week (Monday to Sunday, cut to from..to) and one for the whole period. The first block is the takings by service on the day the money came in (cash basis: an OTA that pays a month of rooms in one week shows it all in that week), NOT the accountant's revenue by stay date; "tiền thu" is new money into each fund (deposits of guests already staying were received earlier). */
export function financeReport(entries: LedgerEntry[], expenses: ExpenseLine[], range: { from: string; to: string }): FinanceReport {
  const columns = weekColumns(range);
  const sums = columns.map((c) => summarizeFinance(entries, expenses, c));
  const by = (f: (s: FinanceSummary) => number) => sums.map(f);
  const revenue = (name: string) => by((s) => s.income.revenueByService.reduce((x, r) => (revenueLine(r.name) === name ? x + r.total : x), 0));
  const cost = (group: string) => by((s) => s.expense.byGroup.find((g) => g.group === group)?.total ?? 0);
  const total = (...lists: number[][]) => columns.map((_, i) => lists.reduce((x, l) => x + l[i], 0));
  const neg = (l: number[]) => l.map((v) => 0 - v); // 0 - v, not -v: no "-0" in the table
  const row = (label: string, values: number[], kind: ReportRow["kind"] = "line"): ReportRow => ({ label, kind, values });

  const lines = [...REVENUE_LINES.map(([n]) => n), "Thu khác"].map((n) => row(n, revenue(n)));
  const deductions = neg(by((s) => s.income.commission + s.income.otherDeduction));
  const revenueTotal = total(...lines.map((l) => l.values), deductions);
  const newCash = by((s) => s.income.taken.cash - s.income.deposit.cash - s.income.transferByFund.cash);
  const newBank = by((s) => s.income.taken.bank - s.income.deposit.bank - s.income.transferByFund.bank);
  const newCard = by((s) => s.income.taken.card - s.income.deposit.card - s.income.transferByFund.card);
  const advCash = by((s) => s.income.advance.cash), advBank = by((s) => s.income.advance.bank), advCard = by((s) => s.income.advance.card);
  const collected = total(newCash, advCash, newBank, advBank, newCard, advCard);
  const costLines = [...REPORT_GROUPS, UNLISTED].map((g) => row(g, cost(g))).filter((l) => l.label !== UNLISTED || l.values.some((v) => v)); // the unclassified row only when there is one, so the total always equals the KPI
  const costTotal = total(...costLines.map((l) => l.values));
  const transferIn = by((s) => s.income.transfer), transferOut = by((s) => s.expense.transfer);
  return {
    columns,
    rows: [
      row("1. THU THEO DỊCH VỤ (theo ngày thu)", revenueTotal, "total"), ...lines, row("Giảm trừ doanh thu (hoa hồng, phí quẹt thẻ)", deductions),
      row("2. TỔNG TIỀN THU TỪ HĐKD", collected, "total"),
      row("Thu tiền mặt", newCash), row("Thu cọc tiền mặt (khách chưa ở)", advCash), row("Thu tiền chuyển khoản", newBank), row("Thu cọc chuyển khoản (khách chưa ở)", advBank), row("Thu từ quẹt thẻ", total(newCard, advCard)),
      row("3. TỔNG CHI", costTotal, "total"), ...costLines,
      row("4. KẾT QUẢ", columns.map(() => 0), "section"),
      row("Thu theo dịch vụ − chi", total(revenueTotal, neg(costTotal))), row("Tiền thu − chi", total(collected, neg(costTotal))),
      row("5. TIỀN CHUYỂN GIỮA CÁC QUỸ (không tính vào các mục trên)", columns.map(() => 0), "section"),
      row("Điều chuyển vào (rút tiền, luân chuyển)", transferIn), row("Điều chuyển ra", transferOut),
      row("Biến động quỹ tiền mặt", by((s) => s.funds.cash)), row("Biến động quỹ chuyển khoản (ngân hàng)", by((s) => s.funds.bank)), row("Biến động quỹ thẻ visa", by((s) => s.funds.card)),
    ],
  };
}

const revenueLine = (service: string) => REVENUE_LINES.find(([, re]) => re.test(norm(service)))?.[0] ?? "Thu khác";

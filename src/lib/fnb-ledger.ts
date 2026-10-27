// The thu chi of "Ăn sáng, cafe, mini mart" (kind "fnb" of a branch): income tabs "BK THU mm-yyyy" (cafe: one row per shift of a seller) or "THU MINIMART mm-yyyy" (mini mart: one row per day),
// expense tabs "BK CHI" / "CHI MINIMART" (same columns as the hotel's, read by parseExpenses). Pure functions: tested by fnb-ledger.test.ts. Imports use ".ts" because tests run this with plain Node.
import { ledgerDate, monthOf } from "./bluejay-reconcile.ts";
import { UNLISTED, parseExpenses, type ExpenseLine } from "./finance-summary.ts";
import { FNB_EXPENSES, MART_EXPENSES, OLD_FNB_KINDS } from "./expense-kinds.ts";
import { costTree } from "./pnl.ts";

const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/đ/g, "d").replace(/\s+/g, " ").trim();
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const text = (v: unknown) => String(v ?? "").trim();

export type FnbLayout = "cafe" | "mart";
/** One row of an income tab. cash, bank, pos: paid by guests at the counter; otherCash, otherBank: money that is not sales (capital, transfers into the fund);
 * shopee, grab: the running balance with the app (+ the app owes us, - the app paid); voided, rental: mini mart only (cancelled goods, boat rental). */
export type FnbIncomeLine = { row: number; date: string; seller: string; note: string; cash: number; bank: number; pos: number; otherCash: number; otherBank: number; shopee: number; grab: number; voided: number; rental: number };
export type FnbIncome = { sheet: string; layout: FnbLayout; month: string; unit: string; lines: FnbIncomeLine[] };

/** Sales of a row: what guests paid at the counter. The app balances are debts, not sales. */
export const fnbSales = (l: FnbIncomeLine) => l.cash + l.bank + l.pos;

export const isIncomeSheet = (name: string) => /^(bk thu|thu minimart)( |$)/.test(norm(name));
const layoutOf = (name: string): FnbLayout => (/^thu minimart/.test(norm(name)) ? "mart" : "cafe");

/** The value next to a label of the first rows ("KỲ BÁO CÁO (tháng/năm)" | date, "ĐƠN VỊ" | name); an empty input cell must not pick up the next label. */
function beside(rows: unknown[][], head: number, re: RegExp) {
  for (let i = 0; i < head; i++) for (let c = 0; c < rows[i].length; c++) {
    if (!re.test(norm(rows[i][c]))) continue;
    const next = rows[i].slice(c + 1, c + 7).find((v) => v !== "" && v != null);
    if (next !== undefined && !/^(don vi|ky bao cao)/.test(norm(next))) return next;
  }
  return "";
}

/** One income tab as rows (the sheet as an array of rows). Two header rows: the groups ("KHÁCH TRỰC TIẾP") above, the columns ("Tiền mặt") below; a label merged over both rows sits in the upper one only
 * (as Google Sheet gives it). Columns are found by name, the group tells apart the repeated ones, so a column inserted anywhere still reads. */
export function parseFnbIncome(name: string, rows: unknown[][]): FnbIncome {
  const layout = layoutOf(name);
  const top = rows.findIndex((r) => r.some((c) => norm(c) === "ngay") && r.some((c) => norm(c) === (layout === "cafe" ? "nguoi ban" : "noi dung")));
  if (top < 0) throw new Error(`Không nhận ra bảng thu “${name}”: không thấy cột “Ngày” và “${layout === "cafe" ? "Người bán" : "Nội dung"}”.`);
  let group = "";
  const groups = rows[top].map((c) => { const g = norm(c); if (g) group = g; return group; }); // the group of each column, carried over the cells of a merged group
  const upper = rows[top].map(norm), lower = (rows[top + 1] ?? []).map(norm);
  const find = (g: string | null, re: RegExp) => upper.findIndex((_, i) => (re.test(lower[i] ?? "") || re.test(upper[i])) && (g === null || groups[i] === g));
  const col = layout === "cafe"
    ? { date: find(null, /^ngay$/), seller: find(null, /^nguoi ban$/), note: find(null, /^noi dung$/), otherCash: find("nguon khac", /^tien mat$/), otherBank: find("nguon khac", /^chuyen khoan$/), cash: find("khach truc tiep", /^tien mat$/), bank: find("khach truc tiep", /^chuyen khoan$/), pos: find("khach truc tiep", /^the pos$/), shopee: find("shopee food", /^cong no/), grab: find("grab food", /^cong no/), voided: -1, rental: -1 }
    : { date: find(null, /^ngay$/), seller: -1, note: find(null, /^noi dung$/), otherCash: -1, otherBank: -1, cash: find(null, /^tien mat$/), bank: find(null, /^chuyen khoan/), pos: -1, shopee: find(null, /^shopee food$/), grab: find(null, /^grab food$/), voided: find(null, /^tong hang huy$/), rental: find(null, /^thue phao$/) };
  if (col.date < 0 || col.cash < 0 || col.bank < 0) throw new Error(`Bảng thu “${name}” thiếu cột “Ngày”, “Tiền mặt” hoặc “Chuyển khoản”.`);
  const at = (r: unknown[], c: number) => (c >= 0 ? r[c] : undefined);
  const lines: FnbIncomeLine[] = [];
  for (let i = top + 2; i < rows.length; i++) {
    const r = rows[i], date = ledgerDate(r[col.date]);
    if (!date) continue; // the total row, the opening balance row (no date) and blank rows
    const line: FnbIncomeLine = { row: i + 1, date, seller: text(at(r, col.seller)), note: text(at(r, col.note)), cash: num(at(r, col.cash)), bank: num(at(r, col.bank)), pos: num(at(r, col.pos)), otherCash: num(at(r, col.otherCash)), otherBank: num(at(r, col.otherBank)), shopee: num(at(r, col.shopee)), grab: num(at(r, col.grab)), voided: num(at(r, col.voided)), rental: num(at(r, col.rental)) };
    const money = [line.cash, line.bank, line.pos, line.otherCash, line.otherBank, line.shopee, line.grab, line.voided, line.rental].some((v) => v !== 0);
    if (money || line.seller) lines.push(line); // a date typed down the page with nothing on it is not a line
  }
  const month = monthOf(beside(rows, top, /^ky bao cao/)) || monthOf(name.match(/d{1,2}[/-]d{4}/)?.[0] ?? "");
  return { sheet: name, layout, month, unit: text(beside(rows, top, /^don vi$/)), lines };
}

/** The tabs of a month from Google Sheet (or an uploaded file): income tabs by name, every other tab is an expense tab. */
export function parseFnbLedger(sheets: { name: string; rows: unknown[][] }[]) {
  const incomeTabs = sheets.filter((s) => isIncomeSheet(s.name));
  if (!incomeTabs.length) throw new Error("Không thấy tab thu (BK THU hoặc THU MINIMART).");
  const income = incomeTabs.map((s) => parseFnbIncome(s.name, s.rows));
  const warnings: string[] = [];
  const expenses: ExpenseLine[] = [];
  const expenseTabs = sheets.filter((s) => !isIncomeSheet(s.name));
  if (!expenseTabs.length) warnings.push("Không thấy tab chi (BK CHI hoặc CHI MINIMART): chi tính 0.");
  for (const s of expenseTabs) expenses.push(...parseExpenses(s.rows));
  return { month: income.find((i) => i.month)?.month ?? "", unit: income.find((i) => i.unit)?.unit ?? "", income, expenses, warnings };
}

export type FnbUnit = "cafe" | "mart";
export type FnbReport = ReturnType<typeof fnbReport>;
export const FNB_UNITS: { unit: FnbUnit; label: string }[] = [{ unit: "cafe", label: "Ăn sáng, cafe" }, { unit: "mart", label: "Mini mart" }];

/** The unit a ledger tab belongs to (BK THU / BK CHI: cafe, THU / CHI MINIMART: mart), null for any other tab (guides, lists, kho). */
export function fnbUnitOf(name: string): FnbUnit | null {
  const n = norm(name);
  if (/^(thu|chi) minimart( |$)/.test(n)) return "mart";
  return /^bk (thu|chi)( |$)/.test(n) ? "cafe" : null;
}

const paid = (e: ExpenseLine) => e.cash + e.bank + e.visa;
const OLD_KIND = new Map(OLD_FNB_KINDS.map(([old, now]) => [norm(old), now]));

/** The month's thu chi per unit from its ledger tabs. Cash in = cash sales + cash from other sources; bank in = transfers + POS + transfers from other sources (POS cafe goes to the bank). month "yyyy-mm": lines dated outside it are counted in the warnings. */
export function fnbReport(sheets: { name: string; rows: unknown[][] }[], month = "") {
  const warnings: string[] = [];
  const units = FNB_UNITS.flatMap(({ unit, label }) => {
    const own = sheets.filter((s) => fnbUnitOf(s.name) === unit);
    if (!own.length) return [];
    const incomes = own.filter((s) => isIncomeSheet(s.name)).map((s) => parseFnbIncome(s.name, s.rows));
    const expenseTabs = own.filter((s) => !isIncomeSheet(s.name));
    if (!incomes.length) warnings.push(`${label}: không thấy tab thu.`);
    if (!expenseTabs.length) warnings.push(`${label}: không thấy tab chi, chi tính 0.`);
    const lines = incomes.flatMap((i) => i.lines), expenses = expenseTabs.flatMap((s) => parseExpenses(s.rows)).map((e) => ({ ...e, kind: OLD_KIND.get(norm(e.kind)) ?? e.kind }));
    const sum = (f: (l: FnbIncomeLine) => number) => lines.reduce((t, l) => t + f(l), 0);
    const sales = { cash: sum((l) => l.cash), bank: sum((l) => l.bank), pos: sum((l) => l.pos), total: sum(fnbSales) };
    const spent = { cash: expenses.reduce((t, e) => t + e.cash, 0), bank: expenses.reduce((t, e) => t + e.bank, 0), visa: expenses.reduce((t, e) => t + e.visa, 0), total: expenses.reduce((t, e) => t + paid(e), 0) };
    const days = new Map<string, { date: string; income: number; cash: number; bank: number; expense: number }>(); // bank: transfers + POS
    const day = (date: string) => days.get(date) ?? days.set(date, { date, income: 0, cash: 0, bank: 0, expense: 0 }).get(date)!;
    for (const l of lines) { const d = day(l.date); d.income += fnbSales(l); d.cash += l.cash; d.bank += l.bank + l.pos; }
    for (const e of expenses) day(e.date).expense += paid(e);
    const tree = costTree(expenses, unit === "mart" ? MART_EXPENSES : FNB_EXPENSES);
    const unlisted = tree.find((g) => g.group === UNLISTED)?.kinds ?? [];
    if (unlisted.length) warnings.push(`${label}: hạng mục chi không có trong danh mục: ${unlisted.map((k) => `“${k.name}”`).join(", ")}.`);
    const out = month ? [...lines.filter((l) => l.date.slice(0, 7) !== month), ...expenses.filter((e) => e.date.slice(0, 7) !== month)].length : 0;
    if (out) warnings.push(`${label}: ${out} dòng thu chi có ngày ngoài tháng ${month.slice(5)}/${month.slice(0, 4)}.`);
    const sheetMonth = incomes.find((i) => i.month)?.month ?? "";
    if (month && sheetMonth && sheetMonth !== month) warnings.push(`${label}: kỳ báo cáo trong sheet là ${sheetMonth.slice(5)}/${sheetMonth.slice(0, 4)}, khác tháng đang chọn.`);
    const otherCash = sum((l) => l.otherCash), otherBank = sum((l) => l.otherBank);
    return [{
      unit, label, name: incomes.find((i) => i.unit)?.unit ?? "", sales, spent, expenses: expenses.length, incomeLines: lines.length,
      other: { cash: otherCash, bank: otherBank }, apps: { shopee: sum((l) => l.shopee), grab: sum((l) => l.grab) }, voided: sum((l) => l.voided), rental: sum((l) => l.rental),
      funds: { cash: sales.cash + otherCash - spent.cash, bank: sales.bank + sales.pos + otherBank - spent.bank - spent.visa },
      days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), tree,
    }];
  });
  if (!units.length) throw new Error("Không thấy tab thu chi nào (BK THU, BK CHI, THU MINIMART, CHI MINIMART).");
  return { units, warnings };
}

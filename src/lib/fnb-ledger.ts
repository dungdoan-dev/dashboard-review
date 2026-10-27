// The thu chi of "Ăn sáng, cafe, mini mart" (kind "fnb" of a branch): income tabs "BK THU mm-yyyy" (cafe: one row per shift of a seller) or "THU MINIMART mm-yyyy" (mini mart: one row per day),
// expense tabs "BK CHI" / "CHI MINIMART" (same columns as the hotel's, read by parseExpenses). Pure functions: tested by fnb-ledger.test.ts. Imports use ".ts" because tests run this with plain Node.
import { ledgerDate, monthOf } from "./bluejay-reconcile.ts";
import { parseExpenses, type ExpenseLine } from "./finance-summary.ts";

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

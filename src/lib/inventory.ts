// Stock of the hotel's minibar (later amenities, supplies, linen), from the monthly tabs of the hotel's Google Sheet:
//  "KHO NHẬP mm/yyyy" (what came in), "KHO XUẤT mm/yyyy" (what went out, by day and room), "KIỂM KÊ mm/yyyy" (counts) and "TỒN KHO mm/yyyy" (the item list with the opening stock).
// The valuation is the finance team's: one weighted-average price for the period, (opening value + bought value) / (opening quantity + bought quantity); what went out costs quantity x that price.
// An item can carry a fixed unit price instead (the finance team types one for some complimentary items).
// Pure functions: tested by inventory.test.ts. Imports use ".ts" because tests run this with plain Node.
import { ledgerDate } from "./bluejay-reconcile.ts";

const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/đ/g, "d").replace(/\s+/g, " ").trim();
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export type StockItem = { name: string; kind: string; unit: string; openQty: number; openValue: number; fixedPrice: number; bluejay: string; immediate?: boolean }; // immediate: name cell is red or Loại is "Mua xuất luôn" = bought and used at once: still booked, but issue price = purchase price and no stock is left; kind: "Bán" or "Miễn phí"; fixedPrice: 0 = the weighted average; bluejay: how Blue Jay names the item ("" = not sold through Blue Jay)
export type Receipt = { row: number; date: string; item: string; qty: number; amount: number; note: string };
export type Issue = { row: number; date: string; room: string; item: string; qty: number; note: string };
export type Count = { row: number; date: string; item: string; qty: number };
export type Inventory = { items: StockItem[]; receipts: Receipt[]; issues: Issue[]; counts: Count[]; month: string }; // month: "yyyy-mm" of the month cell of the stock block, "" when the sheet has none

type Rows = unknown[][];

/** Where a block starts: the first row (within the first 30) holding the headers in this order in neighbouring columns; null when there is none. */
function findBlock(rows: Rows, headers: string[]): { row: number; col: number } | null {
  for (let r = 0; r < Math.min(rows.length, 30); r++) for (let c = 0; c < rows[r].length; c++) if (headers.every((h, k) => norm(rows[r][c + k]) === h)) return { row: r, col: c };
  return null;
}
const text = (v: unknown) => String(v ?? "").trim();

/**
 * One sheet of a kho. Its blocks sit side by side, found by their headers: receipts "Ngày | Mặt hàng | Số lượng | Thành tiền", issues "Ngày | Phòng | Mặt hàng | Số lượng", counts "Ngày kiểm | Mặt hàng | Số lượng đếm",
 * and the item list "Mặt hàng | Loại | ĐVT | Tồn đầu (SL) | Tồn đầu (giá trị) | Tên trong Blue Jay | Đơn giá cố định" (more columns follow, computed). A block on a sheet of its own (the old four-tab layout) reads the same way.
 */
export function parseInventorySheet(rows: Rows, red: Set<string> = new Set()): Inventory { // red: "row,col" (0-based) of the cells with a red background
  const inv: Inventory = { items: [], receipts: [], issues: [], counts: [], month: "" };
  const list = (b: { row: number; col: number }, width: number) => rows.slice(b.row + 1).map((r, i) => ({ r: r.slice(b.col, b.col + width), row: b.row + i + 2 }));

  const receipts = findBlock(rows, ["ngay", "mat hang", "so luong", "thanh tien"]);
  if (receipts) for (const { r, row } of list(receipts, 5)) { const date = ledgerDate(r[0]), item = text(r[1]); if (date && item) inv.receipts.push({ row, date, item, qty: num(r[2]), amount: num(r[3]), note: text(r[4]) }); }
  const issues = findBlock(rows, ["ngay", "phong", "mat hang", "so luong"]);
  if (issues) for (const { r, row } of list(issues, 5)) { const date = ledgerDate(r[0]), item = text(r[2]); if (date && item) inv.issues.push({ row, date, room: text(r[1]), item, qty: num(r[3]), note: text(r[4]) }); }
  const counts = findBlock(rows, ["ngay kiem", "mat hang", "so luong dem"]);
  if (counts) for (const { r, row } of list(counts, 4)) { const date = ledgerDate(r[0]), item = text(r[1]); if (date && item) inv.counts.push({ row, date, item, qty: num(r[2]) }); }
  const head = findBlock(rows, ["mat hang", "loai", "dvt", "ton dau (sl)", "ton dau (gia tri)"]);
  if (head) {
    const header = rows[head.row].map(norm), at = (w: string) => header.indexOf(w); // Blue Jay name and fixed price may sit left or right of the item list: found on the whole header row
    for (const { r, row } of list(head, 12)) { const n = text(r[0]); if (n && !/^(cong|tong|thang)$/.test(norm(n)) && !/^(tong )?cong$/.test(norm(text(r[2])))) inv.items.push({ name: n, kind: text(r[1]), unit: text(r[2]), openQty: num(r[3]), openValue: num(r[4]), fixedPrice: at("don gia co dinh") >= 0 ? num(rows[row - 1][at("don gia co dinh")]) : 0, bluejay: at("ten trong blue jay") >= 0 ? text(rows[row - 1][at("ten trong blue jay")]) : "", immediate: red.has(`${row - 1},${head.col}`) || norm(text(r[1])) === "mua xuat luon" }); }
  }
  // the month of the item list: a cell "Tháng" with the first day of the month next to it
  for (let r = 0; r < Math.min(rows.length, 4) && !inv.month; r++) for (let c = 0; c + 1 < rows[r].length; c++) if (norm(rows[r][c]).startsWith("thang")) { const d = ledgerDate(rows[r][c + 1]); if (d) { inv.month = d.slice(0, 7); break; } }
  return inv;
}

/** Several sheets read as one stock (the sheets of one kho, or the old four tabs). */
export function parseInventory(sheets: { name: string; rows: Rows }[]): Inventory {
  const all: Inventory = { items: [], receipts: [], issues: [], counts: [], month: "" };
  for (const { rows } of sheets) { const one = parseInventorySheet(rows); all.items.push(...one.items); all.receipts.push(...one.receipts); all.issues.push(...one.issues); all.counts.push(...one.counts); all.month ||= one.month; }
  return all;
}

export type StockLine = {
  item: StockItem;
  receiptQty: number; receiptValue: number;
  issueQty: number; avgPrice: number; issueValue: number;
  closingQty: number; closingValue: number;
  count: { date: string; qty: number; expected: number; diff: number; diffValue: number } | null; // the latest count of the period against what the books say on that day
};
export type StockReport = {
  from: string; to: string;
  lines: StockLine[];
  unknown: { sheet: "nhập" | "xuất" | "kiểm kê"; row: number; item: string }[]; // lines whose item is not in the list
  totals: { openValue: number; receiptValue: number; issueValue: number; closingValue: number; countDiffValue: number };
};

/** The period from..to (inclusive); lines dated outside it are ignored. A count is compared with the opening stock + what came in - what went out up to the day of the count. */
export function stockReport(inv: Inventory, range: { from: string; to: string }): StockReport {
  const inside = (d: string) => d >= range.from && d <= range.to;
  const names = new Map(inv.items.map((i) => [norm(i.name), i.name]));
  const unknown: StockReport["unknown"] = [];
  const known = <T extends { item: string; date: string; row: number }>(list: T[], sheet: StockReport["unknown"][number]["sheet"]) =>
    list.filter((l) => inside(l.date)).filter((l) => { if (names.has(norm(l.item))) return true; unknown.push({ sheet, row: l.row, item: l.item }); return false; });
  const receipts = known(inv.receipts, "nhập"), issues = known(inv.issues, "xuất"), counts = known(inv.counts, "kiểm kê");
  const same = (a: string, b: string) => norm(a) === norm(b);

  const lines = inv.items.map((item): StockLine => {
    const mine = <T extends { item: string }>(list: T[]) => list.filter((l) => same(l.item, item.name));
    const rs = mine(receipts), is = mine(issues), cs = mine(counts);
    const receiptQty = rs.reduce((s, r) => s + r.qty, 0), receiptValue = rs.reduce((s, r) => s + r.amount, 0), issueQty = is.reduce((s, i) => s + i.qty, 0);
    const base = item.openQty + receiptQty, avgPrice = item.fixedPrice > 0 ? item.fixedPrice : base > 0 ? (item.openValue + receiptValue) / base : 0, issueValue = issueQty * avgPrice;
    if (item.immediate) return { item, receiptQty, receiptValue, issueQty, avgPrice: receiptQty > 0 ? receiptValue / receiptQty : 0, issueValue: item.openValue + receiptValue, closingQty: 0, closingValue: 0, count: null }; // bought and used at once: what went out costs what was bought, nothing stays
    const last = cs.reduce<Count | null>((m, c) => (!m || c.date >= m.date ? c : m), null);
    const expected = last ? item.openQty + rs.filter((r) => r.date <= last.date).reduce((s, r) => s + r.qty, 0) - is.filter((i) => i.date <= last.date).reduce((s, i) => s + i.qty, 0) : 0;
    return {
      item, receiptQty, receiptValue, issueQty, avgPrice, issueValue,
      closingQty: base - issueQty, closingValue: item.openValue + receiptValue - issueValue,
      count: last ? { date: last.date, qty: last.qty, expected, diff: last.qty - expected, diffValue: (last.qty - expected) * avgPrice } : null,
    };
  });
  const sum = (f: (l: StockLine) => number) => lines.reduce((s, l) => s + f(l), 0);
  return { from: range.from, to: range.to, lines, unknown, totals: { openValue: sum((l) => l.item.openValue), receiptValue: sum((l) => l.receiptValue), issueValue: sum((l) => l.issueValue), closingValue: sum((l) => l.closingValue), countDiffValue: sum((l) => l.count?.diffValue ?? 0) } };
}

/** Quantities sold of the items Blue Jay sells (the "Minibar" service lines), from the "Bán" issues of the sheet: per item, the sheet and Blue Jay side by side. */
export type SalesCheck = { item: string; bluejayName: string; sheet: number; bluejay: number; diff: number };
export function salesCheck(inv: Inventory, bluejay: Record<string, number>, range: { from: string; to: string }): SalesCheck[] {
  const inside = (d: string) => d >= range.from && d <= range.to;
  return inv.items.filter((i) => i.bluejay).map((i) => {
    const sheet = inv.issues.filter((l) => inside(l.date) && norm(l.item) === norm(i.name)).reduce((s, l) => s + l.qty, 0);
    const bj = Object.entries(bluejay).filter(([n]) => norm(n) === norm(i.bluejay)).reduce((s, [, q]) => s + q, 0);
    return { item: i.name, bluejayName: i.bluejay, sheet, bluejay: bj, diff: sheet - bj };
  });
}

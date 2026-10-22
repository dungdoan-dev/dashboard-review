import test from "node:test";
import assert from "node:assert/strict";
import { parseInventory, parseInventorySheet, salesCheck, stockReport } from "./inventory.ts";

// One sheet of a kho as the template makes it: the blocks side by side, titles on row 3, headers on row 4, data from row 5; TỒN KHO from column R (index 17), the month in S2.
const BLANK = Array.from({ length: 40 }, () => "");
const sheet = (parts: { col: number; headers: unknown[]; rows: unknown[][] }[], month?: number) => {
  const rows: unknown[][] = Array.from({ length: 12 }, () => [...BLANK]);
  if (month) { rows[1][17] = "Tháng"; rows[1][18] = month; }
  for (const p of parts) { p.headers.forEach((h, i) => { rows[3][p.col + i] = h; }); p.rows.forEach((r, k) => r.forEach((v, i) => { rows[4 + k][p.col + i] = v; })); }
  return rows;
};
const nhap = { col: 0, headers: ["Ngày", "Mặt hàng", "Số lượng", "Thành tiền", "Ghi chú"], rows: [[46300, "Snack", 30, 135_000, ""], [46300, "Lạ", 5, 1000, ""]] };
const xuat = { col: 6, headers: ["Ngày", "Phòng", "Mặt hàng", "Số lượng", "Ghi chú"], rows: [[46296, "405", "Snack", 2, ""], [46297, "502", "Snack", 21, ""], [46297, "", "Nước suối (miễn phí)", 4, ""], [46400, "101", "Snack", 9, ""]] };
const kiem = { col: 12, headers: ["Ngày kiểm", "Mặt hàng", "Số lượng đếm", "Ghi chú"], rows: [[46299, "Snack", 69, ""], [46299, "Nước suối (miễn phí)", 570, ""]] };
const stock = { col: 17, headers: ["Mặt hàng", "Loại", "ĐVT", "Tồn đầu (SL)", "Tồn đầu (giá trị)", "Tên trong Blue Jay", "Đơn giá cố định", "Nhập (SL)"], rows: [["Snack", "Bán", "Túi", 72, 302_400, "Snack", "", ""], ["Nước suối (miễn phí)", "Miễn phí", "Chai", 576, 2_106_250, "", 3125, ""], ["Cộng", "", "", "", 2_408_650]] };
const oneSheet = sheet([nhap, xuat, kiem, stock], 46296);
const oct = { from: "2026-10-01", to: "2026-10-31" };

test("the blocks of a kho sheet are found by their headers wherever they sit; the total row of the item list is not an item", () => {
  const inv = parseInventorySheet(oneSheet);
  assert.deepEqual([inv.items.length, inv.receipts.length, inv.issues.length, inv.counts.length, inv.month], [2, 2, 4, 2, "2026-10"]);
  assert.equal(inv.items[1].fixedPrice, 3125);
  assert.equal(inv.issues[2].room, ""); // a line with no room is kept
  assert.deepEqual([inv.receipts[1].row, inv.issues[0].row], [6, 5]); // sheet row numbers, to point at a wrong line
  // each block alone on a sheet (the old four-tab layout) reads the same
  const split = parseInventory([sheet([{ ...nhap, col: 0 }]), sheet([{ ...xuat, col: 0 }]), sheet([{ ...kiem, col: 0 }]), sheet([{ ...stock, col: 0 }])].map((rows) => ({ name: "t", rows })));
  assert.deepEqual([split.items.length, split.receipts.length, split.issues.length, split.counts.length], [2, 2, 4, 2]);
  assert.deepEqual(parseInventorySheet([["a", "b"]]), { items: [], receipts: [], issues: [], counts: [], month: "" });
});

test("the average price is (opening value + bought) / (opening + bought quantity), what went out costs quantity x price, a fixed price replaces the average", () => {
  const r = stockReport(parseInventorySheet(oneSheet), oct);
  const snack = r.lines[0], water = r.lines[1];
  assert.equal(snack.avgPrice, (302_400 + 135_000) / 102); // 4288.235...
  assert.equal(snack.issueQty, 23); // the line of 9 is dated outside the period
  assert.ok(Math.abs(snack.issueValue - 98_629.41176) < 0.01);
  assert.equal(snack.closingQty, 72 + 30 - 23);
  assert.ok(Math.abs(snack.closingValue - 338_770.588) < 0.01);
  assert.equal(water.avgPrice, 3125); // not 3656.7
  assert.equal(water.issueValue, 4 * 3125);
  assert.equal(water.closingValue, 2_106_250 - 12_500);
  assert.deepEqual(r.unknown, [{ sheet: "nhập", row: 6, item: "Lạ" }]);
});

test("a count is compared with the books on the day of the count, and the difference is valued at the price", () => {
  const r = stockReport(parseInventorySheet(oneSheet), oct);
  // 46299 = 4 Oct: Snack 72 + 0 (the 30 come on 5 Oct) - 23 = 49, counted 69 -> +20
  assert.deepEqual([r.lines[0].count!.date, r.lines[0].count!.expected, r.lines[0].count!.diff], ["2026-10-04", 49, 20]);
  assert.ok(Math.abs(r.lines[0].count!.diffValue - 20 * ((302_400 + 135_000) / 102)) < 0.01);
  assert.deepEqual([r.lines[1].count!.expected, r.lines[1].count!.diff], [572, -2]);
  assert.equal(r.totals.openValue, 302_400 + 2_106_250);
});

test("the sold quantities of the sheet are set against Blue Jay's, item by item, only for items Blue Jay sells", () => {
  const check = salesCheck(parseInventorySheet(oneSheet), { Snack: 21, "Nước suối 500ml": 26 }, oct);
  assert.deepEqual(check, [{ item: "Snack", bluejayName: "Snack", sheet: 23, bluejay: 21, diff: 2 }]);
});

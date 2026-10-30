import test from "node:test";
import assert from "node:assert/strict";
import { fnbResult, payrollCode } from "./ql-fnb-result.ts";
import type { ExpenseLine } from "./finance-summary.ts";
import type { StockReport } from "./inventory.ts";
import { parseKiotviet } from "./kiotviet.ts";

const e = (kind: string, note: string, cash: number, bank = 0, visa = 0, date = "2026-10-05"): ExpenseLine => ({ row: 1, date, kind, note, cash, bank, visa, commission: 0, cardFee: 0 });
const kho = (name: string, issueValue: number) => ({ name, report: { totals: { openValue: 0, receiptValue: 0, issueValue, closingValue: 0, countDiffValue: 0 } } as unknown as StockReport });
const row = (r: ReturnType<typeof fnbResult>, label: string) => r.rows.find((x) => x.label === label || x.label.startsWith(label))!.values[0];
const OCT1 = 46296;
const kv = parseKiotviet([{ name: "KIOTVIET CAFE", rows: [["Mã hóa đơn", "Thời gian", "Doanh thu chi tiết", "Giá trị niêm yết chi tiết"], ["HD1", OCT1 + 0.5, 90, 100], ["HD2", OCT1 + 1.5, 45, 50]] }]);

test("payroll lines are told by what the expense says", () => {
  assert.deepEqual(["Thanh toán lương nhân sự", "Thưởng KPI tháng 9", "Lương tăng ca", "Phụ cấp xăng", "Thưởng lương tháng 13", "Quà Tết", "Nộp BHXH", "Ứng lương"].map(payrollCode), ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.1"]);
});

test("cafe template: revenue and discount from KiotViet, cost of goods from the kho instead of what was bought, transfers out", () => {
  const r = fnbResult("cafe", {
    month: "2026-10", kiotviet: kv, ledgerSales: 999, stocks: [kho("NGUYÊN LIỆU CAFE", 60), kho("VẬT TƯ", 10)],
    expenses: [e("Chi nguyên liệu pha chế", "cà phê", 500), e("Chi mua hàng hóa", "bánh", 200), e("Chi đầu tư TSCĐ", "máy", 30), e("Chi khác", "tiền đá", 20), e("Chi điện nước – Viễn thông, phí dv", "điện", 0, 15), e("Chi nhân sự – BHXH – Phúc lợi", "lương", 0, 0, 100),
      e("Chi quản lý, vận hành", "phí QL", 5), e("Chi rút tiền – Điều chuyển tiền", "TK TCB", 0, 1000), e("Chi khác", "tháng khác", 77, 0, 0, "2026-09-30")],
  });
  assert.deepEqual([r.rows[0].values[0], row(r, "- Doanh thu bán hàng"), row(r, "- Giảm giá khách hàng")], [135, 150, -15]); // I = list price − discount
  assert.deepEqual([row(r, "1. Giá vốn"), row(r, "Chi đầu tư TSCĐ"), row(r, "Chi khác"), row(r, "Chi điện nước"), row(r, "Chi quản lý, Vận hành"), row(r, "Chi lương nv")], [70, 30, 20, 15, 5, 100]);
  const cost = r.rows.find((x) => x.label.startsWith("II."))!.values[0], profit = r.rows[r.rows.length - 1].values[0];
  assert.deepEqual([cost, profit], [70 + 30 + 20 + 15 + 5 + 100, 135 - 240]);
  assert.deepEqual(r.notes, []);
});

test("without KiotViet or kho the revenue is the ledger's and the cost of goods is what was bought, both said in a note", () => {
  const r = fnbResult("mart", { month: "2026-10", ledgerSales: 400, expenses: [e("Chi mua hàng hóa", "bia", 120), e("Chi bao bì – Vật tư", "túi", 30), e("Chi quản lý, vận hành", "phí", 7)] });
  assert.deepEqual([r.rows[0].values[0], row(r, "Giá vốn hàng hóa xuất kho"), row(r, "Chi quản lý, vận hành")], [400, 150, 7]);
  assert.equal(r.notes.length, 2);
});

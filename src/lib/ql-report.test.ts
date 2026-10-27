import test from "node:test";
import assert from "node:assert/strict";
import { qlFunds, qlResult, qlWeekly, monthRange } from "./ql-report.ts";
import type { CheckoutDay } from "./bluejay-checkout.ts";
import type { FnbReport } from "./fnb-ledger.ts";

const day = (date: string, o: Partial<CheckoutDay> = {}): CheckoutDay => ({ date, rooms: 0, room: 0, service: 0, total: 0, excludedRooms: 0, excludedRoom: 0, excludedService: 0, ...o });
const unit = (label: string, days: { date: string; income: number; cash: number; bank: number; expense: number }[]) => ({ label, days }) as unknown as FnbReport["units"][number];

test("the weeks of the month, cut at the month's ends, and a last column for the month", () => {
  assert.deepEqual(monthRange("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
  const { columns } = qlWeekly("2026-10", {});
  assert.deepEqual(columns.map((c) => [c.label, c.from, c.to]), [["Tuần 40", "2026-10-01", "2026-10-04"], ["Tuần 41", "2026-10-05", "2026-10-11"], ["Tuần 42", "2026-10-12", "2026-10-18"], ["Tuần 43", "2026-10-19", "2026-10-25"], ["Tuần 44", "2026-10-26", "2026-10-31"], ["Cả kỳ", "2026-10-01", "2026-10-31"]]);
});

test("Blue Jay days are summed per week, the total with M-Standard is what the finance team compares, F&B units add their weeks", () => {
  const days = [day("2026-10-02", { rooms: 2, room: 1000, service: 100, excludedRoom: 50 }), day("2026-10-20", { rooms: 3, room: 2000, service: 300, excludedService: 7 }), day("2026-10-21", { room: 500 })];
  const fnb = { units: [unit("Ăn sáng, cafe", [{ date: "2026-10-02", income: 40, cash: 30, bank: 10, expense: 15 }]), unit("Mini mart", [{ date: "2026-10-20", income: 60, cash: 20, bank: 40, expense: 0 }])], warnings: [] } as unknown as FnbReport;
  const { rows } = qlWeekly("2026-10", { days, fnb });
  const by = (label: string) => rows.find((r) => r.label.startsWith(label))!.values;
  assert.deepEqual(by("Tiền phòng"), [1000, 0, 0, 2500, 0, 3500]);
  assert.deepEqual(by("Tổng doanh thu có M-Standard"), [1150, 0, 0, 2807, 0, 3957]);
  assert.deepEqual(rows.filter((r) => r.label === "Thu − chi").map((r) => r.values), [[25, 0, 0, 0, 0, 25], [0, 0, 0, 60, 0, 60]]);
  assert.deepEqual(by("Doanh thu khách sạn + thu bán hàng"), [1190, 0, 0, 2867, 0, 4057]);
  assert.deepEqual(rows.filter((r) => r.kind === "section").map((r) => r.label), ["KHÁCH SẠN · DOANH THU THEO NGÀY TRẢ PHÒNG (Blue Jay)", "ĂN SÁNG, CAFE", "MINI MART", "TỔNG"]);
});

test("the ledger block keeps the money in and out and drops the by-service revenue block; the deduction comes under the revenue", () => {
  const zero = [0, 0, 0, 0, 0, 0];
  const finance = { columns: [], rows: [{ label: "1. THU THEO DỊCH VỤ (theo ngày thu)", kind: "total", values: zero }, { label: "Giảm trừ doanh thu (hoa hồng, phí quẹt thẻ)", kind: "line", values: [-10, 0, 0, -5, 0, -15] }, { label: "2. TỔNG TIỀN THU TỪ HĐKD", kind: "total", values: [9, 0, 0, 0, 0, 9] }, { label: "3. TỔNG CHI", kind: "total", values: [4, 0, 0, 0, 0, 4] }, { label: "Thu theo dịch vụ − chi", kind: "line", values: zero }, { label: "Tiền thu − chi", kind: "line", values: [5, 0, 0, 0, 0, 5] }] } as never;
  const { rows } = qlWeekly("2026-10", { days: [day("2026-10-02", { room: 100 })], finance });
  assert.deepEqual(rows.find((r) => r.label === "Doanh thu sau giảm trừ")!.values, [90, 0, 0, -5, 0, 85]);
  assert.deepEqual(rows.map((r) => r.label).slice(-4), ["KHÁCH SẠN · TIỀN THU VÀ CHI THEO BẢNG KÊ", "2. TỔNG TIỀN THU TỪ HĐKD", "3. TỔNG CHI", "Tiền thu − chi"]);
});

test("fund lines: money in and out per fund, the totals over the units, net = in - out", () => {
  const hotel = { income: { taken: { cash: 100, bank: 50, card: 0 }, deposit: { cash: 10, bank: 0, card: 0 }, advance: { cash: 5, bank: 0, card: 0 } }, expense: { total: { cash: 20, bank: 5, visa: 0 } }, funds: { cash: 75, bank: 45, card: 0 } } as never;
  const fnb = { units: [{ label: "Mini mart", sales: { cash: 30, bank: 40, pos: 0 }, other: { cash: 0, bank: 0 }, spent: { cash: 10, bank: 0, visa: 0 }, funds: { cash: 20, bank: 40 } }] } as unknown as FnbReport;
  const lines = qlFunds({ hotel, fnb });
  assert.deepEqual(lines.map((l) => [l.label, l.in, l.out, l.net]), [["Khách sạn · tiền mặt", 95, 20, 75], ["Khách sạn · tài khoản ngân hàng", 50, 5, 45], ["Khách sạn · thẻ visa", 0, 0, 0], ["Mini mart · tiền mặt", 30, 10, 20], ["Mini mart · ngân hàng (gồm POS)", 40, 0, 40], ["Tổng tiền mặt", 125, 30, 95], ["Tổng ngân hàng", 90, 5, 85]]);
  assert.ok(lines.every((l) => l.in - l.out === l.net));
});

test("the month's result: one column per unit and a total, hotel costs from the hotel list, F&B costs from the unit's tree, profit = revenue - costs", () => {
  const e = (kind: string, cash: number) => ({ row: 1, date: "2026-10-05", kind, note: "", cash, bank: 0, visa: 0, commission: 0, cardFee: 0 });
  const hotel = { summary: { income: { commission: 30, otherDeduction: 20 } }, expenses: [e("Chi sửa chữa – Bảo dưỡng", 400), { ...e("Chi sửa chữa – Bảo dưỡng", 999), date: "2026-09-30" }] } as never;
  const tree = [{ group: "Chi phí vận hành", total: 60, kinds: [{ name: "Chi mua hàng hóa", total: 60 }] }];
  const fnb = { units: [{ label: "Mini mart", sales: { total: 500 }, tree }] } as unknown as FnbReport;
  const r = qlResult("2026-10", { days: [day("2026-10-02", { room: 1000, service: 100, excludedRoom: 50 })], hotel, fnb });
  const by = (label: string) => r.rows.find((x) => x.label.startsWith(label))!.values;
  assert.deepEqual(r.columns, ["Khách sạn", "Mini mart", "Tổng"]);
  assert.deepEqual(by("I. TỔNG DOANH THU"), [1100, 500, 1600]); // 1000 + 100 + 50 - 50 deducted; 500 sales
  assert.deepEqual(by("II. TỔNG CHI PHÍ"), [400, 60, 460]); // the 30 September line is out of the month
  assert.deepEqual(by("Chi mua hàng hóa"), [0, 60, 60]);
  assert.deepEqual(by("III. LỢI NHUẬN"), [700, 440, 1140]);
});

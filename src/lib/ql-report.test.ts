import test from "node:test";
import assert from "node:assert/strict";
import { qlBooks, qlFunds, qlResult, qlWeekly, monthRange } from "./ql-report.ts";
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
  const fnb = { units: [{ label: "Mini mart", sales: { cash: 30, bank: 40, pos: 0 }, other: { cash: 0, bank: 0 }, spent: { cash: 10, bank: 0, visa: 0 }, funds: { cash: 20, bank: 40 }, balances: { openCash: null, closeCash: null, openBank: null, closeBank: null } }] } as unknown as FnbReport;
  const lines = qlFunds({ hotel, balances: { openCash: 1000, closeCash: null, openBank: null, closeBank: null }, fnb });
  assert.deepEqual(lines.map((l) => [l.label, l.in, l.out, l.net]), [["Khách sạn · tiền mặt", 95, 20, 75], ["Khách sạn · tài khoản ngân hàng", 50, 5, 45], ["Khách sạn · thẻ visa", 0, 0, 0], ["Mini mart · tiền mặt", 30, 10, 20], ["Mini mart · ngân hàng (gồm POS)", 40, 0, 40], ["Tổng tiền mặt", 125, 30, 95], ["Tổng ngân hàng", 90, 5, 85]]);
  assert.deepEqual(lines.map((l) => [l.open, l.close]), [[1000, 1075], [null, null], [null, null], [null, null], [null, null], [1000, 1095], [0, 85]]); // a line without a typed opening has no closing; the totals count it as 0
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
  assert.deepEqual(by("I, TỔNG DOANH THU"), [1100, 500, 1600]); // 1000 + 100 + 50 - 50 deducted; 500 sales
  assert.deepEqual(by("II, TỔNG CHI PHÍ"), [400, 60, 460]); // the 30 September line is out of the month
  assert.deepEqual(by("Chi mua hàng hóa"), [0, 60, 60]);
  assert.deepEqual(by("III, Lợi nhuận"), [700, 440, 1140]);
});

test("the cash book and the bank book day by day: opening, in and out per unit, closing, and the sheet's own closing to compare with", () => {
  const hotel = { summary: { fundDaily: [{ date: "2026-10-02", cash: { in: 100, adv: 20, out: 30 }, bank: { in: 50, adv: 0, out: 10 } }] }, balances: { openCash: 1000, closeCash: 1090, openBank: 500, closeBank: 540 } } as never;
  const unit = { label: "Mini mart", days: [{ date: "2026-10-02", inCash: 40, outCash: 5, inBank: 60, outBank: 0 }], balances: { openCash: 200, closeCash: 235, openBank: null, closeBank: null } };
  const { cash, bank } = qlBooks("2026-10", { hotel, fnb: { units: [unit] } as unknown as FnbReport });
  assert.deepEqual(cash.cols.map((c) => c.label), ["Khách sạn · thu", "Khách sạn · chi", "Mini mart · thu", "Mini mart · chi"]);
  assert.equal(cash.rows.length, 31);
  assert.deepEqual([cash.opening, cash.rows[0].close, cash.rows[1].open, cash.rows[1].values, cash.rows[1].close, cash.rows[2].open, cash.total.close, cash.total.values], [1200, 1200, 1200, [120, 30, 40, 5], 1325, 1325, 1325, [120, 30, 40, 5]]);
  assert.equal(cash.sheetClose, 1325); // 1090 + 235: the sheets agree
  assert.deepEqual([bank.opening, bank.rows[1].close, bank.total.close, bank.sheetClose, bank.cols.filter((c) => c.memo).length], [500, 540, 540, 540, 2]); // the F&B account is beside, not in the balance
  assert.equal(qlBooks("2026-10", { hotel: { ...(hotel as object), balances: { openCash: null, closeCash: null, openBank: null, closeBank: null } } as never }).cash.sheetClose, null); // no typed balances: nothing to compare
});

test("a kind the units name differently is one line, under the hotel's name", () => {
  const e = (kind: string, cash: number) => ({ row: 1, date: "2026-10-05", kind, note: "", cash, bank: 0, visa: 0, commission: 0, cardFee: 0 });
  const hotel = { summary: { income: { commission: 0, otherDeduction: 0 } }, expenses: [e("Chi Marketing – OTA", 400), e("Chi mua đồ dùng CCDC", 10)] } as never;
  const group = "Chi dịch vụ ngoài & nộp thuế";
  const fnb = { units: [{ label: "Mini mart", sales: { total: 0 }, tree: [{ group, total: 60, kinds: [{ name: "Chi Marketing", total: 60 }] }, { group: "Chi phí đầu tư, sự kiện", total: 5, kinds: [{ name: "Chi mua đồ dùng – CCDC", total: 5 }] }] }] } as unknown as FnbReport;
  const r = qlResult("2026-10", { days: [], hotel, fnb });
  assert.deepEqual(r.rows.filter((x) => /^Chi (Marketing|mua đồ dùng)/.test(x.label)).map((x) => [x.label, x.values]), [["Chi mua đồ dùng CCDC", [10, 5, 15]], ["Chi Marketing – OTA", [400, 60, 460]]]);
});

test("thu chi of each party line by line add up to the money in and out of the fund table", async () => {
  const { summarizeFinance } = await import("./finance-summary.ts");
  const { qlFunds, qlParties, partyTotals } = await import("./ql-report.ts");
  const f = (cash = 0, bank = 0, card = 0) => ({ cash, bank, card });
  const entry = (date: string, taken: ReturnType<typeof f>, deposit = f(), advance = f()) => ({ row: 1, date, id: "B1", platform: "Booking", service: "Tiền phòng", note: "", taken, deposit, advance, pos: 0, commission: 0, otherDeduction: 0 });
  const entries = [entry("2026-10-02", f(500, 300), f(100)), entry("2026-10-03", f(0, 0), f(), f(0, 200)), entry("2026-09-30", f(999)), entry("2026-10-04", f(0, 0, 50))];
  const e = (date: string, kind: string, cash: number, bank: number, visa = 0) => ({ row: 1, date, kind, note: "x", cash, bank, visa, commission: 0, cardFee: 0 });
  const expenses = [e("2026-10-05", "Chi khác", 70, 0), e("2026-10-06", "Chi khác", 0, 40, 10), e("2026-09-29", "Chi khác", 5, 0)];
  const summary = summarizeFinance(entries, expenses, { from: "2026-10-01", to: "2026-10-31" });
  const ledger = { income: [{ date: "2026-10-02", seller: "Tài", note: "", cash: 100, bank: 20, pos: 30, otherCash: 5, otherBank: 6, shopee: 0, grab: 0, voided: 0, rental: 0, row: 1 }], expense: [e("2026-10-03", "Chi mua hàng hóa", 40, 8)] };
  const fnb = { units: [{ label: "Mini mart", sales: { cash: 100, bank: 20, pos: 30, total: 150 }, other: { cash: 5, bank: 6 }, spent: { cash: 40, bank: 8, visa: 0 }, funds: { cash: 65, bank: 48 }, balances: { openCash: null, openBank: null }, ledger }] } as never;
  const funds = qlFunds({ hotel: summary, fnb });
  const parties = qlParties("2026-10", { hotel: { entries, expenses }, fnb });
  assert.deepEqual(parties.map((p) => p.label), ["Khách sạn", "Mini mart"]);
  assert.deepEqual([parties[0].thu.length, parties[0].chi.length], [3, 2]); // the 30 September receipt and the 29 September payment are out of the month
  for (const [p, prefix] of [[parties[0], "Khách sạn"], [parties[1], "Mini mart"]] as const) {
    const thu = partyTotals(p.thu), chi = partyTotals(p.chi), cash = funds.find((l) => l.label.startsWith(`${prefix} · tiền mặt`))!, bank = funds.find((l) => l.label.startsWith(`${prefix} · ngân hàng`) || l.label.startsWith(`${prefix} · tài khoản`))!;
    assert.deepEqual([thu.cash, chi.cash], [cash.in, cash.out], prefix + " tiền mặt");
    assert.deepEqual([thu.bank, chi.bank], [bank.in, bank.out], prefix + " ngân hàng");
  }
  assert.deepEqual(partyTotals(parties[0].thu), { cash: 400, bank: 500, card: 50, all: 950 }); // 500-100 cash, 300 + 200 bank, 50 card
});

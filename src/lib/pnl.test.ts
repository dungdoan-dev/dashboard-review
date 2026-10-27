import test from "node:test";
import assert from "node:assert/strict";
import { FNB_EXPENSES, MART_EXPENSES } from "./expense-kinds.ts";
import { costTree, lineMonths, noteMonths, pnlRows, revenueLines, roomByCheckout, type MonthData } from "./pnl.ts";

const line = (kind: string, note: string, cash: number) => ({ row: 4, date: "2026-08-05", kind, note, cash, bank: 0, visa: 0, commission: 0, cardFee: 0 });

test("Blue Jay service groups land on the sheet's revenue lines, anything else is 'Thu khác'", () => {
  assert.deepEqual(revenueLines({ room: 100, services: { Minibar: 5, "Dịch vụ giặt sấy": 7, "Dịch vụ khác": 11, "Late checkout": 3 } }), { "Tiền phòng": 100, Minibar: 5, "Giặt ủi": 7, "Dịch vụ ngoài": 11, "Thu khác": 3 }); // Blue Jay's own group names
});

test("costs are filed in the report groups, transfers between funds are left out", () => {
  const tree = costTree([line("Chi sửa chữa – Bảo dưỡng", "vòi sen", 450000), line("Chi nhân sự – BHXH", "lương", 1000000), line("Chi rút tiền – Điều chuyển tiền", "rút", 9000000)]);
  assert.deepEqual(tree.map((g) => [g.group, g.total]), [["Chi phí đầu tư, sự kiện", 450000], ["Chi phí vận hành", 0], ["Chi phí nhân sự", 1000000], ["Chi dịch vụ ngoài & nộp thuế", 0], ["Chi phí khác", 0]]);
});

test("the year is the sum of the months, profit = revenue − costs, a month without tabs counts as 0", () => {
  const aug: MonthData = { rooms: 10, room: 1000, services: { Minibar: 100 }, commission: 50, otherDeduction: 10, expenses: [line("Chi sửa chữa – Bảo dưỡng", "", 300)] };
  const sep: MonthData = { rooms: 5, room: 500, services: {}, commission: 0, otherDeduction: 0, expenses: null };
  const rows = pnlRows([aug, sep]);
  const by = (label: string) => rows.find((r) => r.label.startsWith(label))!.values;
  assert.deepEqual(by("I. TỔNG DOANH THU"), [1040, 500, 1540]);
  assert.deepEqual(by("II. TỔNG CHI PHÍ"), [300, 0, 300]);
  assert.deepEqual(by("III. LỢI NHUẬN"), [740, 500, 1240]);
  assert.deepEqual(by("Chi sửa chữa"), [300, 0, 300]);
});

test("a line is for the months its text names, the nearest year when none is written", () => {
  assert.deepEqual(noteMonths("lương tháng 7", "2026-08-05"), ["2026-07"]);
  assert.deepEqual(noteMonths("tháng 8/26 và tháng 5,6/26 còn thiếu", "2026-08-05"), ["2026-08", "2026-05", "2026-06"]);
  assert.deepEqual(noteMonths("MKT book phòng và QC tháng 5,6,7/26", "2026-08-05"), ["2026-05", "2026-06", "2026-07"]);
  assert.deepEqual(noteMonths("BHXH tháng 12", "2027-01-08"), ["2026-12"]); // paid in January: December of the year before
  assert.deepEqual(noteMonths("lương tháng 9", "2026-08-28"), ["2026-09"]); // paid ahead
  assert.deepEqual(noteMonths("Gia hạn bluejay 12 tháng và phí chuyển khoản", "2026-08-05"), []); // "12 tháng" is a length, not a month
  assert.deepEqual(noteMonths("Thanh toán casual HK ngày 12/8", "2026-08-12"), []);
});

test("lines move to their month, a split keeps every dong", () => {
  const paid = (note: string, cash: number) => ({ ...line("Chi thuê khách sạn", note, cash), date: "2026-08-05" });
  const by = lineMonths([paid("tháng 8/26 và tháng 5,6/26 còn thiếu", 100), paid("lương tháng 7", 70), paid("phí sms", 5)]);
  assert.deepEqual([...by].map(([m, ls]) => [m, ls.reduce((s, l) => s + l.cash, 0)]).sort(), [["2026-05", 33], ["2026-06", 34], ["2026-07", 70], ["2026-08", 38]]); // the rent: 33 for August, 33 for May, 34 (the rest) for June; the 5 of the fee stay in August
});

test("room money by check-out day counts whole stays, M-Standard / Unassigned and the fee of a no-show", () => {
  const stay = (roomInWeek: number) => ({ stay: true, roomInWeek, roomPrice: roomInWeek }) as never;
  const noShow = (roomPrice: number) => ({ stay: false, roomInWeek: 0, roomPrice }) as never;
  assert.equal(roomByCheckout({ bookings: [stay(1000), stay(500), noShow(300)], excludedRoom: 200 }), 2000);
  assert.equal(roomByCheckout({ bookings: [stay(1000)], excludedRoom: undefined }), 1000); // a stored week that predates the excluded data
});

test("the café and mini mart lists file every kind in a report group, and the food groups are running costs", () => {
  for (const list of [FNB_EXPENSES, MART_EXPENSES]) {
    const tree = costTree(list.map(([, name]) => line(name, "", 1000)), list);
    assert.equal(tree.find((g) => g.group.startsWith("Chưa phân loại")), undefined); // every name is found in its own list
    assert.equal(tree.reduce((s, g) => s + g.total, 0), 1000 * (list.length - 1)); // all but the transfer between funds
  }
  const cafe = costTree([line("Chi nguyên liệu pha chế", "cà phê hạt", 5000), line("Chi mua hàng hóa", "bia", 3000)], FNB_EXPENSES);
  assert.deepEqual(cafe.map((g) => [g.group, g.total]).filter(([, t]) => t), [["Chi phí vận hành", 8000]]);
  assert.ok(costTree([line("Chi nguyên liệu pha chế", "", 1)]).some((g) => g.group.startsWith("Chưa phân loại"))); // the hotel list does not know it
});

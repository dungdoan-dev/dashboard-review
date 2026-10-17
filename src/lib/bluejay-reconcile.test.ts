import test from "node:test";
import assert from "node:assert/strict";
import { cleanId, ledgerDate, parseLedger, parseLedgerWorkbook, reconcile } from "./bluejay-reconcile.ts";
import type { RevenueBooking } from "./bluejay-revenue.ts";

const serial = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 864e5 + 25569;
const HEAD = ["NGÀY THÁNG", "ID HỆ THỐNG", "NỀN TẢNG", "HÌNH THỨC THANH TOÁN", "DỊCH VỤ", "GHU CHÚ", "SỐ PHÒNG TT", "TIỀN CỌC ĐÃ NHẬN", "", "THU TIỀN KHÁCH SẠN", "", "", "", "", "", "Khoản giảm trừ doanh thu", "", "", "Tiền so Bluejay", "DOANH THU THEO NGÀY", "Tiền TK so bluejay"];
const SUB = ["", "", "", "", "", "", "", "Cọc TM ở", "Cọc TK ở", "Tiền măt", "Cọc TM chưa ở", "Tiền TK", "Cọc TK chưa ở", "Tiền quẹt thẻ", "Visa", "Hoa hồng", "Phí thẻ", "Giảm giá", "", "Ngày tháng", ""];
// cash = col 9, account = col 11, counted = "Tiền so Bluejay"
const line = (date: string, id: string, platform: string, service: string, note: string, cash: number, account: number, counted: number) => {
  const r: unknown[] = new Array(21).fill("");
  Object.assign(r, { 0: serial(date), 1: id, 2: platform, 3: "TT trực tiềp", 4: service, 5: note, 9: cash || "", 11: account || "", 18: counted });
  return r;
};
const sheet = (rows: unknown[][], daily: [string, number][] = []) => {
  const all = [["BẢNG KÊ THU TIỀN KHÁCH SẠN"], HEAD, SUB, ["TỔNG"], ...rows];
  daily.forEach(([date, value], i) => { const r = all[4 + i] ?? (all[4 + i] = new Array(21).fill("")); r[19] = serial(date); r[20] = value; });
  return all;
};
const booking = (o: Partial<RevenueBooking> = {}): RevenueBooking => ({
  code: "009001", ref: "", source: "Walking", channel: "Khách lẻ", roomType: "Deluxe", room: "P - 101", status: "Đã trả phòng", bookDate: "2026-08-01", checkIn: "2026-08-10", checkOut: "2026-08-12",
  nights: 2, nightsInWeek: 2, roomPrice: 1000000, roomInWeek: 1000000, servicePrice: 50000, totalPrice: 1050000, payment: 1050000, balance: 0, deposit: 0, stay: true, flags: [], ...o,
});

test("ledgerDate and cleanId read what the finance sheet really contains", () => {
  assert.equal(ledgerDate(serial("2026-08-05")), "2026-08-05");
  assert.equal(ledgerDate("05/08/2026"), "2026-08-05");
  assert.equal(ledgerDate("TỔNG"), null);
  assert.equal(cleanId("1669108698399193\n"), "1669108698399193");
  assert.equal(cleanId("be-51f9a2f3-7 "), "BE-51F9A2F3-7");
});

test("parseLedger finds columns by header, keeps id lines, and splits off summary lines without an id", () => {
  const ledger = parseLedger(sheet([
    line("2026-08-10", "009001", "Khách Lẻ", "Tiền phòng", "", 0, 1000000, 1000000),
    line("2026-08-10", "009001 ", "Khách Lẻ", "Minibar", "", 50000, 0, 0),
    line("2026-08-26", "", "", "Lãi tiền gửi", "", 0, 19487, 19487),
  ]));
  assert.equal(ledger.lines.length, 2);
  assert.equal(ledger.lines[1].id, "009001");
  assert.deepEqual([ledger.lines[0].isRoom, ledger.lines[1].isRoom], [true, false]);
  assert.equal(ledger.lines[0].collected, 1000000);
  assert.equal(ledger.noId.rows, 1);
  assert.equal(ledger.noId.collected, 19487);
  assert.deepEqual([ledger.from, ledger.to], ["2026-08-10", "2026-08-26"]);
  assert.equal(ledger.countedByDay["2026-08-26"], 19487); // lines without an id still count in the day total
});

test("parseLedger refuses a file that is not the ledger", () => {
  assert.throws(() => parseLedger([["a", "b"], [1, 2]]), /ID HỆ THỐNG/);
  assert.throws(() => parseLedger([["NGÀY THÁNG", "ID HỆ THỐNG"]]), /thiếu cột/);
});

test("direct guest: the whole payment is compared, including cash and deposits", () => {
  const ledger = parseLedger(sheet([
    line("2026-08-10", "009001", "Khách Lẻ", "Tiền phòng", "", 0, 1000000, 1000000),
    line("2026-08-12", "009001", "Khách Lẻ", "Minibar", "", 50000, 0, 0),
    line("2026-08-12", "009002", "Khách Lẻ", "Tiền phòng", "", 0, 900000, 900000),
  ]));
  const r = reconcile(ledger, [booking(), booking({ code: "009002", room: "P - 102", payment: 1000000, totalPrice: 1000000, servicePrice: 0, roomPrice: 1000000 })]);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  assert.equal(by["009001"].kind, "ok");
  assert.equal(by["009001"].excel, 1050000);
  assert.equal(by["009002"].kind, "diff");
  assert.equal(by["009002"].diff, -100000);
  assert.equal(r.counts.ok, 1);
  assert.equal(r.counts.diff, 1);
});

test("OTA booking: only services are compared; the room money is paid later by the OTA", () => {
  const ota = booking({ code: "007001", ref: "2519808162", channel: "Expedia", source: "Expedia", servicePrice: 480000, roomPrice: 2000000, payment: 2480000, totalPrice: 2480000 });
  const ok = reconcile(parseLedger(sheet([line("2026-08-11", "2519808162", "Expedia", "Dịch Vụ Ngoài", "", 480000, 0, 0)])), [ota]);
  assert.equal(ok.items[0].kind, "ok");
  assert.equal(ok.items[0].basis, "service");
  // a settlement line for the same booking is room money and must not be counted as service
  const withRoom = reconcile(parseLedger(sheet([
    line("2026-08-11", "2519808162", "Expedia", "Dịch Vụ Ngoài", "", 480000, 0, 0),
    line("2026-08-12", "2519808162", "Expedia", "Tiền phòng", "Expedia tt tháng 7", 0, 2000000, 2000000),
  ])), [ota]);
  assert.equal(withRoom.items[0].kind, "ok");
  const short = reconcile(parseLedger(sheet([line("2026-08-11", "2519808162", "Expedia", "Dịch Vụ Ngoài", "", 400000, 0, 0)])), [ota]);
  assert.equal(short.items[0].diff, -80000);
});

test("ids missing from Blue Jay: earlier-month settlements are told apart from real gaps", () => {
  const r = reconcile(parseLedger(sheet([
    line("2026-08-06", "1734737918", "Agoda", "Tiền phòng", "Agoda tt tháng 6", 0, 520000, 0),
    line("2026-08-07", "009999", "Khách Lẻ", "Tiền phòng", "", 0, 700000, 700000),
  ])), [booking()]);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i.kind]));
  assert.equal(by["1734737918"], "prior");
  assert.equal(by["009999"], "ledger-only");
});

test("Blue Jay money the ledger never mentions is listed, but only money the hotel collects", () => {
  const ledger = parseLedger(sheet([line("2026-08-10", "009500", "Khách Lẻ", "Tiền phòng", "", 0, 100000, 100000)]));
  const r = reconcile(ledger, [
    booking({ code: "009001" }),                                                                      // direct, paid -> missing from the ledger
    booking({ code: "007002", ref: "555", channel: "Agoda", servicePrice: 0, payment: 900000 }),      // OTA without service -> not expected
    booking({ code: "007003", ref: "556", channel: "Agoda", servicePrice: 70000, payment: 970000 }),  // OTA with service -> expected
    booking({ code: "009600", stay: false, payment: 0, status: "Đã huỷ" }),                           // cancelled
    booking({ code: "009700", checkIn: "2026-07-01", checkOut: "2026-07-03" }),                       // outside the period
  ], "2026-08-01", "2026-08-31");
  assert.deepEqual(r.items.filter((i) => i.kind === "bj-only").map((i) => i.id).sort(), ["009001", "556"]);
});

test("a cancelled booking and an in-house guest get a note instead of failing silently", () => {
  const cancelled = reconcile(parseLedger(sheet([line("2026-08-10", "009001", "Khách Lẻ", "Tiền phòng", "", 0, 0, 0)])), [booking({ stay: false, payment: 0, status: "Đã huỷ" })]);
  assert.match(cancelled.items[0].notes.join(" "), /hủy/);
  const inHouse = reconcile(parseLedger(sheet([line("2026-08-10", "009001", "Khách Lẻ", "Tiền phòng", "", 0, 300000, 300000)])), [booking({ status: "Đã nhận phòng", payment: 500000 })]);
  assert.equal(inHouse.items[0].kind, "diff");
  assert.match(inHouse.items[0].notes.join(" "), /đang ở/);
});

test("file checks: day total that disagrees with the sheet's own daily block, repeated lines, lines with no money", () => {
  const ledger = parseLedger(sheet([
    line("2026-08-10", "009001", "Khách Lẻ", "Tiền phòng", "", 0, 1000000, 1000000),
    line("2026-08-10", "009001", "Khách Lẻ", "Tiền phòng", "", 0, 1000000, 1000000),
    line("2026-08-11", "009002", "Khách Lẻ", "Minibar", "", 0, 0, 0),
  ], [["2026-08-10", 1000000], ["2026-08-11", 0]]));
  const r = reconcile(ledger, []);
  assert.deepEqual(r.fileIssues.dailyMismatch, [{ date: "2026-08-10", ledger: 2000000, sheet: 1000000, diff: 1000000 }]);
  assert.equal(r.fileIssues.duplicates.length, 1);
  assert.equal(r.fileIssues.noMoney.length, 1);
});

test("a direct stay that began before the period is compared on services only (its room money is in last month's ledger)", () => {
  const spanning = booking({ code: "007692", room: "R - 202", checkIn: "2026-08-31", checkOut: "2026-09-01", roomPrice: 1300000, servicePrice: 50000, payment: 1350000, totalPrice: 1350000 });
  const ledger = parseLedger(sheet([line("2026-09-01", "	007692", "Zalo", "Phụ thu", "túi giặt", 0, 50000, 0)]));
  const r = reconcile(ledger, [spanning], "2026-09-01", "2026-09-30");
  assert.equal(r.items[0].kind, "ok");
  assert.equal(r.items[0].basis, "service");
  assert.match(r.items[0].notes.join(" "), /trước kỳ/);
  // the same booking inside its own month is still compared on the whole payment
  assert.equal(reconcile(ledger, [spanning], "2026-08-01", "2026-09-30").items[0].basis, "payment");
});

test("the monthly workbook: the ledger sheet is found among many, and its own layout (no Tiền so Bluejay column, Tổng tiền excluded) is read", () => {
  const head = ["NGÀY THÁNG", "ID HỆ THỐNG", "NỀN TẢNG", "Thanh toán", "DỊCH VỤ", "NỘI DUNG", "SỐ PHÒNG TT", "TIỀN CỌC ĐÃ NHẬN", "", "", "THU TIỀN KHÁCH SẠN", "", "", "", "", "", "Tổng tiền", "GIẢM TRỪ DOANH THU"];
  const row = (id: string, cash: number, account: number, total: number) => { const r: unknown[] = new Array(19).fill(""); Object.assign(r, { 0: serial("2026-09-02"), 1: id, 2: "Zalo", 4: "Tiền phòng", 10: cash || "", 12: account || "", 16: total, 17: 5 }); return r; };
  const rows = [["BẢNG KÊ"], head, ["", "", "", "", "", "", "", "Cọc TM ở"], row("	008001", 100000, 250000, 350000)];
  const parsed = parseLedgerWorkbook([{ name: "DOANH THU KS.", rows: [["x"]] }, { name: "BK THU TIỀN KS", rows }]);
  assert.equal(parsed.sheet, "BK THU TIỀN KS");
  assert.equal(parsed.hasCounted, false);
  assert.equal(parsed.lines[0].id, "008001");
  assert.equal(parsed.lines[0].collected, 350000); // cash + account, not counted again through the sheet's own "Tổng tiền"
  assert.throws(() => parseLedgerWorkbook([{ name: "A", rows: [["x"]] }, { name: "B", rows: [["y"]] }]), /Không thấy sheet bảng kê/);
});

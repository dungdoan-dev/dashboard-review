// Ported from the sample project's tests (D:\blue-jay test/metrics.test.js, test/excel.test.js). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { addDays, apiDate, averageRate, combine, hotelRecord, inApiWindow, isExcludedRoom, isoWeek, lastFullWeek, mondayOf, nightsIn, occupancyDaily, occupancyTotals, rate, reservationStats, serviceStats, statusCounts, summarize, type HotelRecord, type Reservation, type WeeklyReport } from "./bluejay-metrics.ts";
import { workbookFor } from "./bluejay-excel.ts";

let seq = 0;
const day = (RoomOccupied: number, TotalRoom: number) => ({ Date: `${++seq}/10/2026`, RoomOccupied, TotalRoom });
const report = (rts: { RoomTypeName: string; DailyDetails: { Date: string; RoomOccupied: number; TotalRoom: number }[] }[]) => ({ data: { GrandTotal: { RoomTypes: rts } } });

test("week math", () => {
  assert.equal(isoWeek("2026-10-05"), 41);
  assert.equal(addDays("2026-10-05", 6), "2026-10-11");
  assert.equal(apiDate("2026-10-05"), "2026-10-5");
  assert.equal(mondayOf("2026-10-11"), "2026-10-05");
  assert.equal(lastFullWeek(new Date("2026-10-12T09:00:00Z")), "2026-10-05"); // Monday 16:00 VN
  assert.equal(lastFullWeek(new Date("2026-10-15T03:00:00Z")), "2026-10-05"); // Thursday
});

test("API window, Vietnam time", () => {
  assert.equal(inApiWindow(new Date("2026-10-15T09:00:00Z")), true); // 16:00 VN
  assert.equal(inApiWindow(new Date("2026-10-15T03:33:00Z")), false); // 10:33 VN
  assert.equal(inApiWindow(new Date("2026-10-15T01:30:00Z")), true); // 08:30 VN is the last allowed minute
  assert.equal(inApiWindow(new Date("2026-10-15T01:31:00Z")), false);
  assert.equal(inApiWindow(new Date("2026-10-14T17:30:00Z")), true); // 00:30 VN
});

test("occupancy excludes M-Standard; blocked rooms stay in the denominator", () => {
  const t = occupancyTotals(report([
    { RoomTypeName: "Deluxe", DailyDetails: [day(5, 10), day(3, 10)] },
    { RoomTypeName: "M - STANDARD BED ROOM", DailyDetails: [day(9, 9)] },
  ]));
  assert.deepEqual(t, { occ: 8, total: 20 });
  assert.equal(rate(t), 8 / 20);
  assert.equal(rate({ occ: 0, total: 0 }), 0);
  assert.equal(isExcludedRoom("Mini Standard"), false);
  assert.throws(() => occupancyTotals({ data: {} })); // missing report is an error, not zero
});

const W = ["2026-10-05", "2026-10-11"] as const;
const booking = (o: Reservation = {}): Reservation => ({ bookingCode: "x", roomType: "Deluxe", status: "Đã trả phòng", checkInTime: "2026-10-05", checkOutTime: "2026-10-07", night: 2, roomPrice: 2000000, ...o });

test("nights inside the week: checkout day is not a night, edges are clipped", () => {
  assert.equal(nightsIn(booking(), ...W), 2);
  assert.equal(nightsIn(booking({ checkInTime: "2026-10-03", checkOutTime: "2026-10-06" }), ...W), 1);
  assert.equal(nightsIn(booking({ checkInTime: "2026-10-10", checkOutTime: "2026-10-14" }), ...W), 2);
  assert.equal(nightsIn(booking({ checkInTime: "2026-10-12", checkOutTime: "2026-10-13" }), ...W), 0);
  assert.equal(nightsIn(booking({ checkInTime: "" }), ...W), 0);
});

test("ADR is per night inside the week and skips cancelled, no-show, duplicates, M-Standard, unknown prices", () => {
  const a = booking();
  const straddle = booking({ checkInTime: "2026-10-10", checkOutTime: "2026-10-14", night: 4, roomPrice: 4000000 });
  assert.equal(averageRate([a, a, straddle], ...W), (2000000 + 2000000) / 4);
  assert.equal(averageRate([booking({ status: "Đã huỷ" }), booking({ status: "Không đến" }), booking({ roomType: "M-Standard" }), booking({ roomPrice: null })], ...W), 0);
});

test("daily occupancy merges room types per date and converts dd/mm/yyyy", () => {
  const d = occupancyDaily(report([
    { RoomTypeName: "A", DailyDetails: [{ Date: "05/10/2026", RoomOccupied: 2, TotalRoom: 5 }] },
    { RoomTypeName: "B", DailyDetails: [{ Date: "05/10/2026", RoomOccupied: 1, TotalRoom: 3 }] },
  ]));
  assert.deepEqual(d, [{ date: "2026-10-05", occupied: 3, total: 8 }]);
});

test("reservation stats: distinct bookings, folding, in-week room revenue", () => {
  const row = (o: Reservation) => booking({ servicePrice: 0, totalPrice: 0, payment: 0, balance: 0, ...o });
  const rows = [
    row({ bookingCode: "A", roomType: "Deluxe", source: "Agoda", night: 2, roomPrice: 200, servicePrice: 10 }),
    row({ bookingCode: "A", roomType: "Suite", source: "Agoda", night: 2, roomPrice: 100 }),
    row({ bookingCode: "", roomType: "Deluxe", source: "", status: "Đã nhận phòng", night: 2, roomPrice: 50 }),
    row({ bookingCode: "C", source: "Agoda", status: "Đã huỷ", roomPrice: 999 }),
  ];
  const s = reservationStats(rows, ...W);
  assert.equal(s.bookings, 1);
  assert.equal(s.roomPrice, 350);
  assert.equal(s.servicePrice, 10);
  assert.deepEqual(s.bySource.map((g) => [g.name, g.bookings, g.nights, g.value]), [["Agoda", 1, 4, 300], ["Không rõ", 1, 2, 50]]);
  assert.deepEqual(statusCounts(rows).map((g) => g.name).sort(), ["Đã huỷ", "Đã nhận phòng", "Đã trả phòng"]);
  const many = Array.from({ length: 12 }, (_, i) => row({ bookingCode: `b${i}`, source: `s${i}`, night: 2, roomPrice: 200 - i }));
  const folded = reservationStats(many, ...W).bySource;
  assert.equal(folded.length, 7);
  assert.equal(folded.at(-1)?.name, "Khác");
});

test("services and weighted chain summary", () => {
  assert.deepEqual(serviceStats({ data: [{ GroupService: "Ăn", TotalQuantity: 2, TotalPriceSale: 50 }, { GroupService: "Khác", TotalQuantity: 1, TotalPriceSale: 80 }] }).groups.map((g) => g.name), ["Khác", "Ăn"]);
  assert.throws(() => serviceStats({}));
  const rec = (occ: number, total: number, roomSum: number, nightSum: number) => ({ weeks: [{ occ, total }, { occ: 0, total }, { occ: 0, total }], roomSum, nightSum });
  const s = summarize([rec(50, 100, 1000, 10), rec(10, 10, 100, 1)]);
  assert.equal(s.rate, 60 / 110); // weighted, not (50% + 100%) / 2
  assert.equal(s.adr, 1100 / 11);
});

test("merged groups keep \"Khác\" last and fold past the cap", () => {
  const rec = (names: string[]) => ({ stats: { bookings: 0, roomPrice: 0, servicePrice: 0, totalPrice: 0, payment: 0, balance: 0, bySource: names.map((name, i) => ({ name, bookings: 1, nights: 1, value: name === "Khác" ? 1000 : 10 + i })), byRoomType: [] }, statuses: [], services: { groups: [], total: 0 } });
  assert.equal(combine([rec(["a", "Khác"])]).bySource.at(-1)?.name, "Khác");
  const big = combine([rec(Array.from({ length: 12 }, (_, i) => `s${i}`))]).bySource;
  assert.equal(big.length, 8);
  assert.equal(big.at(-1)?.name, "Khác");
});

const hotel = (id: number, name: string, occ: number): HotelRecord => hotelRecord({
  id, name,
  weeks: [{ occ, total: 100 }, { occ: 10, total: 100 }, { occ: 5, total: 100 }],
  days: [{ date: "2026-10-05", occupied: occ, total: 100 }],
  reservations: [{ bookingCode: "A", roomType: "Deluxe", source: "Agoda", status: "Đã trả phòng", checkInTime: "2026-10-05", checkOutTime: "2026-10-07", night: 2, roomPrice: 2000000 }],
  from: "2026-10-05", to: "2026-10-11",
  services: { data: [{ GroupService: "Ăn", TotalQuantity: 1.5, TotalPriceSale: 50 }] },
});
const weekly: WeeklyReport = { v: 3, monday: "2026-10-05", end: "2026-10-11", weekNo: 41, fetchedAt: "2026-10-15T09:00:00Z", hotels: [hotel(1, "A", 40), hotel(2, "B", 60)] };

test("workbook has one sheet per table, numbers stay numbers", async () => {
  const wb = XLSX.read(await workbookFor(weekly), { type: "buffer", cellNF: true });
  assert.deepEqual(wb.SheetNames, ["Tổng hợp", "Công suất theo ngày", "Tiền phòng theo nguồn", "Tiền phòng theo hạng phòng", "Đặt phòng theo trạng thái", "Dịch vụ theo nhóm"]);
  const s = wb.Sheets["Tổng hợp"];
  assert.deepEqual(["A2", "B2", "C2", "D2"].map((a) => s[a].v), ["Đơn vị", "A", "B", "Toàn chuỗi"]);
  assert.equal(s.B3.v, 0.4); // occupancy kept as a fraction
  assert.equal(s.B3.z, "0.00%");
  assert.equal(s.D3.v, 0.5); // chain is weighted: (40 + 60) / 200
  assert.equal(s.B5.v, 1000000); // ADR
  assert.equal(wb.Sheets["Dịch vụ theo nhóm"].B3.v, 3); // 1.5 per hotel, fractions kept
  const ruled = new ExcelJS.Workbook(); await ruled.xlsx.load((await workbookFor(weekly)) as unknown as ArrayBuffer); // every table cell, head and body, has a border
  const sheet = ruled.getWorksheet("Tổng hợp")!;
  assert.deepEqual([sheet.getCell("A2").border?.top?.style, sheet.getCell("D3").border?.bottom?.style, sheet.getCell("B8").border?.left?.style], ["thin", "thin", "thin"]);
});

test("single-hotel scope limits the daily sheet; the summary title carries no hotel name", async () => {
  const wb = XLSX.read(await workbookFor(weekly, 2), { type: "buffer" });
  const daily = wb.Sheets["Công suất theo ngày"];
  assert.deepEqual([daily.A2.v, daily.B2.v, daily.C2], ["Ngày", "B", undefined]);
  assert.match(String(daily.A1.v), /- B$/);
  assert.doesNotMatch(String(wb.Sheets["Tổng hợp"].A1.v), /- B$/);
});

test("redactReservations drops guest names, notes and ID-paper links from a logged page and leaves the original alone", async () => {
  const { redactReservations } = await import("./bluejay-metrics.ts");
  const page = { meta: { total: 1 }, data: { attributes: { reservations: [{ bookingCode: "1", balance: 5, guestName: "A", note: "x", guestImagepaper: "u" }] } } };
  const out = redactReservations(page);
  assert.deepEqual(out.data.attributes.reservations, [{ bookingCode: "1", balance: 5 }]);
  assert.equal(out.meta.total, 1);
  assert.equal((page.data.attributes.reservations[0] as Record<string, unknown>).guestName, "A");
  assert.equal(redactReservations(null), null);
});

test("revenue sheets: checkout-week title, M-Standard rows marked and kept out of the first totals, one line per service", async () => {
  const { revenueBookings } = await import("./bluejay-revenue.ts");
  const rows = [
    { bookingCode: "001", roomType: "Deluxe", roomName: "R1", status: "Đã trả phòng", checkInTime: "2026-10-05", checkOutTime: "2026-10-07", night: 2, roomPrice: 2000000, servicePrice: 100000, totalPrice: 2100000, payment: 2100000, balance: 0 },
    { bookingCode: "002", roomType: "M-Standard Room", roomName: "Unassigned", status: "Đã trả phòng", checkInTime: "2026-10-06", checkOutTime: "2026-10-07", night: 1, roomPrice: 700000, servicePrice: 0, totalPrice: 700000, payment: 700000, balance: 0 },
  ];
  const services = [{ date: "2026-10-06", total: 100000, groups: [{ name: "Minibar", quantity: 1, total: 100000, items: [{ name: "Nước", unit: "Chai", quantity: 1, total: 100000 }] }] }];
  const revenue = { v: 1, monday: "2026-10-05", end: "2026-10-11", fetchedAt: "x", hotels: [{ id: 1, name: "A", bookings: revenueBookings(rows, "2026-10-05", "2026-10-11"), excluded: revenueBookings(rows, "2026-10-05", "2026-10-11", true), services, basis: "checkout" as const }] };
  const wb = XLSX.read(await workbookFor(weekly, null, revenue, "revenue"), { type: "buffer" });
  const sum = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Tổng hợp doanh thu"], { header: 1 });
  assert.match(String(sum[0][0]), /TRẢ PHÒNG/);
  assert.deepEqual(sum[2], ["A", 1, 2000000, 100000, 2100000, 700000, 0, 2800000]);
  const list = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Doanh thu theo đặt phòng"], { header: 1 });
  assert.deepEqual(list.slice(2).map((r) => [r[2], r[1]]), [["001", "Tính doanh thu"], ["002", "M-Standard / Unassigned"]]);
  assert.deepEqual(wb.SheetNames, ["Tổng hợp doanh thu", "Doanh thu theo đặt phòng", "Dịch vụ theo ngày", "Chi tiết dịch vụ"]); // no operations sheets in the revenue file
  assert.equal(XLSX.read(await workbookFor(weekly, null, revenue), { type: "buffer" }).SheetNames.includes("Tổng hợp doanh thu"), false); // and none of these in the operations file
  assert.equal(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Chi tiết dịch vụ"], { header: 1 })[2][3], "Nước");
});

test("units with no hotel are branches but never Blue Jay hotels", async () => {
  const { BLUEJAY_HOTELS, BRANCHES, STANDALONE_UNITS, isStandalone } = await import("./bluejay-metrics.ts");
  assert.equal(BRANCHES.length, BLUEJAY_HOTELS.length + STANDALONE_UNITS.length);
  assert.equal(new Set(BRANCHES.map((b) => b.id)).size, BRANCHES.length);
  assert.ok(isStandalone(9001) && !isStandalone(5381) && !BLUEJAY_HOTELS.some((h) => isStandalone(h.id)));
});

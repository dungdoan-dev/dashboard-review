import test from "node:test";
import assert from "node:assert/strict";
import { channelOf, revenueBookings, revenueTotals, serviceDay, serviceMatrix } from "./bluejay-revenue.ts";
import type { Reservation } from "./bluejay-metrics.ts";

const W = ["2026-10-05", "2026-10-11"] as const;
const res = (o: Reservation = {}): Reservation => ({
  bookingCode: "001", referenceCode: null, roomName: "R - 101", roomType: "Deluxe", source: "Khách lẻ", status: "Đã trả phòng", bookDate: "2026-10-01 00:00:00",
  checkInTime: "2026-10-05", checkOutTime: "2026-10-07", night: 2, roomPrice: 2000000, servicePrice: 100000, totalPrice: 2100000, payment: 2100000, balance: 0, deposit: 0, ...o,
});

test("OTA site names map to the short names used in the finance sheets", () => {
  assert.deepEqual(["Booking.com", "Traveloka.com", "Ctrip", "Walking", "Phone", "Agoda", "Expedia", "BE", ""].map(channelOf), ["Booking", "Traveloka", "Trip", "Khách lẻ", "Khách lẻ", "Agoda", "Expedia", "BE", "Không rõ"]);
});

test("a stay counts whole in the week it checks out; cancelled rows are listed but not counted", () => {
  const straddle = res({ bookingCode: "002", checkInTime: "2026-10-03", checkOutTime: "2026-10-07", night: 4, roomPrice: 4000000, totalPrice: 4100000, payment: 4100000 });
  const rows = revenueBookings([res(), straddle, res({ bookingCode: "003", status: "Đã huỷ", payment: 500000 }), res({ bookingCode: "004", roomType: "M-Standard" })], ...W);
  assert.equal(rows.length, 3); // M-Standard left out
  const t = revenueTotals(rows);
  assert.equal(t.all.bookings, 2);
  assert.equal(t.all.room, 2000000 + 4000000); // the stay that began the week before counts all 4 nights
  assert.equal(t.all.nights, 6);
  assert.equal(revenueBookings([res({ bookingCode: "005", checkOutTime: "2026-10-12" })], ...W)[0].roomInWeek, 0); // checks out next week
  assert.deepEqual(t.cancelled, { bookings: 1, payment: 500000 });
});

test("flags: balance, overpaid, mismatch and paid-but-cancelled; clean rows have none", () => {
  const flags = (o: Reservation) => revenueBookings([res(o)], ...W)[0].flags;
  assert.deepEqual(flags({}), []);
  assert.deepEqual(flags({ payment: 0, balance: 2100000 }), ["balance"]);
  assert.deepEqual(flags({ status: "Đã xác nhận", payment: 0, balance: 2100000 }), []); // not checked out yet
  assert.deepEqual(flags({ payment: 2200000 }), ["overpaid", "mismatch"]);
  assert.deepEqual(flags({ totalPrice: 2000000, payment: 2000000 }), ["mismatch"]);
  assert.deepEqual(flags({ status: "Đã huỷ", payment: 300000 }), ["cancelled-paid"]);
  assert.deepEqual(flags({ status: "Đã huỷ", payment: 0 }), []);
});

test("identical rows from overlapping pages count once; a two-room booking keeps both rows", () => {
  const a = res(), b = res({ roomName: "R - 102", roomPrice: 0, servicePrice: 0, totalPrice: 0, payment: 0 });
  const rows = revenueBookings([a, a, b], ...W);
  assert.equal(rows.length, 2);
  assert.equal(revenueTotals(rows).all.bookings, 1);
});

test("service days: line price is a total, groups sort by revenue, a missing list is an error", () => {
  const d1 = serviceDay("2026-10-05", { data: [
    { GroupService: "Dịch vụ khác", TotalQuantity: 5, TotalPriceSale: 100000, Service: [{ ServiceName: "Bò Húc", UnitsName: "lon", Quantity: 5, PriceSale: 100000 }] },
    { GroupService: "Food", TotalQuantity: 2, TotalPriceSale: 200000, Service: [{ ServiceName: "Cơm", UnitsName: "phần", Quantity: 1, PriceSale: 70000 }, { ServiceName: "Lẩu", UnitsName: "phần", Quantity: 1, PriceSale: 130000 }] },
  ] });
  assert.deepEqual(d1.groups.map((g) => g.name), ["Food", "Dịch vụ khác"]);
  assert.equal(d1.total, 300000);
  const d2 = serviceDay("2026-10-06", { data: [{ GroupService: "Food", TotalQuantity: 1, TotalPriceSale: 50000, Service: [] }] });
  const m = serviceMatrix([d1, d2]);
  assert.deepEqual(m.groups.map((g) => [g.name, g.total]), [["Food", 250000], ["Dịch vụ khác", 100000]]);
  assert.equal(m.total, 350000);
  assert.deepEqual(m.days[1].byGroup, { Food: 50000 });
  assert.throws(() => serviceDay("2026-10-07", {}));
});

test("M-Standard bookings are kept apart so room money can be shown with and without them", () => {
  const rows = [res(), res({ bookingCode: "004", roomType: "M-Standard Room-1 Bed", roomName: "Unassigned", roomPrice: 700000, night: 1, checkOutTime: "2026-10-06" })];
  assert.deepEqual(revenueBookings(rows, ...W).map((b) => b.code), ["001"]);
  const only = revenueBookings(rows, ...W, true);
  assert.deepEqual(only.map((b) => [b.code, b.roomInWeek]), [["004", 700000]]);
  const none = res({ bookingCode: "006", roomName: "Unassigned", roomType: "Superior King", roomPrice: 560000, night: 1, checkOutTime: "2026-10-06" });
  assert.deepEqual(revenueBookings([none], ...W), []); // no room assigned: out of the totals, in the with-column
  assert.deepEqual(revenueBookings([none], ...W, true).map((b) => b.code), ["006"]);
});

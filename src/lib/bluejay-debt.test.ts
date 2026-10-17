import test from "node:test";
import assert from "node:assert/strict";
import { hasOpenDebt, openDebts, weeksWithDebt } from "./bluejay-debt.ts";
import { REVENUE_VERSION, type RevenueBooking, type RevenueWeek } from "./bluejay-revenue.ts";

const b = (o: Partial<RevenueBooking> = {}): RevenueBooking => ({
  code: "001", ref: "123", source: "Agoda", channel: "Agoda", roomType: "Deluxe", room: "P - 101", status: "Đã trả phòng", bookDate: "2026-09-01", checkIn: "2026-09-20", checkOut: "2026-09-22",
  nights: 2, nightsInWeek: 2, roomPrice: 1000000, roomInWeek: 1000000, servicePrice: 0, totalPrice: 1000000, payment: 0, balance: 1000000, deposit: 0, stay: true, flags: [], ...o,
});
const week = (monday: string, fetchedAt: string, bookings: RevenueBooking[], extra: Partial<RevenueWeek> = {}): RevenueWeek => ({
  v: REVENUE_VERSION, monday, end: monday, fetchedAt, hotels: [{ id: 1, name: "H", bookings, services: [] }, { id: 2, name: "H2", bookings: [], services: [] }], ...extra,
});

test("only checked-out OTA stays with an open balance count as debt", () => {
  assert.equal(hasOpenDebt(b()), true);
  assert.equal(hasOpenDebt(b({ channel: "Khách lẻ" })), false);           // direct guests are not an OTA receivable
  assert.equal(hasOpenDebt(b({ status: "Đã nhận phòng" })), false);       // still in house: not due yet
  assert.equal(hasOpenDebt(b({ stay: false, status: "Đã huỷ" })), false);
  assert.equal(hasOpenDebt(b({ balance: 1 })), false);                    // rounding
  assert.equal(hasOpenDebt(b({ balance: 0, payment: 1000000 })), false);
});

test("the newest snapshot of a booking wins, so a refreshed payment clears the debt", () => {
  const stale = week("2026-09-14", "2026-10-01T00:00:00Z", [b()]);
  const paid = week("2026-09-21", "2026-10-10T00:00:00Z", [b({ payment: 1000000, balance: 0 })]);
  assert.equal(openDebts([stale, paid], "2026-10-17").length, 0);
  assert.equal(openDebts([paid, stale], "2026-10-17").length, 0);          // order of weeks does not matter
  const refreshed = week("2026-09-14", "2026-10-01T00:00:00Z", [b({ payment: 1000000, balance: 0 })], { paymentsAt: "2026-10-16T00:00:00Z" });
  const old = week("2026-09-21", "2026-10-10T00:00:00Z", [b()]);
  assert.equal(openDebts([refreshed, old], "2026-10-17").length, 0);       // paymentsAt counts as the snapshot time
});

test("rows carry the age of the debt, oldest first", () => {
  const rows = openDebts([week("2026-09-14", "2026-10-01T00:00:00Z", [b({ code: "A", checkOut: "2026-10-10" }), b({ code: "B", checkOut: "2026-09-22" })])], "2026-10-17");
  assert.deepEqual(rows.map((r) => [r.code, r.days, r.hotelId, r.hotel]), [["B", 25, 1, "H"], ["A", 7, 1, "H"]]);
});

test("weeksWithDebt lists only weeks and hotels that still owe, stalest first", () => {
  const w1 = week("2026-09-21", "2026-10-10T00:00:00Z", [b()]);
  const w2 = week("2026-09-14", "2026-10-01T00:00:00Z", [b()]);
  const w3 = week("2026-09-07", "2026-10-02T00:00:00Z", [b({ payment: 1000000, balance: 0 })]);
  const w4 = week("2026-08-31", "2026-10-03T00:00:00Z", [b()], { paymentsAt: "2026-10-16T00:00:00Z" });
  assert.deepEqual(weeksWithDebt([w1, w2, w3, w4]).map((w) => [w.monday, w.hotelIds]), [["2026-09-14", [1]], ["2026-09-21", [1]], ["2026-08-31", [1]]]);
});

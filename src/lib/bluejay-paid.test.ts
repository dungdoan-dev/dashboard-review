import test from "node:test";
import assert from "node:assert/strict";
import { paymentCheck } from "./bluejay-debt.ts";
import { REVENUE_VERSION, type RevenueBooking, type RevenueWeek } from "./bluejay-revenue.ts";

const b = (o: Partial<RevenueBooking> = {}): RevenueBooking => ({
  code: "001", ref: "123", source: "Agoda", channel: "Agoda", roomType: "Deluxe", room: "P - 101", status: "Đã trả phòng", bookDate: "2026-09-01", checkIn: "2026-09-20", checkOut: "2026-09-22",
  nights: 2, nightsInWeek: 2, roomPrice: 1000000, roomInWeek: 1000000, servicePrice: 0, totalPrice: 1000000, payment: 1000000, balance: 0, deposit: 0, stay: true, flags: [], ...o,
});
const week = (monday: string, fetchedAt: string, bookings: RevenueBooking[], extra: Partial<RevenueWeek> = {}): RevenueWeek => ({
  v: REVENUE_VERSION, monday, end: monday, fetchedAt, hotels: [{ id: 1, name: "H", bookings, services: [] }], ...extra,
});

test("only stays that checked out inside the period are checked; cancelled and in-house stays are not", () => {
  const r = paymentCheck([week("2026-09-14", "2026-10-01T00:00:00Z", [
    b({ code: "A", checkOut: "2026-09-22" }),
    b({ code: "B", checkOut: "2026-10-02" }),                       // after the period
    b({ code: "C", checkOut: "2026-08-30" }),                       // before the period
    b({ code: "D", status: "Đã nhận phòng", checkOut: "2026-09-23" }), // still in house
    b({ code: "E", stay: false, status: "Đã huỷ", checkOut: "2026-09-24", payment: 0, balance: 0, totalPrice: 0 }),
  ])], "2026-09-01", "2026-09-30", "2026-10-17");
  assert.deepEqual(r.rows.map((x) => x.code), ["A"]);
});

test("per channel: paid-in-full and still-owing bookings, and total = paid + balance", () => {
  const r = paymentCheck([week("2026-09-14", "2026-10-01T00:00:00Z", [
    b({ code: "A", channel: "Agoda", totalPrice: 1000000, payment: 1000000, balance: 0 }),
    b({ code: "B", channel: "Agoda", totalPrice: 2000000, payment: 500000, balance: 1500000 }),
    b({ code: "C", channel: "Khách lẻ", totalPrice: 800000, payment: 800000, balance: 0 }),
  ])], "2026-09-01", "2026-09-30", "2026-10-17");
  const agoda = r.channels.find((c) => c.name === "Agoda")!;
  assert.deepEqual([agoda.bookings, agoda.paidBookings, agoda.openBookings, agoda.total, agoda.paid, agoda.balance], [2, 1, 1, 3000000, 1500000, 1500000]);
  assert.equal(agoda.total, agoda.paid + agoda.balance);
  assert.equal(r.all.bookings, 3);
  assert.equal(r.all.paid, 2300000);
  assert.equal(r.channels[0].name, "Agoda");                         // OTAs first, then direct guests
});

test("the newest payment snapshot wins, so a refreshed week turns an open booking into a paid one", () => {
  const stale = week("2026-09-14", "2026-10-01T00:00:00Z", [b({ payment: 0, balance: 1000000 })]);
  const refreshed = week("2026-09-14", "2026-10-01T00:00:00Z", [b()], { paymentsAt: "2026-10-16T00:00:00Z" });
  assert.equal(paymentCheck([stale], "2026-09-01", "2026-09-30", "2026-10-17").all.openBookings, 1);
  assert.equal(paymentCheck([stale, refreshed], "2026-09-01", "2026-09-30", "2026-10-17").all.openBookings, 0);
  assert.equal(paymentCheck([refreshed, stale], "2026-09-01", "2026-09-30", "2026-10-17").all.paidBookings, 1);
});

test("a booking the revenue report flagged is counted for review", () => {
  const r = paymentCheck([week("2026-09-14", "2026-10-01T00:00:00Z", [b({ flags: ["overpaid"], payment: 1200000 }), b({ code: "B" })])], "2026-09-01", "2026-09-30", "2026-10-17");
  assert.equal(r.flagged, 1);
});

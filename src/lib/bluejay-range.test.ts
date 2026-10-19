import test from "node:test";
import assert from "node:assert/strict";
import { MAX_RANGE_DAYS, datesBetween, rangeData, rangeSummary } from "./bluejay-range.ts";
import { hotelRecord, summarize, type Reservation, type WeeklyReport } from "./bluejay-metrics.ts";
import { REVENUE_VERSION, revenueBookings, type RevenueWeek } from "./bluejay-revenue.ts";

const MONDAY = "2026-10-05"; // week 41: 5/10 .. 11/10
const res = (o: Reservation = {}): Reservation => ({
  bookingCode: "001", roomName: "R - 101", roomType: "Deluxe", source: "Khách lẻ", status: "Đã trả phòng", bookDate: "2026-10-01",
  checkInTime: "2026-10-05", checkOutTime: "2026-10-07", night: 2, roomPrice: 2000000, servicePrice: 0, totalPrice: 2000000, payment: 2000000, balance: 0, ...o,
});
const days = (monday: string, occupied: number[]) => occupied.map((o, i) => ({ date: new Date(Date.parse(`${monday}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10), occupied: o, total: 10 }));

// Two stored weeks for one hotel: week 41 (5/10) and week 42 (12/10). A booking runs 10/10 -> 14/10 across both.
const rows = [res(), res({ bookingCode: "002", roomName: "R - 102", checkInTime: "2026-10-10", checkOutTime: "2026-10-14", night: 4, roomPrice: 4000000 })];
const week = (monday: string, occupied: number[]): WeeklyReport => ({
  v: 3, monday, end: new Date(Date.parse(`${monday}T00:00:00Z`) + 6 * 864e5).toISOString().slice(0, 10), weekNo: 0, fetchedAt: "x",
  hotels: [hotelRecord({ id: 1, name: "H", weeks: [{ occ: occupied.reduce((a, b) => a + b, 0), total: 70 }, { occ: 0, total: 70 }, { occ: 0, total: 70 }], days: days(monday, occupied), reservations: rows, from: monday, to: new Date(Date.parse(`${monday}T00:00:00Z`) + 6 * 864e5).toISOString().slice(0, 10), services: { data: [] } })],
});
const revenue = (monday: string): RevenueWeek => {
  const end = new Date(Date.parse(`${monday}T00:00:00Z`) + 6 * 864e5).toISOString().slice(0, 10);
  return { v: REVENUE_VERSION, monday, end, fetchedAt: "x", hotels: [{ id: 1, name: "H", bookings: revenueBookings(rows, monday, end), services: [{ date: monday, total: 100, groups: [{ name: "Food", quantity: 1, total: 100, items: [] }] }] }] };
};
const w41 = week(MONDAY, [1, 2, 3, 4, 5, 6, 7]), w42 = week("2026-10-12", [7, 6, 5, 4, 3, 2, 1]);

test("a whole stored week gives the same numbers as the weekly report", () => {
  const data = rangeData([w41], [revenue(MONDAY)], MONDAY, "2026-10-11");
  const s = rangeSummary(data.hotels, data.dates.length);
  const weekly = summarize([w41.hotels[0]]);
  assert.equal(s.rate, weekly.rate);
  assert.equal(s.nights, weekly.nights);
  assert.equal(s.adr, weekly.adr);
  assert.equal(s.revpar, weekly.revpar);
  assert.equal(s.missingDays, 0);
});

test("any day range uses the stored days of the weeks it touches; a booking spanning two weeks is counted once per night", () => {
  const data = rangeData([w41, w42], [revenue(MONDAY), revenue("2026-10-12")], "2026-10-09", "2026-10-13");
  const s = rangeSummary(data.hotels, data.dates.length);
  assert.equal(s.occupied, 5 + 6 + 7 + 7 + 6); // 9,10,11 from week 41 and 12,13 from week 42
  assert.equal(s.total, 50);
  const long = data.hotels[0].bookings.find((b) => b.code === "002")!;
  assert.equal(long.nightsInWeek, 4); // 10,11,12,13 of the 4-night stay
  assert.equal(long.roomInWeek, 4000000);
  assert.deepEqual(data.hotels[0].services.map((d) => d.date), ["2026-10-12"]); // the 5/10 service day is outside the range
});

test("days of a week that is not stored are reported as missing, not as zero", () => {
  const data = rangeData([w41], [revenue(MONDAY)], "2026-10-09", "2026-10-13");
  assert.equal(data.hotels[0].days.filter(Boolean).length, 3);
  assert.equal(rangeSummary(data.hotels, data.dates.length).missingDays, 2);
  assert.deepEqual(data.weeks.map((w) => [w.monday, w.report]), [[MONDAY, true], ["2026-10-12", false]]);
});

test("range helpers", () => {
  assert.deepEqual(datesBetween("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.ok(MAX_RANGE_DAYS >= 62);
});

test("a booking stored in two weeks keeps the money of the newest snapshot, while its nights are added across the weeks", () => {
  const stay = (payment: number) => res({ bookingCode: "S1", checkInTime: "2026-10-11", checkOutTime: "2026-10-13", night: 2, roomPrice: 2000000, totalPrice: 2000000, payment, balance: 2000000 - payment });
  const stored = (monday: string, end: string, payment: number, fetchedAt: string): RevenueWeek => ({ v: REVENUE_VERSION, monday, end, fetchedAt, hotels: [{ id: 1, name: "H", bookings: revenueBookings([stay(payment)], monday, end), services: [] }] });
  const early = stored("2026-10-05", "2026-10-11", 2000000, "2026-10-18T00:00:00Z"); // refreshed last: paid in full
  const later = stored("2026-10-12", "2026-10-18", 500000, "2026-10-12T00:00:00Z"); // the later week, but an older snapshot
  const booking = rangeData([], [early, later], "2026-10-05", "2026-10-18").hotels[0].bookings.find((b) => b.code === "S1")!;
  assert.equal(booking.nightsInWeek, 2);
  assert.equal(booking.payment, 2000000);
  assert.equal(booking.balance, 0);
});

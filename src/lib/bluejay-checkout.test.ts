import test from "node:test";
import assert from "node:assert/strict";
import { checkoutRevenue } from "./bluejay-checkout.ts";
import type { RevenueBooking, RevenueWeek } from "./bluejay-revenue.ts";

const booking = (o: Partial<RevenueBooking>): RevenueBooking => ({
  code: "001", ref: "", source: "Booking.com", channel: "Booking", roomType: "Deluxe", room: "101", status: "Đã trả phòng", bookDate: "2026-08-01", checkIn: "2026-08-02", checkOut: "2026-08-05", nights: 3,
  nightsInWeek: 3, roomPrice: 900_000, roomInWeek: 900_000, servicePrice: 0, totalPrice: 900_000, payment: 900_000, balance: 0, deposit: 0, stay: true, flags: [], ...o,
});
const week = (monday: string, bookings: RevenueBooking[], more: Partial<RevenueWeek["hotels"][number]> = {}, fetchedAt = "2026-08-20T00:00:00Z"): RevenueWeek => ({
  v: 1, monday, end: monday, fetchedAt, hotels: [{ id: 5381, name: "Sontra Sea", bookings, services: [], ...more }],
});

test("a booking's whole room price and its service money land on the day it checks out", () => {
  // 3 nights 2, 3, 4 August: checks out Wed 5 August, stored in the week of 3 August
  const d = checkoutRevenue([week("2026-08-03", [booking({ servicePrice: 120_000 })])], "2026-08-01", "2026-08-06");
  const days = d.hotels[0].days;
  assert.deepEqual(days.map((x) => x.rooms), [0, 0, 0, 0, 3, 0]);
  assert.deepEqual(days.map((x) => x.room), [0, 0, 0, 0, 900_000, 0]);
  assert.deepEqual([days[4].service, days[4].total], [120_000, 1_020_000]);
});

test("cancelled stays and excluded rooms do not count; excluded rooms are kept apart; a booking stored in two weeks is counted once; days outside the range are left out", () => {
  const cancelled = booking({ code: "002", stay: false, status: "Hủy" });
  const mstd = booking({ code: "003", roomType: "M-Standard", roomPrice: 300_000, servicePrice: 50_000, nights: 3 });
  const later = booking({ code: "004", checkOut: "2026-08-20" });
  const w1 = week("2026-08-03", [booking({}), cancelled, later], { excluded: [mstd] });
  const w2 = week("2026-08-03", [booking({ payment: 5 })], {}, "2026-08-27T00:00:00Z"); // the same booking again, later pull
  const d = checkoutRevenue([w1, w2], "2026-08-02", "2026-08-06");
  const day = d.hotels[0].days[3]; // 5 August
  assert.deepEqual([day.rooms, day.room, day.total], [3, 900_000, 900_000]);
  assert.deepEqual([day.excludedRooms, day.excludedRoom, day.excludedService], [3, 300_000, 50_000]);
  assert.equal(d.hotels[0].days.reduce((s, x) => s + x.room, 0), 900_000);
});

test("the weeks that are not stored and the day up to which the data is complete are reported", () => {
  const d = checkoutRevenue([week("2026-08-03", [])], "2026-07-31", "2026-08-12");
  assert.deepEqual(d.missingWeeks, ["2026-07-27", "2026-08-10"]);
  assert.equal(d.reliableThrough, "2026-08-02"); // the day before the latest stored week starts
});

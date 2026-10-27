import test from "node:test";
import assert from "node:assert/strict";
import { channelCounts, channelKey } from "./ql-channels.ts";
import type { RevenueBooking, RevenueWeek } from "./bluejay-revenue.ts";

const booking = (o: Partial<RevenueBooking>): RevenueBooking => ({
  code: "001", ref: "", source: "Agoda", channel: "Agoda", roomType: "Deluxe", room: "101", status: "Đã trả phòng", bookDate: "2026-10-06", checkIn: "2026-10-10", checkOut: "2026-10-12", nights: 2,
  nightsInWeek: 2, roomPrice: 900_000, roomInWeek: 900_000, servicePrice: 0, totalPrice: 900_000, payment: 900_000, balance: 0, deposit: 0, stay: true, flags: [], ...o,
});
const week = (monday: string, bookings: RevenueBooking[], excluded: RevenueBooking[] = [], fetchedAt = "2026-10-20T00:00:00Z"): RevenueWeek => ({ v: 1, monday, end: monday, fetchedAt, hotels: [{ id: 5381, name: "Sontra Sea", bookings, services: [], excluded }] });

test("a source goes to its OTA column by name, to a direct channel by what Blue Jay calls it, anything else to Khác", () => {
  assert.deepEqual(["Booking.com", "Traveloka.com", "Ctrip", "Agoda", "Expedia"].map((s) => channelKey(s).key), ["Booking", "Traveloka", "Trip", "Agoda", "Expedia"]);
  assert.deepEqual(["Walking", "Phone", "Zalo", "Facebook", "BE", "CSKH CŨ"].map((s) => channelKey(s)), [{ group: "otp", key: "Walking" }, { group: "otp", key: "Điện thoại" }, { group: "otp", key: "Zalo" }, { group: "otp", key: "Facebook" }, { group: "otp", key: "BE" }, { group: "otp", key: "Khác" }]);
});

test("bookings are counted in the week of their booking date, cancelled and no-show ones as cancellations, each booking once, the whole month in the last column", () => {
  const w1 = week("2026-10-05", [booking({}), booking({ code: "002", room: "102", stay: false, status: "Đã huỷ" }), booking({ code: "003", source: "Zalo", channel: "Zalo", bookDate: "2026-10-13" })], [booking({ code: "004", source: "Booking.com", channel: "Booking", roomType: "M-Standard" })]);
  const w2 = week("2026-10-12", [booking({ stay: false, status: "Không đến" })], [], "2026-10-27T00:00:00Z"); // 001 again, a later snapshot: now a no-show
  const c = channelCounts([w1, w2], 5381, "2026-10");
  assert.deepEqual(c.weeks.map((w) => w.label), ["Tuần 40", "Tuần 41", "Tuần 42", "Tuần 43", "Tuần 44", "Cả kỳ"]);
  assert.deepEqual(c.weeks[1].counts, { Agoda: { book: 0, cancel: 2 }, Booking: { book: 1, cancel: 0 } }); // 5-11 Oct: 001 (now a no-show), 002 (cancelled), 004 (M-Standard, kept)
  assert.deepEqual(c.weeks[2].counts, { Zalo: { book: 1, cancel: 0 } });
  assert.deepEqual(c.weeks[5].counts, { Agoda: { book: 0, cancel: 2 }, Booking: { book: 1, cancel: 0 }, Zalo: { book: 1, cancel: 0 } });
  assert.deepEqual([c.ota, c.otp], [["Agoda", "Booking", "Expedia", "Traveloka", "Trip"], ["Walking", "Zalo"]]); // the OTA columns are always there, the direct ones only when used (Walking is always)
  assert.deepEqual(channelCounts([w1], 9999, "2026-10").weeks[5].counts, {}); // another hotel: nothing
});

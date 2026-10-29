import test from "node:test";
import assert from "node:assert/strict";
import { dailyRevenue } from "./bluejay-daily.ts";
import type { RevenueBooking, RevenueWeek } from "./bluejay-revenue.ts";

const booking = (o: Partial<RevenueBooking>): RevenueBooking => ({
  code: "001", ref: "", source: "Booking.com", channel: "Booking", roomType: "Deluxe", room: "101", status: "Đã trả phòng", bookDate: "2026-08-01", checkIn: "2026-08-02", checkOut: "2026-08-05", nights: 3,
  nightsInWeek: 3, roomPrice: 900_000, roomInWeek: 900_000, servicePrice: 0, totalPrice: 900_000, payment: 900_000, balance: 0, deposit: 0, stay: true, flags: [], ...o,
});
const week = (monday: string, bookings: RevenueBooking[], more: Partial<RevenueWeek["hotels"][number]> = {}, fetchedAt = "2026-08-20T00:00:00Z"): RevenueWeek => ({
  v: 1, monday, end: monday, fetchedAt, hotels: [{ id: 5381, name: "Sontra Sea", bookings, services: [], ...more }],
});

test("a stay's room money is split evenly over its nights, whatever week it checks out in", () => {
  // 3 nights 2, 3, 4 August (Sun, Mon, Tue): checks out Wed 5 Aug, stored in the week of 3 August
  const d = dailyRevenue([week("2026-08-03", [booking({})])], "2026-08-01", "2026-08-06");
  const days = d.hotels[0].days;
  assert.deepEqual(days.map((x) => x.rooms), [0, 1, 1, 1, 0, 0]);
  assert.deepEqual(days.map((x) => x.room), [0, 300_000, 300_000, 300_000, 0, 0]);
  assert.equal(days[1].total, 300_000);
});

test("cancelled stays and excluded rooms do not count; excluded rooms are kept apart; a booking stored in two weeks is counted once", () => {
  const cancelled = booking({ code: "002", stay: false, status: "Hủy" });
  const mstd = booking({ code: "003", roomType: "M-Standard", roomPrice: 300_000, nights: 3 });
  const w1 = week("2026-08-03", [booking({}), cancelled], { excluded: [mstd] });
  const w2 = week("2026-08-10", [booking({ payment: 5 })], {}, "2026-08-27T00:00:00Z"); // the same booking again (an older snapshot style), later pull
  const d = dailyRevenue([w1, w2], "2026-08-02", "2026-08-04");
  assert.deepEqual(d.hotels[0].days.map((x) => x.rooms), [1, 1, 1]);
  assert.equal(d.hotels[0].days[0].room, 300_000);
  assert.deepEqual([d.hotels[0].days[0].excludedRooms, d.hotels[0].days[0].excludedRoom], [1, 100_000]);
});

test("services are added by day and group, the groups come biggest first, the weeks and the reliable day are reported", () => {
  const services = [
    { date: "2026-08-03", total: 150_000, groups: [{ name: "Minibar", quantity: 1, total: 50_000, items: [] }, { name: "Dịch vụ khác", quantity: 1, total: 100_000, items: [] }] },
    { date: "2026-08-04", total: 20_000, groups: [{ name: "Minibar", quantity: 1, total: 20_000, items: [] }] },
  ];
  const d = dailyRevenue([week("2026-08-03", [], { services })], "2026-07-31", "2026-08-12");
  assert.deepEqual(d.groups, ["Dịch vụ khác", "Minibar"]);
  const day = d.hotels[0].days.find((x) => x.date === "2026-08-03")!;
  assert.deepEqual([day.services["Minibar"], day.service, day.total], [50_000, 150_000, 150_000]);
  assert.deepEqual(d.missingWeeks, ["2026-07-27", "2026-08-10"]); // weeks of the range that are not stored
  assert.equal(d.reliableThrough, "2026-08-02"); // the day before the latest stored week starts: later nights may belong to stays that have not checked out
});

test("the OTA commission of a day is the room money of its nights times the channel's rate (Traveloka per hotel), nothing for walk-ins and excluded rooms", () => {
  const stays = [booking({}), booking({ code: "004", channel: "Agoda", roomPrice: 300_000, nights: 3 }), booking({ code: "005", channel: "Khách lẻ", roomPrice: 300_000, nights: 3 }), booking({ code: "006", channel: "Traveloka", roomPrice: 300_000, nights: 3 })];
  const day = (id: number) => dailyRevenue([{ ...week("2026-08-03", stays), hotels: [{ id, name: "H", bookings: stays, services: [] }] }], "2026-08-02", "2026-08-02").hotels[0].days[0];
  // one night of: Booking 300.000 x 15%, Agoda 100.000 x 20%, walk-in 100.000 x 0, Traveloka 100.000 x 20% (Sontra) or 19% (Quy Nhơn)
  assert.equal(Math.round(day(5381).commission), 45_000 + 20_000 + 20_000);
  assert.equal(Math.round(day(6495).commission), 45_000 + 20_000 + 19_000);
});

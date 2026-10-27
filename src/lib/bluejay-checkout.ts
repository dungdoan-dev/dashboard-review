// Revenue per day of check-out, built only from the revenue weeks already stored (no call to Blue Jay). Pure functions: tested by bluejay-checkout.test.ts.
// Same rule as the finance team and the weekly revenue report: a booking's whole room price and its service money belong to the day it checks out.
// M-Standard and Unassigned rooms are left out of the totals, as in every other report, and kept apart in "excluded".
// Imports use ".ts" because tests run this with plain Node.
import { addDays, mondayOf } from "./bluejay-metrics.ts";
import type { HotelRevenue, RevenueBooking, RevenueWeek } from "./bluejay-revenue.ts";

export type CheckoutDay = {
  date: string;
  rooms: number;                      // nights of the stays that check out this day
  room: number;                       // their room money (whole stay)
  service: number;                    // service money of those bookings
  total: number;                      // room + service
  excludedRooms: number; excludedRoom: number; excludedService: number; // M-Standard / Unassigned stays: not in the totals
};
export type CheckoutHotel = { id: number; name: string; days: CheckoutDay[] };
export type CheckoutRevenue = {
  from: string; to: string;
  hotels: CheckoutHotel[];
  reliableThrough: string;            // days after this one may be missing stays that have not checked out yet: a week is stored when it is pulled
  missingWeeks: string[];             // Mondays of the range with no stored revenue week
};

const datesBetween = (from: string, to: string) => { const dates: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d); return dates; };

/** One record per booking over all stored weeks (the latest snapshot wins), summed on its check-out day when that is inside from..to. */
function byCheckout(weeks: { week: RevenueWeek; hotel: HotelRevenue }[], pick: (h: HotelRevenue) => RevenueBooking[], from: string, to: string) {
  const latest = new Map<string, { b: RevenueBooking; at: string }>();
  for (const { week, hotel } of weeks) for (const b of pick(hotel)) {
    const key = `${b.code}|${b.room}|${b.roomType}`, at = week.paymentsAt ?? week.fetchedAt;
    if (!latest.has(key) || at > latest.get(key)!.at) latest.set(key, { b, at });
  }
  const byDay = new Map<string, { nights: number; room: number; service: number }>();
  for (const { b } of latest.values()) {
    if (!b.stay || b.nights <= 0 || b.checkOut < from || b.checkOut > to) continue;
    const day = byDay.get(b.checkOut) ?? { nights: 0, room: 0, service: 0 };
    day.nights += b.nights; day.room += b.roomPrice; day.service += b.servicePrice; byDay.set(b.checkOut, day);
  }
  return byDay;
}

/** revenues: the stored weeks from the Monday of `from` to the Monday of `to` (a booking is stored in the week it checks out). */
export function checkoutRevenue(revenues: RevenueWeek[], from: string, to: string): CheckoutRevenue {
  const dates = datesBetween(from, to);
  const have = new Set(revenues.map((w) => w.monday));
  const missingWeeks: string[] = [];
  for (let m = mondayOf(from); m <= to; m = addDays(m, 7)) if (!have.has(m)) missingWeeks.push(m);
  const latestMonday = revenues.reduce((m, w) => (w.monday > m ? w.monday : m), "");

  const names = new Map<number, string>();
  for (const w of revenues) for (const h of w.hotels) names.set(h.id, h.name);
  const hotels = [...names].map(([id, name]): CheckoutHotel => {
    const weeks = revenues.flatMap((week) => { const hotel = week.hotels.find((h) => h.id === id); return hotel ? [{ week, hotel }] : []; });
    const stays = byCheckout(weeks, (h) => h.bookings, from, to), excluded = byCheckout(weeks, (h) => h.excluded ?? [], from, to);
    const days = dates.map((date): CheckoutDay => {
      const r = stays.get(date) ?? { nights: 0, room: 0, service: 0 }, x = excluded.get(date) ?? { nights: 0, room: 0, service: 0 };
      return { date, rooms: r.nights, room: r.room, service: r.service, total: r.room + r.service, excludedRooms: x.nights, excludedRoom: x.room, excludedService: x.service };
    });
    return { id, name, days };
  });
  return { from, to, hotels, reliableThrough: latestMonday ? addDays(latestMonday, -1) : "", missingWeeks };
}

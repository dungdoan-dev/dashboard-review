// Revenue per day of stay, built only from the revenue weeks already stored (no call to Blue Jay). Pure functions: tested by bluejay-daily.test.ts.
// Room money: each booking's room price is split evenly over its nights (the rule of the weekly operations report), so a night adds to the day it is slept on, whatever week the guest checks out in.
// Service money: the stored daily totals by service group. M-Standard and Unassigned rooms are left out of the totals, as in every other report, and kept apart in "excluded".
// Imports use ".ts" because tests run this with plain Node.
import { addDays, mondayOf } from "./bluejay-metrics.ts";
import type { HotelRevenue, RevenueBooking, RevenueWeek } from "./bluejay-revenue.ts";
import { otaSplit } from "./ota-commission.ts";

export type DailyDay = {
  date: string;
  rooms: number;                      // room-nights slept this day
  room: number;                       // room money of those nights
  roomGross: number;                  // the room money at the displayed price: the OTAs that send a net price (Expedia, Trip, Agoda) grossed up
  commission: number;                 // what the OTAs keep of it (ota-commission.ts)
  services: Record<string, number>;   // service money by Blue Jay group
  service: number;
  total: number;                      // room + service
  excludedRooms: number; excludedRoom: number; // M-Standard / Unassigned nights and their room money: not in the totals
};
export type DailyHotel = { id: number; name: string; days: DailyDay[] };
export type DailyRevenue = {
  from: string; to: string;
  groups: string[];                   // service groups found, biggest first
  hotels: DailyHotel[];
  reliableThrough: string;            // days after this one may be missing stays that have not checked out yet: a week is stored when it is pulled, with the stays that check out in it
  missingWeeks: string[];             // Mondays of the range with no stored revenue week
};

const datesBetween = (from: string, to: string) => { const dates: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d); return dates; };

/** One record per booking over all stored weeks (the latest snapshot wins), its room money split over its nights, for the nights inside from..to. */
function roomByDay(hotelId: number, weeks: { week: RevenueWeek; hotel: HotelRevenue }[], pick: (h: HotelRevenue) => RevenueBooking[], from: string, to: string) {
  const latest = new Map<string, { b: RevenueBooking; at: string }>();
  for (const { week, hotel } of weeks) for (const b of pick(hotel)) {
    const key = `${b.code}|${b.room}|${b.roomType}`, at = week.paymentsAt ?? week.fetchedAt;
    if (!latest.has(key) || at > latest.get(key)!.at) latest.set(key, { b, at });
  }
  const byDay = new Map<string, { nights: number; money: number; gross: number; commission: number }>();
  for (const { b } of latest.values()) {
    if (!b.stay || b.nights <= 0 || !b.checkIn) continue;
    const perNight = b.roomPrice / b.nights, split = otaSplit(b.channel, hotelId, perNight);
    for (let i = 0; i < b.nights; i++) {
      const date = addDays(b.checkIn, i);
      if (date < from || date > to) continue;
      const day = byDay.get(date) ?? { nights: 0, money: 0, gross: 0, commission: 0 };
      day.nights += 1; day.money += perNight; day.gross += split.gross; day.commission += split.commission; byDay.set(date, day);
    }
  }
  return byDay;
}

/** revenues: every stored week from the Monday of `from` to some weeks after `to` (a stay that ends after the range still has nights inside it). */
export function dailyRevenue(revenues: RevenueWeek[], from: string, to: string): DailyRevenue {
  const dates = datesBetween(from, to);
  const have = new Set(revenues.map((w) => w.monday));
  const missingWeeks: string[] = [];
  for (let m = mondayOf(from); m <= to; m = addDays(m, 7)) if (!have.has(m)) missingWeeks.push(m);
  const latestMonday = revenues.reduce((m, w) => (w.monday > m ? w.monday : m), "");

  const names = new Map<number, string>();
  for (const w of revenues) for (const h of w.hotels) names.set(h.id, h.name);
  const groupTotal = new Map<string, number>();
  const hotels = [...names].map(([id, name]): DailyHotel => {
    const weeks = revenues.flatMap((week) => { const hotel = week.hotels.find((h) => h.id === id); return hotel ? [{ week, hotel }] : []; });
    const rooms = roomByDay(id, weeks, (h) => h.bookings, from, to), excluded = roomByDay(id, weeks, (h) => h.excluded ?? [], from, to);
    const serviceOf = new Map<string, { at: string; groups: Record<string, number> }>(); // a day is stored once per week; if two weeks hold it, the latest pull wins
    for (const { week, hotel } of weeks) for (const d of hotel.services) {
      if (d.date < from || d.date > to) continue;
      const at = week.paymentsAt ?? week.fetchedAt;
      if (serviceOf.has(d.date) && serviceOf.get(d.date)!.at >= at) continue;
      serviceOf.set(d.date, { at, groups: Object.fromEntries(d.groups.map((g) => [g.name, g.total])) });
    }
    const days = dates.map((date): DailyDay => {
      const r = rooms.get(date) ?? { nights: 0, money: 0, gross: 0, commission: 0 }, x = excluded.get(date) ?? { nights: 0, money: 0, gross: 0, commission: 0 };
      const services = serviceOf.get(date)?.groups ?? {};
      const service = Object.values(services).reduce((s, v) => s + v, 0);
      for (const [g, v] of Object.entries(services)) groupTotal.set(g, (groupTotal.get(g) ?? 0) + v);
      return { date, rooms: r.nights, room: r.money, roomGross: r.gross, commission: r.commission, services, service, total: r.money + service, excludedRooms: x.nights, excludedRoom: x.money };
    });
    return { id, name, days };
  });
  return { from, to, groups: [...groupTotal].sort((a, b) => b[1] - a[1]).map(([g]) => g), hotels, reliableThrough: latestMonday ? addDays(latestMonday, -1) : "", missingWeeks };
}

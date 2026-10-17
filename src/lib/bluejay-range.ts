// Report for any date range, built only from the weekly snapshots already stored (no call to Blue Jay).
// Occupancy: the stored day of the week that contains it. Room revenue and nights: each booking's nights inside the range,
// counted once per week window so a booking that spans two weeks is not counted twice. Service revenue: the stored daily totals.
// Imports use ".ts" because tests run this with plain Node.
import { addDays, mondayOf, nightsIn, rate, type Day, type WeeklyReport } from "./bluejay-metrics.ts";
import type { RevenueBooking, RevenueWeek, ServiceDay } from "./bluejay-revenue.ts";

export const MAX_RANGE_DAYS = 366;

export type RangeHotel = {
  id: number; name: string;
  days: (Day | null)[];           // aligned with RangeData.dates; null = that week is not stored
  bookings: RevenueBooking[];     // nights / room money inside the range (nightsInWeek, roomInWeek hold the in-range values)
  services: ServiceDay[];         // stored daily service totals that fall inside the range
};
export type RangeData = {
  from: string; to: string; dates: string[];
  weeks: { monday: string; report: boolean; revenue: boolean }[];
  hotels: RangeHotel[];
};

export const datesBetween = (from: string, to: string) => {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return dates;
};

export function rangeData(reports: WeeklyReport[], revenues: RevenueWeek[], from: string, to: string): RangeData {
  const dates = datesBetween(from, to);
  const reportOf = new Map(reports.map((r) => [r.monday, r]));
  const revenueOf = new Map(revenues.map((r) => [r.monday, r]));
  const weeks: RangeData["weeks"] = [];
  for (let m = mondayOf(from); m <= to; m = addDays(m, 7)) weeks.push({ monday: m, report: reportOf.has(m), revenue: revenueOf.has(m) });

  const names = new Map<number, string>();
  for (const w of [...reports, ...revenues]) for (const h of w.hotels) names.set(h.id, h.name);

  const hotels = [...names].map(([id, name]): RangeHotel => {
    const days = dates.map((date) => reportOf.get(mondayOf(date))?.hotels.find((h) => h.id === id)?.days.find((d) => d.date === date) ?? null);

    const merged = new Map<string, RevenueBooking>();
    const services: ServiceDay[] = [];
    for (const week of revenues) {
      const hotel = week.hotels.find((h) => h.id === id);
      if (!hotel) continue;
      const lo = from > week.monday ? from : week.monday, hi = to < week.end ? to : week.end;
      for (const b of hotel.bookings) {
        const nights = lo <= hi ? nightsIn({ checkInTime: b.checkIn, checkOutTime: b.checkOut }, lo, hi) : 0;
        if (nights <= 0) continue;
        const room = b.stay && b.nights > 0 ? (b.roomPrice / b.nights) * nights : 0;
        const key = `${b.code}|${b.room}|${b.roomType}`;
        const seen = merged.get(key);
        if (seen) { seen.nightsInWeek += nights; seen.roomInWeek += room; } // same booking in the next week: add its nights
        else merged.set(key, { ...b, nightsInWeek: nights, roomInWeek: room });
      }
      for (const d of hotel.services) if (d.date >= from && d.date <= to) services.push(d);
    }
    return { id, name, days, bookings: [...merged.values()], services: services.sort((a, b) => a.date.localeCompare(b.date)) };
  });
  return { from, to, dates, weeks, hotels };
}

/** One hotel or several combined; rates are weighted by room-nights, never averaged. */
export function rangeSummary(hotels: RangeHotel[], dateCount: number) {
  let occupied = 0, total = 0, covered = 0, bookedNights = 0, room = 0;
  for (const h of hotels) {
    for (const d of h.days) if (d) { occupied += d.occupied; total += d.total; covered++; }
    for (const b of h.bookings) if (b.stay) { bookedNights += b.nightsInWeek; room += b.roomInWeek; }
  }
  const adr = bookedNights ? room / bookedNights : 0; // nights below = occupied room-nights from the occupancy report, like the weekly report
  const r = rate({ occ: occupied, total });
  return { occupied, total, rate: r, nights: occupied, room, adr, revpar: r * adr, missingDays: Math.max(0, dateCount * hotels.length - covered) };
}

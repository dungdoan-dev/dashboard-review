// Report for any date range, built only from the weekly snapshots already stored (no call to Blue Jay).
// Occupancy: the stored day of the week that contains it. Room revenue and nights: the stays that check out inside the range, whole (older weeks: each booking's nights inside the range,
// counted once per week window so a booking that spans two weeks is not counted twice). Service revenue: the stored daily totals.
// Imports use ".ts" because tests run this with plain Node.
import { addDays, mondayOf, nightsIn, rate, type Day, type WeeklyReport } from "./bluejay-metrics.ts";
import { latestStays, type RevenueBooking, type RevenueWeek, type ServiceDay } from "./bluejay-revenue.ts";

export const MAX_RANGE_DAYS = 366;

export type RangeHotel = {
  id: number; name: string;
  days: (Day | null)[];           // aligned with RangeData.dates; null = that week is not stored
  excludedService?: number;       // same for the service money kept on those bookings
  excludedRoom?: number;          // room money of M-Standard / Unassigned bookings checked out inside the range; undefined when a stored week predates that data
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
    const stamp = new Map<string, string>(); // when the snapshot behind each merged booking was pulled
    const services: ServiceDay[] = [];
    let excludedRoom: number | undefined = 0, excludedService = 0;
    const whole: { b: RevenueBooking; at: string }[] = [], wholeExcluded: { b: RevenueBooking; at: string }[] = []; // snapshots of the check-out weeks, merged below
    for (const week of revenues) {
      const hotel = week.hotels.find((h) => h.id === id);
      if (!hotel) continue;
      const lo = from > week.monday ? from : week.monday, hi = to < week.end ? to : week.end;
      const pulled = week.paymentsAt ?? week.fetchedAt;
      if (!hotel.excluded) excludedRoom = undefined;
      else for (const b of hotel.excluded) wholeExcluded.push({ b, at: pulled });
      for (const d of hotel.services) if (d.date >= from && d.date <= to) services.push(d);
      // Newer weeks hold the stays that check out in the week, whole: a stay whose check-out moved to another week sits in both, so they go through latestStays (newest pull wins) instead of being added up.
      if (hotel.basis === "checkout") { for (const b of hotel.bookings) whole.push({ b, at: pulled }); continue; }
      for (const b of hotel.bookings) { // older weeks hold the stays with nights in the week
        const nights = lo <= hi ? nightsIn({ checkInTime: b.checkIn, checkOutTime: b.checkOut }, lo, hi) : 0;
        if (nights <= 0) continue;
        const room = b.stay && b.nights > 0 ? (b.roomPrice / b.nights) * nights : 0;
        const key = `${b.code}|${b.room}|${b.roomType}`;
        const seen = merged.get(key);
        if (seen) {
          seen.nightsInWeek += nights; seen.roomInWeek += room; // same booking in the next week: add its nights
          if (pulled > (stamp.get(key) ?? "")) { Object.assign(seen, { status: b.status, payment: b.payment, balance: b.balance, totalPrice: b.totalPrice, servicePrice: b.servicePrice, deposit: b.deposit, flags: b.flags }); stamp.set(key, pulled); } // the newest snapshot has the money
        } else { merged.set(key, { ...b, nightsInWeek: nights, roomInWeek: room }); stamp.set(key, pulled); }
      }
    }
    const inRange = (b: RevenueBooking) => b.checkOut >= from && b.checkOut <= to;
    for (const { b } of latestStays(whole)) {
      if (!inRange(b)) continue;
      const key = `${b.code}|${b.room}|${b.roomType}|${b.checkIn}`; // a booking that comes back to the same room is a second stay, with its own money
      merged.set(key, { ...b, nightsInWeek: b.nights, roomInWeek: b.stay && b.nights > 0 ? b.roomPrice : 0 });
    }
    if (excludedRoom !== undefined) for (const { b } of latestStays(wholeExcluded)) if (b.stay && b.nights > 0 && inRange(b)) { excludedRoom += b.roomPrice; excludedService += b.servicePrice; }
    return { id, name, days, excludedRoom, excludedService, bookings: [...merged.values()], services: services.sort((a, b) => a.date.localeCompare(b.date)) };
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
  // RevPAR = room money / room-nights for sale (not rate × ADR: the room money is by check-out day, the occupancy by night slept).
  return { occupied, total, rate: r, nights: occupied, room, adr, revpar: total ? room / total : 0, missingDays: Math.max(0, dateCount * hotels.length - covered) };
}

/** The stored weekly report with its room money and nights by check-out day (the stays that check out in the week, whole), like the revenue reports and the range view, so ADR and RevPAR mean the same everywhere. A week whose revenue was stored by nights keeps its own figures. */
export function checkoutWeek(report: WeeklyReport, revenue: RevenueWeek | undefined): WeeklyReport {
  if (!revenue) return report;
  return {
    ...report, hotels: report.hotels.map((h) => {
      const stored = revenue.hotels.find((x) => x.id === h.id);
      if (stored?.basis !== "checkout") return h;
      const stays = stored.bookings.filter((b) => b.stay && b.nights > 0 && b.checkOut >= revenue.monday && b.checkOut <= revenue.end);
      const room = stays.reduce((s, b) => s + b.roomPrice, 0);
      return { ...h, roomSum: room, nightSum: stays.reduce((s, b) => s + b.nights, 0), stats: { ...h.stats, roomPrice: room } };
    }),
  };
}

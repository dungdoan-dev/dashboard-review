// The accountant's "BÁO CÁO TỔNG HỢP <khách sạn>" (one row per week: nights, rooms for sale, occupancy, revenue by line, deductions, total) for every hotel side by side, then the same for the whole chain.
// Nights and rooms for sale come from the occupancy report (the day of the stored week), room money and services from the daily revenue by check-out day (a stay's whole room money on the day it checks out, services of the stays that check out that day, split over the groups as sold).
// Room revenue is at the displayed price and the deduction is the OTA commission, by the finance team's policy (ota-commission.ts): Blue Jay holds a net price for Expedia, Trip and Agoda, so their room money is grossed up here.
// Pure function: tested by hotel-compare.test.ts. Imports use ".ts" because tests run this with plain Node.
import type { DailyRevenue } from "./bluejay-daily.ts";
import type { RangeData } from "./bluejay-range.ts";
import { addDays, mondayOf } from "./bluejay-metrics.ts";
import { weekColumns } from "./finance-summary.ts";
import { revenueLines } from "./pnl.ts";

export type CompareRow = {
  key: string; week: string; hotel: string; chain: boolean; // chain: the sum of the hotels of that week
  rooms: number; available: number; occ: number | null;     // nights slept, rooms for sale (nights), occupancy
  room: number; minibar: number; outside: number; laundry: number; other: number; // revenue lines of the sheet
  deduction: number;                                         // OTA commission on the room money (negative)
  total: number;                                             // the five revenue lines + the deduction
  missingDays: number;                                       // days of the period without a stored occupancy day
};

const monthEnd = (month: string) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

/** daily and range must cover the whole weeks of the month: from compareSpan(month). */
export function compareSpan(month: string) { return { from: mondayOf(`${month}-01`), to: addDays(mondayOf(monthEnd(month)), 6) }; }

/** Blue Jay gives the service groups only by the day sold, and the service money of a booking only as one figure. On check-out day the total is the bookings' and it is split over the groups in the proportion sold in the same period ("Thu khác" when nothing was sold in it). */
export const onCheckout = (sold: Record<string, number>, total: number): Record<string, number> => {
  const all = Object.values(sold).reduce((s, v) => s + v, 0);
  if (!total) return {};
  if (all <= 0) return { "Thu khác": total };
  const parts = Object.entries(sold).map(([g, v]) => [g, Math.round((total * v) / all)] as [string, number]);
  parts[parts.reduce((m, p, i) => (p[1] > parts[m][1] ? i : m), 0)][1] += Math.round(total) - parts.reduce((s, p) => s + p[1], 0); // the rounding cent goes to the biggest group, so the lines add up to the total
  return Object.fromEntries(parts);
};

export function compareRows(month: string, daily: DailyRevenue, range: RangeData): CompareRow[] {
  // A week is the whole Monday-Sunday (the same week as the operations report, so a week split by two months shows in full in both); only "Cả tháng" is cut at the month's ends.
  const columns = weekColumns({ from: `${month}-01`, to: monthEnd(month) }).map((c) => (c.label === "Cả kỳ" ? c : { ...c, from: mondayOf(c.from), to: addDays(mondayOf(c.from), 6) }));
  const rows: CompareRow[] = [];
  for (const c of columns) {
    const week = c.label === "Cả kỳ" ? "Cả tháng" : c.label;
    const mine = daily.hotels.map((h): CompareRow => {
      const days = h.days.filter((d) => d.date >= c.from && d.date <= c.to);
      const services: Record<string, number> = {};
      for (const d of days) for (const [g, v] of Object.entries(d.services)) services[g] = (services[g] ?? 0) + v;
      const lines = revenueLines({ room: days.reduce((s, d) => s + d.roomGross, 0), services: daily.serviceOnCheckout ? onCheckout(services, days.reduce((s, d) => s + d.checkoutService, 0)) : services });
      const stored = (range.hotels.find((x) => x.id === h.id)?.days ?? []).filter((d, i) => d && range.dates[i] >= c.from && range.dates[i] <= c.to);
      const occupied = stored.reduce((s, d) => s + d!.occupied, 0), available = stored.reduce((s, d) => s + d!.total, 0);
      const commission = days.reduce((s, d) => s + d.commission, 0), dayCount = Math.round((Date.parse(c.to) - Date.parse(c.from)) / 864e5) + 1;
      const row = { key: `${week}|${h.id}`, week, hotel: h.name, chain: false, rooms: occupied, available, occ: available ? occupied / available : null, room: Math.round(lines["Tiền phòng"]), minibar: Math.round(lines["Minibar"]), outside: Math.round(lines["Dịch vụ ngoài"]), laundry: Math.round(lines["Giặt ủi"]), other: Math.round(lines["Thu khác"]), deduction: 0 - Math.round(commission), total: 0, missingDays: dayCount - stored.length };
      row.total = row.room + row.minibar + row.outside + row.laundry + row.other + row.deduction;
      return row;
    });
    rows.push(...mine);
    if (mine.length > 1) {
      const sum = (f: (r: CompareRow) => number) => mine.reduce((s, r) => s + f(r), 0);
      const available = sum((r) => r.available), rooms = sum((r) => r.rooms);
      rows.push({ key: `${week}|chain`, week, hotel: "Toàn chuỗi", chain: true, rooms, available, occ: available ? rooms / available : null, room: sum((r) => r.room), minibar: sum((r) => r.minibar), outside: sum((r) => r.outside), laundry: sum((r) => r.laundry), other: sum((r) => r.other),
        deduction: sum((r) => r.deduction), total: sum((r) => r.total), missingDays: sum((r) => r.missingDays) });
    }
  }
  return rows;
}

// OTA receivables and the paid / unpaid check: checked-out stays and what has been paid on them. Pure functions: tested by bluejay-debt.test.ts and bluejay-paid.test.ts.
// A stored week is pulled once and OTAs pay weeks after the stay, so the same booking can sit in several weeks with different payment
// snapshots; the snapshot pulled (or payment-refreshed) last is the one that is right.
// Imports use ".ts" because bluejay.ts runs with plain Node.
import { OTA_CHANNELS, type RevenueBooking, type RevenueWeek } from "./bluejay-revenue.ts";

const TOLERANCE = 1; // VND, same as the revenue report
const DAY = 86_400_000;

const checkedOut = (b: RevenueBooking) => b.stay && /trả phòng/i.test(b.status);
export const hasOpenDebt = (b: RevenueBooking) => checkedOut(b) && OTA_CHANNELS.includes(b.channel) && b.balance > TOLERANCE;
const asOf = (w: RevenueWeek) => w.paymentsAt ?? w.fetchedAt;

export type DebtRow = RevenueBooking & { hotelId: number; hotel: string; asOf: string; days: number };

/** One row per booking (the newest snapshot wins), whatever its payment state. days = days since check-out, as of today (yyyy-mm-dd). */
export function latestBookings(weeks: RevenueWeek[], today: string): DebtRow[] {
  const newest = new Map<string, DebtRow>();
  for (const week of weeks) for (const hotel of week.hotels) for (const b of hotel.bookings) {
    const key = `${hotel.id}|${b.code}|${b.room}|${b.roomType}`;
    const seen = newest.get(key);
    if (seen && seen.asOf > asOf(week)) continue;
    newest.set(key, { ...b, hotelId: hotel.id, hotel: hotel.name, asOf: asOf(week), days: Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${b.checkOut}T00:00:00Z`)) / DAY)) });
  }
  return [...newest.values()];
}

/** Open OTA debts, one row per booking, oldest first. */
export const openDebts = (weeks: RevenueWeek[], today: string): DebtRow[] =>
  latestBookings(weeks, today).filter(hasOpenDebt).sort((a, b) => b.days - a.days || b.balance - a.balance);

/** Weeks (and the hotels in them) worth re-pulling: they still show an open OTA debt. Stalest first, so every week gets its turn. */
export function weeksWithDebt(weeks: RevenueWeek[]) {
  return weeks
    .map((w) => ({ monday: w.monday, end: w.end, asOf: asOf(w), hotelIds: w.hotels.filter((h) => h.bookings.some(hasOpenDebt)).map((h) => h.id) }))
    .filter((w) => w.hotelIds.length)
    .sort((a, b) => a.asOf.localeCompare(b.asOf) || a.monday.localeCompare(b.monday));
}

export type ChannelCheck = { name: string; bookings: number; paidBookings: number; openBookings: number; total: number; paid: number; balance: number };
export type PaymentSummary = { channels: ChannelCheck[]; all: ChannelCheck; flagged: number };
export type PaymentCheck = PaymentSummary & { rows: DebtRow[] };

/** Per-channel counts and money of checked-out stays; the page calls it again after filtering by hotel. */
export function summarizeRows(rows: DebtRow[]): PaymentSummary {
  const blank = (name: string): ChannelCheck => ({ name, bookings: 0, paidBookings: 0, openBookings: 0, total: 0, paid: 0, balance: 0 });
  const add = (c: ChannelCheck, b: DebtRow) => {
    c.bookings++; c.total += b.totalPrice; c.paid += b.payment; c.balance += b.balance;
    if (b.balance > TOLERANCE) c.openBookings++; else c.paidBookings++;
  };
  const byChannel = new Map<string, ChannelCheck>();
  const all = blank("Tất cả");
  for (const b of rows) { add(byChannel.get(b.channel) ?? byChannel.set(b.channel, blank(b.channel)).get(b.channel)!, b); add(all, b); }
  // OTAs first (they pay late), then direct guests; biggest money first inside each group.
  const channels = [...byChannel.values()].sort((a, b) => Number(OTA_CHANNELS.includes(b.name)) - Number(OTA_CHANNELS.includes(a.name)) || b.total - a.total);
  return { channels, all, flagged: rows.filter((b) => b.flags.length).length };
}

/**
 * Paid / unpaid check for the stays that checked out in [from, to]: per channel, how many bookings are fully paid, how many still owe,
 * and the money (total price, paid, balance). total = paid + balance should hold; bookings where it does not carry a flag from the revenue report.
 * rows: every checked-out stay of the period, so the page can list the paid ones and the open ones from the same data.
 */
export function paymentCheck(weeks: RevenueWeek[], from: string, to: string, today: string): PaymentCheck {
  const rows = latestBookings(weeks, today).filter((b) => checkedOut(b) && b.checkOut >= from && b.checkOut <= to)
    .sort((a, b) => a.checkOut.localeCompare(b.checkOut) || a.code.localeCompare(b.code));
  return { rows, ...summarizeRows(rows) };
}

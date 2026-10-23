// Revenue and payment report per booking, plus hotel service revenue per day. Pure functions: tested by bluejay-revenue.test.ts.
// Same inclusion rules as the weekly operations report (bluejay-metrics.ts): M-Standard rooms are left out, and cancelled / no-show
// bookings are listed but never counted as revenue. Imports use ".ts" because scraper/bluejay-backfill.mjs runs this with plain Node.
import { dedupe, isExcludedRoom, isStay, money, n, type Reservation } from "./bluejay-metrics.ts";

export const REVENUE_VERSION = 1;

/** A booking row the money does not add up for, or that needs a person to look at it. */
export type RevenueFlag = "balance" | "overpaid" | "mismatch" | "cancelled-paid";
export const FLAG_LABELS: Record<RevenueFlag, string> = {
  balance: "Đã trả phòng còn nợ",
  overpaid: "Thu dư",
  mismatch: "Lệch số",
  "cancelled-paid": "Hủy có thu tiền",
};

export type RevenueBooking = {
  code: string; ref: string; source: string; channel: string; roomType: string; room: string; status: string;
  bookDate: string; checkIn: string; checkOut: string; nights: number; nightsInWeek: number;
  roomPrice: number; roomInWeek: number; servicePrice: number; totalPrice: number; payment: number; balance: number; deposit: number;
  stay: boolean; flags: RevenueFlag[];
};
export type ServiceItem = { name: string; unit: string; quantity: number; total: number };
export type ServiceGroupDay = { name: string; quantity: number; total: number; items: ServiceItem[] };
export type ServiceDay = { date: string; total: number; groups: ServiceGroupDay[] };
export type HotelRevenue = { id: number; name: string; bookings: RevenueBooking[]; services: ServiceDay[]; excluded?: RevenueBooking[]; basis?: "checkout" }; // excluded: M-Standard bookings, kept apart so the totals can show money with and without them
// paymentsAt: when refreshPayments last re-pulled this week's reservations (OTAs pay weeks later, so "payment / balance" goes stale); fetchedAt otherwise.
export type RevenueWeek = { v: number; monday: string; end: string; fetchedAt: string; paymentsAt?: string; hotels: HotelRevenue[] };
export const OTA_CHANNELS: readonly string[] = ["Agoda", "Booking", "Expedia", "Trip", "Traveloka"];

/** The PMS names OTAs after the site ("Booking.com", "Ctrip"); the finance sheets use the short names. */
export function channelOf(source: unknown) {
  const s = String(source ?? "").trim();
  if (/booking/i.test(s)) return "Booking";
  if (/traveloka/i.test(s)) return "Traveloka";
  if (/ctrip|trip\.com|^trip$/i.test(s)) return "Trip";
  if (/agoda/i.test(s)) return "Agoda";
  if (/expedia/i.test(s)) return "Expedia";
  if (/^(walking|phone|walk-?in|khách lẻ)$/i.test(s)) return "Khách lẻ";
  return s || "Không rõ";
}

const text = (v: unknown) => String(v ?? "").trim();
const day = (v: unknown) => text(v).slice(0, 10);
const TOLERANCE = 1; // VND: the PMS stores whole dong, so anything above 1 is a real difference

// Revenue also leaves out bookings with no room assigned (room "Unassigned"); the operations report keeps them, so this is not part of isExcludedRoom.
const unassigned = (r: Reservation) => /^unassigned$/i.test(text(r.roomName));

export function revenueBookings(rows: Reservation[], from: string, to: string, onlyExcluded = false): RevenueBooking[] {
  return (onlyExcluded ? dedupe(rows.filter((r) => isExcludedRoom(r.roomType) || unassigned(r)), true) : dedupe(rows.filter((r) => !unassigned(r)))).map((r) => {
    const stay = isStay(r);
    const price = money(r.roomPrice) ?? 0, nights = n(r.night);
    const inWeek = day(r.checkOutTime) >= from && day(r.checkOutTime) <= to ? nights : 0; // revenue belongs to the week of check-out: the whole stay counts
    const room = price, service = n(r.servicePrice), total = n(r.totalPrice), payment = n(r.payment), balance = n(r.balance);
    const flags: RevenueFlag[] = [];
    if (stay) {
      if (balance > TOLERANCE && /trả phòng/i.test(text(r.status))) flags.push("balance"); // in-house and future bookings are not paid yet, so only checked-out ones count
      if (payment > total + TOLERANCE) flags.push("overpaid");
      if (Math.abs(total - (room + service)) > TOLERANCE || Math.abs(payment + balance - total) > TOLERANCE) flags.push("mismatch");
    } else if (payment > 0) flags.push("cancelled-paid");
    return {
      code: text(r.bookingCode), ref: text(r.referenceCode), source: text(r.source), channel: channelOf(r.source),
      roomType: text(r.roomType), room: text(r.roomName), status: text(r.status),
      bookDate: day(r.bookDate), checkIn: day(r.checkInTime), checkOut: day(r.checkOutTime), nights, nightsInWeek: inWeek,
      roomPrice: room, roomInWeek: stay && inWeek > 0 ? room : 0, servicePrice: service, totalPrice: total,
      payment, balance, deposit: n(r.deposit), stay, flags,
    };
  }).sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.code.localeCompare(b.code) || a.room.localeCompare(b.room));
}

type ServiceRaw = { GroupService?: string; TotalQuantity?: unknown; TotalPriceSale?: unknown; Service?: { ServiceName?: string; UnitsName?: string; Quantity?: unknown; PriceSale?: unknown }[] };
// PriceSale is the line total (the doc's example: a group of 200000 = 70000 + 130000), not a unit price.
export function serviceDay(date: string, response: { data?: unknown } | null): ServiceDay {
  if (!Array.isArray(response?.data)) throw new Error("Blue Jay chưa trả về báo cáo dịch vụ hợp lệ.");
  const groups = (response.data as ServiceRaw[]).map((g) => ({
    name: text(g.GroupService) || "Không rõ", quantity: n(g.TotalQuantity as number), total: n(g.TotalPriceSale as number),
    items: (g.Service ?? []).map((s) => ({ name: text(s.ServiceName) || "Không rõ", unit: text(s.UnitsName), quantity: n(s.Quantity as number), total: n(s.PriceSale as number) })),
  })).sort((a, b) => b.total - a.total);
  return { date, total: groups.reduce((s, g) => s + g.total, 0), groups };
}

export type Money = { bookings: number; nights: number; room: number; service: number; total: number; payment: number; balance: number; deposit: number };
const zero = (): Money => ({ bookings: 0, nights: 0, room: 0, service: 0, total: 0, payment: 0, balance: 0, deposit: 0 });

/** Totals over real stays. Room money is the part inside the week; service, total, payment and balance are whole-booking amounts. */
export function revenueTotals(rows: RevenueBooking[]) {
  const stays = rows.filter((r) => r.stay);
  const add = (t: Money, r: RevenueBooking) => ({ ...t, nights: t.nights + r.nightsInWeek, room: t.room + r.roomInWeek, service: t.service + r.servicePrice, total: t.total + r.totalPrice, payment: t.payment + r.payment, balance: t.balance + r.balance, deposit: t.deposit + r.deposit });
  const codes = (list: RevenueBooking[]) => new Set(list.map((r) => r.code).filter(Boolean)).size;
  const byChannel = new Map<string, RevenueBooking[]>();
  for (const r of stays) byChannel.set(r.channel, [...(byChannel.get(r.channel) ?? []), r]);
  const cancelled = rows.filter((r) => !r.stay);
  return {
    all: { ...stays.reduce(add, zero()), bookings: codes(stays) },
    channels: [...byChannel.entries()].map(([name, list]) => ({ name, ...list.reduce(add, zero()), bookings: codes(list) })).sort((a, b) => b.total - a.total),
    cancelled: { bookings: codes(cancelled), payment: cancelled.reduce((s, r) => s + r.payment, 0), balance: cancelled.reduce((s, r) => s + r.balance, 0) }, // balance: price Blue Jay still counts that nobody has paid yet
    flagged: rows.filter((r) => r.flags.length).length,
  };
}

/** Service revenue per group across the days of the week, biggest first; `days` keeps the day-by-group matrix for the table. */
export function serviceMatrix(days: ServiceDay[]) {
  const totals = new Map<string, { name: string; quantity: number; total: number }>();
  for (const d of days) for (const g of d.groups) {
    const t = totals.get(g.name) ?? { name: g.name, quantity: 0, total: 0 };
    t.quantity += g.quantity; t.total += g.total;
    totals.set(g.name, t);
  }
  const groups = [...totals.values()].sort((a, b) => b.total - a.total);
  return {
    groups,
    total: groups.reduce((s, g) => s + g.total, 0),
    days: days.map((d) => ({ date: d.date, total: d.total, byGroup: Object.fromEntries(d.groups.map((g) => [g.name, g.total])) as Record<string, number> })),
  };
}

// Bookings and cancellations per channel per week (the finance team's "OTA-OTP" and "BC OTA, OTP, CS Phòng"), from the revenue weeks already stored.
// A booking belongs to the week of its booking date; "cancel" is a booking of that week that is now cancelled or a no-show (Blue Jay keeps no cancellation date), "book" is the rest.
// Pure function: tested by ql-channels.test.ts. Imports use ".ts" because tests run this with plain Node.
import { channelOf, OTA_CHANNELS, type RevenueBooking, type RevenueWeek } from "./bluejay-revenue.ts";
import { monthRange } from "./ql-report.ts";
import { weekColumns } from "./finance-summary.ts";

/** Direct channels, by the source Blue Jay names (the finance team's OTP): the label of the column and what the source looks like. */
const OTP: [string, RegExp][] = [["Walking", /^walk/i], ["Zalo", /zalo/i], ["Facebook", /facebook/i], ["Điện thoại", /^phone|[đd]i[eệ]n tho[aạ]i/i], ["BE", /^be$/i]];
const OTHER = "Khác";
const OTA_ORDER = ["Agoda", "Booking", "Expedia", "Traveloka", "Trip"]; // the order of the finance team's sheet

/** The group and column of a booking's source: an OTA by name, a direct channel from the list above, anything else ("CSKH CŨ"…) in "Khác" of the direct channels. */
export function channelKey(source: string): { group: "ota" | "otp"; key: string } {
  const ota = channelOf(source);
  if (OTA_CHANNELS.includes(ota)) return { group: "ota", key: ota };
  return { group: "otp", key: OTP.find(([, re]) => re.test(source.trim()))?.[0] ?? OTHER };
}

export type ChannelWeek = { label: string; from: string; to: string; counts: Record<string, { book: number; cancel: number }> };
export type ChannelCounts = { ota: string[]; otp: string[]; weeks: ChannelWeek[] };

/** weeks: stored revenue weeks from the Monday of the month's first day on (a booking made in the month checks out in that week or later). month "yyyy-mm". The last column is the whole month. */
export function channelCounts(revenues: RevenueWeek[], hotelId: number, month: string): ChannelCounts {
  const latest = new Map<string, { b: RevenueBooking; at: string }>();
  for (const w of revenues) {
    const hotel = w.hotels.find((h) => h.id === hotelId);
    for (const b of [...(hotel?.bookings ?? []), ...(hotel?.excluded ?? [])]) {
      const key = `${b.code}|${b.room}|${b.roomType}`, at = w.paymentsAt ?? w.fetchedAt;
      if (!latest.has(key) || at > latest.get(key)!.at) latest.set(key, { b, at });
    }
  }
  const columns = weekColumns(monthRange(month));
  const weeks: ChannelWeek[] = columns.map((c) => ({ label: c.label, from: c.from, to: c.to, counts: {} }));
  const seen = { ota: new Set<string>(), otp: new Set<string>() };
  for (const { b } of latest.values()) {
    if (!b.bookDate) continue;
    const { group, key } = channelKey(b.source);
    for (const w of weeks) {
      if (b.bookDate < w.from || b.bookDate > w.to) continue;
      const c = (w.counts[key] ??= { book: 0, cancel: 0 });
      if (b.stay) c.book++; else c.cancel++;
      seen[group].add(key);
    }
  }
  const order = (group: "ota" | "otp") => (group === "ota" ? OTA_ORDER : [...OTP.map(([l]) => l), OTHER]);
  // the OTA columns are always there (the finance team's sheet has them even when empty); the direct ones only when a booking came through them
  return { ota: order("ota"), otp: order("otp").filter((k) => seen.otp.has(k) || k === "Walking"), weeks };
}

// Weekly operations report for Blue Jay PMS. Ported from the sample project (D:\blue-jay lib/metrics.js, lib/dates.js);
// keep the rules identical so both dashboards show the same numbers. Pure functions only: tested by bluejay-metrics.test.ts.

// Hotels pulled from Blue Jay. Colour follows the hotel (sidebar dot, chart line), never its position in a filtered list.
export const BLUEJAY_HOTELS = [
  { id: 5381, name: "Sontra Sea", color: "#2a78d6" },
  { id: 6836, name: "Vistara Gia Lai", color: "#eb6834" },
  { id: 6495, name: "Vistara Quy Nhon", color: "#1baf7a" },
  { id: 6209, name: "Yzistel Hoi An", color: "#eda100" },
];

// ---- dates: "YYYY-MM-DD" strings in Vietnam local time; arithmetic in UTC to avoid zone drift ----
export const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const addDays = (s: string, n: number) => new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
export const apiDate = (s: string) => s.replace(/-0(\d)/g, "-$1"); // API doc style: 2026-5-21
export const vnDay = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`; // dd/mm: short form for chart axes and Excel titles; everywhere else shows dd/mm/yyyy (fmtDate)
export const weekEnd = (monday: string) => addDays(monday, 6);

export function isoWeek(s: string) {
  const t = new Date(`${s}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}

const vnParts = (now: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
}).formatToParts(now).map((p) => [p.type, p.value]));

export const todayVN = (now = new Date()) => { const p = vnParts(now); return `${p.year}-${p.month}-${p.day}`; };
export const mondayOf = (s: string) => addDays(s, 1 - (new Date(`${s}T00:00:00Z`).getUTCDay() || 7));
export const lastFullWeek = (now = new Date()) => addDays(mondayOf(todayVN(now)), -7);

// Blue Jay answers only 8:00–8:30, 16:00–16:59 and 0:00–0:59 (Vietnam time).
export function inApiWindow(now = new Date()) {
  const p = vnParts(now), h = Number(p.hour), m = Number(p.minute);
  return (h === 8 && m <= 30) || h === 16 || h === 0;
}

// ---- API shapes (only the fields used) ----
type Amount = number | string | null | undefined;
export type Reservation = {
  bookingCode?: string | null; roomType?: string | null; source?: string | null; status?: string | null;
  checkInTime?: string | null; checkOutTime?: string | null; night?: Amount;
  roomPrice?: Amount; servicePrice?: Amount; totalPrice?: Amount; payment?: Amount; balance?: Amount;
  referenceCode?: string | null; roomName?: string | null; bookDate?: string | null; deposit?: Amount;
};
export type OccupancyResponse = { data?: { GrandTotal?: { RoomTypes?: { RoomTypeName?: string; DailyDetails?: { Date: string; RoomOccupied?: Amount; TotalRoom?: Amount }[] }[] } } };
export type ServiceResponse = { data?: { GroupService?: string; TotalQuantity?: Amount; TotalPriceSale?: Amount }[] };

export type Day = { date: string; occupied: number; total: number };
export type Totals = { occ: number; total: number };
export type Group = { name: string; bookings: number; nights: number; value: number };
export type ServiceGroup = { name: string; quantity: number; total: number };
export type HotelRecord = {
  id: number; name: string; weeks: Totals[]; days: Day[]; roomSum: number; nightSum: number;
  stats: { bookings: number; roomPrice: number; servicePrice: number; totalPrice: number; payment: number; balance: number; bySource: Group[]; byRoomType: Group[] };
  statuses: { name: string; bookings: number }[];
  services: { groups: ServiceGroup[]; total: number };
};
export type WeeklyReport = { v: number; monday: string; end: string; weekNo: number; fetchedAt: string; hotels: HotelRecord[] };

export const n = (v: Amount) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const money = (v: Amount) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// Same rule as the PMS dashboard: M-Standard room types are not sellable inventory.
// The call log keeps raw reservation pages for debugging. Guest names, notes and ID-paper links are never read by the reports, so they are not kept.
const PRIVATE_FIELDS = ["guestName", "guestImagepaper", "note"];
export function redactReservations<T>(body: T): T {
  const page = body as { data?: { attributes?: { reservations?: unknown } } } | null;
  const list = page?.data?.attributes?.reservations;
  if (!Array.isArray(list)) return body;
  const clean = list.map((r) => (r && typeof r === "object" ? Object.fromEntries(Object.entries(r).filter(([key]) => !PRIVATE_FIELDS.includes(key))) : r));
  return { ...page, data: { ...page!.data, attributes: { ...page!.data!.attributes, reservations: clean } } } as T;
}

export const isExcludedRoom = (name: unknown) => /^m(?:\s*[-_‐-―]\s*|\s+)standard(?:$|[^a-z0-9])/i.test(String(name || "").trim());

// Cancelled and no-show bookings occupy no room-night. Labels are the PMS's Vietnamese status strings.
export const isStay = (r: Reservation) => !/huỷ|hủy|không đến|no.?show/i.test(String(r.status || ""));

const isoFromVn = (d: string) => { const [dd, mm, yy] = String(d).split("/"); return `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`; };

// One entry per date, summed over every sellable room type.
export function occupancyDaily(report: OccupancyResponse): Day[] {
  const grand = report?.data?.GrandTotal;
  if (!grand) throw new Error("Blue Jay chưa trả về báo cáo công suất hợp lệ.");
  const days = new Map<string, Day>();
  for (const rt of grand.RoomTypes || []) {
    if (isExcludedRoom(rt.RoomTypeName)) continue;
    for (const d of rt.DailyDetails || []) {
      const key = isoFromVn(d.Date);
      const a = days.get(key) || { date: key, occupied: 0, total: 0 };
      a.occupied += n(d.RoomOccupied); a.total += n(d.TotalRoom);
      days.set(key, a);
    }
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const occupancyTotals = (report: OccupancyResponse): Totals =>
  occupancyDaily(report).reduce((t, d) => ({ occ: t.occ + d.occupied, total: t.total + d.total }), { occ: 0, total: 0 });

// Occupancy = occupied / total room-nights. Blocked rooms are NOT taken out of the denominator (verified in the sample project).
export const rate = ({ occ, total }: Totals) => (total > 0 ? occ / total : 0);

export const dedupe = (rows: Reservation[], keepExcluded = false) => {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = JSON.stringify(r);
    if (seen.has(key) || (!keepExcluded && isExcludedRoom(r.roomType))) return false;
    seen.add(key);
    return true;
  });
};

const dayNum = (s: unknown) => Date.parse(`${String(s).slice(0, 10)}T00:00:00Z`) / 864e5; // NaN when missing/invalid

// Stay nights of a booking inside [from, to] (inclusive); the checkout day is not a stay night.
export function nightsIn(r: Reservation, from: string, to: string) {
  const o = Math.min(dayNum(r.checkOutTime) - 1, dayNum(to)) - Math.max(dayNum(r.checkInTime), dayNum(from)) + 1;
  return Number.isFinite(o) ? Math.max(0, o) : 0;
}

type Stay = Reservation & { _nights: number; _room: number };
// Room revenue is spread evenly over the booking's nights and only the nights inside the week count.
function stays(rows: Reservation[], from: string, to: string): Stay[] {
  return dedupe(rows).filter(isStay).flatMap((r) => {
    const p = money(r.roomPrice), total = n(r.night), o = nightsIn(r, from, to);
    return p !== null && total > 0 && o > 0 ? [{ ...r, _nights: o, _room: (p / total) * o }] : [];
  });
}

export const roomTotals = (rows: Reservation[], from: string, to: string) =>
  stays(rows, from, to).reduce((t, r) => ({ room: t.room + r._room, nights: t.nights + r._nights }), { room: 0, nights: 0 });
export const averageRate = (rows: Reservation[], from: string, to: string) => { const t = roomTotals(rows, from, to); return t.nights ? t.room / t.nights : 0; };

const MAX_GROUPS = 7; // beyond this, the tail folds into "Khác" so the chart stays readable
type Bucket = { codes: Set<string>; anon: number; nights: number; value: number };
function top(map: Map<string, Bucket>, by: "value" | "bookings"): Group[] {
  const list = [...map.entries()].map(([name, g]) => ({ name, bookings: g.codes.size + g.anon, nights: g.nights, value: g.value })).sort((a, b) => b[by] - a[by]);
  if (list.length <= MAX_GROUPS) return list;
  const rest = list.slice(MAX_GROUPS - 1).reduce((s, g) => ({ name: "Khác", bookings: s.bookings + g.bookings, nights: s.nights + g.nights, value: s.value + g.value }), { name: "Khác", bookings: 0, nights: 0, value: 0 });
  return [...list.slice(0, MAX_GROUPS - 1), rest];
}
function group<R extends Reservation>(rows: R[], key: (r: R) => unknown, nightsOf: (r: R) => number, valueOf: (r: R) => number) {
  const map = new Map<string, Bucket>();
  for (const r of rows) {
    const name = String(key(r) || "").trim() || "Không rõ";
    const g = map.get(name) || { codes: new Set<string>(), anon: 0, nights: 0, value: 0 };
    const code = String(r.bookingCode || "").trim();
    if (code) g.codes.add(code); else g.anon++;
    g.nights += nightsOf(r); g.value += valueOf(r);
    map.set(name, g);
  }
  return map;
}

// Room revenue and nights are the part inside the week. Service, total, payment and balance are whole-booking amounts.
export function reservationStats(rows: Reservation[], from: string, to: string): HotelRecord["stats"] {
  const clean = stays(rows, from, to);
  const sum = (f: "servicePrice" | "totalPrice" | "payment" | "balance") => clean.reduce((s, r) => s + (money(r[f]) ?? 0), 0);
  return {
    bookings: new Set(clean.map((r) => String(r.bookingCode || "").trim()).filter(Boolean)).size,
    roomPrice: clean.reduce((s, r) => s + r._room, 0), servicePrice: sum("servicePrice"), totalPrice: sum("totalPrice"), payment: sum("payment"), balance: sum("balance"),
    bySource: top(group(clean, (r) => r.source, (r) => r._nights, (r) => r._room), "value"),
    byRoomType: top(group(clean, (r) => r.roomType, (r) => r._nights, (r) => r._room), "value"),
  };
}

// Status mix uses every booking (cancelled / no-show included).
export const statusCounts = (rows: Reservation[]) =>
  top(group(dedupe(rows), (r) => r.status, () => 0, () => 0), "bookings").map(({ name, bookings }) => ({ name, bookings }));

export function serviceStats(response: ServiceResponse) {
  if (!Array.isArray(response?.data)) throw new Error("Blue Jay chưa trả về báo cáo dịch vụ hợp lệ.");
  const groups = response.data.map((g) => ({ name: g.GroupService || "Không rõ", quantity: n(g.TotalQuantity), total: n(g.TotalPriceSale) })).sort((a, b) => b.total - a.total);
  return { groups, total: groups.reduce((s, g) => s + g.total, 0) };
}

// One hotel's snapshot. weeks = [current, next, afterNext] totals; days = 21 daily rows for the occupancy chart.
export function hotelRecord({ id, name, weeks, days, reservations, from, to, services }: {
  id: number; name: string; weeks: Totals[]; days: Day[]; reservations: Reservation[]; from: string; to: string; services: ServiceResponse;
}): HotelRecord {
  const { room, nights } = roomTotals(reservations, from, to);
  return {
    id, name,
    weeks: weeks.map((w) => ({ occ: w.occ, total: w.total })),
    days: days.map((d) => ({ date: d.date, occupied: d.occupied, total: d.total })),
    roomSum: room, nightSum: nights,
    stats: reservationStats(reservations, from, to), statuses: statusCounts(reservations), services: serviceStats(services),
  };
}

// Derived view for one hotel or several combined (rates are weighted, never averaged).
export function summarize(records: Pick<HotelRecord, "weeks" | "roomSum" | "nightSum">[]) {
  const w = (i: number) => records.reduce((s, h) => ({ occ: s.occ + h.weeks[i].occ, total: s.total + h.weeks[i].total }), { occ: 0, total: 0 });
  const [cur, p1, p2] = [w(0), w(1), w(2)];
  const room = records.reduce((s, h) => s + h.roomSum, 0), nights = records.reduce((s, h) => s + h.nightSum, 0);
  const adr = nights ? room / nights : 0;
  return { rate: rate(cur), nights: cur.occ, adr, revpar: rate(cur) * adr, pickup1: rate(p1), pickup2: rate(p2) };
}

export type Merged = { name: string; bookings: number; nights: number; value: number; quantity: number; total: number };
const FIELDS = ["bookings", "nights", "value", "quantity", "total"] as const;
const mergeBy = (lists: Partial<Merged>[][], field: (typeof FIELDS)[number]): Merged[] => {
  const map = new Map<string, Merged>();
  for (const l of lists) for (const g of l) {
    const name = g.name ?? "Không rõ";
    const a = map.get(name) || { name, bookings: 0, nights: 0, value: 0, quantity: 0, total: 0 };
    for (const k of FIELDS) a[k] += g[k] ?? 0;
    map.set(name, a);
  }
  const list = [...map.values()].sort((a, b) => Number(a.name === "Khác") - Number(b.name === "Khác") || b[field] - a[field]); // "Khác" always last
  if (list.length <= MAX_GROUPS + 1) return list;
  const rest = list.slice(MAX_GROUPS).reduce((s, g) => { for (const k of FIELDS) s[k] += g[k]; return s; }, { name: "Khác", bookings: 0, nights: 0, value: 0, quantity: 0, total: 0 });
  return [...list.slice(0, MAX_GROUPS), rest];
};

export function combine(records: Pick<HotelRecord, "stats" | "statuses" | "services">[]) {
  const sum = (f: "bookings" | "roomPrice" | "servicePrice" | "totalPrice" | "payment" | "balance") => records.reduce((s, h) => s + h.stats[f], 0);
  return {
    bookings: sum("bookings"), roomPrice: sum("roomPrice"), servicePrice: sum("servicePrice"), totalPrice: sum("totalPrice"), payment: sum("payment"), balance: sum("balance"),
    bySource: mergeBy(records.map((h) => h.stats.bySource), "value"),
    byRoomType: mergeBy(records.map((h) => h.stats.byRoomType), "value"),
    statuses: mergeBy(records.map((h) => h.statuses), "bookings"),
    services: mergeBy(records.map((h) => h.services.groups), "total"),
  };
}

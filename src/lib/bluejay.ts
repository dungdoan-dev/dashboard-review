// No "@/" imports: scraper/bluejay-backfill.mjs runs this file with plain Node.
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { MAX_RANGE_DAYS, rangeData } from "./bluejay-range.ts";
import { REVENUE_VERSION, revenueBookings, serviceDay, type HotelRevenue, type RevenueWeek } from "./bluejay-revenue.ts";
import { BLUEJAY_HOTELS, addDays, apiDate, hotelRecord, inApiWindow, isDate, isoWeek, lastFullWeek, mondayOf, occupancyDaily, occupancyTotals, weekEnd, type OccupancyResponse, type Reservation, type ServiceResponse, type WeeklyReport } from "./bluejay-metrics.ts";

const BASE = "https://api-pms.bluejaypms.com/api/v2/";
const VERSION = 3; // same snapshot shape as the sample project; bump when it changes (older snapshots are ignored)

type Params = Record<string, string | number>;
type Body = Record<string, unknown> | null;

export function serviceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Thiếu SUPABASE_SERVICE_ROLE_KEY trên máy chủ.");
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** One GET to Blue Jay; every attempt, failed or not, is stored in bluejay_api_calls. Throws when the call failed. */
export async function callBluejay(db: SupabaseClient, hotelId: number, endpoint: string, params: Params = {}) {
  const key = process.env.BLUEJAY_API_KEY?.trim();
  if (!key) throw new Error("Chưa cấu hình BLUEJAY_API_KEY.");
  const sent = { hotelId, ...params };
  const url = new URL(endpoint, BASE);
  for (const [name, value] of Object.entries(sent)) url.searchParams.set(name, String(value));

  const started = Date.now();
  let httpStatus: number | null = null;
  let body: Body = null;
  let error: string | null = null;
  try {
    const res = await fetch(url, { headers: { ApiKey: key, Accept: "application/json" }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000) });
    httpStatus = res.status;
    const text = await res.text();
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 10_000) }; }
    if (!res.ok) error = `HTTP ${res.status}`;
    // Outside the time window Blue Jay answers HTTP 200 with an errors object.
    else if (body?.errors || body?.error) error = `Blue Jay từ chối yêu cầu (có thể ngoài khung giờ API): ${JSON.stringify(body.errors ?? body.error)}`;
    else if (body?.status && String(body.status).toLowerCase() !== "success") error = `Blue Jay: ${body.message ?? body.status}`;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const { error: saveError } = await db.from("bluejay_api_calls").insert({
    hotel_id: hotelId, endpoint, params: sent, http_status: httpStatus, ok: !error,
    error: error?.slice(0, 1000) ?? null, response: body, duration_ms: Date.now() - started,
  });
  if (saveError) throw new Error(`Không lưu được kết quả gọi ${endpoint}: ${saveError.message}`);
  if (error) throw new Error(`${endpoint} (hotel ${hotelId}): ${error}`);
  return body;
}

/** Thrown between API calls when the run must stop: its deadline passed or the API window closed. */
export class SyncStop extends Error {
  reason: "deadline" | "window"; // a plain field, not a parameter property: Node's type stripping runs this file
  constructor(reason: "deadline" | "window") {
    super(reason === "deadline" ? "Hết thời gian của lượt chạy; tuần này sẽ được lấy lại ở lượt sau." : "Ngoài khung giờ API (00:00–00:59, 08:00–08:30, 16:00–16:59 giờ VN).");
    this.reason = reason;
  }
}
const stopCheck = (deadline: number) => () => {
  if (Date.now() > deadline) throw new SyncStop("deadline");
  if (!inApiWindow()) throw new SyncStop("window");
};

/** Every page of reservations for the range; each page is its own logged call. check() runs before each page. */
export async function fetchAllReservations(db: SupabaseClient, hotelId: number, params: Params, check = () => {}) {
  const rows: Reservation[] = [];
  let total = Infinity;
  for (let page = 1; rows.length < total; page++) {
    if (page > 200) throw new Error("Khoảng ngày quá lớn.");
    check();
    const body = await callBluejay(db, hotelId, "reservation", { ...params, limit: 100, page }) as { meta?: { total?: number }; data?: { attributes?: { reservations?: unknown } } } | null;
    const list = body?.data?.attributes?.reservations;
    if (!Array.isArray(list)) throw new Error("Blue Jay chưa trả về danh sách đặt phòng hợp lệ.");
    total = Number(body?.meta?.total ?? list.length);
    rows.push(...list);
    if (!list.length) break;
  }
  return rows;
}

/**
 * Pulls the week starting at monday for every hotel and stores the computed report. Same calls as the sample project.
 * Before every call it checks the deadline and the API window (a week is ~30 calls), throwing SyncStop to stop cleanly.
 */
export async function refreshReport(db: SupabaseClient, monday: string, deadline = Infinity) {
  if (!isDate(monday)) throw new Error("Ngày không hợp lệ.");
  const check = stopCheck(deadline);
  const call = (hotelId: number, endpoint: string, params: Params) => { check(); return callBluejay(db, hotelId, endpoint, params); };
  const week = (off: number) => ({ from: apiDate(addDays(monday, 7 * off)), to: apiDate(addDays(monday, 7 * off + 6)) });

  const hotels = [];
  const revenue: HotelRevenue[] = [];
  for (const h of BLUEJAY_HOTELS) { // sequential: the provider is fragile and the window is short
    const occ: OccupancyResponse[] = [];
    for (const off of [0, 1, 2]) occ.push(await call(h.id, "report-room-occupancy", { dateType: 1, ...week(off) }) as OccupancyResponse);
    const reservations = await fetchAllReservations(db, h.id, { dateType: 3, ...week(0) }, check); // every status; filtered in code
    const services = await call(h.id, "extraservice-sumary", { ...week(0), serviceType: 0 }) as ServiceResponse;
    // Service revenue per day for the revenue report (the week call above stays as is for the operations report).
    const serviceDays = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      serviceDays.push(serviceDay(date, await call(h.id, "extraservice-sumary", { from: apiDate(date), to: apiDate(date), serviceType: 0 }) as { data?: unknown }));
    }
    revenue.push({ id: h.id, name: h.name, bookings: revenueBookings(reservations, monday, weekEnd(monday)), services: serviceDays });
    hotels.push(hotelRecord({
      id: h.id, name: h.name,
      weeks: occ.map(occupancyTotals), days: occ.flatMap(occupancyDaily),
      reservations, from: monday, to: weekEnd(monday), services,
    }));
  }
  const report: WeeklyReport = { v: VERSION, monday, end: weekEnd(monday), weekNo: isoWeek(monday), fetchedAt: new Date().toISOString(), hotels };
  // Written only after every hotel succeeded; the raw calls are already in bluejay_api_calls either way.
  const { error } = await db.from("bluejay_weekly_reports").upsert({ week_start: monday, report, fetched_at: report.fetchedAt });
  if (error) throw new Error(`Không lưu được báo cáo tuần: ${error.message}`);
  const revenueWeek: RevenueWeek = { v: REVENUE_VERSION, monday, end: weekEnd(monday), fetchedAt: report.fetchedAt, hotels: revenue };
  const { error: revenueError } = await db.from("bluejay_revenue_weeks").upsert({ week_start: monday, revenue: revenueWeek, fetched_at: report.fetchedAt });
  if (revenueError) throw new Error(`Không lưu được báo cáo doanh thu tuần (đã chạy migration 20261016000000_bluejay_revenue.sql chưa?): ${revenueError.message}`);
  return report;
}

export async function readRevenue(db: SupabaseClient, monday: string): Promise<RevenueWeek | null> {
  if (!isDate(monday)) return null;
  const { data, error } = await db.from("bluejay_revenue_weeks").select("revenue").eq("week_start", monday).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.revenue?.v === REVENUE_VERSION ? data.revenue : null;
}

/** Any date range from the stored weeks only (no call to Blue Jay). Weeks that were never pulled show up as gaps in the result. */
export async function readRange(db: SupabaseClient, from: string, to: string) {
  if (!isDate(from) || !isDate(to) || from > to) throw new Error("Khoảng ngày không hợp lệ.");
  if (addDays(from, MAX_RANGE_DAYS) <= to) throw new Error(`Chọn tối đa ${MAX_RANGE_DAYS} ngày.`);
  const first = mondayOf(from), last = mondayOf(to);
  const [reports, revenue] = await Promise.all([
    db.from("bluejay_weekly_reports").select("report").gte("week_start", first).lte("week_start", last),
    db.from("bluejay_revenue_weeks").select("revenue").gte("week_start", first).lte("week_start", last),
  ]);
  if (reports.error) throw new Error(reports.error.message);
  if (revenue.error) throw new Error(revenue.error.message);
  return rangeData(
    (reports.data ?? []).map((r) => r.report).filter((r) => r?.v === VERSION),
    (revenue.data ?? []).map((r) => r.revenue).filter((r) => r?.v === REVENUE_VERSION),
    from, to,
  );
}

export async function readReport(db: SupabaseClient, monday: string): Promise<WeeklyReport | null> {
  if (!isDate(monday)) return null;
  const { data, error } = await db.from("bluejay_weekly_reports").select("report").eq("week_start", monday).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.report?.v === VERSION ? data.report : null;
}

/** Stored weeks up to and including monday, oldest first, for the trend charts. */
export async function listReports(db: SupabaseClient, monday: string, limit = 12): Promise<WeeklyReport[]> {
  const { data, error } = await db.from("bluejay_weekly_reports").select("report").lte("week_start", monday).order("week_start", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.report).filter((r) => r?.v === VERSION).reverse();
}

/** Mondays in [from, to] that already have a current-version operations report and revenue report. */
export async function storedWeeks(db: SupabaseClient, from: string, to: string) {
  const [reports, revenue] = await Promise.all([
    db.from("bluejay_weekly_reports").select("week_start, v:report->v").gte("week_start", from).lte("week_start", to),
    db.from("bluejay_revenue_weeks").select("week_start, v:revenue->v").gte("week_start", from).lte("week_start", to),
  ]);
  if (reports.error) throw new Error(reports.error.message);
  if (revenue.error) throw new Error(revenue.error.message);
  const current = (rows: { week_start: unknown; v: unknown }[] | null, version: number) => new Set((rows ?? []).filter((r) => Number(r.v) === version).map((r) => String(r.week_start)));
  const withRevenue = current(revenue.data, REVENUE_VERSION);
  return new Set([...current(reports.data, VERSION)].filter((week) => withRevenue.has(week)));
}

export type SyncTrigger = "cron" | "manual" | "script";

/**
 * Pulls the given weeks in order, one bluejay_sync_runs row per week, until the deadline or the end of the API window.
 * A failed week is logged and skipped; it stays missing, so the next run tries it again.
 */
export async function syncWeeks(db: SupabaseClient, weeks: string[], trigger: SyncTrigger, deadline = Infinity) {
  const result = { done: 0, failed: 0, remaining: weeks.length, stoppedBy: null as null | "deadline" | "window", lastError: null as string | null };
  const check = stopCheck(deadline);
  for (const monday of weeks) {
    try { check(); } catch (e) { result.stoppedBy = (e as SyncStop).reason; break; }
    const started = new Date().toISOString();
    const { data: run, error } = await db.from("bluejay_sync_runs").insert({ week_start: monday, trigger, status: "running", started_at: started }).select("id").single();
    if (error) throw new Error(`Không ghi được log đồng bộ: ${error.message}`);
    let message: string | null = null;
    try { await refreshReport(db, monday, deadline); } catch (e) {
      message = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
      if (e instanceof SyncStop) result.stoppedBy = e.reason;
    }
    const { count } = await db.from("bluejay_api_calls").select("id", { count: "exact", head: true }).gte("called_at", started);
    await db.from("bluejay_sync_runs").update({ status: message ? "failed" : "success", message, api_calls: count ?? null, finished_at: new Date().toISOString() }).eq("id", run.id);
    if (result.stoppedBy) break; // the week stays missing and counts as remaining; the next run retries it
    result.remaining--;
    if (message) { result.failed++; result.lastError = message; } else result.done++;
  }
  return result;
}

/** Weeks the scheduled sync should pull now: the last full week if missing, then missing backfill weeks, newest first. */
export async function plannedWeeks(db: SupabaseClient) {
  const { data: settings, error } = await db.from("bluejay_sync_settings").select("enabled, backfill_from, backfill_to").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!settings?.enabled) return [];
  const last = lastFullWeek();
  const from = settings.backfill_from && settings.backfill_from < last ? settings.backfill_from : last;
  const to = settings.backfill_to && settings.backfill_to < last ? settings.backfill_to : last;
  const have = await storedWeeks(db, from, last);
  const weeks = have.has(last) ? [] : [last];
  if (settings.backfill_from && settings.backfill_to) {
    for (let monday = to; monday >= from; monday = addDays(monday, -7)) if (monday !== last && !have.has(monday)) weeks.push(monday);
  }
  return weeks;
}

/** Another run started in the last 10 minutes and has not finished (cron and "Chạy ngay" must not overlap). */
export async function syncBusy(db: SupabaseClient) {
  const { data } = await db.from("bluejay_sync_runs").select("id").eq("status", "running").gte("started_at", new Date(Date.now() - 10 * 60_000).toISOString()).limit(1);
  return Boolean(data?.length);
}

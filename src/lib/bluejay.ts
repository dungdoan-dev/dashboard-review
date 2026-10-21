// No "@/" imports: scraper/bluejay-backfill.mjs runs this file with plain Node.
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { MAX_RANGE_DAYS, rangeData } from "./bluejay-range.ts";
import { latestBookings, openDebts, paymentCheck, weeksWithDebt } from "./bluejay-debt.ts";
import { REVENUE_VERSION, revenueBookings, serviceDay, type HotelRevenue, type RevenueBooking, type RevenueWeek } from "./bluejay-revenue.ts";
import { BLUEJAY_HOTELS, addDays, apiDate, hotelRecord, inApiWindow, isDate, redactReservations, todayVN, isoWeek, lastFullWeek, mondayOf, occupancyDaily, occupancyTotals, weekEnd, type OccupancyResponse, type Reservation, type ServiceResponse, type WeeklyReport } from "./bluejay-metrics.ts";

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
    error: error?.slice(0, 1000) ?? null, response: redactReservations(body), duration_ms: Date.now() - started,
  });
  if (saveError) throw new Error(`Không lưu được kết quả gọi ${endpoint}: ${saveError.message}`);
  if (error) throw new Error(`${endpoint} (hotel ${hotelId}): ${error}`);
  return body;
}

const KEEP_RESPONSES_DAYS = 7;

/** Raw responses are for debugging a recent run: empty the ones of successful calls older than a week (a failed call keeps its response). The row itself stays. */
export async function pruneApiCalls(db: SupabaseClient) {
  const { error } = await db.from("bluejay_api_calls").update({ response: null })
    .eq("ok", true).not("response", "is", null).lt("called_at", new Date(Date.now() - KEEP_RESPONSES_DAYS * 864e5).toISOString());
  if (error) throw new Error(error.message);
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
    const checkouts = await fetchAllReservations(db, h.id, { dateType: 1, ...week(0) }, check); // the revenue report counts a stay in the week it checks out
    const services = await call(h.id, "extraservice-sumary", { ...week(0), serviceType: 0 }) as ServiceResponse;
    // Service revenue per day for the revenue report (the week call above stays as is for the operations report).
    const serviceDays = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      serviceDays.push(serviceDay(date, await call(h.id, "extraservice-sumary", { from: apiDate(date), to: apiDate(date), serviceType: 0 }) as { data?: unknown }));
    }
    revenue.push({ id: h.id, name: h.name, bookings: revenueBookings(checkouts, monday, weekEnd(monday)), excluded: revenueBookings(checkouts, monday, weekEnd(monday), true), basis: "checkout", services: serviceDays });
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

/**
 * Stored bookings of one hotel that can appear in a cash ledger for [from, to]: weeks from 9 weeks before (OTAs pay late) to the period end,
 * one record per booking (the latest snapshot wins). missingWeeks: Mondays inside the period with no stored revenue week, so "not in Blue Jay" can be read with care.
 */
export async function readReconcileBookings(db: SupabaseClient, hotelId: number, from: string, to: string) {
  if (!isDate(from) || !isDate(to) || from > to) throw new Error("Khoảng ngày không hợp lệ.");
  if (addDays(from, MAX_RANGE_DAYS) <= to) throw new Error(`Chọn tối đa ${MAX_RANGE_DAYS} ngày.`);
  const { data, error } = await db.from("bluejay_revenue_weeks").select("week_start,revenue")
    .gte("week_start", addDays(mondayOf(from), -63)).lte("week_start", addDays(mondayOf(to), 28)).order("week_start"); // weeks hold a stay by its check-out week, so a stay inside the period can sit up to a month later
  if (error) throw new Error(error.message);
  const have = new Set<string>();
  const weeks: RevenueWeek[] = [];
  for (const row of data ?? []) {
    if (row.revenue?.v !== REVENUE_VERSION) continue;
    have.add(String(row.week_start));
    const week = row.revenue as RevenueWeek;
    weeks.push({ ...week, hotels: week.hotels.map((h) => ({ ...h, bookings: [...h.bookings, ...(h.excluded ?? [])] })) }); // M-Standard / Unassigned stays are real cash in a ledger
  }
  const missingWeeks: string[] = [];
  for (let monday = mondayOf(from); monday <= to; monday = addDays(monday, 7)) if (!have.has(monday)) missingWeeks.push(monday);
  // The newest snapshot of a booking wins, as on the debt and paid pages. Not the latest week: a payment refresh or a backfill can make an earlier week the newer snapshot.
  return { bookings: latestBookings(weeks, todayVN()).filter((b) => b.hotelId === hotelId), missingWeeks };
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

const DEBT_WEEKS = 16; // shortcut: debts older than 16 weeks are not re-pulled; raise it (or pull the week by hand) when an OTA pays that late

/** Revenue weeks of the last DEBT_WEEKS weeks plus the current one, oldest first. */
async function recentRevenueWeeks(db: SupabaseClient) {
  const { data, error } = await db.from("bluejay_revenue_weeks").select("revenue").gte("week_start", addDays(lastFullWeek(), -7 * DEBT_WEEKS)).order("week_start");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.revenue as RevenueWeek).filter((r) => r?.v === REVENUE_VERSION);
}

/** Open OTA debts from the stored weeks (no call to Blue Jay), with the oldest payment snapshot they rest on. */
export async function readDebts(db: SupabaseClient, today: string) {
  const rows = openDebts(await recentRevenueWeeks(db), today);
  // Only weeks that still owe are re-pulled; a settled week keeps its old snapshot and must not make the page look stale.
  return { rows, oldestAsOf: rows.map((r) => r.asOf).sort()[0] ?? null };
}

/** Paid / unpaid check of the stays that checked out in [from, to], from the stored weeks (no call to Blue Jay). */
export async function readPaymentCheck(db: SupabaseClient, from: string, to: string, today: string) {
  if (!isDate(from) || !isDate(to) || from > to) throw new Error("Khoảng ngày không hợp lệ.");
  if (addDays(from, MAX_RANGE_DAYS) <= to) throw new Error(`Chọn tối đa ${MAX_RANGE_DAYS} ngày.`);
  // A stay that checks out in the period shows up in the week of its check-out; earlier weeks are read too so long stays keep their newest snapshot.
  const { data, error } = await db.from("bluejay_revenue_weeks").select("revenue")
    .gte("week_start", addDays(mondayOf(from), -63)).lte("week_start", mondayOf(to)).order("week_start");
  if (error) throw new Error(error.message);
  const weeks = (data ?? []).map((r) => r.revenue as RevenueWeek).filter((r) => r?.v === REVENUE_VERSION);
  const missingWeeks: string[] = [];
  for (let monday = mondayOf(from); monday <= to; monday = addDays(monday, 7)) if (!weeks.some((w) => w.monday === monday)) missingWeeks.push(monday);
  const check = paymentCheck(weeks, from, to, today);
  // Age of the stays that still owe (the only ones the payment refresh re-pulls); fully paid stays do not change. 1 = the debt tolerance of bluejay-debt.ts.
  return { ...check, missingWeeks, oldestAsOf: check.rows.filter((r) => r.balance > 1).map((r) => r.asOf).sort()[0] ?? null };
}

/**
 * OTAs pay weeks after the stay, and a stored week is pulled once, so its "paid / balance" goes stale. Re-pulls only the reservations
 * (not occupancy or services) of the weeks and hotels that still show an open OTA debt, stalest first, and stamps paymentsAt.
 * A week is saved only when all its hotels were pulled; a week that is cut short is retried next run.
 */
export async function refreshPayments(db: SupabaseClient, deadline = Infinity, { trigger = "cron", minAgeMs = 0 }: { trigger?: SyncTrigger; minAgeMs?: number } = {}) {
  const result = { weeks: 0, remaining: 0, stoppedBy: null as null | "deadline" | "window", lastError: null as string | null };
  const stored = await recentRevenueWeeks(db);
  // minAgeMs: the cron skips weeks pulled in the last hours (their payments are not older than a day); the button passes 0.
  const cutoff = new Date(Date.now() - minAgeMs).toISOString();
  const targets = weeksWithDebt(stored).filter((t) => t.asOf <= cutoff);
  result.remaining = targets.length;
  if (!targets.length) return result;
  const started = new Date().toISOString();
  // One row in the run log while it works: syncBusy sees it, so a second refresh or a sync cannot start alongside.
  const { data: run, error: runError } = await db.from("bluejay_sync_runs").insert({ week_start: targets[0].monday, trigger, status: "running", message: "Làm mới thanh toán OTA", started_at: started }).select("id").single();
  if (runError) throw new Error(`Không ghi được log đồng bộ: ${runError.message}`);
  const check = stopCheck(deadline);
  for (const target of targets) {
    try { check(); } catch (e) { result.stoppedBy = (e as SyncStop).reason; break; }
    const week: RevenueWeek = structuredClone(stored.find((w) => w.monday === target.monday)!);
    try {
      for (const hotelId of target.hotelIds) {
        const reservations = await fetchAllReservations(db, hotelId, { dateType: 1, from: apiDate(target.monday), to: apiDate(target.end) }, check);
        const hotel = week.hotels.find((h) => h.id === hotelId)!;
        hotel.basis = "checkout";
        hotel.bookings = revenueBookings(reservations, week.monday, week.end);
        hotel.excluded = revenueBookings(reservations, week.monday, week.end, true);
      }
      week.paymentsAt = new Date().toISOString();
      const { error } = await db.from("bluejay_revenue_weeks").update({ revenue: week }).eq("week_start", week.monday);
      if (error) throw new Error(error.message);
      result.weeks++; result.remaining--;
    } catch (e) {
      if (e instanceof SyncStop) { result.stoppedBy = e.reason; break; }
      result.lastError = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
    }
  }
  const { count } = await db.from("bluejay_api_calls").select("id", { count: "exact", head: true }).gte("called_at", started);
  const summary = `Làm mới thanh toán OTA: ${result.weeks} tuần${result.remaining ? `, còn ${result.remaining}` : ""}${result.lastError ? `. Lỗi: ${result.lastError}` : ""}`;
  await db.from("bluejay_sync_runs").update({ status: result.lastError ? "failed" : "success", message: summary.slice(0, 1000), api_calls: count ?? null, finished_at: new Date().toISOString() }).eq("id", run.id);
  return result;
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

/** The week in progress moves until Sunday: its Monday when the stored copy is missing or older than minAgeMs (the cron passes ~a day), else null. */
export async function currentWeekDue(db: SupabaseClient, minAgeMs: number) {
  const monday = mondayOf(todayVN());
  const { data, error } = await db.from("bluejay_weekly_reports").select("fetched_at").eq("week_start", monday).maybeSingle();
  if (error) throw new Error(error.message);
  return !data || Date.parse(data.fetched_at as string) < Date.now() - minAgeMs ? monday : null;
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

/**
 * Another run started in the last 10 minutes and has not finished (cron, "Chạy ngay", the payment refresh and the backfill script must not overlap).
 * A run still "running" after 10 minutes was killed (timeout, Ctrl+C): it is closed as failed here, so the log never shows it running forever.
 */
export async function syncBusy(db: SupabaseClient) {
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  await db.from("bluejay_sync_runs").update({ status: "failed", message: "Bị dừng giữa chừng (quá 10 phút không kết thúc); tuần này sẽ được lấy lại ở lượt sau.", finished_at: new Date().toISOString() }).eq("status", "running").lt("started_at", since);
  const { data } = await db.from("bluejay_sync_runs").select("id").eq("status", "running").gte("started_at", since).limit(1);
  return Boolean(data?.length);
}

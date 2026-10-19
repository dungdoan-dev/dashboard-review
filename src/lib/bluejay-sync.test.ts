// The code that pulls Blue Jay and writes the stored weeks: which weeks run, when it stops, what is saved, what blocks a second run.
// It runs against an in-memory stand-in for the Supabase client and a stubbed fetch, with the clock fixed inside the API window.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllReservations, plannedWeeks, refreshPayments, syncBusy, syncWeeks } from "./bluejay.ts";
import { REVENUE_VERSION, type RevenueWeek } from "./bluejay-revenue.ts";

type Row = Record<string, unknown>;
const KEYS: Record<string, string> = { bluejay_weekly_reports: "week_start", bluejay_revenue_weeks: "week_start", bluejay_sync_settings: "id" };

/** Just the query methods bluejay.ts uses. Filters compare strings, like the ISO dates in the tables. */
function fakeDb(tables: Record<string, Row[]> = {}) {
  const t = (name: string) => (tables[name] ??= []);
  const ids = new Map<string, number>();
  class Query implements PromiseLike<{ data: unknown; count: number | null; error: { message: string } | null }> {
    filters: ((r: Row) => boolean)[] = [];
    columns = ""; opts: { head?: boolean; count?: string } = {}; one: "single" | "maybe" | null = null; max = Infinity; sort: [string, boolean] | null = null;
    table: string; op: "select" | "insert" | "update" | "upsert"; payload: Row; // plain fields: Node strips types and does not support parameter properties
    constructor(table: string, op: "select" | "insert" | "update" | "upsert", payload: Row = {}) { this.table = table; this.op = op; this.payload = payload; }
    select(columns = "*", opts: { head?: boolean; count?: string } = {}) { this.columns = columns; this.opts = opts; return this; }
    eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
    gte(c: string, v: string) { this.filters.push((r) => String(r[c]) >= v); return this; }
    lte(c: string, v: string) { this.filters.push((r) => String(r[c]) <= v); return this; }
    lt(c: string, v: string) { this.filters.push((r) => String(r[c]) < v); return this; }
    not(c: string, _is: string, v: unknown) { this.filters.push((r) => r[c] !== v && r[c] !== undefined); return this; }
    order(c: string, o: { ascending?: boolean } = {}) { this.sort = [c, o.ascending !== false]; return this; }
    limit(n: number) { this.max = n; return this; }
    single() { this.one = "single"; return this; }
    maybeSingle() { this.one = "maybe"; return this; }
    run() {
      const rows = t(this.table);
      let data: Row[];
      if (this.op === "insert") {
        const row = { ...this.payload, id: (ids.set(this.table, (ids.get(this.table) ?? 0) + 1), ids.get(this.table)), called_at: new Date().toISOString() };
        rows.push(row); data = [row];
      } else if (this.op === "upsert") {
        const key = KEYS[this.table], at = rows.findIndex((r) => r[key] === this.payload[key]);
        if (at >= 0) rows[at] = { ...rows[at], ...this.payload }; else rows.push({ ...this.payload });
        data = [];
      } else {
        data = rows.filter((r) => this.filters.every((f) => f(r)));
        if (this.op === "update") for (const r of data) Object.assign(r, this.payload);
      }
      if (this.sort) { const [c, asc] = this.sort; data = [...data].sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : 1) * (asc ? 1 : -1)); }
      data = data.slice(0, this.max);
      // "v:report->v" style aliases: the version inside the stored json
      const alias = this.columns.match(/v:(\w+)->v/);
      if (alias) data = data.map((r) => ({ week_start: r.week_start, v: (r[alias[1]] as Row | undefined)?.v }));
      const count = this.opts.count ? data.length : null;
      if (this.opts.head) return { data: null, count, error: null };
      if (this.one === "single") return data.length ? { data: data[0], count, error: null } : { data: null, count, error: { message: "no row" } };
      if (this.one === "maybe") return { data: data[0] ?? null, count, error: null };
      return { data, count, error: null };
    }
    then<R1, R2>(ok?: ((v: ReturnType<Query["run"]>) => R1 | PromiseLike<R1>) | null, bad?: ((e: unknown) => R2 | PromiseLike<R2>) | null) { return Promise.resolve(this.run()).then(ok, bad); }
  }
  const db = {
    from: (table: string) => ({
      select: (c?: string, o?: { head?: boolean; count?: string }) => new Query(table, "select").select(c, o),
      insert: (row: Row) => new Query(table, "insert", row),
      update: (row: Row) => new Query(table, "update", row),
      upsert: (row: Row) => new Query(table, "upsert", row),
    }),
  };
  return { db: db as unknown as SupabaseClient, tables };
}

const IN_WINDOW = new Date("2026-10-19T17:05:00Z"); // 00:05 on Monday 20/10 in Vietnam; the last full week is 12/10
const OUT_OF_WINDOW = new Date("2026-10-19T20:00:00Z"); // 03:00 in Vietnam

type Respond = (endpoint: string, params: URLSearchParams) => unknown;
/** Stubs fetch for the Blue Jay API; returns the list of calls made. */
function stubBluejay(respond: Respond) {
  const calls: string[] = [];
  mock.method(globalThis, "fetch", async (input: unknown) => {
    const url = new URL(String(input));
    const endpoint = url.pathname.split("/").pop()!;
    calls.push(`${endpoint}?${url.searchParams}`);
    return new Response(JSON.stringify(respond(endpoint, url.searchParams)), { status: 200 });
  });
  return calls;
}
const occupancy = { data: { GrandTotal: { RoomTypes: [{ RoomTypeName: "Deluxe", DailyDetails: [{ Date: "05/10/2026", RoomOccupied: 1, TotalRoom: 2 }] }] } } };
const noReservations = { meta: { total: 0 }, data: { attributes: { reservations: [] } } };
const happyPath: Respond = (endpoint) => (endpoint === "report-room-occupancy" ? occupancy : endpoint === "reservation" ? noReservations : { data: [] });

const setup = (now = IN_WINDOW) => { process.env.BLUEJAY_API_KEY = "test"; mock.timers.enable({ apis: ["Date"], now }); };
const teardown = () => { mock.timers.reset(); mock.restoreAll(); };

test("fetchAllReservations reads every page until the total is reached", async () => {
  setup();
  try {
    const { db } = fakeDb();
    const calls = stubBluejay((_, p) => ({ meta: { total: 3 }, data: { attributes: { reservations: p.get("page") === "1" ? [{ bookingCode: "1" }, { bookingCode: "2" }] : [{ bookingCode: "3" }] } } }));
    const rows = await fetchAllReservations(db, 5381, { dateType: 3, from: "2026-10-5", to: "2026-10-11" });
    assert.deepEqual(rows.map((r) => r.bookingCode), ["1", "2", "3"]);
    assert.equal(calls.length, 2);
  } finally { teardown(); }
});

test("syncWeeks: a failed week is logged and skipped, the others are saved; nothing is saved for the failed one", async () => {
  setup();
  try {
    const { db, tables } = fakeDb();
    stubBluejay((endpoint, p) => (endpoint === "reservation" && p.get("from") === "2026-10-12" ? {} : happyPath(endpoint, p))); // only the week of 12/10 asks for reservations from that day
    const r = await syncWeeks(db, ["2026-10-19", "2026-10-12", "2026-10-05"], "manual");
    assert.deepEqual({ done: r.done, failed: r.failed, remaining: r.remaining, stoppedBy: r.stoppedBy }, { done: 2, failed: 1, remaining: 0, stoppedBy: null });
    assert.deepEqual(tables.bluejay_sync_runs.map((x) => [x.week_start, x.status]), [["2026-10-19", "success"], ["2026-10-12", "failed"], ["2026-10-05", "success"]]);
    assert.deepEqual(tables.bluejay_weekly_reports.map((x) => x.week_start), ["2026-10-19", "2026-10-05"]);
    assert.deepEqual(tables.bluejay_revenue_weeks.map((x) => x.week_start), ["2026-10-19", "2026-10-05"]);
    assert.ok(String(tables.bluejay_sync_runs[1].message).includes("danh sách đặt phòng")); // the reason is in the run log
  } finally { teardown(); }
});

test("syncWeeks stops before the first call when the API window is closed, and keeps every week as remaining", async () => {
  setup(OUT_OF_WINDOW);
  try {
    const { db, tables } = fakeDb();
    const calls = stubBluejay(happyPath);
    const r = await syncWeeks(db, ["2026-10-12", "2026-10-05"], "cron");
    assert.deepEqual({ done: r.done, remaining: r.remaining, stoppedBy: r.stoppedBy }, { done: 0, remaining: 2, stoppedBy: "window" });
    assert.equal(calls.length, 0);
    assert.equal(tables.bluejay_sync_runs?.length ?? 0, 0);
  } finally { teardown(); }
});

test("plannedWeeks: the last full week first when missing, then missing backfill weeks newest first, stored weeks skipped", async () => {
  setup();
  try {
    const stored = (monday: string) => ({ week_start: monday });
    const { db } = fakeDb({
      bluejay_sync_settings: [{ id: 1, enabled: true, backfill_from: "2026-09-14", backfill_to: "2026-10-05" }],
      bluejay_weekly_reports: ["2026-09-28"].map((m) => ({ ...stored(m), report: { v: 3 } })),
      bluejay_revenue_weeks: ["2026-09-28"].map((m) => ({ ...stored(m), revenue: { v: REVENUE_VERSION } })),
    });
    assert.deepEqual(await plannedWeeks(db), ["2026-10-12", "2026-10-05", "2026-09-21", "2026-09-14"]);
    const off = fakeDb({ bluejay_sync_settings: [{ id: 1, enabled: false, backfill_from: null, backfill_to: null }] });
    assert.deepEqual(await plannedWeeks(off.db), []);
  } finally { teardown(); }
});

test("refreshPayments: pulls a week with an open OTA debt, leaves a running row while it works, and a recent week is skipped by the cron", async () => {
  setup();
  try {
    const owing = { code: "A1", ref: "", source: "Agoda", channel: "Agoda", roomType: "T", room: "R", status: "Đã trả phòng", bookDate: "2026-10-01", checkIn: "2026-10-05", checkOut: "2026-10-07", nights: 2, nightsInWeek: 2, roomPrice: 100, roomInWeek: 100, servicePrice: 0, totalPrice: 100, payment: 0, balance: 100, deposit: 0, stay: true, flags: [] };
    const week: RevenueWeek = { v: REVENUE_VERSION, monday: "2026-10-05", end: "2026-10-11", fetchedAt: "2026-10-12T00:00:00.000Z", hotels: [{ id: 5381, name: "Sontra Sea", bookings: [owing], services: [] }] };
    const { db, tables } = fakeDb({ bluejay_revenue_weeks: [{ week_start: "2026-10-05", revenue: week }] });
    let busyWhileRunning: boolean | null = null;
    stubBluejay((endpoint) => {
      if (endpoint !== "reservation") return {};
      void syncBusy(db).then((busy) => { busyWhileRunning ??= busy; });
      return { meta: { total: 1 }, data: { attributes: { reservations: [{ bookingCode: "A1", source: "Agoda", status: "Đã trả phòng", roomName: "R", roomType: "T", checkInTime: "2026-10-05", checkOutTime: "2026-10-07", night: 2, roomPrice: 100, servicePrice: 0, totalPrice: 100, payment: 100, balance: 0 }] } } };
    });
    const first = await refreshPayments(db, Infinity, { trigger: "manual" });
    assert.deepEqual({ weeks: first.weeks, remaining: first.remaining }, { weeks: 1, remaining: 0 });
    const saved = tables.bluejay_revenue_weeks[0].revenue as RevenueWeek;
    assert.equal(saved.hotels[0].bookings[0].balance, 0);
    assert.ok(saved.paymentsAt);
    assert.equal(busyWhileRunning, true); // a second refresh or a sync would have been refused meanwhile
    assert.deepEqual(tables.bluejay_sync_runs.map((r) => [r.trigger, r.status]), [["manual", "success"]]);
    assert.equal(await syncBusy(db), false); // finished: nothing blocks the next run

    // A week that still shows a debt but was pulled a minute ago: the cron (minAgeMs) leaves it alone, no run row, no API call.
    (tables.bluejay_revenue_weeks[0].revenue as RevenueWeek).hotels[0].bookings[0].balance = 100;
    const calls = stubBluejay(() => ({}));
    const again = await refreshPayments(db, Infinity, { trigger: "cron", minAgeMs: 20 * 3_600_000 });
    assert.deepEqual({ weeks: again.weeks, remaining: again.remaining }, { weeks: 0, remaining: 0 });
    assert.equal(calls.length, 0);
    assert.equal(tables.bluejay_sync_runs.length, 1);
  } finally { teardown(); }
});

test("syncBusy: a fresh running row blocks, a row stuck for over 10 minutes is closed as failed and no longer blocks", async () => {
  setup();
  try {
    const now = Date.now();
    const { db, tables } = fakeDb({ bluejay_sync_runs: [
      { id: 1, week_start: "2026-10-05", status: "running", started_at: new Date(now - 15 * 60_000).toISOString() },
      { id: 2, week_start: "2026-10-12", status: "running", started_at: new Date(now - 60_000).toISOString() },
    ] });
    assert.equal(await syncBusy(db), true); // the fresh one
    assert.deepEqual(tables.bluejay_sync_runs.map((r) => r.status), ["failed", "running"]);
    tables.bluejay_sync_runs[1].status = "success";
    assert.equal(await syncBusy(db), false);
  } finally { teardown(); }
});

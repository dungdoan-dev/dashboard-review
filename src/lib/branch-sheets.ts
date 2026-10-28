import { serviceDb } from "@/lib/bluejay";
import { pickLinks, type BranchSheets, type LinkRow as Row, type SheetKind } from "@/lib/ledger-sheets";

// The Google Sheet links of every branch, from the table branch_sheets (Cài đặt → Link Google Sheet): every month has its own link per branch and kind. Server only.
// A month without a link has none: the old shared links (month "") are not used.

let cache: { at: number; rows: Row[] } | null = null;
const TTL = 60_000; // shortcut: per server instance, a link changed in Cài đặt reaches another instance within a minute

type DbError = { code?: string; message?: string };
const noMonthColumn = (e: DbError) => e.code === "42703" || e.code === "PGRST204" || /\bmonth\b/.test(e.message ?? "");
const tableMissing = (e: DbError) => e.code === "42P01" || e.code === "PGRST205" || /branch_sheets/.test(e.message ?? "");
const MIGRATION = "20261028000000_branch_sheets_month.sql";

async function rows(): Promise<Row[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.rows;
  let { data, error } = await serviceDb().from("branch_sheets").select("hotel_id, kind, month, sheet_id");
  if (error && noMonthColumn(error)) ({ data, error } = await serviceDb().from("branch_sheets").select("hotel_id, kind, sheet_id")); // before the month migration
  if (error) {
    if (tableMissing(error)) return []; // before the first migration there are no links
    throw new Error(`Không đọc được link Google Sheet: ${error.message}`);
  }
  const list = (data ?? []).map((r: Partial<Row> & { hotel_id: number; kind: SheetKind; sheet_id: string }) => ({ hotel_id: r.hotel_id, kind: r.kind, month: r.month ?? "", sheet_id: r.sheet_id }));
  cache = { at: Date.now(), rows: list };
  return list;
}

/** The links of every branch for a month (YYYY-MM): only the ones saved for that month. */
export async function branchSheets(month: string): Promise<BranchSheets> {
  return pickLinks(await rows(), month);
}

/** The sheet id of a branch for a kind and a month, undefined when there is none. */
export async function sheetIdOf(hotel: number, kind: SheetKind, month: string) {
  return (await branchSheets(month))[hotel]?.[kind]?.id;
}

/** Sets (id) or removes (null) the link of a branch for a month; the cache is dropped on this instance. */
export async function saveBranchSheet(hotel: number, kind: SheetKind, month: string, id: string | null) {
  const table = serviceDb().from("branch_sheets");
  const { error } = id
    ? await table.upsert({ hotel_id: hotel, kind, month, sheet_id: id, updated_at: new Date().toISOString() }, { onConflict: "hotel_id,kind,month" })
    : await table.delete().eq("hotel_id", hotel).eq("kind", kind).eq("month", month);
  cache = null;
  if (error) throw new Error(noMonthColumn(error) ? `Chưa có cột tháng: chạy migration ${MIGRATION} trong Supabase.` : tableMissing(error) ? "Chưa có bảng branch_sheets: chạy migration 20261026000000_branch_sheets.sql rồi " + MIGRATION + " trong Supabase." : error.message);
}

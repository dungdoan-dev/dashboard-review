import { serviceDb } from "@/lib/bluejay";
import type { SheetKind } from "@/lib/ledger-sheets";

// The Google Sheet links of every branch, from the table branch_sheets (Cài đặt → Link Google Sheet). Server only.
export type BranchSheets = Record<number, Partial<Record<SheetKind, string>>>;

let cache: { at: number; links: BranchSheets } | null = null;
const TTL = 60_000; // shortcut: per server instance, a link changed in Cài đặt reaches another instance within a minute

// The four hotel links the migration seeds: used only while the table does not exist yet, so a deploy before the migration keeps working.
const BEFORE_MIGRATION: BranchSheets = {
  5381: { hotel: "1HvweFPj0RlzUA3qUaBYVQOoHh8PrBLpuTvDIqIelTmU" },
  6836: { hotel: "1LJgUrctGwBPcynAjdHZlG4u8kbhCpuZGk4R9GWxciOk" },
  6495: { hotel: "1b_38S409K5glxanqYGUU8IpsKroV0Gq8h5ppeK006Tc" },
  6209: { hotel: "15_6wGXPamuVApuTmyeUDH01J2OFHgr-d0GeTWVUhcIo" },
};
const tableMissing = (e: { code?: string; message?: string }) => e.code === "42P01" || e.code === "PGRST205" || /branch_sheets/.test(e.message ?? "");

export async function branchSheets(): Promise<BranchSheets> {
  if (cache && Date.now() - cache.at < TTL) return cache.links;
  const { data, error } = await serviceDb().from("branch_sheets").select("hotel_id, kind, sheet_id");
  if (error) {
    if (tableMissing(error)) return BEFORE_MIGRATION;
    throw new Error(`Không đọc được link Google Sheet: ${error.message}`);
  }
  const links: BranchSheets = {};
  for (const r of data ?? []) (links[r.hotel_id] ??= {})[r.kind as SheetKind] = r.sheet_id;
  cache = { at: Date.now(), links };
  return links;
}

/** The sheet id of a branch for a kind, undefined when the branch has none. */
export async function sheetIdOf(hotel: number, kind: SheetKind) {
  return (await branchSheets())[hotel]?.[kind];
}

/** Sets (id) or removes (null) the link of a branch; the cache is dropped on this instance. */
export async function saveBranchSheet(hotel: number, kind: SheetKind, id: string | null) {
  const table = serviceDb().from("branch_sheets");
  const { error } = id ? await table.upsert({ hotel_id: hotel, kind, sheet_id: id, updated_at: new Date().toISOString() }) : await table.delete().eq("hotel_id", hotel).eq("kind", kind);
  cache = null;
  if (error) throw new Error(tableMissing(error) ? "Chưa có bảng branch_sheets: chạy migration 20261026000000_branch_sheets.sql trong Supabase." : error.message);
}

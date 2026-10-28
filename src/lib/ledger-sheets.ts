// Google Sheet links of a branch (a Blue Jay hotel): "hotel" = the hotel's thu chi and kho, "fnb" = Ăn sáng, cafe, mini mart.
// The links live in the table branch_sheets (Cài đặt → Link Google Sheet, read by src/lib/branch-sheets.ts); this file only has the pure helpers.
// Only ids (not secret), no imports: the page and the tests use it.
export type SheetKind = "hotel" | "fnb";
export const SHEET_KINDS: { kind: SheetKind; label: string }[] = [{ kind: "hotel", label: "Khách sạn" }, { kind: "fnb", label: "Ăn sáng, cafe, mini mart" }];
export const isSheetKind = (v: unknown): v is SheetKind => v === "hotel" || v === "fnb";

export type LinkRow = { hotel_id: number; kind: SheetKind; month: string; sheet_id: string };
export type BranchSheets = Record<number, Partial<Record<SheetKind, { id: string; own: boolean }>>>; // own = saved for that month, not the shared one

/** The links of every branch for a month (YYYY-MM): the one saved for that month, else the shared one (month ""), links of other months never. */
export function pickLinks(list: LinkRow[], month: string): BranchSheets {
  const links: BranchSheets = {};
  for (const r of list) {
    if (r.month !== month && r.month !== "") continue;
    const own = r.month === month, have = (links[r.hotel_id] ??= {})[r.kind];
    if (!have || (own && !have.own)) links[r.hotel_id][r.kind] = { id: r.sheet_id, own };
  }
  return links;
}

/** Address of a spreadsheet (no tab), to open it in the browser. */
export const sheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

/** The id from what an admin pastes: a docs.google.com link or the bare id; null when it is neither. */
export function sheetIdFromLink(text: string): string | null {
  const t = text.trim();
  const link = t.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})(?:[/?#].*)?$/);
  if (link) return link[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(t) ? t : null;
}

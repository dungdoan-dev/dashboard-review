// Excel export of the finalized daily reports in the same layout as the "Nhập dữ liệu cũ" template (historical-report-import.ts):
// row 2 = platform, row 3 = branch, row 4 = field, column A = date. Tripadvisor groups carry an extra "Xếp hạng" column
// (the importer skips that column). Imports use ".ts" so the round-trip test can run this with plain Node.
import * as XLSX from "xlsx";
import { PLATFORM_LABELS } from "./platforms.ts";
import type { Platform } from "./types.ts";

export type ExportSnapshot = { locationId: string; platform: Platform; date: string; rating: number | null; reviewCount: number | null; rank: string | null };
type Cell = string | number | null;

const dmy = (date: string) => date.split("-").reverse().join("/");

/** Platforms with no data at all are left out, so a Cafe file has no Booking columns. */
export function reportSheetRows(locations: { id: string; name: string }[], platforms: Platform[], snapshots: ExportSnapshot[]) {
  const key = (locationId: string, platform: Platform, date: string) => `${locationId}|${platform}|${date}`;
  const byKey = new Map(snapshots.map((s) => [key(s.locationId, s.platform, s.date), s]));
  const dates = [...new Set(snapshots.map((s) => s.date))].sort();

  const groups: { platform: Platform; location: { id: string; name: string }; fields: ("count" | "rating" | "rank")[] }[] = [];
  for (const platform of platforms) {
    if (!snapshots.some((s) => s.platform === platform)) continue;
    for (const location of locations) {
      if (!snapshots.some((s) => s.platform === platform && s.locationId === location.id)) continue;
      groups.push({ platform, location, fields: platform === "tripadvisor" ? ["count", "rating", "rank"] : ["count", "rating"] });
    }
  }

  const FIELD_LABELS = { count: "Số review", rating: "Điểm sao", rank: "Xếp hạng" };
  const platformRow: Cell[] = [null], branchRow: Cell[] = [null], fieldRow: Cell[] = ["Ngày"];
  const merges: XLSX.Range[] = [];
  for (const group of groups) {
    const start = platformRow.length;
    for (const field of group.fields) { platformRow.push(PLATFORM_LABELS[group.platform]); branchRow.push(group.location.name); fieldRow.push(FIELD_LABELS[field]); }
    if (group.fields.length > 1) {
      merges.push({ s: { r: 1, c: start }, e: { r: 1, c: platformRow.length - 1 } }, { s: { r: 2, c: start }, e: { r: 2, c: platformRow.length - 1 } });
    }
  }
  const body = dates.map((date): Cell[] => [dmy(date), ...groups.flatMap((group) => {
    const s = byKey.get(key(group.location.id, group.platform, date));
    return group.fields.map((field) => (field === "count" ? s?.reviewCount : field === "rating" ? s?.rating : s?.rank) ?? null);
  })]);
  return { aoa: [[], platformRow, branchRow, fieldRow, ...body] as Cell[][], merges, groups: groups.length, dates: dates.length };
}

export function reportWorkbook(title: string, locations: { id: string; name: string }[], platforms: Platform[], snapshots: ExportSnapshot[]): { data: ArrayBuffer; groups: number; dates: number } {
  const { aoa, merges, groups, dates } = reportSheetRows(locations, platforms, snapshots);
  aoa[0] = [title];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = merges;
  ws["!cols"] = aoa[3].map((_, i) => ({ wch: i === 0 ? 12 : 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bảng số liệu");
  return { data: XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer, groups, dates };
}

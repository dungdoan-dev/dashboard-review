import * as XLSX from "xlsx";
import { DEFAULT_RATING_SCALE } from "@/lib/platforms";
import type { LocationRecord, Platform } from "@/lib/types";

export type HistoricalReportDraft = {
  sourceLocationName: string;
  platform: Platform;
  reportDate: string;
  rating: number | null;
  reviewCount: number | null;
};

export type HistoricalReportBranch = {
  sourceName: string;
  locationId: string | null;
};

export type HistoricalReportPreview = {
  fileName: string;
  sheetName: string;
  branches: HistoricalReportBranch[];
  rows: HistoricalReportDraft[];
  skippedCells: number;
  warnings: string[];
};

type MergeRange = { s: { r: number; c: number }; e: { r: number; c: number } };

const platformAliases: Record<string, Platform> = {
  googlemaps: "google",
  tripadvisor: "tripadvisor",
  agoda: "agoda",
  booking: "booking",
  bookingcom: "booking",
  expedia: "expedia",
  tripcom: "tripcom",
  traveloka: "traveloka",
};

function normalizeLabel(value: string): string {
  return value
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function mergedCellValue(
  rows: unknown[][],
  merges: MergeRange[],
  rowIndex: number,
  columnIndex: number,
): unknown {
  const merge = merges.find(
    (range) =>
      range.s.r <= rowIndex &&
      range.e.r >= rowIndex &&
      range.s.c <= columnIndex &&
      range.e.c >= columnIndex,
  );
  if (merge) return rows[merge.s.r]?.[merge.s.c] ?? null;
  return rows[rowIndex]?.[columnIndex] ?? null;
}

function parseDate(value: unknown): string | null {
  const finish = (year: number | string, month: number, day: number) => {
    const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
  };

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return finish(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parts = XLSX.SSF.parse_date_code(value);
    if (!parts) return null;
    return finish(parts.y, parts.m, parts.d);
  }

  if (typeof value !== "string") return null;
  const input = value.trim();
  const iso = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return finish(iso[1], Number(iso[2]), Number(iso[3]));
  const local = input.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (!local) return null;
  const year = local[3].length === 2 ? `20${local[3]}` : local[3];
  return finish(year, Number(local[2]), Number(local[1]));
}

function parseNumeric(value: unknown, kind: "rating" | "count"): number | null {
  if (value == null || (typeof value === "string" && ["", "--", "-", "n/a"].includes(value.trim().toLowerCase()))) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const text = value.trim().replace(/\s/g, "");
  const normalized = kind === "rating"
    ? text.replace(",", ".")
    : text.replace(/[.,]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function findLocationId(
  sourceName: string,
  locations: Pick<LocationRecord, "id" | "name">[],
): string | null {
  const sourceKey = normalizeLabel(sourceName);
  const exact = locations.filter((location) => normalizeLabel(location.name) === sourceKey);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null;

  const partial = locations.filter((location) => {
    const locationKey = normalizeLabel(location.name);
    return locationKey.length > 0 && (locationKey.includes(sourceKey) || sourceKey.includes(locationKey));
  });
  return partial.length === 1 ? partial[0].id : null;
}

export function parseHistoricalReportWorkbook(
  data: ArrayBuffer,
  fileName: string,
  locations: Pick<LocationRecord, "id" | "name">[],
): HistoricalReportPreview {
  const workbook = XLSX.read(data);
  const sheetName = workbook.SheetNames[0];
  const worksheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!worksheet || !sheetName) throw new Error("File Excel không có trang tính để nhập.");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  if (rows.length < 5) throw new Error("Không tìm thấy phần tiêu đề và dữ liệu theo ngày trong file.");

  const merges = (worksheet["!merges"] ?? []) as MergeRange[];
  const headerValue = (row: number, column: number) => mergedCellValue(rows, merges, row, column);
  const headerText = (row: number, column: number) => {
    const value = headerValue(row, column);
    return typeof value === "string" ? value.trim() : "";
  };

  const groups: Array<{ start: number; end: number; platformLabel: string; sourceLocationName: string }> = [];
  const columnCount = Math.max(...rows.map((row) => row.length));
  for (let column = 1; column < columnCount;) {
    const platformLabel = headerText(1, column);
    const sourceLocationName = headerText(2, column);
    if (!platformLabel || !sourceLocationName) {
      column += 1;
      continue;
    }
    const start = column;
    while (
      column + 1 < columnCount &&
      headerText(1, column + 1) === platformLabel &&
      headerText(2, column + 1) === sourceLocationName
    ) column += 1;
    groups.push({ start, end: column, platformLabel, sourceLocationName });
    column += 1;
  }
  if (!groups.length) throw new Error("Không nhận diện được tiêu đề nền tảng và chi nhánh ở dòng 2–3.");

  const branches = new Map<string, HistoricalReportBranch>();
  const output: HistoricalReportDraft[] = [];
  const warnings = new Set<string>();
  let skippedCells = 0;
  if (groups.some((group) => {
    for (let column = group.start; column <= group.end; column += 1) {
      if (normalizeLabel(headerText(3, column)) === "xephang") return true;
    }
    return false;
  })) warnings.add("Cột xếp hạng được bỏ qua; báo cáo chốt ngày hiện lưu điểm và lượt đánh giá.");

  for (const group of groups) {
    const platform = platformAliases[normalizeLabel(group.platformLabel)];
    const fieldColumns = new Map<string, number>();
    for (let column = group.start; column <= group.end; column += 1) {
      const field = normalizeLabel(headerText(3, column));
      if (field === "soreview") fieldColumns.set("count", column);
      if (field === "diemsao") fieldColumns.set("rating", column);
    }
    if (!platform) {
      for (let row = 4; row < rows.length; row += 1) {
        if (group.start <= group.end && rows[row]?.slice(group.start, group.end + 1).some((value) => value != null && value !== "--")) {
          warnings.add(`Bỏ qua nền tảng chưa hỗ trợ: ${group.platformLabel}.`);
          break;
        }
      }
      continue;
    }
    if (!fieldColumns.has("rating") && !fieldColumns.has("count")) continue;

    if (!branches.has(group.sourceLocationName)) {
      branches.set(group.sourceLocationName, {
        sourceName: group.sourceLocationName,
        locationId: findLocationId(group.sourceLocationName, locations),
      });
    }

    for (let rowIndex = 4; rowIndex < rows.length; rowIndex += 1) {
      const sourceDate = rows[rowIndex]?.[0];
      const hasValues = [...fieldColumns.values()].some((column) => {
        const value = rows[rowIndex]?.[column];
        return value != null && !(typeof value === "string" && ["", "--", "-"].includes(value.trim()));
      });
      if (!hasValues) continue;

      const reportDate = parseDate(sourceDate);
      let rating = fieldColumns.has("rating")
        ? parseNumeric(rows[rowIndex]?.[fieldColumns.get("rating")!], "rating")
        : null;
      let reviewCount = fieldColumns.has("count")
        ? parseNumeric(rows[rowIndex]?.[fieldColumns.get("count")!], "count")
        : null;
      const scale = DEFAULT_RATING_SCALE[platform];

      if (!reportDate) {
        skippedCells += 1;
        warnings.add("Một số dòng dữ liệu bị bỏ qua do ngày không hợp lệ hoặc thiếu ngày.");
        continue;
      }
      const ratingSource = fieldColumns.has("rating") ? rows[rowIndex]?.[fieldColumns.get("rating")!] : null;
      const countSource = fieldColumns.has("count") ? rows[rowIndex]?.[fieldColumns.get("count")!] : null;
      const hasRatingSource = ratingSource != null && !(typeof ratingSource === "string" && ["", "--", "-"].includes(ratingSource.trim()));
      const hasCountSource = countSource != null && !(typeof countSource === "string" && ["", "--", "-"].includes(countSource.trim()));
      if (hasRatingSource && rating == null) {
        warnings.add(`Một số điểm không hợp lệ đã được bỏ qua tại ${group.sourceLocationName}, ${group.platformLabel}.`);
      }
      if (hasCountSource && reviewCount == null) {
        warnings.add(`Một số lượt đánh giá không hợp lệ đã được bỏ qua tại ${group.sourceLocationName}, ${group.platformLabel}.`);
      }
      if (rating == null && reviewCount == null) {
        skippedCells += 1;
        continue;
      }
      if (rating != null && (rating < 0 || rating > scale)) {
        rating = null;
        warnings.add(`Bỏ qua điểm ngoài thang ${scale} của ${platform} tại ${group.sourceLocationName}, ngày ${reportDate}.`);
      }
      if (reviewCount != null && (!Number.isInteger(reviewCount) || reviewCount < 0)) {
        reviewCount = null;
        warnings.add(`Bỏ qua số lượt đánh giá không hợp lệ tại ${group.sourceLocationName}, ngày ${reportDate}.`);
      }
      if (rating == null && reviewCount == null) {
        skippedCells += 1;
        continue;
      }

      output.push({ sourceLocationName: group.sourceLocationName, platform, reportDate, rating, reviewCount });
    }
  }

  const uniqueRows = new Map<string, HistoricalReportDraft>();
  for (const row of output) {
    const key = `${normalizeLabel(row.sourceLocationName)}:${row.platform}:${row.reportDate}`;
    if (uniqueRows.has(key)) warnings.add("File có ngày trùng cho cùng chi nhánh và nền tảng; dùng dòng xuất hiện sau cùng.");
    uniqueRows.set(key, row);
  }
  if (!uniqueRows.size) throw new Error("Không tìm thấy dữ liệu điểm hoặc số lượt đánh giá hợp lệ để nhập.");
  return {
    fileName,
    sheetName,
    branches: Array.from(branches.values()),
    rows: Array.from(uniqueRows.values()),
    skippedCells,
    warnings: Array.from(warnings),
  };
}

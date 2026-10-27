// The "Thời gian" choice of the review reports (header): the last N days, everything, or a typed from-to range.
export type ReportRange = "7" | "30" | "90" | "365" | "all" | "custom";
export type CustomRange = { from: string; to: string }; // yyyy-mm-dd

const DAY = 86_400_000;
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** A typed range is usable when both days are real dates and the first is not after the last. */
export const customValid = (c: CustomRange) => isDay(c.from) && isDay(c.to) && c.from <= c.to;

/**
 * First and last day (inclusive, yyyy-mm-dd) a report is cut to; null = no limit on that side.
 * "7" … "365" count back from `anchor` (today, or the latest finalized day when cutting loaded rows); a typed range is used as it is.
 */
export function rangeWindow(range: ReportRange, custom: CustomRange, anchor: string): { start: string | null; end: string | null } {
  if (range === "custom") return { start: custom.from, end: custom.to };
  if (range === "all") return { start: null, end: null };
  return { start: new Date(Date.parse(`${anchor}T00:00:00Z`) - (Number(range) - 1) * DAY).toISOString().slice(0, 10), end: null };
}

/** "30 ngày", "Toàn bộ" or "01/10/2026 – 20/10/2026" for headings; `fmt` turns yyyy-mm-dd into dd/mm/yyyy. */
export const rangeLabel = (range: ReportRange, custom: CustomRange, fmt: (d: string) => string) =>
  range === "custom" ? `${fmt(custom.from)} – ${fmt(custom.to)}` : range === "all" ? "Toàn bộ" : `${range} ngày`;

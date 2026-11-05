// Báo cáo tháng: the score table of a month, from the finalized daily reports. The score and review count of a place are the last report up to the end of the month
// (up to yesterday while the month is running); the change is against the report of the first day of the month (the last report before it, from the month before, when that day has none). No runtime "@/" imports: tested with plain Node.
import { computeScoreRow, normalize, type Baseline, type ScoreRow } from "./scoreboard.ts";
import { fmtDate } from "./format-date.ts";
import type { ExcelScoreRow } from "./scoreboard-excel.ts";
import type { LocationRecord, Metric, Platform } from "./types.ts";

/** A row of daily_report_snapshots. */
export type DayReport = { locationId: string; platform: Platform; date: string; rating: number | null; ratingScale: number; reviewCount: number | null };

const day = (d: Date) => d.toISOString().slice(0, 10);
const shift = (date: string, days: number) => day(new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000));
export const monthEndOf = (month: string) => day(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)));

/** from/to: the days of the month that are over (to = end of month, or yesterday for the running month; length 0 when none is over); prevStart/prevEnd: the month before. */
export function monthRange(month: string, today: string) {
  const from = `${month}-01`, end = monthEndOf(month), yesterday = shift(today, -1);
  const to = end < yesterday ? end : yesterday;
  const prevEnd = shift(from, -1);
  return { from, to, length: to >= from ? Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 : 0, prevStart: `${prevEnd.slice(0, 8)}01`, prevEnd };
}

/** Any date range, same shape as monthRange: the change is against the report of `from` (the last one in the 31 days before it, when that day has none). */
export function rangeOf(from: string, to: string) {
  return { from, to, length: to >= from ? Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 : 0, prevStart: shift(from, -31), prevEnd: shift(from, -1) };
}

const lastUpTo = (rows: DayReport[], limit: string) => rows.filter((r) => r.date <= limit).reduce<DayReport | null>((best, r) => (!best || r.date > best.date ? r : best), null);

/** One place of the month table. `reports`: that place's daily reports from the start of the month before to the end of this month (the month before is only the fallback for a base day without a report). */
export function monthScoreRow(location: LocationRecord, platforms: Platform[], reports: DayReport[], range: ReturnType<typeof monthRange>, scale: number): ScoreRow {
  const baseline: Baseline = {};
  const asOf: Partial<Record<Platform, Metric | null>> = {};
  for (const platform of platforms) {
    const own = reports.filter((r) => r.platform === platform);
    const now = lastUpTo(own, range.to), before = lastUpTo(own.filter((r) => r.date >= range.prevStart), range.from);
    asOf[platform] = now ? { rating: now.rating, ratingScale: now.ratingScale, reviewCount: now.reviewCount, countLabel: "đánh giá", capturedAt: now.date } : null;
    if (before && before.rating != null) baseline[`${location.id}|${platform}`] = { score: normalize(before.rating, before.ratingScale, scale), count: before.reviewCount, date: before.date };
  }
  return computeScoreRow({ ...location, ...asOf } as LocationRecord, platforms, scale, baseline);
}

const EPSILON = 0.05;
/** The table row as the Excel writer wants it; "Cập nhật" is the date of the last report in the month. */
export function toExcelRow(row: ScoreRow, platforms: Platform[]): ExcelScoreRow {
  return {
    name: row.location.name, area: row.location.area, avg: row.avg, total: row.total, updated: row.latest ? fmtDate(row.latest) : "Chưa có dữ liệu",
    cells: platforms.map((platform) => {
      const c = row.cells[platform];
      return { score: c?.score ?? null, count: c?.count ?? null, dScore: c?.dScore != null && Math.abs(c.dScore) > EPSILON ? Math.round(c.dScore * 10) / 10 : null, dCount: c?.dCount ?? null };
    }),
  };
}

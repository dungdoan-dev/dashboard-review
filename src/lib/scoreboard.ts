import type { LocationRecord, Platform } from "./types";

export type Baseline = Record<string, { score: number; count: number | null; date?: string }>;
export type Cell = { score: number | null; count: number | null; dScore: number | null; dCount: number | null };
export type ScoreRow = {
  location: LocationRecord;
  cells: Partial<Record<Platform, Cell>>;
  avg: number | null;
  total: number | null;
  dScore: number | null;
  dCount: number | null;
  latest: string | null;
};

export const normalize = (rating: number, scale: number, target: number) => (rating / scale) * target;

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Một hàng của bảng điểm. Điểm TB và thay đổi đều quy về cùng thang `scale`.
 * Thay đổi chỉ so các nguồn có cả số hiện tại lẫn mốc đã chốt, để thiếu một nguồn không làm lệch kết quả.
 * Khóa baseline: `${locationId}|${platform}`. Khi lần cào mới nhất có điểm mà thiếu số đánh giá (Agoda hay vậy), lấy số của ngày gần nhất có số (`lastCounts`, cùng khóa).
 */
export function computeScoreRow(location: LocationRecord, platforms: Platform[], scale: number, baseline: Baseline, lastCounts: Record<string, number> = {}): ScoreRow {
  const cells: ScoreRow["cells"] = {};
  const scores: number[] = [];
  let total: number | null = null;
  let latest: string | null = null;
  const common: { now: number; before: number; nowCount: number | null; beforeCount: number | null }[] = [];
  for (const platform of platforms) {
    const metric = location[platform];
    const score = metric?.rating == null ? null : normalize(metric.rating, metric.ratingScale, scale);
    const before = baseline[`${location.id}|${platform}`];
    const count = metric?.reviewCount ?? (metric?.rating != null ? lastCounts[`${location.id}|${platform}`] ?? null : null);
    cells[platform] = {
      score, count,
      dScore: score != null && before ? score - before.score : null,
      dCount: count != null && before?.count != null ? count - before.count : null,
    };
    if (score != null) scores.push(score);
    if (count != null) total = (total ?? 0) + count;
    if (metric?.capturedAt && (!latest || metric.capturedAt > latest)) latest = metric.capturedAt;
    if (score != null && before) common.push({ now: score, before: before.score, nowCount: count, beforeCount: before.count });
  }
  const countPairs = common.filter((item) => item.nowCount != null && item.beforeCount != null);
  return {
    location, cells, latest, total,
    avg: scores.length ? mean(scores) : null,
    dScore: common.length ? mean(common.map((item) => item.now)) - mean(common.map((item) => item.before)) : null,
    dCount: countPairs.length ? countPairs.reduce((sum, item) => sum + (item.nowCount! - item.beforeCount!), 0) : null,
  };
}

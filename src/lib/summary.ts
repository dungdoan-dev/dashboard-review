import type { LocationRecord, Platform } from "./types";

/** Báo cáo tổng hợp luôn quy đổi về thang 10 để người xem không phải nhớ thang của từng nền tảng. */
export const SUMMARY_SCALE = 10;

export type LocationSummary = {
  id: string;
  name: string;
  area: string;
  score: number | null;
  reviews: number | null;
  platformScores: Partial<Record<Platform, number>>;
};

export type TypeSummary = {
  count: number;
  scored: number;
  avgScore: number | null;
  totalReviews: number;
  platformAvg: { platform: Platform; score: number; locations: number }[];
  best: LocationSummary | null;
  worst: LocationSummary | null;
};

export type Snapshot = { locationId: string; platform: Platform; date: string; score: number | null; count: number | null };
export type TrendPoint = { date: string; score: number | null; gained: number };

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const toScale = (rating: number, scale: number) => (rating / scale) * SUMMARY_SCALE;

export function summarizeLocation(location: LocationRecord, platforms: Platform[]): LocationSummary {
  const platformScores: LocationSummary["platformScores"] = {};
  let reviews: number | null = null;
  for (const platform of platforms) {
    const metric = location[platform];
    if (metric?.rating != null && metric.ratingScale > 0) platformScores[platform] = toScale(metric.rating, metric.ratingScale);
    if (metric?.reviewCount != null) reviews = (reviews ?? 0) + metric.reviewCount;
  }
  const scores = Object.values(platformScores);
  return { id: location.id, name: location.name, area: location.area, score: scores.length ? mean(scores) : null, reviews, platformScores };
}

export function summarizeType(rows: LocationSummary[], platforms: Platform[]): TypeSummary {
  const scored = rows.filter((row) => row.score != null);
  return {
    count: rows.length,
    scored: scored.length,
    avgScore: scored.length ? mean(scored.map((row) => row.score!)) : null,
    totalReviews: rows.reduce((sum, row) => sum + (row.reviews ?? 0), 0),
    platformAvg: platforms.flatMap((platform) => {
      const values = rows.flatMap((row) => row.platformScores[platform] ?? []);
      return values.length ? [{ platform, score: mean(values), locations: values.length }] : [];
    }),
    // Chỉ có ý nghĩa khi so ít nhất hai cơ sở.
    best: scored.length > 1 ? scored.reduce((a, b) => (b.score! > a.score! ? b : a)) : null,
    worst: scored.length > 1 ? scored.reduce((a, b) => (b.score! < a.score! ? b : a)) : null,
  };
}

/**
 * Diễn biến theo ngày của một nhóm cơ sở từ các bản chốt sổ.
 * - score: trung bình điểm các cơ sở, mỗi cơ sở lấy trung bình các nền tảng đã có số tại ngày đó (giữ số cũ khi ngày thiếu).
 * - gained: tổng đánh giá tăng thêm kể từ số đầu tiên của từng nguồn trong kỳ, nên nguồn xuất hiện giữa kỳ không làm tổng nhảy vọt.
 */
export function buildTrend(snapshots: Snapshot[]): { points: TrendPoint[]; gained: number; byLocation: Record<string, number> } {
  const dates = [...new Set(snapshots.map((item) => item.date))].sort();
  const byDate = new Map<string, Snapshot[]>();
  for (const item of snapshots) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
  const first: Record<string, number> = {};
  const last: Record<string, { score: number | null; count: number | null; locationId: string }> = {};
  const points: TrendPoint[] = [];
  for (const date of dates) {
    for (const item of byDate.get(date)!) {
      const key = `${item.locationId}|${item.platform}`;
      if (item.count != null && !(key in first)) first[key] = item.count;
      last[key] = { score: item.score ?? last[key]?.score ?? null, count: item.count ?? last[key]?.count ?? null, locationId: item.locationId };
    }
    const perLocation: Record<string, number[]> = {};
    let gained = 0;
    for (const [key, state] of Object.entries(last)) {
      if (state.score != null) (perLocation[state.locationId] ??= []).push(state.score);
      if (state.count != null && key in first) gained += state.count - first[key];
    }
    const locationScores = Object.values(perLocation).map(mean);
    points.push({ date, score: locationScores.length ? mean(locationScores) : null, gained });
  }
  const byLocation: Record<string, number> = {};
  for (const [key, state] of Object.entries(last)) {
    if (state.count != null && key in first) byLocation[state.locationId] = (byLocation[state.locationId] ?? 0) + state.count - first[key];
  }
  return { points, gained: points.length ? points[points.length - 1].gained : 0, byLocation };
}

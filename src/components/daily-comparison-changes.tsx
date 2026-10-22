"use client";

import type { LocationRecord, Platform } from "@/lib/types";
import { fmtDate } from "@/lib/format-date";
import { ReachTable } from "@/components/reach-table";

type ComparisonRow = Record<string, string | number | null>;
type Snapshot = {
  locationId: string;
  platform: Platform;
  reportDate: string;
  rating: number | null;
  reviewCount: number | null;
};

function previousDate(date: string) {
  const previous = new Date(`${date}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

function sameCoverage(
  snapshots: Snapshot[], locationId: string, date: string, previous: string,
  platforms: Platform[], metric: "rating" | "reviewCount",
) {
  const sources = (day: string) => snapshots
    .filter((row) => row.locationId === locationId && row.reportDate === day && platforms.includes(row.platform) && row[metric] != null)
    .map((row) => row.platform).sort().join(",");
  const current = sources(date);
  return current.length > 0 && current === sources(previous);
}

function Change({ current, previous, kind }: { current: number | null; previous: number | null; kind: "score" | "reviews" }) {
  if (current == null || previous == null) return <span className="compare-no-change">—</span>;
  const change = current - previous;
  const rounded = kind === "score" ? Number(change.toFixed(2)) : change;
  const sign = rounded > 0 ? "+" : "";
  const amount = kind === "score" ? Math.abs(rounded).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.abs(rounded).toLocaleString("vi-VN");
  const percent = kind === "reviews" && previous > 0 ? ` (${sign}${(change / previous * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%)` : "";
  return <span className={rounded > 0 ? "compare-change-up" : rounded < 0 ? "compare-change-down" : "compare-change-flat"}>{rounded > 0 ? "+" : rounded < 0 ? "−" : ""}{amount}{percent}</span>;
}

export function DailyComparisonChanges({ locations, scoreRows, reviewRows, snapshots, platforms, ratingScale }: {
  locations: LocationRecord[];
  scoreRows: ComparisonRow[];
  reviewRows: ComparisonRow[];
  snapshots: Snapshot[];
  platforms: Platform[];
  ratingScale: number;
}) {
  const scores = new Map(scoreRows.map((row) => [String(row.date), row]));
  const reviews = new Map(reviewRows.map((row) => [String(row.date), row]));
  const dates = [...new Set([...scores.keys(), ...reviews.keys()])].sort().reverse();
  const rows = dates.flatMap((date) => locations.flatMap((location) => {
    const score = scores.get(date)?.[location.id];
    const review = reviews.get(date)?.[location.id];
    if (typeof score !== "number" && typeof review !== "number") return [];
    const prior = previousDate(date);
    const priorScore = scores.get(prior)?.[location.id];
    const priorReview = reviews.get(prior)?.[location.id];
    return [{
      date, location,
      score: typeof score === "number" ? score : null,
      review: typeof review === "number" ? review : null,
      priorScore: typeof priorScore === "number" && sameCoverage(snapshots, location.id, date, prior, platforms, "rating") ? priorScore : null,
      priorReview: typeof priorReview === "number" && sameCoverage(snapshots, location.id, date, prior, platforms, "reviewCount") ? priorReview : null,
    }];
  }));

  return <article className="report-card compare-table-card"><header><div><h3>Tăng giảm giữa các ngày</h3><p>So với ngày lịch liền trước. Dấu — nghĩa là thiếu ngày trước hoặc hai ngày không có cùng nguồn đã chốt.</p></div></header>
    <ReachTable compact rows={rows} rowKey={(row) => `${row.date}-${row.location.id}`} columns={[
      { label: "Ngày", text: (row) => fmtDate(row.date), sort: (row) => row.date },
      { label: "Cơ sở", text: (row) => row.location.name },
      { label: `Điểm / ${ratingScale}`, text: (row) => (row.score == null ? "—" : row.score.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })), value: (row) => row.score },
      { label: "Thay đổi điểm", text: (row) => (row.score == null || row.priorScore == null ? "—" : String(row.score - row.priorScore)), value: (row) => (row.score == null || row.priorScore == null ? null : row.score - row.priorScore), render: (row) => <Change current={row.score} previous={row.priorScore} kind="score" /> },
      { label: "Lượt đánh giá", text: (row) => (row.review == null ? "—" : row.review.toLocaleString("vi-VN")), value: (row) => row.review },
      { label: "Thay đổi lượt", text: (row) => (row.review == null || row.priorReview == null ? "—" : String(row.review - row.priorReview)), value: (row) => (row.review == null || row.priorReview == null ? null : row.review - row.priorReview), render: (row) => <Change current={row.review} previous={row.priorReview} kind="reviews" /> },
    ]} />
  </article>;
}

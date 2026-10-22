"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Gauge, MessageSquareQuote, Star, TrendingDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, parseDmy } from "@/lib/format-date";
import { DatePicker } from "@/components/date-picker";
import { ReachTable, type Col } from "@/components/reach-table";
import { PLATFORM_LABELS } from "@/lib/platforms";
import { computeScoreRow, normalize, type Baseline, type ScoreRow } from "@/lib/scoreboard";
import type { LocationRecord, Platform } from "@/lib/types";

const DAY = 86_400_000;
const EPSILON = 0.05;

const vnToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const daysBefore = (date: string, days: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() - days * DAY).toISOString().slice(0, 10);
const num = (value: number, digits = 1) => value.toFixed(digits).replace(".", ",");
const signed = (value: number, digits = 1) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${num(Math.abs(value), digits)}`;
const trend = (value: number, epsilon: number) => (value > epsilon ? "up" : value < -epsilon ? "down" : "flat");
const tone = (score: number, target: number) => (score / target >= 0.9 ? "good" : score / target >= 0.8 ? "warn" : "bad");

function ageText(iso: string | null) {
  if (!iso) return { text: "Chưa có dữ liệu", stale: true };
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  return { text: days < 1 ? "Hôm nay" : `${days} ngày trước`, stale: days >= 2 };
}

/** Bảng điểm: mỗi hàng là một cơ sở cùng loại, để thấy ngay cơ sở nào cần chú ý. */
export function OverviewScoreboard({ locations, platforms, scale, userId, selectedId, typeLabel, onSelect }: {
  locations: LocationRecord[]; platforms: Platform[]; scale: 5 | 10; userId: string | null;
  selectedId: string | null; typeLabel: string; onSelect: (id: string) => void;
}) {
  const [baseline, setBaseline] = useState<Baseline>({});
  const [dateInput, setDateInput] = useState("");
  const [compareDate, setCompareDate] = useState(""); // rỗng = lần chốt gần nhất trước hôm nay
  const idsKey = useMemo(() => locations.map((location) => location.id).sort().join(","), [locations]);
  const platformsKey = platforms.join(",");

  // Mốc so sánh: số chốt gần nhất tới ngày được chọn, hoặc mặc định trong 4 ngày trước hôm nay.
  useEffect(() => {
    if (!userId || !idsKey) return;
    let active = true;
    const today = vnToday();
    const query = createClient().from("daily_report_snapshots")
      .select("location_id,platform,report_date,rating_scale,rating_value,review_count")
      .in("location_id", idsKey.split(",")).in("platform", platformsKey.split(","));
    (compareDate
      ? query.lte("report_date", compareDate).gte("report_date", daysBefore(compareDate, 30))
      : query.gte("report_date", daysBefore(today, 4)).lt("report_date", today))
      .order("report_date", { ascending: false }).limit(5000)
      .then(({ data }) => {
        if (!active) return;
        const next: Baseline = {};
        for (const row of data ?? []) {
          const key = `${row.location_id}|${row.platform}`;
          if (key in next || row.rating_value == null) continue; // hàng đầu tiên = ngày gần nhất
          next[key] = { score: normalize(Number(row.rating_value), Number(row.rating_scale), scale), count: row.review_count == null ? null : Number(row.review_count), date: row.report_date };
        }
        setBaseline(next);
      });
    return () => { active = false; };
  }, [userId, idsKey, platformsKey, scale, compareDate]);

  const rows = useMemo<ScoreRow[]>(() => locations.map((location) => computeScoreRow(location, platforms, scale, baseline)), [locations, platforms, scale, baseline]);

  // Mặc định điểm thấp nhất trước (cơ sở không có điểm xếp cuối); bấm tiêu đề cột để đổi.
  const sorted = useMemo(() => [...rows].sort((a, b) => (a.avg == null || b.avg == null ? (a.avg == null ? 1 : 0) - (b.avg == null ? 1 : 0) : a.avg - b.avg)), [rows]);
  const columns: Col<ScoreRow>[] = [
    { label: "Cơ sở", text: (row) => row.location.name, render: (row) => <><button type="button" className="scoreboard-link" onClick={() => onSelect(row.location.id)} title="Xem chi tiết cơ sở này">{row.location.name}</button><small>{row.location.area}</small></> },
    { label: "Điểm TB", text: (row) => (row.avg == null ? "—" : num(row.avg)), value: (row) => row.avg, render: (row) => (row.avg == null ? <span className="muted">—</span> : <span className={`score ${tone(row.avg, scale)}`}>{num(row.avg)}</span>) },
    ...platforms.map((platform): Col<ScoreRow> => ({
      label: PLATFORM_LABELS[platform],
      text: (row) => { const score = row.cells[platform]?.score; return score == null ? "—" : num(score); },
      value: (row) => row.cells[platform]?.score ?? null,
      render: (row) => {
        const cell = row.cells[platform];
        if (cell?.score == null && cell?.count == null) return <span className="muted">—</span>;
        return <div className="cell">{cell?.score != null && <span className={`score ${tone(cell.score, scale)}`}>{num(cell.score)}</span>}{cell?.count != null && <small>{cell.count.toLocaleString("vi-VN")} lượt</small>}
          {cell?.dScore != null && Math.abs(cell.dScore) > EPSILON && <small className={`delta ${trend(cell.dScore, EPSILON)}`}><Star size={11} fill="currentColor" aria-hidden="true" />{signed(cell.dScore)} điểm</small>}
          {cell?.dCount != null && cell.dCount !== 0 && <small className={`delta ${trend(cell.dCount, 0)}`}><MessageSquareQuote size={11} aria-hidden="true" />{signed(cell.dCount, 0)} đánh giá</small>}
        </div>;
      },
    })),
    { label: "Tổng đánh giá", text: (row) => (row.total == null ? "—" : row.total.toLocaleString("vi-VN")), value: (row) => row.total, total: true },
    { label: "Cập nhật", text: (row) => ageText(row.latest).text, sort: (row) => row.latest ?? "", render: (row) => { const age = ageText(row.latest); return <span className={`age ${age.stale ? "stale" : ""}`}>{age.text}</span>; } },
  ];

  const baselineDates = [...new Set(Object.values(baseline).map((item) => item.date).filter((date): date is string => !!date))].sort();
  const baselineText = baselineDates.length === 0 ? "chưa có mốc" : baselineDates.length === 1 ? fmtDate(baselineDates[0]) : `${fmtDate(baselineDates[0])} – ${fmtDate(baselineDates[baselineDates.length - 1])}`;
  const latestCapture = rows.reduce<string | null>((max, row) => (row.latest && (!max || row.latest > max) ? row.latest : max), null);
  const currentText = latestCapture ? fmtDate(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(latestCapture))) : fmtDate(vnToday());
  const withScore = rows.filter((row) => row.avg != null);
  const lowest = withScore.length > 1 ? withScore.reduce((min, row) => (row.avg! < min.avg! ? row : min)) : null;
  const drops = rows.flatMap((row) => platforms.map((platform) => ({ row, platform, d: row.cells[platform]?.dScore ?? null })))
    .filter((item): item is { row: ScoreRow; platform: Platform; d: number } => item.d != null && item.d < -EPSILON);
  const biggestDrop = drops.sort((a, b) => a.d - b.d)[0] ?? null;
  const noData = rows.filter((row) => row.avg == null).length;
  const stale = rows.filter((row) => row.avg != null && ageText(row.latest).stale).length;

  return <section className="scoreboard" aria-labelledby="scoreboard-title">
    <header className="scoreboard-head">
      <div><div className="section-kicker"><Gauge size={14} /> BẢNG ĐIỂM · {typeLabel.toUpperCase()}</div>
        <h2 id="scoreboard-title">Tất cả cơ sở {typeLabel} ({rows.length})</h2>
        <p>Điểm thang {scale}, số liệu chưa chốt. Thay đổi so với {compareDate ? `số chốt tới ${fmtDate(compareDate)}` : "lần chốt gần nhất"}.</p></div>
      <div className="scoreboard-dates"><span>Ngày mốc: <strong>{baselineText}</strong></span><span>Ngày so sánh: <strong>{currentText}</strong></span></div>
      <label className="scoreboard-sort"><span>So sánh với ngày</span><DatePicker label="Ngày so sánh" text={dateInput} onText={(text) => { setDateInput(text); const iso = parseDmy(text); setCompareDate(iso && iso < vnToday() ? iso : ""); }} max={daysBefore(vnToday(), 1)} />
        {compareDate && <button type="button" onClick={() => { setCompareDate(""); setDateInput(""); }}>Gần nhất</button>}</label>
    </header>
    {rows.length === 0 ? <p className="scoreboard-empty">Chưa có cơ sở loại {typeLabel}. Thêm cơ sở trong Cài đặt.</p> : <>
      <div className="scoreboard-highlights">
        <div className="highlight">{lowest ? <><span className={`tone ${tone(lowest.avg!, scale)}`}><Gauge size={15} /></span><div><small>Điểm thấp nhất</small><strong>{lowest.location.name}</strong><em>{num(lowest.avg!)}/{scale}</em></div></> : <div><small>Điểm thấp nhất</small><strong>—</strong></div>}</div>
        <div className="highlight">{biggestDrop ? <><span className="tone bad"><TrendingDown size={15} /></span><div><small>Giảm mạnh nhất</small><strong>{biggestDrop.row.location.name}</strong><em>{PLATFORM_LABELS[biggestDrop.platform]}: {signed(biggestDrop.d)} điểm</em></div></> : <div><small>Giảm mạnh nhất</small><strong>Không có cơ sở giảm điểm</strong></div>}</div>
        <div className="highlight"><span className={`tone ${noData + stale ? "warn" : "good"}`}><AlertTriangle size={15} /></span><div><small>Cần cập nhật</small><strong>{noData + stale === 0 ? "Tất cả đều mới" : `${noData} thiếu dữ liệu · ${stale} chưa cập nhật ≥2 ngày`}</strong></div></div>
      </div>
      <ReachTable compact rows={sorted} columns={columns} rowKey={(row) => row.location.id} rowClass={(row) => (row.location.id === selectedId ? "selected" : undefined)} />
    </>}
  </section>;
}

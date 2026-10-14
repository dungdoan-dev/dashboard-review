"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Gauge, TrendingDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PLATFORM_LABELS } from "@/lib/platforms";
import { computeScoreRow, normalize, type Baseline, type ScoreRow } from "@/lib/scoreboard";
import type { LocationRecord, Platform } from "@/lib/types";

type Sort = "attention" | "best" | "reviews" | "name";

const DAY = 86_400_000;
const EPSILON = 0.05;

const vnToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const daysBefore = (date: string, days: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() - days * DAY).toISOString().slice(0, 10);
const num = (value: number, digits = 1) => value.toFixed(digits).replace(".", ",");
const signed = (value: number, digits = 1) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${num(Math.abs(value), digits)}`;
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
  const [sort, setSort] = useState<Sort>("attention");
  const [baseline, setBaseline] = useState<Baseline>({});
  const idsKey = useMemo(() => locations.map((location) => location.id).sort().join(","), [locations]);
  const platformsKey = platforms.join(",");

  // Mốc so sánh: số đã chốt gần nhất của mỗi nguồn trong 4 ngày trước hôm nay.
  useEffect(() => {
    if (!userId || !idsKey) return;
    let active = true;
    const today = vnToday();
    createClient().from("daily_report_snapshots")
      .select("location_id,platform,report_date,rating_scale,rating_value,review_count")
      .in("location_id", idsKey.split(",")).in("platform", platformsKey.split(","))
      .gte("report_date", daysBefore(today, 4)).lt("report_date", today)
      .order("report_date", { ascending: false }).limit(2000)
      .then(({ data }) => {
        if (!active) return;
        const next: Baseline = {};
        for (const row of data ?? []) {
          const key = `${row.location_id}|${row.platform}`;
          if (key in next || row.rating_value == null) continue; // hàng đầu tiên = ngày gần nhất
          next[key] = { score: normalize(Number(row.rating_value), Number(row.rating_scale), scale), count: row.review_count == null ? null : Number(row.review_count) };
        }
        setBaseline(next);
      });
    return () => { active = false; };
  }, [userId, idsKey, platformsKey, scale]);

  const rows = useMemo<ScoreRow[]>(() => locations.map((location) => computeScoreRow(location, platforms, scale, baseline)), [locations, platforms, scale, baseline]);

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    if (sort === "name") return a.location.name.localeCompare(b.location.name, "vi");
    if (sort === "reviews") return (b.total ?? -1) - (a.total ?? -1);
    // Cơ sở không có điểm xếp cuối ở mọi kiểu sắp theo điểm.
    if (a.avg == null || b.avg == null) return (a.avg == null ? 1 : 0) - (b.avg == null ? 1 : 0);
    return sort === "best" ? b.avg - a.avg : a.avg - b.avg;
  }), [rows, sort]);

  const withScore = rows.filter((row) => row.avg != null);
  const lowest = withScore.length > 1 ? withScore.reduce((min, row) => (row.avg! < min.avg! ? row : min)) : null;
  const biggestDrop = rows.filter((row) => row.dScore != null && row.dScore < -EPSILON).sort((a, b) => a.dScore! - b.dScore!)[0] ?? null;
  const noData = rows.filter((row) => row.avg == null).length;
  const stale = rows.filter((row) => row.avg != null && ageText(row.latest).stale).length;

  return <section className="scoreboard" aria-labelledby="scoreboard-title">
    <header className="scoreboard-head">
      <div><div className="section-kicker"><Gauge size={14} /> BẢNG ĐIỂM · {typeLabel.toUpperCase()}</div>
        <h2 id="scoreboard-title">Tất cả cơ sở {typeLabel} ({rows.length})</h2>
        <p>Số liệu mới nhất vừa lấy (chưa chốt sổ), điểm quy đổi về thang {scale}. Thay đổi so với lần chốt gần nhất trước hôm nay.</p></div>
      <label className="scoreboard-sort"><span>Sắp xếp</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Sắp xếp bảng điểm">
        <option value="attention">Điểm thấp nhất trước</option><option value="best">Điểm cao nhất trước</option>
        <option value="reviews">Nhiều đánh giá nhất</option><option value="name">Tên A–Z</option></select></label>
    </header>
    {rows.length === 0 ? <p className="scoreboard-empty">Chưa có cơ sở loại {typeLabel}. Thêm cơ sở trong Cài đặt.</p> : <>
      <div className="scoreboard-highlights">
        <div className="highlight">{lowest ? <><span className={`tone ${tone(lowest.avg!, scale)}`}><Gauge size={15} /></span><div><small>Điểm thấp nhất</small><strong>{lowest.location.name}</strong><em>{num(lowest.avg!)}/{scale}</em></div></> : <div><small>Điểm thấp nhất</small><strong>—</strong></div>}</div>
        <div className="highlight">{biggestDrop ? <><span className="tone bad"><TrendingDown size={15} /></span><div><small>Giảm mạnh nhất</small><strong>{biggestDrop.location.name}</strong><em>{signed(biggestDrop.dScore!)} điểm</em></div></> : <div><small>Giảm mạnh nhất</small><strong>Không có cơ sở giảm điểm</strong></div>}</div>
        <div className="highlight"><span className={`tone ${noData + stale ? "warn" : "good"}`}><AlertTriangle size={15} /></span><div><small>Cần cập nhật</small><strong>{noData + stale === 0 ? "Tất cả đều mới" : `${noData} thiếu dữ liệu · ${stale} chưa cập nhật ≥2 ngày`}</strong></div></div>
      </div>
      <div className="scoreboard-scroll"><table>
        <thead><tr><th>Cơ sở</th><th>Điểm TB</th>{platforms.map((platform) => <th key={platform}>{PLATFORM_LABELS[platform]}</th>)}<th>Tổng đánh giá</th><th>Thay đổi</th><th>Cập nhật</th></tr></thead>
        <tbody>{sorted.map((row) => {
          const age = ageText(row.latest);
          return <tr key={row.location.id} className={row.location.id === selectedId ? "selected" : ""}>
            <th scope="row"><button type="button" onClick={() => onSelect(row.location.id)} title="Xem chi tiết cơ sở này">{row.location.name}</button><small>{row.location.area}</small></th>
            <td>{row.avg == null ? <span className="muted">—</span> : <span className={`score ${tone(row.avg, scale)}`}>{num(row.avg)}</span>}</td>
            {platforms.map((platform) => { const cell = row.cells[platform]; return <td key={platform}>{cell?.score == null && cell?.count == null ? <span className="muted">—</span> : <div className="cell">{cell?.score != null && <span className={`score ${tone(cell.score, scale)}`}>{num(cell.score)}</span>}{cell?.count != null && <small>{cell.count.toLocaleString("vi-VN")} đánh giá</small>}</div>}</td>; })}
            <td>{row.total == null ? <span className="muted">—</span> : <strong>{row.total.toLocaleString("vi-VN")}</strong>}</td>
            <td>{row.dScore == null && row.dCount == null ? <span className="muted" title="Chưa có số liệu đã chốt trước hôm nay để so sánh">—</span> : <div className="cell">
              {row.dScore != null && <span className={`delta ${row.dScore > EPSILON ? "up" : row.dScore < -EPSILON ? "down" : "flat"}`}>{row.dScore > EPSILON ? <ArrowUpRight size={14} /> : row.dScore < -EPSILON ? <ArrowDownRight size={14} /> : null}{Math.abs(row.dScore) <= EPSILON ? "Không đổi" : `${signed(row.dScore)} điểm`}</span>}
              {row.dCount != null && <small>{row.dCount === 0 ? "+0" : signed(row.dCount, 0)} đánh giá</small>}</div>}</td>
            <td><span className={`age ${age.stale ? "stale" : ""}`}>{age.text}</span></td>
          </tr>; })}</tbody>
      </table></div>
    </>}
  </section>;
}

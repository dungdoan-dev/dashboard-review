"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileBarChart, Printer } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, fmtDateTime } from "@/lib/format-date";
import { PLATFORM_LABELS } from "@/lib/platforms";
import { SUMMARY_SCALE, buildTrend, summarizeLocation, summarizeType, type Snapshot } from "@/lib/summary";
import type { LocationRecord, Platform } from "@/lib/types";

export type SummarySection = { type: string; label: string; color: string; platforms: Platform[]; locations: LocationRecord[] };

const DAY = 86_400_000;
const GOOD = 9; // từ 9/10 trở lên: xuất sắc
const WATCH = 8; // dưới 8/10: cần chú ý
const AXIS = { fill: "#586b84", fontSize: 12 };
const TOOLTIP = { contentStyle: { border: "1px solid #dfe6f0", borderRadius: 10, boxShadow: "0 8px 24px #1b2b4518", fontSize: 13 }, labelStyle: { color: "#344862", fontWeight: 700 } };

const vnToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const daysBefore = (date: string, days: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() - days * DAY).toISOString().slice(0, 10);
const num = (value: number, digits = 1) => value.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toLocaleString("vi-VN")}`;
const level = (score: number) => (score >= GOOD ? { text: "Xuất sắc", cls: "good" } : score >= WATCH ? { text: "Tốt", cls: "ok" } : { text: "Cần chú ý", cls: "bad" });

async function fetchSnapshots(ids: string[], from: string): Promise<Snapshot[]> {
  const db = createClient();
  const rows: Snapshot[] = [];
  for (let page = 0; ; page++) { // Supabase trả tối đa 1000 dòng mỗi lần
    const { data, error } = await db.from("daily_report_snapshots")
      .select("location_id,platform,report_date,rating_scale,rating_value,review_count")
      .in("location_id", ids).gte("report_date", from).order("report_date").order("id").range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      rows.push({
        locationId: row.location_id, platform: row.platform, date: row.report_date,
        score: row.rating_value == null ? null : (Number(row.rating_value) / Number(row.rating_scale)) * SUMMARY_SCALE,
        count: row.review_count == null ? null : Number(row.review_count),
      });
    }
    if ((data?.length ?? 0) < 1000) return rows;
  }
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="summary-kpi"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>;
}

function ChartCard({ title, unit, wide, children }: { title: string; unit?: string; wide?: boolean; children: React.ReactNode }) {
  return <article className={`summary-chart ${wide ? "wide" : ""}`}><h4>{title}{unit && <small>{unit}</small>}</h4>{children}</article>;
}

export function SummaryReport({ sections, userId }: { sections: SummarySection[]; userId: string | null }) {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const idsKey = useMemo(() => sections.flatMap((section) => section.locations.map((location) => location.id)).sort().join(","), [sections]);
  const today = vnToday();
  const from = daysBefore(today, days);

  useEffect(() => {
    if (!userId || !idsKey) return;
    let active = true;
    fetchSnapshots(idsKey.split(","), from)
      .then((rows) => { if (active) { setSnapshots(rows); setStatus("ready"); } })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [userId, idsKey, from]);

  const data = useMemo(() => sections.map((section) => {
    const rows = section.locations.map((location) => summarizeLocation(location, section.platforms));
    const ids = new Set(section.locations.map((location) => location.id));
    const trend = buildTrend(snapshots.filter((item) => ids.has(item.locationId) && section.platforms.includes(item.platform)));
    return { section, rows, summary: summarizeType(rows, section.platforms), trend };
  }), [sections, snapshots]);

  const all = data.flatMap((item) => item.rows);
  const allScored = all.filter((row) => row.score != null);
  const overallScore = allScored.length ? allScored.reduce((sum, row) => sum + row.score!, 0) / allScored.length : null;
  const overallReviews = data.reduce((sum, item) => sum + item.summary.totalReviews, 0);
  const overallGained = data.reduce((sum, item) => sum + item.trend.gained, 0);
  const hasHistory = snapshots.length > 0;
  const latestCapture = sections.flatMap((section) => section.locations.flatMap((location) => section.platforms.map((platform) => location[platform]?.capturedAt ?? null))).reduce<string | null>((max, at) => (at && (!max || at > max) ? at : max), null);

  const byType = data.filter((item) => item.summary.count > 0);
  const watchList = all.filter((row) => row.score != null && row.score < WATCH).sort((a, b) => a.score! - b.score!);

  return <div className="summary-report">
    <header className="summary-hero">
      <div>
        <div className="section-kicker"><FileBarChart size={14} /> BÁO CÁO TỔNG HỢP</div>
        <h1>Báo cáo tổng hợp đánh giá</h1>
        <p>Kỳ báo cáo: <strong>{fmtDate(from)} – {fmtDate(today)}</strong> ({days} ngày) · Số liệu mới nhất: <strong>{latestCapture ? fmtDateTime(latestCapture) : "chưa có"}</strong></p>
      </div>
      <div className="summary-controls summary-no-print">
        <label><span>Kỳ báo cáo</span><select value={days} onChange={(event) => setDays(Number(event.target.value) as 7 | 30 | 90)} aria-label="Chọn kỳ báo cáo">
          <option value={7}>7 ngày qua</option><option value={30}>30 ngày qua</option><option value={90}>90 ngày qua</option></select></label>
        <button type="button" onClick={() => window.print()}><Printer size={15} /> In / Lưu PDF</button>
      </div>
    </header>

    {status === "error" && <p className="summary-note bad" role="alert">Không tải được lịch sử đánh giá nên các số “mới trong kỳ” và biểu đồ diễn biến tạm thời không có.</p>}
    {status === "ready" && !hasHistory && <p className="summary-note">Chưa có số liệu đã chốt trong kỳ này nên chưa tính được đánh giá mới và diễn biến.</p>}

    <section className="summary-section" aria-labelledby="summary-all-title">
      <h2 id="summary-all-title">1. Toàn hệ thống</h2>
      <div className="summary-kpis">
        <Kpi label="Số cơ sở" value={String(all.length)} hint={`${allScored.length} cơ sở đã có điểm`} />
        <Kpi label="Điểm trung bình" value={overallScore == null ? "—" : `${num(overallScore)} / ${SUMMARY_SCALE}`} hint={overallScore == null ? "Chưa có dữ liệu" : level(overallScore).text} />
        <Kpi label="Tổng số đánh giá" value={overallReviews.toLocaleString("vi-VN")} hint="Cộng dồn mọi nền tảng" />
        <Kpi label="Đánh giá mới trong kỳ" value={hasHistory ? signed(overallGained) : "—"} hint={`Trong ${days} ngày qua`} />
      </div>
      <div className="summary-grid">
        <ChartCard title="Điểm trung bình theo loại hình" unit={`Thang ${SUMMARY_SCALE}`}>
          <ResponsiveContainer width="100%" height={Math.max(160, byType.length * 56 + 30)}>
            <BarChart layout="vertical" data={byType.map((item) => ({ name: item.section.label, score: item.summary.avgScore, color: item.section.color }))} margin={{ left: 8, right: 44 }}>
              <CartesianGrid horizontal={false} stroke="#e8edf4" />
              <XAxis type="number" domain={[0, SUMMARY_SCALE]} tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={96} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip {...TOOLTIP} formatter={(value) => [typeof value === "number" ? `${num(value)} / ${SUMMARY_SCALE}` : "—", "Điểm trung bình"]} />
              <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={26}>
                {byType.map((item) => <Cell key={item.section.type} fill={item.section.color} />)}
                <LabelList dataKey="score" position="right" formatter={(value) => (typeof value === "number" ? num(value) : "")} fill="#233a5a" fontSize={13} fontWeight={700} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Đánh giá mới theo loại hình" unit={`${days} ngày qua`}>
          <ResponsiveContainer width="100%" height={Math.max(160, byType.length * 56 + 30)}>
            <BarChart layout="vertical" data={byType.map((item) => ({ name: item.section.label, gained: item.trend.gained, color: item.section.color }))} margin={{ left: 8, right: 44 }}>
              <CartesianGrid horizontal={false} stroke="#e8edf4" />
              <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={96} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip {...TOOLTIP} formatter={(value) => [typeof value === "number" ? signed(value) : "—", "Đánh giá mới"]} />
              <Bar dataKey="gained" radius={[0, 4, 4, 0]} barSize={26}>
                {byType.map((item) => <Cell key={item.section.type} fill={item.section.color} />)}
                <LabelList dataKey="gained" position="right" formatter={(value) => (typeof value === "number" ? signed(value) : "")} fill="#233a5a" fontSize={13} fontWeight={700} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <div className="summary-insights">
        <h3>Điểm nổi bật</h3>
        <ul>
          {overallScore != null && <li><CheckCircle2 size={15} className="ok" /> Điểm trung bình toàn hệ thống là <strong>{num(overallScore)}/{SUMMARY_SCALE}</strong> ({level(overallScore).text.toLowerCase()}).</li>}
          {hasHistory && <li><CheckCircle2 size={15} className="ok" /> Trong {days} ngày qua, hệ thống nhận thêm <strong>{signed(overallGained)}</strong> đánh giá.</li>}
          {watchList.length > 0
            ? <li><AlertTriangle size={15} className="bad" /> <strong>{watchList.length} cơ sở</strong> dưới {WATCH}/{SUMMARY_SCALE} cần chú ý: {watchList.slice(0, 5).map((row) => `${row.name} (${num(row.score!)})`).join(", ")}{watchList.length > 5 ? "…" : ""}.</li>
            : allScored.length > 0 && <li><CheckCircle2 size={15} className="ok" /> Không có cơ sở nào dưới {WATCH}/{SUMMARY_SCALE}.</li>}
          {all.length - allScored.length > 0 && <li><AlertTriangle size={15} className="warn" /> {all.length - allScored.length} cơ sở chưa có dữ liệu điểm, cần kiểm tra liên kết nền tảng.</li>}
        </ul>
      </div>
    </section>

    {data.map(({ section, rows, summary, trend }, index) => {
      const sorted = [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
      const bars = sorted.filter((row) => row.score != null).map((row) => ({ name: row.name, score: row.score }));
      const topGain = Object.entries(trend.byLocation).sort((a, b) => b[1] - a[1])[0];
      const gainName = topGain ? rows.find((row) => row.id === topGain[0])?.name : null;
      const watch = rows.filter((row) => row.score != null && row.score < WATCH).sort((a, b) => a.score! - b.score!);
      return <section className="summary-section" key={section.type} aria-labelledby={`summary-${section.type}`}>
        <h2 id={`summary-${section.type}`}><span className="summary-chip" style={{ background: section.color }} />{index + 2}. {section.label}</h2>
        {summary.count === 0 ? <p className="summary-note">Chưa có cơ sở loại {section.label}. Thêm cơ sở trong Cài đặt.</p> : <>
          <div className="summary-kpis">
            <Kpi label="Số cơ sở" value={String(summary.count)} hint={`${summary.scored} cơ sở đã có điểm`} />
            <Kpi label="Điểm trung bình" value={summary.avgScore == null ? "—" : `${num(summary.avgScore)} / ${SUMMARY_SCALE}`} hint={summary.avgScore == null ? "Chưa có dữ liệu" : level(summary.avgScore).text} />
            <Kpi label="Tổng số đánh giá" value={summary.totalReviews.toLocaleString("vi-VN")} hint={section.platforms.map((platform) => PLATFORM_LABELS[platform]).join(" · ")} />
            <Kpi label="Đánh giá mới trong kỳ" value={hasHistory ? signed(trend.gained) : "—"} hint={`Trong ${days} ngày qua`} />
          </div>
          <div className="summary-insights">
            <h3>Điểm nổi bật</h3>
            <ul>
              {summary.best && <li><CheckCircle2 size={15} className="ok" /> Cao nhất: <strong>{summary.best.name}</strong> ({num(summary.best.score!)}/{SUMMARY_SCALE}).</li>}
              {summary.worst && summary.worst.id !== summary.best?.id && <li>{summary.worst.score! < WATCH ? <AlertTriangle size={15} className="bad" /> : <CheckCircle2 size={15} className="ok" />} Thấp nhất: <strong>{summary.worst.name}</strong> ({num(summary.worst.score!)}/{SUMMARY_SCALE}){summary.avgScore != null && `, thấp hơn trung bình ${num(summary.avgScore - summary.worst.score!)} điểm`}.</li>}
              {watch.length > 1 && <li><AlertTriangle size={15} className="bad" /> {watch.length} cơ sở dưới {WATCH}/{SUMMARY_SCALE}: {watch.map((row) => row.name).join(", ")}.</li>}
              {hasHistory && gainName && topGain[1] > 0 && <li><CheckCircle2 size={15} className="ok" /> Nhiều đánh giá mới nhất: <strong>{gainName}</strong> ({signed(topGain[1])} trong {days} ngày).</li>}
              {summary.count - summary.scored > 0 && <li><AlertTriangle size={15} className="warn" /> {summary.count - summary.scored} cơ sở chưa có dữ liệu điểm.</li>}
            </ul>
          </div>
          <div className="summary-grid">
            <ChartCard title="Điểm theo cơ sở" unit={`Thang ${SUMMARY_SCALE} · nét đứt: trung bình`} wide>
              {bars.length === 0 ? <p className="summary-note">Chưa có điểm để vẽ.</p> : <ResponsiveContainer width="100%" height={Math.max(180, bars.length * 38 + 40)}>
                <BarChart layout="vertical" data={bars} margin={{ left: 8, right: 44 }}>
                  <CartesianGrid horizontal={false} stroke="#e8edf4" />
                  <XAxis type="number" domain={[0, SUMMARY_SCALE]} tick={AXIS} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={210} tick={AXIS} tickLine={false} axisLine={false} />
                  <Tooltip {...TOOLTIP} formatter={(value) => [typeof value === "number" ? `${num(value)} / ${SUMMARY_SCALE}` : "—", "Điểm"]} />
                  {summary.avgScore != null && <ReferenceLine x={summary.avgScore} stroke="#586b84" strokeDasharray="5 4" />}
                  <Bar dataKey="score" fill={section.color} radius={[0, 4, 4, 0]} barSize={20}>
                    <LabelList dataKey="score" position="right" formatter={(value) => (typeof value === "number" ? num(value) : "")} fill="#233a5a" fontSize={12} fontWeight={700} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>}
            </ChartCard>
            <ChartCard title="Điểm theo nền tảng" unit={`Thang ${SUMMARY_SCALE}`}>
              {summary.platformAvg.length === 0 ? <p className="summary-note">Chưa có điểm để vẽ.</p> : <ResponsiveContainer width="100%" height={Math.max(180, summary.platformAvg.length * 38 + 40)}>
                <BarChart layout="vertical" data={summary.platformAvg.map((item) => ({ name: PLATFORM_LABELS[item.platform], score: item.score, locations: item.locations }))} margin={{ left: 8, right: 44 }}>
                  <CartesianGrid horizontal={false} stroke="#e8edf4" />
                  <XAxis type="number" domain={[0, SUMMARY_SCALE]} tick={AXIS} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={96} tick={AXIS} tickLine={false} axisLine={false} />
                  <Tooltip {...TOOLTIP} formatter={(value, _name, item) => [typeof value === "number" ? `${num(value)} / ${SUMMARY_SCALE} (${item.payload.locations} cơ sở)` : "—", "Điểm"]} />
                  <Bar dataKey="score" fill={section.color} radius={[0, 4, 4, 0]} barSize={20}>
                    <LabelList dataKey="score" position="right" formatter={(value) => (typeof value === "number" ? num(value) : "")} fill="#233a5a" fontSize={12} fontWeight={700} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>}
            </ChartCard>
            <ChartCard title="Diễn biến điểm" unit={`${days} ngày qua`}>
              {trend.points.filter((point) => point.score != null).length < 2 ? <p className="summary-note">Cần ít nhất 2 ngày đã chốt số liệu để vẽ diễn biến.</p> : <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trend.points} margin={{ left: 0, right: 16, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="#e8edf4" />
                  <XAxis dataKey="date" tickFormatter={(value: string) => fmtDate(value).slice(0, 5)} tick={AXIS} tickLine={false} axisLine={{ stroke: "#dfe6f0" }} minTickGap={24} />
                  <YAxis domain={[(min: number) => Math.max(0, Math.floor(min * 10 - 3) / 10), (max: number) => Math.min(SUMMARY_SCALE, Math.ceil(max * 10 + 3) / 10)]} tickFormatter={(value: number) => num(value)} tick={AXIS} tickLine={false} axisLine={false} width={40} />
                  <Tooltip {...TOOLTIP} labelFormatter={(value) => fmtDate(String(value))} formatter={(value) => [typeof value === "number" ? `${num(value, 2)} / ${SUMMARY_SCALE}` : "—", "Điểm trung bình"]} />
                  <Line type="monotone" dataKey="score" stroke={section.color} strokeWidth={2.5} dot={{ r: 3, fill: section.color, stroke: "#fff", strokeWidth: 2 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>}
            </ChartCard>
            <ChartCard title="Đánh giá mới tích lũy" unit={`${days} ngày qua`}>
              {trend.points.length < 2 ? <p className="summary-note">Cần ít nhất 2 ngày đã chốt số liệu để vẽ diễn biến.</p> : <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={trend.points} margin={{ left: 0, right: 16, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="#e8edf4" />
                  <XAxis dataKey="date" tickFormatter={(value: string) => fmtDate(value).slice(0, 5)} tick={AXIS} tickLine={false} axisLine={{ stroke: "#dfe6f0" }} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={40} />
                  <Tooltip {...TOOLTIP} labelFormatter={(value) => fmtDate(String(value))} formatter={(value) => [typeof value === "number" ? signed(value) : "—", "Đánh giá mới"]} />
                  <Area type="monotone" dataKey="gained" stroke={section.color} strokeWidth={2.5} fill={section.color} fillOpacity={0.18} />
                </AreaChart>
              </ResponsiveContainer>}
            </ChartCard>
          </div>
          <details className="summary-table" open>
            <summary>Bảng số liệu chi tiết · {section.label}</summary>
            <div className="summary-table-scroll"><table>
              <thead><tr><th>Cơ sở</th><th>Điểm /{SUMMARY_SCALE}</th><th>Mức</th>{section.platforms.map((platform) => <th key={platform}>{PLATFORM_LABELS[platform]}</th>)}<th>Tổng đánh giá</th><th>Mới trong kỳ</th></tr></thead>
              <tbody>{sorted.map((row) => <tr key={row.id}>
                <th scope="row">{row.name}<small>{row.area}</small></th>
                <td>{row.score == null ? "—" : <strong>{num(row.score)}</strong>}</td>
                <td>{row.score == null ? "—" : <span className={`summary-badge ${level(row.score).cls}`}>{level(row.score).text}</span>}</td>
                {section.platforms.map((platform) => <td key={platform}>{row.platformScores[platform] == null ? "—" : num(row.platformScores[platform]!)}</td>)}
                <td>{row.reviews == null ? "—" : row.reviews.toLocaleString("vi-VN")}</td>
                <td>{hasHistory && row.id in trend.byLocation ? signed(trend.byLocation[row.id]) : "—"}</td>
              </tr>)}</tbody>
            </table></div>
          </details>
        </>}
      </section>;
    })}
  </div>;
}

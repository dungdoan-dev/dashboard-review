"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useReactToPrint } from "react-to-print";
import { AlertTriangle, CheckCircle2, FileBarChart, Printer } from "lucide-react";
import { AreaTrend, Donut, PALETTE, TrackBars, num } from "@/components/dashboard-charts";
import { ReachTable } from "@/components/reach-table";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, fmtDateTime } from "@/lib/format-date";
import { PLATFORM_LABELS } from "@/lib/platforms";
import { customValid, type CustomRange, type ReportRange } from "@/lib/report-range";
import { SUMMARY_SCALE, buildTrend, summarizeLocation, summarizeType, type LocationSummary, type Snapshot } from "@/lib/summary";
import type { LocationRecord, Platform } from "@/lib/types";

export type SummarySection = { type: string; label: string; color: string; platforms: Platform[]; locations: LocationRecord[] };

const DAY = 86_400_000;
const GOOD = 9; // từ 9/10 trở lên: xuất sắc
const WATCH = 8; // dưới 8/10: cần chú ý

const vnToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const daysBefore = (date: string, days: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() - days * DAY).toISOString().slice(0, 10);
const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toLocaleString("vi-VN")}`;
const level = (score: number) => (score >= GOOD ? { text: "Xuất sắc", cls: "good" } : score >= WATCH ? { text: "Tốt", cls: "ok" } : { text: "Cần chú ý", cls: "bad" });

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

async function fetchSnapshots(ids: string[], from: string, to: string): Promise<Snapshot[]> {
  const db = createClient();
  const rows: Snapshot[] = [];
  for (let page = 0; ; page++) { // Supabase trả tối đa 1000 dòng mỗi lần
    const { data, error } = await db.from("daily_report_snapshots")
      .select("location_id,platform,report_date,rating_scale,rating_value,review_count")
      .in("location_id", ids).gte("report_date", from).lte("report_date", to).order("report_date").order("id").range(page * 1000, page * 1000 + 999);
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

/** range / customRange: the "Thời gian" choice of the app's header. */
export function SummaryReport({ sections, userId, range, customRange }: { sections: SummarySection[]; userId: string | null; range: ReportRange; customRange: CustomRange }) {
  // In qua react-to-print: chỉ báo cáo được đưa vào khung in riêng (không kéo theo thanh bên, vùng cuộn của app).
  // Biểu đồ là SVG chụp theo bề rộng lúc in, nên trước đó đặt bề rộng cố định vừa trang và tắt hiệu ứng vẽ dần.
  const [printing, setPrinting] = useState(false);
  const chartWidth = printing ? 640 : "100%";
  const reportRef = useRef<HTMLDivElement>(null);
  const print = useReactToPrint({
    contentRef: reportRef,
    documentTitle: "bao-cao-tong-hop-danh-gia",
    pageStyle: "@page { size: A4; margin: 12mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }",
    onBeforePrint: async () => {
      flushSync(() => setPrinting(true));
      await new Promise((resolve) => setTimeout(resolve, 300)); // chờ biểu đồ vẽ lại ở bề rộng mới
    },
    onAfterPrint: () => setPrinting(false),
  });
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const idsKey = useMemo(() => sections.flatMap((section) => section.locations.map((location) => location.id)).sort().join(","), [sections]);
  const today = vnToday();
  const custom = range === "custom", allTime = range === "all";
  const from = custom ? customRange.from : allTime ? "2000-01-01" : daysBefore(today, Number(range)); // N days back: the day before the first counted day is the baseline of "mới trong kỳ"
  const to = custom ? customRange.to : today;
  const invalid = custom && !customValid(customRange); // only a typed range can be wrong
  const periodText = custom ? `${fmtDate(from)} – ${fmtDate(to)}` : allTime ? "toàn bộ dữ liệu" : `${range} ngày qua`;

  useEffect(() => {
    if (!userId || !idsKey || invalid) return;
    let active = true;
    fetchSnapshots(idsKey.split(","), from, to)
      .then((rows) => { if (active) { setSnapshots(rows); setStatus("ready"); } })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [userId, idsKey, from, to, invalid]);

  const data = useMemo(() => sections.map((section) => {
    const rows = section.locations.map((location) => summarizeLocation(location, section.platforms));
    const ids = new Set(section.locations.map((location) => location.id));
    const trend = buildTrend(snapshots.filter((item) => ids.has(item.locationId) && section.platforms.includes(item.platform)));
    return { section, rows, summary: summarizeType(rows, section.platforms), trend };
  }), [sections, snapshots]);

  const systemTrend = useMemo(() => {
    const platformsOf = new Map(sections.flatMap((section) => section.locations.map((location) => [location.id, section.platforms] as const)));
    return buildTrend(snapshots.filter((item) => platformsOf.get(item.locationId)?.includes(item.platform)));
  }, [sections, snapshots]);
  const all = data.flatMap((item) => item.rows);
  const allScored = all.filter((row) => row.score != null);
  const overallScore = allScored.length ? allScored.reduce((sum, row) => sum + row.score!, 0) / allScored.length : null;
  const overallReviews = data.reduce((sum, item) => sum + item.summary.totalReviews, 0);
  const overallGained = data.reduce((sum, item) => sum + item.trend.gained, 0);
  const hasHistory = snapshots.length > 0;
  const latestCapture = sections.flatMap((section) => section.locations.flatMap((location) => section.platforms.map((platform) => location[platform]?.capturedAt ?? null))).reduce<string | null>((max, at) => (at && (!max || at > max) ? at : max), null);

  const byType = data.filter((item) => item.summary.count > 0);
  const watchList = all.filter((row) => row.score != null && row.score < WATCH).sort((a, b) => a.score! - b.score!);

  return <div className="summary-report" ref={reportRef}>
    <header className="summary-hero">
      <div>
        <div className="section-kicker"><FileBarChart size={14} /> BÁO CÁO TỔNG HỢP</div>
        <h1>Báo cáo tổng hợp đánh giá</h1>
        <p>Kỳ báo cáo: <strong>{allTime ? "Toàn bộ dữ liệu" : `${fmtDate(from)} – ${fmtDate(to)}`}</strong>{!allTime && ` (${daysBetween(from, to)} ngày)`} · Số liệu mới nhất: <strong>{latestCapture ? fmtDateTime(latestCapture) : "chưa có"}</strong></p>
      </div>
      <div className="summary-controls summary-no-print">
        <button type="button" onClick={() => void print()}><Printer size={15} /> In / Lưu PDF</button>
      </div>
    </header>

    {invalid && <p className="summary-note bad summary-no-print" role="alert">Chọn khoảng ngày hợp lệ ở “Thời gian” (từ ngày không sau đến ngày).</p>}
    {status === "error" && !invalid && <p className="summary-note bad" role="alert">Không tải được lịch sử đánh giá nên các số “mới trong kỳ” và biểu đồ diễn biến tạm thời không có.</p>}
    {status === "ready" && !invalid && !hasHistory && <p className="summary-note">Chưa có số liệu đã chốt trong kỳ này nên chưa tính được đánh giá mới và diễn biến.</p>}

    <section className="summary-section" aria-labelledby="summary-all-title">
      <h2 id="summary-all-title">1. Toàn hệ thống</h2>
      <div className="summary-kpis">
        <Kpi label="Số cơ sở" value={String(all.length)} hint={`${allScored.length} cơ sở đã có điểm`} />
        <Kpi label="Điểm trung bình" value={overallScore == null ? "—" : `${num(overallScore)} / ${SUMMARY_SCALE}`} hint={overallScore == null ? "Chưa có dữ liệu" : level(overallScore).text} />
        <Kpi label="Tổng số đánh giá" value={overallReviews.toLocaleString("vi-VN")} hint="Cộng dồn mọi nền tảng" />
        <Kpi label="Đánh giá mới trong kỳ" value={hasHistory ? signed(overallGained) : "—"} hint={`Trong ${periodText}`} />
      </div>
      <div className="summary-grid">
        <ChartCard title="Đánh giá mới tích lũy" unit={periodText} wide>
          <AreaTrend points={systemTrend.points.map((p) => ({ date: p.date, value: p.gained }))} color="#16a34a" width={chartWidth} animate={!printing} id="grad-system" label="Đánh giá mới" format={signed} />
        </ChartCard>
        <ChartCard title="Tỷ trọng đánh giá theo loại hình" unit="Tổng số đánh giá">
          <Donut unit="đánh giá" width={chartWidth} animate={!printing} slices={byType.map((item) => ({ name: item.section.label, value: item.summary.totalReviews, color: item.section.color }))} />
        </ChartCard>
        <ChartCard title="Điểm trung bình theo loại hình" unit={`Thang ${SUMMARY_SCALE}`}>
          <TrackBars max={SUMMARY_SCALE} width={chartWidth} animate={!printing} rows={byType.flatMap((item) => item.summary.avgScore == null ? [] : [{ name: item.section.label, value: item.summary.avgScore, color: item.section.color }])} />
        </ChartCard>
      </div>
      <div className="summary-insights">
        <h3>Điểm nổi bật</h3>
        <ul>
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
            <Kpi label="Đánh giá mới trong kỳ" value={hasHistory ? signed(trend.gained) : "—"} hint={`Trong ${periodText}`} />
          </div>
          <div className="summary-insights">
            <h3>Điểm nổi bật</h3>
            <ul>
              {summary.best && <li><CheckCircle2 size={15} className="ok" /> Cao nhất: <strong>{summary.best.name}</strong> ({num(summary.best.score!)}/{SUMMARY_SCALE}).</li>}
              {summary.worst && summary.worst.id !== summary.best?.id && <li>{summary.worst.score! < WATCH ? <AlertTriangle size={15} className="bad" /> : <CheckCircle2 size={15} className="ok" />} Thấp nhất: <strong>{summary.worst.name}</strong> ({num(summary.worst.score!)}/{SUMMARY_SCALE}){summary.avgScore != null && `, thấp hơn trung bình ${num(summary.avgScore - summary.worst.score!)} điểm`}.</li>}
              {watch.length > 1 && <li><AlertTriangle size={15} className="bad" /> {watch.length} cơ sở dưới {WATCH}/{SUMMARY_SCALE}: {watch.map((row) => row.name).join(", ")}.</li>}
              {hasHistory && gainName && topGain[1] > 0 && <li><CheckCircle2 size={15} className="ok" /> Nhiều đánh giá mới nhất: <strong>{gainName}</strong> ({signed(topGain[1])} trong {periodText}).</li>}
              {summary.count - summary.scored > 0 && <li><AlertTriangle size={15} className="warn" /> {summary.count - summary.scored} cơ sở chưa có dữ liệu điểm.</li>}
            </ul>
          </div>
          <div className="summary-grid">
            <ChartCard title="Đánh giá mới tích lũy" unit={periodText} wide>
              <AreaTrend points={trend.points.map((p) => ({ date: p.date, value: p.gained }))} color={section.color} width={chartWidth} animate={!printing} id={`grad-${section.type}`} label="Đánh giá mới" format={signed} />
            </ChartCard>
            <ChartCard title="Tỷ trọng đánh giá theo nền tảng" unit="Tổng số đánh giá">
              <Donut unit="đánh giá" width={chartWidth} animate={!printing} slices={section.platforms.map((platform, i) => ({ name: PLATFORM_LABELS[platform], value: section.locations.reduce((sum, location) => sum + (location[platform]?.reviewCount ?? 0), 0), color: PALETTE[i % PALETTE.length] })).filter((slice) => slice.value > 0)} />
            </ChartCard>
            <ChartCard title="Điểm theo cơ sở" unit={`Thang ${SUMMARY_SCALE}`}>
              <TrackBars max={SUMMARY_SCALE} width={chartWidth} animate={!printing} rows={bars.map((bar) => ({ name: bar.name, value: bar.score!, color: section.color }))} />
            </ChartCard>
          </div>
          <details className="summary-table" open>
            <summary>Bảng số liệu chi tiết · {section.label}</summary>
            <ReachTable compact rows={sorted} rowKey={(row) => row.id} columns={[
              { label: "Cơ sở", text: (row) => row.name, render: (row) => <>{row.name}<small>{row.area}</small></> },
              { label: `Điểm /${SUMMARY_SCALE}`, text: (row) => (row.score == null ? "—" : num(row.score)), value: (row) => row.score },
              ...section.platforms.map((platform) => ({ label: PLATFORM_LABELS[platform], text: (row: LocationSummary) => (row.platformScores[platform] == null ? "—" : num(row.platformScores[platform]!)), value: (row: LocationSummary) => row.platformScores[platform] ?? null })),
              { label: "Tổng đánh giá", text: (row) => (row.reviews == null ? "—" : row.reviews.toLocaleString("vi-VN")), value: (row) => row.reviews, total: true },
              { label: "Mới trong kỳ", text: (row) => (hasHistory && row.id in trend.byLocation ? signed(trend.byLocation[row.id]) : "—"), value: (row) => (hasHistory && row.id in trend.byLocation ? trend.byLocation[row.id] : null), total: true },
            ]} />
          </details>
        </>}
      </section>;
    })}
  </div>;
}

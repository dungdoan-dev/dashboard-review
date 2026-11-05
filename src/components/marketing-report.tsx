"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useReactToPrint } from "react-to-print";
import { ArrowDownToLine, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate } from "@/lib/format-date";
import { addDays, todayVN } from "@/lib/bluejay-metrics";
import { monthEndOf, monthRange, monthScoreRow, rangeOf, toExcelRow, type DayReport } from "@/lib/month-report";
import { REACH_MAX_DAYS, loadReachTotal, spanDays, type ChannelTables } from "@/lib/reach-total";
import { PLATFORM_LABELS } from "@/lib/platforms";
import type { ScoreRow } from "@/lib/scoreboard";
import { ReachChannels } from "@/components/reach-total";
import { ScoreboardView } from "@/components/overview-scoreboard";
import { SummaryReport, type SummarySection } from "@/components/summary-report";
import { IsoDatePicker } from "@/components/date-picker";
import { PageSkeleton } from "@/components/page-skeleton";

const shiftMonth = (month: string, by: number) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7); };

async function fetchReports(ids: string[], from: string, to: string): Promise<DayReport[]> {
  const db = createClient();
  const rows: DayReport[] = [];
  for (let page = 0; ; page++) { // Supabase returns at most 1000 rows a time
    const { data, error } = await db.from("daily_report_snapshots")
      .select("location_id,platform,report_date,rating_scale,rating_value,review_count")
      .in("location_id", ids).gte("report_date", from).lte("report_date", to).order("report_date").order("id").range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) rows.push({ locationId: r.location_id, platform: r.platform, date: r.report_date, rating: r.rating_value == null ? null : Number(r.rating_value), ratingScale: Number(r.rating_scale), reviewCount: r.review_count == null ? null : Number(r.review_count) });
    if ((data?.length ?? 0) < 1000) return rows;
  }
}

type Loaded = { key: string; reports: DayReport[]; reach: ChannelTables[] | null; error: string };

/** Báo cáo marketing: Review (the summary of the period and the score table of each type), Tiếp cận and Quảng cáo for one month or any date range, as one page, one PDF and one Excel file of three sheets.
 *  It replaces Báo cáo tổng hợp (/summary), Báo cáo tổng Tiếp cận (/reach) and Báo cáo tháng (/month). */
export function MarketingReport({ sections, userId }: { sections: SummarySection[]; userId: string | null }) {
  const today = todayVN();
  const [mode, setMode] = useState<"month" | "range">("month");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [pick, setPick] = useState({ from: `${today.slice(0, 8)}01`, to: addDays(today, -1) });
  const [scale, setScale] = useState<5 | 10>(5);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const range = useMemo(() => (mode === "month" ? monthRange(month, today) : rangeOf(pick.from, pick.to)), [mode, month, pick, today]);
  const label = mode === "month" ? `tháng ${month.slice(5)}/${month.slice(0, 4)}` : `${fmtDate(range.from)} – ${fmtDate(range.to)}`;
  const invalid = mode === "range" && (!pick.from || !pick.to || pick.from > pick.to);
  const reachTooLong = range.length > 0 && spanDays(range.from, range.to) > REACH_MAX_DAYS;
  const idsKey = useMemo(() => sections.flatMap((s) => s.locations.map((l) => l.id)).sort().join(","), [sections]);
  const key = `${range.from}|${range.to}|${idsKey}`;
  const data = loaded?.key === key ? loaded : null; // the tables of another period are not shown while the new one loads

  useEffect(() => {
    if (invalid || range.length === 0) return;
    let active = true;
    const ids = idsKey ? idsKey.split(",") : [];
    Promise.all([userId && ids.length ? fetchReports(ids, range.prevStart, range.to) : Promise.resolve([] as DayReport[]), reachTooLong ? Promise.resolve(null) : loadReachTotal(range.from, range.to)])
      .then(([reports, reach]) => { if (active) setLoaded({ key, reports, reach, error: "" }); })
      .catch((e: unknown) => { if (active) setLoaded({ key, reports: [], reach: null, error: e instanceof Error ? e.message : String(e) }); });
    return () => { active = false; };
  }, [key, userId, idsKey, range, invalid, reachTooLong]);

  const tables = useMemo(() => {
    if (!data) return [];
    const byLocation = new Map<string, DayReport[]>();
    for (const r of data.reports) byLocation.set(r.locationId, [...(byLocation.get(r.locationId) ?? []), r]);
    return sections.filter((s) => s.locations.length > 0).map((s) => ({
      section: s,
      rows: s.locations.map((l) => monthScoreRow(l, s.platforms, byLocation.get(l.id) ?? [], range, scale))
        .sort((a, b) => (a.avg == null || b.avg == null ? (a.avg == null ? 1 : 0) - (b.avg == null ? 1 : 0) : a.avg - b.avg)), // lowest score first, as on Tổng quan
    }));
  }, [data, sections, scale, range]);

  // PDF: react-to-print copies only this page into its own frame; charts are drawn at a fixed width first
  const [printing, setPrinting] = useState(false);
  const pageRef = useRef<HTMLElement>(null);
  const print = useReactToPrint({
    contentRef: pageRef,
    documentTitle: `bao-cao-marketing-${range.from}-${range.to}`,
    pageStyle: "@page { size: A4; margin: 12mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }",
    onBeforePrint: async () => { flushSync(() => setPrinting(true)); await new Promise((resolve) => setTimeout(resolve, 300)); },
    onAfterPrint: () => setPrinting(false),
  });

  // "Cập nhật" is the date of the last report in the period; a place whose last report is two days or more before its end is out of date
  const updated = (r: ScoreRow) => (r.latest ? { text: fmtDate(r.latest), stale: Date.parse(range.to) - Date.parse(r.latest) >= 2 * 86_400_000 } : { text: "Chưa có dữ liệu", stale: true });
  const base = mode === "month" ? "đầu tháng" : "ngày đầu kỳ";

  async function exportExcel() {
    if (!data) return;
    const [m, q] = await Promise.all([import("@/lib/month-report-excel"), import("@/lib/ql-excel")]);
    const note = `Điểm thang ${scale}. Số liệu là báo cáo đã chốt đến ${fmtDate(range.to)}; thay đổi so với ${base} (${fmtDate(range.from)}). Mỗi ô nền tảng ghi điểm, số đánh giá và thay đổi.`;
    const scoreTables = tables.map(({ section, rows }) => ({ heading: section.label, platforms: section.platforms.map((p) => PLATFORM_LABELS[p]), rows: rows.map((r) => toExcelRow(r, section.platforms)), scale }));
    const title = mode === "month" ? month : `${fmtDate(range.from)} – ${fmtDate(range.to)}`;
    await q.downloadQlWorkbook(`bao-cao-marketing-${mode === "month" ? month : `${range.from}_${range.to}`}.xlsx`, m.monthWorkbook(title, note, scoreTables, `Kỳ: ${fmtDate(range.from)} – ${fmtDate(range.to)}`, data.reach ?? []));
  }

  const ready = !!data && !data.error && range.length > 0 && !invalid;
  return (
    <section className="summary-report marketing-report" ref={pageRef}>
      <div className="summary-hero">
        <div>
          <h1>Báo cáo marketing {label}</h1>
          <p>{range.length > 0 && !invalid && <>Kỳ <strong>{fmtDate(range.from)} – {fmtDate(range.to)}</strong> ({range.length} ngày){mode === "month" && range.to < monthEndOf(month) ? ", tháng đang chạy, đến hôm qua" : ""}. </>}Review, tiếp cận và quảng cáo của cùng một kỳ; in ra PDF hoặc xuất một file Excel ba sheet Review, Tiếp cận và Quảng cáo.</p>
        </div>
        <div className="summary-controls summary-no-print">
          {mode === "month" ? <>
            <button type="button" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={15} />Tháng trước</button>
            <input type="month" aria-label="Tháng" value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} />
            <button type="button" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}>Tháng sau<ChevronRight size={15} /></button>
          </> : <>
            <IsoDatePicker label="Từ ngày" value={pick.from} onChange={(from) => setPick((p) => ({ ...p, from }))} />
            <IsoDatePicker label="Đến ngày" value={pick.to} onChange={(to) => setPick((p) => ({ ...p, to }))} />
          </>}
          <button type="button" disabled={!ready} onClick={() => void exportExcel()}><ArrowDownToLine size={15} />Xuất Excel</button>
          <button type="button" disabled={!ready} onClick={() => void print()}><Printer size={15} />In / Lưu PDF</button>
        </div>
      </div>
      <div className="marketing-toggles summary-no-print">
        <div className="range-presets" role="group" aria-label="Kiểu kỳ báo cáo">
          <button type="button" aria-pressed={mode === "month"} onClick={() => setMode("month")}>Theo tháng</button>
          <button type="button" aria-pressed={mode === "range"} onClick={() => setMode("range")}>Khoảng ngày</button>
        </div>
        <div className="range-presets" role="group" aria-label="Thang điểm">
          <button type="button" aria-pressed={scale === 5} onClick={() => setScale(5)}>Thang 5</button>
          <button type="button" aria-pressed={scale === 10} onClick={() => setScale(10)}>Thang 10</button>
        </div>
      </div>
      {invalid && <p className="summary-note bad" role="alert">Chọn khoảng ngày hợp lệ (từ ngày không sau đến ngày).</p>}
      {!invalid && range.length === 0 && <p className="summary-note">Kỳ này chưa có ngày nào đã qua.</p>}
      {!invalid && range.length > 0 && !data && <PageSkeleton label="Đang lấy số liệu của kỳ…" />}
      {data?.error && <div className="alert alert-error" role="alert"><span>{data.error}</span></div>}
      {ready && <>
        <h2 className="month-sub">Review</h2>
        <p className="summary-note">Điểm trung bình, tổng số đánh giá và tỷ trọng là số liệu mới nhất; “mới trong kỳ”, diễn biến và bảng điểm theo cơ sở là báo cáo đã chốt trong kỳ.</p>
        <SummaryReport sections={sections} userId={userId} from={range.from} to={range.to} printing={printing} />
        <h3 className="month-sub">Bảng điểm theo cơ sở</h3>
        {data.reports.length === 0 && <p className="summary-note">Chưa có báo cáo đã chốt trong kỳ này (và 31 ngày trước đó) nên bảng điểm còn trống.</p>}
        <div className="month-boards">{tables.map(({ section, rows }) => (
          <ScoreboardView key={section.type} rows={rows} platforms={section.platforms} scale={scale} typeLabel={section.label} updated={updated}
            note={`Điểm thang ${scale}, số liệu đã chốt đến ${fmtDate(range.to)}. Thay đổi so với ${base}.`}
            dates={{ base: fmtDate(range.from), current: fmtDate(range.to) }} />
        ))}</div>
        {data.reach ? <>
          <h2 className="month-sub">Tiếp cận</h2>
          <ReachChannels data={data.reach.filter((c) => !c.ads)} />
          <h2 className="month-sub">Quảng cáo</h2>
          <ReachChannels data={data.reach.filter((c) => c.ads)} />
        </> : <p className="summary-note">Tiếp cận và quảng cáo chỉ lấy được khoảng tối đa {REACH_MAX_DAYS} ngày; chọn kỳ ngắn hơn để xem hai phần này.</p>}
      </>}
    </section>
  );
}

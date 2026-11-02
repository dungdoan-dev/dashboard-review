"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate } from "@/lib/format-date";
import { todayVN } from "@/lib/bluejay-metrics";
import { monthEndOf, monthRange, monthScoreRow, toExcelRow, type DayReport } from "@/lib/month-report";
import { loadReachTotal, type ChannelTables } from "@/lib/reach-total";
import { PLATFORM_LABELS } from "@/lib/platforms";
import type { ScoreRow } from "@/lib/scoreboard";
import { ReachChannels } from "@/components/reach-total";
import { ScoreboardView } from "@/components/overview-scoreboard";
import { PageSkeleton } from "@/components/page-skeleton";
import type { SummarySection } from "@/components/summary-report";

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

type Loaded = { key: string; reports: DayReport[]; reach: ChannelTables[]; error: string };

/** Báo cáo tháng: the score table of each type of place (like the Tổng quan file) and the reach summary (like the Báo cáo tổng file) of one month, with both as one Excel file. */
export function MonthReport({ sections, userId }: { sections: SummarySection[]; userId: string | null }) {
  const today = todayVN();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [scale, setScale] = useState<5 | 10>(5);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const range = useMemo(() => monthRange(month, today), [month, today]);
  const idsKey = useMemo(() => sections.flatMap((s) => s.locations.map((l) => l.id)).sort().join(","), [sections]);
  const key = `${month}|${idsKey}`;
  const data = loaded?.key === key ? loaded : null; // the tables of another month are not shown while the new one loads

  useEffect(() => {
    if (range.length === 0) return;
    let active = true;
    const ids = idsKey ? idsKey.split(",") : [];
    Promise.all([userId && ids.length ? fetchReports(ids, range.prevStart, range.to) : Promise.resolve([] as DayReport[]), loadReachTotal(range.from, range.to)])
      .then(([reports, reach]) => { if (active) setLoaded({ key, reports, reach, error: "" }); })
      .catch((e: unknown) => { if (active) setLoaded({ key, reports: [], reach: [], error: e instanceof Error ? e.message : String(e) }); });
    return () => { active = false; };
  }, [key, userId, idsKey, range]);

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

  // "Cập nhật" is the date of the last report in the month; a place whose last report is two days or more before the end of the range is out of date
  const updated = (r: ScoreRow) => (r.latest ? { text: fmtDate(r.latest), stale: Date.parse(range.to) - Date.parse(r.latest) >= 2 * 86_400_000 } : { text: "Chưa có dữ liệu", stale: true });

  async function exportExcel() {
    if (!data) return;
    const [m, q] = await Promise.all([import("@/lib/month-report-excel"), import("@/lib/ql-excel")]);
    const note = `Điểm thang ${scale}. Số liệu là báo cáo đã chốt đến ${fmtDate(range.to)}; thay đổi so với đầu tháng (${fmtDate(range.from)}). Mỗi ô nền tảng ghi điểm, số đánh giá và thay đổi.`;
    const scoreTables = tables.map(({ section, rows }) => ({ heading: section.label, platforms: section.platforms.map((p) => PLATFORM_LABELS[p]), rows: rows.map((r) => toExcelRow(r, section.platforms)), scale }));
    await q.downloadQlWorkbook(`bao-cao-thang-${month}.xlsx`, m.monthWorkbook(month, note, scoreTables, `Kỳ: ${fmtDate(range.from)} – ${fmtDate(range.to)}`, data.reach));
  }

  const nothing = data && !data.error && data.reports.length === 0;
  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Báo cáo marketing tháng {month.slice(5)}/{month.slice(0, 4)}</h1>
          <p>{range.length > 0 && <>Số liệu đến <strong>{fmtDate(range.to)}</strong>{range.to < monthEndOf(month) ? " (tháng đang chạy, đến hôm qua)" : ""}. </>}Bảng điểm review của từng loại hình, tiếp cận và quảng cáo của tháng, cùng nằm trong một file Excel gồm ba sheet: Review, Tiếp cận và Quảng cáo.</p>
        </div>
        <div className="summary-controls">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={15} />Tháng trước</button>
          <input type="month" aria-label="Tháng" value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          <button type="button" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}>Tháng sau<ChevronRight size={15} /></button>
          <button type="button" disabled={!data || data.error !== "" || range.length === 0} onClick={() => void exportExcel()}><ArrowDownToLine size={15} />Xuất Excel</button>
        </div>
      </div>
      <div className="range-presets" role="group" aria-label="Thang điểm">
        <button type="button" aria-pressed={scale === 5} onClick={() => setScale(5)}>Thang 5</button>
        <button type="button" aria-pressed={scale === 10} onClick={() => setScale(10)}>Thang 10</button>
      </div>
      {range.length === 0 && <p className="summary-note">Tháng này chưa có ngày nào đã qua.</p>}
      {range.length > 0 && !data && <PageSkeleton label="Đang lấy số liệu tháng…" />}
      {data?.error && <div className="alert alert-error" role="alert"><span>{data.error}</span></div>}
      {nothing && <p className="summary-note">Chưa có báo cáo đã chốt trong tháng này (và tháng trước) nên bảng điểm còn trống.</p>}
      {data && !data.error && <>
        <h2 className="month-sub">Review</h2>
        <div className="month-boards">{tables.map(({ section, rows }) => (
          <ScoreboardView key={section.type} rows={rows} platforms={section.platforms} scale={scale} typeLabel={section.label} updated={updated}
            note={`Điểm thang ${scale}, số liệu đã chốt đến ${fmtDate(range.to)}. Thay đổi so với đầu tháng.`}
            dates={{ base: fmtDate(range.from), current: fmtDate(range.to) }} />
        ))}</div>
        <h2 className="month-sub">Tiếp cận</h2>
        <ReachChannels data={data.reach.filter((c) => !c.ads)} />
        <h2 className="month-sub">Quảng cáo</h2>
        <ReachChannels data={data.reach.filter((c) => c.ads)} />
      </>}
    </section>
  );
}

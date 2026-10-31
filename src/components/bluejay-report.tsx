"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useReactToPrint } from "react-to-print";
import { ArrowDownToLine, CalendarDays, ChevronLeft, ChevronRight, Printer, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BluejayRevenue, RevenueView } from "@/components/bluejay-revenue";
import { MAX_RANGE_DAYS, rangeSummary, type RangeData } from "@/lib/bluejay-range";
import { fmtDate, fmtDateTime, parseDmy } from "@/lib/format-date";
import { DatePicker } from "@/components/date-picker";
import { ReachTable, type Col } from "@/components/reach-table";
import { BLUEJAY_HOTELS, addDays, combine, isoWeek, mondayOf, summarize, todayVN, type WeeklyReport } from "@/lib/bluejay-metrics";
import { PageSkeleton } from "@/components/page-skeleton";

const hotelColor = (id: number) => BLUEJAY_HOTELS.find((h) => h.id === id)?.color ?? "#736b80";
const AXIS = { fill: "#696974", fontSize: 12 };
const TOOLTIP = { contentStyle: { border: "1px solid #e5dff0", borderRadius: 10, boxShadow: "0 8px 24px #2a1b4518", fontSize: 13 }, labelStyle: { color: "#47474f", fontWeight: 700 } };

const pct = (x: number) => `${(x * 100).toFixed(2).replace(".", ",")}%`;
const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
const compact = (v: number) => (v >= 1e9 ? `${+(v / 1e9).toFixed(1)} tỷ` : v >= 1e6 ? `${+(v / 1e6).toFixed(1)} tr` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v));

// While the PDF is made the charts are drawn at a fixed width: the print copy of a responsive chart keeps the screen width and its legend drifts.
let printing = false;
const printListeners = new Set<() => void>();
const setPrinting = (on: boolean) => flushSync(() => { printing = on; printListeners.forEach((l) => l()); });
const usePrinting = () => useSyncExternalStore((l) => { printListeners.add(l); return () => void printListeners.delete(l); }, () => printing, () => false);
const chartWidth = (on: boolean) => (on ? 640 : "100%");

type Series = { key: string; name: string; color: string };
type Row = Record<string, string | number | null>;

function LineTrend({ data, series, label, split, percent = true }: { data: Row[]; series: Series[]; label: string; split?: string; percent?: boolean }) {
  const printing = usePrinting();
  return (
    <div role="img" aria-label={label} style={{ height: 300 }}>
      <ResponsiveContainer width={chartWidth(printing)} height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#f0edf6" vertical={false} />
          <XAxis dataKey="x" tick={AXIS} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={percent ? 48 : 60} tickFormatter={percent ? (v: number) => `${Math.round(v * 100)}%` : compact} domain={percent ? [0, 1] : [0, "auto"]} />
          <Tooltip {...TOOLTIP} formatter={(v) => (percent ? pct(Number(v)) : num(Number(v)))} />
          {split && <ReferenceLine x={split} stroke="#a095b4" strokeDasharray="4 4" label={{ value: "Đặt trước →", fill: "#696974", fontSize: 12, position: "insideTopRight" }} />}
          {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 13 }} />}
          {series.map((s) => <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={data.length <= 14 ? { r: 4 } : false} connectNulls isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Horizontal single-measure bars; one colour because identity is already the axis label.
function HBars({ data, name, color, label, money = true }: { data: { name: string; value: number }[]; name: string; color: string; label: string; money?: boolean }) {
  const fmt = money ? num : (v: number) => v.toLocaleString("vi-VN");
  const printing = usePrinting();
  return (
    <div role="img" aria-label={label} style={{ height: Math.max(120, data.length * 38 + 24) }}>
      <ResponsiveContainer width={chartWidth(printing)} height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#f0edf6" horizontal={false} />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={money ? compact : undefined} />
          <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} width={130} interval={0} />
          <Tooltip {...TOOLTIP} formatter={(v) => fmt(Number(v))} cursor={{ fill: "#f6f6f7" }} />
          <Bar dataKey="value" name={name} fill={color} radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
            <LabelList dataKey="value" position="right" formatter={(v) => (money ? compact(Number(v)) : Number(v).toLocaleString("vi-VN"))} fill="#696974" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type Vs = { text: string; tone: "up" | "down" | "flat"; prev: string; label: string }; // the change against the compared week

function Kpi({ label, value, vs }: { label: string; value: string; vs?: Vs }) {
  return <div className="summary-kpi"><span>{label}</span><div className="kpi-main"><strong>{value}</strong>{vs && <small className={`kpi-delta ${vs.tone}`}>{vs.text}</small>}</div>{vs && <small className="kpi-prev">{vs.label}: <b>{vs.prev}</b></small>}</div>;
}

const sign = (d: number) => (d > 0 ? "+" : d < 0 ? "−" : "");
const toneOf = (d: number): Vs["tone"] => (d > 0 ? "up" : d < 0 ? "down" : "flat");
/** cur against prev as a percent of prev (also for a rate: 40% after 35% is +14,3%); a month that starts from nothing has no percent. */
function change(cur: number, prev: number): Pick<Vs, "text" | "tone"> {
  if (!prev) return { text: cur ? "mới" : "0%", tone: toneOf(cur) };
  const p = Math.round(((cur - prev) / prev) * 1000) / 10; // one decimal
  return { text: `${sign(p)}${Math.abs(p).toFixed(1).replace(".", ",")}%`, tone: toneOf(p) };
}

function Card({ title, note, wide, children }: { title: string; note?: string; wide?: boolean; children: React.ReactNode }) {
  return <article className={`summary-chart ${wide ? "wide" : ""}`}><h4>{title}</h4>{note && <p className="summary-note">{note}</p>}{children}</article>;
}

/** "Xuất PDF": the browser print dialog on the report section (choose Save as PDF); the sidebar and buttons are hidden by the print rules in globals.css. */
function usePdf(title: string) {
  const ref = useRef<HTMLElement>(null);
  const closed = useRef<HTMLDetailsElement[]>([]);
  const print = useReactToPrint({
    contentRef: ref,
    documentTitle: title,
    pageStyle: "@page { size: A4; margin: 12mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }",
    onBeforePrint: async () => { // collapsed "Bảng số liệu" panels are opened for the PDF, then put back
      setPrinting(true);
      await new Promise((resolve) => setTimeout(resolve, 300)); // let the charts redraw at the print width
      closed.current = [...(ref.current?.querySelectorAll("details:not([open])") ?? [])] as HTMLDetailsElement[];
      closed.current.forEach((d) => { d.open = true; });
    },
    onAfterPrint: () => { setPrinting(false); closed.current.forEach((d) => { d.open = false; }); closed.current = []; },
    onPrintError: () => setPrinting(false),
  });
  return [ref, () => void print()] as const;
}

const PdfButton = ({ onClick }: { onClick: () => void }) => <button type="button" onClick={onClick}><Printer size={15} />Xuất PDF</button>;

type Cell = string | number | null;

/** Table view of a chart, reachable without hovering. A number is sortable and added up in the total row, except in pctCols (shown as a percentage, not added). */
function Rows({ head, rows, pctCols = [], totals = true }: { head: string[]; rows: Cell[][]; pctCols?: number[]; totals?: boolean }) {
  const columns: Col<Cell[]>[] = head.map((label, i) => i === 0 ? { label, text: (r) => String(r[0]) } : {
    label,
    value: (r) => (typeof r[i] === "number" ? (r[i] as number) : null),
    text: (r) => (r[i] == null ? "–" : typeof r[i] === "number" ? (pctCols.includes(i) ? pct(r[i] as number) : num(r[i] as number)) : String(r[i])),
    total: totals && !pctCols.includes(i),
  });
  return <details className="summary-table"><summary>Bảng số liệu</summary><ReachTable rows={rows} columns={columns} rowKey={(r) => String(r[0])} /></details>;
}

type SummaryRow = ReturnType<typeof summarize>;
const METRICS: { label: string; get: (x: SummaryRow) => number; percent?: boolean }[] = [
  { label: "Công suất (%)", get: (x) => x.rate, percent: true },
  { label: "Tổng số đêm lưu trú", get: (x) => x.nights },
  { label: "Giá phòng TB (ADR)", get: (x) => x.adr },
  { label: "Hiệu quả doanh thu phòng", get: (x) => x.revpar },
  { label: "Pickup tuần sau", get: (x) => x.pickup1, percent: true },
  { label: "Pickup tuần sau nữa", get: (x) => x.pickup2, percent: true },
];

type RangeRow = { name: string; x: ReturnType<typeof rangeSummary> };
const RANGE_COLS: Col<RangeRow>[] = [
  { label: "Khách sạn", text: (r) => r.name },
  { label: "Công suất", value: (r) => r.x.rate, text: (r) => pct(r.x.rate) },
  { label: "Đêm lưu trú", value: (r) => r.x.nights, text: (r) => num(r.x.nights), total: true },
  { label: "Giá phòng TB", value: (r) => r.x.adr, text: (r) => num(r.x.adr) },
  { label: "RevPAR", value: (r) => r.x.revpar, text: (r) => num(r.x.revpar) },
  { label: "Tiền phòng", value: (r) => r.x.room, text: (r) => num(r.x.room), total: true },
];

type WeekResponse = { monday?: string; report?: WeeklyReport | null; history?: WeeklyReport[]; weeks?: string[]; message?: string };

async function fetchWeek(week: string | null): Promise<WeekResponse> {
  const res = await fetch(`/api/bluejay${week ? `?week=${week}` : ""}`, { cache: "no-store" }).catch(() => null);
  if (!res) return { message: "Không kết nối được máy chủ." };
  const body: WeekResponse = await res.json().catch(() => ({}));
  return res.ok ? { ...body, message: undefined } : { monday: body.monday, message: body.message ?? `Lỗi ${res.status}` };
}

/** scopeId: one hotel (from /bluejay/<id> in the sidebar), or null for the whole chain. */
export type BluejayView = "operations" | "revenue";

export function BluejayReport({ scopeId, view }: { scopeId: number | null; view: BluejayView }) {
  const [monday, setMonday] = useState<string | null>(null); // null = server default (last full week)
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [history, setHistory] = useState<WeeklyReport[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "refreshing">("loading");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"week" | "range" | "month">("week");
  const [weeks, setWeeks] = useState<string[]>([]); // every stored week up to this one, for the compare picker (history keeps only the last 12 for the charts)
  const [extra, setExtra] = useState<{ monday: string; report: WeeklyReport | null } | null>(null); // a compared week older than history
  const [compareWith, setCompareWith] = useState<string | "none" | null>(null); // a Monday, "none", or null = the week before
  const [pdfRef, printPdf] = usePdf(`bao-cao-${view === "revenue" ? "doanh-thu" : "van-hanh"}${monday ? `-tuan-${isoWeek(monday)}` : ""}`);

  const apply = useCallback((r: WeekResponse) => {
    if (r.monday) setMonday(r.monday);
    setError(r.message ?? "");
    setReport(r.report ?? null);
    setHistory(r.history ?? []);
    setWeeks(r.weeks ?? []);
    setStatus("ready");
  }, []);

  useEffect(() => {
    let active = true;
    void fetchWeek(null).then((r) => { if (active) apply(r); });
    return () => { active = false; };
  }, [apply]);

  function load(week: string) {
    setStatus("loading"); setReport(null); setHistory([]); setCompareWith(null);
    void fetchWeek(week).then(apply);
  }

  async function refresh() {
    if (!monday) return;
    setStatus("refreshing"); setError("");
    const res = await fetch(`/api/bluejay?week=${monday}`, { method: "POST" }).catch(() => null);
    if (!res) { setError("Không kết nối được máy chủ."); setStatus("ready"); return; }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.message ?? `Lỗi ${res.status}`); setStatus("ready"); return; }
    apply(await fetchWeek(monday));
  }

  const recs = report ? report.hotels.filter((h) => !scopeId || h.id === scopeId) : [];
  const s = recs.length ? summarize(recs) : null;
  const c = recs.length ? combine(recs) : null;
  const barColor = scopeId ? hotelColor(scopeId) : "#736b80";
  const series = recs.map((h) => ({ key: `h${h.id}`, name: h.name, color: hotelColor(h.id) }));
  const daily: Row[] = recs[0]?.days.map((d, i) => ({
    x: fmtDate(d.date),
    ...Object.fromEntries(recs.map((h) => [`h${h.id}`, h.days[i]?.total > 0 ? h.days[i].occupied / h.days[i].total : null])),
  })) ?? [];
  const trend = (fn: (x: ReturnType<typeof summarize>) => number): Row[] => history.map((r) => ({
    x: `T${r.weekNo}`,
    ...Object.fromEntries(r.hotels.filter((h) => !scopeId || h.id === scopeId).map((h) => [`h${h.id}`, fn(summarize([h]))])),
  }));
  const bars = (list: { name: string; value: number }[]) => list.slice(0, 8).map((g) => ({ name: g.name, value: g.value }));
  const busy = status !== "ready";
  // The compared week comes from the stored weeks that load with the report (no call to Blue Jay).
  const compareMonday = !monday || compareWith === "none" ? null : compareWith ?? addDays(monday, -7);
  const inHistory = compareMonday ? history.find((r) => r.monday === compareMonday) : undefined;
  const prevReport = inHistory ?? (extra && extra.monday === compareMonday ? extra.report ?? undefined : undefined);
  const prevRecs = prevReport ? prevReport.hotels.filter((h) => !scopeId || h.id === scopeId) : [];
  const ps = prevRecs.length ? summarize(prevRecs) : null;
  const weekOptions = monday ? [...new Set([...weeks.filter((w) => w < monday), ...(compareMonday ? [compareMonday] : [])])].sort().reverse() : [];
  const kpi = (label: string, value: number, get: (x: SummaryRow) => number, percent?: boolean) => (
    <Kpi label={label} value={percent ? pct(value) : num(value)} vs={ps && compareMonday ? { ...change(value, get(ps)), prev: percent ? pct(get(ps)) : num(get(ps)), label: `Tuần ${isoWeek(compareMonday)}` } : undefined} />
  );

  const needFetch = status === "ready" && compareMonday && !inHistory && extra?.monday !== compareMonday ? compareMonday : null;
  useEffect(() => {
    if (!needFetch) return;
    let active = true;
    void fetchWeek(needFetch).then((r) => { if (active) setExtra({ monday: needFetch, report: r.report ?? null }); });
    return () => { active = false; };
  }, [needFetch]);

  if (mode === "range") return <BluejayRangeView scopeId={scopeId} view={view} onWeek={() => setMode("week")} />;
  if (mode === "month") return <BluejayMonthView scopeId={scopeId} view={view} onWeek={() => setMode("week")} />;

  return (
    <section className="summary-report" ref={pdfRef}>
      <div className="summary-hero">
        <div>
          <h1>{monday ? `Báo cáo ${view === "revenue" ? "doanh thu và thanh toán" : "vận hành"} tuần ${isoWeek(monday)} (${fmtDate(monday)}–${fmtDate(addDays(monday, 6))})` : view === "revenue" ? "Báo cáo doanh thu và thanh toán" : "Báo cáo vận hành"} · {BLUEJAY_HOTELS.find((h) => h.id === scopeId)?.name ?? "Toàn chuỗi"}</h1>
          {report && <p><strong>Lấy dữ liệu lúc {fmtDateTime(report.fetchedAt)}</strong></p>}
          <p>Dữ liệu Blue Jay PMS. Blue Jay chỉ trả lời trong 08:00–08:30, 16:00–16:59 và 00:00–00:59 (giờ VN).</p>
        </div>
        <div className="summary-controls">
          <button type="button" onClick={() => setMode("month")}><CalendarDays size={15} />Theo tháng</button>
          <button type="button" onClick={() => setMode("range")}><CalendarDays size={15} />Khoảng ngày</button>
          <button type="button" disabled={!monday || busy} onClick={() => monday && load(addDays(monday, -7))}><ChevronLeft size={15} />Tuần trước</button>
          <button type="button" disabled={!monday || busy} onClick={() => monday && load(addDays(monday, 7))}>Tuần sau<ChevronRight size={15} /></button>
          <button type="button" disabled={!monday || busy} onClick={() => void refresh()}><RefreshCw size={15} className={status === "refreshing" ? "spin" : undefined} />{status === "refreshing" ? "Đang lấy dữ liệu…" : report ? "Cập nhật từ Blue Jay" : "Lấy dữ liệu từ Blue Jay"}</button>
          {report && monday && <PdfButton onClick={printPdf} />}
          {report && monday && [["operations", "Xuất báo cáo vận hành"], ["revenue", "Xuất báo cáo doanh thu"]].map(([type, label]) => <a key={type} className="button button-outline" href={`/api/bluejay/export?week=${monday}&type=${type}${scopeId ? `&hotel=${scopeId}` : ""}`}><ArrowDownToLine size={15} />{label}</a>)}
        </div>
      </div>
      {error && <div className="alert alert-error" role="alert"><span>{error}</span></div>}
      {status === "loading" && <PageSkeleton label="Đang tải báo cáo…" />}
      {status !== "loading" && !report && !error && <p className="summary-note">Chưa có dữ liệu cho tuần này. Bấm “Lấy dữ liệu từ Blue Jay” trong khung giờ API.</p>}

      {report && s && c && monday && <>
        {view === "operations" && <>
        <div className="compare-bar">
          <label><span>So sánh với</span><select aria-label="Chọn tuần để so sánh" value={compareMonday ?? "none"} disabled={busy} onChange={(event) => setCompareWith(event.target.value)}>
            <option value="none">Không so sánh</option>
            {weekOptions.map((w) => <option key={w} value={w}>Tuần {isoWeek(w)} ({fmtDate(w).slice(0, 5)}–{fmtDate(addDays(w, 6)).slice(0, 5)}){w === addDays(monday, -7) ? " · tuần trước" : ""}</option>)}
          </select></label>
          {compareMonday && <p>Mức thay đổi so với tuần {isoWeek(compareMonday)}: <span className="kpi-delta up">xanh là tăng</span>, <span className="kpi-delta down">đỏ là giảm</span>.</p>}
        </div>
        <div className="summary-kpis">
          {kpi("Công suất", s.rate, (x) => x.rate, true)}
          {kpi("Tổng số đêm lưu trú", s.nights, (x) => x.nights)}
          {kpi("Giá phòng TB (ADR)", s.adr, (x) => x.adr)}
          {kpi("RevPAR", s.revpar, (x) => x.revpar)}
          {kpi(`Pickup ${fmtDate(addDays(monday, 7))}–${fmtDate(addDays(monday, 13))}`, s.pickup1, (x) => x.pickup1, true)}
          {kpi(`Pickup ${fmtDate(addDays(monday, 14))}–${fmtDate(addDays(monday, 20))}`, s.pickup2, (x) => x.pickup2, true)}
        </div>
        {compareMonday && !ps && <p className="summary-note">Chưa có dữ liệu tuần {isoWeek(compareMonday)} ({fmtDate(compareMonday)}–{fmtDate(addDays(compareMonday, 6))}) để so sánh. Chọn tuần khác hoặc mở tuần đó rồi bấm “Cập nhật từ Blue Jay”.</p>}

        <Card title="Công suất theo ngày" note="Tuần báo cáo và hai tuần tiếp theo (phần sau đường nét đứt là công suất đã đặt trước).">
          <LineTrend data={daily} series={series} split={fmtDate(addDays(monday, 6))} label="Công suất theo ngày" />
          <Rows head={["Ngày", ...recs.map((h) => h.name)]} rows={daily.map((d) => [String(d.x), ...recs.map((h) => (d[`h${h.id}`] == null ? "–" : pct(Number(d[`h${h.id}`]))))])} />
        </Card>

        {history.length > 1 && (
          <div className="summary-grid">
            <Card title="Công suất theo tuần"><LineTrend data={trend((x) => x.rate)} series={series} label="Công suất theo tuần" /></Card>
            <Card title="RevPAR theo tuần"><LineTrend data={trend((x) => x.revpar)} series={series} percent={false} label="RevPAR theo tuần" /></Card>
          </div>
        )}

        <Card title="Giá trị đặt phòng" note="Tiền phòng chỉ tính các đêm nằm trong tuần (giá chia đều theo đêm, bỏ đặt phòng hủy, no-show và hạng M-Standard). Tiền dịch vụ, tổng tiền, đã thanh toán và còn lại là số của cả đặt phòng.">
          <div className="summary-kpis">
            <Kpi label="Số đặt phòng" value={num(c.bookings)} />
            <Kpi label="Tiền phòng" value={num(c.roomPrice)} />
            <Kpi label="Tiền dịch vụ" value={num(c.servicePrice)} />
            <Kpi label="Tổng tiền" value={num(c.totalPrice)} />
            <Kpi label="Đã thanh toán" value={num(c.payment)} />
            <Kpi label="Còn lại" value={num(c.balance)} />
          </div>
        </Card>

        <div className="summary-grid">
          <Card title="Tiền phòng theo nguồn">
            <HBars data={bars(c.bySource)} name="Tiền phòng" color={barColor} label="Tiền phòng theo nguồn" />
            <Rows head={["Nguồn", "Đặt phòng", "Đêm", "Tiền phòng"]} rows={c.bySource.map((g) => [g.name, g.bookings, g.nights, g.value])} />
          </Card>
          <Card title="Tiền phòng theo hạng phòng">
            <HBars data={bars(c.byRoomType)} name="Tiền phòng" color={barColor} label="Tiền phòng theo hạng phòng" />
            <Rows head={["Hạng phòng", "Đặt phòng", "Đêm", "Tiền phòng"]} rows={c.byRoomType.map((g) => [g.name, g.bookings, g.nights, g.value])} />
          </Card>
          <Card title="Đặt phòng theo trạng thái" note="Gồm cả hủy và no-show.">
            <HBars data={c.statuses.slice(0, 8).map((g) => ({ name: g.name, value: g.bookings }))} name="Đặt phòng" color={barColor} money={false} label="Đặt phòng theo trạng thái" />
            <Rows head={["Trạng thái", "Đặt phòng"]} rows={c.statuses.map((g) => [g.name, g.bookings])} />
          </Card>
          <Card title="Dịch vụ theo nhóm">
            <HBars data={c.services.slice(0, 8).map((g) => ({ name: g.name, value: g.total }))} name="Doanh thu dịch vụ" color={barColor} label="Doanh thu dịch vụ theo nhóm" />
            <Rows head={["Nhóm", "Số lượng", "Doanh thu"]} rows={c.services.map((g) => [g.name, g.quantity, g.total])} />
          </Card>
        </div>

        <Card title="Bảng tổng hợp theo khách sạn">
          <ReachTable rows={METRICS} rowKey={(m) => m.label} columns={[{ label: "Đơn vị", text: (m) => m.label } as Col<(typeof METRICS)[number]>, ...report.hotels.map((h): Col<(typeof METRICS)[number]> => ({ label: h.name, value: (m) => m.get(summarize([h])), text: (m) => { const v = m.get(summarize([h])); return m.percent ? pct(v) : num(v); } }))]} />
        </Card>
        </>}
        {view === "revenue" && <BluejayRevenue monday={monday} scopeId={scopeId} />}
        {view === "operations" && <p className="summary-note">Pickup là công suất đã đặt trước tại thời điểm lấy dữ liệu.</p>}
      </>}
    </section>
  );
}

type RangeResponse = RangeData & { message?: string };
type RangeState = { status: "loading" | "ready"; data: RangeData | null; error: string };

async function fetchRange(from: string, to: string): Promise<RangeState> {
  const res = await fetch(`/api/bluejay/range?from=${from}&to=${to}`, { cache: "no-store" }).catch(() => null);
  if (!res) return { status: "ready", data: null, error: "Không kết nối được máy chủ." };
  const body: RangeResponse = await res.json().catch(() => ({} as RangeResponse));
  return res.ok ? { status: "ready", data: body, error: "" } : { status: "ready", data: null, error: body.message ?? `Lỗi ${res.status}` };
}

function DateField({ label, text, onText, max }: { label: string; text: string; onText: (value: string) => void; max: string }) {
  return <div className="range-date"><span>{label}</span><DatePicker label={label} text={text} onText={onText} max={max} /></div>;
}

/** Any date range (up to MAX_RANGE_DAYS days) from the weeks already stored. */
function BluejayRangeView({ scopeId, view, onWeek }: { scopeId: number | null; view: BluejayView; onWeek: () => void }) {
  const today = todayVN();
  const lastMonday = addDays(mondayOf(today), -7);
  const [fromText, setFromText] = useState(fmtDate(lastMonday));
  const [toText, setToText] = useState(fmtDate(addDays(lastMonday, 6)));
  const [state, setState] = useState<RangeState>({ status: "loading", data: null, error: "" });
  const [pdfRef, printPdf] = usePdf(`bao-cao-${view === "revenue" ? "doanh-thu" : "van-hanh"}-khoang-ngay`);

  const load = useCallback((from: string, to: string) => {
    setState({ status: "loading", data: null, error: "" });
    void fetchRange(from, to).then(setState);
  }, []);

  useEffect(() => {
    let active = true; // the state already starts as "loading"
    void fetchRange(lastMonday, addDays(lastMonday, 6)).then((next) => { if (active) setState(next); });
    return () => { active = false; };
  }, [lastMonday]);

  function apply(from: string, to: string) {
    setFromText(fmtDate(from)); setToText(fmtDate(to));
    load(from, to);
  }
  function submit() {
    const from = parseDmy(fromText), to = parseDmy(toText);
    if (!from || !to) return setState((s) => ({ ...s, error: "Nhập ngày đúng dạng dd/mm/yyyy." }));
    if (from > to) return setState((s) => ({ ...s, error: "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc." }));
    if (to > today) return setState((s) => ({ ...s, error: "Ngày kết thúc không được sau hôm nay." }));
    if (addDays(from, MAX_RANGE_DAYS) <= to) return setState((s) => ({ ...s, error: `Chọn tối đa ${MAX_RANGE_DAYS} ngày.` }));
    load(from, to);
  }

  const yesterday = addDays(today, -1);
  const monthStart = `${today.slice(0, 8)}01`;
  const prevMonthEnd = addDays(monthStart, -1);
  const presets: [string, string, string][] = [
    ["Tuần trước", lastMonday, addDays(lastMonday, 6)],
    ["7 ngày qua", addDays(yesterday, -6), yesterday],
    ["30 ngày qua", addDays(yesterday, -29), yesterday],
    ["Tháng này", monthStart, yesterday < monthStart ? monthStart : yesterday],
    ["Tháng trước", `${prevMonthEnd.slice(0, 8)}01`, prevMonthEnd],
  ];

  const { data } = state;
  const hotels = data ? data.hotels.filter((h) => !scopeId || h.id === scopeId) : [];
  const sum = data ? rangeSummary(hotels, data.dates.length) : null;
  const series = hotels.map((h) => ({ key: `h${h.id}`, name: h.name, color: hotelColor(h.id) }));
  const daily: Row[] = data ? data.dates.map((date, i) => ({ x: fmtDate(date), ...Object.fromEntries(hotels.map((h) => [`h${h.id}`, h.days[i] && h.days[i]!.total > 0 ? h.days[i]!.occupied / h.days[i]!.total : null])) })) : [];
  const missingReport = data?.weeks.filter((w) => !w.report) ?? [];
  const missingRevenue = data?.weeks.filter((w) => w.report && !w.revenue) ?? [];
  const busy = state.status === "loading";

  return (
    <section className="summary-report" ref={pdfRef}>
      <div className="summary-hero">
        <div>
          <h1>Báo cáo {view === "revenue" ? "doanh thu và thanh toán" : "vận hành"} theo khoảng ngày · {BLUEJAY_HOTELS.find((h) => h.id === scopeId)?.name ?? "Toàn chuỗi"}</h1>
          <p>Tính từ các tuần đã lưu, không gọi Blue Jay. Chọn tối đa {MAX_RANGE_DAYS} ngày.</p>
        </div>
        <div className="summary-controls">
          <button type="button" onClick={onWeek}><ChevronLeft size={15} />Theo tuần</button>
          <PdfButton onClick={printPdf} />
        </div>
      </div>
      <div className="bluejay-range-picker">
        <DateField label="Từ ngày" text={fromText} onText={setFromText} max={today} />
        <DateField label="Đến ngày" text={toText} onText={setToText} max={today} />
        <button type="button" className="range-apply" disabled={busy} onClick={submit}>{busy ? "Đang tính…" : "Xem báo cáo"}</button>
        <div className="range-presets">{presets.map(([label, from, to]) => <button type="button" key={label} disabled={busy} onClick={() => apply(from, to)}>{label}</button>)}</div>
      </div>
      {state.error && <div className="alert alert-error" role="alert"><span>{state.error}</span></div>}
      {busy && <p className="summary-note">Đang tính báo cáo…</p>}

      {data && sum && !busy && <>
        {(missingReport.length > 0 || sum.missingDays > 0) && <p className="summary-note bad">Thiếu dữ liệu công suất {sum.missingDays} ngày{missingReport.length > 0 && `: chưa lấy tuần ${missingReport.map((w) => `${fmtDate(w.monday)}`).join(", ")}`}. Các ngày này không được tính vào công suất; lấy bổ sung ở chế độ “Theo tuần” hoặc backfill trong Cài đặt.</p>}
        {missingRevenue.length > 0 && <p className="summary-note">Tuần {missingRevenue.map((w) => fmtDate(w.monday)).join(", ")} chưa có báo cáo doanh thu (tuần được lấy trước khi có báo cáo này). Tiền phòng, giá phòng TB và dịch vụ của các tuần đó chưa tính; bấm “Cập nhật từ Blue Jay” ở chế độ “Theo tuần” để bổ sung.</p>}
        {view === "operations" && <>
        <div className="summary-kpis">
          <Kpi label="Công suất" value={pct(sum.rate)} />
          <Kpi label="Tổng số đêm lưu trú" value={num(sum.nights)} />
          <Kpi label="Giá phòng TB (ADR)" value={num(sum.adr)} />
          <Kpi label="RevPAR" value={num(sum.revpar)} />
          <Kpi label="Tiền phòng" value={num(sum.room)} />
          <Kpi label="Số ngày" value={String(data.dates.length)} />
        </div>

        <Card title="Công suất theo ngày" note="Mỗi điểm là công suất của một ngày; ngày thiếu dữ liệu để trống.">
          <LineTrend data={daily} series={series} label="Công suất theo ngày" />
          <Rows head={["Ngày", ...hotels.map((h) => h.name)]} rows={daily.map((d) => [String(d.x), ...hotels.map((h) => (d[`h${h.id}`] == null ? null : Number(d[`h${h.id}`])))])} pctCols={hotels.map((_, i) => i + 1)} totals={false} />
        </Card>

        {!scopeId && hotels.length > 1 && <Card title="Theo khách sạn">
          <ReachTable rows={hotels.map((h) => ({ name: h.name, x: rangeSummary([h], data.dates.length) }))} columns={RANGE_COLS} rowKey={(r) => r.name} />
        </Card>}

        </>}
        {view === "revenue" && <RevenueView hotels={hotels.map((h) => ({ name: h.name, bookings: h.bookings, services: h.services, excludedRoom: h.excludedRoom, excludedService: h.excludedService }))} showHotel={!scopeId} period="kỳ" />}
      </>}
    </section>
  );
}

const monthEnd = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
const shiftMonth = (month: string, by: number) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7); };

/** The monthly report: what the weekly one shows, for a calendar month (to yesterday for the running month), with the change against the month before (the same number of days), from the weeks already stored. */
function BluejayMonthView({ scopeId, view, onWeek }: { scopeId: number | null; view: BluejayView; onWeek: () => void }) {
  const today = todayVN(), yesterday = addDays(today, -1);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [state, setState] = useState<{ month: string; cur: RangeState; prev: RangeState } | null>(null);
  const [pdfRef, printPdf] = usePdf(`bao-cao-${view === "revenue" ? "doanh-thu" : "van-hanh"}-thang-${month.slice(5, 7)}-${month.slice(0, 4)}`);
  const from = `${month}-01`, to = monthEnd(month) < yesterday ? monthEnd(month) : yesterday;
  const prevMonth = shiftMonth(month, -1), prevFrom = `${prevMonth}-01`;
  const length = to >= from ? Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1 : 0;
  const prevTo = addDays(prevFrom, length - 1) < monthEnd(prevMonth) ? addDays(prevFrom, length - 1) : monthEnd(prevMonth);

  useEffect(() => {
    if (!length) return;
    let active = true;
    void Promise.all([fetchRange(from, to), fetchRange(prevFrom, prevTo)]).then(([cur, prev]) => { if (active) setState({ month, cur, prev }); });
    return () => { active = false; };
  }, [month, from, to, prevFrom, prevTo, length]);

  const ready = state?.month === month ? state : null;
  const data = ready?.cur.data ?? null;
  const hotels = data ? data.hotels.filter((h) => !scopeId || h.id === scopeId) : [];
  const sum = data ? rangeSummary(hotels, data.dates.length) : null;
  const prevData = ready?.prev.data ?? null;
  const prevHotels = prevData ? prevData.hotels.filter((h) => !scopeId || h.id === scopeId) : [];
  const prevSum = prevData && prevHotels.length ? rangeSummary(prevHotels, prevData.dates.length) : null;
  const prevLabel = `Tháng ${Number(prevMonth.slice(5, 7))}`;
  const kpi = (label: string, value: number, get: (x: NonNullable<typeof sum>) => number, percent?: boolean) => (
    <Kpi label={label} value={percent ? pct(value) : num(value)} vs={prevSum ? { ...change(value, get(prevSum)), prev: percent ? pct(get(prevSum)) : num(get(prevSum)), label: prevLabel } : undefined} />
  );
  const series = hotels.map((h) => ({ key: `h${h.id}`, name: h.name, color: hotelColor(h.id) }));
  const occ = (h: (typeof hotels)[number], pick: (date: string) => boolean) => { let o = 0, t = 0; data?.dates.forEach((d, i) => { const day = h.days[i]; if (day && pick(d)) { o += day.occupied; t += day.total; } }); return t ? o / t : null; };
  const daily: Row[] = data ? data.dates.map((date) => ({ x: fmtDate(date), ...Object.fromEntries(hotels.map((h) => [`h${h.id}`, occ(h, (d) => d === date)])) })) : [];
  const weekly: Row[] = data ? [...new Set(data.dates.map(mondayOf))].map((monday) => ({ x: `T${isoWeek(monday)}`, ...Object.fromEntries(hotels.map((h) => [`h${h.id}`, occ(h, (d) => mondayOf(d) === monday)])) })) : [];

  const stays = hotels.flatMap((h) => h.bookings).filter((b) => b.stay && b.nightsInWeek > 0);
  const byKey = (key: (b: (typeof stays)[number]) => string) => {
    const groups = new Map<string, { name: string; bookings: number; nights: number; value: number }>();
    for (const b of stays) { const name = key(b) || "Khác", g = groups.get(name) ?? { name, bookings: 0, nights: 0, value: 0 }; g.bookings += 1; g.nights += b.nightsInWeek; g.value += b.roomInWeek; groups.set(name, g); }
    return [...groups.values()].sort((a, b) => b.value - a.value);
  };
  const statuses = new Map<string, number>();
  for (const b of hotels.flatMap((h) => h.bookings)) statuses.set(b.status || "Khác", (statuses.get(b.status || "Khác") ?? 0) + 1);
  const services = new Map<string, { name: string; quantity: number; total: number }>();
  for (const g of hotels.flatMap((h) => h.services).flatMap((d) => d.groups)) { const s = services.get(g.name) ?? { name: g.name, quantity: 0, total: 0 }; s.quantity += g.quantity; s.total += g.total; services.set(g.name, s); }
  const bySource = byKey((b) => b.channel), byRoomType = byKey((b) => b.roomType);
  const serviceList = [...services.values()].sort((a, b) => b.total - a.total), statusList = [...statuses].sort((a, b) => b[1] - a[1]);
  const roomMoney = stays.reduce((s, b) => s + b.roomInWeek, 0), serviceMoney = serviceList.reduce((s, g) => s + g.total, 0);
  const barColor = scopeId ? hotelColor(scopeId) : "#736b80";
  const missingReport = data?.weeks.filter((w) => !w.report) ?? [];
  const busy = length > 0 && !ready;
  const error = ready?.cur.error ?? "";

  return (
    <section className="summary-report" ref={pdfRef}>
      <div className="summary-hero">
        <div>
          <h1>Báo cáo {view === "revenue" ? "doanh thu và thanh toán" : "vận hành"} tháng {month.slice(5, 7)}/{month.slice(0, 4)} · {BLUEJAY_HOTELS.find((h) => h.id === scopeId)?.name ?? "Toàn chuỗi"}</h1>
          <p>Từ {fmtDate(from)}{length ? ` đến ${fmtDate(to)}` : ""}{to < monthEnd(month) && length ? " (tháng đang chạy, đến hôm qua)" : ""}. Tính từ các tuần đã lưu, không gọi Blue Jay.</p>
        </div>
        <div className="summary-controls">
          <button type="button" onClick={onWeek}><ChevronLeft size={15} />Theo tuần</button>
          <PdfButton onClick={printPdf} />
          <button type="button" disabled={busy} onClick={() => setMonth(prevMonth)}><ChevronLeft size={15} />Tháng trước</button>
          <input type="month" aria-label="Tháng" value={month} max={today.slice(0, 7)} onChange={(event) => event.target.value && setMonth(event.target.value)} />
          <button type="button" disabled={busy || month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}>Tháng sau<ChevronRight size={15} /></button>
        </div>
      </div>
      {!length && <p className="summary-note">Tháng này chưa có ngày nào đã qua.</p>}
      {busy && <p className="summary-note">Đang tính báo cáo tháng…</p>}
      {error && <div className="alert alert-error" role="alert"><span>{error}</span></div>}

      {data && sum && <>
        {(missingReport.length > 0 || sum.missingDays > 0) && <p className="summary-note bad">Thiếu dữ liệu công suất {sum.missingDays} ngày{missingReport.length > 0 && `: chưa lấy tuần ${missingReport.map((w) => fmtDate(w.monday)).join(", ")}`}. Số liệu của những ngày đó chưa có, trang Vận hành khách sạn theo tuần có nút “Cập nhật từ Blue Jay” để lấy lại.</p>}
        {view === "operations" && <>
          {prevSum && <p className="summary-note">Mức thay đổi so với {prevLabel.toLowerCase()} ({fmtDate(prevFrom)}–{fmtDate(prevTo)}, cùng số ngày): <span className="kpi-delta up">xanh là tăng</span>, <span className="kpi-delta down">đỏ là giảm</span>.</p>}
          <div className="summary-kpis">
            {kpi("Công suất", sum.rate, (x) => x.rate, true)}
            {kpi("Tổng số đêm lưu trú", sum.nights, (x) => x.nights)}
            {kpi("Giá phòng TB (ADR)", sum.adr, (x) => x.adr)}
            {kpi("RevPAR", sum.revpar, (x) => x.revpar)}
            {kpi("Tiền phòng", sum.room, (x) => x.room)}
            <Kpi label="Số ngày" value={String(data.dates.length)} />
          </div>
          <Card title="Công suất theo ngày" note="Mỗi điểm là công suất của một ngày; ngày thiếu dữ liệu để trống.">
            <LineTrend data={daily} series={series} label="Công suất theo ngày" />
            <Rows head={["Ngày", ...hotels.map((h) => h.name)]} rows={daily.map((d) => [String(d.x), ...hotels.map((h) => (d[`h${h.id}`] == null ? "–" : pct(Number(d[`h${h.id}`]))))])} />
          </Card>
          {weekly.length > 1 && <Card title="Công suất theo tuần" note="Tuần đầu và tuần cuối chỉ tính các ngày nằm trong tháng."><LineTrend data={weekly} series={series} label="Công suất theo tuần" /></Card>}
          <Card title="Giá trị đặt phòng" note="Tiền phòng chỉ tính các đêm nằm trong tháng (giá chia đều theo đêm, bỏ đặt phòng hủy, no-show và hạng M-Standard). Tiền dịch vụ là doanh thu dịch vụ theo ngày bán.">
            <div className="summary-kpis">
              <Kpi label="Số đặt phòng" value={num(stays.length)} />
              <Kpi label="Tiền phòng" value={num(roomMoney)} />
              <Kpi label="Tiền dịch vụ" value={num(serviceMoney)} />
              <Kpi label="Tiền phòng + dịch vụ" value={num(roomMoney + serviceMoney)} />
            </div>
          </Card>
          <div className="summary-grid">
            <Card title="Tiền phòng theo nguồn">
              <HBars data={bySource.slice(0, 8).map((g) => ({ name: g.name, value: g.value }))} name="Tiền phòng" color={barColor} label="Tiền phòng theo nguồn" />
              <Rows head={["Nguồn", "Đặt phòng", "Đêm", "Tiền phòng"]} rows={bySource.map((g) => [g.name, g.bookings, g.nights, g.value])} />
            </Card>
            <Card title="Tiền phòng theo hạng phòng">
              <HBars data={byRoomType.slice(0, 8).map((g) => ({ name: g.name, value: g.value }))} name="Tiền phòng" color={barColor} label="Tiền phòng theo hạng phòng" />
              <Rows head={["Hạng phòng", "Đặt phòng", "Đêm", "Tiền phòng"]} rows={byRoomType.map((g) => [g.name, g.bookings, g.nights, g.value])} />
            </Card>
            <Card title="Đặt phòng theo trạng thái" note="Gồm cả hủy và no-show.">
              <HBars data={statusList.slice(0, 8).map(([name, value]) => ({ name, value }))} name="Đặt phòng" color={barColor} money={false} label="Đặt phòng theo trạng thái" />
              <Rows head={["Trạng thái", "Đặt phòng"]} rows={statusList.map(([name, n]) => [name, n])} />
            </Card>
            <Card title="Dịch vụ theo nhóm">
              <HBars data={serviceList.slice(0, 8).map((g) => ({ name: g.name, value: g.total }))} name="Doanh thu dịch vụ" color={barColor} label="Doanh thu dịch vụ theo nhóm" />
              <Rows head={["Nhóm", "Số lượng", "Doanh thu"]} rows={serviceList.map((g) => [g.name, g.quantity, g.total])} />
            </Card>
          </div>
          {!scopeId && hotels.length > 1 && <Card title="Theo khách sạn"><ReachTable rows={hotels.map((h) => ({ name: h.name, x: rangeSummary([h], data.dates.length) }))} columns={RANGE_COLS} rowKey={(r) => r.name} /></Card>}
        </>}
        {view === "revenue" && <RevenueView hotels={hotels.map((h) => ({ name: h.name, bookings: h.bookings, services: h.services, excludedRoom: h.excludedRoom, excludedService: h.excludedService }))} showHotel={!scopeId} period="tháng" />}
      </>}
    </section>
  );
}

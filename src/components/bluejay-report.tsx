"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BluejayRevenue, RevenueView } from "@/components/bluejay-revenue";
import { MAX_RANGE_DAYS, rangeSummary, type RangeData } from "@/lib/bluejay-range";
import { fmtDate, fmtDateTime, parseDmy } from "@/lib/format-date";
import { DatePicker } from "@/components/date-picker";
import { BLUEJAY_HOTELS, addDays, combine, isoWeek, mondayOf, summarize, todayVN, type WeeklyReport } from "@/lib/bluejay-metrics";

const hotelColor = (id: number) => BLUEJAY_HOTELS.find((h) => h.id === id)?.color ?? "#6b7280";
const AXIS = { fill: "#586b84", fontSize: 12 };
const TOOLTIP = { contentStyle: { border: "1px solid #dfe6f0", borderRadius: 10, boxShadow: "0 8px 24px #1b2b4518", fontSize: 13 }, labelStyle: { color: "#344862", fontWeight: 700 } };

const pct = (x: number) => `${(x * 100).toFixed(2).replace(".", ",")}%`;
const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
const compact = (v: number) => (v >= 1e9 ? `${+(v / 1e9).toFixed(1)} tỷ` : v >= 1e6 ? `${+(v / 1e6).toFixed(1)} tr` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v));

type Series = { key: string; name: string; color: string };
type Row = Record<string, string | number | null>;

function LineTrend({ data, series, label, split, percent = true }: { data: Row[]; series: Series[]; label: string; split?: string; percent?: boolean }) {
  return (
    <div role="img" aria-label={label} style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#edf1f6" vertical={false} />
          <XAxis dataKey="x" tick={AXIS} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={percent ? 48 : 60} tickFormatter={percent ? (v: number) => `${Math.round(v * 100)}%` : compact} domain={percent ? [0, 1] : [0, "auto"]} />
          <Tooltip {...TOOLTIP} formatter={(v) => (percent ? pct(Number(v)) : num(Number(v)))} />
          {split && <ReferenceLine x={split} stroke="#95a2b4" strokeDasharray="4 4" label={{ value: "Đặt trước →", fill: "#586b84", fontSize: 12, position: "insideTopRight" }} />}
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
  return (
    <div role="img" aria-label={label} style={{ height: Math.max(120, data.length * 38 + 24) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#edf1f6" horizontal={false} />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={money ? compact : undefined} />
          <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} width={130} interval={0} />
          <Tooltip {...TOOLTIP} formatter={(v) => fmt(Number(v))} cursor={{ fill: "#f4f6f9" }} />
          <Bar dataKey="value" name={name} fill={color} radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
            <LabelList dataKey="value" position="right" formatter={(v) => (money ? compact(Number(v)) : Number(v).toLocaleString("vi-VN"))} fill="#586b84" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="summary-kpi"><span>{label}</span><strong>{value}</strong></div>;
}

function Card({ title, note, wide, children }: { title: string; note?: string; wide?: boolean; children: React.ReactNode }) {
  return <article className={`summary-chart ${wide ? "wide" : ""}`}><h4>{title}</h4>{note && <p className="summary-note">{note}</p>}{children}</article>;
}

function Rows({ head, rows }: { head: string[]; rows: (string | number)[][] }) { // table view of a chart, reachable without hovering
  return (
    <details className="summary-table"><summary>Bảng số liệu</summary>
      <div className="summary-table-scroll"><table><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={String(r[0])}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody></table></div>
    </details>
  );
}

type WeekResponse = { monday?: string; report?: WeeklyReport | null; history?: WeeklyReport[]; message?: string };

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
  const [mode, setMode] = useState<"week" | "range">("week");

  const apply = useCallback((r: WeekResponse) => {
    if (r.monday) setMonday(r.monday);
    setError(r.message ?? "");
    setReport(r.report ?? null);
    setHistory(r.history ?? []);
    setStatus("ready");
  }, []);

  useEffect(() => {
    let active = true;
    void fetchWeek(null).then((r) => { if (active) apply(r); });
    return () => { active = false; };
  }, [apply]);

  function load(week: string) {
    setStatus("loading"); setReport(null); setHistory([]);
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
  const barColor = scopeId ? hotelColor(scopeId) : "#6b7280";
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

  if (mode === "range") return <BluejayRangeView scopeId={scopeId} view={view} onWeek={() => setMode("week")} />;

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>{monday ? `Báo cáo ${view === "revenue" ? "doanh thu và thanh toán" : "vận hành"} tuần ${isoWeek(monday)} (${fmtDate(monday)}–${fmtDate(addDays(monday, 6))})` : view === "revenue" ? "Báo cáo doanh thu và thanh toán" : "Báo cáo vận hành"} · {BLUEJAY_HOTELS.find((h) => h.id === scopeId)?.name ?? "Toàn chuỗi"}</h1>
          {report && <p><strong>Lấy dữ liệu lúc {fmtDateTime(report.fetchedAt)}</strong></p>}
          <p>Dữ liệu Blue Jay PMS. Blue Jay chỉ trả lời trong 08:00–08:30, 16:00–16:59 và 00:00–00:59 (giờ VN).</p>
        </div>
        <div className="summary-controls">
          <button type="button" onClick={() => setMode("range")}><CalendarDays size={15} />Khoảng ngày</button>
          <button type="button" disabled={!monday || busy} onClick={() => monday && load(addDays(monday, -7))}><ChevronLeft size={15} />Tuần trước</button>
          <button type="button" disabled={!monday || busy} onClick={() => monday && load(addDays(monday, 7))}>Tuần sau<ChevronRight size={15} /></button>
          <button type="button" disabled={!monday || busy} onClick={() => void refresh()}><RefreshCw size={15} className={status === "refreshing" ? "spin" : undefined} />{status === "refreshing" ? "Đang lấy dữ liệu…" : report ? "Cập nhật từ Blue Jay" : "Lấy dữ liệu từ Blue Jay"}</button>
          {report && monday && <a className="button button-outline" href={`/api/bluejay/export?week=${monday}${scopeId ? `&hotel=${scopeId}` : ""}`}><ArrowDownToLine size={15} />Xuất Excel</a>}
        </div>
      </div>
      {error && <div className="alert alert-error" role="alert"><span>{error}</span></div>}
      {status === "loading" && <p className="summary-note">Đang tải báo cáo…</p>}
      {status !== "loading" && !report && !error && <p className="summary-note">Chưa có dữ liệu cho tuần này. Bấm “Lấy dữ liệu từ Blue Jay” trong khung giờ API.</p>}

      {report && s && c && monday && <>
        {view === "operations" && <>
        <div className="summary-kpis">
          <Kpi label="Công suất" value={pct(s.rate)} />
          <Kpi label="Tổng số đêm lưu trú" value={num(s.nights)} />
          <Kpi label="Giá phòng TB (ADR)" value={num(s.adr)} />
          <Kpi label="RevPAR" value={num(s.revpar)} />
          <Kpi label={`Pickup ${fmtDate(addDays(monday, 7))}–${fmtDate(addDays(monday, 13))}`} value={pct(s.pickup1)} />
          <Kpi label={`Pickup ${fmtDate(addDays(monday, 14))}–${fmtDate(addDays(monday, 20))}`} value={pct(s.pickup2)} />
        </div>

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
            <Rows head={["Nguồn", "Đặt phòng", "Đêm", "Tiền phòng"]} rows={c.bySource.map((g) => [g.name, num(g.bookings), num(g.nights), num(g.value)])} />
          </Card>
          <Card title="Tiền phòng theo hạng phòng">
            <HBars data={bars(c.byRoomType)} name="Tiền phòng" color={barColor} label="Tiền phòng theo hạng phòng" />
            <Rows head={["Hạng phòng", "Đặt phòng", "Đêm", "Tiền phòng"]} rows={c.byRoomType.map((g) => [g.name, num(g.bookings), num(g.nights), num(g.value)])} />
          </Card>
          <Card title="Đặt phòng theo trạng thái" note="Gồm cả hủy và no-show.">
            <HBars data={c.statuses.slice(0, 8).map((g) => ({ name: g.name, value: g.bookings }))} name="Đặt phòng" color={barColor} money={false} label="Đặt phòng theo trạng thái" />
            <Rows head={["Trạng thái", "Đặt phòng"]} rows={c.statuses.map((g) => [g.name, num(g.bookings)])} />
          </Card>
          <Card title="Dịch vụ theo nhóm">
            <HBars data={c.services.slice(0, 8).map((g) => ({ name: g.name, value: g.total }))} name="Doanh thu dịch vụ" color={barColor} label="Doanh thu dịch vụ theo nhóm" />
            <Rows head={["Nhóm", "Số lượng", "Doanh thu"]} rows={c.services.map((g) => [g.name, num(g.quantity), num(g.total)])} />
          </Card>
        </div>

        <Card title="Bảng tổng hợp theo khách sạn">
          <div className="summary-table summary-table-scroll">
            <table>
              <thead><tr><th>Đơn vị</th>{report.hotels.map((h) => <th key={h.id}>{h.name}</th>)}</tr></thead>
              <tbody>
                {([
                  ["Công suất (%)", (x) => pct(x.rate)],
                  ["Tổng số đêm lưu trú", (x) => num(x.nights)],
                  ["Giá phòng TB (ADR)", (x) => num(x.adr)],
                  ["Hiệu quả doanh thu phòng", (x) => num(x.revpar)],
                  ["Pickup tuần sau", (x) => pct(x.pickup1)],
                  ["Pickup tuần sau nữa", (x) => pct(x.pickup2)],
                ] as [string, (x: ReturnType<typeof summarize>) => string][]).map(([label, f]) => <tr key={label}><th scope="row">{label}</th>{report.hotels.map((h) => <td key={h.id}>{f(summarize([h]))}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
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
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Báo cáo {view === "revenue" ? "doanh thu và thanh toán" : "vận hành"} theo khoảng ngày · {BLUEJAY_HOTELS.find((h) => h.id === scopeId)?.name ?? "Toàn chuỗi"}</h1>
          <p>Tính từ các tuần đã lưu, không gọi Blue Jay. Chọn tối đa {MAX_RANGE_DAYS} ngày.</p>
        </div>
        <div className="summary-controls">
          <button type="button" onClick={onWeek}><ChevronLeft size={15} />Theo tuần</button>
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
          <Rows head={["Ngày", ...hotels.map((h) => h.name)]} rows={daily.map((d) => [String(d.x), ...hotels.map((h) => (d[`h${h.id}`] == null ? "–" : pct(Number(d[`h${h.id}`]))))])} />
        </Card>

        {!scopeId && hotels.length > 1 && <Card title="Theo khách sạn">
          <div className="summary-table summary-table-scroll"><table>
            <thead><tr><th>Khách sạn</th><th>Công suất</th><th>Đêm lưu trú</th><th>Giá phòng TB</th><th>RevPAR</th><th>Tiền phòng</th></tr></thead>
            <tbody>{hotels.map((h) => { const x = rangeSummary([h], data.dates.length); return <tr key={h.id}><th scope="row">{h.name}</th><td>{pct(x.rate)}</td><td>{num(x.nights)}</td><td>{num(x.adr)}</td><td>{num(x.revpar)}</td><td>{num(x.room)}</td></tr>; })}</tbody>
          </table></div>
        </Card>}

        </>}
        {view === "revenue" && <RevenueView hotels={hotels.map((h) => ({ name: h.name, bookings: h.bookings, services: h.services }))} showHotel={!scopeId} period="kỳ" />}
      </>}
    </section>
  );
}

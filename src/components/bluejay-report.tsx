"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BluejayRevenue } from "@/components/bluejay-revenue";
import { BLUEJAY_HOTELS, addDays, combine, isoWeek, summarize, vnDay, type WeeklyReport } from "@/lib/bluejay-metrics";

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
export function BluejayReport({ scopeId }: { scopeId: number | null }) {
  const [monday, setMonday] = useState<string | null>(null); // null = server default (last full week)
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [history, setHistory] = useState<WeeklyReport[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "refreshing">("loading");
  const [error, setError] = useState("");

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
    x: vnDay(d.date),
    ...Object.fromEntries(recs.map((h) => [`h${h.id}`, h.days[i]?.total > 0 ? h.days[i].occupied / h.days[i].total : null])),
  })) ?? [];
  const trend = (fn: (x: ReturnType<typeof summarize>) => number): Row[] => history.map((r) => ({
    x: `T${r.weekNo}`,
    ...Object.fromEntries(r.hotels.filter((h) => !scopeId || h.id === scopeId).map((h) => [`h${h.id}`, fn(summarize([h]))])),
  }));
  const bars = (list: { name: string; value: number }[]) => list.slice(0, 8).map((g) => ({ name: g.name, value: g.value }));
  const busy = status !== "ready";

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>{monday ? `Báo cáo vận hành tuần ${isoWeek(monday)} (${vnDay(monday)}–${vnDay(addDays(monday, 6))})` : "Báo cáo vận hành"} · {BLUEJAY_HOTELS.find((h) => h.id === scopeId)?.name ?? "Toàn chuỗi"}</h1>
          <p>Dữ liệu Blue Jay PMS. Blue Jay chỉ trả lời trong 08:00–08:30, 16:00–16:59 và 00:00–00:59 (giờ VN).</p>
        </div>
        <div className="summary-controls">
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
        <div className="summary-kpis">
          <Kpi label="Công suất" value={pct(s.rate)} />
          <Kpi label="Tổng số đêm lưu trú" value={num(s.nights)} />
          <Kpi label="Giá phòng TB (ADR)" value={num(s.adr)} />
          <Kpi label="RevPAR" value={num(s.revpar)} />
          <Kpi label={`Pickup ${vnDay(addDays(monday, 7))}–${vnDay(addDays(monday, 13))}`} value={pct(s.pickup1)} />
          <Kpi label={`Pickup ${vnDay(addDays(monday, 14))}–${vnDay(addDays(monday, 20))}`} value={pct(s.pickup2)} />
        </div>

        <Card title="Công suất theo ngày" note="Tuần báo cáo và hai tuần tiếp theo (phần sau đường nét đứt là công suất đã đặt trước).">
          <LineTrend data={daily} series={series} split={vnDay(addDays(monday, 6))} label="Công suất theo ngày" />
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
        <BluejayRevenue monday={monday} scopeId={scopeId} />
        <p className="summary-note">Lấy lúc {new Date(report.fetchedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}. Pickup là công suất đã đặt trước tại thời điểm đó.</p>
      </>}
    </section>
  );
}

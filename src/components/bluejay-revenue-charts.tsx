"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDate } from "@/lib/format-date";
import { Donut, ShareTiles, entityColors } from "@/components/dashboard-charts";
import { OTA_CHANNELS } from "@/lib/bluejay-revenue";

const AXIS = { fill: "#696974", fontSize: 12 };
export const ROOM = "#4f46a5", SERVICE = "#e0892b", PAID = "#2f9e6e", DUE = "#d9534f";

const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
export const compact = (v: number) => (v >= 1e9 ? `${+(v / 1e9).toFixed(1)} tỷ` : v >= 1e6 ? `${+(v / 1e6).toFixed(1)} tr` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v));

type Channel = { name: string; room: number; service: number; payment: number; balance: number };
type Day = { date: string; room: number; service: number };
export const CHANNEL_ORDER = [...OTA_CHANNELS, "Khách lẻ"]; // a channel keeps its colour whatever its rank
export type Series = { key: string; name: string; color: string };

/** The legend: one swatch per series, in the series' order (the stack's order), text in text colour. Only for two series or more: a single series is named by the card title. */
export function Keys({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return <ul className="chart-keys">{series.map((s) => <li key={s.key}><i style={{ background: s.color }} aria-hidden="true" />{s.name}</li>)}</ul>;
}

export type TipProps = { active?: boolean; label?: unknown; payload?: readonly { payload?: Record<string, unknown> }[] };
/** Hover card: every series of the point in the legend's order, and their sum when they stack. */
export function Tip({ active, label, payload, series, fmt, total }: TipProps & { series: Series[]; fmt: (v: number) => string; total: boolean }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const values = series.map((s) => ({ ...s, v: row[s.key] }));
  const sum = values.reduce((t, x) => t + (typeof x.v === "number" ? x.v : 0), 0);
  return <div className="chart-tip">
    <strong>{String(label ?? row.x ?? "")}</strong>
    {values.map((x) => <div key={x.key}><i style={{ background: x.color }} aria-hidden="true" /><span>{x.name}</span><b>{typeof x.v === "number" ? fmt(x.v) : "Chưa có số liệu"}</b></div>)}
    {total && series.length > 1 && <div className="chart-tip-total"><span>Tổng</span><b>{fmt(sum)}</b></div>}
  </div>;
}

const GAP = { stroke: "#fff", strokeWidth: 2 }; // the 2px surface gap between touching segments and bars (the cards are white)

/** Bars: one per category (horizontal) or per day (vertical), stacked unless grouped; bars at most 24px thick, the data end rounded, the base square.
 *  fmt formats the hover card, axis the value axis and the labels at the bar ends (money by default). With 12 bars or fewer each bar gets its total (or value) at its end. */
export function Stacked({ data, series, label, horizontal, grouped, fmt = num, axis = compact, valueLabel = axis }: { data: Record<string, string | number | null>[]; series: Series[]; label: string; horizontal?: boolean; grouped?: boolean; fmt?: (v: number) => string; axis?: (v: number) => string; valueLabel?: (v: number) => string }) {
  const labelled = !grouped && data.length <= 12;
  const rows = labelled ? data.map((d) => { const vs = series.map((s) => d[s.key]).filter((v): v is number => typeof v === "number"); return { ...d, __total: vs.length ? vs.reduce((a, b) => a + b, 0) : null }; }) : data;
  const end = horizontal ? [0, 4, 4, 0] as [number, number, number, number] : [4, 4, 0, 0] as [number, number, number, number];
  return <div>
    <Keys series={series} />
    <div role="img" aria-label={label} style={{ height: horizontal ? Math.max(120, data.length * 40 + 32) : 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: labelled && !horizontal ? 18 : 4, right: labelled && horizontal ? 56 : 12, bottom: 0, left: 0 }} barCategoryGap={horizontal ? "28%" : "20%"}>
          <CartesianGrid stroke="#f0edf6" vertical={!!horizontal} horizontal={!horizontal} />
          {horizontal
            ? <><XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={axis} /><YAxis type="category" dataKey="x" tick={AXIS} tickLine={false} axisLine={{ stroke: "#e5dff0" }} width={110} interval={0} /></>
            : <><XAxis dataKey="x" tick={AXIS} tickLine={false} axisLine={{ stroke: "#e5dff0" }} interval="preserveStartEnd" minTickGap={16} /><YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={axis} /></>}
          <Tooltip cursor={{ fill: "#f6f4fa" }} content={(p) => <Tip {...(p as TipProps)} series={series} fmt={fmt} total={!grouped} />} />
          {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.name} stackId={grouped ? undefined : "a"} fill={s.color} {...GAP} maxBarSize={24} radius={grouped || i === series.length - 1 ? end : 0} isAnimationActive={false}>
            {labelled && i === series.length - 1 && <LabelList dataKey="__total" content={(p) => { // drawn by hand: the default label wraps to the bar's width ("9,4 / tr" on two lines)
              const { x, y, width, height, value } = p as { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: unknown };
              if (typeof value !== "number") return null;
              const [bx, by, bw, bh] = [x, y, width, height].map(Number);
              return horizontal
                ? <text x={bx + bw + 6} y={by + bh / 2} dominantBaseline="central" fill="#56565f" fontSize={12}>{valueLabel(value)}</text>
                : <text x={bx + bw / 2} y={by - 6} textAnchor="middle" fill="#56565f" fontSize={12}>{valueLabel(value)}</text>;
            }} />}
          </Bar>)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>;
}

/** The charts above the tables of the revenue view: share of the money by channel and paid against still due (rings), the same by channel (bars), and money by check-out day. Same numbers as the cards and tables below. */
export function RevenueCharts({ channels, days }: { channels: Channel[]; days: Day[] }) {
  if (channels.length === 0) return null;
  const byChannel = channels.map((c) => ({ x: c.name, room: c.room, service: c.service, payment: c.payment, balance: c.balance }));
  const byDay = days.map((d) => ({ x: fmtDate(d.date).slice(0, 5), room: d.room, service: d.service }));
  const sum = (k: "payment" | "balance") => channels.reduce((s, c) => s + c[k], 0);
  const colors = entityColors(channels.map((c) => c.name), CHANNEL_ORDER);
  return <div className="summary-grid revenue-charts">
    <article className="summary-chart">
      <h4>Cơ cấu doanh thu theo nguồn</h4>
      <p className="summary-note">Tổng tiền (phòng + dịch vụ) của từng nguồn, tỷ trọng và số tiền.</p>
      <Donut width="100%" animate={false} unit="đ" slices={channels.map((c) => ({ name: c.name, value: c.room + c.service, color: colors.get(c.name)! }))} />
    </article>
    <article className="summary-chart">
      <h4>Tình trạng thanh toán</h4>
      <p className="summary-note">Đã thu và còn phải thu của các đặt phòng trong kỳ, gồm phần ngoài kỳ.</p>
      <ShareTiles items={[{ name: "Đã thanh toán", value: sum("payment") }, { name: "Còn phải thu", value: sum("balance") }]} />
    </article>
    <article className="summary-chart">
      <h4>Doanh thu theo nguồn</h4>
      <p className="summary-note">Tiền phòng và dịch vụ của các đặt phòng trả phòng trong kỳ (tiền phòng chưa gồm nâng hạng phòng).</p>
      <Stacked horizontal data={byChannel} label="Doanh thu theo nguồn: tiền phòng và dịch vụ" series={[{ key: "room", name: "Tiền phòng", color: ROOM }, { key: "service", name: "Dịch vụ", color: SERVICE }]} />
    </article>
    <article className="summary-chart">
      <h4>Thanh toán theo nguồn</h4>
      <p className="summary-note">Đã thanh toán và còn phải thu của cả đặt phòng, gồm phần ngoài kỳ.</p>
      <Stacked horizontal data={byChannel} label="Thanh toán theo nguồn: đã thanh toán và còn phải thu" series={[{ key: "payment", name: "Đã thanh toán", color: PAID }, { key: "balance", name: "Còn phải thu", color: DUE }]} />
    </article>
    <article className="summary-chart wide">
      <h4>Doanh thu theo ngày trả phòng</h4>
      <Stacked data={byDay} label="Doanh thu theo ngày trả phòng: tiền phòng và dịch vụ" series={[{ key: "room", name: "Tiền phòng", color: ROOM }, { key: "service", name: "Dịch vụ", color: SERVICE }]} />
    </article>
  </div>;
}

"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDate } from "@/lib/format-date";
import { Donut, PALETTE } from "@/components/dashboard-charts";

const AXIS = { fill: "#696974", fontSize: 12 };
const TOOLTIP = { contentStyle: { border: "1px solid #e5dff0", borderRadius: 10, boxShadow: "0 8px 24px #2a1b4518", fontSize: 13 }, labelStyle: { color: "#47474f", fontWeight: 700 } };
export const ROOM = "#4f46a5", SERVICE = "#e0892b", PAID = "#2f9e6e", DUE = "#d9534f";

const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
export const compact = (v: number) => (v >= 1e9 ? `${+(v / 1e9).toFixed(1)} tỷ` : v >= 1e6 ? `${+(v / 1e6).toFixed(1)} tr` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v));

type Channel = { name: string; room: number; service: number; payment: number; balance: number };
type Day = { date: string; room: number; service: number };
export type Series = { key: string; name: string; color: string };

/** Bars: one per category (horizontal) or per day (vertical), stacked unless grouped; fmt and axis format the tooltip and the value axis (money by default). */
export function Stacked({ data, series, label, horizontal, grouped, fmt = num, axis = compact }: { data: Record<string, string | number>[]; series: Series[]; label: string; horizontal?: boolean; grouped?: boolean; fmt?: (v: number) => string; axis?: (v: number) => string }) {
  return (
    <div role="img" aria-label={label} style={{ height: horizontal ? Math.max(160, data.length * 44 + 56) : 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#f0edf6" vertical={!!horizontal} horizontal={!horizontal} />
          {horizontal
            ? <><XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={axis} /><YAxis type="category" dataKey="x" tick={AXIS} tickLine={false} width={110} interval={0} /></>
            : <><XAxis dataKey="x" tick={AXIS} tickLine={false} interval="preserveStartEnd" minTickGap={16} /><YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={axis} /></>}
          <Tooltip {...TOOLTIP} formatter={(v) => fmt(Number(v))} cursor={{ fill: "#f6f6f7" }} />
          <Legend iconType="square" wrapperStyle={{ fontSize: 13 }} />
          {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.name} stackId={grouped ? undefined : "a"} fill={s.color} radius={grouped || i === series.length - 1 ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0} barSize={horizontal ? 20 : undefined} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** The charts above the tables of the revenue view: share of the money by channel and paid against still due (rings), the same by channel (bars), and money by check-out day. Same numbers as the cards and tables below. */
export function RevenueCharts({ channels, days }: { channels: Channel[]; days: Day[] }) {
  if (channels.length === 0) return null;
  const byChannel = channels.map((c) => ({ x: c.name, room: c.room, service: c.service, payment: c.payment, balance: c.balance }));
  const byDay = days.map((d) => ({ x: fmtDate(d.date).slice(0, 5), room: d.room, service: d.service }));
  const sum = (k: "payment" | "balance") => channels.reduce((s, c) => s + c[k], 0);
  return <div className="summary-grid revenue-charts">
    <article className="summary-chart">
      <h4>Cơ cấu doanh thu theo nguồn</h4>
      <p className="summary-note">Tổng tiền (phòng + dịch vụ) của từng nguồn, tỷ trọng và số tiền.</p>
      <Donut width="100%" animate={false} unit="đ" slices={channels.map((c, i) => ({ name: c.name, value: c.room + c.service, color: PALETTE[i % PALETTE.length] }))} />
    </article>
    <article className="summary-chart">
      <h4>Tình trạng thanh toán</h4>
      <p className="summary-note">Đã thu và còn phải thu của các đặt phòng trong kỳ, gồm phần ngoài kỳ.</p>
      <Donut width="100%" animate={false} unit="đ" slices={[{ name: "Đã thanh toán", value: sum("payment"), color: PAID }, { name: "Còn phải thu", value: sum("balance"), color: DUE }]} />
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

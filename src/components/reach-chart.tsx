"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDate } from "@/lib/format-date";
import type { Col } from "@/components/reach-table";

const AXIS = { fill: "#586b84", fontSize: 12 };
const TOOLTIP = { contentStyle: { border: "1px solid #dfe6f0", borderRadius: 10, boxShadow: "0 8px 24px #1b2b4518", fontSize: 13 }, labelStyle: { color: "#344862", fontWeight: 700 } };
const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
const compact = (x: number) => new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(x);

function Metrics({ labels, value, onChange, name }: { labels: string[]; value: string; onChange: (label: string) => void; name: string }) {
  return <div className="range-presets reconcile-filter" role="group" aria-label={name}>{labels.map((l) => <button type="button" key={l} aria-pressed={value === l} onClick={() => onChange(l)}>{l}</button>)}</div>;
}

/** Two charts of the rows on the page: the chosen figure per place (bars) and per day (line, all places added up). Only additive numeric columns are offered. */
export function ReachChart<R, D>({ rows, columns, nameOf, daily, dailyColumns, dayOf }: { rows: R[]; columns: Col<R>[]; nameOf: (row: R) => string; daily: D[]; dailyColumns: Col<D>[]; dayOf: (row: D) => string }) {
  const byPlace = columns.filter((c) => c.value && c.total);
  const byDay = dailyColumns.filter((c) => c.value && c.total);
  const [placeMetric, setPlaceMetric] = useState("");
  const [dayMetric, setDayMetric] = useState("");
  const place = byPlace.find((c) => c.label === placeMetric) ?? byPlace[0];
  const day = byDay.find((c) => c.label === dayMetric) ?? byDay[0];
  if (!place || !day) return null;
  const chartHeight = Math.max(240, rows.length * 36 + 24); // both charts the same height
  const placeData = rows.map((r) => ({ name: nameOf(r), value: place.value!(r) ?? 0 })).sort((a, b) => b.value - a.value);
  const sums = new Map<string, number>();
  for (const r of daily) sums.set(dayOf(r), (sums.get(dayOf(r)) ?? 0) + (day.value!(r) ?? 0));
  const dayData = [...sums].sort((a, b) => a[0].localeCompare(b[0])).map(([d, value]) => ({ x: fmtDate(d).slice(0, 5), value }));
  return (
    <div className="reach-charts">
      <div>
        <h4>{place.label} theo từng nơi</h4>
        <Metrics labels={byPlace.map((c) => c.label)} value={place.label} onChange={setPlaceMetric} name="Chỉ số theo nơi" />
        <div role="img" aria-label={`${place.label} theo từng nơi`} style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={placeData} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#edf1f6" horizontal={false} />
              <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} />
              <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} width={170} interval={0} tickFormatter={(v: string) => (v.length > 26 ? `${v.slice(0, 25)}…` : v)} />
              <Tooltip {...TOOLTIP} formatter={(v) => num(Number(v))} cursor={{ fill: "#f4f6f9" }} />
              <Bar dataKey="value" name={place.label} fill="#285ca9" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <h4>{day.label} theo ngày</h4>
        <Metrics labels={byDay.map((c) => c.label)} value={day.label} onChange={setDayMetric} name="Chỉ số theo ngày" />
        <div role="img" aria-label={`${day.label} theo ngày`} style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dayData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#edf1f6" vertical={false} />
              <XAxis dataKey="x" tick={AXIS} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={52} tickFormatter={compact} />
              <Tooltip {...TOOLTIP} formatter={(v) => num(Number(v))} />
              <Line dataKey="value" name={day.label} stroke="#285ca9" strokeWidth={2} dot={dayData.length <= 14 ? { r: 3 } : false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDate } from "@/lib/format-date";
import type { Platform } from "@/lib/types";
import { placeColors } from "@/components/dashboard-charts";
import { PlatformBrandLogo } from "@/components/platform-brand-logo";
import { Keys, Stacked, Tip, type Series, type TipProps } from "@/components/bluejay-revenue-charts";

// The report pages' recharts blocks, kept out of the main bundle: reviewdesk-app loads this file only when a report is open.
// Same pieces as the Vận hành charts: the legend above, the hover card with every series, solid hairline grid, 2px lines with ringed dots.
const moneyless = (value: number) => new Intl.NumberFormat("vi-VN").format(value);
const score = (value: number) => value.toFixed(1).replace(".", ",");
type Rows = Record<string, string | number | null>[];
type Place = { id: string; name: string };
const AXIS = { fill: "#696974", fontSize: 12 };

/** One line per series over the days; y is fitted to the data unless a domain is given. */
function Lines({ rows, series, fmt, axis = fmt, domain, label, height = 300 }: { rows: Rows; series: Series[]; fmt: (v: number) => string; axis?: (v: number) => string; domain?: [number | ((v: number) => number) | "auto", number | ((v: number) => number) | "auto"]; label: string; height?: number }) {
  const data = rows.map((r) => ({ ...r, x: fmtDate(String(r.date)) }));
  const dots = rows.length <= 31;
  return <div>
    <Keys series={series} />
    <div role="img" aria-label={label} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#f0edf6" vertical={false} />
          <XAxis dataKey="x" tick={AXIS} tickLine={false} axisLine={{ stroke: "#e5dff0" }} interval="preserveStartEnd" minTickGap={24} />
          <YAxis domain={domain ?? ["auto", "auto"]} tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={axis} allowDecimals />
          <Tooltip cursor={{ stroke: "#d6d0e2" }} content={(p) => <Tip {...(p as TipProps)} series={series} fmt={fmt} total={false} />} />
          {series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            dot={dots ? { r: 4, fill: s.color, stroke: "#fff", strokeWidth: 2 } : false} activeDot={{ r: 5, fill: s.color, stroke: "#fff", strokeWidth: 2 }} connectNulls isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>;
}

const placeSeries = (locations: Place[], all: Place[]) => { const colors = placeColors(all); return locations.map((l) => ({ key: l.id, name: l.name, color: colors.get(l.id) ?? "#b4b4be" })); };
// a score axis: from half a point under the lowest score to the top of the scale, so 4,6 and 4,9 read apart
const scoreDomain = (scale: number): [(v: number) => number, number] => [(min: number) => Math.max(0, Math.floor(min * 2 - 1) / 2), scale];

/** Score per day, one line per place. `all`: every place of the kind, for colours that do not change with the selection. */
export function PlaceScoreLines({ rows, locations, all = locations, scale }: { rows: Rows; locations: Place[]; all?: Place[]; scale: number }) {
  return <Lines rows={rows} series={placeSeries(locations, all)} fmt={(v) => `${score(v)} / ${scale}`} axis={score} domain={scoreDomain(scale)} label="Điểm đánh giá theo ngày" />;
}

/** New reviews per day (the change of each place's review count from the day before), stacked by place, so the busy days stand out. */
export function PlaceNewReviews({ rows, locations, all = locations }: { rows: Rows; locations: Place[]; all?: Place[] }) {
  const series = placeSeries(locations, all);
  const data = rows.slice(1).map((r, i) => {
    const prev = rows[i];
    const out: Record<string, string | number | null> = { x: fmtDate(String(r.date)).slice(0, 5) };
    for (const s of series) { const a = r[s.key], b = prev[s.key]; out[s.key] = typeof a === "number" && typeof b === "number" ? a - b : null; }
    return out;
  });
  if (data.length === 0) return <p className="report-empty">Cần ít nhất hai ngày đã chốt để tính đánh giá mới.</p>;
  return <Stacked data={data} series={series} label="Đánh giá mới theo ngày" fmt={moneyless} axis={moneyless} valueLabel={moneyless} />;
}

/** Review count per day, one line per place (each place's own level; the new reviews chart shows the change). */
export function PlaceReviewLines({ rows, locations, all = locations }: { rows: Rows; locations: Place[]; all?: Place[] }) {
  return <Lines rows={rows} series={placeSeries(locations, all)} fmt={(v) => `${moneyless(v)} lượt`} axis={moneyless} domain={[(min: number) => Math.floor(min * 0.95), "auto"]} label="Lượt đánh giá theo ngày" />;
}

/** Star score per day, one line per platform. */
export function PlatformScoreLines({ data, domain, scale, platforms, colors, labels }: { data: Rows; domain: { min: number; max: number }; scale: number; platforms: Platform[]; colors: Record<Platform, string>; labels: Record<Platform, string>; days?: number }) {
  return <Lines rows={data} series={platforms.map((p) => ({ key: p, name: labels[p], color: colors[p], icon: <PlatformBrandLogo platform={p} /> }))} fmt={(v) => `${score(v)} / ${scale}`} axis={score} domain={[domain.min, domain.max]} label="Diễn biến điểm sao" />;
}

"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDate } from "@/lib/format-date";
import type { Platform } from "@/lib/types";

// The report page's recharts blocks, kept out of the main bundle: reviewdesk-app loads this file only when a report is open.
const moneyless = (value: number) => new Intl.NumberFormat("vi-VN").format(value);
type Rows = Record<string, string | number | null>[];
type Place = { id: string; name: string };

/** Score per day, one bar per hotel. */
export function HotelScoreBars({ rows, locations, scale }: { rows: Rows; locations: Place[]; scale: number }) {
  return (
    <ResponsiveContainer width="100%" height={390}>
                        <BarChart data={rows} margin={{ top: 12, right: 20, bottom: 8, left: 8 }} barGap={2}>
                          <CartesianGrid stroke="#ede8f5" strokeDasharray="3 5" vertical={false} />
                          <XAxis dataKey="date" tickFormatter={(value: string) => fmtDate(value)} tick={{ fill: "#7f7f8c", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#e5dff0" }} />
                          <YAxis domain={[0, scale]} tick={{ fill: "#7f7f8c", fontSize: 11 }} tickLine={false} axisLine={false} width={38} />
                          <Tooltip labelFormatter={(value) => fmtDate(String(value))} formatter={(value, name) => [typeof value === "number" ? `${value.toFixed(1).replace(".", ",")} / ${scale}` : "—", String(name)]} contentStyle={{ border: "1px solid #e5dff0", borderRadius: 10, fontSize: 12 }} />
                          <Legend verticalAlign="bottom" height={40} iconType="square" wrapperStyle={{ fontSize: 11 }} />
                          {locations.map((location, index) => <Bar key={location.id} dataKey={location.id} name={location.name} fill={["#3568c8", "#d88a3d", "#22a28d", "#8b63c7", "#c75c73", "#5b8e46"][index % 6]} maxBarSize={32} isAnimationActive={false} />)}
                        </BarChart>
                      </ResponsiveContainer>
  );
}

/** Review count per day, one bar per hotel. */
export function HotelReviewBars({ rows, locations }: { rows: Rows; locations: Place[] }) {
  return (
    <ResponsiveContainer width="100%" height={390}>
                        <BarChart data={rows} margin={{ top: 12, right: 20, bottom: 8, left: 8 }} barGap={2}>
                          <CartesianGrid stroke="#ede8f5" strokeDasharray="3 5" vertical={false} />
                          <XAxis dataKey="date" tickFormatter={(value: string) => fmtDate(value)} tick={{ fill: "#7f7f8c", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#e5dff0" }} />
                          <YAxis domain={[0, "auto"]} allowDecimals={false} tickFormatter={(value: number) => moneyless(value)} tick={{ fill: "#7f7f8c", fontSize: 11 }} tickLine={false} axisLine={false} width={58} />
                          <Tooltip labelFormatter={(value) => fmtDate(String(value))} formatter={(value, name) => [typeof value === "number" ? `${moneyless(value)} lượt đánh giá` : "—", String(name)]} contentStyle={{ border: "1px solid #e5dff0", borderRadius: 10, fontSize: 12 }} />
                          <Legend verticalAlign="bottom" height={40} iconType="square" wrapperStyle={{ fontSize: 11 }} />
                          {locations.map((location, index) => <Bar key={location.id} dataKey={location.id} name={location.name} fill={["#3568c8", "#d88a3d", "#22a28d", "#8b63c7", "#c75c73", "#5b8e46"][index % 6]} maxBarSize={32} isAnimationActive={false} />)}
                        </BarChart>
                      </ResponsiveContainer>
  );
}

/** Star score per day, one line per platform. */
export function PlatformScoreLines({ data, domain, scale, platforms, colors, labels, days }: { data: Rows; domain: { min: number; max: number }; scale: number; platforms: Platform[]; colors: Record<Platform, string>; labels: Record<Platform, string>; days: number }) {
  return (
    <ResponsiveContainer width="100%" height={340}>
                            <LineChart data={data} margin={{ top: 12, right: 18, bottom: 8, left: 8 }}>
                              <CartesianGrid stroke="#ede8f5" strokeDasharray="3 5" vertical={false} />
                              <XAxis dataKey="date" tickFormatter={(value: string) => fmtDate(value)} minTickGap={22} tick={{ fill: "#7f7f8c", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#e5dff0" }} />
                              <YAxis domain={[domain.min, domain.max]} tickFormatter={(value: number) => value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} width={48} tick={{ fill: "#7f7f8c", fontSize: 11 }} tickLine={false} axisLine={false} />
                              <Tooltip labelFormatter={(value) => fmtDate(String(value))} formatter={(value, name) => [typeof value === "number" ? `${value.toFixed(1).replace(".", ",")} / ${scale}` : "—", labels[name as Platform] ?? String(name)]} contentStyle={{ border: "1px solid #e5dff0", borderRadius: 10, boxShadow: "0 8px 24px #2a1b4518", fontSize: 12 }} labelStyle={{ color: "#47474f", fontWeight: 700, marginBottom: 5 }} />
                              <Legend verticalAlign="bottom" height={34} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#6d6d78" }} formatter={(value) => labels[value as Platform] ?? String(value)} />
                              {platforms.map((platform) => <Line key={platform} type="monotone" dataKey={platform} name={platform} stroke={colors[platform]} strokeWidth={2.5} dot={days <= 31 ? { r: 2.5, fill: "#fff", strokeWidth: 2 } : false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />)}
                            </LineChart>
                          </ResponsiveContainer>
  );
}

/** Compare page: score per day, one line per place. */
export function CompareScoreLines({ rows, locations, scale }: { rows: Rows; locations: Place[]; scale: number }) {
  return (
    <ResponsiveContainer width="100%" height={340}><LineChart data={rows} margin={{ top: 12, right: 20, bottom: 8, left: 8 }}><CartesianGrid stroke="#ede8f5" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="date" tickFormatter={(value: string) => fmtDate(value)} tick={{ fill: "#7f7f8c", fontSize: 11 }} tickLine={false} minTickGap={24} /><YAxis domain={[(min: number) => Math.max(0, Math.floor(min * 2 - 1) / 2), scale]} width={38} tickLine={false} axisLine={false} /><Tooltip labelFormatter={(value) => fmtDate(String(value))} formatter={(value, name) => [typeof value === "number" ? `${value.toFixed(2).replace(".", ",")} / ${scale}` : "—", String(name)]} /><Legend verticalAlign="bottom" height={40} />{locations.map((location, index) => <Line key={location.id} type="monotone" dataKey={location.id} name={location.name} stroke={["#3568c8", "#d88a3d", "#22a28d", "#8b63c7", "#c75c73", "#5b8e46"][index % 6]} strokeWidth={2.5} dot={rows.length <= 31 ? { r: 2.5, fill: "#fff", strokeWidth: 2 } : false} connectNulls isAnimationActive={false} />)}</LineChart></ResponsiveContainer>
  );
}

/** Compare page: review count per day, one line per place. */
export function CompareReviewLines({ rows, locations }: { rows: Rows; locations: Place[] }) {
  return (
    <ResponsiveContainer width="100%" height={340}><LineChart data={rows} margin={{ top: 12, right: 20, bottom: 8, left: 8 }}><CartesianGrid stroke="#ede8f5" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="date" tickFormatter={(value: string) => fmtDate(value)} tick={{ fill: "#7f7f8c", fontSize: 11 }} tickLine={false} minTickGap={24} /><YAxis domain={[(min: number) => Math.floor(min * 0.95), "auto"]} allowDecimals={false} tickFormatter={(value: number) => moneyless(value)} width={58} tickLine={false} axisLine={false} /><Tooltip labelFormatter={(value) => fmtDate(String(value))} formatter={(value, name) => [typeof value === "number" ? `${moneyless(value)} lượt` : "—", String(name)]} /><Legend verticalAlign="bottom" height={40} />{locations.map((location, index) => <Line key={location.id} type="monotone" dataKey={location.id} name={location.name} stroke={["#3568c8", "#d88a3d", "#22a28d", "#8b63c7", "#c75c73", "#5b8e46"][index % 6]} strokeWidth={2.5} dot={rows.length <= 31 ? { r: 2.5, fill: "#fff", strokeWidth: 2 } : false} connectNulls isAnimationActive={false} />)}</LineChart></ResponsiveContainer>
  );
}

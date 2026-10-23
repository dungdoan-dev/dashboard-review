"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDate } from "@/lib/format-date";

// Màu cho các phần của biểu đồ tròn khi không có màu riêng của loại hình.
export const PALETTE = ["#2563eb", "#f59e0b", "#16a34a", "#8b5cf6", "#ec4899", "#0891b2", "#64748b"];
export const AXIS = { fill: "#586b84", fontSize: 12 };
export const TOOLTIP = { contentStyle: { border: "1px solid #dfe6f0", borderRadius: 10, boxShadow: "0 8px 24px #1b2b4518", fontSize: 13 }, labelStyle: { color: "#344862", fontWeight: 700 } };
export const num = (value: number, digits = 1) => value.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export type Slice = { name: string; value: number; color: string };

/** Biểu đồ tròn rỗng giữa, chú thích bên phải kèm tỷ trọng. */
export function Donut({ slices: unsorted, unit, width, animate }: { slices: Slice[]; unit: string; width: number | "100%"; animate: boolean }) {
  const slices = [...unsorted].sort((a, b) => b.value - a.value);
  const total = slices.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return <p className="summary-note">Chưa có số liệu để vẽ.</p>;
  return <ResponsiveContainer width={width} height={Math.max(200, slices.length * 28 + 40)}>
    <PieChart>
      <Pie data={slices} dataKey="value" nameKey="name" cx="38%" innerRadius="55%" outerRadius="85%" paddingAngle={slices.length > 1 ? 2 : 0} stroke="none" isAnimationActive={animate}>
        {slices.map((item) => <Cell key={item.name} fill={item.color} />)}
      </Pie>
      <Tooltip {...TOOLTIP} formatter={(value, name) => [typeof value === "number" ? `${value.toLocaleString("vi-VN")} ${unit}` : "—", name]} />
      <Legend itemSorter={null} layout="vertical" verticalAlign="middle" align="right" iconType="circle" iconSize={9}
        formatter={(name: string) => { const item = slices.find((slice) => slice.name === name); return <span style={{ color: "#46586f", fontSize: 13 }}>{name} <strong style={{ color: "#233a5a" }}>{item ? Math.round((item.value / total) * 100) : 0}%</strong></span>; }} />
    </PieChart>
  </ResponsiveContainer>;
}

/** Thanh tiến độ trên nền xám: dễ so thứ hạng, giá trị ghi ngay bên phải. */
export function TrackBars({ rows: unsorted, max, width, animate, format = num }: { rows: { name: string; value: number; color: string }[]; max: number; width: number | "100%"; animate: boolean; format?: (value: number) => string }) {
  const rows = [...unsorted].sort((a, b) => b.value - a.value);
  if (rows.length === 0) return <p className="summary-note">Chưa có điểm để vẽ.</p>;
  return <ResponsiveContainer width={width} height={rows.length * 44 + 16}>
    <BarChart layout="vertical" data={rows} margin={{ left: 0, right: 40, top: 4, bottom: 4 }}>
      <XAxis type="number" domain={[0, max]} hide />
      <YAxis type="category" dataKey="name" width={150} tick={AXIS} tickLine={false} axisLine={false} />
      <Tooltip {...TOOLTIP} cursor={false} formatter={(value) => [typeof value === "number" ? format(value) : "—", "Giá trị"]} />
      <Bar isAnimationActive={animate} dataKey="value" barSize={12} radius={6} background={{ fill: "#eaeff6", radius: 6 }}>
        {rows.map((row) => <Cell key={row.name} fill={row.color} />)}
        <LabelList dataKey="value" position="right" formatter={(value) => (typeof value === "number" ? format(value) : "")} fill="#233a5a" fontSize={13} fontWeight={700} />
      </Bar>
    </BarChart>
  </ResponsiveContainer>;
}

/** Biểu đồ vùng có gradient và chấm: một đường theo ngày. */
export function AreaTrend({ points, color, width, animate, id, label, format }: { points: { date: string; value: number }[]; color: string; width: number | "100%"; animate: boolean; id: string; label: string; format: (value: number) => string }) {
  if (points.length < 2) return <p className="summary-note">Cần ít nhất 2 ngày đã chốt số liệu để vẽ diễn biến.</p>;
  return <ResponsiveContainer width={width} height={240}>
    <AreaChart data={points} margin={{ left: 0, right: 16, top: 8 }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0.02} /></linearGradient></defs>
      <CartesianGrid vertical={false} stroke="#e8edf4" />
      <XAxis dataKey="date" tickFormatter={(value: string) => fmtDate(value)} tick={AXIS} tickLine={false} axisLine={{ stroke: "#dfe6f0" }} minTickGap={24} />
      <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={(value: number) => value.toLocaleString("vi-VN")} />
      <Tooltip {...TOOLTIP} labelFormatter={(value) => fmtDate(String(value))} formatter={(value) => [typeof value === "number" ? format(value) : "—", label]} />
      <Area isAnimationActive={animate} type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} fill={`url(#${id})`} dot={points.length <= 31 ? { r: 3, fill: "#fff", stroke: color, strokeWidth: 2 } : false} />
    </AreaChart>
  </ResponsiveContainer>;
}

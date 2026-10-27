"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, Donut, PALETTE, TOOLTIP } from "@/components/dashboard-charts";
import { ReachTable, type Col } from "@/components/reach-table";
import { countBy, statusTone, type HrBirthday, type HrCand, type HrNeed, type HrIntv, type HrPayload, type HrStaff } from "@/lib/hr";

const PIPELINE = ["Mới nhận", "Sàng lọc", "Hẹn phỏng vấn", "Phỏng vấn", "Đã phỏng vấn", "Offer", "Thử việc", "Chính thức"];

export function Columns({ rows, unit }: { rows: [string, number][]; unit: string }) {
  if (!rows.length) return <p className="summary-note">Chưa có dữ liệu.</p>;
  const data = rows.map(([name, value]) => ({ name, value }));
  return <ResponsiveContainer width="100%" height={280}>
    <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
      <CartesianGrid stroke="#edf1f6" vertical={false} />
      <XAxis dataKey="name" tick={AXIS} tickLine={false} interval={0} angle={data.length > 4 ? -25 : 0} textAnchor={data.length > 4 ? "end" : "middle"} height={data.length > 4 ? 70 : 30} tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)} />
      <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={36} />
      <Tooltip {...TOOLTIP} cursor={{ fill: "#f4f6f9" }} formatter={(v) => `${v} ${unit}`} />
      <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>{data.map((d, i) => <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />)}</Bar>
    </BarChart>
  </ResponsiveContainer>;
}

const Badge = ({ text }: { text: string }) => <span className={`hr-badge ${statusTone(text)}`}>{text || "—"}</span>;

const recentCols: Col<HrCand>[] = [
  { label: "Ứng viên", text: (c) => c.name, render: (c) => <>{c.name}<small>{c.id}</small></> },
  { label: "Vị trí", text: (c) => c.title || "—" }, { label: "Nguồn", text: (c) => c.source || "—" },
  { label: "Trạng thái", text: (c) => c.status, render: (c) => <Badge text={c.status} /> },
];

/** Tổng quan: the sheet's KPI cards, four charts, the newest candidates and the next birthdays. */
export function HrOverview({ data, staff, needs, cands, intvs, bdays }: { data: HrPayload; staff: HrStaff[]; needs: HrNeed[]; cands: HrCand[]; intvs: HrIntv[]; bdays: HrBirthday[] }) {
  const kpis = data.kpi.filter((k) => k.label);
  const counts = new Map(countBy(cands, (c) => c.status));
  const pipeline: [string, number][] = [...PIPELINE.filter((s) => counts.has(s)), ...[...counts.keys()].filter((s) => !PIPELINE.includes(s))].map((s) => [s, counts.get(s)!]);
  const needByDept = [...needs.reduce((m, n) => m.set(n.dept || "Khác", (m.get(n.dept || "Khác") ?? 0) + n.qty), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const slices = countBy(staff, (s) => s.dept).map(([name, value], i) => ({ name, value, color: PALETTE[i % PALETTE.length] }));
  return <>
    {kpis.length > 0 && <div className="summary-kpis" aria-label="Chỉ số tổng quan">{kpis.map((k) => <div key={k.label} className="summary-kpi"><span>{k.label}</span><strong>{k.value || "0"}</strong></div>)}</div>}
    <div className="summary-grid">
      <div className="summary-chart"><h4>Ứng viên theo giai đoạn</h4><Columns rows={pipeline} unit="ứng viên" /></div>
      <div className="summary-chart"><h4>Cơ cấu nhân sự theo bộ phận</h4>{slices.length ? <Donut slices={slices} unit="nhân sự" width="100%" animate={false} /> : <p className="summary-note">Chưa có nhân sự.</p>}</div>
      <div className="summary-chart"><h4>Kết quả phỏng vấn</h4><Columns rows={countBy(intvs, (i) => i.result || "Chờ")} unit="lịch" /></div>
      <div className="summary-chart"><h4>Số lượng cần tuyển theo bộ phận</h4><Columns rows={needByDept} unit="người" /></div>
    </div>
    <div className="hr-two">
      <div className="summary-chart"><h4>Ứng viên gần đây</h4>{cands.length ? <ReachTable rows={cands.slice(-7).reverse()} columns={recentCols} rowKey={(c) => c.id} sortable={false} compact /> : <p className="summary-note">Chưa có ứng viên.</p>}</div>
      <div className="summary-chart"><h4>Sinh nhật sắp tới</h4>{bdays.length ? <ul className="hr-list">{[...bdays].sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999)).slice(0, 6).map((b) => <li key={b.id}><span><strong>{b.name}</strong><small>{b.dept || "—"} · {b.next}</small></span><span className="hr-badge orange">{b.daysLeft === null ? "—" : b.daysLeft === 0 ? "Hôm nay" : `${b.daysLeft} ngày`}</span></li>)}</ul> : <p className="summary-note">Chưa có dữ liệu sinh nhật.</p>}</div>
    </div>
  </>;
}

"use client";

import { PALETTE } from "@/components/dashboard-charts";
import { Stacked, compact, type Series } from "@/components/bluejay-revenue-charts";
import { ReachTable, type Col } from "@/components/reach-table";
import { assetOverview, type Issue } from "@/lib/asset-overview";
import type { AssetPayload } from "@/lib/asset-forms";

const vnd = (v: number) => `${Math.round(v).toLocaleString("vi-VN")} đ`;
const count = (v: number) => v.toLocaleString("vi-VN");
// The two parts of an asset's original cost: what is still on the books (the measure) and what is written off (the neutral rest).
const VALUE: Series[] = [{ key: "left", name: "Giá trị còn lại", color: PALETTE[0] }, { key: "used", name: "Đã khấu hao", color: "#c9c9d1" }];
const STATUS: Series[] = [{ key: "n", name: "Tài sản", color: PALETTE[0] }];
const SPEND: Series[] = [{ key: "cost", name: "Chi phí bảo trì", color: PALETTE[1] }];

const issueCols: Col<Issue>[] = [
  { label: "Tài sản", text: (i) => i.id, render: (i) => <>{i.id}<small>{i.name}</small></> },
  { label: "Cần xử lý", text: (i) => i.text }, { label: "Người giữ / mượn", text: (i) => i.who || "—" }, { label: "Vị trí", text: (i) => i.place || "—" },
];

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="summary-kpi"><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>;
}

/** Tổng quan of the Tài sản page: KPI cards, value by type and by unit, status, maintenance spend of the last 12 months and what needs action. */
export function AssetOverview({ data }: { data: AssetPayload }) {
  const o = assetOverview(data);
  const issues = <div className="summary-chart wide"><h4>Cần xử lý<small>{count(o.issues.length)} việc</small></h4>
    {o.issues.length ? <ReachTable rows={o.issues} columns={issueCols} rowKey={(i) => `${i.id}-${i.text}`} compact /> : <p className="summary-note">Không có cảnh báo nào.</p>}
  </div>;
  if (!o.count && !o.disposed) return <p className="summary-note">Chưa có tài sản trong sổ.</p>;
  return <>
    <div className="summary-kpis" aria-label="Chỉ số tài sản">
      <Kpi label="Tài sản đang quản lý" value={count(o.count)} sub={o.disposed ? `${count(o.disposed)} đã thanh lý` : undefined} />
      <Kpi label="Tổng nguyên giá" value={`${compact(o.cost)} đ`} sub={vnd(o.cost)} />
      <Kpi label="Giá trị còn lại" value={`${compact(o.left)} đ`} sub={vnd(o.left)} />
      <Kpi label="Đã khấu hao" value={`${Math.round(o.usedShare * 100)}%`} sub={`${compact(o.used)} đ nguyên giá`} />
      <Kpi label="Bảo trì 12 tháng" value={`${compact(o.maintenanceTotal)} đ`} sub={vnd(o.maintenanceTotal)} />
      <Kpi label="Cần xử lý" value={count(o.issues.length)} sub={o.lateLoans ? `${count(o.lateLoans)} phiếu mượn quá hạn` : undefined} />
    </div>
    {o.issues.length > 0 && issues /* what needs doing comes before the charts */}
    <div className="summary-grid">
      <div className="summary-chart"><h4>Giá trị theo loại tài sản</h4>{o.byType.length ? <Stacked data={o.byType} series={VALUE} label="Giá trị còn lại và đã khấu hao theo loại tài sản" horizontal fmt={vnd} /> : <p className="summary-note">Chưa có số liệu.</p>}</div>
      <div className="summary-chart"><h4>Giá trị theo đơn vị quản lý</h4>{o.byUnit.length ? <Stacked data={o.byUnit} series={VALUE} label="Giá trị còn lại và đã khấu hao theo đơn vị quản lý" horizontal fmt={vnd} /> : <p className="summary-note">Chưa có số liệu.</p>}</div>
      <div className="summary-chart"><h4>Tài sản theo trạng thái sử dụng</h4><Stacked data={o.byStatus} series={STATUS} label="Số tài sản theo trạng thái sử dụng" horizontal whole fmt={count} axis={count} /></div>
      <div className="summary-chart"><h4>Chi phí bảo trì 12 tháng gần nhất</h4><Stacked data={o.maintenance} series={SPEND} label="Chi phí bảo trì theo tháng, 12 tháng gần nhất" fmt={vnd} /></div>
    </div>
    {!o.issues.length && issues}
  </>;
}

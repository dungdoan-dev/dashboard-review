"use client";

import { LoaderCircle, Medal } from "lucide-react";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDate } from "@/lib/format-date";
import { ReachTable } from "@/components/reach-table";

export type TripadvisorRankReportRow = {
  date: string;
  rankLabel: string;
  tripadvisorNotice: string | null;
  position: number | null;
  total: number | null;
  category: string | null;
  rating: number | null;
  ratingScale: number;
  reviewCount: number | null;
};

type Props = {
  locationName: string | null;
  rows: TripadvisorRankReportRow[];
  loading: boolean;
  error: string;
};

const countText = (value: number) => new Intl.NumberFormat("vi-VN").format(value);

export default function TripadvisorRankReportPage({ locationName, rows, loading, error }: Props) {
  const chartRows = useMemo(() => rows
    .filter((row) => row.position != null)
    .map((row) => ({ date: row.date, position: row.position as number, rankLabel: row.rankLabel })), [rows]);
  const rankRows = rows.filter((row) => row.rankLabel);
  const noticeRows = rows.filter((row) => row.tripadvisorNotice);
  const latest = rankRows[rankRows.length - 1] ?? null;
  const previous = rankRows[rankRows.length - 2] ?? null;
  const change = latest?.position != null && previous?.position != null ? previous.position - latest.position : null;

  return <section className="tripadvisor-rank-page" aria-labelledby="tripadvisor-rank-title">
    <header className="daily-analytics-heading">
      <div>
        <div className="section-kicker"><Medal size={14} /> BÁO CÁO ĐÃ CHỐT</div>
        <h1 id="tripadvisor-rank-title">Xếp hạng Tripadvisor</h1>
        <p>Lịch sử thứ hạng, điểm sao và lượt đánh giá đã chốt của {locationName ?? "chi nhánh đang chọn"}.</p>
      </div>
    </header>
    {loading ? <div className="timeline-panel timeline-empty"><LoaderCircle size={17} className="spin" />Đang tải lịch sử xếp hạng…</div>
      : error ? <div className="timeline-panel timeline-empty timeline-error">Không tải được lịch sử: {error}</div>
        : rows.length === 0 ? <div className="timeline-panel timeline-empty"><Medal size={18} /><div><strong>Chưa có xếp hạng Tripadvisor đã chốt</strong><span>Chốt dữ liệu Tripadvisor từ trang Dashboard theo ngày để bắt đầu theo dõi thứ hạng.</span></div></div>
          : <>
            <div className="analytics-summary-grid rank-summary-grid">
              <article className="analytics-summary-card"><span>Xếp hạng gần nhất</span><strong>{latest?.position != null ? `#${latest.position}` : "—"}</strong><small>{latest?.total != null ? `trong ${latest.total}` : latest?.category ?? latest?.rankLabel}</small></article>
              <article className="analytics-summary-card"><span>Thay đổi so với lần trước</span><strong className={change == null ? "" : change > 0 ? "rank-improved" : change < 0 ? "rank-declined" : ""}>{change == null ? "—" : change > 0 ? `↑ ${change}` : change < 0 ? `↓ ${Math.abs(change)}` : "Không đổi"}</strong><small>{change == null ? "Cần ít nhất hai lần chốt có thứ hạng" : change > 0 ? "Bậc xếp hạng được cải thiện" : change < 0 ? "Bậc xếp hạng giảm" : "Giữ nguyên thứ hạng"}</small></article>
              <article className="analytics-summary-card"><span>Số ngày có thứ hạng</span><strong>{countText(rankRows.length)}</strong><small>{latest?.date ? `Cập nhật ${fmtDate(latest.date)}` : locationName}</small></article>
            </div>
            <article className="report-card analytics-chart-card rank-chart-card">
              <header><div><h3>Diễn biến thứ hạng</h3><p>Số thứ hạng thấp hơn nằm cao hơn trên biểu đồ.</p></div><span className="report-total-badge">{rankRows.length} lần chốt</span></header>
              {chartRows.length > 0 ? <div className="analytics-chart-scroll">
                <ResponsiveContainer width="100%" height={310}>
                  <LineChart data={chartRows} margin={{ top: 14, right: 18, bottom: 8, left: 8 }}>
                    <CartesianGrid stroke="#ede8f5" strokeDasharray="3 5" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(value: string) => fmtDate(value)} minTickGap={22} tick={{ fill: "#7f7f8c", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#e5dff0" }} />
                    <YAxis reversed domain={["dataMin", "dataMax"]} allowDecimals={false} width={54} tickFormatter={(value: number) => `#${value}`} tick={{ fill: "#7f7f8c", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip labelFormatter={(value) => fmtDate(String(value))} formatter={(value, _name, item) => [`${typeof value === "number" ? `#${value}` : "—"}${typeof item.payload?.rankLabel === "string" ? ` · ${item.payload.rankLabel}` : ""}`, "Xếp hạng"]} contentStyle={{ border: "1px solid #e5dff0", borderRadius: 10, boxShadow: "0 8px 24px #2a1b4518", fontSize: 12 }} labelStyle={{ color: "#47474f", fontWeight: 700, marginBottom: 5 }} />
                    <Line type="linear" dataKey="position" name="Xếp hạng" stroke="#168a68" strokeWidth={2.5} dot={{ r: 3, fill: "#168a68", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div> : <p className="report-empty">Nhãn xếp hạng hiện tại chưa có dạng số để vẽ biểu đồ; bảng bên dưới vẫn hiển thị nguyên văn dữ liệu đã chốt.</p>}
            </article>
            {noticeRows.length > 0 && <article className="report-card tripadvisor-notice-card">
              <header><div><h3>Báo cáo từ Tripadvisor</h3><p>Nội dung thông báo được lưu cùng số liệu đã chốt của từng ngày.</p></div><span className="report-total-badge">{noticeRows.length} ngày có thông báo</span></header>
              <div className="tripadvisor-notice-list">{[...noticeRows].reverse().map((row) => <section className="tripadvisor-notice-item" key={row.date}><h4>{fmtDate(row.date)}</h4><p>{row.tripadvisorNotice}</p></section>)}</div>
            </article>}
            <article className="report-card rank-history-card">
              <header><div><h3>Lịch sử xếp hạng đã chốt</h3><p>Giữ nguyên tên danh mục Tripadvisor trả về để đối chiếu theo ngày.</p></div><span className="report-scale-badge">{locationName}</span></header>
              <ReachTable compact rows={[...rows].reverse()} rowKey={(row) => row.date} columns={[
                { label: "Ngày", text: (row) => fmtDate(row.date), sort: (row) => row.date },
                { label: "Xếp hạng", text: (row) => row.rankLabel || "—", sort: (row) => String(row.position ?? 999999).padStart(6, "0"), render: (row) => <strong>{row.rankLabel || "—"}</strong> },
                { label: "Điểm Tripadvisor", text: (row) => (row.rating == null ? "—" : `${row.rating.toFixed(1).replace(".", ",")} / ${row.ratingScale}`), value: (row) => row.rating },
                { label: "Lượt đánh giá", text: (row) => (row.reviewCount == null ? "—" : countText(row.reviewCount)), value: (row) => row.reviewCount },
              ]} />
            </article>
          </>}
  </section>;
}

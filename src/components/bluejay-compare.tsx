"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine } from "lucide-react";
import { fmtDate } from "@/lib/format-date";
import { compareRows, type CompareRow } from "@/lib/hotel-compare";
import type { DailyRevenue } from "@/lib/bluejay-daily";
import type { RangeData } from "@/lib/bluejay-range";
import { ReachTable, type Col } from "@/components/reach-table";
import { PageSkeleton } from "@/components/page-skeleton";

const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
const pct = (x: number | null) => (x === null ? "–" : `${(x * 100).toFixed(2).replace(".", ",")}%`);
const monthEnd = (month: string) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const shiftMonth = (month: string, by: number) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7); };

type Loaded = { month: string; daily: DailyRevenue | null; range: RangeData | null; message: string };

/** The accountant's weekly summary for all hotels side by side (nights, occupancy, revenue by line, OTA commission as the deduction, total), from the Blue Jay weeks already stored. */
export function BluejayCompare() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [state, setState] = useState<Loaded | null>(null);
  const from = `${month}-01`, to = monthEnd(month);

  useEffect(() => {
    let active = true;
    Promise.all([fetch(`/api/bluejay/daily?from=${from}&to=${to}`, { cache: "no-store" }), fetch(`/api/bluejay/range?from=${from}&to=${to}`, { cache: "no-store" })])
      .then(async ([d, r]) => {
        const dailyBody = await d.json().catch(() => ({})), rangeBody = await r.json().catch(() => ({}));
        if (!active) return;
        const message = !d.ok ? dailyBody.message ?? `Lỗi ${d.status}` : !r.ok ? rangeBody.message ?? `Lỗi ${r.status}` : "";
        setState({ month, daily: message ? null : dailyBody, range: message ? null : rangeBody, message });
      })
      .catch(() => { if (active) setState({ month, daily: null, range: null, message: "Không kết nối được máy chủ." }); });
    return () => { active = false; };
  }, [month, from, to]);

  const loaded = state?.month === month ? state : null;
  const rows = useMemo(() => {
    if (!loaded?.daily || !loaded.range) return [];
    return compareRows(month, loaded.daily, loaded.range);
  }, [loaded, month]);

  const monthRows = rows.filter((r) => r.week === "Cả tháng" && !r.chain && r.missingDays > 0);
  const cols: Col<CompareRow>[] = [
    { label: "Tuần", text: (r) => r.week },
    { label: "Thương hiệu", text: (r) => r.hotel },
    { label: "Số phòng (đêm)", value: (r) => r.rooms, text: (r) => num(r.rooms) },
    { label: "Phòng bán (đêm)", value: (r) => r.available, text: (r) => num(r.available) },
    { label: "Công suất (OCC)", value: (r) => r.occ, text: (r) => pct(r.occ) },
    { label: "Doanh thu phòng", value: (r) => r.room, text: (r) => num(r.room) },
    { label: "Doanh thu Minibar", value: (r) => r.minibar, text: (r) => num(r.minibar) },
    { label: "Doanh thu DV ngoài", value: (r) => r.outside, text: (r) => num(r.outside) },
    { label: "Doanh thu Giặt ủi", value: (r) => r.laundry, text: (r) => num(r.laundry) },
    { label: "Thu khác", value: (r) => r.other, text: (r) => num(r.other) },
    { label: "Giảm giá, giảm trừ doanh thu", value: (r) => r.deduction, text: (r) => num(r.deduction) },
    { label: "Tổng", value: (r) => r.total, text: (r) => num(r.total) },
  ];

  function exportExcel() {
    void Promise.all([import("@/lib/hotel-compare-excel"), import("@/lib/ql-excel")]).then(([m, q]) => q.downloadQlWorkbook(`so-sanh-khach-san-${month}.xlsx`, m.compareWorkbook(`BÁO CÁO TỔNG HỢP KHÁCH SẠN THÁNG ${month.slice(5)}/${month.slice(0, 4)}`, rows)));
  }

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>So sánh khách sạn · tháng {month.slice(5)}/{month.slice(0, 4)}</h1>
          <p>Báo cáo tổng hợp theo tuần của từng khách sạn và toàn chuỗi, theo mẫu của kế toán. Số phòng (đêm), phòng bán và công suất lấy từ báo cáo công suất Blue Jay đã lưu; doanh thu phòng tính theo đêm ở (giá phòng chia đều theo đêm, theo giá hiển thị: Expedia, Trip, Agoda đổ về Blue Jay đã trừ hoa hồng nên được cộng lại), dịch vụ theo ngày bán, bỏ M-Standard và Unassigned. Giảm trừ doanh thu là hoa hồng OTA tính theo % của giá hiển thị (chính sách OTA: Booking 15%, Expedia 15%, Trip 18%, Agoda 20%; Traveloka 20% ở Sontra Sea và Gia Lai, 19% ở Yzistel và Quy Nhơn), không lấy từ Google Sheet nên không gồm phí quẹt thẻ và giảm giá khách.</p>
        </div>
        <div className="summary-controls">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))}>‹ Tháng trước</button>
          <input type="month" aria-label="Tháng" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} />
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))}>Tháng sau ›</button>
          {rows.length > 0 && <button type="button" onClick={exportExcel}><ArrowDownToLine size={15} />Xuất Excel</button>}
        </div>
      </div>

      {!loaded ? <PageSkeleton /> : loaded.message ? <div className="alert alert-error" role="alert"><span>{loaded.message}</span></div> : loaded.daily && <>
        {loaded.daily.missingWeeks.length > 0 && <p className="summary-note bad" role="alert">Blue Jay chưa lưu doanh thu tuần bắt đầu {loaded.daily.missingWeeks.map((d) => fmtDate(d)).join(", ")}: các ngày trong tuần đó thiếu tiền phòng và dịch vụ. Bấm “Cập nhật từ Blue Jay” ở trang Vận hành khách sạn để lấy lại.</p>}
        {monthRows.length > 0 && <p className="summary-note bad" role="alert">Thiếu công suất đã lưu: {monthRows.map((r) => `${r.hotel} ${r.missingDays} ngày`).join(", ")}. Số phòng, phòng bán và công suất của những ngày đó chưa có.</p>}
        <details className="summary-chart wide revenue-fold" open>
          <summary><h4>Báo cáo tổng hợp theo tuần</h4></summary>
          <ReachTable rows={rows} rowKey={(r) => r.key} columns={cols} sortable={false} compact ruled rowClass={(r) => (r.chain ? "report-total" : undefined)} />
        </details>
      </>}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/lib/format-date";
import { BLUEJAY_HOTELS, addDays, isoWeek, mondayOf } from "@/lib/bluejay-metrics";
import type { CheckoutDay, CheckoutRevenue } from "@/lib/bluejay-checkout";
import { ReachTable, type Col } from "@/components/reach-table";

const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
const dm = (date: string) => fmtDate(date);
const monthEnd = (month: string) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const shiftMonth = (month: string, by: number) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7); };

type Row = { key: string; label: string; sort: string; rooms: number; room: number; service: number; total: number; excluded: number; provisional: boolean };
const addDay = (acc: CheckoutDay, d: CheckoutDay): CheckoutDay => ({ date: acc.date, rooms: acc.rooms + d.rooms, room: acc.room + d.room, service: acc.service + d.service, total: acc.total + d.total, excludedRooms: acc.excludedRooms + d.excludedRooms, excludedRoom: acc.excludedRoom + d.excludedRoom, excludedService: acc.excludedService + d.excludedService });

/** Revenue per day of check-out (the whole room and service money of the bookings that check out that day), from the Blue Jay weeks already stored. scopeId: one hotel or null for the chain. */
export function BluejayDaily({ scopeId }: { scopeId: number | null }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [state, setState] = useState<{ month: string; data: CheckoutRevenue | null; message: string } | null>(null);
  const from = `${month}-01`, to = monthEnd(month);
  useEffect(() => {
    let active = true;
    fetch(`/api/bluejay/daily?basis=checkout&from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => { if (active) setState({ month, data: res.ok ? body : null, message: res.ok ? "" : body.message ?? `Lỗi ${res.status}` }); })
      .catch(() => { if (active) setState({ month, data: null, message: "Không kết nối được máy chủ." }); });
    return () => { active = false; };
  }, [month, from, to]);

  const data = state?.month === month ? state.data : null;
  const hotelName = BLUEJAY_HOTELS.find((h) => h.id === scopeId)?.name ?? "Toàn chuỗi";
  // the chain is the sum of its hotels, day by day
  const days = useMemo<CheckoutDay[]>(() => {
    if (!data) return [];
    const hotels = data.hotels.filter((h) => !scopeId || h.id === scopeId);
    return data.hotels[0]?.days.map((_, i) => hotels.reduce<CheckoutDay | null>((acc, h) => (acc ? addDay(acc, h.days[i]) : { ...h.days[i] }), null)!).filter(Boolean) ?? [];
  }, [data, scopeId]);

  const dayRows = useMemo<Row[]>(() => days.map((d) => ({ key: d.date, label: dm(d.date), sort: d.date, ...d, excluded: d.excludedRoom + d.excludedService, provisional: !!data && d.date > data.reliableThrough })), [days, data]);
  const weekRows = useMemo<Row[]>(() => {
    const byWeek = new Map<string, CheckoutDay>();
    for (const d of days) { const monday = mondayOf(d.date); byWeek.set(monday, byWeek.has(monday) ? addDay(byWeek.get(monday)!, d) : { ...d, date: monday }); }
    return [...byWeek].map(([monday, d]) => ({ key: monday, label: `Tuần ${isoWeek(monday)} (${dm(monday < from ? from : monday)}–${dm(addDays(monday, 6) > to ? to : addDays(monday, 6))})`, sort: monday, ...d, excluded: d.excludedRoom + d.excludedService, provisional: !!data && addDays(monday, 6) > data.reliableThrough }));
  }, [days, from, to, data]);

  const cols = (first: string): Col<Row>[] => [
    { label: first, text: (r) => (r.provisional ? `${r.label} *` : r.label), sort: (r) => r.sort },
    { label: "Đêm của đặt phòng", value: (r) => r.rooms, text: (r) => num(r.rooms), total: true },
    { label: "Tiền phòng", value: (r) => r.room, text: (r) => num(r.room), total: true },
    { label: "Tiền dịch vụ", value: (r) => r.service, text: (r) => num(r.service), total: true },
    { label: "Tổng doanh thu", value: (r) => r.total, text: (r) => num(r.total), total: true },
    { label: "M-Standard / Unassigned (không tính)", value: (r) => r.excluded, text: (r) => num(r.excluded), total: true },
  ];
  const sum = (f: (d: CheckoutDay) => number) => days.reduce((s, d) => s + f(d), 0);
  const room = sum((d) => d.room), rooms = sum((d) => d.rooms), service = sum((d) => d.service), excluded = sum((d) => d.excludedRoom + d.excludedService);

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Doanh thu theo ngày · {hotelName}</h1>
          <p>Doanh thu theo ngày trả phòng, cùng cách tính với kế toán: tiền phòng cả đợt ở và tiền dịch vụ của đặt phòng tính vào ngày khách trả phòng. Khác với “thu theo dịch vụ” ở trang Thu chi (tính theo ngày nhận tiền). Bỏ hủy, no-show, hạng M-Standard và phòng Unassigned.</p>
        </div>
        <div className="summary-controls">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))}>‹ Tháng trước</button>
          <input type="month" aria-label="Tháng" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} />
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))}>Tháng sau ›</button>
        </div>
      </div>

      {!state || state.month !== month ? <p className="summary-note">Đang tải…</p> : state.message ? <div className="alert alert-error" role="alert"><span>{state.message}</span></div> : data && <>
        {data.missingWeeks.length > 0 && <p className="summary-note bad" role="alert">Blue Jay chưa lưu tuần bắt đầu {data.missingWeeks.map(dm).join(", ")}: các ngày trong tuần đó thiếu tiền phòng và dịch vụ. Bấm “Cập nhật từ Blue Jay” ở trang Vận hành trong khung giờ API để lấy.</p>}
        {data.reliableThrough && to > data.reliableThrough && <p className="summary-note">Ngày đánh dấu * (từ {dm(addDays(data.reliableThrough, 1))}) là tạm tính: tuần chưa lấy xong từ Blue Jay nên đặt phòng trả phòng sau lần lấy gần nhất chưa có.</p>}
        <div className="summary-kpis">
          <div className="summary-kpi"><span>Tổng doanh thu</span><strong>{num(room + service)}</strong><small>Tiền phòng + dịch vụ</small></div>
          <div className="summary-kpi"><span>Tiền phòng</span><strong>{num(room)}</strong><small>{num(rooms)} đêm của các đặt phòng trả phòng</small></div>
          <div className="summary-kpi"><span>Giá phòng TB / đêm</span><strong>{rooms ? num(room / rooms) : "–"}</strong><small>Tiền phòng chia số đêm</small></div>
          <div className="summary-kpi"><span>Dịch vụ</span><strong>{num(service)}</strong><small>Dịch vụ gắn các đặt phòng trả phòng</small></div>
          <div className="summary-kpi"><span>M-Standard / Unassigned</span><strong>{num(excluded)}</strong><small>{num(sum((d) => d.excludedRooms))} đêm, không tính ở trên</small></div>
          <div className="summary-kpi"><span>Tổng có M-Standard / Unassigned</span><strong>{num(room + service + excluded)}</strong><small>số để so với kế toán</small></div>
        </div>
        <details className="summary-chart wide revenue-fold" open>
          <summary><h4>Theo tuần</h4></summary>
          <ReachTable rows={weekRows} rowKey={(r) => r.key} columns={cols("Tuần")} compact />
        </details>
        <details className="summary-chart wide revenue-fold" open>
          <summary><h4>Theo ngày</h4></summary>
          <ReachTable rows={dayRows} rowKey={(r) => r.key} columns={cols("Ngày")} compact />
        </details>
      </>}
    </section>
  );
}

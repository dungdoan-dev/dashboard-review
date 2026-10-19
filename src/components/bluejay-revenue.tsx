"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/lib/format-date";
import { FLAG_LABELS, revenueTotals, serviceMatrix, type RevenueBooking, type RevenueFlag, type RevenueWeek, type ServiceDay } from "@/lib/bluejay-revenue";

const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
const dm = (date: string) => (date ? fmtDate(date) : "–"); // dd/mm/yyyy

type Row = RevenueBooking & { hotel: string };

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="summary-kpi"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}

/** Revenue and payment per booking, service revenue per day, and the bookings whose money needs a look. scopeId: one hotel or null for the chain. */
export function BluejayRevenue({ monday, scopeId }: { monday: string; scopeId: number | null }) {
  const [state, setState] = useState<{ week: string; revenue: RevenueWeek | null; message: string } | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/bluejay/revenue?week=${monday}`, { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => { if (active) setState({ week: monday, revenue: res.ok ? body.revenue ?? null : null, message: res.ok ? "" : body.message ?? `Lỗi ${res.status}` }); })
      .catch(() => { if (active) setState({ week: monday, revenue: null, message: "Không kết nối được máy chủ." }); });
    return () => { active = false; };
  }, [monday]);

  const hotels = useMemo(() => state?.revenue?.hotels.filter((h) => !scopeId || h.id === scopeId) ?? [], [state, scopeId]);
  if (!state || state.week !== monday) return <p className="summary-note">Đang tải doanh thu…</p>;
  if (state.message) return <div className="alert alert-error" role="alert"><span>{state.message}</span></div>;
  if (!state.revenue) return <p className="summary-note">Chưa có báo cáo doanh thu cho tuần này. Bấm “Cập nhật từ Blue Jay” trong khung giờ API để lấy.</p>;
  return <RevenueView hotels={hotels} showHotel={!scopeId} period="tuần" />;
}

/** The tables and filters, for one week or for any range: hotels carry the bookings (nights and room money already cut to the period) and daily services. */
export function RevenueView({ hotels, showHotel, period }: { hotels: { name: string; bookings: RevenueBooking[]; services: ServiceDay[] }[]; showHotel: boolean; period: "tuần" | "kỳ" }) {
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const rows = useMemo<Row[]>(() => hotels.flatMap((h) => h.bookings.map((b) => ({ ...b, hotel: h.name }))), [hotels]);
  const totals = useMemo(() => revenueTotals(rows), [rows]);
  const services = useMemo(() => serviceMatrix(mergeDays(hotels.map((h) => h.services))), [hotels]);

  const channels = [...new Set(rows.map((r) => r.channel))].sort();
  const statuses = [...new Set(rows.map((r) => r.status))].sort();
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => (!q || [r.code, r.ref, r.room].some((v) => v.toLowerCase().includes(q))) && (!channel || r.channel === channel) && (!status || r.status === status) && (!flaggedOnly || r.flags.length > 0));

  const t = totals.all;
  const LIMIT = 400; // a 3-month range can hold thousands of rows; the filters narrow them down

  return <section className="bluejay-revenue">
    <h2>Doanh thu và thanh toán theo đặt phòng</h2>
    <p className="summary-note">Chỉ tính đặt phòng có đêm ở trong {period}, bỏ hủy, no-show và hạng M-Standard. Tiền phòng chỉ gồm các đêm trong {period}; đã thanh toán, còn lại và cọc là số của cả đặt phòng. Ô Tổng tiền = Tiền phòng + Tiền dịch vụ trong {period}. Ô Tiền dịch vụ là dịch vụ phát sinh trong {period} theo báo cáo dịch vụ của Blue Jay (cột Dịch vụ ở bảng Theo nguồn vẫn là dịch vụ gắn từng đặt phòng). Blue Jay chỉ trả tổng thanh toán, không có hình thức (tiền mặt, chuyển khoản, thẻ) hay ngày thu từng khoản.</p>
    <div className="summary-kpis">
      <Kpi label="Số đặt phòng" value={num(t.bookings)} hint={`${num(t.nights)} đêm trong ${period}`} />
      <Kpi label={`Tiền phòng (trong ${period})`} value={num(t.room)} hint="chỉ các đêm trong kỳ, giá chia đều theo đêm" />
      <Kpi label="Tiền dịch vụ" value={num(services.total)} hint={`phát sinh trong ${period}, tính cả dịch vụ không gắn đặt phòng`} />
      <Kpi label="Tổng tiền" value={num(t.room + services.total)} hint={`tiền phòng + tiền dịch vụ trong ${period}`} />
      <Kpi label="Đã thanh toán" value={num(t.payment)} hint="cả đặt phòng, gồm phần ngoài kỳ" />
      <Kpi label="Còn phải thu" value={num(t.balance)} hint="cả đặt phòng, gồm OTA thanh toán sau" />
      <Kpi label="Tiền cọc" value={num(t.deposit)} hint="cả đặt phòng, Blue Jay ghi cọc riêng" />
      <Kpi label="Hủy / no-show đã thu" value={num(totals.cancelled.payment)} hint={`${num(totals.cancelled.bookings)} đặt phòng`} />
    </div>

    <article className="summary-chart wide">
      <h4>Theo nguồn</h4>
      <div className="summary-table summary-table-scroll"><table>
        <thead><tr><th>Nguồn</th><th>Đặt phòng</th><th>Đêm</th><th>Tiền phòng</th><th>Dịch vụ</th><th>Tổng tiền</th><th>Đã thanh toán</th><th>Còn phải thu</th></tr></thead>
        <tbody>{totals.channels.map((c) => <tr key={c.name}><th scope="row">{c.name}</th><td>{num(c.bookings)}</td><td>{num(c.nights)}</td><td>{num(c.room)}</td><td>{num(c.service)}</td><td>{num(c.total)}</td><td>{num(c.payment)}</td><td>{num(c.balance)}</td></tr>)}</tbody>
      </table></div>
    </article>

    <article className="summary-chart wide">
      <h4>Doanh thu dịch vụ theo ngày</h4>
      <p className="summary-note">Theo nhóm dịch vụ của Blue Jay. Blue Jay chỉ cho tổng theo ngày và nhóm, không chia theo từng phòng hay đặt phòng.</p>
      {services.groups.length === 0 ? <p className="summary-note">Không có doanh thu dịch vụ trong {period} này.</p> : <div className="summary-table summary-table-scroll"><table>
        <thead><tr><th>Ngày</th>{services.groups.map((g) => <th key={g.name}>{g.name}</th>)}<th>Tổng</th></tr></thead>
        <tbody>
          {services.days.map((d) => <tr key={d.date}><th scope="row">{dm(d.date)}</th>{services.groups.map((g) => <td key={g.name}>{d.byGroup[g.name] ? num(d.byGroup[g.name]) : "–"}</td>)}<td><strong>{num(d.total)}</strong></td></tr>)}
          <tr><th scope="row">Cả {period}</th>{services.groups.map((g) => <td key={g.name}><strong>{num(g.total)}</strong></td>)}<td><strong>{num(services.total)}</strong></td></tr>
        </tbody>
      </table></div>}
    </article>

    <article className="summary-chart wide">
      <h4>Chi tiết từng đặt phòng <small>{shown.length}/{rows.length} dòng · {totals.flagged} dòng cần đối soát</small></h4>
      <div className="revenue-filters">
        <input type="search" placeholder="Tìm mã đặt phòng, mã kênh, phòng" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Tìm đặt phòng" />
        <select value={channel} onChange={(event) => setChannel(event.target.value)} aria-label="Lọc theo nguồn"><option value="">Mọi nguồn</option>{channels.map((c) => <option key={c}>{c}</option>)}</select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Lọc theo trạng thái"><option value="">Mọi trạng thái</option>{statuses.map((s) => <option key={s}>{s}</option>)}</select>
        <label><input type="checkbox" checked={flaggedOnly} onChange={(event) => setFlaggedOnly(event.target.checked)} /> Chỉ dòng cần đối soát</label>
      </div>
      <div className="summary-table summary-table-scroll"><table>
        <thead><tr>{showHotel && <th>Khách sạn</th>}<th>Mã ĐP</th><th>Mã kênh</th><th>Nguồn</th><th>Hạng phòng</th><th>Phòng</th><th>Trạng thái</th><th>Nhận – trả</th><th>Đêm ({period}/tổng)</th><th>Tiền phòng ({period})</th><th>Dịch vụ</th><th>Tổng tiền</th><th>Đã thanh toán</th><th>Còn lại</th><th>Cọc</th><th>Đối soát</th></tr></thead>
        <tbody>{shown.slice(0, LIMIT).map((r, i) => <tr key={`${r.hotel}-${r.code}-${r.room}-${i}`} className={r.stay ? "" : "revenue-cancelled"}>
          {showHotel && <td>{r.hotel}</td>}
          <th scope="row">{r.code || "–"}</th><td>{r.ref || "–"}</td><td>{r.channel}</td><td>{r.roomType}</td><td>{r.room}</td><td>{r.status}</td>
          <td>{dm(r.checkIn)} – {dm(r.checkOut)}</td><td>{r.nightsInWeek}/{r.nights}</td>
          <td>{r.stay ? num(r.roomInWeek) : "–"}</td><td>{num(r.servicePrice)}</td><td>{num(r.totalPrice)}</td><td>{num(r.payment)}</td><td>{num(r.balance)}</td><td>{num(r.deposit)}</td>
          <td>{r.flags.length ? r.flags.map((f: RevenueFlag) => <span key={f} className={`revenue-flag ${f}`}>{FLAG_LABELS[f]}</span>) : <span className="muted">–</span>}</td>
        </tr>)}</tbody>
      </table></div>
      {shown.length > LIMIT && <p className="summary-note">Chỉ hiển thị {LIMIT} dòng đầu trong {shown.length} dòng. Dùng ô tìm kiếm hoặc bộ lọc để thu hẹp.</p>}
    </article>
  </section>;
}

/** Same date in several hotels: add the group totals together. */
function mergeDays(lists: RevenueWeek["hotels"][number]["services"][]) {
  const byDate = new Map<string, RevenueWeek["hotels"][number]["services"][number]>();
  for (const list of lists) for (const d of list) {
    const cur = byDate.get(d.date) ?? { date: d.date, total: 0, groups: [] };
    const groups = new Map(cur.groups.map((g) => [g.name, { ...g }]));
    for (const g of d.groups) {
      const x = groups.get(g.name) ?? { name: g.name, quantity: 0, total: 0, items: [] };
      x.quantity += g.quantity; x.total += g.total;
      groups.set(g.name, x);
    }
    byDate.set(d.date, { date: d.date, total: cur.total + d.total, groups: [...groups.values()] });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/lib/format-date";
import { ReachTable, type Col } from "@/components/reach-table";
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
  return <RevenueView hotels={hotels.map((h) => ({ ...h, excludedRoom: h.excluded && h.excluded.reduce((s, b) => s + (b.stay ? b.roomInWeek : 0), 0), excludedService: h.excluded && h.excluded.reduce((s, b) => s + (b.stay ? b.servicePrice : 0), 0) }))} showHotel={!scopeId} period="tuần" />;
}

/** The tables and filters, for one week or for any range: hotels carry the bookings (nights and room money already cut to the period) and daily services. */
export function RevenueView({ hotels, showHotel, period }: { hotels: { name: string; bookings: RevenueBooking[]; services: ServiceDay[]; excludedRoom?: number; excludedService?: number }[]; showHotel: boolean; period: "tuần" | "kỳ" }) {
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const rows = useMemo<Row[]>(() => hotels.flatMap((h) => h.bookings.map((b) => ({ ...b, hotel: h.name }))), [hotels]);
  const totals = useMemo(() => revenueTotals(rows), [rows]);
  const serviceDays = useMemo(() => mergeDays(hotels.map((h) => h.services)), [hotels]);
  const services = useMemo(() => serviceMatrix(serviceDays), [serviceDays]);
  const serviceLines = useMemo(() => serviceDays.flatMap((d) => d.groups.flatMap((g) => g.items.map((i) => ({ date: d.date, group: g.name, ...i })))), [serviceDays]); // every service line Blue Jay returned; filters come later

  const channels = [...new Set(rows.map((r) => r.channel))].sort();
  const statuses = [...new Set(rows.map((r) => r.status))].sort();
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => (!q || [r.code, r.ref, r.room].some((v) => v.toLowerCase().includes(q))) && (!channel || r.channel === channel) && (!status || r.status === status) && (!flaggedOnly || r.flags.length > 0));

  const t = totals.all;
  const excludedRoom = hotels.every((h) => h.excludedRoom !== undefined) ? hotels.reduce((s, h) => s + (h.excludedRoom ?? 0), 0) : null;
  const excludedService = hotels.reduce((s, h) => s + (h.excludedService ?? 0), 0); // null: some week was stored before M-Standard was kept
  const LIMIT = 400; // a 3-month range can hold thousands of rows; the filters narrow them down

  return <section className="bluejay-revenue">
    <h2>Doanh thu và thanh toán theo đặt phòng</h2>
    <p className="summary-note">Tính theo ngày trả phòng: đặt phòng trả phòng trong {period} được tính cả đợt ở, bỏ hủy, no-show, hạng M-Standard và phòng Unassigned. (Tuần chưa lấy lại sau thay đổi này vẫn tính theo đêm ở.) Đã thanh toán, còn lại và cọc là số của cả đặt phòng. Tiền dịch vụ là dịch vụ gắn từng đặt phòng trả phòng trong {period} (gồm phụ thu, check in/out muộn, đền bù…); Tổng tiền = Tiền phòng + Tiền dịch vụ. Bảng dịch vụ bên dưới tính theo ngày phát sinh nên có thể khác số này. Blue Jay chỉ trả tổng thanh toán, không có hình thức (tiền mặt, chuyển khoản, thẻ) hay ngày thu từng khoản.</p>
    <div className="summary-kpis">
      <Kpi label="Số đặt phòng" value={num(t.bookings)} hint={`${num(t.nights)} đêm ở, trả phòng trong ${period}`} />
      <Kpi label={`Tiền phòng (trả phòng trong ${period})`} value={num(t.room)} hint="cả đợt ở của đặt phòng" />
      <Kpi label="Tiền dịch vụ" value={num(t.service)} hint="dịch vụ gắn các đặt phòng trả phòng trong kỳ" />
      <Kpi label="Tổng tiền" value={num(t.room + t.service)} hint="tiền phòng + tiền dịch vụ, không tính M-Standard / Unassigned" />
      <Kpi label="Tiền phòng có M-Standard / Unassigned" value={excludedRoom === null ? "–" : num(t.room + excludedRoom)} hint={excludedRoom === null ? "cần lấy lại dữ liệu từ Blue Jay" : `gồm ${num(excludedRoom)} của M-Standard / Unassigned`} />
      <Kpi label="Tổng tiền có M-Standard / Unassigned" value={excludedRoom === null ? "–" : num(t.room + excludedRoom + t.service + excludedService)} hint="cộng cả tiền phòng và dịch vụ của hai loại này" />
      <Kpi label="Đã thanh toán" value={num(t.payment)} hint="cả đặt phòng, gồm phần ngoài kỳ" />
      <Kpi label="Còn phải thu" value={num(t.balance)} hint="cả đặt phòng, gồm OTA thanh toán sau" />
      <Kpi label="Tiền cọc" value={num(t.deposit)} hint="cả đặt phòng, Blue Jay ghi cọc riêng" />
      <Kpi label="Hủy / no-show đã thu" value={num(totals.cancelled.payment)} hint={`${num(totals.cancelled.bookings)} đặt phòng`} />
      <Kpi label="Hủy / no-show chưa thu" value={num(totals.cancelled.balance)} hint="Blue Jay vẫn tính giá phòng, OTA chưa trả" />
    </div>

    <details className="summary-chart wide revenue-fold" open>
      <summary><h4>Theo nguồn</h4></summary>
      <ReachTable rows={totals.channels} rowKey={(c) => c.name} columns={channelCols} />
    </details>

    <details className="summary-chart wide revenue-fold">
      <summary><h4>Doanh thu dịch vụ theo ngày</h4></summary>
      <p className="summary-note">Theo nhóm dịch vụ của Blue Jay. Blue Jay chỉ cho tổng theo ngày và nhóm, không chia theo từng phòng hay đặt phòng.</p>
      {services.groups.length === 0 ? <p className="summary-note">Không có doanh thu dịch vụ trong {period} này.</p> : <ReachTable rows={services.days} rowKey={(d) => d.date} columns={[{ label: "Ngày", text: (d) => dm(d.date), sort: (d) => d.date }, ...services.groups.map((g): Col<(typeof services.days)[number]> => ({ label: g.name, value: (d) => d.byGroup[g.name] || null, text: (d) => (d.byGroup[g.name] ? num(d.byGroup[g.name]) : "–"), total: true })), { label: "Tổng", value: (d) => d.total, text: (d) => num(d.total), total: true }]} />}
    </details>

    <details className="summary-chart wide revenue-fold">
      <summary><h4>Chi tiết từng dịch vụ <small>{Math.min(serviceLines.length, LIMIT)}/{serviceLines.length} dòng</small></h4></summary>
      {serviceLines.length === 0 ? <p className="summary-note">Không có dịch vụ trong {period} này.</p> : <ReachTable rows={serviceLines.slice(0, LIMIT).map((l, i) => ({ ...l, i }))} rowKey={(l) => String(l.i)} columns={[
        { label: "Ngày", text: (l) => dm(l.date), sort: (l) => l.date },
        { label: "Nhóm", text: (l) => l.group },
        { label: "Dịch vụ", text: (l) => l.name },
        { label: "ĐVT", text: (l) => l.unit },
        { label: "Số lượng", value: (l) => l.quantity, text: (l) => num(l.quantity) },
        { label: "Thành tiền", value: (l) => l.total, text: (l) => num(l.total), total: serviceLines.length <= LIMIT }, // a total of only the first LIMIT lines would mislead
      ]} />}
    </details>

    <details className="summary-chart wide revenue-fold">
      <summary><h4>Chi tiết từng đặt phòng <small>{shown.length}/{rows.length} dòng · {totals.flagged} dòng cần đối soát</small></h4></summary>
      <div className="revenue-filters">
        <input type="search" placeholder="Tìm mã đặt phòng, mã kênh, phòng" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Tìm đặt phòng" />
        <select value={channel} onChange={(event) => setChannel(event.target.value)} aria-label="Lọc theo nguồn"><option value="">Mọi nguồn</option>{channels.map((c) => <option key={c}>{c}</option>)}</select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Lọc theo trạng thái"><option value="">Mọi trạng thái</option>{statuses.map((s) => <option key={s}>{s}</option>)}</select>
        <label><input type="checkbox" checked={flaggedOnly} onChange={(event) => setFlaggedOnly(event.target.checked)} /> Chỉ dòng cần đối soát</label>
      </div>
      <ReachTable rows={shown.slice(0, LIMIT).map((r, i) => ({ ...r, i }))} rowKey={(r) => String(r.i)} rowClass={(r) => (r.stay ? undefined : "revenue-cancelled")} columns={bookingCols(showHotel, period, shown.length <= LIMIT)} />
      {shown.length > LIMIT && <p className="summary-note">Chỉ hiển thị {LIMIT} dòng đầu trong {shown.length} dòng. Dùng ô tìm kiếm hoặc bộ lọc để thu hẹp.</p>}
    </details>
  </section>;
}

type ChannelRow = ReturnType<typeof revenueTotals>["channels"][number];
const channelCols: Col<ChannelRow>[] = [
  { label: "Nguồn", text: (c) => c.name },
  ...([["Đặt phòng", "bookings"], ["Đêm", "nights"], ["Tiền phòng", "room"], ["Dịch vụ", "service"], ["Tổng tiền", "total"], ["Đã thanh toán", "payment"], ["Còn phải thu", "balance"]] as const)
    .map(([label, k]): Col<ChannelRow> => ({ label, value: (c) => c[k], text: (c) => num(c[k]), total: true })),
];

type BookingRow = Row & { i: number };
/** allTotals: a total row only when every booking is on screen (the list is cut at LIMIT rows). */
function bookingCols(showHotel: boolean, period: string, allTotals: boolean): Col<BookingRow>[] {
  const money = (label: string, get: (r: BookingRow) => number, show: (r: BookingRow) => boolean = () => true): Col<BookingRow> => ({ label, value: (r) => (show(r) ? get(r) : null), text: (r) => (show(r) ? num(get(r)) : "–"), total: allTotals });
  return [
    ...(showHotel ? [{ label: "Khách sạn", text: (r: BookingRow) => r.hotel }] : []),
    { label: "Mã ĐP", text: (r) => r.code || "–" },
    { label: "Mã kênh", text: (r) => r.ref || "–" },
    { label: "Nguồn", text: (r) => r.channel },
    { label: "Hạng phòng", text: (r) => r.roomType },
    { label: "Phòng", text: (r) => r.room },
    { label: "Trạng thái", text: (r) => r.status },
    { label: "Nhận – trả", text: (r) => `${dm(r.checkIn)} – ${dm(r.checkOut)}`, sort: (r) => r.checkIn },
    { label: `Đêm (${period}/tổng)`, value: (r) => r.nightsInWeek, text: (r) => `${r.nightsInWeek}/${r.nights}` },
    money(`Tiền phòng (${period})`, (r) => r.roomInWeek, (r) => r.stay),
    money("Dịch vụ", (r) => r.servicePrice),
    money("Tổng tiền", (r) => r.totalPrice),
    money("Đã thanh toán", (r) => r.payment),
    money("Còn lại", (r) => r.balance),
    money("Cọc", (r) => r.deposit),
    { label: "Đối soát", text: (r) => r.flags.map((f: RevenueFlag) => FLAG_LABELS[f]).join(", "), render: (r) => (r.flags.length ? <>{r.flags.map((f: RevenueFlag) => <span key={f} className={`revenue-flag ${f}`}>{FLAG_LABELS[f]}</span>)}</> : <span className="muted">–</span>) },
  ];
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
      for (const i of g.items) { // same service in two hotels on the same day: add up
        const k = x.items.findIndex((y) => y.name === i.name && y.unit === i.unit);
        if (k < 0) x.items.push({ ...i }); else x.items[k] = { ...x.items[k], quantity: x.items[k].quantity + i.quantity, total: x.items[k].total + i.total };
      }
      groups.set(g.name, x);
    }
    byDate.set(d.date, { date: d.date, total: cur.total + d.total, groups: [...groups.values()] });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

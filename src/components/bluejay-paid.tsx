"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, RefreshCw } from "lucide-react";
import { fmtDate, fmtDateTime } from "@/lib/format-date";
import { BLUEJAY_HOTELS, addDays, todayVN } from "@/lib/bluejay-metrics";
import { MAX_RANGE_DAYS } from "@/lib/bluejay-range";
import { summarizeRows, type DebtRow } from "@/lib/bluejay-debt";
import { FLAG_LABELS, OTA_CHANNELS } from "@/lib/bluejay-revenue";
import { IsoDatePicker } from "@/components/date-picker";
import { PageSkeleton } from "@/components/page-skeleton";

const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
const pct = (paid: number, total: number) => (total > 0 ? `${Math.round((paid / total) * 100)}%` : "–");
type View = "paid" | "open" | "flagged" | "all";
const ALL_OTA = "__ota"; // channel filter value: every OTA at once
const VIEWS: [View, string][] = [["paid", "Đã thanh toán đủ"], ["open", "Còn nợ"], ["flagged", "Cần kiểm tra"], ["all", "Tất cả"]];

type Loaded = { key: string; rows: DebtRow[]; missingWeeks: string[]; oldestAsOf: string | null; message: string };

/** Stays that checked out in a period: what is paid in full, what still owes, and the money by channel, so the revenue and payment figures can be checked. */
export function BluejayPaid({ scopeId }: { scopeId: number | null }) {
  const today = todayVN();
  const monthStart = `${today.slice(0, 8)}01`;
  const prevEnd = addDays(monthStart, -1);
  const [from, setFrom] = useState(`${prevEnd.slice(0, 8)}01`);
  const [to, setTo] = useState(prevEnd);
  const [data, setData] = useState<Loaded | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("paid");
  const [channel, setChannel] = useState("");

  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5;
  const rangeError = !from || !to ? "Chọn đủ hai ngày." : from > to ? "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc." : days >= MAX_RANGE_DAYS ? `Chọn tối đa ${MAX_RANGE_DAYS} ngày.` : "";
  const key = rangeError ? "" : `${from}|${to}|${version}`;

  useEffect(() => {
    if (!key) return;
    let active = true;
    fetch(`/api/bluejay/paid?from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => { if (active) setData({ key, rows: res.ok ? body.rows ?? [] : [], missingWeeks: res.ok ? body.missingWeeks ?? [] : [], oldestAsOf: res.ok ? body.oldestAsOf ?? null : null, message: res.ok ? "" : body.message ?? `Lỗi ${res.status}` }); })
      .catch(() => { if (active) setData({ key, rows: [], missingWeeks: [], oldestAsOf: null, message: "Không kết nối được máy chủ." }); });
    return () => { active = false; };
  }, [key, from, to]);

  async function refresh() {
    setBusy(true); setNotice("");
    const res = await fetch("/api/bluejay/debt", { method: "POST" }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) { setNotice(body.message ?? "Không kết nối được máy chủ."); return; }
    setNotice(`Đã cập nhật thanh toán ${body.weeks} tuần.${body.remaining ? ` Còn ${body.remaining} tuần chưa kịp, sẽ chạy tiếp ở lượt sau.` : ""}${body.lastError ? ` Lỗi: ${body.lastError}` : ""}`);
    setVersion((v) => v + 1);
  }

  const ready = Boolean(key) && data?.key === key && !data.message;
  const scoped = useMemo(() => (ready && data ? data.rows.filter((r) => !scopeId || r.hotelId === scopeId) : []), [ready, data, scopeId]);
  const summary = useMemo(() => summarizeRows(scoped), [scoped]);
  const inChannel = (r: DebtRow) => !channel || (channel === ALL_OTA ? OTA_CHANNELS.includes(r.channel) : r.channel === channel);
  const shown = scoped.filter((r) => inChannel(r) && (view === "all" || (view === "paid" ? r.balance <= 1 : view === "open" ? r.balance > 1 : r.flags.length > 0)));
  const hotelName = BLUEJAY_HOTELS.find((h) => h.id === scopeId)?.name ?? "Toàn chuỗi";
  const loading = Boolean(key) && data?.key !== key;

  const preset = (a: string, b: string) => { setFrom(a); setTo(b); setChannel(""); };
  const yesterday = addDays(today, -1);
  const lastMonday = addDays(addDays(today, 1 - (new Date(`${today}T00:00:00Z`).getUTCDay() || 7)), -7);
  const presets: [string, string, string][] = [
    ["Tháng trước", `${prevEnd.slice(0, 8)}01`, prevEnd],
    ["Tháng này", monthStart, yesterday < monthStart ? monthStart : yesterday],
    ["30 ngày qua", addDays(yesterday, -29), yesterday],
    ["Tuần trước", lastMonday, addDays(lastMonday, 6)],
  ];

  async function exportExcel() {
    const XLSX = await import("xlsx"); // loaded when the file is made, not with the page
    const head = ["Khách sạn", "Kênh", "Mã đặt phòng", "Mã OTA", "Phòng", "Nhận phòng", "Trả phòng", "Tổng tiền", "Đã thanh toán", "Còn nợ", "Lưu ý", "Dữ liệu tính đến"];
    const body = shown.map((r) => [r.hotel, r.channel, r.code, r.ref, r.room, fmtDate(r.checkIn), fmtDate(r.checkOut), r.totalPrice, r.payment, r.balance, r.flags.map((f) => FLAG_LABELS[f]).join("; "), fmtDateTime(r.asOf)]);
    const sum = [["Kênh", "Đặt phòng", "Đã thanh toán đủ", "Còn nợ", "Tổng tiền", "Đã thu", "Còn lại"], ...[...summary.channels, summary.all].map((c) => [c.name, c.bookings, c.paidBookings, c.openBookings, c.total, c.paid, c.balance])];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([head, ...body]), "Danh sách");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sum), "Tổng hợp theo kênh");
    XLSX.writeFile(book, `da-thanh-toan-${hotelName.replace(/\s+/g, "-")}-${from}_${to}.xlsx`);
  }

  const count = (v: View) => scoped.filter(inChannel).filter((r) => (v === "all" ? true : v === "paid" ? r.balance <= 1 : v === "open" ? r.balance > 1 : r.flags.length > 0)).length;

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Đã thanh toán · {hotelName}</h1>
          <p>Các đặt phòng đã trả phòng trong kỳ, chia theo kênh: đã thanh toán đủ, còn nợ và số tiền. Dùng để kiểm tra báo cáo doanh thu: tổng tiền = đã thu + còn lại. Số liệu đúng tại lúc lấy từ Blue Jay{data?.oldestAsOf ? ` (cũ nhất: ${fmtDateTime(data.oldestAsOf)})` : ""}.</p>
        </div>
        <div className="summary-controls">
          <button type="button" disabled={busy} onClick={() => void refresh()}><RefreshCw size={15} className={busy ? "spin" : undefined} />{busy ? "Đang lấy…" : "Cập nhật thanh toán"}</button>
          {shown.length > 0 && <button type="button" onClick={exportExcel}><ArrowDownToLine size={15} />Xuất Excel</button>}
        </div>
      </div>

      <div className="bluejay-range-picker">
        <div className="range-date"><span>Trả phòng từ</span><IsoDatePicker label="Trả phòng từ ngày" value={from} onChange={setFrom} max={today} /></div>
        <div className="range-date"><span>Đến ngày</span><IsoDatePicker label="Trả phòng đến ngày" value={to} onChange={setTo} max={today} /></div>
        <div className="range-presets">{presets.map(([label, a, b]) => <button type="button" key={label} onClick={() => preset(a, b)}>{label}</button>)}</div>
      </div>

      {notice && <p className="summary-note" role="status">{notice}</p>}
      {rangeError && <div className="alert alert-error" role="alert"><span>{rangeError}</span></div>}
      {data?.key === key && data.message && <div className="alert alert-error" role="alert"><span>{data.message}</span></div>}
      {loading && <PageSkeleton />}

      {ready && data && <>
        {data.missingWeeks.length > 0 && <p className="summary-note bad" role="alert">Blue Jay chưa lưu tuần bắt đầu {data.missingWeeks.map(fmtDate).join(", ")}; các đặt phòng trả phòng trong tuần đó chưa có trong danh sách.</p>}
        {scoped.length === 0 ? <p className="summary-note">Không có đặt phòng nào trả phòng trong kỳ này{scopeId ? " ở khách sạn này" : ""}.</p> : <>
          <div className="summary-kpis">
            <div className="summary-kpi"><span>Đặt phòng đã trả phòng</span><strong>{num(summary.all.bookings)}</strong><small>Tổng tiền {num(summary.all.total)}</small></div>
            <div className="summary-kpi"><span>Đã thanh toán đủ</span><strong>{num(summary.all.paidBookings)}</strong><small>Đã thu {num(summary.all.paid)} ({pct(summary.all.paid, summary.all.total)})</small></div>
            <div className="summary-kpi"><span>Còn nợ</span><strong>{num(summary.all.openBookings)}</strong><small>Còn lại {num(summary.all.balance)}</small></div>
            <div className="summary-kpi"><span>Cần kiểm tra</span><strong>{num(summary.flagged)}</strong><small>Dòng báo cáo doanh thu đã đánh dấu</small></div>
          </div>

          <div className="summary-table summary-table-scroll"><table>
            <caption className="sr-only">Tổng hợp theo kênh</caption>
            <thead><tr><th>Kênh</th><th>Đặt phòng</th><th>Đã thanh toán đủ</th><th>Còn nợ</th><th>Tổng tiền</th><th>Đã thu</th><th>Còn lại</th><th>Đã thu %</th></tr></thead>
            <tbody>
              {summary.channels.map((c) => <tr key={c.name} className={channel === c.name ? "reconcile-selected" : undefined}>
                <th scope="row"><button type="button" className="reconcile-link" aria-pressed={channel === c.name} onClick={() => setChannel(channel === c.name ? "" : c.name)}>{c.name}</button></th>
                <td>{num(c.bookings)}</td><td>{num(c.paidBookings)}</td><td>{num(c.openBookings)}</td><td>{num(c.total)}</td><td>{num(c.paid)}</td><td className={c.balance > 1 ? "reconcile-diff" : undefined}>{num(c.balance)}</td><td>{pct(c.paid, c.total)}</td>
              </tr>)}
              <tr><th scope="row">Tất cả</th><td>{num(summary.all.bookings)}</td><td>{num(summary.all.paidBookings)}</td><td>{num(summary.all.openBookings)}</td><td>{num(summary.all.total)}</td><td>{num(summary.all.paid)}</td><td>{num(summary.all.balance)}</td><td>{pct(summary.all.paid, summary.all.total)}</td></tr>
            </tbody>
          </table></div>

          <div className="range-presets reconcile-filter" role="group" aria-label="Lọc theo kênh">
            <button type="button" aria-pressed={!channel} onClick={() => setChannel("")}>Tất cả kênh ({scoped.length})</button>
            <button type="button" aria-pressed={channel === ALL_OTA} onClick={() => setChannel(channel === ALL_OTA ? "" : ALL_OTA)}>Tất cả OTA ({scoped.filter((r) => OTA_CHANNELS.includes(r.channel)).length})</button>
            {summary.channels.map((c) => <button type="button" key={c.name} aria-pressed={channel === c.name} onClick={() => setChannel(channel === c.name ? "" : c.name)}>{c.name} ({c.bookings})</button>)}
          </div>

          <div className="range-presets reconcile-filter" role="group" aria-label="Lọc theo tình trạng thanh toán">
            {VIEWS.map(([v, label]) => <button type="button" key={v} aria-pressed={view === v} onClick={() => setView(v)}>{label} ({count(v)})</button>)}
          </div>

          {shown.length === 0 ? <p className="summary-note">Không có dòng nào thuộc nhóm đang chọn.</p> : <div className="summary-table summary-table-scroll"><table>
            <thead><tr>{!scopeId && <th>Khách sạn</th>}<th>Mã / kênh</th><th>Phòng</th><th>Lưu trú</th><th>Tổng tiền</th><th>Đã thanh toán</th><th>Còn nợ</th><th>Lưu ý</th></tr></thead>
            <tbody>{shown.map((r) => <tr key={`${r.hotelId}-${r.code}-${r.room}`}>
              {!scopeId && <td>{r.hotel}</td>}
              <th scope="row">{r.ref || r.code}<small>{r.channel}{r.ref ? ` · ${r.code}` : ""}</small></th>
              <td>{r.room}</td>
              <td>{fmtDate(r.checkIn)} → {fmtDate(r.checkOut)}</td>
              <td>{num(r.totalPrice)}</td>
              <td>{num(r.payment)}</td>
              <td className={r.balance > 1 ? "reconcile-diff" : undefined}>{num(r.balance)}</td>
              <td>{r.flags.map((f) => FLAG_LABELS[f]).join("; ") || "–"}</td>
            </tr>)}</tbody>
          </table></div>}
        </>}
      </>}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, RefreshCw } from "lucide-react";
import { fmtDate, fmtDateTime } from "@/lib/format-date";
import { BLUEJAY_HOTELS } from "@/lib/bluejay-metrics";
import type { DebtRow } from "@/lib/bluejay-debt";
import { PageSkeleton } from "@/components/page-skeleton";

const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
const AGING: [string, (days: number) => boolean][] = [["Dưới 30 ngày", (d) => d < 30], ["30–59 ngày", (d) => d >= 30 && d < 60], ["Từ 60 ngày", (d) => d >= 60]];

type Loaded = { rows: DebtRow[]; oldestAsOf: string | null; message: string };

/** Checked-out OTA stays that still owe money, from the stored weeks (no call to Blue Jay). scopeId: one hotel or null for the chain. */
export function BluejayDebt({ scopeId }: { scopeId: number | null }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [version, setVersion] = useState(0); // bumped after a refresh to read the stored weeks again
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [channel, setChannel] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/bluejay/debt", { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => { if (active) setData({ rows: res.ok ? body.rows ?? [] : [], oldestAsOf: res.ok ? body.oldestAsOf ?? null : null, message: res.ok ? "" : body.message ?? `Lỗi ${res.status}` }); })
      .catch(() => { if (active) setData({ rows: [], oldestAsOf: null, message: "Không kết nối được máy chủ." }); });
    return () => { active = false; };
  }, [version]);

  async function refresh() {
    setBusy(true); setNotice("");
    const res = await fetch("/api/bluejay/debt", { method: "POST" }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) { setNotice(body.message ?? "Không kết nối được máy chủ."); return; }
    setNotice(`Đã cập nhật thanh toán ${body.weeks} tuần.${body.remaining ? ` Còn ${body.remaining} tuần chưa kịp, sẽ chạy tiếp ở lượt sau.` : ""}${body.lastError ? ` Lỗi: ${body.lastError}` : ""}`);
    setVersion((v) => v + 1);
  }

  const all = useMemo(() => (data?.rows ?? []).filter((r) => !scopeId || r.hotelId === scopeId), [data, scopeId]);
  const channels = useMemo(() => {
    const byChannel = new Map<string, { bookings: number; balance: number }>();
    for (const r of all) { const c = byChannel.get(r.channel) ?? { bookings: 0, balance: 0 }; c.bookings++; c.balance += r.balance; byChannel.set(r.channel, c); }
    return [...byChannel].map(([name, c]) => ({ name, ...c })).sort((a, b) => b.balance - a.balance);
  }, [all]);
  const rows = channel ? all.filter((r) => r.channel === channel) : all;
  const total = all.reduce((s, r) => s + r.balance, 0);
  const hotelName = BLUEJAY_HOTELS.find((h) => h.id === scopeId)?.name ?? "Toàn chuỗi";

  async function exportExcel() {
    const XLSX = await import("xlsx"); // loaded when the file is made, not with the page
    const head = ["Khách sạn", "OTA", "Mã đặt phòng", "Mã OTA", "Phòng", "Nhận phòng", "Trả phòng", "Số ngày kể từ trả phòng", "Tổng tiền", "Đã thanh toán", "Còn nợ", "Dữ liệu tính đến"];
    const body = rows.map((r) => [r.hotel, r.channel, r.code, r.ref, r.room, fmtDate(r.checkIn), fmtDate(r.checkOut), r.days, r.totalPrice, r.payment, r.balance, fmtDateTime(r.asOf)]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([head, ...body]), "Công nợ OTA");
    XLSX.writeFile(book, `cong-no-ota-${hotelName.replace(/\s+/g, "-")}.xlsx`);
  }

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Công nợ OTA · {hotelName}</h1>
          <p>Đặt phòng OTA đã trả phòng nhưng Blue Jay còn ghi số dư. Số liệu đúng tại thời điểm lấy từ Blue Jay{data?.oldestAsOf ? ` (cũ nhất: ${fmtDateTime(data.oldestAsOf)})` : ""}; OTA trả sau đó chỉ cập nhật khi lấy lại.</p>
        </div>
        <div className="summary-controls">
          <button type="button" disabled={busy} onClick={() => void refresh()}><RefreshCw size={15} className={busy ? "spin" : undefined} />{busy ? "Đang lấy…" : "Cập nhật thanh toán"}</button>
          {rows.length > 0 && <button type="button" onClick={exportExcel}><ArrowDownToLine size={15} />Xuất Excel</button>}
        </div>
      </div>
      {notice && <p className="summary-note" role="status">{notice}</p>}
      {data?.message && <div className="alert alert-error" role="alert"><span>{data.message}</span></div>}
      {!data && <PageSkeleton label="Đang tải công nợ…" />}

      {data && !data.message && <>
        {all.length === 0 ? <p className="summary-note">Không có đặt phòng OTA nào còn nợ{scopeId ? " ở khách sạn này" : ""}.</p> : <>
          <div className="summary-kpis">
            <div className="summary-kpi"><span>Tổng còn nợ</span><strong>{num(total)}</strong><small>{all.length} đặt phòng</small></div>
            {AGING.map(([label, test]) => { const list = all.filter((r) => test(r.days)); return <div className="summary-kpi" key={label}><span>{label}</span><strong>{num(list.reduce((s, r) => s + r.balance, 0))}</strong><small>{list.length} đặt phòng</small></div>; })}
          </div>
          <div className="range-presets reconcile-filter" role="group" aria-label="Lọc theo OTA">
            <button type="button" aria-pressed={!channel} onClick={() => setChannel("")}>Tất cả ({all.length})</button>
            {channels.map((c) => <button type="button" key={c.name} aria-pressed={channel === c.name} onClick={() => setChannel(c.name)}>{c.name} · {num(c.balance)} ({c.bookings})</button>)}
          </div>
          <div className="summary-table summary-table-scroll"><table>
            <thead><tr>{!scopeId && <th>Khách sạn</th>}<th>Mã / OTA</th><th>Phòng</th><th>Lưu trú</th><th>Kể từ trả phòng</th><th>Tổng tiền</th><th>Đã thanh toán</th><th>Còn nợ</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={`${r.hotelId}-${r.code}-${r.room}`}>
              {!scopeId && <td>{r.hotel}</td>}
              <th scope="row">{r.ref || r.code}<small>{r.channel}{r.ref ? ` · ${r.code}` : ""}</small></th>
              <td>{r.room}</td>
              <td>{fmtDate(r.checkIn)} → {fmtDate(r.checkOut)}</td>
              <td>{r.days} ngày</td>
              <td>{num(r.totalPrice)}</td>
              <td>{num(r.payment)}</td>
              <td className="reconcile-diff">{num(r.balance)}</td>
            </tr>)}</tbody>
          </table></div>
        </>}
      </>}
    </section>
  );
}

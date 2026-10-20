"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowDownToLine, RefreshCw } from "lucide-react";
import { fmtDate, fmtDateTime } from "@/lib/format-date";
import { addDays, todayVN } from "@/lib/bluejay-metrics";
import { MAX_DAYS, type DailyRow, type LocationTotals } from "@/lib/google-profile";
import { IsoDatePicker } from "@/components/date-picker";

const num = (x: number) => x.toLocaleString("vi-VN");
const COLUMNS: [string, (t: Omit<LocationTotals, "days">) => number][] = [["Lượt tương tác", (t) => t.engagement], ["Cuộc gọi", (t) => t.calls], ["Tìm đường", (t) => t.directions], ["Nhấp vào web", (t) => t.website], ["Nhấp đặt phòng/thực đơn", (t) => t.bookingMenu], ["Số post bài", (t) => t.posts]];

type Loaded = { locations: LocationTotals[]; daily: DailyRow[]; fetchedAt: string | null; message: string };

/** Google Maps figures per location for a date range, from the days stored by the daily Windsor sync (no call to Windsor on load). */
export function GoogleProfile() {
  const today = todayVN();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(addDays(today, -1)); // Google fills the current day in late
  const [data, setData] = useState<Loaded | null>(null);
  const [version, setVersion] = useState(0); // bumped after a sync to read the stored days again
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [location, setLocation] = useState(""); // location id, "" = all

  useEffect(() => {
    if (!from || !to || from > to) return;
    let active = true;
    fetch(`/api/google-profile?from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => { if (active) setData({ locations: res.ok ? body.locations ?? [] : [], daily: res.ok ? body.daily ?? [] : [], fetchedAt: res.ok ? body.fetchedAt ?? null : null, message: res.ok ? "" : body.message ?? `Lỗi ${res.status}` }); })
      .catch(() => { if (active) setData({ locations: [], daily: [], fetchedAt: null, message: "Không kết nối được máy chủ." }); });
    return () => { active = false; };
  }, [from, to, version]);

  async function sync() {
    setBusy(true); setNotice("");
    const res = await fetch("/api/google-profile", { method: "POST" }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) { setNotice(body.message ?? "Không kết nối được máy chủ."); return; }
    setNotice(`Đã lấy ${body.days} dòng theo ngày và ${body.posts} bài đăng.`);
    setVersion((v) => v + 1);
  }

  function exportExcel() {
    const head = ["Cơ sở", "Từ ngày", "Đến ngày", ...COLUMNS.map(([label]) => label)];
    const body = locations.map((t) => [t.name, fmtDate(from), fmtDate(to), ...COLUMNS.map(([, value]) => value(t))]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([head, ...body]), "Google Maps");
    const dailyHead = ["Ngày", "Cơ sở", ...COLUMNS.map(([label]) => label)];
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([dailyHead, ...daily.map((r) => [fmtDate(r.day), r.name, ...COLUMNS.map(([, value]) => value(r))])]), "Theo ngày");
    XLSX.writeFile(book, `google-maps-${from}-${to}.xlsx`);
  }

  const locations = (data?.locations ?? []).filter((t) => !location || t.id === location);
  const daily = (data?.daily ?? []).filter((r) => !location || r.id === location);
  const invalid = !from || !to || from > to || addDays(from, MAX_DAYS - 1) < to;
  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Google Maps</h1>
          <p>Chỉ số tiếp cận từ Google Business Profile{data?.fetchedAt ? `; lấy lần cuối ${fmtDateTime(data.fetchedAt)}` : ""}. Tự cập nhật mỗi ngày lúc 07:30; Google bổ sung số của những ngày gần nhất chậm vài ngày.</p>
        </div>
        <div className="summary-controls">
          <IsoDatePicker label="Từ ngày" value={from} onChange={setFrom} />
          <IsoDatePicker label="Đến ngày" value={to} onChange={setTo} />
          <button type="button" disabled={busy} onClick={() => void sync()}><RefreshCw size={15} className={busy ? "spin" : undefined} />{busy ? "Đang lấy…" : "Cập nhật từ Google"}</button>
          {locations.length > 0 && <button type="button" onClick={exportExcel}><ArrowDownToLine size={15} />Xuất Excel</button>}
        </div>
      </div>
      {notice && <p className="summary-note" role="status">{notice}</p>}
      {invalid && <p className="summary-note">Chọn khoảng ngày hợp lệ, tối đa {MAX_DAYS} ngày.</p>}
      {data?.message && <div className="alert alert-error" role="alert"><span>{data.message}</span></div>}
      {!data && !invalid && <p className="summary-note">Đang tải…</p>}
      {data && !data.message && !invalid && data.locations.length > 1 && <div className="range-presets reconcile-filter" role="group" aria-label="Lọc theo cơ sở">
        <button type="button" aria-pressed={!location} onClick={() => setLocation("")}>Tất cả ({data.locations.length})</button>
        {data.locations.map((t) => <button type="button" key={t.id} aria-pressed={location === t.id} onClick={() => setLocation(t.id)}>{t.name}</button>)}
      </div>}
      {data && !data.message && !invalid && (data.locations.length === 0
        ? <p className="summary-note">Chưa có dữ liệu trong khoảng này. Bấm “Cập nhật từ Google” để lấy số liệu.</p>
        : <details className="summary-chart wide revenue-fold" open><summary><h4>Theo cơ sở</h4></summary><div className="summary-table summary-table-scroll"><table>
          <thead><tr><th>Cơ sở</th>{COLUMNS.map(([label]) => <th key={label}>{label}</th>)}<th>Số ngày có dữ liệu</th></tr></thead>
          <tbody>{locations.map((t) => <tr key={t.id}><th scope="row">{t.name}</th>{COLUMNS.map(([label, value]) => <td key={label}>{num(value(t))}</td>)}<td>{t.days}</td></tr>)}</tbody>
        </table></div></details>)}
      {data && !data.message && !invalid && daily.length > 0 && <>
        <details className="summary-chart wide revenue-fold"><summary><h4>Số liệu theo ngày</h4></summary><div className="summary-table summary-table-scroll"><table>
          <thead><tr><th>Ngày</th><th>Cơ sở</th>{COLUMNS.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{daily.map((r) => <tr key={`${r.day}-${r.id}`}><th scope="row">{fmtDate(r.day)}</th><td>{r.name}</td>{COLUMNS.map(([label, value]) => <td key={label}>{num(value(r))}</td>)}</tr>)}</tbody>
        </table></div></details>
      </>}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowDownToLine, RefreshCw } from "lucide-react";
import { fmtDate } from "@/lib/format-date";
import { addDays, todayVN } from "@/lib/bluejay-metrics";
import { IG_MAX_DAYS, type IgDaily, type IgTotals } from "@/lib/instagram-page";
import { IsoDatePicker } from "@/components/date-picker";

const num = (x: number) => x.toLocaleString("vi-VN");
const NA = "—"; // Windsor has no figure for it: enter by hand
// Order of the "C. Bc Tiếp Cận" workbook.
const COLUMNS: [string, (t: IgTotals) => number | null][] = [["Lượt xem", (t) => t.views], ["Người tiếp cận", (t) => t.reach], ["Lượt tương tác", (t) => t.engagement], ["Lượt click liên kết", (t) => t.linkClicks], ["Lượt truy cập", () => null], ["Lượt theo dõi", () => null], ["Liên hệ Mes", () => null], ["Tỷ lệ phản hồi", () => null], ["Số post bài", (t) => t.posts]];
const DAILY: [string, (d: IgDaily) => number][] = [["Lượt xem", (d) => d.views], ["Người tiếp cận", (d) => d.reach], ["Lượt tương tác", (d) => d.engagement], ["Lượt click liên kết", (d) => d.linkClicks]];

type Loaded = { accounts: IgTotals[]; daily: IgDaily[]; message: string };

/** Instagram figures per account for a date range, read from Windsor when the range changes. */
export function InstagramPage() {
  const today = todayVN();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(addDays(today, -1));
  const [data, setData] = useState<Loaded | null>(null);
  const [account, setAccount] = useState(""); // account id, "" = all

  const [version, setVersion] = useState(0); // bumped after a sync to read the stored days again
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const invalid = !from || !to || from > to || addDays(from, IG_MAX_DAYS - 1) < to;
  useEffect(() => {
    if (invalid) return;
    let active = true;
    setData(null);
    fetch(`/api/instagram?from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => { if (active) setData({ accounts: res.ok ? body.accounts ?? [] : [], daily: res.ok ? body.daily ?? [] : [], message: res.ok ? "" : body.message ?? `Lỗi ${res.status}` }); })
      .catch(() => { if (active) setData({ accounts: [], daily: [], message: "Không kết nối được máy chủ." }); });
    return () => { active = false; };
  }, [from, to, invalid, version]);

  async function sync() {
    setBusy(true); setNotice("");
    const res = await fetch("/api/instagram", { method: "POST" }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) { setNotice(body.message ?? "Không kết nối được máy chủ."); return; }
    setNotice(`Đã lấy ${body.days} dòng theo ngày${body.posts ? ` và ${body.posts} bài đăng` : ""}.`);
    setVersion((v) => v + 1);
  }

  const accounts = (data?.accounts ?? []).filter((t) => !account || t.id === account);
  const daily = (data?.daily ?? []).filter((d) => !account || d.id === account);

  function exportExcel() {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Tài khoản", "Từ ngày", "Đến ngày", ...COLUMNS.map(([label]) => label)], ...accounts.map((t) => [t.name, fmtDate(from), fmtDate(to), ...COLUMNS.map(([, value]) => value(t) ?? "")])]), "Instagram");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Ngày", "Tài khoản", ...DAILY.map(([label]) => label)], ...daily.map((d) => [fmtDate(d.day), d.name, ...DAILY.map(([, value]) => value(d))])]), "Theo ngày");
    XLSX.writeFile(book, `instagram-${from}-${to}.xlsx`);
  }

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Instagram</h1>
          <p>Chỉ số tiếp cận của Instagram, đọc từ số liệu đã lưu, tự cập nhật mỗi ngày lúc 07:40 (bấm “Cập nhật số liệu” để lấy ngay). Lượt truy cập, lượt theo dõi, liên hệ Mes và tỷ lệ phản hồi chưa có số liệu tự động, cần nhập tay. Lượt xem thấp hơn nhiều so với số Meta Business Suite, và người tiếp cận là tổng các ngày nên cao hơn số người thật.</p>
        </div>
        <div className="summary-controls">
          <IsoDatePicker label="Từ ngày" value={from} onChange={setFrom} />
          <IsoDatePicker label="Đến ngày" value={to} onChange={setTo} />
          <button type="button" disabled={busy || invalid} onClick={() => void sync()}><RefreshCw size={15} className={busy ? "spin" : undefined} />{busy ? "Đang lấy…" : "Cập nhật số liệu"}</button>
          {accounts.length > 0 && <button type="button" onClick={exportExcel}><ArrowDownToLine size={15} />Xuất Excel</button>}
        </div>
      </div>
      {notice && <p className="summary-note" role="status">{notice}</p>}
      {invalid && <p className="summary-note">Chọn khoảng ngày hợp lệ, tối đa {IG_MAX_DAYS} ngày.</p>}
      {data?.message && <div className="alert alert-error" role="alert"><span>{data.message}</span></div>}
      {!data && !invalid && <p className="summary-note">Đang lấy số liệu…</p>}
      {data && !data.message && !invalid && data.accounts.length > 1 && <div className="range-presets reconcile-filter" role="group" aria-label="Lọc theo tài khoản">
        <button type="button" aria-pressed={!account} onClick={() => setAccount("")}>Tất cả ({data.accounts.length})</button>
        {data.accounts.map((t) => <button type="button" key={t.id} aria-pressed={account === t.id} onClick={() => setAccount(t.id)}>{t.name}</button>)}
      </div>}
      {data && !data.message && !invalid && (data.accounts.length === 0
        ? <p className="summary-note">Chưa có dữ liệu trong khoảng này. Bấm “Cập nhật số liệu” để lấy.</p>
        : <div className="summary-table summary-table-scroll"><table>
          <thead><tr><th>Tài khoản</th>{COLUMNS.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{accounts.map((t) => <tr key={t.id}><th scope="row">{t.name}</th>{COLUMNS.map(([label, value]) => { const v = value(t); return <td key={label}>{v === null ? NA : num(v)}</td>; })}</tr>)}</tbody>
        </table></div>)}
      {data && !data.message && !invalid && daily.length > 0 && <>
        <h2 className="summary-subtitle">Số liệu theo ngày</h2>
        <div className="summary-table summary-table-scroll"><table>
          <thead><tr><th>Ngày</th><th>Tài khoản</th>{DAILY.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{daily.map((d) => <tr key={`${d.day}-${d.id}`}><th scope="row">{fmtDate(d.day)}</th><td>{d.name}</td>{DAILY.map(([label, value]) => <td key={label}>{num(value(d))}</td>)}</tr>)}</tbody>
        </table></div>
      </>}
    </section>
  );
}

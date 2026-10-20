"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowDownToLine, RefreshCw } from "lucide-react";
import { fmtDate } from "@/lib/format-date";
import { addDays, todayVN } from "@/lib/bluejay-metrics";
import { TT_MAX_DAYS, type TtDaily, type TtTotals } from "@/lib/tiktok-page";
import { IsoDatePicker } from "@/components/date-picker";

const num = (x: number) => x.toLocaleString("vi-VN");
const NA = "—"; // Windsor has no figure for it: enter by hand
// Order of the "C. Bc Tiếp Cận" workbook, then new followers.
const COLUMNS: [string, (t: TtTotals) => number | null][] = [["Lượt xem video", (t) => t.views], ["Đối tượng tiếp cận", (t) => t.reach], ["Lượt xem hồ sơ", (t) => t.profileViews], ["Lượt nhấp SĐT", (t) => t.phoneClicks], ["Liên hệ Mes", () => null], ["Số post bài", (t) => t.posts], ["Lượt nhấp web", (t) => t.linkClicks], ["Người theo dõi mới", (t) => t.follows]];
const DAILY: [string, (d: TtDaily) => number][] = [["Lượt xem video", (d) => d.views], ["Đối tượng tiếp cận", (d) => d.reach], ["Lượt xem hồ sơ", (d) => d.profileViews], ["Lượt nhấp SĐT", (d) => d.phoneClicks], ["Lượt nhấp web", (d) => d.linkClicks], ["Người theo dõi mới", (d) => d.follows]];

type Loaded = { accounts: TtTotals[]; daily: TtDaily[]; message: string };

/** TikTok figures per account for a date range, read from Windsor when the range changes. Windsor keeps only the last 60 days. */
export function TiktokPage() {
  const today = todayVN();
  const [from, setFrom] = useState(addDays(today, -TT_MAX_DAYS + 1));
  const [to, setTo] = useState(addDays(today, -1));
  const [data, setData] = useState<Loaded | null>(null);
  const [account, setAccount] = useState(""); // account id, "" = all

  const [version, setVersion] = useState(0); // bumped after a sync to read the stored days again
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const invalid = !from || !to || from > to || addDays(from, TT_MAX_DAYS - 1) < to;
  useEffect(() => {
    if (invalid) return;
    let active = true;
    setData(null);
    fetch(`/api/tiktok?from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => { if (active) setData({ accounts: res.ok ? body.accounts ?? [] : [], daily: res.ok ? body.daily ?? [] : [], message: res.ok ? "" : body.message ?? `Lỗi ${res.status}` }); })
      .catch(() => { if (active) setData({ accounts: [], daily: [], message: "Không kết nối được máy chủ." }); });
    return () => { active = false; };
  }, [from, to, invalid, version]);

  async function sync() {
    setBusy(true); setNotice("");
    const res = await fetch("/api/tiktok", { method: "POST" }).catch(() => null);
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
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Tài khoản", "Từ ngày", "Đến ngày", ...COLUMNS.map(([label]) => label)], ...accounts.map((t) => [t.name, fmtDate(from), fmtDate(to), ...COLUMNS.map(([, value]) => value(t) ?? "")])]), "TikTok");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Ngày", "Tài khoản", ...DAILY.map(([label]) => label)], ...daily.map((d) => [fmtDate(d.day), d.name, ...DAILY.map(([, value]) => value(d))])]), "Theo ngày");
    XLSX.writeFile(book, `tiktok-${from}-${to}.xlsx`);
  }

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>TikTok</h1>
          <p>Chỉ số TikTok, đọc từ số liệu đã lưu, tự cập nhật mỗi ngày lúc 07:40 (bấm “Cập nhật số liệu” để lấy ngay). Chỉ xem được {TT_MAX_DAYS} ngày gần nhất của TikTok. Liên hệ Mes chưa có số liệu tự động, cần nhập tay. Đối tượng tiếp cận là tổng các ngày nên cao hơn số người thật; lượt nhấp web là lượt nhấp liên kết trong tiểu sử.</p>
        </div>
        <div className="summary-controls">
          <IsoDatePicker label="Từ ngày" value={from} onChange={setFrom} />
          <IsoDatePicker label="Đến ngày" value={to} onChange={setTo} />
          <button type="button" disabled={busy || invalid} onClick={() => void sync()}><RefreshCw size={15} className={busy ? "spin" : undefined} />{busy ? "Đang lấy…" : "Cập nhật số liệu"}</button>
          {accounts.length > 0 && <button type="button" onClick={exportExcel}><ArrowDownToLine size={15} />Xuất Excel</button>}
        </div>
      </div>
      {notice && <p className="summary-note" role="status">{notice}</p>}
      {invalid && <p className="summary-note">Chọn khoảng ngày hợp lệ, tối đa {TT_MAX_DAYS} ngày.</p>}
      {data?.message && <div className="alert alert-error" role="alert"><span>{data.message}</span></div>}
      {!data && !invalid && <p className="summary-note">Đang lấy số liệu…</p>}
      {data && !data.message && !invalid && data.accounts.length > 1 && <div className="range-presets reconcile-filter" role="group" aria-label="Lọc theo tài khoản">
        <button type="button" aria-pressed={!account} onClick={() => setAccount("")}>Tất cả ({data.accounts.length})</button>
        {data.accounts.map((t) => <button type="button" key={t.id} aria-pressed={account === t.id} onClick={() => setAccount(t.id)}>{t.name}</button>)}
      </div>}
      {data && !data.message && !invalid && (data.accounts.length === 0
        ? <p className="summary-note">Chưa có dữ liệu trong khoảng này. Bấm “Cập nhật số liệu” để lấy.</p>
        : <details className="summary-chart wide revenue-fold" open><summary><h4>Theo tài khoản</h4></summary><div className="summary-table summary-table-scroll"><table>
          <thead><tr><th>Tài khoản</th>{COLUMNS.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{accounts.map((t) => <tr key={t.id}><th scope="row">{t.name}</th>{COLUMNS.map(([label, value]) => { const v = value(t); return <td key={label}>{v === null ? NA : num(v)}</td>; })}</tr>)}</tbody>
        </table></div></details>)}
      {data && !data.message && !invalid && daily.length > 0 && <>
        <details className="summary-chart wide revenue-fold"><summary><h4>Số liệu theo ngày</h4></summary><div className="summary-table summary-table-scroll"><table>
          <thead><tr><th>Ngày</th><th>Tài khoản</th>{DAILY.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{daily.map((d) => <tr key={`${d.day}-${d.id}`}><th scope="row">{fmtDate(d.day)}</th><td>{d.name}</td>{DAILY.map(([label, value]) => <td key={label}>{num(value(d))}</td>)}</tr>)}</tbody>
        </table></div></details>
      </>}
    </section>
  );
}

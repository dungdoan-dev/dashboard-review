"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowDownToLine } from "lucide-react";
import { fmtDate } from "@/lib/format-date";
import { addDays, todayVN } from "@/lib/bluejay-metrics";
import { FB_MAX_DAYS, type FbDaily, type FbTotals } from "@/lib/facebook-page";
import { IsoDatePicker } from "@/components/date-picker";

const num = (x: number) => x.toLocaleString("vi-VN");
const NA = "—"; // Windsor has no figure for it: enter by hand
// Order of the "C. Bc Tiếp Cận" workbook.
const COLUMNS: [string, (t: FbTotals) => number | null][] = [["Lượt xem", (t) => t.views], ["Người xem", (t) => t.viewers], ["Lượt tương tác", (t) => t.engagement], ["Lượt click liên kết", () => null], ["Lượt truy cập", (t) => t.visits], ["Lượt theo dõi", (t) => t.follows], ["Liên hệ Mes", () => null], ["Tỷ lệ phản hồi", () => null], ["Số post bài", (t) => t.posts]];
const DAILY: [string, (d: FbDaily) => number][] = [["Lượt xem", (d) => d.views], ["Lượt tương tác", (d) => d.engagement], ["Lượt truy cập", (d) => d.visits], ["Lượt theo dõi", (d) => d.follows]];

type Loaded = { pages: FbTotals[]; daily: FbDaily[]; message: string };

/** Facebook Page figures per page for a date range, read from Windsor when the range changes. */
export function FacebookPage() {
  const today = todayVN();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(addDays(today, -1));
  const [data, setData] = useState<Loaded | null>(null);
  const [page, setPage] = useState(""); // page id, "" = all

  const invalid = !from || !to || from > to || addDays(from, FB_MAX_DAYS - 1) < to;
  useEffect(() => {
    if (invalid) return;
    let active = true;
    setData(null);
    fetch(`/api/facebook?from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => { if (active) setData({ pages: res.ok ? body.pages ?? [] : [], daily: res.ok ? body.daily ?? [] : [], message: res.ok ? "" : body.message ?? `Lỗi ${res.status}` }); })
      .catch(() => { if (active) setData({ pages: [], daily: [], message: "Không kết nối được máy chủ." }); });
    return () => { active = false; };
  }, [from, to, invalid]);

  const pages = (data?.pages ?? []).filter((t) => !page || t.id === page);
  const daily = (data?.daily ?? []).filter((d) => !page || d.id === page);

  function exportExcel() {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Trang", "Từ ngày", "Đến ngày", ...COLUMNS.map(([label]) => label)], ...pages.map((t) => [t.name, fmtDate(from), fmtDate(to), ...COLUMNS.map(([, value]) => value(t) ?? "")])]), "Facebook");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Ngày", "Trang", ...DAILY.map(([label]) => label)], ...daily.map((d) => [fmtDate(d.day), d.name, ...DAILY.map(([, value]) => value(d))])]), "Theo ngày");
    XLSX.writeFile(book, `facebook-${from}-${to}.xlsx`);
  }

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Facebook</h1>
          <p>Chỉ số tiếp cận của Facebook Page qua Windsor.ai, lấy trực tiếp theo khoảng ngày chọn. Lượt click liên kết, liên hệ Mes và tỷ lệ phản hồi Windsor không có, cần nhập tay. Lượt tương tác chỉ tính reactions nên thấp hơn số Meta Business Suite.</p>
        </div>
        <div className="summary-controls">
          <IsoDatePicker label="Từ ngày" value={from} onChange={setFrom} />
          <IsoDatePicker label="Đến ngày" value={to} onChange={setTo} />
          {pages.length > 0 && <button type="button" onClick={exportExcel}><ArrowDownToLine size={15} />Xuất Excel</button>}
        </div>
      </div>
      {invalid && <p className="summary-note">Chọn khoảng ngày hợp lệ, tối đa {FB_MAX_DAYS} ngày.</p>}
      {data?.message && <div className="alert alert-error" role="alert"><span>{data.message}</span></div>}
      {!data && !invalid && <p className="summary-note">Đang lấy từ Windsor…</p>}
      {data && !data.message && !invalid && data.pages.length > 1 && <div className="range-presets reconcile-filter" role="group" aria-label="Lọc theo trang">
        <button type="button" aria-pressed={!page} onClick={() => setPage("")}>Tất cả ({data.pages.length})</button>
        {data.pages.map((t) => <button type="button" key={t.id} aria-pressed={page === t.id} onClick={() => setPage(t.id)}>{t.name}</button>)}
      </div>}
      {data && !data.message && !invalid && (data.pages.length === 0
        ? <p className="summary-note">Windsor không trả dữ liệu trong khoảng này.</p>
        : <div className="summary-table summary-table-scroll"><table>
          <thead><tr><th>Trang</th>{COLUMNS.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{pages.map((t) => <tr key={t.id}><th scope="row">{t.name}</th>{COLUMNS.map(([label, value]) => { const v = value(t); return <td key={label}>{v === null ? NA : num(v)}</td>; })}</tr>)}</tbody>
        </table></div>)}
      {data && !data.message && !invalid && daily.length > 0 && <>
        <h2 className="summary-subtitle">Số liệu theo ngày</h2>
        <div className="summary-table summary-table-scroll"><table>
          <thead><tr><th>Ngày</th><th>Trang</th>{DAILY.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{daily.map((d) => <tr key={`${d.day}-${d.id}`}><th scope="row">{fmtDate(d.day)}</th><td>{d.name}</td>{DAILY.map(([label, value]) => <td key={label}>{num(value(d))}</td>)}</tr>)}</tbody>
        </table></div>
      </>}
    </section>
  );
}

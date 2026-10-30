"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowDownToLine, RefreshCw } from "lucide-react";
import { fmtDate } from "@/lib/format-date";
import { addDays, todayVN } from "@/lib/bluejay-metrics";
import { FB_MAX_DAYS, type FbDaily, type FbTotals } from "@/lib/facebook-page";
import { reachGroup } from "@/lib/reach-order";
import { IsoDatePicker } from "@/components/date-picker";
import { ReachChart } from "@/components/reach-chart";
import { ReachTable, additive, type Col } from "@/components/reach-table";
import { PageSkeleton } from "@/components/page-skeleton";

const num = (x: number) => x.toLocaleString("vi-VN");
const NA = "—"; // Windsor has no figure for it: enter by hand
// Order of the "C. Bc Tiếp Cận" workbook.
const COLUMNS: [string, (t: FbTotals) => number | null][] = [["Lượt xem", (t) => t.views], ["Người xem", (t) => t.viewers], ["Lượt tương tác", (t) => t.engagement], ["Lượt click liên kết", () => null], ["Lượt truy cập", (t) => t.visits], ["Lượt theo dõi", (t) => t.follows], ["Liên hệ Mes", () => null], ["Tỷ lệ phản hồi", () => null], ["Số post bài", (t) => t.posts]];
const DAILY: [string, (d: FbDaily) => number][] = [["Lượt xem", (d) => d.views], ["Lượt tương tác", (d) => d.engagement], ["Lượt truy cập", (d) => d.visits], ["Lượt theo dõi", (d) => d.follows]];

type Loaded = { pages: FbTotals[]; daily: FbDaily[]; message: string };
const placeCols: Col<FbTotals>[] = [{ label: "Trang", text: (t) => t.name }, ...COLUMNS.map(([label, value]): Col<FbTotals> => ({ label, value, text: (t) => { const v = value(t); return v === null ? NA : num(v); }, total: additive(label) }))];
const dayCols: Col<FbDaily>[] = [{ label: "Ngày", text: (d) => fmtDate(d.day), sort: (d) => d.day }, { label: "Trang", text: (d) => d.name }, ...DAILY.map(([label, value]): Col<FbDaily> => ({ label, value, text: (d) => num(value(d)), total: additive(label) }))];

/** Facebook Page figures per page for a date range, read from Windsor when the range changes. */
export function FacebookPage() {
  const today = todayVN();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(addDays(today, -1));
  const [data, setData] = useState<Loaded | null>(null);
  const [page, setPage] = useState(""); // page id, "" = all

  const [version, setVersion] = useState(0); // bumped after a sync to read the stored days again
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
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
  }, [from, to, invalid, version]);

  async function sync() {
    setBusy(true); setNotice("");
    const res = await fetch("/api/facebook", { method: "POST" }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) { setNotice(body.message ?? "Không kết nối được máy chủ."); return; }
    setNotice(`Đã lấy ${body.days} dòng theo ngày${body.posts ? ` và ${body.posts} bài đăng` : ""}.`);
    setVersion((v) => v + 1);
  }

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
          <p>Chỉ số tiếp cận của Facebook Page, đọc từ số liệu đã lưu, tự cập nhật mỗi ngày lúc 07:40 (bấm “Cập nhật số liệu” để lấy ngay). Lượt click liên kết, liên hệ Mes và tỷ lệ phản hồi chưa có số liệu tự động, cần nhập tay. Lượt tương tác chỉ tính reactions nên thấp hơn số Meta Business Suite.</p>
        </div>
        <div className="summary-controls">
          <IsoDatePicker label="Từ ngày" value={from} onChange={setFrom} />
          <IsoDatePicker label="Đến ngày" value={to} onChange={setTo} />
          <button type="button" data-write disabled={busy || invalid} onClick={() => void sync()}><RefreshCw size={15} className={busy ? "spin" : undefined} />{busy ? "Đang lấy…" : "Cập nhật số liệu"}</button>
          {pages.length > 0 && <button type="button" onClick={exportExcel}><ArrowDownToLine size={15} />Xuất Excel</button>}
        </div>
      </div>
      {notice && <p className="summary-note" role="status">{notice}</p>}
      {invalid && <p className="summary-note">Chọn khoảng ngày hợp lệ, tối đa {FB_MAX_DAYS} ngày.</p>}
      {data?.message && <div className="alert alert-error" role="alert"><span>{data.message}</span></div>}
      {!data && !invalid && <PageSkeleton label="Đang lấy số liệu…" />}
      {data && !data.message && !invalid && data.pages.length > 1 && <div className="range-presets reconcile-filter" role="group" aria-label="Lọc theo trang">
        <button type="button" aria-pressed={!page} onClick={() => setPage("")}>Tất cả ({data.pages.length})</button>
        {data.pages.map((t) => <button type="button" key={t.id} aria-pressed={page === t.id} onClick={() => setPage(t.id)}>{t.name}</button>)}
      </div>}
      {data && !data.message && !invalid && (data.pages.length === 0
        ? <p className="summary-note">Chưa có dữ liệu trong khoảng này. Bấm “Cập nhật số liệu” để lấy.</p>
        : <><details className="summary-chart wide revenue-fold" open><summary><h4>Biểu đồ</h4></summary><ReachChart rows={pages} columns={placeCols} nameOf={(t) => t.name} daily={daily} dailyColumns={dayCols} dayOf={(d) => d.day} /></details>
          <details className="summary-chart wide revenue-fold" open><summary><h4>Theo trang</h4></summary><ReachTable rows={pages} columns={placeCols} rowKey={(t) => t.id} groupOf={(t) => reachGroup(t.name)} /></details></>)}
      {data && !data.message && !invalid && daily.length > 0 && <>
        <details className="summary-chart wide revenue-fold"><summary><h4>Số liệu theo ngày</h4></summary><ReachTable rows={daily} columns={dayCols} rowKey={(d) => `${d.day}-${d.id}`} /></details>
      </>}
    </section>
  );
}

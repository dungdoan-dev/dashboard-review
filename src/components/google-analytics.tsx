"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowDownToLine, RefreshCw } from "lucide-react";
import { fmtDate } from "@/lib/format-date";
import { addDays, todayVN } from "@/lib/bluejay-metrics";
import { GA4_MAX_DAYS, type Ga4Totals } from "@/lib/google-analytics";
import { IsoDatePicker } from "@/components/date-picker";
import { ReachChart } from "@/components/reach-chart";
import { ReachTable, additive, type Col } from "@/components/reach-table";

const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
const pct = (x: number) => `${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
const COLUMNS: [string, (t: Ga4Totals) => string, (t: Ga4Totals) => number][] = [
  ["Phiên", (t) => num(t.sessions), (t) => t.sessions], ["Người dùng", (t) => num(t.users), (t) => t.users], ["Người dùng mới", (t) => num(t.newUsers), (t) => t.newUsers],
  ["Phiên có tương tác", (t) => num(t.engagedSessions), (t) => t.engagedSessions], ["Tỷ lệ tương tác", (t) => pct(t.engagementRate), (t) => t.engagementRate],
  ["Lượt xem trang", (t) => num(t.views), (t) => t.views], ["Chuyển đổi", (t) => num(t.conversions), (t) => t.conversions],
];

type Site = Ga4Totals & { id: string; site: string };
type Channel = Site & { source: string; medium: string };
type Daily = Site & { day: string };
type Loaded = { sites: Site[]; channels: Channel[]; daily: Daily[]; message: string };
const metricCols = <R extends Ga4Totals>(): Col<R>[] => COLUMNS.map(([label, text, value]): Col<R> => ({ label, text, value, total: additive(label) }));
const siteCols: Col<Site>[] = [{ label: "Website", text: (t) => t.site }, ...metricCols<Site>()];
const channelCols: Col<Channel>[] = [{ label: "Website", text: (t) => t.site }, { label: "Nguồn", text: (t) => t.source }, { label: "Phương tiện", text: (t) => t.medium }, ...metricCols<Channel>()];
const dayCols: Col<Daily>[] = [{ label: "Ngày", text: (d) => fmtDate(d.day), sort: (d) => d.day }, { label: "Website", text: (d) => d.site }, ...metricCols<Daily>()];

/** Google Analytics 4 per website, per source and per day for a date range, from the days stored by the daily Windsor sync. */
export function GoogleAnalytics() {
  const today = todayVN();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(addDays(today, -1));
  const [data, setData] = useState<Loaded | null>(null);
  const [site, setSite] = useState(""); // account id, "" = all

  const [version, setVersion] = useState(0); // bumped after a sync to read the stored days again
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const invalid = !from || !to || from > to || addDays(from, GA4_MAX_DAYS - 1) < to;
  useEffect(() => {
    if (invalid) return;
    let active = true;
    setData(null);
    fetch(`/api/google-analytics?from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => { if (active) setData({ sites: res.ok ? body.sites ?? [] : [], channels: res.ok ? body.channels ?? [] : [], daily: res.ok ? body.daily ?? [] : [], message: res.ok ? "" : body.message ?? `Lỗi ${res.status}` }); })
      .catch(() => { if (active) setData({ sites: [], channels: [], daily: [], message: "Không kết nối được máy chủ." }); });
    return () => { active = false; };
  }, [from, to, invalid, version]);

  async function sync() {
    setBusy(true); setNotice("");
    const res = await fetch("/api/google-analytics", { method: "POST" }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) { setNotice(body.message ?? "Không kết nối được máy chủ."); return; }
    setNotice(`Đã lấy ${body.days} dòng theo ngày.`);
    setVersion((v) => v + 1);
  }

  const sites = (data?.sites ?? []).filter((t) => !site || t.id === site);
  const channels = (data?.channels ?? []).filter((t) => !site || t.id === site);
  const daily = (data?.daily ?? []).filter((d) => !site || d.id === site);
  const sessions = sites.reduce((s, t) => s + t.sessions, 0);

  function exportExcel() {
    const book = XLSX.utils.book_new();
    const sheet = <R,>(name: string, cols: Col<R>[], rows: R[]) => XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([cols.map((c) => c.label), ...rows.map((r) => cols.map((c) => c.value ? c.value(r) : c.text(r)))]), name);
    sheet("Theo website", siteCols, sites); sheet("Theo nguồn", channelCols, channels); sheet("Theo ngày", dayCols, daily);
    XLSX.writeFile(book, `google-analytics-${from}-${to}.xlsx`);
  }

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Google Analytics</h1>
          <p>Lượt truy cập website theo nguồn, đọc từ số liệu đã lưu, tự cập nhật mỗi ngày lúc 07:40 (bấm “Cập nhật số liệu” để lấy ngay). Người dùng cộng qua các nguồn nên một người có thể được tính hai lần; dùng để so sánh.</p>
        </div>
        <div className="summary-controls">
          <IsoDatePicker label="Từ ngày" value={from} onChange={setFrom} />
          <IsoDatePicker label="Đến ngày" value={to} onChange={setTo} />
          <button type="button" disabled={busy || invalid} onClick={() => void sync()}><RefreshCw size={15} className={busy ? "spin" : undefined} />{busy ? "Đang lấy…" : "Cập nhật số liệu"}</button>
          {sites.length > 0 && <button type="button" onClick={exportExcel}><ArrowDownToLine size={15} />Xuất Excel</button>}
        </div>
      </div>
      {notice && <p className="summary-note" role="status">{notice}</p>}
      {invalid && <p className="summary-note">Chọn khoảng ngày hợp lệ, tối đa {GA4_MAX_DAYS} ngày.</p>}
      {data?.message && <div className="alert alert-error" role="alert"><span>{data.message}</span></div>}
      {!data && !invalid && <p className="summary-note">Đang lấy số liệu…</p>}
      {data && !data.message && !invalid && data.sites.length > 1 && <div className="range-presets reconcile-filter" role="group" aria-label="Lọc theo website">
        <button type="button" aria-pressed={!site} onClick={() => setSite("")}>Tất cả ({data.sites.length})</button>
        {data.sites.map((t) => <button type="button" key={t.id} aria-pressed={site === t.id} onClick={() => setSite(t.id)}>{t.site}</button>)}
      </div>}
      {data && !data.message && !invalid && (data.sites.length === 0
        ? <p className="summary-note">Chưa có số liệu trong khoảng này. Bấm “Cập nhật số liệu” để lấy.</p>
        : <>
          <p className="summary-note">Tổng phiên {site ? "website" : `${sites.length} website`}: <strong>{num(sessions)}</strong></p>
          <details className="summary-chart wide revenue-fold" open><summary><h4>Biểu đồ</h4></summary><ReachChart rows={sites} columns={siteCols} nameOf={(t) => t.site} daily={daily} dailyColumns={dayCols} dayOf={(d) => d.day} /></details>
          <details className="summary-chart wide revenue-fold" open><summary><h4>Theo website</h4></summary><ReachTable rows={sites} columns={siteCols} rowKey={(t) => t.id} /></details>
          <details className="summary-chart wide revenue-fold" open><summary><h4>Theo nguồn truy cập</h4></summary><ReachTable rows={channels} columns={channelCols} rowKey={(t) => `${t.id}|${t.source}|${t.medium}`} /></details>
        </>)}
      {data && !data.message && !invalid && daily.length > 0 && <>
        <details className="summary-chart wide revenue-fold"><summary><h4>Số liệu theo ngày</h4></summary><ReachTable rows={daily} columns={dayCols} rowKey={(d) => `${d.day}-${d.id}`} /></details>
      </>}
    </section>
  );
}

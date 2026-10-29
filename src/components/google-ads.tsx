"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowDownToLine, RefreshCw } from "lucide-react";
import { fmtDate } from "@/lib/format-date";
import { addDays, todayVN } from "@/lib/bluejay-metrics";
import { GADS_MAX_DAYS, type GadsDaily, type GadsTotals } from "@/lib/google-ads";
import { IsoDatePicker } from "@/components/date-picker";
import { ReachChart } from "@/components/reach-chart";
import { ReachTable, additive, type Col } from "@/components/reach-table";

const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
const pct = (x: number) => `${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
const dec = (x: number) => x.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const dash = (x: number, show: (v: number) => string) => (x ? show(x) : "—"); // no conversions / clicks: nothing to divide by
const COLUMNS: [string, (t: GadsTotals) => string, (t: GadsTotals) => number][] = [
  ["Chi phí (VND)", (t) => num(t.spend), (t) => t.spend], ["Hiển thị", (t) => num(t.impressions), (t) => t.impressions], ["Lượt nhấp", (t) => num(t.clicks), (t) => t.clicks],
  ["CTR", (t) => dash(t.ctr, pct), (t) => t.ctr], ["CPC (VND)", (t) => dash(t.cpc, num), (t) => t.cpc], ["Chuyển đổi", (t) => dec(t.conversions), (t) => t.conversions], ["Chi phí / chuyển đổi (VND)", (t) => dash(t.costPerConversion, num), (t) => t.costPerConversion],
];
const DAILY: [string, (d: GadsDaily) => number][] = [["Chi phí (VND)", (d) => d.spend], ["Hiển thị", (d) => d.impressions], ["Lượt nhấp", (d) => d.clicks], ["Chuyển đổi", (d) => d.conversions]];

type Loaded = { campaigns: GadsTotals[]; daily: GadsDaily[]; message: string };
const placeCols: Col<GadsTotals>[] = [{ label: "Chiến dịch", text: (t) => t.campaign }, ...COLUMNS.map(([label, text, value]): Col<GadsTotals> => ({ label, text, value, total: additive(label) }))];
const dayCols: Col<GadsDaily>[] = [{ label: "Ngày", text: (d) => fmtDate(d.day), sort: (d) => d.day }, { label: "Chiến dịch", text: (d) => d.campaign }, ...DAILY.map(([label, value]): Col<GadsDaily> => ({ label, value, text: (d) => (label === "Chuyển đổi" || label === "Kết quả" ? dec(value(d)) : num(value(d))), total: additive(label) }))];

/** Google Ads per campaign for a date range, from the days stored by the daily Windsor sync. */
export function GoogleAds() {
  const today = todayVN();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(addDays(today, -1));
  const [data, setData] = useState<Loaded | null>(null);
  const [campaign, setCampaign] = useState(""); // campaign id, "" = all

  const [version, setVersion] = useState(0); // bumped after a sync to read the stored days again
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const invalid = !from || !to || from > to || addDays(from, GADS_MAX_DAYS - 1) < to;
  useEffect(() => {
    if (invalid) return;
    let active = true;
    setData(null);
    fetch(`/api/google-ads?from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => { if (active) setData({ campaigns: res.ok ? body.campaigns ?? [] : [], daily: res.ok ? body.daily ?? [] : [], message: res.ok ? "" : body.message ?? `Lỗi ${res.status}` }); })
      .catch(() => { if (active) setData({ campaigns: [], daily: [], message: "Không kết nối được máy chủ." }); });
    return () => { active = false; };
  }, [from, to, invalid, version]);

  async function sync() {
    setBusy(true); setNotice("");
    const res = await fetch("/api/google-ads", { method: "POST" }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) { setNotice(body.message ?? "Không kết nối được máy chủ."); return; }
    setNotice(`Đã lấy ${body.days} dòng theo ngày.`);
    setVersion((v) => v + 1);
  }

  const campaigns = (data?.campaigns ?? []).filter((t) => !campaign || t.id === campaign);
  const daily = (data?.daily ?? []).filter((d) => !campaign || d.id === campaign);
  const spend = campaigns.reduce((s, t) => s + t.spend, 0);

  function exportExcel() {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Chiến dịch", "Từ ngày", "Đến ngày", ...COLUMNS.map(([label]) => label)], ...campaigns.map((t) => [t.campaign, fmtDate(from), fmtDate(to), ...COLUMNS.map(([, , value]) => value(t))])]), "Google Ads");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Ngày", "Chiến dịch", ...DAILY.map(([label]) => label)], ...daily.map((d) => [fmtDate(d.day), d.campaign, ...DAILY.map(([, value]) => value(d))])]), "Theo ngày");
    XLSX.writeFile(book, `google-ads-${from}-${to}.xlsx`);
  }

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Google Ads</h1>
          <p>Quảng cáo Google theo chiến dịch, đọc từ số liệu đã lưu, tự cập nhật mỗi ngày lúc 07:40 (bấm “Cập nhật số liệu” để lấy ngay). Chuyển đổi là số hành động Google ghi nhận từ quảng cáo.</p>
        </div>
        <div className="summary-controls">
          <IsoDatePicker label="Từ ngày" value={from} onChange={setFrom} />
          <IsoDatePicker label="Đến ngày" value={to} onChange={setTo} />
          <button type="button" data-write disabled={busy || invalid} onClick={() => void sync()}><RefreshCw size={15} className={busy ? "spin" : undefined} />{busy ? "Đang lấy…" : "Cập nhật số liệu"}</button>
          {campaigns.length > 0 && <button type="button" onClick={exportExcel}><ArrowDownToLine size={15} />Xuất Excel</button>}
        </div>
      </div>
      {notice && <p className="summary-note" role="status">{notice}</p>}
      {invalid && <p className="summary-note">Chọn khoảng ngày hợp lệ, tối đa {GADS_MAX_DAYS} ngày.</p>}
      {data?.message && <div className="alert alert-error" role="alert"><span>{data.message}</span></div>}
      {!data && !invalid && <p className="summary-note">Đang lấy số liệu…</p>}
      {data && !data.message && !invalid && data.campaigns.length > 1 && <div className="range-presets reconcile-filter" role="group" aria-label="Lọc theo chiến dịch">
        <button type="button" aria-pressed={!campaign} onClick={() => setCampaign("")}>Tất cả ({data.campaigns.length})</button>
        {data.campaigns.map((t) => <button type="button" key={t.id} aria-pressed={campaign === t.id} onClick={() => setCampaign(t.id)}>{t.campaign}</button>)}
      </div>}
      {data && !data.message && !invalid && (data.campaigns.length === 0
        ? <p className="summary-note">Chưa có chiến dịch trong khoảng này. Bấm “Cập nhật số liệu” để lấy.</p>
        : <>
          <p className="summary-note">Tổng chi phí {campaign ? "chiến dịch" : `${campaigns.length} chiến dịch`}: <strong>{num(spend)} VND</strong></p>
          <details className="summary-chart wide revenue-fold" open><summary><h4>Biểu đồ</h4></summary><ReachChart rows={campaigns} columns={placeCols} nameOf={(t) => t.campaign} daily={daily} dailyColumns={dayCols} dayOf={(d) => d.day} /></details>
          <details className="summary-chart wide revenue-fold" open><summary><h4>Theo chiến dịch</h4></summary><ReachTable rows={campaigns} columns={placeCols} rowKey={(t) => t.id} /></details>
        </>)}
      {data && !data.message && !invalid && daily.length > 0 && <>
        <details className="summary-chart wide revenue-fold"><summary><h4>Số liệu theo ngày</h4></summary><ReachTable rows={daily} columns={dayCols} rowKey={(d) => `${d.day}-${d.id}`} /></details>
      </>}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowDownToLine, RefreshCw } from "lucide-react";
import { fmtDate } from "@/lib/format-date";
import { addDays, todayVN } from "@/lib/bluejay-metrics";
import { ADS_MAX_DAYS, resultLabel, type AdsDaily, type AdsTotals } from "@/lib/facebook-ads";
import { IsoDatePicker } from "@/components/date-picker";
import { ReachChart } from "@/components/reach-chart";
import { ReachTable, additive, type Col } from "@/components/reach-table";

const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
const pct = (x: number) => `${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
const dec = (x: number) => x.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const dash = (x: number, show: (v: number) => string) => (x ? show(x) : "—"); // no messages / clicks: nothing to divide by
const COLUMNS: [string, (t: AdsTotals) => string, (t: AdsTotals) => number][] = [
  ["Chi phí (VND)", (t) => num(t.spend), (t) => t.spend], ["Kết quả", (t) => (t.results ? num(t.results) : "—"), (t) => t.results], ["Chi phí / kết quả (VND)", (t) => dash(t.costPerResult, num), (t) => t.costPerResult], ["Hiển thị", (t) => num(t.impressions), (t) => t.impressions], ["Người tiếp cận", (t) => num(t.reach), (t) => t.reach],
  ["Tần suất", (t) => dash(t.frequency, dec), (t) => t.frequency], ["Lượt nhấp", (t) => num(t.clicks), (t) => t.clicks], ["Nhấp liên kết", (t) => num(t.linkClicks), (t) => t.linkClicks],
  ["CTR", (t) => dash(t.ctr, pct), (t) => t.ctr], ["CPC (VND)", (t) => dash(t.cpc, num), (t) => t.cpc], ["Tin nhắn mới", (t) => num(t.messages), (t) => t.messages], ["Chi phí / tin nhắn (VND)", (t) => dash(t.costPerMessage, num), (t) => t.costPerMessage],
];
const DAILY: [string, (d: AdsDaily) => number][] = [["Chi phí (VND)", (d) => d.spend], ["Kết quả", (d) => d.results], ["Hiển thị", (d) => d.impressions], ["Người tiếp cận", (d) => d.reach], ["Lượt nhấp", (d) => d.clicks], ["Nhấp liên kết", (d) => d.linkClicks], ["Tin nhắn mới", (d) => d.messages]];

type Loaded = { campaigns: AdsTotals[]; daily: AdsDaily[]; message: string };
const placeCols: Col<AdsTotals>[] = [{ label: "Chiến dịch", text: (t) => t.campaign }, ...COLUMNS.flatMap(([label, text, value]): Col<AdsTotals>[] => [{ label, text, value, total: additive(label) }, ...(label === "Kết quả" ? [{ label: "Loại kết quả", text: (t: AdsTotals) => (t.results ? resultLabel(t.resultType) : "—") }] : [])])];
const dayCols: Col<AdsDaily>[] = [{ label: "Ngày", text: (d) => fmtDate(d.day), sort: (d) => d.day }, { label: "Chiến dịch", text: (d) => d.campaign }, ...DAILY.map(([label, value]): Col<AdsDaily> => ({ label, value, text: (d) => (label === "Chuyển đổi" || label === "Kết quả" ? dec(value(d)) : num(value(d))), total: additive(label) }))];

/** Facebook Ads per campaign for a date range, read from Windsor when the range changes. */
export function FacebookAds() {
  const today = todayVN();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(addDays(today, -1));
  const [data, setData] = useState<Loaded | null>(null);
  const [campaign, setCampaign] = useState(""); // campaign id, "" = all

  const [version, setVersion] = useState(0); // bumped after a sync to read the stored days again
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const invalid = !from || !to || from > to || addDays(from, ADS_MAX_DAYS - 1) < to;
  useEffect(() => {
    if (invalid) return;
    let active = true;
    setData(null);
    fetch(`/api/facebook-ads?from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => { if (active) setData({ campaigns: res.ok ? body.campaigns ?? [] : [], daily: res.ok ? body.daily ?? [] : [], message: res.ok ? "" : body.message ?? `Lỗi ${res.status}` }); })
      .catch(() => { if (active) setData({ campaigns: [], daily: [], message: "Không kết nối được máy chủ." }); });
    return () => { active = false; };
  }, [from, to, invalid, version]);

  async function sync() {
    setBusy(true); setNotice("");
    const res = await fetch("/api/facebook-ads", { method: "POST" }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) { setNotice(body.message ?? "Không kết nối được máy chủ."); return; }
    setNotice(`Đã lấy ${body.days} dòng theo ngày${body.posts ? ` và ${body.posts} bài đăng` : ""}.`);
    setVersion((v) => v + 1);
  }

  const campaigns = (data?.campaigns ?? []).filter((t) => !campaign || t.id === campaign);
  const daily = (data?.daily ?? []).filter((d) => !campaign || d.id === campaign);
  const spend = campaigns.reduce((s, t) => s + t.spend, 0);

  function exportExcel() {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Chiến dịch", "Từ ngày", "Đến ngày", ...COLUMNS.map(([label]) => label)], ...campaigns.map((t) => [t.campaign, fmtDate(from), fmtDate(to), ...COLUMNS.map(([, , value]) => value(t))])]), "Facebook Ads");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Ngày", "Chiến dịch", ...DAILY.map(([label]) => label)], ...daily.map((d) => [fmtDate(d.day), d.campaign, ...DAILY.map(([, value]) => value(d))])]), "Theo ngày");
    XLSX.writeFile(book, `facebook-ads-${from}-${to}.xlsx`);
  }

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Facebook Ads</h1>
          <p>Quảng cáo Facebook theo chiến dịch, đọc từ số liệu đã lưu, tự cập nhật mỗi ngày lúc 07:40 (bấm “Cập nhật số liệu” để lấy ngay). Người tiếp cận là số người trong cả kỳ nên không bằng tổng các ngày. Kết quả là mục tiêu của từng chiến dịch như cột “Kết quả” trong Ads Manager (lượt ThruPlay với chiến dịch video, cuộc trò chuyện với chiến dịch nhắn tin). Tin nhắn mới là số cuộc trò chuyện bắt đầu từ quảng cáo.</p>
        </div>
        <div className="summary-controls">
          <IsoDatePicker label="Từ ngày" value={from} onChange={setFrom} />
          <IsoDatePicker label="Đến ngày" value={to} onChange={setTo} />
          <button type="button" data-write disabled={busy || invalid} onClick={() => void sync()}><RefreshCw size={15} className={busy ? "spin" : undefined} />{busy ? "Đang lấy…" : "Cập nhật số liệu"}</button>
          {campaigns.length > 0 && <button type="button" onClick={exportExcel}><ArrowDownToLine size={15} />Xuất Excel</button>}
        </div>
      </div>
      {notice && <p className="summary-note" role="status">{notice}</p>}
      {invalid && <p className="summary-note">Chọn khoảng ngày hợp lệ, tối đa {ADS_MAX_DAYS} ngày.</p>}
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

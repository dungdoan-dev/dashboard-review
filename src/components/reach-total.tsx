"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine } from "lucide-react";
import { fmtDate } from "@/lib/format-date";
import { addDays, todayVN } from "@/lib/bluejay-metrics";
import { CHANNELS, REACH_MAX_DAYS, spanDays, type Block, type Cell, type ChannelTables } from "@/lib/reach-total";
import { IsoDatePicker } from "@/components/date-picker";
import { ReachTable, type Col } from "@/components/reach-table";
import { PageSkeleton } from "@/components/page-skeleton";

const show = (label: string, x: number) => (/CTR|Tỷ lệ/i.test(label) ? `${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%` : x.toLocaleString("vi-VN", { maximumFractionDigits: 2 }));

/** Every channel for the range, from the same stored figures as the channel's own page; a channel that cannot answer keeps its message and the others still load. */
async function loadAll(from: string, to: string): Promise<ChannelTables[]> {
  return Promise.all(CHANNELS.map(async (c): Promise<ChannelTables> => {
    const failed = (error: string): ChannelTables => ({ name: c.name, summary: [], daily: null, error });
    if (spanDays(from, to) > c.maxDays) return failed(`Khoảng ngày dài hơn ${c.maxDays} ngày, kênh này chỉ trả tối đa ${c.maxDays} ngày. Chọn khoảng ngắn hơn để có số liệu ${c.name}.`);
    const res = await fetch(`${c.api}?from=${from}&to=${to}`, { cache: "no-store" }).catch(() => null);
    if (!res) return failed("Không kết nối được máy chủ.");
    const body = await res.json().catch(() => ({}));
    return res.ok ? { name: c.name, ...c.build(body) } : failed(body.message ?? `Lỗi ${res.status}`);
  }));
}

function BlockTable({ block }: { block: Block }) {
  const numeric = block.head.map((_, i) => block.rows.some((r) => typeof r[i] === "number"));
  const columns: Col<Cell[]>[] = block.head.map((label, i) => numeric[i]
    ? { label, value: (r) => (typeof r[i] === "number" ? (r[i] as number) : null), text: (r) => (typeof r[i] === "number" ? show(label, r[i] as number) : "—"), total: block.sum[i] }
    : { label, text: (r) => String(r[i] ?? "—") });
  return <ReachTable rows={block.rows} columns={columns} rowKey={(r) => r.join("|")} compact />;
}

/** Báo cáo tổng Tiếp cận: all seven channels for one date range on one page, and the same tables in one Excel file. */
export function ReachTotal() {
  const today = todayVN();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(addDays(today, -1));
  const [loaded, setLoaded] = useState<{ key: string; data: ChannelTables[] } | null>(null);
  const key = `${from}|${to}`;
  const data = loaded?.key === key ? loaded.data : null; // the tables of an older range are not shown while the new one loads
  const invalid = !from || !to || from > to || spanDays(from, to) > REACH_MAX_DAYS;

  useEffect(() => {
    if (invalid) return;
    let active = true;
    void loadAll(from, to).then((next) => { if (active) setLoaded({ key: `${from}|${to}`, data: next }); });
    return () => { active = false; };
  }, [from, to, invalid]);

  async function exportExcel() {
    if (!data) return;
    const [m, q] = await Promise.all([import("@/lib/reach-total-excel"), import("@/lib/ql-excel")]);
    await q.downloadQlWorkbook(`bao-cao-tong-tiep-can-${from}-${to}.xlsx`, m.reachTotalWorkbook("BÁO CÁO TỔNG TIẾP CẬN", `Kỳ: ${fmtDate(from)} – ${fmtDate(to)}`, data));
  }

  const readable = data?.some((c) => !c.error) ?? false;
  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Báo cáo tổng Tiếp cận</h1>
          <p>Gộp Google Maps, Facebook, Instagram, Google Analytics, TikTok, Facebook Ads và Google Ads của một khoảng ngày, lấy từ số liệu đã lưu của từng kênh (không gọi lại nguồn). File Excel có sheet “Tổng hợp” và mỗi kênh một sheet theo ngày.</p>
        </div>
        <div className="summary-controls">
          <IsoDatePicker label="Từ ngày" value={from} onChange={setFrom} />
          <IsoDatePicker label="Đến ngày" value={to} onChange={setTo} />
          <button type="button" disabled={!readable || invalid} onClick={() => void exportExcel()}><ArrowDownToLine size={15} />Xuất Excel</button>
        </div>
      </div>
      {invalid && <p className="summary-note">Chọn khoảng ngày hợp lệ, tối đa {REACH_MAX_DAYS} ngày.</p>}
      {!data && !invalid && <PageSkeleton label="Đang lấy số liệu các kênh…" />}
      {data && !invalid && data.map((c) => (
        <details key={c.name} className="summary-chart wide revenue-fold" open>
          <summary><h4>{c.name}</h4></summary>
          {c.error ? <div className="alert alert-error" role="alert"><span>{c.error}</span></div>
            : c.summary.map((b) => <div key={b.title}>
              {c.summary.length > 1 && <p className="summary-note"><strong>{b.title}</strong></p>}
              {b.rows.length === 0 ? <p className="summary-note">Chưa có dữ liệu trong khoảng này.</p> : <BlockTable block={b} />}
            </div>)}
        </details>
      ))}
    </section>
  );
}

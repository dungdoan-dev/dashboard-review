"use client";

import type { Block, Cell, ChannelTables } from "@/lib/reach-total";
import { ReachTable, type Col } from "@/components/reach-table";

const show = (label: string, x: number) => (/CTR|Tỷ lệ/i.test(label) ? `${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%` : x.toLocaleString("vi-VN", { maximumFractionDigits: 2 }));

function BlockTable({ block }: { block: Block }) {
  const numeric = block.head.map((_, i) => block.rows.some((r) => typeof r[i] === "number"));
  const columns: Col<Cell[]>[] = block.head.map((label, i) => numeric[i]
    ? { label, value: (r) => (typeof r[i] === "number" ? (r[i] as number) : null), text: (r) => (typeof r[i] === "number" ? show(label, r[i] as number) : "—"), total: block.sum[i] }
    : { label, text: (r) => String(r[i] ?? "—") });
  return <ReachTable rows={block.rows} columns={columns} rowKey={(r) => r.join("|")} compact />;
}

/** One folded table per channel (a message instead of the tables for a channel that could not be read). */
export function ReachChannels({ data }: { data: ChannelTables[] }) {
  return <>
    {data.map((c) => (
      <details key={c.name} className="summary-chart wide revenue-fold" open>
        <summary><h4>{c.name}</h4></summary>
        {c.error ? <div className="alert alert-error" role="alert"><span>{c.error}</span></div>
          : c.summary.map((b) => <div key={b.title}>
            {c.summary.length > 1 && <p className="summary-note"><strong>{b.title}</strong></p>}
            {b.rows.length === 0 ? <p className="summary-note">Chưa có dữ liệu trong khoảng này.</p> : <BlockTable block={b} />}
          </div>)}
      </details>
    ))}
  </>;
}

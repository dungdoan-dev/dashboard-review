"use client";

import { useEffect, useMemo, useState } from "react";
import { BLUEJAY_HOTELS } from "@/lib/bluejay-metrics";
import { parseLedgerWorkbook } from "@/lib/bluejay-reconcile";
import { parseExpenses, summarizeFinance, type ExpenseLine } from "@/lib/finance-summary";
import { HOTEL_ROOMS, lineMonths, pnlRows, roomByCheckout, revenueLines, type MonthData, type PnlRow } from "@/lib/pnl";
import type { DailyRevenue } from "@/lib/bluejay-daily";
import type { RangeData } from "@/lib/bluejay-range";
import { ReachTable, type Col } from "@/components/reach-table";

const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
const signed = (x: number) => (x < 0 ? "−" : "") + num(Math.abs(x));
const months = (year: string) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
const monthEnd = (month: string) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const daysIn = (month: string) => Number(monthEnd(month).slice(8));

type Daily = { rooms: number; room: number; services: Record<string, number> };
type Ledger = { commission: number; otherDeduction: number; expenses: ExpenseLine[] };
type Sheets = { name: string; rows: unknown[][] }[];

/** One month of the hotel's ledger tabs: deductions and expenses. */
function readLedger(sheets: Sheets, month: string): Ledger | null {
  const ledger = parseLedgerWorkbook(sheets);
  if (ledger.month && ledger.month !== month) return null; // one file per month: the same tabs come back for every month, only the month they are for counts
  let expenses: ExpenseLine[] = [];
  for (const s of sheets) { try { expenses = parseExpenses(s.rows); break; } catch { /* not the expense tab */ } }
  const s = summarizeFinance(ledger.entries, expenses, { from: `${month}-01`, to: monthEnd(month) });
  return { commission: s.income.commission, otherDeduction: s.income.otherDeduction, expenses };
}

/** The yearly result of one hotel like the accountant's sheet: result by month, nights and occupancy. Revenue comes from Blue Jay (by day of stay), the rest from the month tabs of the hotel's Google Sheet. */
export function BluejayPnl({ scopeId }: { scopeId: number | null }) {
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [daily, setDaily] = useState<Record<string, Daily | null>>({});
  const [ledgers, setLedgers] = useState<Record<string, Ledger | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hotelName = BLUEJAY_HOTELS.find((h) => h.id === scopeId)?.name ?? "";
  const list = useMemo(() => months(year), [year]);

  useEffect(() => {
    if (!scopeId || !/^\d{4}$/.test(year)) return;
    let active = true;
    setDaily({}); setLedgers({}); setError("");
    Promise.all(list.map(async (m): Promise<[string, Daily | null]> => {
      const get = (path: string) => fetch(`/api/bluejay/${path}?from=${m}-01&to=${monthEnd(m)}`, { cache: "no-store" }).catch(() => null);
      const [res, range] = await Promise.all([get("daily"), get("range")]);
      if (!res?.ok) return [m, null];
      const stays = range?.ok ? ((await range.json()) as RangeData).hotels.find((h) => h.id === scopeId) : undefined; // room money by check-out day
      const hotel = ((await res.json()) as DailyRevenue).hotels.find((h) => h.id === scopeId);
      const d = hotel?.days ?? [];
      if (!d.some((x) => x.total || x.rooms)) return [m, null];
      const services: Record<string, number> = {};
      for (const x of d) for (const [g, v] of Object.entries(x.services)) services[g] = (services[g] ?? 0) + v;
      for (const g of Object.keys(services)) services[g] = Math.round(services[g]);
      return [m, { rooms: d.reduce((s, x) => s + x.rooms, 0), room: stays ? roomByCheckout(stays) : Math.round(d.reduce((s, x) => s + x.room, 0)), services }];
    })).then((entries) => { if (active) setDaily(Object.fromEntries(entries)); });
    return () => { active = false; };
  }, [scopeId, year, list]);

  async function onSheet() {
    if (!scopeId) return;
    setBusy(true); setError("");
    const failed: string[] = [];
    const entries = await Promise.all(list.map(async (m): Promise<[string, Ledger | null]> => {
      const res = await fetch(`/api/bluejay/ledger-sheet?hotel=${scopeId}&month=${m}`, { cache: "no-store" }).catch(() => null);
      if (!res) { failed.push(m); return [m, null]; }
      const body = await res.json().catch(() => ({}));
      if (res.status === 404) return [m, null]; // no tab for the month yet
      if (!res.ok) { failed.push(m); return [m, null]; }
      try { return [m, readLedger(body.sheets, m)]; } catch { failed.push(m); return [m, null]; }
    }));
    setLedgers(Object.fromEntries(entries));
    if (failed.length) setError(`Không đọc được tháng ${failed.map((m) => m.slice(5)).join(", ")} (kiểm tra tên tab BK THU, BK CHI của tháng đó).`);
    setBusy(false);
  }

  // every expense line counts in the month its text names ("lương tháng 7"), else the month it was paid; months outside the year are dropped
  const allocated = useMemo(() => lineMonths(Object.values(ledgers).flatMap((l) => l?.expenses ?? [])), [ledgers]);
  const moved = useMemo(() => Object.entries(ledgers).reduce((n, [m, l]) => n + (l?.expenses ?? []).filter((e) => lineMonths([e]).has(m) === false).length, 0), [ledgers]);
  const data = useMemo(() => list.map((m): MonthData | null => {
    const d = daily[m], l = ledgers[m];
    if (!d && !l) return null;
    return { rooms: d?.rooms ?? 0, room: d?.room ?? 0, services: d?.services ?? {}, commission: l?.commission ?? 0, otherDeduction: l?.otherDeduction ?? 0, expenses: l ? allocated.get(m) ?? [] : null };
  }), [list, daily, ledgers, allocated]);
  const rows = useMemo(() => pnlRows(data), [data]);
  const loaded = Object.values(ledgers).filter(Boolean).length;
  const missing = list.filter((m) => daily[m] && !ledgers[m]).map((m) => m.slice(5));

  const hasCost = [...list.map((m) => !!ledgers[m]), true]; // a month without its expense tab shows no costs and no profit, not a false 0 and a profit equal to the revenue
  const pnlCols: Col<PnlRow>[] = [
    { label: "Chỉ tiêu", text: (r) => r.label },
    ...[...list.map((m) => `Tháng ${Number(m.slice(5))}`), "Cả năm"].map((label, i): Col<PnlRow> => ({ label, value: (r) => (r.cost && !hasCost[i] ? null : r.values[i]), text: (r) => (r.cost && !hasCost[i] ? "–" : signed(r.values[i])), total: false })),
  ];
  type Month = { m: string; d: Daily | null; l: Ledger | null };
  const monthRows: Month[] = list.map((m) => ({ m, d: daily[m] ?? null, l: ledgers[m] ?? null })).filter((x) => x.d || x.l);
  const capacity = (m: string) => (scopeId && HOTEL_ROOMS[scopeId] ? HOTEL_ROOMS[scopeId] * daysIn(m) : 0);
  const balanceCols: Col<Month>[] = [
    { label: "Tháng", text: (r) => `Tháng ${Number(r.m.slice(5))}`, sort: (r) => r.m },
    { label: "Số phòng ở (đêm)", value: (r) => r.d?.rooms ?? 0, text: (r) => num(r.d?.rooms ?? 0), total: true },
    { label: "Phòng bán (đêm)", value: (r) => capacity(r.m) || null, text: (r) => (capacity(r.m) ? num(capacity(r.m)) : "–"), total: true },
    { label: "Công suất (OCC)", value: (r) => (capacity(r.m) ? (r.d?.rooms ?? 0) / capacity(r.m) : null), text: (r) => (capacity(r.m) ? `${Math.round(((r.d?.rooms ?? 0) / capacity(r.m)) * 100)}%` : "–") },
    ...(["Tiền phòng", "Minibar", "Giặt ủi", "Dịch vụ ngoài", "Thu khác"] as const).map((label): Col<Month> => ({ label: `Doanh thu ${label.toLowerCase()}`, value: (r) => (r.d ? revenueLines(r.d)[label] : 0), text: (r) => num(r.d ? revenueLines(r.d)[label] : 0), total: true })),
    { label: "Giảm trừ doanh thu", value: (r) => (r.l ? r.l.commission + r.l.otherDeduction : 0), text: (r) => num(r.l ? r.l.commission + r.l.otherDeduction : 0), total: true },
  ];

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Kết quả hoạt động kinh doanh · {hotelName || "chưa chọn khách sạn"}</h1>
          <p>Kết quả cả năm theo từng tháng như bảng của kế toán. Doanh thu từ Blue Jay đã lưu: tiền phòng theo ngày trả phòng (gồm M-Standard, Unassigned, hủy và no-show đã thu, như báo cáo doanh thu theo phòng của Blue Jay), dịch vụ theo ngày bán; giảm trừ doanh thu và chi phí lấy từ tab BK THU, BK CHI của từng tháng trong Google Sheet. Chi phí tính vào tháng ghi trong “Nội dung chi” (ví dụ “lương tháng 7” trả trong tháng 8 là chi phí tháng 7; ghi nhiều tháng thì chia đều), không ghi thì tính vào tháng đã chi, rồi xếp vào 5 nhóm như báo cáo tuần.</p>
        </div>
        <div className="summary-controls">
          <input type="number" aria-label="Năm" min={2020} max={2100} value={year} onChange={(event) => setYear(event.target.value)} disabled={!scopeId} />
          <button type="button" disabled={!scopeId || !/^\d{4}$/.test(year) || busy} onClick={() => void onSheet()}>{busy ? "Đang đọc Google Sheet…" : "Lấy từ Google Sheet"}</button>
        </div>
      </div>
      {!scopeId && <div className="alert alert-error" role="alert"><span>Chọn một khách sạn ở ô “Khách sạn đang xem” trên thanh trên. Mỗi Google Sheet chỉ thuộc một khách sạn.</span></div>}
      {error && <div className="alert alert-error" role="alert"><span>{error}</span></div>}
      {scopeId && !loaded && !error && <p className="summary-note">Chưa có chi phí. Bấm “Lấy từ Google Sheet” để đọc BK THU, BK CHI của 12 tháng; doanh thu đã có từ Blue Jay.</p>}
      {loaded > 0 && missing.length > 0 && <p className="summary-note bad" role="alert">Tháng {missing.join(", ")} có doanh thu nhưng chưa có tab BK THU, BK CHI nên chi phí tính 0.</p>}
      {moved > 0 && <p className="summary-note">{moved} dòng chi được tính vào tháng khác với tháng chi theo nội dung ghi trong dòng. Chi phí của một tháng chỉ đủ khi đã có tab của chính tháng đó và của các tháng sau (tiền lương tháng 8 thường trả vào tháng 9).</p>}
      {scopeId && monthRows.length > 0 && <>
        <details className="summary-chart wide revenue-fold" open>
          <summary><h4>Kết quả hoạt động kinh doanh {year}</h4></summary>
          <ReachTable rows={rows} rowKey={(r) => r.label} columns={pnlCols} sortable={false} compact rowClass={(r) => (r.kind === "total" ? "report-total" : r.kind === "section" ? "report-section" : undefined)} />
        </details>
        <details className="summary-chart wide revenue-fold" open>
          <summary><h4>Công suất và doanh thu theo tháng</h4></summary>
          {!HOTEL_ROOMS[scopeId] && <p className="summary-note">Chưa khai số phòng của khách sạn này nên chưa tính công suất.</p>}
          <ReachTable rows={monthRows} rowKey={(r) => r.m} columns={balanceCols} sortable={false} />
        </details>
      </>}
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import { ArrowDownToLine, FileSpreadsheet } from "lucide-react";
import { fmtDate } from "@/lib/format-date";
import { BLUEJAY_HOTELS, addDays } from "@/lib/bluejay-metrics";
import { parseLedgerWorkbook } from "@/lib/bluejay-reconcile";
import type { CheckoutDay, CheckoutRevenue } from "@/lib/bluejay-checkout";
import { financeReport, parseExpenses, summarizeFinance, type ExpenseLine, type FinanceReport, type FinanceSummary } from "@/lib/finance-summary";
import { fnbReport, type FnbReport } from "@/lib/fnb-ledger";
import { monthRange, qlFunds, qlResult, qlWeekly, type FundLine } from "@/lib/ql-report";
import type { DebtRow } from "@/lib/bluejay-debt";
import { ReachTable, type Col } from "@/components/reach-table";

const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
const dm = (date: string) => fmtDate(date).slice(0, 5); // dd/mm
type Sheets = { name: string; rows: unknown[][] }[];
type Loaded = { month: string; days?: CheckoutDay[]; finance?: FinanceReport; hotel?: { summary: FinanceSummary; expenses: ExpenseLine[] }; fnb?: FnbReport; debt?: { bookings: number; balance: number }; notes: string[] };

async function getJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? `Lỗi ${res.status}`);
  return body;
}

/** The management report of one hotel and its F&B for a month: the weekly table, the money in and out of each fund, the month's result. Blue Jay revenue by check-out day, the hotel's ledger, the F&B ledger. A part that cannot be read is left out and said in a note. */
export function BluejayQl({ scopeId }: { scopeId: number | null }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const hotelName = BLUEJAY_HOTELS.find((h) => h.id === scopeId)?.name ?? "";

  async function load() {
    if (!scopeId) return;
    setBusy(true);
    const { from, to } = monthRange(month);
    const [daily, hotel, fnb, debt] = await Promise.allSettled([
      getJson(`/api/bluejay/daily?basis=checkout&from=${from}&to=${to}`),
      getJson(`/api/bluejay/ledger-sheet?hotel=${scopeId}&month=${month}`),
      getJson(`/api/bluejay/ledger-sheet?hotel=${scopeId}&month=${month}&kind=fnb`),
      getJson("/api/bluejay/debt"),
    ]);
    const out: Loaded = { month, notes: [] };
    const why = (r: PromiseRejectedResult) => (r.reason instanceof Error ? r.reason.message : String(r.reason));
    if (daily.status === "fulfilled") {
      const data = daily.value as CheckoutRevenue;
      out.days = data.hotels.find((h) => h.id === scopeId)?.days ?? [];
      if (data.missingWeeks.length) out.notes.push(`Blue Jay chưa lưu tuần bắt đầu ${data.missingWeeks.map(dm).join(", ")}: doanh thu các tuần đó thiếu.`);
      if (data.reliableThrough && to > data.reliableThrough) out.notes.push(`Từ ${dm(addDays(data.reliableThrough, 1))} là tạm tính: khách chưa trả phòng thì chưa có trong dữ liệu đã lưu.`);
    } else out.notes.push(`Doanh thu Blue Jay: ${why(daily)}`);
    if (hotel.status === "fulfilled") {
      try {
        const sheets = hotel.value.sheets as Sheets;
        const ledger = parseLedgerWorkbook(sheets);
        const expenses = sheets.flatMap((s) => { try { return [parseExpenses(s.rows)]; } catch { return []; } })[0] ?? [];
        out.finance = financeReport(ledger.entries, expenses, { from, to });
        out.hotel = { summary: summarizeFinance(ledger.entries, expenses, { from, to }), expenses };
      } catch (e) { out.notes.push(`Bảng kê khách sạn: ${e instanceof Error ? e.message : String(e)}`); }
    } else out.notes.push(`Bảng kê khách sạn: ${why(hotel)}`);
    if (fnb.status === "fulfilled") {
      try { out.fnb = fnbReport(fnb.value.sheets as Sheets, month); out.notes.push(...out.fnb.warnings); } catch (e) { out.notes.push(`Ăn sáng, cafe, mini mart: ${e instanceof Error ? e.message : String(e)}`); }
    } else out.notes.push(`Ăn sáng, cafe, mini mart: ${why(fnb)}`);
    if (debt.status === "fulfilled") {
      const mine = ((debt.value.rows ?? []) as DebtRow[]).filter((r) => r.hotelId === scopeId);
      out.debt = { bookings: mine.length, balance: mine.reduce((t, r) => t + r.balance, 0) };
    } else out.notes.push(`Công nợ OTA: ${why(debt)}`);
    setLoaded(out); setBusy(false);
  }

  const table = useMemo(() => (loaded ? qlWeekly(loaded.month, loaded) : null), [loaded]);
  const funds = useMemo(() => (loaded ? qlFunds({ hotel: loaded.hotel?.summary, fnb: loaded.fnb }) : []), [loaded]);
  const result = useMemo(() => (loaded ? qlResult(loaded.month, loaded) : null), [loaded]);
  type Row = NonNullable<typeof table>["rows"][number] & { i: number }; // i: the same label can come twice (every F&B unit has a "Thu − chi")
  const cols: Col<Row>[] = table ? [
    { label: "Chỉ tiêu", text: (r) => r.label },
    ...table.columns.map((c, i): Col<Row> => ({ label: i < table.columns.length - 1 ? `${c.label} (${dm(c.from)}–${dm(c.to)})` : "Cả tháng", value: (r) => (r.kind === "section" ? null : r.values[i]), text: (r) => (r.kind === "section" ? "" : num(r.values[i])) })),
  ] : [];

  function exportExcel() {
    if (!loaded || !table || !result) return;
    const title = `BÁO CÁO QL · ${hotelName.toUpperCase()} · THÁNG ${loaded.month.slice(5)}/${loaded.month.slice(0, 4)}`;
    void import("@/lib/ql-excel").then((m) => m.downloadQlWorkbook(`bao-cao-ql-${hotelName.replace(/\s+/g, "-")}-${loaded.month}.xlsx`, m.qlWorkbook(title, table, funds, result, loaded.debt, loaded.notes)));
  }

  const fundCols: Col<FundLine>[] = [
    { label: "Quỹ", text: (l) => l.label },
    { label: "Thu vào", value: (l) => l.in, text: (l) => num(l.in) },
    { label: "Chi ra", value: (l) => l.out, text: (l) => num(l.out) },
    { label: "Biến động", value: (l) => l.net, text: (l) => (l.net < 0 ? "−" : l.net > 0 ? "+" : "") + num(Math.abs(l.net)) },
  ];
  type ResultRow = NonNullable<typeof result>["rows"][number] & { i: number };
  const resultCols: Col<ResultRow>[] = result ? [
    { label: "Chỉ tiêu", text: (r) => r.label },
    ...result.columns.map((label, i): Col<ResultRow> => ({ label, value: (r) => r.values[i], text: (r) => (r.values[i] < 0 ? "−" : "") + num(Math.abs(r.values[i])) })),
  ] : [];

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Báo cáo QL · {hotelName || "chưa chọn khách sạn"}</h1>
          <p>Mỗi cột là một tuần (thứ Hai đến Chủ nhật, cắt theo tháng). Doanh thu khách sạn tính theo ngày trả phòng từ Blue Jay, cùng cách với kế toán; tiền thu, chi lấy từ bảng kê Google Sheet; Ăn sáng, cafe, mini mart lấy từ sheet của chi nhánh. Nâng hạng phòng đang nằm trong tiền dịch vụ.</p>
        </div>
        <div className="summary-controls">
          <input type="month" aria-label="Tháng" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} disabled={!scopeId} />
          <button type="button" disabled={!scopeId || busy} onClick={() => void load()}><FileSpreadsheet size={15} />{busy ? "Đang lấy số liệu…" : "Lấy số liệu"}</button>
          {loaded && table && result && <button type="button" onClick={exportExcel}><ArrowDownToLine size={15} />Xuất Excel</button>}
        </div>
      </div>
      {!scopeId && <div className="alert alert-error" role="alert"><span>Chọn một khách sạn ở ô “Khách sạn đang xem” trên thanh trên. Báo cáo QL theo từng chi nhánh.</span></div>}
      {scopeId && !loaded && <p className="summary-note">Chưa có dữ liệu. Chọn tháng rồi bấm “Lấy số liệu”.</p>}
      {loaded && table && <>
        {loaded.notes.map((n) => <p className="summary-note bad" role="alert" key={n}>{n}</p>)}
        <details className="summary-chart wide revenue-fold" open>
          <summary><h4>Theo tuần</h4></summary>
          <ReachTable rows={table.rows.map((r, i) => ({ ...r, i }))} rowKey={(r) => String(r.i)} columns={cols} sortable={false} compact rowClass={(r) => (r.kind === "total" ? "report-total" : r.kind === "section" ? "report-section" : undefined)} />
        </details>
        <details className="summary-chart wide revenue-fold" open>
          <summary><h4>Dòng tiền trong tháng</h4></summary>
          <p className="summary-note">Tiền vào và ra của từng quỹ theo bảng kê (gồm rút tiền, chuyển giữa các quỹ). Số dư đầu kỳ, cuối kỳ nhập tay trong sheet nên chưa có ở đây. Thẻ POS cafe tính vào ngân hàng.</p>
          {funds.length === 0 ? <p className="summary-note">Chưa đọc được bảng kê nào.</p> : <ReachTable rows={funds} rowKey={(l) => l.label} columns={fundCols} sortable={false} compact rowClass={(l) => (l.total ? "report-total" : undefined)} />}
          {loaded.debt && <div className="summary-kpis"><div className="summary-kpi"><span>OTA chưa thanh toán</span><strong>{num(loaded.debt.balance)}</strong><small>{loaded.debt.bookings} đặt phòng OTA đã trả phòng còn nợ, tính đến hôm nay (không phụ thuộc tháng chọn)</small></div></div>}
        </details>
        {result && <details className="summary-chart wide revenue-fold" open>
          <summary><h4>Kết quả hoạt động kinh doanh trong tháng</h4></summary>
          <p className="summary-note">Doanh thu khách sạn theo ngày trả phòng, gồm M-Standard / Unassigned; Ăn sáng, cafe, mini mart là thu bán hàng. Chi phí theo ngày chi trong tháng (khác trang Kết quả HĐKD, nơi dòng ghi “lương tháng 7” được tính vào tháng 7), xếp nhóm như báo cáo tuần của kế toán.{!loaded.hotel && " Chưa đọc được bảng kê khách sạn nên chi phí và giảm trừ của khách sạn tính 0."}</p>
          <ReachTable rows={result.rows.map((r, i) => ({ ...r, i }))} rowKey={(r) => String(r.i)} columns={resultCols} sortable={false} compact rowClass={(r) => (r.kind === "total" ? "report-total" : r.kind === "section" ? "report-section" : undefined)} />
        </details>}
      </>}
    </section>
  );
}

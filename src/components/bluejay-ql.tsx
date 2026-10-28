"use client";

import { useMemo, useState } from "react";
import { ArrowDownToLine, FileSpreadsheet } from "lucide-react";
import { fmtDate } from "@/lib/format-date";
import { BLUEJAY_HOTELS, addDays } from "@/lib/bluejay-metrics";
import { parseLedgerWorkbook, type LedgerEntry } from "@/lib/bluejay-reconcile";
import type { CheckoutDay, CheckoutRevenue } from "@/lib/bluejay-checkout";
import { financeReport, ledgerBalances, parseExpenses, summarizeFinance, type Balances, type ExpenseLine, type FinanceReport, type FinanceSummary } from "@/lib/finance-summary";
import { fnbReport, type FnbReport } from "@/lib/fnb-ledger";
import { parseOutsideServices, type OutsideLine, type OutsideService } from "@/lib/outside-services";
import { parseInventorySheet, stockReport, type StockReport } from "@/lib/inventory";
import type { ChannelCounts, ChannelWeek } from "@/lib/ql-channels";
import { monthRange, partyTotals, qlBooks, qlFunds, qlParties, qlResult, qlWeekly, type Book, type FundLine, type Party } from "@/lib/ql-report";
import type { DebtRow } from "@/lib/bluejay-debt";
import { ReachTable, type Col } from "@/components/reach-table";

const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
const dm = (date: string) => fmtDate(date).slice(0, 5); // dd/mm
type Sheets = { name: string; rows: unknown[][] }[];
type Loaded = { month: string; days?: CheckoutDay[]; finance?: FinanceReport; hotel?: { summary: FinanceSummary; entries: LedgerEntry[]; expenses: ExpenseLine[]; balances: Balances }; fnb?: FnbReport; debt?: { bookings: number; balance: number }; outside?: ReturnType<typeof parseOutsideServices> | null; stocks?: { name: string; fnb: boolean; report: StockReport }[]; channels?: ChannelCounts; notes: string[] };
type StockSheets = { name: string; rows: unknown[][]; red?: [number, number][] }[];

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
    const [daily, hotel, fnb, debt, hotelStock, fnbStock, channels] = await Promise.allSettled([
      getJson(`/api/bluejay/daily?basis=checkout&from=${from}&to=${to}`),
      getJson(`/api/bluejay/ledger-sheet?hotel=${scopeId}&month=${month}`),
      getJson(`/api/bluejay/ledger-sheet?hotel=${scopeId}&month=${month}&kind=fnb`),
      getJson("/api/bluejay/debt"),
      getJson(`/api/bluejay/stock?hotel=${scopeId}&month=${month}`),
      getJson(`/api/bluejay/stock?hotel=${scopeId}&month=${month}&kind=fnb`),
      getJson(`/api/bluejay/channels?hotel=${scopeId}&month=${month}`),
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
        const own = ledger.month ? ledger.month === month : ledger.entries.some((e) => e.date >= from && e.date <= to);
        if (!own) throw new Error(ledger.month ? `file là của tháng ${ledger.month.slice(5)}/${ledger.month.slice(0, 4)}, không phải ${month.slice(5)}/${month.slice(0, 4)}: thu chi, chi phí, sổ quỹ, dịch vụ ngoài của khách sạn bỏ qua. Đổi link khách sạn ở Cài đặt sang file của tháng này.` : `file không có dòng nào trong tháng ${month.slice(5)}/${month.slice(0, 4)}: bỏ qua.`);
        const expenses = sheets.flatMap((s) => { try { return [parseExpenses(s.rows)]; } catch { return []; } })[0] ?? [];
        out.finance = financeReport(ledger.entries, expenses, { from, to });
        out.outside = sheets.flatMap((x) => { try { return [parseOutsideServices(x.rows)]; } catch { return []; } })[0] ?? null;
        out.hotel = { summary: summarizeFinance(ledger.entries, expenses, { from, to }), entries: ledger.entries, expenses, balances: ledgerBalances(sheets) };
      } catch (e) { out.notes.push(`Bảng kê khách sạn: ${e instanceof Error ? e.message : String(e)}`); }
    } else out.notes.push(`Bảng kê khách sạn: ${why(hotel)}`);
    if (fnb.status === "fulfilled") {
      try { out.fnb = fnbReport(fnb.value.sheets as Sheets, month); out.notes.push(...out.fnb.warnings); } catch (e) { out.notes.push(`Ăn sáng, cafe, mini mart: ${e instanceof Error ? e.message : String(e)}`); }
    } else out.notes.push(`Ăn sáng, cafe, mini mart: ${why(fnb)}`);
    if (debt.status === "fulfilled") {
      const mine = ((debt.value.rows ?? []) as DebtRow[]).filter((r) => r.hotelId === scopeId);
      out.debt = { bookings: mine.length, balance: mine.reduce((t, r) => t + r.balance, 0) };
    } else out.notes.push(`Công nợ OTA: ${why(debt)}`);
    const stocksOf = (sheets: StockSheets, fnb: boolean) => sheets.flatMap((x) => {
      const inv = parseInventorySheet(x.rows, new Set((x.red ?? []).map(([r, c]) => `${r},${c}`)));
      if (inv.month && inv.month !== month) { out.notes.push(`Kho ${x.name} là của tháng ${inv.month.slice(5)}/${inv.month.slice(0, 4)}, không phải ${month.slice(5)}/${month.slice(0, 4)}: bỏ qua.`); return []; }
      const report = stockReport(inv, { from, to });
      return report.lines.length > 0 ? [{ name: x.name, fnb, report }] : [];
    });
    out.stocks = [];
    if (hotelStock.status === "fulfilled") out.stocks.push(...stocksOf(hotelStock.value.sheets as StockSheets, false)); else out.notes.push(`Kho khách sạn: ${why(hotelStock)}`);
    if (fnbStock.status === "fulfilled") out.stocks.push(...stocksOf(fnbStock.value.sheets as StockSheets, true)); else out.notes.push(`Kho Ăn sáng, cafe, mini mart: ${why(fnbStock)}`);
    if (channels.status === "fulfilled") out.channels = channels.value as ChannelCounts; else out.notes.push(`OTA-OTP: ${why(channels)}`);
    setLoaded(out); setBusy(false);
  }

  const table = useMemo(() => (loaded ? qlWeekly(loaded.month, loaded) : null), [loaded]);
  const funds = useMemo(() => (loaded ? qlFunds({ hotel: loaded.hotel?.summary, balances: loaded.hotel?.balances, fnb: loaded.fnb }) : []), [loaded]);
  const result = useMemo(() => (loaded ? qlResult(loaded.month, loaded) : null), [loaded]);
  const parties = useMemo(() => (loaded && (loaded.hotel || loaded.fnb) ? qlParties(loaded.month, { hotel: loaded.hotel, fnb: loaded.fnb }) : []), [loaded]);
  const books = useMemo(() => (loaded && (loaded.hotel || loaded.fnb) ? qlBooks(loaded.month, { hotel: loaded.hotel && { summary: loaded.hotel.summary, balances: loaded.hotel.balances }, fnb: loaded.fnb }) : null), [loaded]);
  type Row = NonNullable<typeof table>["rows"][number] & { i: number }; // i: the same label can come twice (every F&B unit has a "Thu − chi")
  const cols: Col<Row>[] = table ? [
    { label: "Chỉ tiêu", text: (r) => r.label },
    ...table.columns.map((c, i): Col<Row> => ({ label: i < table.columns.length - 1 ? `${c.label} (${dm(c.from)}–${dm(c.to)})` : "Cả tháng", value: (r) => (r.kind === "section" ? null : r.values[i]), text: (r) => (r.kind === "section" ? "" : num(r.values[i])) })),
  ] : [];

  function exportExcel() {
    if (!loaded || !table || !result) return;
    const title = `BÁO CÁO QUẢN LÝ · ${hotelName.toUpperCase()} · THÁNG ${loaded.month.slice(5)}/${loaded.month.slice(0, 4)}`;
    void import("@/lib/ql-excel").then((m) => m.downloadQlWorkbook(`bao-cao-quan-ly-${hotelName.replace(/\s+/g, "-")}-${loaded.month}.xlsx`, m.qlWorkbook(title, table, funds, result, loaded.debt, loaded.notes, { books: books ?? undefined, outside: loaded.outside, stocks: loaded.stocks, channels: loaded.channels, parties })));
  }

  const fundCols: Col<FundLine>[] = [
    { label: "Quỹ", text: (l) => l.label },
    { label: "Dư đầu kỳ", value: (l) => l.open, text: (l) => (l.open === null ? "–" : num(l.open)) },
    { label: "Thu vào", value: (l) => l.in, text: (l) => num(l.in) },
    { label: "Chi ra", value: (l) => l.out, text: (l) => num(l.out) },
    { label: "Biến động", value: (l) => l.net, text: (l) => (l.net < 0 ? "−" : l.net > 0 ? "+" : "") + num(Math.abs(l.net)) },
    { label: "Dư cuối kỳ", value: (l) => l.close, text: (l) => (l.close === null ? "–" : num(l.close)) },
  ];
  const money = <T,>(label: string, f: (r: T) => number): Col<T> => ({ label, value: f, text: (r) => num(f(r)), total: true });
  const outsideSumCols: Col<OutsideService>[] = [{ label: "Dịch vụ", text: (r) => r.name }, money("Số đơn", (r) => r.count), money("Giá DV thuê", (r) => r.cost), money("Giá bán DV", (r) => r.price), money("Lợi nhuận", (r) => r.profit), money("Chiết khấu 20%", (r) => r.discount)];
  const outsideCols: Col<OutsideLine>[] = [{ label: "Ngày đặt", text: (r) => fmtDate(r.date), sort: (r) => r.date }, { label: "ID phòng", text: (r) => r.room }, { label: "Dịch vụ", text: (r) => r.service }, { label: "Diễn giải", text: (r) => r.note }, money("Giá DV thuê", (r) => r.cost), money("Giá bán DV", (r) => r.price), money("Lợi nhuận", (r) => r.profit), money("Chiết khấu 20%", (r) => r.discount)];
  const channelCols = (keys: string[], first: string): Col<ChannelWeek>[] => [
    { label: first, text: (w) => (w.label === "Cả kỳ" ? "Cả tháng" : `${w.label} (${dm(w.from)}–${dm(w.to)})`) },
    ...keys.flatMap((k): Col<ChannelWeek>[] => [
      { label: `${k} · book`, value: (w) => w.counts[k]?.book ?? 0, text: (w) => (w.counts[k]?.book ? String(w.counts[k].book) : "") },
      { label: `${k} · hủy`, value: (w) => w.counts[k]?.cancel ?? 0, text: (w) => (w.counts[k]?.cancel ? String(w.counts[k].cancel) : "") },
    ]),
  ];
  const partyCols: Col<Party>[] = [
    { label: "Bên", text: (p) => p.label },
    ...([["Thu tiền mặt", "thu", "cash"], ["Thu ngân hàng", "thu", "bank"], ["Thu thẻ visa", "thu", "card"], ["Tổng thu", "thu", "all"], ["Chi tiền mặt", "chi", "cash"], ["Chi ngân hàng", "chi", "bank"], ["Chi visa", "chi", "card"], ["Tổng chi", "chi", "all"]] as const).map(([label, side, k]): Col<Party> => money(label, (p) => partyTotals(p[side])[k])),
    money("Thu − chi", (p) => partyTotals(p.thu).all - partyTotals(p.chi).all),
    money("Dòng thu", (p) => p.thu.length), money("Dòng chi", (p) => p.chi.length),
  ];
  type StockRow = NonNullable<Loaded["stocks"]>[number];
  const stockCols: Col<StockRow>[] = [{ label: "Kho", text: (k) => `${k.fnb ? "Ăn sáng, cafe, mini mart · " : ""}${k.name}` }, money("Số mặt hàng", (k) => k.report.lines.length), money("Tồn đầu", (k) => k.report.totals.openValue), money("Mua vào", (k) => k.report.totals.receiptValue), money("Xuất", (k) => k.report.totals.issueValue), money("Tồn cuối", (k) => k.report.totals.closingValue), money("Chênh kiểm kê", (k) => k.report.totals.countDiffValue)];
  type BookLine = { key: string; date: string; open: number; values: number[]; close: number; total?: boolean };
  const bookLines = (b: Book): BookLine[] => [{ key: "total", date: "", open: b.opening, values: b.total.values, close: b.total.close, total: true }, ...b.rows.map((r) => ({ key: r.date, ...r }))];
  const bookCols = (b: Book): Col<BookLine>[] => [
    { label: "Ngày", text: (l) => (l.total ? "TỔNG" : fmtDate(l.date)) },
    { label: "Số dư đầu kỳ", value: (l) => l.open, text: (l) => num(l.open) },
    ...b.cols.map((c, i): Col<BookLine> => ({ label: c.memo ? `${c.label} (tài khoản riêng)` : c.label, value: (l) => l.values[i], text: (l) => (l.values[i] ? num(l.values[i]) : "") })),
    { label: "Số dư cuối kỳ", value: (l) => l.close, text: (l) => num(l.close) },
  ];
  const bookTable = (title: string, book: Book, openNote: string) => <details key={title} className="summary-chart wide revenue-fold">
    <summary><h4>{title}</h4></summary>
    <p className="summary-note">{openNote}{book.sheetClose !== null && <> Số dư cuối kỳ ghi trong sheet: <strong>{num(book.sheetClose)}</strong>, chênh {num(book.total.close - book.sheetClose)}.</>}</p>
    <ReachTable rows={bookLines(book)} rowKey={(l) => l.key} columns={bookCols(book)} sortable={false} compact rowClass={(l) => (l.total ? "report-total" : undefined)} />
  </details>;
  type ResultRow = NonNullable<typeof result>["rows"][number] & { i: number };
  const resultCols: Col<ResultRow>[] = result ? [
    { label: "STT", text: (r) => r.stt ?? "" },
    { label: "Chỉ tiêu", text: (r) => r.label },
    { label: "Mã số", text: (r) => r.code ?? "" },
    ...result.columns.map((label, i): Col<ResultRow> => ({ label, value: (r) => r.values[i], text: (r) => (r.values[i] < 0 ? "−" : "") + num(Math.abs(r.values[i])) })),
    { label: "Ghi chú", text: (r) => r.note ?? "" },
  ] : [];

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Báo cáo quản lý · {hotelName || "chưa chọn khách sạn"}</h1>
          <p>Mỗi cột là một tuần (thứ Hai đến Chủ nhật, cắt theo tháng). Doanh thu khách sạn tính theo ngày trả phòng từ Blue Jay, cùng cách với kế toán; tiền thu, chi lấy từ bảng kê Google Sheet; Ăn sáng, cafe, mini mart lấy từ sheet của chi nhánh. Nâng hạng phòng đang nằm trong tiền dịch vụ.</p>
        </div>
        <div className="summary-controls">
          <input type="month" aria-label="Tháng" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} disabled={!scopeId} />
          <button type="button" disabled={!scopeId || busy} onClick={() => void load()}><FileSpreadsheet size={15} />{busy ? "Đang lấy số liệu…" : "Lấy số liệu"}</button>
          {loaded && table && result && <button type="button" onClick={exportExcel}><ArrowDownToLine size={15} />Xuất Excel</button>}
        </div>
      </div>
      {!scopeId && <div className="alert alert-error" role="alert"><span>Chọn một khách sạn ở ô “Khách sạn đang xem” trên thanh trên. Báo cáo quản lý theo từng chi nhánh.</span></div>}
      {scopeId && !loaded && <p className="summary-note">Chưa có dữ liệu. Chọn tháng rồi bấm “Lấy số liệu”.</p>}
      {loaded && table && <>
        {loaded.notes.map((n) => <p className="summary-note bad" role="alert" key={n}>{n}</p>)}
        <details className="summary-chart wide revenue-fold" open>
          <summary><h4>Theo tuần</h4></summary>
          <ReachTable rows={table.rows.map((r, i) => ({ ...r, i }))} rowKey={(r) => String(r.i)} columns={cols} sortable={false} compact rowClass={(r) => (r.kind === "total" ? "report-total" : r.kind === "section" ? "report-section" : undefined)} />
        </details>
        <details className="summary-chart wide revenue-fold" open>
          <summary><h4>Dòng tiền trong tháng</h4></summary>
          <p className="summary-note">Tiền vào và ra của từng quỹ theo bảng kê (gồm rút tiền, chuyển giữa các quỹ). Dư đầu kỳ là số nhập ở đầu bảng kê thu (để trống nếu bảng kê không có), dư cuối kỳ = dư đầu kỳ + biến động; dòng tổng coi dư đầu kỳ còn thiếu là 0. Thẻ POS cafe tính vào ngân hàng.</p>
          {funds.length === 0 ? <p className="summary-note">Chưa đọc được bảng kê nào.</p> : <ReachTable rows={funds} rowKey={(l) => l.label} columns={fundCols} sortable={false} compact rowClass={(l) => (l.total ? "report-total" : undefined)} />}
          {loaded.debt && <div className="summary-kpis"><div className="summary-kpi"><span>OTA chưa thanh toán</span><strong>{num(loaded.debt.balance)}</strong><small>{loaded.debt.bookings} đặt phòng OTA đã trả phòng còn nợ, tính đến hôm nay (không phụ thuộc tháng chọn)</small></div></div>}
        </details>
        {parties.length > 0 && <details className="summary-chart wide revenue-fold" open>
          <summary><h4>Thu chi các bên <small>để đối chiếu với file kế toán</small></h4></summary>
          <p className="summary-note">Tiền thu và chi của khách sạn, Ăn sáng cafe và mini mart trong tháng, cùng số với bảng “Dòng tiền” (khách sạn: tiền khách trả − cọc đã nhận trước + cọc chưa ở; Ăn sáng, cafe, mini mart: bán hàng + thu khác, POS tính vào ngân hàng). Từng dòng thu, chi của mỗi bên có trong file Excel (sheet “Thu chi các bên”).</p>
          <ReachTable rows={parties} rowKey={(p) => p.label} columns={partyCols} sortable={false} compact />
        </details>}
        {books && books.cash.cols.length > 0 && bookTable("Sổ quỹ tiền mặt (TK TM)", books.cash, `Số dư đầu kỳ ${num(books.cash.opening)}${books.cash.opening ? " (nhập ở đầu bảng kê thu)" : ": chưa thấy ô “Đầu kỳ tiền mặt” ở đầu bảng kê nên tính từ 0"}. Thu khách sạn gồm cọc của khách chưa ở. Khách sạn, Ăn sáng cafe và mini mart chung một quỹ.`)}
        {books && books.bank.cols.length > 0 && bookTable("Sổ tiền gửi ngân hàng (TK TG NH)", books.bank, `Số dư đầu kỳ ${num(books.bank.opening)}${books.bank.opening ? " (nhập ở đầu bảng kê thu)" : ": chưa thấy ô “Đầu kỳ ngân hàng” ở đầu bảng kê nên tính từ 0"}. Chỉ tài khoản khách sạn vào số dư; tài khoản Ăn sáng cafe, mini mart ghi bên cạnh.`)}
        {loaded.outside && loaded.outside.lines.length > 0 && <details className="summary-chart wide revenue-fold">
          <summary><h4>Dịch vụ ngoài <small>{loaded.outside.lines.length} đơn · lợi nhuận {num(loaded.outside.byService.reduce((t, v) => t + v.profit, 0))}</small></h4></summary>
          <p className="summary-note">Tab “DV NGOÀI” của sheet khách sạn: giá thuê là tiền trả đối tác, giá bán là tiền khách trả, lợi nhuận = bán − thuê. Chi tiết từng đơn có trong file Excel.</p>
          <ReachTable rows={loaded.outside.byService} rowKey={(r) => r.name} columns={outsideSumCols} compact />
          <ReachTable rows={loaded.outside.lines} rowKey={(r) => String(r.row)} columns={outsideCols} compact />
        </details>}
        {loaded.channels && <details className="summary-chart wide revenue-fold">
          <summary><h4>Đặt phòng và hủy theo kênh (OTA, OTP)</h4></summary>
          <p className="summary-note">Mỗi tuần tính theo <strong>ngày đặt</strong>. Book là đặt phòng còn hiệu lực, hủy là đặt phòng của tuần đó nay đã hủy hoặc no-show (Blue Jay không có ngày hủy). Các tuần gần đây có thể thiếu vì Blue Jay chỉ lưu đặt phòng theo tuần trả phòng. Chưa có “liên lạc” (khách nhắn Zalo, Facebook, gọi điện) vì Blue Jay không ghi.</p>
          <ReachTable rows={loaded.channels.weeks} rowKey={(w) => w.label + w.from} columns={channelCols(loaded.channels.ota, "I - OTA")} sortable={false} compact rowClass={(w) => (w.label === "Cả kỳ" ? "report-total" : undefined)} />
          <ReachTable rows={loaded.channels.weeks} rowKey={(w) => w.label + w.from} columns={channelCols(loaded.channels.otp, "II - OTP")} sortable={false} compact rowClass={(w) => (w.label === "Cả kỳ" ? "report-total" : undefined)} />
        </details>}
        {loaded.stocks && loaded.stocks.length > 0 && <details className="summary-chart wide revenue-fold">
          <summary><h4>Kho <small>{loaded.stocks.length} kho</small></h4></summary>
          <p className="summary-note">Giá trị tồn đầu + mua vào − xuất = tồn cuối theo giá bình quân của kế toán, từng mặt hàng có trong file Excel (mỗi kho một sheet). Chi tiết kiểm kê và đối chiếu Blue Jay xem ở trang Kho.</p>
          <ReachTable rows={loaded.stocks} rowKey={(k) => `${k.fnb}-${k.name}`} columns={stockCols} sortable={false} compact />
        </details>}
        {result && <details className="summary-chart wide revenue-fold" open>
          <summary><h4>Bảng kết quả hoạt động kinh doanh tháng {loaded.month.slice(5)}/{loaded.month.slice(0, 4)}</h4></summary>
          <p className="summary-note">Doanh thu khách sạn theo ngày trả phòng, gồm M-Standard / Unassigned; Ăn sáng, cafe, mini mart là thu bán hàng. Chi phí theo ngày chi trong tháng (khác trang Kết quả HĐKD, nơi dòng ghi “lương tháng 7” được tính vào tháng 7), xếp nhóm như báo cáo tuần của kế toán.{!loaded.hotel && " Chưa đọc được bảng kê khách sạn nên chi phí và giảm trừ của khách sạn tính 0."}</p>
          <ReachTable rows={result.rows.map((r, i) => ({ ...r, i }))} rowKey={(r) => String(r.i)} columns={resultCols} sortable={false} compact rowClass={(r) => (r.kind === "total" ? "report-total" : r.kind === "section" ? "report-section" : undefined)} />
        </details>}
      </>}
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { ExternalLink, FileDown, FileSpreadsheet } from "lucide-react";
import { fmtDate } from "@/lib/format-date";
import { BLUEJAY_HOTELS } from "@/lib/bluejay-metrics";
import { useSheetUrl } from "@/components/use-sheet-url";
import { ledgerWarnings, parseLedgerWorkbook, type Ledger } from "@/lib/bluejay-reconcile";
import { financeReport, parseExpenses, summarizeFinance, type ExpenseLine, type ReportRow } from "@/lib/finance-summary";
import { parseOutsideServices } from "@/lib/outside-services";
import { ReachTable, type Col } from "@/components/reach-table";

const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
const signed = (x: number) => (x > 0 ? "+" : x < 0 ? "−" : "") + num(Math.abs(x));
type Sheets = { name: string; rows: unknown[][] }[];

/** The "DV Ngoài" sheet, or null when the sheets have none. */
function findOutside(sheets: Sheets) {
  for (const s of sheets) { try { return { name: s.name, ...parseOutsideServices(s.rows) }; } catch { /* not the outside-services sheet */ } }
  return null;
}

/** The first sheet that reads as an expense ledger, or null: the expense tab may sit in the same Google Sheet or file as the income tab. */
function findExpenses(sheets: Sheets) {
  for (const s of sheets) { try { return { name: s.name, lines: parseExpenses(s.rows) }; } catch { /* not the expense sheet */ } }
  return null;
}
const fromBook = async (file: File): Promise<Sheets> => {
  const book = XLSX.read(await file.arrayBuffer());
  return book.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, defval: "" }) }));
};

/** Income and expense of one hotel for a month, read from its income ledger (Google Sheet or file) and its expense ledger (same sheet, or a file). */
export function BluejayFinance({ scopeId }: { scopeId: number | null }) {
  const [income, setIncome] = useState<(Ledger & { name: string }) | null>(null);
  const [expense, setExpense] = useState<{ name: string; lines: ExpenseLine[] } | null>(null);
  const [outside, setOutside] = useState<ReturnType<typeof findOutside>>(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheetLink, setSheetLink] = useState<{ url: string; gid: number } | null>(null);
  const hotelName = BLUEJAY_HOTELS.find((h) => h.id === scopeId)?.name ?? "";
  const sheetUrl = useSheetUrl(scopeId);

  const report = useMemo(() => (income ? financeReport(income.entries, expense?.lines ?? [], { from: income.from, to: income.to }) : null), [income, expense]);
  const summary = useMemo(() => (income ? summarizeFinance(income.entries, expense?.lines ?? [], { from: income.from, to: income.to }) : null), [income, expense]);

  async function onSheet() {
    if (!scopeId) return;
    setError(""); setNote(""); setBusy(true);
    try {
      const res = await fetch(`/api/bluejay/ledger-sheet?hotel=${scopeId}&month=${month}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? `Lỗi ${res.status}`);
      const parsed = parseLedgerWorkbook(body.sheets);
      setIncome({ ...parsed, name: `Google Sheet · ${parsed.sheet}` });
      setSheetLink(body.sheetUrl ? { url: body.sheetUrl, gid: body.gid ?? 0 } : null);
      setOutside(findOutside(body.sheets));
      const found = findExpenses(body.sheets);
      setExpense(found && { name: `Google Sheet · ${found.name}`, lines: found.lines });
      if (!found) setNote("Google Sheet này chưa có tab bảng kê chi của tháng này. Chọn file bảng kê chi (.xlsx) để xem phần chi.");
    } catch (e) {
      setIncome(null); setExpense(null); setOutside(null);
      setError(e instanceof Error ? e.message : "Không đọc được Google Sheet.");
    } finally { setBusy(false); }
  }

  async function onFile(file: File | undefined, kind: "income" | "expense") {
    if (!file) return;
    setError(""); setNote("");
    try {
      const sheets = await fromBook(file);
      if (kind === "income") {
        const parsed = parseLedgerWorkbook(sheets);
        setIncome({ ...parsed, name: `${file.name} · ${parsed.sheet}` }); setSheetLink(null);
        setOutside(findOutside(sheets));
        const found = findExpenses(sheets);
        if (found) setExpense({ name: `${file.name} · ${found.name}`, lines: found.lines });
      } else {
        const found = findExpenses(sheets);
        if (!found) throw new Error("Không thấy sheet bảng kê chi (cần cột “Hạng mục” và “Nội dung chi”).");
        setExpense({ name: `${file.name} · ${found.name}`, lines: found.lines });
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Không đọc được file Excel."); }
  }

  const s = summary;
  const fundRows = s ? [
    { name: "Tiền mặt", taken: s.income.taken.cash, deposit: s.income.deposit.cash, advance: s.income.advance.cash, paid: s.expense.total.cash, net: s.funds.cash },
    { name: "Chuyển khoản (tài khoản ngân hàng)", taken: s.income.taken.bank, deposit: s.income.deposit.bank, advance: s.income.advance.bank, paid: s.expense.total.bank, net: s.funds.bank },
    { name: "Thẻ (tài khoản thẻ visa)", taken: s.income.taken.card, deposit: s.income.deposit.card, advance: s.income.advance.card, paid: s.expense.total.visa, net: s.funds.card },
  ] : [];
  type FundRow = (typeof fundRows)[number];
  const fundCols: Col<FundRow>[] = [
    { label: "Quỹ", text: (r) => r.name },
    { label: "Thu của khách", value: (r) => r.taken, text: (r) => num(r.taken), total: true },
    { label: "Trừ cọc đã ở", value: (r) => r.deposit, text: (r) => num(r.deposit), total: true },
    { label: "Cọc chưa ở", value: (r) => r.advance, text: (r) => num(r.advance), total: true },
    { label: "Chi", value: (r) => r.paid, text: (r) => num(r.paid), total: true },
    { label: "Biến động quỹ", value: (r) => r.net, text: (r) => signed(r.net), total: true },
  ];
  const dm = (date: string) => fmtDate(date).slice(0, 5); // dd/mm
  const reportCols: Col<ReportRow>[] = report ? [
    { label: "Chỉ tiêu", text: (r) => r.label },
    ...report.columns.map((c, i): Col<ReportRow> => ({ label: i < report.columns.length - 1 ? `${c.label} (${dm(c.from)}–${dm(c.to)})` : c.label, value: (r) => (r.kind === "section" ? null : r.values[i]), text: (r) => (r.kind === "section" ? "" : num(r.values[i])) })),
  ] : [];
  type OutsideSum = NonNullable<typeof outside>["byService"][number];
  type OutsideRow = NonNullable<typeof outside>["lines"][number];
  const money = <T,>(label: string, f: (r: T) => number): Col<T> => ({ label, value: f, text: (r) => num(f(r)), total: true });
  const outsideSumCols: Col<OutsideSum>[] = [{ label: "Dịch vụ", text: (r) => r.name }, money("Số đơn", (r) => r.count), money("Giá DV thuê", (r) => r.cost), money("Giá bán DV", (r) => r.price), money("Lợi nhuận", (r) => r.profit), money("Chiết khấu 20%", (r) => r.discount)];
  const outsideCols: Col<OutsideRow>[] = [{ label: "Ngày đặt", text: (r) => fmtDate(r.date), sort: (r) => r.date }, { label: "ID phòng", text: (r) => r.room }, { label: "Dịch vụ", text: (r) => r.service }, { label: "Diễn giải", text: (r) => r.note }, money("Giá DV thuê", (r) => r.cost), money("Giá bán DV", (r) => r.price), money("Lợi nhuận", (r) => r.profit), money("Chiết khấu 20%", (r) => r.discount)];
  const kindRows = s ? s.expense.byKind.filter((k) => k.total) : [];
  type KindRow = (typeof kindRows)[number];
  const kindCols: Col<KindRow>[] = [
    { label: "Hạng mục", text: (k) => `${k.code} · ${k.name}` },
    { label: "Tiền mặt", value: (k) => k.cash, text: (k) => num(k.cash), total: true },
    { label: "Chuyển khoản", value: (k) => k.bank, text: (k) => num(k.bank), total: true },
    { label: "Thẻ visa", value: (k) => k.visa, text: (k) => num(k.visa), total: true },
    { label: "Tổng", value: (k) => k.total, text: (k) => num(k.total), total: true },
  ];
  const nameTotal = (label: string): Col<{ name: string; total: number }>[] => [{ label, text: (r) => r.name }, { label: "Thu của khách", value: (r) => r.total, text: (r) => num(r.total), total: true }];
  type DayRow = NonNullable<typeof s>["daily"][number];
  const dayCols: Col<DayRow>[] = [
    { label: "Ngày", text: (d) => fmtDate(d.date), sort: (d) => d.date },
    { label: "Thu của khách", value: (d) => d.income, text: (d) => num(d.income), total: true },
    { label: "Chi", value: (d) => d.expense, text: (d) => num(d.expense), total: true },
    { label: "Chênh", value: (d) => d.income - d.expense, text: (d) => signed(d.income - d.expense), total: true },
  ];

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Thu chi · {hotelName || "chưa chọn khách sạn"}</h1>
          <p>Số liệu thu và chi của một tháng, cộng từ bảng kê thu và bảng kê chi đã nhập. Thu là tiền khách sạn đã nhận (gồm cọc của khách đã ở); biến động quỹ tính như sổ quỹ và sổ tiền gửi: không tính cọc đã ở, tính cọc chưa ở.</p>
        </div>
        <div className="summary-controls">
          <input type="month" aria-label="Tháng bảng kê" value={month} onChange={(event) => setMonth(event.target.value)} disabled={!scopeId} />
          <button type="button" disabled={!scopeId || !month || busy} onClick={() => void onSheet()}><FileSpreadsheet size={15} />{busy ? "Đang đọc Google Sheet…" : "Lấy từ Google Sheet"}</button>
          <label className="button button-outline" aria-disabled={!scopeId}>
            <FileSpreadsheet size={15} />Chọn file bảng kê thu (.xlsx)
            <input type="file" accept=".xlsx,.xls" hidden disabled={!scopeId} onChange={(event) => { void onFile(event.target.files?.[0], "income"); event.target.value = ""; }} />
          </label>
          <label className="button button-outline" aria-disabled={!scopeId}>
            <FileSpreadsheet size={15} />{expense ? "Chọn file chi khác" : "Chọn file bảng kê chi (.xlsx)"}
            <input type="file" accept=".xlsx,.xls" hidden disabled={!scopeId} onChange={(event) => { void onFile(event.target.files?.[0], "expense"); event.target.value = ""; }} />
          </label>
          {sheetUrl && <a className="button button-outline" href={sheetLink ? `${sheetLink.url}#gid=${sheetLink.gid}` : sheetUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />Mở Google Sheet</a>}
          <button type="button" onClick={() => void import("@/lib/bluejay-expense-template").then((m) => m.downloadExpenseTemplate())}><FileDown size={15} />Tải file mẫu chi</button>
        </div>
      </div>

      {!scopeId && <div className="alert alert-error" role="alert"><span>Chọn một khách sạn ở ô “Khách sạn đang xem” trên thanh trên. Mỗi bảng kê chỉ thuộc một khách sạn.</span></div>}
      {error && <div className="alert alert-error" role="alert"><span>{error}</span></div>}
      {note && <p className="summary-note bad" role="alert">{note}</p>}
      {scopeId && !income && !error && <p className="summary-note">Chưa có dữ liệu. Chọn tháng rồi bấm “Lấy từ Google Sheet”, hoặc chọn file bảng kê thu.</p>}

      {income && s && <>
        <p className="summary-note">Thu: <strong>{income.name}</strong> · {income.entries.length} dòng · kỳ {fmtDate(income.from)} – {fmtDate(income.to)}. Chi: {expense ? <><strong>{expense.name}</strong> · {expense.lines.length} dòng</> : "chưa có"}.</p>
        {ledgerWarnings(income, hotelName).map((w) => <p className="summary-note bad" role="alert" key={w}>{w}</p>)}
        {(s.outside.expenseLines > 0 || s.outside.incomeLines > 0) && <p className="summary-note bad" role="alert">Kỳ tính theo bảng kê thu ({fmtDate(income.from)} – {fmtDate(income.to)}). {s.outside.expenseLines > 0 && `${s.outside.expenseLines} dòng chi nằm ngoài kỳ này (tổng ${num(s.outside.expenseAmount)}) không được tính vào các bảng dưới đây. `}{s.outside.incomeLines > 0 && `${s.outside.incomeLines} dòng thu nằm ngoài kỳ.`}</p>}
        {Math.abs(s.income.commission - s.expense.commission) > 1 && expense && <p className="summary-note bad" role="alert">Hoa hồng nền tảng không khớp giữa hai bảng kê: bảng thu {num(s.income.commission)}, bảng chi {num(s.expense.commission)} (lệch {signed(s.income.commission - s.expense.commission)}). Kiểm tra dòng hoa hồng đã nhập đủ ở cả hai bảng chưa.</p>}
        {s.expense.unlisted.length > 0 && <p className="summary-note bad" role="alert">{s.expense.unlisted.length} dòng chi có hạng mục không có trong danh mục (tổng {num(s.expense.unlisted.reduce((x, u) => x + u.amount, 0))}, đã tính vào tổng chi nhưng không vào bảng hạng mục): {s.expense.unlisted.slice(0, 8).map((u) => `dòng ${u.row} “${u.kind || "trống"}”`).join(", ")}.</p>}

        <div className="summary-kpis">
          <div className="summary-kpi"><span>Thu của khách</span><strong>{num(s.income.taken.total - s.income.transfer)}</strong><small>Cọc đã ở + tiền mặt + chuyển khoản + quẹt thẻ (gồm dòng không có ID), không tính điều chuyển giữa quỹ ({num(s.income.transfer)})</small></div>
          <div className="summary-kpi"><span>Chi</span><strong>{num(s.expense.total.all - s.expense.transfer)}</strong><small>Tiền mặt + chuyển khoản + thẻ visa, không tính điều chuyển tiền ({num(s.expense.transfer)})</small></div>
          <div className="summary-kpi"><span>Thu − chi</span><strong>{signed(s.income.taken.total - s.income.transfer - (s.expense.total.all - s.expense.transfer))}</strong><small>Chưa gồm cọc chưa ở, hoàn tiền, rút tiền</small></div>
          <div className="summary-kpi"><span>Giảm trừ doanh thu</span><strong>{num(s.income.commission + s.income.otherDeduction)}</strong><small>Hoa hồng {num(s.income.commission)} · khác {num(s.income.otherDeduction)} (không ra tiền)</small></div>
          <div className="summary-kpi"><span>Cọc chưa ở</span><strong>{num(s.income.advance.total)}</strong><small>Cọc của khách chưa nhận phòng</small></div>
          <div className="summary-kpi"><span>POS cafe</span><strong>{num(s.income.pos)}</strong><small>Chưa tính vào quỹ nào</small></div>
        </div>

        {report && <details className="summary-chart wide revenue-fold" open>
          <summary><h4>Báo cáo thu chi theo tuần</h4></summary>
          <p className="summary-note">Mỗi cột là một tuần (thứ Hai đến Chủ nhật, cắt theo kỳ của bảng kê), cột cuối là cả kỳ. <strong>Khối 1 là tiền thu theo dịch vụ vào đúng ngày nhận tiền, không phải doanh thu kế toán tính theo ngày ở</strong>: OTA trả gộp nhiều đêm trong một tuần thì cả khoản hiện ở tuần đó, nên tuần thu cao thấp thất thường so với báo cáo kế toán (cả kỳ cũng không bằng nhau). Phí quẹt thẻ, hoa hồng đã trừ ở dòng giảm trừ. Khối 2 là tiền mới vào quỹ: không gồm cọc của khách đã ở (nhận từ trước). Khối 3 chia nhóm chi theo cách báo cáo tuần của kế toán (hoàn tiền khách thuộc “dịch vụ ngoài & nộp thuế”), không gồm tiền chuyển giữa các quỹ.</p>
          <ReachTable rows={report.rows} rowKey={(r) => r.label} columns={reportCols} sortable={false} compact rowClass={(r) => (r.kind === "total" ? "report-total" : r.kind === "section" ? "report-section" : undefined)} />
        </details>}
        <details className="summary-chart wide revenue-fold">
          <summary><h4>Thu chi theo quỹ</h4></summary>
          <p className="summary-note">Biến động quỹ = thu của khách − cọc đã ở + cọc chưa ở − chi. Bảng này gồm cả điều chuyển giữa các quỹ (rút tiền, luân chuyển). Chưa có số dư đầu kỳ và thu chi minimart.</p>
          <ReachTable rows={fundRows} rowKey={(r) => r.name} columns={fundCols} />
        </details>
        <details className="summary-chart wide revenue-fold" open>
          <summary><h4>Chi theo hạng mục</h4></summary>
          {kindRows.length === 0 ? <p className="summary-note">Chưa có khoản chi.</p> : <ReachTable rows={kindRows} rowKey={(k) => k.code} columns={kindCols} groupOf={(k) => k.group} />}
        </details>
        {outside && <details className="summary-chart wide revenue-fold" open>
          <summary><h4>Dịch vụ ngoài <small>{outside.lines.length} đơn · lợi nhuận {num(outside.byService.reduce((x, v) => x + v.profit, 0))}</small></h4></summary>
          <p className="summary-note">Lấy từ tab “{outside.name}”: giá thuê là tiền trả đối tác, giá bán là tiền khách trả, lợi nhuận = bán − thuê.</p>
          <ReachTable rows={outside.byService} rowKey={(r) => r.name} columns={outsideSumCols} />
          <ReachTable rows={outside.lines} rowKey={(r) => String(r.row)} columns={outsideCols} compact />
        </details>}
        <details className="summary-chart wide revenue-fold">
          <summary><h4>Thu theo dịch vụ</h4></summary>
          <ReachTable rows={s.income.byService} rowKey={(r) => r.name} columns={nameTotal("Dịch vụ")} />
        </details>
        <details className="summary-chart wide revenue-fold">
          <summary><h4>Thu theo nền tảng</h4></summary>
          <ReachTable rows={s.income.byPlatform} rowKey={(r) => r.name} columns={nameTotal("Nền tảng")} />
        </details>
        <details className="summary-chart wide revenue-fold">
          <summary><h4>Thu chi theo ngày</h4></summary>
          <ReachTable rows={s.daily} rowKey={(d) => d.date} columns={dayCols} />
        </details>
      </>}
    </section>
  );
}

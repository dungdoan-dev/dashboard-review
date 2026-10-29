"use client";

import { useMemo, useState } from "react";
import { ExternalLink, FileSpreadsheet } from "lucide-react";
import { fmtDate } from "@/lib/format-date";
import { BRANCHES, isoWeek } from "@/lib/bluejay-metrics";
import { useSheetUrl } from "@/components/use-sheet-url";
import { fnbReport } from "@/lib/fnb-ledger";
import { compareKiotviet, isMartTab, parseKiotviet, type KiotvietExport, type KiotvietRow } from "@/lib/kiotviet";
import { ReachTable, type Col } from "@/components/reach-table";

const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
const signed = (x: number) => (x > 0 ? "+" : x < 0 ? "−" : "") + num(Math.abs(x));
type Report = ReturnType<typeof fnbReport>;
type Unit = Report["units"][number];

/** The F&B ledger of a month, from the branch's Google Sheet of that month (link in Cài đặt): one report per unit (Ăn sáng, cafe / Mini mart). */
function useFnbBook(scopeId: number | null) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [report, setReport] = useState<(Report & { name: string; link: string | null; kiotviet: { name: string; rows: unknown[][] }[] }) | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sheetUrl = useSheetUrl(scopeId, month, "fnb");
  const show = (sheets: { name: string; rows: unknown[][] }[], name: string, link: string | null, kiotviet: { name: string; rows: unknown[][] }[] = []) => { setReport({ ...fnbReport(sheets, month), name, link, kiotviet }); };

  async function fromSheet() {
    if (!scopeId) return;
    setError(""); setBusy(true);
    try {
      const res = await fetch(`/api/bluejay/ledger-sheet?hotel=${scopeId}&month=${month}&kind=fnb`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? `Lỗi ${res.status}`);
      show(body.sheets, "Google Sheet", body.sheetUrl ? `${body.sheetUrl}#gid=${body.gid ?? 0}` : null, body.kiotviet ?? []);
    } catch (e) { setReport(null); setError(e instanceof Error ? e.message : "Không đọc được Google Sheet."); } finally { setBusy(false); }
  }
  return { month, setMonth, report, error, busy, sheetUrl, fromSheet };
}
type Book = ReturnType<typeof useFnbBook>;

function Controls({ scopeId, book }: { scopeId: number | null; book: Book }) {
  return <div className="summary-controls">
    <input type="month" aria-label="Tháng bảng kê" value={book.month} onChange={(event) => event.target.value && book.setMonth(event.target.value)} disabled={!scopeId} />
    <button type="button" disabled={!scopeId || book.busy} onClick={() => void book.fromSheet()}><FileSpreadsheet size={15} />{book.busy ? "Đang đọc Google Sheet…" : "Lấy từ Google Sheet"}</button>
    {book.sheetUrl && <a className="button button-outline" href={book.report?.link ?? book.sheetUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />Mở Google Sheet</a>}
  </div>;
}

function Alerts({ scopeId, book }: { scopeId: number | null; book: Book }) {
  return <>
    {!scopeId && <div className="alert alert-error" role="alert"><span>Chọn một khách sạn ở ô “Khách sạn đang xem” trên thanh trên. Mỗi chi nhánh có link Ăn sáng, cafe, mini mart riêng.</span></div>}
    {book.error && <div className="alert alert-error" role="alert"><span>{book.error}</span></div>}
    {scopeId && !book.report && !book.error && <p className="summary-note">Chưa có dữ liệu. Chọn tháng rồi bấm “Lấy từ Google Sheet”.</p>}
  </>;
}

const Kpi = ({ label, value, hint }: { label: string; value: string; hint?: string }) => <div className="summary-kpi"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;

/** Thu chi of Ăn sáng, cafe, mini mart for a month. */
export function BluejayFnbFinance({ scopeId }: { scopeId: number | null }) {
  const book = useFnbBook(scopeId);
  const r = book.report;
  const hotelName = BRANCHES.find((h) => h.id === scopeId)?.name ?? "";
  type KindRow = { group: string; name: string; total: number };
  type DayRow = Unit["days"][number];
  const kindCols: Col<KindRow>[] = [{ label: "Hạng mục", text: (k) => k.name }, { label: "Tổng chi", value: (k) => k.total, text: (k) => num(k.total), total: true }];
  const dayCols: Col<DayRow>[] = [
    { label: "Ngày", text: (d) => fmtDate(d.date), sort: (d) => d.date },
    { label: "Thu bán hàng", value: (d) => d.income, text: (d) => num(d.income), total: true },
    { label: "Chi", value: (d) => d.expense, text: (d) => num(d.expense), total: true },
    { label: "Chênh", value: (d) => d.income - d.expense, text: (d) => signed(d.income - d.expense), total: true },
  ];
  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Thu chi Ăn sáng, cafe, mini mart · {hotelName || "chưa chọn khách sạn"}</h1>
          <p>Thu bán hàng (tiền mặt, chuyển khoản, thẻ POS) và chi của một tháng, từng đơn vị. Tiền Shopee Food, Grab Food là công nợ với ứng dụng, chưa tính là doanh thu. Thẻ POS cafe tính vào tài khoản ngân hàng.</p>
        </div>
        <Controls scopeId={scopeId} book={book} />
      </div>
      <Alerts scopeId={scopeId} book={book} />
      {r && <>
        <p className="summary-note">Nguồn: <strong>{r.name}</strong> · {r.units.map((u) => `${u.label}: ${u.incomeLines} dòng thu, ${u.expenses} dòng chi`).join(" · ")}.</p>
        {r.warnings.map((w) => <p className="summary-note bad" role="alert" key={w}>{w}</p>)}
        {r.units.map((u) => <div key={u.unit}>
          <h3>{u.label}{u.name && <small> · {u.name}</small>}</h3>
          <div className="summary-kpis">
            <Kpi label="Thu bán hàng" value={num(u.sales.total)} hint={`Tiền mặt ${num(u.sales.cash)} · chuyển khoản ${num(u.sales.bank)}${u.unit === "cafe" ? ` · POS ${num(u.sales.pos)}` : ""}`} />
            {u.sales.hotel !== 0 && <Kpi label="Thu qua khách sạn" value={num(u.sales.hotel)} hint="Combo, cafe ghi vào phòng: khách sạn thu tiền. Tính vào doanh thu của đơn vị, trừ khỏi doanh thu khách sạn trong Báo cáo quản lý" />}
            <Kpi label="Chi" value={num(u.spent.total)} hint={`Tiền mặt ${num(u.spent.cash)} · chuyển khoản ${num(u.spent.bank + u.spent.visa)}`} />
            <Kpi label="Thu − chi" value={signed(u.sales.total - u.spent.total)} />
            <Kpi label="Biến động tiền mặt" value={signed(u.funds.cash)} hint={u.other.cash ? `Gồm ${num(u.other.cash)} nguồn khác` : undefined} />
            <Kpi label="Biến động ngân hàng" value={signed(u.funds.bank)} hint={u.other.bank ? `Gồm ${num(u.other.bank)} nguồn khác` : undefined} />
            <Kpi label="Công nợ ứng dụng" value={signed(u.apps.shopee + u.apps.grab + u.apps.be)} hint={`Shopee ${signed(u.apps.shopee)} · Grab ${signed(u.apps.grab)}${u.hasBe ? ` · Be Food ${signed(u.apps.be)}` : ""} (+ ứng dụng còn nợ)`} />
            {u.unit === "mart" && <Kpi label="Hàng hủy · thuê phao" value={`${num(u.voided)} · ${num(u.rental)}`} />}
          </div>
          <details className="summary-chart wide revenue-fold" open>
            <summary><h4>Chi theo hạng mục</h4></summary>
            {u.spent.total === 0 ? <p className="summary-note">Chưa có khoản chi.</p> : <ReachTable rows={u.tree.flatMap((g) => g.kinds.map((k) => ({ group: g.group, ...k }))).filter((k) => k.total)} rowKey={(k) => k.name} columns={kindCols} groupOf={(k) => k.group} />}
          </details>
          <details className="summary-chart wide revenue-fold">
            <summary><h4>Thu chi theo ngày</h4></summary>
            <ReachTable rows={u.days} rowKey={(d) => d.date} columns={dayCols} />
          </details>
        </div>)}
      </>}
    </section>
  );
}

const bad = (x: number) => <span style={x ? { color: "#b42318", fontWeight: 700 } : undefined}>{x ? signed(x) : "khớp"}</span>;
type KiotGroup = { label: string; names: string; kv: KiotvietExport | null; cmp: ReturnType<typeof compareKiotviet> | null; error: string };
const kiotCols: Col<KiotvietRow>[] = [
  { label: "Ngày", text: (d) => fmtDate(d.date), sort: (d) => d.date },
  { label: "Tuần", value: (d) => isoWeek(d.date), text: (d) => String(isoWeek(d.date)) },
  { label: "Hóa đơn", value: (d) => d.invoices, text: (d) => num(d.invoices), total: true },
  { label: "Giá niêm yết", value: (d) => d.listed, text: (d) => num(d.listed), total: true },
  { label: "Giảm giá", value: (d) => d.discount, text: (d) => num(d.discount), total: true },
  { label: "KiotViet (sau giảm giá)", value: (d) => d.kiot, text: (d) => num(d.kiot), total: true },
  { label: "Sổ nhân viên", value: (d) => d.book, text: (d) => num(d.book), total: true },
  { label: "Chênh", value: (d) => d.diff, text: (d) => (d.diff ? signed(d.diff) : "khớp"), render: (d) => bad(d.diff), total: true },
];

/** The weekly KiotViet export pasted into a tab of the sheet against the staff's BK THU, day by day (one block per unit that has a tab). */
function KiotvietCheck({ r }: { r: NonNullable<Book["report"]> }) {
  const groups = useMemo(() => [false, true].flatMap((mart): KiotGroup[] => {
    const tabs = r.kiotviet.filter((t) => isMartTab(t.name) === mart);
    if (!tabs.length) return [];
    const label = mart ? "Mini mart" : "Ăn sáng, cafe", names = tabs.map((t) => t.name).join(", ");
    const unit = r.units.find((u) => u.unit === (mart ? "mart" : "cafe")) ?? (r.units.length === 1 ? r.units[0] : null);
    try { const kv = parseKiotviet(tabs); return [{ label, names, kv, cmp: unit ? compareKiotviet(kv, unit.ledger.income) : null, error: unit ? "" : `Không có tab thu ${label} để so.` }]; }
    catch (e) { return [{ label, names, kv: null, cmp: null, error: e instanceof Error ? e.message : String(e) }]; }
  }), [r]);
  if (!groups.length) return <p className="summary-note">Chưa thấy tab KiotViet. Mỗi tuần dán báo cáo “Bán hàng theo hàng hóa” (có chi tiết hóa đơn) của KiotViet vào tab KIOTVIET CAFE (ăn sáng, cafe) hoặc KIOTVIET MINIMART (mini mart) để so với sổ nhân viên.</p>;
  return <>{groups.map((g) => <div key={g.label}>
    <h2>Đối chiếu KiotViet · {g.label}</h2>
    {g.error && <p className="summary-note bad" role="alert">{g.error}</p>}
    {g.kv && g.cmp && <>
      <p className="summary-note">Tab <strong>{g.names}</strong>: {num(g.kv.lines)} dòng hàng, {num(g.kv.invoices)} hóa đơn, từ {fmtDate(g.cmp.from)} đến {fmtDate(g.cmp.to)}{g.kv.duplicates ? `; ${g.kv.duplicates} hóa đơn nằm ở nhiều tab, chỉ tính một lần` : ""}. Chỉ so các ngày trong khoảng này. Báo cáo KiotViet không chia tiền mặt, chuyển khoản, thẻ nên so tổng ngày (tiền mặt + chuyển khoản + POS trong sổ).</p>
      <div className="summary-kpis">
        <Kpi label="KiotViet (sau giảm giá)" value={num(g.cmp.kiot)} hint={`${num(g.cmp.invoices)} hóa đơn`} />
        <Kpi label="Sổ nhân viên" value={num(g.cmp.book)} />
        <Kpi label="Chênh" value={g.cmp.diff ? signed(g.cmp.diff) : "khớp"} hint={`${g.cmp.bad} / ${g.cmp.rows.length} ngày lệch`} />
        <Kpi label="Giảm giá" value={num(g.cmp.discount)} hint="Giá niêm yết trừ giá bán" />
      </div>
      <ReachTable rows={g.cmp.rows} rowKey={(d) => d.date} columns={kiotCols} compact ruled />
    </>}
  </div>)}</>;
}

/** Checks of the F&B ledger: what looks wrong in the tabs, the balances with the delivery apps, and the weekly KiotViet export against the staff's entries. There is no Blue Jay side to compare with. */
export function BluejayFnbReconcile({ scopeId }: { scopeId: number | null }) {
  const book = useFnbBook(scopeId);
  const r = book.report;
  const hotelName = BRANCHES.find((h) => h.id === scopeId)?.name ?? "";
  const beCol: Col<Unit> = { label: "Công nợ Be Food", value: (u) => u.apps.be, text: (u) => (u.hasBe ? signed(u.apps.be) : "–"), total: true };
  const cols: Col<Unit>[] = [
    { label: "Đơn vị", text: (u) => u.label },
    { label: "Thu bán hàng", value: (u) => u.sales.total, text: (u) => num(u.sales.total), total: true },
    { label: "Chi", value: (u) => u.spent.total, text: (u) => num(u.spent.total), total: true },
    { label: "Biến động tiền mặt", value: (u) => u.funds.cash, text: (u) => signed(u.funds.cash), total: true },
    { label: "Biến động ngân hàng (gồm POS)", value: (u) => u.funds.bank, text: (u) => signed(u.funds.bank), total: true },
    { label: "Công nợ Shopee", value: (u) => u.apps.shopee, text: (u) => signed(u.apps.shopee), total: true },
    { label: "Công nợ Grab", value: (u) => u.apps.grab, text: (u) => signed(u.apps.grab), total: true },
  ];
  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Đối soát Ăn sáng, cafe, mini mart · {hotelName || "chưa chọn khách sạn"}</h1>
          <p>Ăn sáng, cafe, mini mart không có đặt phòng Blue Jay để so, nên trang này kiểm tra chính bảng kê: tab thiếu, hạng mục chi ngoài danh mục, dòng ngoài tháng, kỳ báo cáo lệch tháng, và công nợ với Shopee Food, Grab Food cuối tháng.</p>
        </div>
        <Controls scopeId={scopeId} book={book} />
      </div>
      <Alerts scopeId={scopeId} book={book} />
      {r && <>
        <p className="summary-note">Nguồn: <strong>{r.name}</strong>.</p>
        {r.warnings.length === 0 ? <p className="summary-note">Không thấy gì bất thường trong bảng kê tháng này.</p> : r.warnings.map((w) => <p className="summary-note bad" role="alert" key={w}>{w}</p>)}
        <ReachTable rows={r.units} rowKey={(u) => u.unit} columns={r.units.some((u) => u.hasBe) ? [...cols, beCol] : cols} />
        <KiotvietCheck r={r} />
      </>}
    </section>
  );
}

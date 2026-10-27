"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { ExternalLink, FileSpreadsheet } from "lucide-react";
import { fmtDate } from "@/lib/format-date";
import { BLUEJAY_HOTELS } from "@/lib/bluejay-metrics";
import { useSheetUrl } from "@/components/use-sheet-url";
import { parseInventorySheet, salesCheck, stockReport, type Inventory, type SalesCheck, type StockLine } from "@/lib/inventory";
import { ReachTable, type Col } from "@/components/reach-table";

const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
const signed = (x: number) => (x > 0 ? "+" : x < 0 ? "−" : "") + num(Math.abs(x));
const monthEnd = (month: string) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

type Kho = { sheet: string; inv: Inventory };
type Loaded = { name: string; khos: Kho[]; sold: Record<string, number> | null; storedWeeks: number };
const sheetsOf = (sheets: { name: string; rows: unknown[][]; red?: [number, number][] }[]): Kho[] => sheets.map((s) => ({ sheet: s.name, inv: parseInventorySheet(s.rows, new Set((s.red ?? []).map(([r, c]) => `${r},${c}`))) })).filter((k) => k.inv.items.length > 0);

/** The stock of one hotel for a month, kho by kho (MINIBAR, AMENITIES, VẬT TƯ, ĐỒ VẢI): opening + in - out = closing at the finance team's price, the counts against the books, and for the minibar what was sold against Blue Jay. */
export function BluejayStock({ scopeId }: { scopeId: number | null }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [khoName, setKhoName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const hotelName = BLUEJAY_HOTELS.find((h) => h.id === scopeId)?.name ?? "";
  const sheetUrl = useSheetUrl(scopeId);
  const from = `${month}-01`, to = monthEnd(month);

  const kho = loaded ? loaded.khos.find((k) => k.sheet === khoName) ?? loaded.khos[0] : null;
  const report = useMemo(() => (kho ? stockReport(kho.inv, { from, to }) : null), [kho, from, to]);
  const isMinibar = kho?.sheet.toUpperCase().startsWith("MINIBAR") === true;
  const sales = useMemo<SalesCheck[]>(() => (kho && isMinibar && loaded?.sold ? salesCheck(kho.inv, loaded.sold, { from, to }) : []), [kho, isMinibar, loaded, from, to]);

  async function onSheet() {
    if (!scopeId) return;
    setError(""); setBusy(true);
    try {
      const res = await fetch(`/api/bluejay/stock?hotel=${scopeId}&month=${month}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? `Lỗi ${res.status}`);
      const khos = sheetsOf(body.sheets);
      if (!khos.length) throw new Error("Các sheet kho chưa có danh sách mặt hàng (bảng TỒN KHO, cột R).");
      setLoaded({ name: "Google Sheet", khos, sold: body.minibarSold ?? null, storedWeeks: (body.storedWeeks ?? []).length }); setKhoName(khos[0].sheet);
    } catch (e) { setLoaded(null); setError(e instanceof Error ? e.message : "Không đọc được Google Sheet."); } finally { setBusy(false); }
  }
  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const book = XLSX.read(await file.arrayBuffer());
      const khos = sheetsOf(book.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, defval: "" }) })));
      if (!khos.length) throw new Error("Không thấy sheet kho nào (cần bảng TỒN KHO với cột “Mặt hàng”, “Tồn đầu (SL)”).");
      setLoaded({ name: file.name, khos, sold: null, storedWeeks: 0 }); setKhoName(khos[0].sheet);
    } catch (e) { setError(e instanceof Error ? e.message : "Không đọc được file Excel."); }
  }

  const lineCols: Col<StockLine>[] = [
    { label: "Mặt hàng", text: (l) => l.item.name },
    { label: "Loại", text: (l) => l.item.kind },
    { label: "Tồn đầu", value: (l) => l.item.openQty, text: (l) => num(l.item.openQty) },
    { label: "Nhập", value: (l) => l.receiptQty, text: (l) => num(l.receiptQty) },
    { label: "Xuất", value: (l) => l.issueQty, text: (l) => num(l.issueQty) },
    { label: "Tồn cuối (SL)", value: (l) => l.closingQty, text: (l) => num(l.closingQty) },
    { label: "Giá áp dụng", value: (l) => l.avgPrice, text: (l) => num(l.avgPrice) },
    { label: "Giá trị xuất", value: (l) => l.issueValue, text: (l) => num(l.issueValue), total: true },
    { label: "Tồn cuối (giá trị)", value: (l) => l.closingValue, text: (l) => num(l.closingValue), total: true },
  ];
  const counted = report ? report.lines.filter((l) => l.count) : [];
  const countCols: Col<StockLine>[] = [
    { label: "Mặt hàng", text: (l) => l.item.name },
    { label: "Ngày kiểm", text: (l) => fmtDate(l.count!.date), sort: (l) => l.count!.date },
    { label: "Theo sổ", value: (l) => l.count!.expected, text: (l) => num(l.count!.expected) },
    { label: "Đếm thực tế", value: (l) => l.count!.qty, text: (l) => num(l.count!.qty) },
    { label: "Chênh (SL)", value: (l) => l.count!.diff, text: (l) => (l.count!.diff ? signed(l.count!.diff) : "khớp") },
    { label: "Chênh (giá trị)", value: (l) => l.count!.diffValue, text: (l) => (l.count!.diff ? signed(l.count!.diffValue) : "–"), total: true },
  ];
  const salesCols: Col<SalesCheck>[] = [
    { label: "Mặt hàng", text: (s) => s.item },
    { label: "Tên trong Blue Jay", text: (s) => s.bluejayName },
    { label: "Xuất bán theo sổ", value: (s) => s.sheet, text: (s) => num(s.sheet), total: true },
    { label: "Blue Jay bán", value: (s) => s.bluejay, text: (s) => num(s.bluejay), total: true },
    { label: "Chênh", value: (s) => s.diff, text: (s) => (s.diff ? signed(s.diff) : "khớp"), total: true },
  ];

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Kho · {hotelName || "chưa chọn khách sạn"}</h1>
          <p>Tồn kho của tháng theo từng loại kho: tồn đầu + nhập − xuất = tồn cuối theo giá bình quân của kế toán (hoặc đơn giá cố định nếu có), kiểm kê so với sổ, và với minibar thì số bán so với Blue Jay. Lấy từ Google Sheet của khách sạn (mỗi loại kho và mỗi tháng một tab).</p>
        </div>
        <div className="summary-controls">
          <input type="month" aria-label="Tháng" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} disabled={!scopeId} />
          <button type="button" disabled={!scopeId || busy} onClick={() => void onSheet()}><FileSpreadsheet size={15} />{busy ? "Đang đọc Google Sheet…" : "Lấy từ Google Sheet"}</button>
          <label className="button button-outline" aria-disabled={!scopeId}>
            <FileSpreadsheet size={15} />Chọn file kho (.xlsx)
            <input type="file" accept=".xlsx,.xls" hidden disabled={!scopeId} onChange={(event) => { void onFile(event.target.files?.[0]); event.target.value = ""; }} />
          </label>
          {sheetUrl && <a className="button button-outline" href={sheetUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />Mở Google Sheet</a>}
        </div>
      </div>

      {!scopeId && <div className="alert alert-error" role="alert"><span>Chọn một khách sạn ở ô “Khách sạn đang xem” trên thanh trên. Mỗi kho thuộc một khách sạn.</span></div>}
      {error && <div className="alert alert-error" role="alert"><span>{error}</span></div>}
      {scopeId && !loaded && !error && <p className="summary-note">Chưa có dữ liệu. Chọn tháng rồi bấm “Lấy từ Google Sheet”, hoặc chọn file kho.</p>}

      {loaded && kho && report && <>
        <div className="range-presets" role="group" aria-label="Loại kho">
          {loaded.khos.map((k) => <button type="button" key={k.sheet} aria-pressed={k.sheet === kho.sheet} onClick={() => setKhoName(k.sheet)}>{k.sheet}</button>)}
        </div>
        <p className="summary-note">Nguồn: <strong>{loaded.name}</strong> · sheet {kho.sheet} · {report.lines.length} mặt hàng · {kho.inv.receipts.length} dòng nhập, {kho.inv.issues.length} dòng xuất, {kho.inv.counts.length} dòng kiểm kê · kỳ {fmtDate(from)} – {fmtDate(to)}.</p>
        {kho.inv.month && kho.inv.month !== month && <p className="summary-note bad" role="alert">Bảng TỒN KHO trong sheet {kho.sheet} đang để tháng {kho.inv.month.slice(5)}/{kho.inv.month.slice(0, 4)}: tồn đầu nhập tay là của tháng đó. Số của tháng {month.slice(5)}/{month.slice(0, 4)} chỉ đúng nếu tồn đầu cũng là của tháng này.</p>}
        {kho.inv.items.some((i) => i.immediate) && <p className="summary-note">{kho.inv.items.filter((i) => i.immediate).length} mặt hàng mua xuất luôn (bôi đỏ hoặc Loại “Mua xuất luôn”): giá xuất bằng giá mua, không để tồn: {kho.inv.items.filter((i) => i.immediate).map((i) => i.name).join(", ")}.</p>}
        {report.unknown.length > 0 && <p className="summary-note bad" role="alert">{report.unknown.length} dòng có mặt hàng không có trong danh sách TỒN KHO (không được tính): {report.unknown.slice(0, 6).map((u) => `${u.sheet} dòng ${u.row} “${u.item}”`).join(", ")}.</p>}
        <div className="summary-kpis">
          <div className="summary-kpi"><span>Giá trị tồn đầu</span><strong>{num(report.totals.openValue)}</strong></div>
          <div className="summary-kpi"><span>Nhập trong tháng</span><strong>{num(report.totals.receiptValue)}</strong></div>
          <div className="summary-kpi"><span>Giá trị xuất</span><strong>{num(report.totals.issueValue)}</strong><small>Giá vốn hàng xuất</small></div>
          <div className="summary-kpi"><span>Giá trị tồn cuối</span><strong>{num(report.totals.closingValue)}</strong></div>
          <div className="summary-kpi"><span>Chênh kiểm kê</span><strong>{counted.length ? signed(report.totals.countDiffValue) : "–"}</strong><small>{counted.length ? `${counted.filter((l) => l.count!.diff).length}/${counted.length} mặt hàng lệch` : "Chưa có kiểm kê"}</small></div>
        </div>
        <details className="summary-chart wide revenue-fold" open>
          <summary><h4>Tồn kho theo mặt hàng</h4></summary>
          <ReachTable rows={report.lines} rowKey={(l) => l.item.name} columns={lineCols} groupOf={(l) => l.item.kind || "Khác"} compact />
        </details>
        <details className="summary-chart wide revenue-fold" open>
          <summary><h4>Kiểm kê so với sổ{counted.length > 0 && <small> · {counted.some((l) => l.count!.diff) ? `${counted.filter((l) => l.count!.diff).length} mặt hàng lệch` : "khớp"}</small>}</h4></summary>
          <p className="summary-note">Mỗi mặt hàng lấy lần kiểm kê gần nhất trong tháng, so với tồn đầu + nhập − xuất tính đến đúng ngày kiểm. Chênh âm: đếm được ít hơn sổ (mất hàng hoặc ghi thiếu xuất).</p>
          {counted.length === 0 ? <p className="summary-note">Chưa có dòng kiểm kê trong tháng.</p> : <ReachTable rows={counted} rowKey={(l) => l.item.name} columns={countCols} compact />}
        </details>
        {isMinibar && <details className="summary-chart wide revenue-fold" open>
          <summary><h4>Hàng bán: sổ kho so với Blue Jay</h4></summary>
          {!loaded.sold ? <p className="summary-note">Chưa đối chiếu được với Blue Jay (chỉ có khi lấy từ Google Sheet).</p> : sales.length === 0 ? <p className="summary-note">Chưa có mặt hàng nào khai “Tên trong Blue Jay” trong bảng TỒN KHO.</p> : <>
            <p className="summary-note">Blue Jay chỉ có số bán (dịch vụ Minibar) theo ngày, không có hàng miễn phí. {loaded.storedWeeks === 0 ? "Blue Jay chưa lưu tuần nào của tháng này." : `Đã lưu ${loaded.storedWeeks} tuần của Blue Jay; tuần chưa lưu hoặc ngày chưa chốt thì Blue Jay thấp hơn.`}</p>
            <ReachTable rows={sales} rowKey={(s) => s.item} columns={salesCols} compact />
          </>}
        </details>}
      </>}
    </section>
  );
}

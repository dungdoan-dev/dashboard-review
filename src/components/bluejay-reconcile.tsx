"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowDownToLine, FileDown, FileSpreadsheet } from "lucide-react";
import { fmtDate } from "@/lib/format-date";
import { BLUEJAY_HOTELS } from "@/lib/bluejay-metrics";
import { KIND_LABELS, ledgerWarnings, parseLedgerWorkbook, reconcile, type Item, type Kind, type Ledger } from "@/lib/bluejay-reconcile";
import type { RevenueBooking } from "@/lib/bluejay-revenue";

const num = (x: number) => Math.round(x).toLocaleString("vi-VN");
const signed = (x: number) => (x > 0 ? "+" : x < 0 ? "−" : "") + num(Math.abs(x));
const KINDS: Kind[] = ["diff", "ledger-only", "bj-only", "prior", "ok"];
const PROBLEMS: Kind[] = ["diff", "ledger-only", "bj-only"];
const BASIS = { payment: "Thanh toán", service: "Dịch vụ" } as const;

type Stored = { key: string; bookings: RevenueBooking[]; missingWeeks: string[]; message: string };

/** Upload the monthly cash ledger and compare it with the bookings already stored from Blue Jay (no call to Blue Jay, so any time of day works). */
export function BluejayReconcile({ scopeId }: { scopeId: number | null }) {
  const [ledger, setLedger] = useState<(Ledger & { name: string }) | null>(null);
  const [fileError, setFileError] = useState("");
  const [stored, setStored] = useState<Stored | null>(null);
  const [shown, setShown] = useState<Kind[]>(PROBLEMS);

  const key = ledger && scopeId ? `${scopeId}|${ledger.from}|${ledger.to}` : "";
  useEffect(() => {
    if (!key) return;
    let active = true;
    const [hotel, from, to] = key.split("|");
    fetch(`/api/bluejay/reconcile?hotel=${hotel}&from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => { if (active) setStored({ key, bookings: res.ok ? body.bookings ?? [] : [], missingWeeks: res.ok ? body.missingWeeks ?? [] : [], message: res.ok ? "" : body.message ?? `Lỗi ${res.status}` }); })
      .catch(() => { if (active) setStored({ key, bookings: [], missingWeeks: [], message: "Không kết nối được máy chủ." }); });
    return () => { active = false; };
  }, [key]);

  const ready = Boolean(key) && stored?.key === key && !stored.message;
  const result = useMemo(() => (ledger && ready && stored ? reconcile(ledger, stored.bookings) : null), [ledger, ready, stored]);
  const rows = result ? result.items.filter((item) => shown.includes(item.kind)) : [];
  const hotelName = BLUEJAY_HOTELS.find((h) => h.id === scopeId)?.name ?? "";

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileError(""); setStored(null);
    try {
      const book = XLSX.read(await file.arrayBuffer());
      const sheets = book.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, defval: "" }) }));
      const parsed = parseLedgerWorkbook(sheets);
      setLedger({ ...parsed, name: `${file.name} · ${parsed.sheet}` });
    } catch (error) {
      setLedger(null);
      setFileError(error instanceof Error ? error.message : "Không đọc được file Excel.");
    }
  }

  function toggle(kind: Kind) {
    setShown((current) => (current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]));
  }

  function exportExcel() {
    if (!result || !ledger) return;
    const head = ["Kết quả", "Mã / ID", "Nguồn", "Phòng", "Nhận phòng", "Trả phòng", "Trạng thái Blue Jay", "So sánh theo", "Bảng kê", "Blue Jay", "Chênh (bảng kê − Blue Jay)", "Số dòng bảng kê", "Ghi chú"];
    const body = result.items.map((i) => [KIND_LABELS[i.kind], i.id, i.channel, i.room, i.checkIn && fmtDate(i.checkIn), i.checkOut && fmtDate(i.checkOut), i.status, i.basis ? BASIS[i.basis] : "", i.excel, i.bluejay, i.diff, i.lines, i.notes.join("; ")]);
    const issues: (string | number)[][] = [["Loại", "Chi tiết", "Giá trị"]];
    for (const d of result.fileIssues.dailyMismatch) issues.push(["Tổng ngày lệch bảng doanh thu theo ngày", fmtDate(d.date), `cộng dòng ${num(d.ledger)} · bảng ${num(d.sheet)} · lệch ${signed(d.diff)}`]);
    for (const group of result.fileIssues.duplicates) issues.push(["Dòng lặp", `ID ${group[0].id} · ${group[0].service} · ngày ${fmtDate(group[0].date)}`, `dòng ${group.map((l) => l.row).join(", ")}`]);
    for (const l of result.fileIssues.noMoney) issues.push(["Dòng không có số tiền", `ID ${l.id} · ${l.service}`, `dòng ${l.row}`]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([head, ...body]), "Đối soát");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(issues), "Lỗi trong bảng kê");
    XLSX.writeFile(book, `doi-soat-${hotelName.replace(/\s+/g, "-")}-${ledger.from}_${ledger.to}.xlsx`);
  }

  const itemCell = (item: Item) => <tr key={`${item.kind}-${item.id}-${item.room}`}>
    <th scope="row">{item.id}<small>{item.channel}</small></th>
    <td>{item.room || "–"}</td>
    <td>{item.checkIn ? `${fmtDate(item.checkIn)} → ${item.checkOut ? fmtDate(item.checkOut) : "–"}` : "–"}</td>
    <td>{item.status || "–"}</td>
    <td>{item.basis ? BASIS[item.basis] : "–"}</td>
    <td>{num(item.excel)}</td>
    <td>{item.basis ? num(item.bluejay) : "–"}</td>
    <td className={item.kind === "ok" ? undefined : "reconcile-diff"}>{item.kind === "ok" || item.kind === "prior" ? "–" : signed(item.diff)}</td>
    <td>{KIND_LABELS[item.kind]}</td>
    <td>{item.notes.length ? item.notes.join("; ") : "–"}</td>
  </tr>;

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Đối soát bảng kê thu tiền · {hotelName || "chưa chọn khách sạn"}</h1>
          <p>So bảng kê thu tiền khách sạn (Excel) với đặt phòng đã lưu từ Blue Jay, không gọi Blue Jay nên dùng được mọi giờ. Chỉ so khoản khách sạn trực tiếp thu: khách lẻ so toàn bộ thanh toán, khách OTA so tiền dịch vụ.</p>
        </div>
        <div className="summary-controls">
          <label className="button button-outline" aria-disabled={!scopeId}>
            <FileSpreadsheet size={15} />{ledger ? "Chọn file khác" : "Chọn file bảng kê (.xlsx)"}
            <input type="file" accept=".xlsx,.xls" hidden disabled={!scopeId} onChange={(event) => { void onFile(event.target.files?.[0]); event.target.value = ""; }} />
          </label>
          <button type="button" onClick={() => void import("@/lib/bluejay-ledger-template").then((m) => m.downloadLedgerTemplate())}><FileDown size={15} />Tải file mẫu</button>
          {result && <button type="button" onClick={exportExcel}><ArrowDownToLine size={15} />Xuất Excel</button>}
        </div>
      </div>

      {!scopeId && <div className="alert alert-error" role="alert"><span>Chọn một khách sạn ở ô “Khách sạn đang xem” trên thanh trên. Mỗi bảng kê chỉ thuộc một khách sạn nên không đối soát toàn chuỗi.</span></div>}
      {fileError && <div className="alert alert-error" role="alert"><span>{fileError}</span></div>}
      {stored?.key === key && stored.message && <div className="alert alert-error" role="alert"><span>{stored.message}</span></div>}
      {scopeId && !ledger && !fileError && <p className="summary-note">Chưa có file. Chọn file bảng kê của tháng cần đối soát; kỳ đối soát tự lấy theo ngày nhỏ nhất và lớn nhất trong file.</p>}
      {ledger && !result && !fileError && !(stored?.key === key && stored.message) && scopeId && <p className="summary-note">Đang đối soát…</p>}

      {ledger && result && stored && <>
        <p className="summary-note">File <strong>{ledger.name}</strong> · kỳ {fmtDate(ledger.from)} – {fmtDate(ledger.to)} · {ledger.lines.length} dòng có ID · {stored.bookings.length} đặt phòng Blue Jay đã lưu.</p>
        {ledgerWarnings(ledger, hotelName).map((warning) => <p className="summary-note bad" role="alert" key={warning}>{warning}</p>)}
        {stored.missingWeeks.length > 0 && <p className="summary-note bad" role="alert">Blue Jay chưa lưu tuần bắt đầu {stored.missingWeeks.map(fmtDate).join(", ")}. Đặt phòng của các tuần này sẽ hiện là “Có trong bảng kê, không có trong Blue Jay” dù chưa chắc sai; hãy lấy các tuần đó trong khung giờ API rồi đối soát lại.</p>}

        <div className="summary-kpis">
          <div className="summary-kpi"><span>Tổng thu trong bảng kê</span><strong>{num(result.totals.excelCollected)}</strong><small>Nhóm “Thu tiền khách sạn” của dòng có ID (không gồm cọc đã ở, POS)</small></div>
          {ledger.hasCounted && <div className="summary-kpi"><span>Cột “Tiền so Bluejay”</span><strong>{num(result.totals.excelCounted)}</strong><small>Tổng toàn bảng kê</small></div>}
          <div className="summary-kpi"><span>Dòng không có ID</span><strong>{num(result.totals.excelNoId)}</strong><small>Quẹt thẻ, hoa hồng, lãi; trừ {num(result.totals.deductions)}</small></div>
        </div>

        <div className="range-presets reconcile-filter" role="group" aria-label="Lọc kết quả">
          {KINDS.map((kind) => <button type="button" key={kind} aria-pressed={shown.includes(kind)} onClick={() => toggle(kind)}>{KIND_LABELS[kind]} ({result.counts[kind]})</button>)}
        </div>

        {rows.length === 0 ? <p className="summary-note">Không có dòng nào thuộc nhóm đang chọn.</p> : <div className="summary-table summary-table-scroll"><table>
          <thead><tr><th>Mã / nguồn</th><th>Phòng</th><th>Lưu trú</th><th>Trạng thái</th><th>So sánh theo</th><th>Bảng kê</th><th>Blue Jay</th><th>Chênh</th><th>Kết quả</th><th>Ghi chú</th></tr></thead>
          <tbody>{rows.map(itemCell)}</tbody>
        </table></div>}

        <details className="summary-table" open={result.fileIssues.dailyMismatch.length > 0}>
          <summary>Lỗi ngay trong bảng kê ({result.fileIssues.dailyMismatch.length + result.fileIssues.duplicates.length + result.fileIssues.noMoney.length})</summary>
          {result.fileIssues.dailyMismatch.length + result.fileIssues.duplicates.length + result.fileIssues.noMoney.length === 0 ? <p className="summary-note">Không phát hiện lỗi.</p> : <ul className="reconcile-issues">
            {result.fileIssues.dailyMismatch.map((d) => <li key={d.date}>Ngày {fmtDate(d.date)}: cộng các dòng ra {num(d.ledger)}, bảng “doanh thu theo ngày” ghi {num(d.sheet)} (lệch {signed(d.diff)}).</li>)}
            {result.fileIssues.duplicates.map((g) => <li key={g[0].row}>Dòng lặp: ID {g[0].id} · {g[0].service} · {fmtDate(g[0].date)} · dòng {g.map((l) => l.row).join(", ")}.</li>)}
            {result.fileIssues.noMoney.map((l) => <li key={l.row}>Dòng {l.row} không có số tiền: ID {l.id} · {l.service}.</li>)}
          </ul>}
        </details>
      </>}
    </section>
  );
}

import * as XLSX from "xlsx";
import { addDays, combine, isoWeek, summarize, vnDay, type HotelRecord, type WeeklyReport } from "./bluejay-metrics.ts";

const PCT = "0.00%", INT = "#,##0";
type Cell = string | number | null;
type Sheet = { name: string; all?: boolean; head: string[]; fmt?: string[]; rowFmt?: string[]; rows: Cell[][] };

// One sheet per dashboard table, same as the sample project. Cells keep real numbers (not text) so Excel can sum and chart them.
function sheets(report: WeeklyReport, records: HotelRecord[]): Sheet[] {
  const c = combine(records);
  const monday = report.monday;
  type Summary = ReturnType<typeof summarize>;
  const lines: [string, (x: Summary) => number, string][] = [
    ["Công suất (%)", (x) => x.rate, PCT],
    ["Tổng số đêm lưu trú", (x) => x.nights, INT],
    ["Giá phòng TB (ADR)", (x) => Math.round(x.adr), INT],
    ["Hiệu quả doanh thu phòng (RevPAR)", (x) => Math.round(x.revpar), INT],
    [`Pickup tuần sau (${vnDay(addDays(monday, 7))}-${vnDay(addDays(monday, 13))})`, (x) => x.pickup1, PCT],
    [`Pickup tuần sau nữa (${vnDay(addDays(monday, 14))}-${vnDay(addDays(monday, 20))})`, (x) => x.pickup2, PCT],
  ];
  const cols: [string, Summary][] = [...report.hotels.map((h): [string, Summary] => [h.name, summarize([h])]), ["Toàn chuỗi", summarize(report.hotels)]];
  const days = records[0]?.days.map((d, i) => [d.date, ...records.map((h) => (h.days[i]?.total > 0 ? h.days[i].occupied / h.days[i].total : null))]) ?? [];
  const money = (g: { name: string; bookings: number; nights: number; value: number }) => [g.name, g.bookings, g.nights, Math.round(g.value)];

  return [
    { name: "Tổng hợp", all: true, head: ["Đơn vị", ...cols.map(([name]) => name)], rows: lines.map(([label, f]) => [label, ...cols.map(([, s]) => f(s))]), rowFmt: lines.map((l) => l[2]) },
    { name: "Công suất theo ngày", head: ["Ngày", ...records.map((h) => h.name)], fmt: ["", ...records.map(() => PCT)], rows: days },
    { name: "Tiền phòng theo nguồn", head: ["Nguồn", "Đặt phòng", "Đêm", "Tiền phòng"], fmt: ["", INT, INT, INT], rows: c.bySource.map(money) },
    { name: "Tiền phòng theo hạng phòng", head: ["Hạng phòng", "Đặt phòng", "Đêm", "Tiền phòng"], fmt: ["", INT, INT, INT], rows: c.byRoomType.map(money) },
    { name: "Đặt phòng theo trạng thái", head: ["Trạng thái", "Đặt phòng"], fmt: ["", INT], rows: c.statuses.map((g) => [g.name, g.bookings]) },
    { name: "Dịch vụ theo nhóm", head: ["Nhóm", "Số lượng", "Doanh thu"], fmt: ["", "#,##0.##", INT], rows: c.services.map((g) => [g.name, g.quantity, g.total]) },
  ];
}

export function workbookFor(report: WeeklyReport, scopeId: number | null = null): Buffer {
  const records = report.hotels.filter((h) => !scopeId || h.id === scopeId);
  const wb = XLSX.utils.book_new();
  for (const s of sheets(report, records)) {
    const title = `BÁO CÁO VẬN HÀNH TUẦN ${isoWeek(report.monday)} (TỪ NGÀY ${vnDay(report.monday)}-${vnDay(report.end)})${scopeId && !s.all ? ` - ${records[0].name}` : ""}`;
    const ws = XLSX.utils.aoa_to_sheet([[title], s.head, ...s.rows]);
    s.rows.forEach((r, i) => r.forEach((v, j) => {
      const f = s.rowFmt ? (j ? s.rowFmt[i] : "") : s.fmt?.[j];
      const cell = ws[XLSX.utils.encode_cell({ r: i + 2, c: j })];
      if (f && typeof v === "number" && cell) cell.z = f;
    }));
    ws["!cols"] = s.head.map((_, j) => ({ wch: j ? 18 : 44 }));
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

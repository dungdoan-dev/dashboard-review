import ExcelJS from "exceljs";
import { FLAG_LABELS, upgradeTotal, type RevenueWeek } from "./bluejay-revenue.ts";
import { addDays, combine, isoWeek, summarize, vnDay, type HotelRecord, type WeeklyReport } from "./bluejay-metrics.ts";

const PCT = "0.00%", INT = "#,##0";
const thin = { style: "thin" as const, color: { argb: "FF7F8FA6" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
type Cell = string | number | null;
type Sheet = { name: string; title?: string; all?: boolean; head: string[]; fmt?: string[]; rowFmt?: string[]; rows: Cell[][] };

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

const dmy = (date: string) => (date ? date.split("-").reverse().join("/") : "");

// Revenue sheets follow the revenue page: a stay counts whole in the week it checks out; M-Standard / Unassigned stays are listed too, marked, and kept out of the first totals.
function revenueSheets(revenue: RevenueWeek, scopeId: number | null): Sheet[] {
  const hotels = revenue.hotels.filter((h) => !scopeId || h.id === scopeId);
  const GROUP = { counted: "Tính doanh thu", apart: "M-Standard / Unassigned" };
  const rowOf = (h: RevenueWeek["hotels"][number], b: RevenueWeek["hotels"][number]["bookings"][number], group: string): Cell[] => [
    h.name, group, b.code, b.ref, b.channel, b.roomType, b.room, b.status, dmy(b.checkIn), dmy(b.checkOut), b.nights,
    Math.round(b.roomInWeek), b.servicePrice, b.totalPrice, b.payment, b.balance, b.deposit, b.flags.map((f) => FLAG_LABELS[f]).join(", "),
  ];
  const bookings = hotels.flatMap((h) => [...h.bookings.map((b) => rowOf(h, b, GROUP.counted)), ...(h.excluded ?? []).map((b) => rowOf(h, b, GROUP.apart))]);
  const stays = (list: RevenueWeek["hotels"][number]["bookings"]) => list.filter((b) => b.stay);
  const total = (list: RevenueWeek["hotels"][number]["bookings"], key: "roomInWeek" | "servicePrice") => Math.round(stays(list).reduce((t, b) => t + b[key], 0));
  const summary = hotels.map((h): Cell[] => {
    const up = Math.round(upgradeTotal(h.services));
    const room = total(h.bookings, "roomInWeek") + up, service = total(h.bookings, "servicePrice") - up;
    const apartRoom = total(h.excluded ?? [], "roomInWeek"), apartService = total(h.excluded ?? [], "servicePrice");
    return [h.name, new Set(stays(h.bookings).map((b) => b.code)).size, room, service, room + service, apartRoom, apartService, room + apartRoom + service + apartService];
  });
  const services = hotels.flatMap((h) => h.services.flatMap((d) => d.groups.map((g): Cell[] => [h.name, dmy(d.date), g.name, g.quantity, g.total])));
  const serviceLines = hotels.flatMap((h) => h.services.flatMap((d) => d.groups.flatMap((g) => g.items.map((i): Cell[] => [h.name, dmy(d.date), g.name, i.name, i.unit, i.quantity, i.total]))));
  const title = `BÁO CÁO DOANH THU TUẦN ${isoWeek(revenue.monday)} (TRẢ PHÒNG TỪ NGÀY ${vnDay(revenue.monday)}-${vnDay(revenue.end)})`;
  return [
    { name: "Tổng hợp doanh thu", title, head: ["Khách sạn", "Số đặt phòng", "Tiền phòng", "Tiền dịch vụ", "Tổng tiền", "Tiền phòng M-Standard / Unassigned", "Dịch vụ M-Standard / Unassigned", "Tổng tiền gồm M-Standard / Unassigned"], fmt: ["", INT, INT, INT, INT, INT, INT, INT], rows: summary },
    { name: "Doanh thu theo đặt phòng", title, head: ["Khách sạn", "Nhóm", "Mã đặt phòng", "Mã kênh", "Nguồn", "Hạng phòng", "Phòng", "Trạng thái", "Nhận phòng", "Trả phòng", "Số đêm", "Tiền phòng", "Dịch vụ", "Tổng tiền", "Đã thanh toán", "Còn lại", "Cọc", "Đối soát"], fmt: ["", "", "", "", "", "", "", "", "", "", INT, INT, INT, INT, INT, INT, INT, ""], rows: bookings },
    { name: "Dịch vụ theo ngày", title, head: ["Khách sạn", "Ngày", "Nhóm dịch vụ", "Số lượng", "Doanh thu"], fmt: ["", "", "", "#,##0.##", INT], rows: services },
    { name: "Chi tiết dịch vụ", title, head: ["Khách sạn", "Ngày", "Nhóm dịch vụ", "Dịch vụ", "ĐVT", "Số lượng", "Thành tiền"], fmt: ["", "", "", "", "", "#,##0.##", INT], rows: serviceLines },
  ];
}

// Two separate workbooks: the operations report counts nights in the week, the revenue report counts stays by check-out week, so they never share a file.
// Built with exceljs so every table is ruled with borders; the cells still hold real numbers.
export async function workbookFor(report: WeeklyReport, scopeId: number | null = null, revenue: RevenueWeek | null = null, kind: "operations" | "revenue" = "operations"): Promise<Buffer> {
  const records = report.hotels.filter((h) => !scopeId || h.id === scopeId);
  const book = new ExcelJS.Workbook();
  for (const s of kind === "revenue" ? (revenue ? revenueSheets(revenue, scopeId) : []) : sheets(report, records)) {
    const title = s.title ?? `BÁO CÁO VẬN HÀNH TUẦN ${isoWeek(report.monday)} (TỪ NGÀY ${vnDay(report.monday)}-${vnDay(report.end)})${scopeId && !s.all ? ` - ${records[0].name}` : ""}`;
    const ws = book.addWorksheet(s.name);
    Object.assign(ws.addRow([title]), { font: { bold: true, size: 13, color: { argb: "FF1F3A5F" } } });
    ws.addRow(s.head).eachCell((c) => Object.assign(c, { border: BORDER, font: { bold: true, color: { argb: "FF1F3A5F" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E2F3" } }, alignment: { horizontal: "center", vertical: "middle", wrapText: true } }));
    s.rows.forEach((r, i) => ws.addRow(r).eachCell({ includeEmpty: true }, (cell, col) => {
      const j = col - 1, f = s.rowFmt ? (j ? s.rowFmt[i] : "") : s.fmt?.[j];
      cell.border = BORDER;
      if (f && typeof cell.value === "number") cell.numFmt = f;
    }));
    ws.columns = s.head.map((_, j) => ({ width: j ? 18 : 44 }));
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}

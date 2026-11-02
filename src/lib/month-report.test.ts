import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { monthRange, monthScoreRow, toExcelRow, type DayReport } from "./month-report.ts";
import { monthWorkbook } from "./month-report-excel.ts";
import type { ChannelTables } from "./reach-total.ts";
import type { LocationRecord } from "./types.ts";

const place = { id: "A", name: "Sontra Sea Hotel", area: "Sơn Trà", type: "hotel", google: null, tripadvisor: null, agoda: null, booking: null, tripcom: null } as unknown as LocationRecord;
const report = (platform: DayReport["platform"], date: string, rating: number | null, reviewCount: number | null, ratingScale = 5): DayReport => ({ locationId: "A", platform, date, rating, ratingScale, reviewCount });

test("the range of a month: whole month when over, up to yesterday while running, nothing on its first day", () => {
  assert.deepEqual(monthRange("2026-10", "2026-10-31"), { from: "2026-10-01", to: "2026-10-30", length: 30, prevStart: "2026-09-01", prevEnd: "2026-09-30" });
  assert.deepEqual([monthRange("2026-09", "2026-10-31").to, monthRange("2026-09", "2026-10-31").length], ["2026-09-30", 30]);
  assert.equal(monthRange("2026-11", "2026-11-01").length, 0);
});

test("a place shows its last report up to the end of the range, and the change against the last report of the month before", () => {
  const range = monthRange("2026-10", "2026-10-31");
  const reports = [
    report("google", "2026-09-15", 4.5, 100), report("google", "2026-09-30", 4.6, 110),
    report("google", "2026-10-20", 4.8, 150), report("google", "2026-10-31", 4.9, 160), // today is not over: not used
    report("booking", "2026-10-10", 8.8, 30, 10), report("booking", "2026-08-31", 8.0, 20, 10), // the August report is two months back: no base
  ];
  const row = monthScoreRow(place, ["google", "booking", "agoda"], reports, range, 5);
  assert.deepEqual([row.cells.google!.score, row.cells.google!.count], [4.8, 150]);
  assert.ok(Math.abs(row.cells.google!.dScore! - 0.2) < 1e-9 && row.cells.google!.dCount === 40);
  assert.deepEqual([row.cells.booking!.score, row.cells.booking!.dScore, row.cells.booking!.dCount], [4.4, null, null]); // 8.8 of 10 is 4.4 of 5
  assert.deepEqual([row.cells.agoda!.score, row.cells.agoda!.count], [null, null]);
  assert.equal(row.total, 180);
  assert.equal(row.latest, "2026-10-20");
  const excel = toExcelRow(row, ["google", "booking", "agoda"]);
  assert.deepEqual([excel.updated, excel.cells[0].dScore, excel.cells[0].dCount, excel.cells[2].score], ["20/10/2026", 0.2, 40, null]);
});

test("the monthly workbook has three sheets: Review (a score table per type), Tiếp cận and Quảng cáo (advertising channels apart)", async () => {
  const row = toExcelRow(monthScoreRow(place, ["google"], [report("google", "2026-10-20", 4.8, 150)], monthRange("2026-10", "2026-10-31"), 5), ["google"]);
  const table = (title: string) => ({ title, head: ["Tên", "Chi phí"], rows: [["A", 100]], sum: [false, true] });
  const reach: ChannelTables[] = [{ name: "Facebook", summary: [table("Facebook · theo trang")], daily: null }, { name: "Facebook Ads", ads: true, summary: [table("Facebook Ads · theo chiến dịch")], daily: null }];
  const book = monthWorkbook("2026-10", "Điểm thang 5", [{ heading: "Khách sạn", platforms: ["Google Maps"], rows: [row], scale: 5 }, { heading: "Cafe", platforms: ["Google Maps"], rows: [], scale: 5 }], "Kỳ: 01/10/2026 – 30/10/2026", reach);
  assert.deepEqual(book.worksheets.map((w) => w.name), ["Review", "Tiếp cận", "Quảng cáo"]);
  const scores = book.getWorksheet("Review")!;
  const col1 = (scores.getColumn(1).values as unknown[]).slice(1);
  assert.equal(scores.views[0].showGridLines, false);
  assert.equal(book.getWorksheet("Tiếp cận")!.views[0].showGridLines, false);
  assert.deepEqual([col1[0], col1.includes("Khách sạn"), col1.includes("Cafe"), col1.filter((v) => v === "Tổng").length], ["BÁO CÁO THÁNG 10/2026 · REVIEW", true, true, 2]);
  const summary = book.getWorksheet("Tiếp cận")!;
  const ads = book.getWorksheet("Quảng cáo")!;
  const adsCol = (ads.getColumn(1).values as unknown[]).slice(1), reachCol = (summary.getColumn(1).values as unknown[]).slice(1);
  assert.deepEqual([adsCol.includes("Facebook Ads · theo chiến dịch"), reachCol.includes("Facebook Ads · theo chiến dịch"), reachCol.includes("Facebook · theo trang"), adsCol.includes("Facebook · theo trang")], [true, false, true, false]);
  assert.equal(summary.getCell(4, 3).isMerged, false); // Facebook has two columns: its banner stops there (row 4 = banner)
  assert.equal((summary.getColumn(1).values as unknown[])[1], "BÁO CÁO THÁNG 10/2026 · TIẾP CẬN");
  const back = new ExcelJS.Workbook();
  await back.xlsx.load((await book.xlsx.writeBuffer()) as unknown as ArrayBuffer);
  assert.equal(back.worksheets.length, 3);
});

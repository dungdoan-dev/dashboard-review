import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseHistoricalReportWorkbook } from "../src/lib/historical-report-import.ts";

// Layout of the hotel importer: row 2 platform, row 3 branch, row 4 field, column A dates.
function workbook() {
  const rows = [
    [], // title row
    ["", "Google Maps", "Google Maps", "GrabFood", "GrabFood", "ShopeeFood", "ShopeeFood", "Booking", "Booking"],
    ["", "Cafe A", "Cafe A", "Cafe A", "Cafe A", "Cafe A", "Cafe A", "Cafe A", "Cafe A"],
    ["Ngày", "Số review", "Điểm sao", "Số review", "Điểm sao", "Số review", "Điểm sao", "Số review", "Điểm sao"],
    ["15/10/2026", 100, 4.5, 40, 4.8, 12, 4.6, 5, 9],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
const data = () => { const buf = workbook(); return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); };
const locations = [{ id: "L1", name: "Cafe A" }];

test("GrabFood and ShopeeFood columns are recognised", () => {
  const preview = parseHistoricalReportWorkbook(data(), "f.xlsx", locations);
  assert.deepEqual(preview.rows.map((r) => r.platform).sort(), ["booking", "google", "grabfood", "shopeefood"]);
  assert.equal(preview.rows.find((r) => r.platform === "shopeefood").rating, 4.6);
});

test("importing a type skips platforms that type does not use", () => {
  const preview = parseHistoricalReportWorkbook(data(), "f.xlsx", locations, ["google", "tripadvisor", "grabfood", "shopeefood"]);
  assert.deepEqual(preview.rows.map((r) => r.platform).sort(), ["google", "grabfood", "shopeefood"]);
  assert.ok(preview.warnings.some((w) => w.includes("Booking")));
});

import assert from "node:assert/strict";
import test from "node:test";
import { reportWorkbook } from "../src/lib/report-export.ts";
import { parseHistoricalReportWorkbook } from "../src/lib/historical-report-import.ts";

const locations = [{ id: "L1", name: "Cafe A" }, { id: "L2", name: "Cafe B" }];
const snap = (locationId, platform, date, rating, reviewCount, rank = null) => ({ locationId, platform, date, rating, reviewCount, rank });
const snapshots = [
  snap("L1", "google", "2026-10-14", 4.5, 100), snap("L1", "google", "2026-10-15", 4.6, 102),
  snap("L1", "tripadvisor", "2026-10-15", 4.0, 30, "#12 trong 340 nhà hàng"),
  snap("L2", "google", "2026-10-15", 4.2, 50),
];

test("exports in the import template layout and the importer reads it back", () => {
  const { data, groups, dates } = reportWorkbook("Bảng số liệu", locations, ["google", "tripadvisor", "grabfood", "shopeefood"], snapshots);
  assert.equal(groups, 3); // grabfood / shopeefood have no data: no columns
  assert.equal(dates, 2);
  const preview = parseHistoricalReportWorkbook(data, "x.xlsx", locations);
  assert.equal(preview.rows.length, 4);
  const g = preview.rows.filter((r) => r.platform === "google" && r.sourceLocationName === "Cafe A");
  assert.deepEqual(g.map((r) => [r.reportDate, r.rating, r.reviewCount]), [["2026-10-14", 4.5, 100], ["2026-10-15", 4.6, 102]]);
  assert.ok(preview.warnings.some((w) => w.includes("xếp hạng"))); // the rank column exists and is skipped on import
  assert.deepEqual(preview.branches.map((b) => b.locationId).sort(), ["L1", "L2"]);
});

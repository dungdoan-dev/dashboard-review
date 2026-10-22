import test from "node:test";
import assert from "node:assert/strict";
import { stockTabs } from "./google-sheets.ts";

const tabs = ["MINIBAR 09/2026", "MINIBAR 10/2026", "AMENITIES 10/2026", "VẬT TƯ 10/2026", "ĐỒ VẢI 10/2026", "Danh mục"];

test("picks the tab of the month for each kho, in kho order", () => {
  assert.deepEqual(stockTabs(tabs, "2026-10"), ["MINIBAR 10/2026", "AMENITIES 10/2026", "VẬT TƯ 10/2026", "ĐỒ VẢI 10/2026"]);
  assert.deepEqual(stockTabs(tabs, "2026-09"), ["MINIBAR 09/2026"]);
});

test("a tab without a month still works, a month tab wins over it", () => {
  assert.deepEqual(stockTabs(["MINIBAR", "VẬT TƯ"], "2026-11"), ["MINIBAR", "VẬT TƯ"]);
  assert.deepEqual(stockTabs(["MINIBAR", "MINIBAR 11-2026"], "2026-11"), ["MINIBAR 11-2026"]);
});

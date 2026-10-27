import test from "node:test";
import assert from "node:assert/strict";
import { checkTabs, ledgerTabs, stockTabs, KHO_KINDS } from "./google-sheets.ts";

const hotel = ["Hướng dẫn", "BK THU 08/2026", "BK CHI 08/2026", "BK THU 09/2026", "BK CHI 09/2026", "DV NGOÀI 08/2026", "MINIBAR 08/2026"];
const fnb = ["Hướng dẫn", "Danh mục", "BK CHI 10-2026", "CHI MINIMART 10-2026", "BK THU 10-2026", "THU MINIMART 10-2026", "NGUYÊN LIỆU CAFE 10-2026", "NGUYÊN LIỆU ĂN SÁNG 10-2026", "VẬT TƯ 10-2026", "BK THU 09-2026"];

test("hotel: the ledger tabs of the month and the DV NGOÀI tab last, a single ledger tab is used as is", () => {
  assert.deepEqual(ledgerTabs(hotel, "2026-08"), ["BK THU 08/2026", "BK CHI 08/2026", "DV NGOÀI 08/2026"]);
  assert.deepEqual(ledgerTabs(hotel, "2026-10"), []);
  assert.deepEqual(ledgerTabs(["BK 2026", "Hướng dẫn"], "2026-12"), ["BK 2026"]);
  assert.deepEqual(ledgerTabs(["Hướng dẫn", "BK THU", "BK CHI", "DV NGOÀI", "MINIBAR"], "2026-08"), ["BK THU", "BK CHI", "DV NGOÀI"]); // one file per month: tabs without the month
  assert.deepEqual(ledgerTabs(["BK THU", "BK CHI", "BK THU 09/2026"], "2026-10"), []); // but not next to tabs of other months
});

test("fnb: the thu tabs then the chi tabs of the month, cafe and mini mart tabs both, other months and other tabs left out", () => {
  assert.deepEqual(ledgerTabs(fnb, "2026-10", "fnb"), ["BK THU 10-2026", "THU MINIMART 10-2026", "BK CHI 10-2026", "CHI MINIMART 10-2026"]);
  assert.deepEqual(ledgerTabs(fnb, "2026-09", "fnb"), ["BK THU 09-2026"]);
  assert.deepEqual(ledgerTabs(fnb, "2026-11", "fnb"), []);
  assert.deepEqual(ledgerTabs(["BK CHI", "BK THU", "Danh mục"], "2026-11", "fnb"), ["BK THU", "BK CHI"]); // tabs without a month serve any month
  assert.deepEqual(ledgerTabs(["BK THU 10-2026", "BK THU"], "2026-11", "fnb"), []); // but not next to tabs of other months
});

test("fnb kho: NGUYÊN LIỆU CAFE, NGUYÊN LIỆU ĂN SÁNG and VẬT TƯ of the month, the hotel's kinds are not looked for", () => {
  assert.deepEqual(stockTabs(fnb, "2026-10", KHO_KINDS.fnb), ["NGUYÊN LIỆU CAFE 10-2026", "NGUYÊN LIỆU ĂN SÁNG 10-2026", "VẬT TƯ 10-2026"]);
  assert.deepEqual(stockTabs(fnb, "2026-10"), ["VẬT TƯ 10-2026"]); // default = hotel kinds, VẬT TƯ is in both
  assert.deepEqual(stockTabs(["MINIBAR 10/2026"], "2026-10", KHO_KINDS.fnb), []);
  assert.deepEqual(stockTabs(["MINIBAR", "AMENITIES", "VẬT TƯ", "ĐỒ VẢI"], "2026-08"), ["MINIBAR", "AMENITIES", "VẬT TƯ", "ĐỒ VẢI"]); // one file per month: no month in the tab names
});

test("check: says what is missing for the month", () => {
  assert.deepEqual(checkTabs(fnb, "fnb", "2026-10").messages, []);
  const noChi = checkTabs(fnb.filter((t) => !/CHI/.test(t)), "fnb", "2026-10").messages;
  assert.deepEqual([noChi.length, noChi[0].startsWith("Thiếu tab chi")], [1, true]);
  assert.equal(checkTabs(["Hướng dẫn"], "fnb", "2026-10").messages.length, 3); // no thu tab, no chi tab, no kho tab
  const hotelOct = checkTabs(hotel, "hotel", "2026-10").messages;
  assert.deepEqual([hotelOct.length, hotelOct[0].startsWith("Thiếu tab bảng kê"), hotelOct[1].startsWith("Thiếu tab kho")], [2, true, true]);
  assert.deepEqual(checkTabs(hotel, "hotel", "2026-08").messages, []);
});

import test from "node:test";
import assert from "node:assert/strict";
import { fnbReport, fnbSales, fnbUnitOf, parseFnbIncome, parseFnbLedger } from "./fnb-ledger.ts";

const OCT1 = 46296; // 2026-10-01 as an Excel serial
const pad = (cells: unknown[], n: number) => [...cells, ...Array(Math.max(0, n - cells.length)).fill("")];

// cafe: BK THU, titles on rows 1-3, totals on row 4, a merged group only has its label in the first cell (as Google Sheet gives it)
const cafe = [
  pad(["BẢNG KÊ THU ĂN SÁNG, CAFE", "", "", "ĐƠN VỊ", "Ăn sáng, Cafe YZT", "Ăn sáng, Cafe YZT", "", "KỲ BÁO CÁO (tháng/năm)", OCT1], 14),
  ["NGÀY", "NGƯỜI BÁN", "NỘI DUNG", "NGUỒN KHÁC", "", "KHÁCH TRỰC TIẾP", "", "", "SHOPEE FOOD", "", "GRAB FOOD", "", "Doanh thu khách trực tiếp", "GHI CHÚ"],
  ["NGÀY", "NGƯỜI BÁN", "NỘI DUNG", "Tiền mặt", "Chuyển khoản", "Tiền mặt", "Chuyển khoản", "Thẻ POS", "Mã đơn", "Công nợ (+ phát sinh, − đã nhận)", "Mã đơn", "Công nợ (+ phát sinh, − đã nhận)", "Doanh thu khách trực tiếp", "GHI CHÚ"],
  ["TỔNG CỘNG THÁNG", "", "", 0, 0, 402400, 165000, 74000, "", 1314338, "", 0, 641400, ""],
  pad(["", "", "tồn shopee tháng 09", "", "", "", "", "", "", 1314338], 14), // the opening balance with the app has no date
  [OCT1, "Tài", "", "", "", "", 71400, 74000, "", "", "GF-132", 45808, 145400, ""],
  [OCT1, "Trinh", "", "", 20000, 331000, 94000, "", "", "", "", -45808, 425000, "ca sáng"],
  [OCT1 + 1, "", "", "", "", "", "", "", "", "", "", "", "", ""], // a date and nothing else
];

// mini mart: THU MINIMART, one row per day; the day table on the right (NGÀY again in column L) is not read
const mart = [
  pad(["BẢNG KÊ THU MINI MART SƠN TRÀ ĐN", "", "", "", "ĐƠN VỊ", "Mini mart Sơn Trà ĐN", "", "KỲ BÁO CÁO (tháng/năm)", OCT1], 14),
  ["NGÀY", "NỘI DUNG", "THU BÁN HÀNG", "", "ỨNG DỤNG (công nợ)", "", "KHÁC", "", "GHI CHÚ", "Doanh thu bán hàng", "", "NGÀY", "TIỀN MẶT (TK TM)"],
  ["", "", "Tiền mặt", "Chuyển khoản (tài khoản)", "Shopee Food", "Grab Food", "Tổng hàng huỷ", "Thuê phao", "", "", "", "", "Thu tiền mặt"], // NGÀY, NỘI DUNG, GHI CHÚ are merged over the two rows: only the upper cell has them
  ["TỔNG CỘNG THÁNG", "", 5417617, 3045261, 419528, 0, 0, 0, "", 8462878],
  [OCT1, "", "", "", 419528, "", "", "", "tồn shope tháng 9", "", "", OCT1, 2703011],
  [OCT1, "Thu tiền bán hàng", 2703011, 1707009, "", "", "", "", "", 4410020, "", OCT1 + 1, 2714606],
  [OCT1 + 1, "Thu tiền bán hàng", 2714606, 1338252, "", 153503, "", 50000, "", 4052858],
];

const chi = [
  pad(["BẢNG KÊ CHI ĂN SÁNG, CAFE", "", "ĐƠN VỊ", "Ăn sáng, Cafe YZT", "Ăn sáng, Cafe YZT", "KỲ BÁO CÁO (tháng/năm)", OCT1], 8),
  ["KHOẢN CHI", "KHOẢN CHI", "KHOẢN CHI", "CHI TIỀN RA KHỎI QUỸ", "", "", "GHI CHÚ", "Tổng chi"],
  ["Ngày", "Hạng mục", "Nội dung chi", "Chi tiền mặt", "Chi tiền CK", "Chi tiền CK thẻ visa", "GHI CHÚ", "Tổng chi"],
  ["TỔNG CỘNG THÁNG", "", "", 60000, 0, 0, "", 60000],
  [OCT1, "Chi NL cafe", "2 tg d", 30000, "", "", "", 30000],
  [OCT1, "Chi NL cafe", "2 tg scl", 30000, "", "", "", 30000],
];

test("cafe income: columns are found by name and group, the total row, the opening balance and empty dates are not lines", () => {
  const inc = parseFnbIncome("BK THU 10-2026", cafe);
  assert.deepEqual([inc.layout, inc.month, inc.unit, inc.lines.length], ["cafe", "2026-10", "Ăn sáng, Cafe YZT", 2]);
  const [a, b] = inc.lines;
  assert.deepEqual([a.date, a.seller, a.bank, a.pos, a.cash, a.shopee, a.grab, fnbSales(a)], ["2026-10-01", "Tài", 71400, 74000, 0, 0, 45808, 145400]);
  assert.deepEqual([b.seller, b.cash, b.bank, b.pos, b.otherBank, b.grab, b.row, fnbSales(b)], ["Trinh", 331000, 94000, 0, 20000, -45808, 7, 425000]);
});

test("mini mart income: one row per day, app balances and the mini mart extras, the day table on the right is not read", () => {
  const inc = parseFnbIncome("THU MINIMART 10-2026", mart);
  assert.deepEqual([inc.layout, inc.month, inc.unit, inc.lines.length], ["mart", "2026-10", "Mini mart Sơn Trà ĐN", 3]);
  const [open, a, b] = inc.lines; // the first row is the opening balance with Shopee, dated the 1st
  assert.deepEqual([open.shopee, fnbSales(open)], [419528, 0]);
  assert.deepEqual([a.date, a.cash, a.bank, fnbSales(a), a.note], ["2026-10-01", 2703011, 1707009, 4410020, "Thu tiền bán hàng"]);
  assert.deepEqual([b.date, b.grab, b.rental, fnbSales(b)], ["2026-10-02", 153503, 50000, 4052858]);
});

test("income and expense tabs of a month read together, in any order of the tabs", () => {
  const book = parseFnbLedger([{ name: "BK CHI 10-2026", rows: chi }, { name: "BK THU 10-2026", rows: cafe }]);
  assert.deepEqual([book.month, book.unit, book.income.length, book.expenses.length, book.expenses.reduce((s, e) => s + e.cash, 0), book.warnings], ["2026-10", "Ăn sáng, Cafe YZT", 1, 2, 60000, []]);
  const both = parseFnbLedger([{ name: "THU MINIMART 10-2026", rows: mart }, { name: "BK THU 10-2026", rows: cafe }]);
  assert.deepEqual([both.income.map((i) => i.layout), both.expenses.length, both.warnings.length], [["mart", "cafe"], 0, 1]); // no chi tab: said, not silent
});

test("a tab that is not an income tab of this layout is refused with its name", () => {
  assert.throws(() => parseFnbLedger([{ name: "BK CHI 10-2026", rows: chi }]), /tab thu/);
  assert.throws(() => parseFnbIncome("BK THU 10-2026", [["Ngày", "Người bán"], ["x"]]), /thiếu cột/);
  assert.throws(() => parseFnbIncome("BK THU 10-2026", [["a", "b"]]), /BK THU 10-2026/);
});

test("the month's report per unit: sales, spending, funds (POS into the bank), the unit of each tab, and what looks wrong", () => {
  assert.deepEqual(["BK THU 10-2026", "BK CHI", "THU MINIMART", "chi minimart 10-2026", "NGUYÊN LIỆU CAFE", "Hướng dẫn"].map(fnbUnitOf), ["cafe", "cafe", "mart", "mart", null, null]);
  const r = fnbReport([{ name: "Danh mục", rows: [["x"]] }, { name: "BK THU", rows: cafe }, { name: "BK CHI", rows: chi }, { name: "THU MINIMART", rows: mart }], "2026-10");
  const [c, m] = r.units;
  assert.deepEqual([c.unit, c.sales, c.spent.total, c.expenses, c.funds], ["cafe", { cash: 331000, bank: 165400, pos: 74000, total: 570400 }, 60000, 2, { cash: 331000 - 60000, bank: 165400 + 74000 + 20000 }]);
  assert.deepEqual([m.unit, m.sales.total, m.apps.shopee, m.rental, m.tree.every((g) => g.total === 0)], ["mart", 8462878, 419528, 50000, true]);
  assert.deepEqual(r.units.map((u) => u.days.length), [1, 2]); // cafe: everything on the 1st
  assert.deepEqual(r.warnings, ["Mini mart: không thấy tab chi, chi tính 0."]); // "Chi NL cafe" is an old name of "Chi nguyên liệu pha chế": found
  assert.deepEqual(c.tree.filter((g) => g.total).map((g) => [g.group, g.total]), [["Chi phí vận hành", 60000]]);
  const odd = fnbReport([{ name: "BK THU", rows: cafe }, { name: "BK CHI", rows: [...chi.slice(0, 4), [OCT1, "Chi lạ", "x", 1000, "", "", "", 1000]] }]);
  assert.deepEqual(odd.warnings, ["Ăn sáng, cafe: hạng mục chi không có trong danh mục: “Chi lạ”."]);
  assert.ok(fnbReport([{ name: "BK THU", rows: cafe }], "2026-11").warnings.some((w) => /khác tháng/.test(w)));
  assert.throws(() => fnbReport([{ name: "Hướng dẫn", rows: [] }]), /Không thấy tab thu chi/);
});

test("the day rows carry the money in and out of each fund (other sources too) and the unit's balances", () => {
  const r = fnbReport([{ name: "BK THU", rows: cafe }, { name: "BK CHI", rows: chi }]);
  const day = r.units[0].days[0];
  assert.deepEqual([day.inCash, day.inBank, day.outCash, day.outBank], [331000, 71400 + 74000 + 94000 + 20000, 60000, 0]);
  assert.deepEqual(r.units[0].balances, { openCash: null, closeCash: null, openBank: null, closeBank: null });
  const withBalance = cafe.map((row, i) => (i === 0 ? [...row.slice(0, 13), "Đầu kỳ tiền mặt", 777] : row));
  assert.equal(fnbReport([{ name: "BK THU", rows: withBalance }]).units[0].balances.openCash, 777);
});

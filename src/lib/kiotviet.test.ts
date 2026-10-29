import test from "node:test";
import assert from "node:assert/strict";
import { compareKiotviet, isKiotvietTab, isMartTab, parseKiotviet } from "./kiotviet.ts";
import type { FnbIncomeLine } from "./fnb-ledger.ts";

const OCT1 = 46296; // 2026-10-01 as an Excel serial
const HEAD = ["Nhóm hàng", "Mã hàng", "Tên hàng", "Mã hóa đơn", "Thời gian", "Người nhận đơn", "Giá trị niêm yết chi tiết", "Doanh thu chi tiết"];
const line = (inv: string, time: number, listed: number, revenue: number) => ["CAFE", "CT1", "Cà phê", inv, time, "thungan", listed, revenue];
const line0 = (date: string, cash: number, bank: number, pos = 0, hotel = 0): FnbIncomeLine => ({ row: 1, date, seller: "", note: "", cash, bank, pos, otherCash: 0, otherBank: 0, shopee: 0, grab: 0, be: 0, hotel, voided: 0, rental: 0 });

test("tab names: the export of a week, the mini mart one", () => {
  assert.deepEqual(["KIOTVIET CAFE", "Kiotviet Mini Mart", "KIOTVIET", "BaoCaoBanHangTheoHangHoa_KV2910", "BK THU"].map(isKiotvietTab), [true, true, false, false, false]);
  assert.deepEqual([isMartTab("KIOTVIET MINIMART"), isMartTab("KIOTVIET CAFE")], [true, false]);
});

test("export: one row per item, invoices counted once, the day is the whole part of the time (a late invoice does not move to the next day)", () => {
  const rows = [["", "Báo cáo"], HEAD, line("HD1", OCT1 + 0.4, 37000, 29600), line("HD1", OCT1 + 0.4, 20000, 20000), line("HD2", OCT1 + 0.999, 50000, 50000), line("HD3", OCT1 + 1.1, 10000, 9000)];
  const kv = parseKiotviet([{ name: "KIOTVIET", rows }]);
  assert.deepEqual(kv.days, [{ date: "2026-10-01", invoices: 2, listed: 107000, revenue: 99600 }, { date: "2026-10-02", invoices: 1, listed: 10000, revenue: 9000 }]);
  assert.deepEqual([kv.lines, kv.invoices, kv.duplicates], [4, 3, 0]);
});

test("an invoice pasted in two tabs is counted once; a tab that is not the export is an error", () => {
  const a = { name: "KIOTVIET CAFE", rows: [HEAD, line("HD1", OCT1, 100, 90)] }, b = { name: "KIOTVIET CAFE 2", rows: [HEAD, line("HD1", OCT1, 100, 90), line("HD2", OCT1 + 1, 50, 50)] };
  const kv = parseKiotviet([a, b]);
  assert.deepEqual([kv.invoices, kv.duplicates, kv.days.map((d) => d.revenue)], [2, 1, [90, 50]]);
  assert.throws(() => parseKiotviet([{ name: "KIOTVIET", rows: [["a", "b"]] }]), /không phải báo cáo KiotViet/);
});

test("compare: by day, only inside the days of the export, differences and days missing on one side", () => {
  const kv = parseKiotviet([{ name: "KIOTVIET", rows: [HEAD, line("HD1", OCT1 + 7, 1000, 900), line("HD2", OCT1 + 8, 2000, 1800), line("HD3", OCT1 + 9, 500, 500)] }]);
  const cmp = compareKiotviet(kv, [line0("2026-10-01", 5, 5), line0("2026-10-08", 600, 300), line0("2026-10-09", 1000, 700, 100, 40), line0("2026-10-11", 10, 0), line0("2026-10-20", 99, 99)]);
  assert.deepEqual([cmp.from, cmp.to], ["2026-10-08", "2026-10-10"]);
  assert.deepEqual(cmp.rows.map((r) => [r.date, r.kiot, r.book, r.diff]), [["2026-10-08", 900, 900, 0], ["2026-10-09", 1800, 1800, 0], ["2026-10-10", 500, 0, 500]]);
  assert.deepEqual([cmp.bad, cmp.discount, cmp.invoices, cmp.rows[1].hotel], [1, 100 + 200, 3, 40]);
});

test("summary: by week (discount negative) and by group of goods, items sorted by revenue", async () => {
  const { kiotvietSummary } = await import("./kiotviet.ts");
  const rows = [HEAD.concat("SL"), ["CAFE", "C1", "Cà phê sữa", "HD1", OCT1 + 0.4, "t", 37000, 29600, 1], ["CAFE", "C1", "Cà phê sữa", "HD2", OCT1 + 8.1, "t", 74000, 66600, 2], ["BÁNH", "B1", "Croissant", "HD2", OCT1 + 8.1, "t", 35000, 35000, 1]];
  const kv = parseKiotviet([{ name: "KIOTVIET CAFE", rows }]);
  const s = kiotvietSummary(kv, [{ label: "Tuần 1", from: "2026-10-01", to: "2026-10-04" }, { label: "Tuần 2", from: "2026-10-05", to: "2026-10-11" }, { label: "Cả tháng", from: "2026-10-01", to: "2026-10-31" }]);
  assert.deepEqual(s.weeks.map((w) => [w.invoices, w.listed, w.discount, w.revenue]), [[1, 37000, -7400, 29600], [1, 109000, -7400, 101600], [2, 146000, -14800, 131200]]);
  assert.deepEqual(s.groups.map((g) => [g.group, g.qty, g.revenue]), [["CAFE", 3, 96200], ["BÁNH", 1, 35000]]);
  assert.deepEqual(s.items.map((i) => i.name), ["Cà phê sữa", "Croissant"]);
});

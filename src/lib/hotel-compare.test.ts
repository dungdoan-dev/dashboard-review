import test from "node:test";
import assert from "node:assert/strict";
import { compareRows } from "./hotel-compare.ts";
import type { DailyRevenue } from "./bluejay-daily.ts";
import type { RangeData } from "./bluejay-range.ts";

const day = (date: string, room: number, services: Record<string, number> = {}, commission = 0) => ({ date, rooms: 0, room, commission, services, service: 0, total: 0, excludedRooms: 0, excludedRoom: 0 });
const daily = { hotels: [
  { id: 1, name: "A", days: [day("2026-10-01", 1000, { Minibar: 50, "Giặt ủi": 20, "Dịch vụ ngoài": 30, "Ăn Sáng": 5 }, 100), day("2026-10-06", 400)] },
  { id: 2, name: "B", days: [day("2026-10-02", 600, { Minibar: 10 })] },
] } as unknown as DailyRevenue;
const occ = (date: string, occupied: number, total: number) => ({ date, occupied, total });
const range = { dates: ["2026-10-01", "2026-10-02", "2026-10-06"], hotels: [
  { id: 1, days: [occ("2026-10-01", 6, 10), null, occ("2026-10-06", 3, 10)] },
  { id: 2, days: [occ("2026-10-01", 2, 5), occ("2026-10-02", 3, 5), null] },
] } as unknown as RangeData;

test("one row per hotel and week then the chain, like the accountant's sheet: nights, rooms for sale, occupancy, five revenue lines, deduction, total", () => {
  const rows = compareRows("2026-10", daily, range);
  const w1 = rows.filter((r) => r.week === "Tuần 40");
  assert.deepEqual(w1.map((r) => r.hotel), ["A", "B", "Toàn chuỗi"]);
  const [a, b, chain] = w1;
  assert.deepEqual([a.rooms, a.available, a.occ, a.room, a.minibar, a.laundry, a.outside, a.other, a.deduction, a.total], [6, 10, 0.6, 1000, 50, 20, 30, 5, -100, 1005]); // 1105 - 100
  assert.deepEqual([b.rooms, b.available, b.occ, b.room, b.deduction, b.total], [5, 10, 0.5, 600, 0, 610]); // B sold nothing through an OTA
  assert.deepEqual([chain.rooms, chain.available, chain.occ, chain.room, chain.deduction, chain.total, chain.chain], [11, 20, 0.55, 1600, -100, 1615, true]);
});

test("a week and the month are cut at the month's ends, the last block is the whole month, days without a stored occupancy are counted", () => {
  const rows = compareRows("2026-10", daily, range);
  assert.equal(rows.filter((r) => r.week === "Tuần 41").find((r) => r.hotel === "A")!.room, 400); // 5-11 Oct: the 6th
  const month = rows.filter((r) => r.week === "Cả tháng");
  assert.deepEqual(month.map((r) => r.hotel), ["A", "B", "Toàn chuỗi"]);
  assert.deepEqual([month[0].room, month[0].rooms, month[0].available, month[2].room], [1400, 9, 20, 2000]);
  assert.equal(month[0].missingDays, 31 - 2); // A has two stored days of 31
  assert.deepEqual(month.map((r) => r.deduction), [-100, 0, -100]); // the commission of the days adds up over the month
});

test("the Excel sheet is ruled: two header rows with the revenue band, a week cell merged down its block, real numbers with their formats, the chain row bold", async () => {
  const { compareWorkbook } = await import("./hotel-compare-excel.ts");
  const ws = compareWorkbook("BÁO CÁO TỔNG HỢP KHÁCH SẠN THÁNG 10/2026", compareRows("2026-10", daily, range)).getWorksheet("So sánh khách sạn")!;
  assert.equal(ws.getCell("F2").value, "DOANH THU TUẦN");
  assert.equal(ws.getCell("L3").value, "Tổng");
  const merges = Object.keys(ws.model.merges ?? {}).length ? ws.model.merges : [];
  assert.ok(merges.includes("A4:A6") && merges.includes("F2:L2")); // week 40: A, B and the chain
  assert.deepEqual([ws.getCell("C4").value, ws.getCell("E4").value, ws.getCell("E4").numFmt, ws.getCell("K4").value, ws.getCell("L4").value], [6, 0.6, "0.00%", -100, 1005]);
  assert.ok(ws.getCell("B6").font?.bold && ws.getCell("A4").border?.top?.style === "thin");
});

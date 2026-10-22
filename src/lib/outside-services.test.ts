import test from "node:test";
import assert from "node:assert/strict";
import { parseOutsideServices } from "./outside-services.ts";

const head = ["DATE\n( ngày đặt)", "Nhân viên", "ID PHÒNG", "Dich vụ", "Diễn giải", "Giá DV thuê", "Giá bán DV", "Lợi nhuận", "Chiết khấu 20%", "Ghi chú", "DV", "Giá DV thuê DV"];
const rows = [
  [1, 2], ["BẢNG DỊCH VỤ NGOÀI"], head,
  ["", "", "", "", "", 860000, 2180000, 1320000, 264000], // totals row
  [46297, "", "010166", "DV Xe máy", "2,5 ngày", 140000, 325000, 185000, 37000, "", "DV Xe máy", 860000],
  [46302, "", "2026111", "DV giặt ủi", "4kg", "", 200000, 200000, 40000],
  [46304, "", "010267", "DV Xe máy", "", 90000, 160000, 70000, 14000],
  ["", "", "", "", "", "", "", 0, 0],
];

test("reads the lines, skips totals and blanks, adds up per service (biggest sale first)", () => {
  const { lines, byService } = parseOutsideServices(rows);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[0], { row: 5, date: "2026-10-02", room: "010166", service: "DV Xe máy", note: "2,5 ngày", cost: 140000, price: 325000, profit: 185000, discount: 37000 });
  assert.deepEqual(byService.map((s) => [s.name, s.count, s.cost, s.price, s.profit]), [["DV Xe máy", 2, 230000, 485000, 255000], ["DV giặt ủi", 1, 0, 200000, 200000]]);
});

test("a sheet without the columns is refused", () => {
  assert.throws(() => parseOutsideServices([["a", "b"]]), /dịch vụ ngoài/);
});

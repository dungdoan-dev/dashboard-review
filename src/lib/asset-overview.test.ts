import assert from "node:assert/strict";
import test from "node:test";
import { assetOverview, lastMonths, money } from "./asset-overview.ts";
import type { AssetPayload } from "./asset-forms.ts";

const row = (at: Record<number, string>) => Array.from({ length: 38 }, (_, i) => at[i] ?? "");
const sheet = (rows: string[][]) => ({ headers: [], inputs: [], rows: rows.map((cells, i) => ({ row: 4 + i, cells })) });

test("money from the sheet's display", () => { assert.equal(money("24.000.000"), 24000000); assert.equal(money("-"), 0); assert.equal(money(""), 0); assert.equal(money("abc"), 0); });
test("12 months ending this month", () => { const m = lastMonths(new Date(2026, 0, 15)); assert.equal(m[0], "2025-02"); assert.equal(m[11], "2026-01"); });

test("overview: disposed assets left out, values by type, alerts and late loans", () => {
  const data = { lists: [], tabs: {
    ts: sheet([
      row({ 0: "A1", 1: "Laptop 1", 3: "Laptop", 10: "24.000.000", 24: "12.000.000", 25: "12.000.000", 31: "Đang sử dụng", 37: "Bảo trì quá hạn." }),
      row({ 0: "A2", 1: "Laptop 2", 3: "Laptop", 10: "6.000.000", 24: "1.000.000", 25: "5.000.000", 31: "Trong kho" }),
      row({ 0: "A3", 1: "Máy cũ", 3: "Máy in", 10: "9.000.000", 20: "30/09/2026", 25: "-", 31: "Đã thanh lý" }),
    ]),
    mt: sheet([["MU-1", "A2", "Laptop 2", "NV1", "An", "", "25/10/2026", "", "", "Quá hạn", "11"]]),
    bt: sheet([["BT-1", "A1", "", "", "20/08/2026", "21/08/2026", "21/08/2026", "", "", "650.000"], ["BT-2", "A1", "", "", "04/11/2026", "", "", "", "", "1.200.000"]]),
    bg: sheet([]), kk: sheet([]), tl: sheet([]), loai: sheet([]), nv: sheet([]),
  } } as unknown as AssetPayload;
  const o = assetOverview(data, new Date(2026, 10, 5));
  assert.equal(o.count, 2); assert.equal(o.disposed, 1);
  assert.equal(o.cost, 30000000); assert.equal(o.left, 17000000); assert.equal(o.usedShare, 13 / 30);
  assert.deepEqual(o.byType, [{ x: "Laptop", left: 17000000, used: 13000000 }]);
  assert.equal(o.byStatus.length, 3);
  assert.equal(o.issues.length, 2); assert.match(o.issues[1].text, /quá hạn 11 ngày/);
  assert.equal(o.maintenance.find((m) => m.x === "08/26")?.cost, 650000);
  assert.equal(o.maintenance.find((m) => m.x === "11/26")?.cost, 1200000);
  assert.equal(o.maintenanceTotal, 1850000);
});

import assert from "node:assert/strict";
import test from "node:test";
import { assetFormValues, cleanAssetFields, colIndex, nextAssetId } from "./asset-forms.ts";

test("column letters", () => { assert.equal(colIndex("A"), 0); assert.equal(colIndex("Z"), 25); assert.equal(colIndex("AL"), 37); });

test("next slip number of this year", () => {
  assert.equal(nextAssetId(["BG-2026-0001", "BG-2026-0007", "BG-2025-0099"], 2026), "BG-2026-0008");
  assert.equal(nextAssetId(["BG-2025-0099"], 2026), "BG-2026-0001");
  assert.equal(nextAssetId(["VP-LT-00001"], 2026), "");
});

test("edit values: dates to yyyy-mm-dd, amounts without dots", () => {
  const cells = ["VP-LT-00001", "Laptop", "LT", "Laptop", "", "", "", "", "10/03/2025", "15/03/2025", "24.000.000", "", "36", "-"];
  const v = assetFormValues("ts", cells);
  assert.equal(v.I, "2025-03-10"); assert.equal(v.K, "24000000"); assert.equal(v.N, ""); assert.equal(v.A, "VP-LT-00001");
});

test("save fields: only input columns, checked by type", () => {
  const out = cleanAssetFields("ts", { A: " VP-LT-1 ", B: "Laptop", C: "LT", J: "2026-01-02", K: "100", D: "formula column", AL: "x" });
  assert.deepEqual(out, { A: "VP-LT-1", B: "Laptop", C: "LT", J: "2026-01-02", K: "100" });
  assert.throws(() => cleanAssetFields("ts", { A: "x", B: "y", C: "LT", J: "2026-01-02", K: "1.000" }), /số nguyên/);
  assert.throws(() => cleanAssetFields("ts", { A: "x", B: "y", C: "LT", J: "02/01/2026", K: "1" }), /ngày/);
  assert.throws(() => cleanAssetFields("bg", { A: "BG-1" }), /Thiếu/);
});

test("filter by unit: assets by their unit, slips through their asset, types kept", async () => {
  const { filterByUnit } = await import("./asset-forms.ts");
  const row = (at: Record<number, string>) => Array.from({ length: 16 }, (_, i) => at[i] ?? "");
  const sheet = (rows: string[][]) => ({ headers: [], inputs: [], rows: rows.map((cells, i) => ({ row: 4 + i, cells })) });
  const data = { lists: [], tabs: {
    ts: sheet([row({ 0: "A1", 14: "VP" }), row({ 0: "A2", 14: "CN01" })]),
    bg: sheet([row({ 0: "BG-1", 3: "A1" }), row({ 0: "BG-2", 3: "A2" })]),
    mt: sheet([row({ 0: "MU-1", 1: "A2" })]), bt: sheet([]), kk: sheet([row({ 0: "KK", 2: "A1" })]), tl: sheet([]),
    loai: sheet([row({ 0: "LT" })]), nv: sheet([row({ 0: "NV1", 5: "VP" }), row({ 0: "NV2", 5: "CN01" })]),
  } } as never;
  const vp = filterByUnit(data, "VP").tabs;
  assert.deepEqual([vp.ts, vp.bg, vp.mt, vp.kk, vp.loai, vp.nv].map((s) => s.rows.map((r) => r.cells[0])), [["A1"], ["BG-1"], [], ["KK"], ["LT"], ["NV1"]]);
});

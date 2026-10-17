import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { GUIDE_FIELD_KEYS } from "./bluejay-ledger-guide.ts";
import { buildLedgerTemplate } from "./bluejay-ledger-template.ts";

const LETTERS = "ABCDEFGHIJKLMNOPQRST".split(""); // the template's columns A..T

// "Cột H, I, J" -> H I J; "Cột K đến P" -> K..P; "Cột A" -> A
const expand = (key: string) => {
  const range = key.match(/Cột ([A-Z]) đến ([A-Z])/);
  if (range) return LETTERS.slice(LETTERS.indexOf(range[1]), LETTERS.indexOf(range[2]) + 1);
  return key.startsWith("Cột") ? key.replace("Cột", "").split(",").map((c) => c.trim()) : [];
};

test("the guide explains every column of the template, and both cells above the table", () => {
  assert.deepEqual([...new Set(GUIDE_FIELD_KEYS.flatMap(expand))].sort(), LETTERS);
  assert.ok(GUIDE_FIELD_KEYS.includes("Ô E1") && GUIDE_FIELD_KEYS.includes("Ô J1"));
});

test("the guide sheet has its sections, and no cell the reconcile page could take for the ledger header", async () => {
  const read = XLSX.read(await buildLedgerTemplate().xlsx.writeBuffer(), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(read.Sheets["Hướng dẫn"], { header: 1, defval: "" });
  const cells = rows.flat().map((c) => String(c));
  for (const section of ["1. CÁCH DÙNG", "2. HƯỚNG DẪN TỪNG MỤC", "3. TOOL SO SÁNH THẾ NÀO", "4. CÁCH ĐỌC KẾT QUẢ ĐỐI SOÁT", "5. TRƯỜNG HỢP ĐẶC BIỆT", "6. VÍ DỤ", "7. LỖI THƯỜNG GẶP"]) {
    assert.ok(cells.some((c) => c.startsWith(section)), `missing section ${section}`);
  }
  assert.ok(!cells.some((c) => c.trim().toUpperCase() === "ID HỆ THỐNG"));
  assert.ok(cells.some((c) => c === "Cột T") && cells.some((c) => c.startsWith("Khớp")));
});

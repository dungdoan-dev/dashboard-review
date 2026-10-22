import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { KHO_SHEETS, buildStockFile } from "./inventory-template.ts";
import { parseInventorySheet, stockReport } from "./inventory.ts";

type Sheet = { getCell: (a: string) => { value: unknown } };
const formula = (ws: Sheet, ref: string) => String((ws.getCell(ref).value as { formula: string }).formula);
const R = (col: string, last: number) => `$${col}$5:$${col}$${last}`;

test("a kho is one sheet: the stock block sums the three lists on the same sheet by item, with the finance team's valuation", () => {
  const book = buildStockFile(KHO_SHEETS.map((sheet) => ({ sheet, title: sheet, items: [{ name: "Snack", kind: "Bán", unit: "Túi", openQty: 72, openValue: 302_400, bluejay: "Snack" }] })), "10/2026");
  assert.deepEqual(book.worksheets.map((w) => w.name), ["MINIBAR", "AMENITIES", "VẬT TƯ", "ĐỒ VẢI"]);
  const ws = book.getWorksheet("MINIBAR")!;
  assert.deepEqual(["R5", "S5", "U5", "V5", "W5"].map((a) => ws.getCell(a).value), ["Snack", "Bán", 72, 302_400, "Snack"]);
  assert.equal(formula(ws, "Y5"), `IF($R5="","",SUMIFS(${R("C", 1504)},${R("B", 1504)},$R5,${R("A", 1504)},">="&$S$2,${R("A", 1504)},"<="&EOMONTH($S$2,0)))`);
  assert.equal(formula(ws, "AA5"), `IF($R5="","",SUMIFS(${R("J", 6004)},${R("I", 6004)},$R5,${R("G", 6004)},">="&$S$2,${R("G", 6004)},"<="&EOMONTH($S$2,0)))`);
  assert.equal(formula(ws, "AB5"), 'IF($R5="","",IF($X5>0,$X5,IF($U5+Y5>0,($V5+Z5)/($U5+Y5),0)))'); // a fixed price, else the weighted average
  assert.equal(formula(ws, "AC5"), 'IF($R5="","",AA5*AB5)');
  assert.equal(formula(ws, "AD5"), 'IF($R5="","",$U5+Y5-AA5)');
  assert.equal(formula(ws, "AE5"), 'IF($R5="","",$V5+Z5-AC5)');
  assert.match(formula(ws, "AG5"), /^IF\(\$R5="","",IF\(MAXIFS\(\$M\$5:\$M\$2004,\$N\$5:\$N\$2004,\$R5,/); // the date of the latest count in the month
  assert.match(formula(ws, "AH5"), /"<="&\$AG5/); // what the books say on that day
  assert.equal(formula(ws, "AI5"), 'IF(OR($R5="",AG5=""),"",AF5-AH5)');
  assert.equal(formula(ws, "AJ5"), 'IF(OR($R5="",AG5=""),"",AI5*AB5)');
  assert.equal((ws.getCell("B5").dataValidation as { formulae: string[] }).formulae[0], "$R$5:$R$44"); // the item drop-downs point at the item list of the same sheet
  assert.equal((ws.getCell("I5").dataValidation as { formulae: string[] }).formulae[0], "$R$5:$R$44");
});

test("what is typed in the three lists and the item list is read back by the parser", async () => {
  const book = buildStockFile([{ sheet: "MINIBAR", title: "MINIBAR", items: [{ name: "Snack", kind: "Bán", unit: "Túi", openQty: 72, openValue: 302_400 }, { name: "Nước suối (miễn phí)", kind: "Miễn phí", unit: "Chai", openQty: 576, openValue: 2_106_250, fixedPrice: 3125 }] }], "10/2026");
  const ws = book.getWorksheet("MINIBAR")!;
  ws.getCell("A5").value = new Date(Date.UTC(2026, 9, 5)); ws.getCell("B5").value = "Snack"; ws.getCell("C5").value = 30; ws.getCell("D5").value = 135_000;
  ws.getCell("G5").value = new Date(Date.UTC(2026, 9, 1)); ws.getCell("H5").value = "405"; ws.getCell("I5").value = "Snack"; ws.getCell("J5").value = 2;
  ws.getCell("M5").value = new Date(Date.UTC(2026, 9, 4)); ws.getCell("N5").value = "Snack"; ws.getCell("O5").value = 69;
  const read = XLSX.read(await book.xlsx.writeBuffer(), { type: "buffer" });
  const inv = parseInventorySheet(XLSX.utils.sheet_to_json<unknown[]>(read.Sheets["MINIBAR"], { header: 1, defval: "" }));
  assert.deepEqual([inv.items.map((i) => i.name), inv.items[1].fixedPrice, inv.receipts.length, inv.issues.length, inv.counts.length, inv.month], [["Snack", "Nước suối (miễn phí)"], 3125, 1, 1, 1, "2026-10"]);
  const r = stockReport(inv, { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual([r.lines[0].issueQty, r.lines[0].closingQty, r.lines[0].count!.expected, r.lines[0].count!.diff], [2, 100, 70, -1]);
});

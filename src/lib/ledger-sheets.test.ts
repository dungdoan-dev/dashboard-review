import test from "node:test";
import assert from "node:assert/strict";
import { isSheetKind, pickLinks, sheetIdFromLink, sheetUrl } from "./ledger-sheets.ts";

const ID = "1HvweFPj0RlzUA3qUaBYVQOoHh8PrBLpuTvDIqIelTmU";

test("the id is taken from a pasted Google Sheet link, with or without the tail, or from the bare id", () => {
  for (const link of [`https://docs.google.com/spreadsheets/d/${ID}/edit`, `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=123`, `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`, `  https://docs.google.com/spreadsheets/d/${ID}  `, ID]) assert.equal(sheetIdFromLink(link), ID, link);
  assert.equal(sheetUrl(ID), `https://docs.google.com/spreadsheets/d/${ID}/edit`);
});

test("anything else is refused: another host, a short id, text", () => {
  for (const bad of ["", "abc", `https://evil.example/spreadsheets/d/${ID}/edit`, `http://docs.google.com/spreadsheets/d/${ID}/edit`, "https://docs.google.com/document/d/" + ID, `${ID} extra`]) assert.equal(sheetIdFromLink(bad), null, bad);
  assert.deepEqual([isSheetKind("hotel"), isSheetKind("fnb"), isSheetKind("kho"), isSheetKind(undefined)], [true, true, false, false]);
});

test("a month uses its own link, else the shared one, and never the link of another month", () => {
  const row = (hotel_id: number, kind: "hotel" | "fnb", month: string, sheet_id: string) => ({ hotel_id, kind, month, sheet_id });
  const list = [row(1, "hotel", "", "SHARED"), row(1, "hotel", "2026-09", "SEP"), row(1, "hotel", "2026-10", "OCT"), row(1, "fnb", "2026-10", "FNB-OCT"), row(2, "hotel", "2026-09", "OTHER-SEP")];
  assert.deepEqual(pickLinks(list, "2026-10"), { 1: { hotel: { id: "OCT", own: true }, fnb: { id: "FNB-OCT", own: true } } });
  assert.deepEqual(pickLinks(list, "2026-11"), { 1: { hotel: { id: "SHARED", own: false } } });
  assert.deepEqual(pickLinks([...list].reverse(), "2026-09"), { 1: { hotel: { id: "SEP", own: true } }, 2: { hotel: { id: "OTHER-SEP", own: true } } });
});

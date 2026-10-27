import test from "node:test";
import assert from "node:assert/strict";
import { isSheetKind, sheetIdFromLink, sheetUrl } from "./ledger-sheets.ts";

const ID = "1HvweFPj0RlzUA3qUaBYVQOoHh8PrBLpuTvDIqIelTmU";

test("the id is taken from a pasted Google Sheet link, with or without the tail, or from the bare id", () => {
  for (const link of [`https://docs.google.com/spreadsheets/d/${ID}/edit`, `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=123`, `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`, `  https://docs.google.com/spreadsheets/d/${ID}  `, ID]) assert.equal(sheetIdFromLink(link), ID, link);
  assert.equal(sheetUrl(ID), `https://docs.google.com/spreadsheets/d/${ID}/edit`);
});

test("anything else is refused: another host, a short id, text", () => {
  for (const bad of ["", "abc", `https://evil.example/spreadsheets/d/${ID}/edit`, `http://docs.google.com/spreadsheets/d/${ID}/edit`, "https://docs.google.com/document/d/" + ID, `${ID} extra`]) assert.equal(sheetIdFromLink(bad), null, bad);
  assert.deepEqual([isSheetKind("hotel"), isSheetKind("fnb"), isSheetKind("kho"), isSheetKind(undefined)], [true, true, false, false]);
});

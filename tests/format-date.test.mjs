import assert from "node:assert/strict";
import test from "node:test";
import { fmtDate, fmtDateTime, parseDmy } from "../src/lib/format-date.ts";

test("formats dates as dd/mm/yyyy in Vietnam time", () => {
  assert.equal(fmtDate("2026-10-05"), "05/10/2026");
  assert.equal(fmtDate("2026-10-14T20:47:29Z"), "15/10/2026"); // 03:47 on the 15th in Vietnam
  assert.equal(fmtDateTime("2026-10-14T02:57:02Z"), "09:57 14/10/2026");
});

test("parseDmy accepts real dates only", () => {
  assert.equal(parseDmy("5/10/2026"), "2026-10-05");
  assert.equal(parseDmy("31/02/2026"), null);
  assert.equal(parseDmy("2026-10-05"), null);
});

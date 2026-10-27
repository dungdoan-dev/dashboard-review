import test from "node:test";
import assert from "node:assert/strict";
import { customValid, rangeLabel, rangeWindow } from "./report-range.ts";

const none = { from: "", to: "" };

test("numeric ranges count back from the anchor day, inclusive; all has no limit", () => {
  assert.deepEqual(rangeWindow("7", none, "2026-10-27"), { start: "2026-10-21", end: null });
  assert.deepEqual(rangeWindow("30", none, "2026-10-27"), { start: "2026-09-28", end: null });
  assert.deepEqual(rangeWindow("all", none, "2026-10-27"), { start: null, end: null });
});

test("a typed range is used as it is and must be real, ordered dates", () => {
  assert.deepEqual(rangeWindow("custom", { from: "2026-10-01", to: "2026-10-20" }, "2026-10-27"), { start: "2026-10-01", end: "2026-10-20" });
  assert.equal(customValid({ from: "2026-10-01", to: "2026-10-01" }), true);
  assert.equal(customValid({ from: "2026-10-02", to: "2026-10-01" }), false);
  assert.equal(customValid({ from: "", to: "2026-10-01" }), false);
  assert.equal(customValid({ from: "2026-02-31x", to: "2026-03-01" }), false);
});

test("label names the range for headings", () => {
  const fmt = (d: string) => d.split("-").reverse().join("/");
  assert.equal(rangeLabel("30", none, fmt), "30 ngày");
  assert.equal(rangeLabel("all", none, fmt), "Toàn bộ");
  assert.equal(rangeLabel("custom", { from: "2026-10-01", to: "2026-10-20" }, fmt), "01/10/2026 – 20/10/2026");
});

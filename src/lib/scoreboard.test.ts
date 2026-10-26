import test from "node:test";
import assert from "node:assert/strict";
import { computeScoreRow } from "./scoreboard.ts";
import type { LocationRecord } from "./types.ts";

const location = { id: "L", agoda: { rating: 9, ratingScale: 10, reviewCount: null, countLabel: "đánh giá", capturedAt: "2026-10-26T00:00:00Z" } } as unknown as LocationRecord;

test("Agoda có điểm nhưng thiếu số đánh giá: lấy số gần nhất và so với mốc", () => {
  const row = computeScoreRow(location, ["agoda"], 5, { "L|agoda": { score: 4.45, count: 543 } }, { "L|agoda": 550 });
  assert.equal(row.cells.agoda?.count, 550);
  assert.equal(row.cells.agoda?.dCount, 7);
  assert.equal(row.total, 550);
});

test("không có số gần nhất thì vẫn để trống", () => {
  assert.equal(computeScoreRow(location, ["agoda"], 5, {}).cells.agoda?.count, null);
});

import assert from "node:assert/strict";
import test from "node:test";
import { computeScoreRow } from "../src/lib/scoreboard.ts";

const metric = (rating, ratingScale, reviewCount, capturedAt = "2026-10-14T05:00:00Z") => ({ rating, ratingScale, reviewCount, countLabel: "đánh giá", capturedAt });
const location = (extra) => ({ id: "L1", name: "A", area: "", type: "hotel", googleUrl: "", tripadvisorUrl: "", agodaUrl: "", bookingUrl: "", tripcomUrl: "", google: null, tripadvisor: null, agoda: null, booking: null, tripcom: null, ...extra });

test("averages scores on one scale and sums review counts", () => {
  const row = computeScoreRow(location({ google: metric(4.5, 5, 100), booking: metric(9, 10, 50) }), ["google", "booking"], 10, {});
  assert.equal(row.avg, 9); // 4.5/5*10 = 9 and 9/10*10 = 9
  assert.equal(row.total, 150);
  assert.equal(row.dScore, null); // no baseline yet
});

test("change compares only sources that have both a current value and a baseline", () => {
  const baseline = { "L1|google": { score: 4.0, count: 90 } }; // booking has no baseline
  const row = computeScoreRow(location({ google: metric(4.5, 5, 100), booking: metric(9, 10, 50) }), ["google", "booking"], 5, baseline);
  assert.equal(row.dScore, 0.5); // google only: 4.5 - 4.0
  assert.equal(row.dCount, 10);
});

test("a location without metrics has no score and no latest time", () => {
  const row = computeScoreRow(location({}), ["google"], 5, {});
  assert.deepEqual([row.avg, row.total, row.latest, row.dScore, row.dCount], [null, null, null, null, null]);
});

test("latest is the newest capture across sources", () => {
  const row = computeScoreRow(location({ google: metric(4, 5, 1, "2026-10-12T00:00:00Z"), tripadvisor: metric(4, 5, 1, "2026-10-13T00:00:00Z") }), ["google", "tripadvisor"], 5, {});
  assert.equal(row.latest, "2026-10-13T00:00:00Z");
});

test("each platform cell carries its own change", () => {
  const baseline = { "L1|google": { score: 4.0, count: 90 }, "L1|booking": { score: 4.5, count: 40 } };
  const row = computeScoreRow(location({ google: metric(4.5, 5, 100), booking: metric(9, 10, 50) }), ["google", "booking"], 5, baseline);
  assert.deepEqual([row.cells.google.dScore, row.cells.google.dCount], [0.5, 10]);
  assert.deepEqual([row.cells.booking.dScore, row.cells.booking.dCount], [0, 10]);
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildTrend, summarizeLocation, summarizeType } from "../src/lib/summary.ts";

const metric = (rating, ratingScale, reviewCount) => ({ rating, ratingScale, reviewCount, countLabel: "đánh giá", capturedAt: "2026-10-14T05:00:00Z" });
const location = (id, extra) => ({ id, name: id, area: "", type: "hotel", google: null, tripadvisor: null, agoda: null, booking: null, tripcom: null, ...extra });

test("scores are converted to a 0-10 scale and reviews are summed", () => {
  const row = summarizeLocation(location("A", { google: metric(4.5, 5, 100), agoda: metric(9, 10, 50) }), ["google", "agoda"]);
  assert.equal(row.score, 9);
  assert.equal(row.reviews, 150);
});

test("type summary picks best and worst only when there are at least two scored locations", () => {
  const a = summarizeLocation(location("A", { google: metric(4.8, 5, 10) }), ["google"]);
  const b = summarizeLocation(location("B", { google: metric(4.0, 5, 20) }), ["google"]);
  const c = summarizeLocation(location("C", {}), ["google"]);
  const both = summarizeType([a, b, c], ["google"]);
  assert.deepEqual([both.best.id, both.worst.id, both.totalReviews, both.scored], ["A", "B", 30, 2]);
  assert.equal(summarizeType([a], ["google"]).best, null);
});

test("gained reviews start from each source's first snapshot, so a late source does not jump the total", () => {
  const snap = (locationId, platform, date, score, count) => ({ locationId, platform, date, score, count });
  const { points, gained, byLocation } = buildTrend([
    snap("A", "google", "2026-10-01", 9, 100), snap("A", "google", "2026-10-03", 9, 104),
    snap("A", "agoda", "2026-10-02", 8, 500), snap("A", "agoda", "2026-10-03", 8, 501),
  ]);
  assert.deepEqual(points.map((p) => p.gained), [0, 0, 5]);
  assert.equal(gained, 5);
  assert.equal(byLocation.A, 5);
  assert.equal(points[2].score, 8.5);
});

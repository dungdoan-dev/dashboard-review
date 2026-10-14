import assert from "node:assert/strict";
import test from "node:test";
import { parseGrabFeedback } from "../src/lib/scraper/grabfood-scraper.ts";

test("reads rating and count from the feedback page text", () => {
  assert.deepEqual(parseGrabFeedback("Đánh giá của khách hàng\nTrung bình\n\n4.8\n\n13 đánh giá"), { ratingValue: 4.8, count: 13 });
  assert.deepEqual(parseGrabFeedback("Trung bình 4,5 1.250 đánh giá"), { ratingValue: 4.5, count: 1250 });
});

test("returns null when the page has no rating", () => {
  assert.equal(parseGrabFeedback("Đăng nhập"), null);
});

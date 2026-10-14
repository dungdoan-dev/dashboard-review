import assert from "node:assert/strict";
import test from "node:test";
import { parseTripcomMarkdown } from "../src/lib/scraper/tripcom-zenrows.ts";

test("reads score and count from the English Markdown", () => {
  const md = "## Guest Reviews\n\n9.5\n\n/10\n\nAmazing\n\n377 verified reviews\n\n- Cleanliness9.6";
  assert.deepEqual(parseTripcomMarkdown(md), { ratingValue: 9.5, count: 377 });
});

test("reads score and count from the Vietnamese Markdown", () => {
  const md = "## Đánh giá của khách\n\n9,4\n\n/10\n\nTuyệt vời\n\n1.234 đánh giá đã xác minh";
  assert.deepEqual(parseTripcomMarkdown(md), { ratingValue: 9.4, count: 1234 });
});

test("returns nulls when the page has no review data", () => {
  assert.deepEqual(parseTripcomMarkdown("Sign in to continue"), { ratingValue: null, count: null });
});

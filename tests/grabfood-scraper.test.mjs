import assert from "node:assert/strict";
import test from "node:test";
import { mapPool, parseGrabFeedback, welcomeScreenFor } from "../src/lib/scraper/grabfood-scraper.ts";

test("mapPool keeps the order and never runs more than the limit at once", async () => {
  let running = 0, peak = 0;
  const out = await mapPool([30, 5, 20, 1, 10], 2, async (ms) => {
    peak = Math.max(peak, ++running);
    await new Promise((resolve) => setTimeout(resolve, ms));
    running--;
    return ms;
  });
  assert.deepEqual(out, [30, 5, 20, 1, 10]);
  assert.equal(peak, 2);
  assert.deepEqual(await mapPool([], 3, async (x) => x), []);
});

test("reads rating and count from the feedback page text", () => {
  assert.deepEqual(parseGrabFeedback("Đánh giá của khách hàng\nTrung bình\n\n4.8\n\n13 đánh giá"), { ratingValue: 4.8, count: 13 });
  assert.deepEqual(parseGrabFeedback("Trung bình 4,5 1.250 đánh giá"), { ratingValue: 4.5, count: 1250 });
});

test("returns null when the page has no rating", () => {
  assert.equal(parseGrabFeedback("Đăng nhập"), null);
});

test("recognises the saved-account welcome screen", () => {
  const screen = "itquynhon thân mến, mừng bạn quay lại! Tiếp tục Đăng nhập với tài khoản khác Xóa tài khoản";
  assert.equal(welcomeScreenFor("Welcome back itquynhon! Continue Login as another user Remove an account", "itquynhon"), "same");
  assert.equal(welcomeScreenFor(screen, "ITQuyNhon"), "same");
  assert.equal(welcomeScreenFor(screen, "someone-else"), "other");
  assert.equal(welcomeScreenFor("Tên đăng nhập Tiếp tục", "itquynhon"), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import { parseGrabFeedback, welcomeScreenFor } from "../src/lib/scraper/grabfood-scraper.ts";

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

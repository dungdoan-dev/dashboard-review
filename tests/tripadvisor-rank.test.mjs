import assert from "node:assert/strict";
import test from "node:test";
import { extractRankLabel } from "../src/lib/scraper/tripadvisor-rank.ts";

test("reads the restaurant/cafe rank without the 'Số' prefix", () => {
  assert.equal(extractRankLabel("3.998 trên 8.135 nhà hàng ở Thành phố Hồ Chí Minh"), "3.998 trên 8.135 nhà hàng ở Thành phố Hồ Chí Minh");
  assert.equal(extractRankLabel("#3,998 of 8,135 Restaurants in Ho Chi Minh City"), "#3,998 of 8,135 Restaurants in Ho Chi Minh City");
});

test("still reads the hotel rank", () => {
  assert.equal(extractRankLabel("Số 5 trên 20 khách sạn ở Hội An"), "Số 5 trên 20 khách sạn ở Hội An");
});

test("does not mistake rating or address text for a rank", () => {
  assert.equal(extractRankLabel("4,9 trên 5 bong bóng"), null);
  assert.equal(extractRankLabel("Số 28, Đường D9, khu phố Phước Thiện"), null);
  assert.equal(extractRankLabel("Hiển thị kết quả 1-15 trong số 86"), null);
});

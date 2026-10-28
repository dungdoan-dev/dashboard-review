import test from "node:test";
import assert from "node:assert/strict";
import { extractRankLabel, tripadvisorFetchUrl } from "./scraper/tripadvisor-rank.ts";

test("the Vietnamese Tripadvisor host is swapped for the main one, the rest of the address stays", () => {
  const vn = "https://www.tripadvisor.com.vn/Restaurant_Review-g608528-d34261594-Reviews-Mini_Mart_24h-Quy_Nhon.html?m=1#reviews";
  assert.equal(tripadvisorFetchUrl(vn), "https://www.tripadvisor.com/Restaurant_Review-g608528-d34261594-Reviews-Mini_Mart_24h-Quy_Nhon.html?m=1#reviews");
  assert.equal(tripadvisorFetchUrl("http://tripadvisor.com.vn/Hotel_Review-g1-d2-Reviews-X.html"), "http://www.tripadvisor.com/Hotel_Review-g1-d2-Reviews-X.html");
  const com = "https://www.tripadvisor.com/Hotel_Review-g1-d2-Reviews-X.html";
  assert.deepEqual([tripadvisorFetchUrl(com), tripadvisorFetchUrl("https://www.google.com/maps/place/x"), tripadvisorFetchUrl("https://example.com/tripadvisor.com.vn/x")], [com, "https://www.google.com/maps/place/x", "https://example.com/tripadvisor.com.vn/x"]);
});

test("a rank is read in Vietnamese and in English, whatever the category, and a rating is not taken for a rank", () => {
  assert.equal(extractRankLabel("#1 of 1 Shopping in Tho Quang"), "#1 of 1 Shopping in Tho Quang");
  assert.equal(extractRankLabel("#101 of 156 Restaurants in Quy Nhon"), "#101 of 156 Restaurants in Quy Nhon");
  assert.equal(extractRankLabel("Số 1 trên 1 Mua sắm ở Tho Quang"), "Số 1 trên 1 Mua sắm ở Tho Quang");
  assert.equal(extractRankLabel("4.9 of 5 bubbles"), null);
  assert.equal(extractRankLabel("4,9 trên 5 bong bóng"), null);
});

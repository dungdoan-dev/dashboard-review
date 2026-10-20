import test from "node:test";
import assert from "node:assert/strict";
import { compareReach, reachGroup } from "./reach-order.ts";

test("hotels, then cafes, then marts, each in the agreed order; names differ per platform", () => {
  const names = ["Gia Lai mini Mart 24h", "Vintage Taste Deli Cafe Rooftop", "SƠN TRÀ SEA HOTEL", "Vista Journey", "SontraminiMart24h", "Vintage Taste Deli Cafe Hoi An", "Vistara Gia Lai Sea Hotel", "Vintage Taste Deli Cafe", "Quy Nhon mini Mart 24h", "Vistara Quy Nhon Sea Hotel", "Yzistel Hoi An"];
  assert.deepEqual([...names].sort(compareReach), ["Yzistel Hoi An", "Vistara Quy Nhon Sea Hotel", "Vistara Gia Lai Sea Hotel", "SƠN TRÀ SEA HOTEL", "Vintage Taste Deli Cafe", "Vintage Taste Deli Cafe Hoi An", "Vintage Taste Deli Cafe Rooftop", "SontraminiMart24h", "Quy Nhon mini Mart 24h", "Gia Lai mini Mart 24h", "Vista Journey"]);
  assert.deepEqual(["Sontra Sea Hotel", "Vintage Taste Deli Cafe", "Sontra mini Mart 24h.", "Vista Journey"].map(reachGroup), ["Khách sạn", "Cafe", "Mart", "Khác"]);
});

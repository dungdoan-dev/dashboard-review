import test from "node:test";
import assert from "node:assert/strict";
import { commissionRate } from "./ota-commission.ts";

test("the finance team's OTA policy: Booking and Expedia 15%, Trip 18%, Agoda 20%, Traveloka 20% at Sontra and Gia Lai, 19% at Yzistel and Quy Nhơn, others nothing", () => {
  assert.deepEqual(["Booking", "Expedia", "Trip", "Agoda"].map((c) => commissionRate(c, 5381)), [0.15, 0.15, 0.18, 0.2]);
  assert.deepEqual([5381, 6209, 6495, 6836].map((h) => commissionRate("Traveloka", h)), [0.2, 0.19, 0.19, 0.2]);
  assert.deepEqual(["Khách lẻ", "Zalo", "BE", ""].map((c) => commissionRate(c, 5381)), [0, 0, 0, 0]);
});

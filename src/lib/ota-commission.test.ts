import test from "node:test";
import assert from "node:assert/strict";
import { commissionRate, otaSplit } from "./ota-commission.ts";

test("the finance team's OTA policy: Booking and Expedia 15%, Trip 18%, Agoda 20%, Traveloka 20% at Sontra and Gia Lai, 19% at Yzistel and Quy Nhơn, others nothing", () => {
  assert.deepEqual(["Booking", "Expedia", "Trip", "Agoda"].map((c) => commissionRate(c, 5381)), [0.15, 0.15, 0.18, 0.2]);
  assert.deepEqual([5381, 6209, 6495, 6836].map((h) => commissionRate("Traveloka", h)), [0.2, 0.19, 0.19, 0.2]);
  assert.deepEqual(["Khách lẻ", "Zalo", "BE", ""].map((c) => commissionRate(c, 5381)), [0, 0, 0, 0]);
});

test("a net price (Expedia, Trip, Agoda) is grossed up and the commission is the difference; a displayed price (Booking, Traveloka) is kept and the commission added; no commission for other channels", () => {
  assert.deepEqual(Object.values(otaSplit("Agoda", 5381, 800_000)), [1_000_000, 200_000]); // 800.000 / (1 - 20%)
  assert.deepEqual(Object.values(otaSplit("Trip", 5381, 820_000)).map(Math.round), [1_000_000, 180_000]);
  assert.deepEqual(Object.values(otaSplit("Booking", 5381, 1_000_000)), [1_000_000, 150_000]);
  assert.deepEqual(Object.values(otaSplit("Traveloka", 6209, 1_000_000)), [1_000_000, 190_000]);
  assert.deepEqual(Object.values(otaSplit("Khách lẻ", 5381, 1_000_000)), [1_000_000, 0]);
});

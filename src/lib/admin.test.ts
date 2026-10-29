import test from "node:test";
import assert from "node:assert/strict";
import { apiAllowed } from "./admin.ts";

const as = (role: string) => ({ app_metadata: { role } });

test("admin may call everything; an unknown or missing role nothing", () => {
  assert.equal(apiAllowed(as("admin"), "POST", "/api/bluejay/sync"), true);
  assert.equal(apiAllowed(as("viewer"), "GET", "/api/facebook"), false);
  assert.equal(apiAllowed(null, "GET", "/api/facebook"), false);
});

test("hr: the staff list is read-only, recruitment is read and write, nothing else", () => {
  assert.equal(apiAllowed(as("hr"), "GET", "/api/nhan-su"), true);
  assert.equal(apiAllowed(as("hr"), "POST", "/api/nhan-su"), false);
  assert.equal(apiAllowed(as("hr"), "POST", "/api/hr"), true);
  assert.equal(apiAllowed(as("hr"), "GET", "/api/facebook"), false);
});

test("mkt: reach figures can be read, never pulled; no HR and no Blue Jay", () => {
  assert.equal(apiAllowed(as("mkt"), "GET", "/api/google-analytics"), true);
  assert.equal(apiAllowed(as("mkt"), "POST", "/api/google-analytics"), false);
  assert.equal(apiAllowed(as("mkt"), "GET", "/api/nhan-su"), false);
  assert.equal(apiAllowed(as("mkt"), "GET", "/api/bluejay"), false);
  assert.equal(apiAllowed(as("mkt"), "POST", "/api/crawl"), false);
});

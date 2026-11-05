import test from "node:test";
import assert from "node:assert/strict";
import { apiAllowed } from "./admin.ts";

const as = (role: string) => ({ app_metadata: { role } });

test("admin may call everything; an unknown or missing role nothing", () => {
  assert.equal(apiAllowed(as("admin"), "POST", "/api/bluejay/sync"), true);
  assert.equal(apiAllowed(as("viewer"), "GET", "/api/facebook"), false);
  assert.equal(apiAllowed(null, "GET", "/api/facebook"), false);
});

test("hr: every Hành chính nhân sự API, read and write, nothing else", () => {
  assert.equal(apiAllowed(as("hr"), "GET", "/api/nhan-su"), true);
  assert.equal(apiAllowed(as("hr"), "POST", "/api/nhan-su"), true);
  assert.equal(apiAllowed(as("hr"), "POST", "/api/crawl"), false);
  assert.equal(apiAllowed(as("hr"), "GET", "/api/users"), false);
  assert.equal(apiAllowed(as("hr"), "POST", "/api/hr"), true);
  assert.equal(apiAllowed(as("hr"), "POST", "/api/assets"), true);
  assert.equal(apiAllowed(as("mkt"), "GET", "/api/assets"), false);
  assert.equal(apiAllowed(as("hr"), "GET", "/api/facebook"), false);
});

test("mkt: every Marketing API, read and write; no HR, no Blue Jay, no settings", () => {
  assert.equal(apiAllowed(as("mkt"), "GET", "/api/google-analytics"), true);
  assert.equal(apiAllowed(as("mkt"), "POST", "/api/google-analytics"), true);
  assert.equal(apiAllowed(as("mkt"), "POST", "/api/crawl/bulk"), true);
  assert.equal(apiAllowed(as("mkt"), "PUT", "/api/app-secrets"), false);
  assert.equal(apiAllowed(as("mkt"), "GET", "/api/users"), false);
  assert.equal(apiAllowed(as("mkt"), "GET", "/api/nhan-su"), false);
  assert.equal(apiAllowed(as("mkt"), "GET", "/api/bluejay"), false);
  assert.equal(apiAllowed(as("mkt"), "POST", "/api/crawl"), true);
});

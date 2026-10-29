import test from "node:test";
import assert from "node:assert/strict";
import { roleChangeError } from "./user-roles.ts";

test("a role change needs a known role (or an empty one to remove) and never targets the actor", () => {
  assert.equal(roleChangeError("a", "b", "mkt"), null);
  assert.equal(roleChangeError("a", "b", ""), null);
  assert.match(roleChangeError("a", "b", "root") ?? "", /không hợp lệ/);
  assert.match(roleChangeError("a", "a", "admin") ?? "", /chính mình/);
  assert.match(roleChangeError("a", "", "hr") ?? "", /Thiếu/);
});

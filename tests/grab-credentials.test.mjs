import assert from "node:assert/strict";
import test from "node:test";
import { decryptSecret, encryptSecret } from "../src/lib/grab-credentials.ts";

process.env.GRAB_CREDENTIALS_KEY = "test-key-0123456789";

test("round-trips a password and never stores it as plain text", () => {
  const encrypted = encryptSecret("m@t khau ✓");
  assert.ok(!encrypted.includes("khau"));
  assert.equal(decryptSecret(encrypted), "m@t khau ✓");
});

test("rejects tampered ciphertext", () => {
  const raw = Buffer.from(encryptSecret("abc"), "base64");
  raw[raw.length - 1] ^= 1;
  assert.throws(() => decryptSecret(raw.toString("base64")));
});

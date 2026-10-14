import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Server-only: the key never reaches the browser or the database.
function key() {
  const secret = process.env.GRAB_CREDENTIALS_KEY?.trim();
  if (!secret || secret.length < 16) throw new Error("GRAB_CREDENTIALS_KEY chưa đặt hoặc ngắn hơn 16 ký tự (chuỗi ngẫu nhiên, ví dụ 64 ký tự hex).");
  return createHash("sha256").update(secret).digest();
}

/** AES-256-GCM; output is base64(iv | authTag | ciphertext). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

import crypto from "node:crypto";
import { env } from "../config/env";

const ALGORITHM = "aes-256-gcm";

type EncryptedPayload = {
  iv: string;
  authTag: string;
  content: string;
};

function getKey(): Buffer {
  const raw = env.TOKEN_ENCRYPTION_KEY;
  if (raw.length === 64 && /^[a-f0-9]+$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  try {
    const base64 = Buffer.from(raw, "base64");
    if (base64.length === 32) {
      return base64;
    }
  } catch {
    // ignored
  }

  const utf8 = Buffer.from(raw, "utf8");
  if (utf8.length === 32) {
    return utf8;
  }

  throw new Error("TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
}

const key = getKey();

export function encryptJson(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const payload: EncryptedPayload = {
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    content: encrypted.toString("base64")
  };

  return JSON.stringify(payload);
}

export function decryptJson<T>(encryptedPayload: string): T {
  const payload = JSON.parse(encryptedPayload) as EncryptedPayload;

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.content, "base64")),
    decipher.final()
  ]);

  return JSON.parse(decrypted.toString("utf8")) as T;
}

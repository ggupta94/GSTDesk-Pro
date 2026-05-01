import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// AES-256-GCM encryption for client portal passwords. Reversible (unlike user
// passwords which are hashed), since the CA office needs to actually use them
// to log into the GSTN / IT portal.
//
// The key is derived from ENCRYPTION_KEY env var (preferred) or SESSION_SECRET
// as a fallback. On a Linux VPS, set both to long random strings — and back
// them up offline. If you lose the key, encrypted passwords are unrecoverable.

const PASSPHRASE =
  process.env.ENCRYPTION_KEY ??
  process.env.SESSION_SECRET ??
  "fallback_dev_secret_only_for_dev_change_me_to_something_long";

const SALT = "gstdesk-pro-credentials-v1";
const KEY = scryptSync(PASSPHRASE, SALT, 32);

export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // layout: iv (12) | tag (16) | ciphertext
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(blob: string | null | undefined): string {
  if (!blob) return "";
  try {
    const buf = Buffer.from(blob, "base64");
    if (buf.length < 28) return "";
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

// ponytail: native Web Crypto AES-GCM + PBKDF2 instead of pulling in TweetNaCl
// — same security goal, zero runtime deps, preserves the PWA's no-dependency
// invariant. The envelope is a versioned JSON object so import can auto-detect it.

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BITS = 256;

interface EncryptedEnvelope {
  v: 1;
  kdf: "PBKDF2-SHA256";
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}

function toB64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

function fromB64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: KEY_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt a plaintext backup JSON string with a passphrase. Returns a JSON
 * envelope holding the KDF parameters, salt, IV, and ciphertext — all the
 * receiver needs besides the passphrase.
 */
export async function encryptBackup(
  plaintext: string,
  passphrase: string,
): Promise<string> {
  if (!passphrase) throw new Error("Passphrase is required to encrypt backup");
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesKey(passphrase, salt, PBKDF2_ITERATIONS);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const envelope: EncryptedEnvelope = {
    v: 1,
    kdf: "PBKDF2-SHA256",
    iter: PBKDF2_ITERATIONS,
    salt: toB64(salt),
    iv: toB64(iv),
    ct: toB64(new Uint8Array(ct)),
  };
  return JSON.stringify(envelope);
}

/**
 * True when a parsed backup string is an encrypted envelope rather than a
 * plaintext HistoryBackup. Import uses this to decide whether to ask for a
 * passphrase.
 */
export function isEncryptedEnvelope(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as Partial<EncryptedEnvelope>;
    return parsed.v === 1 && parsed.kdf === "PBKDF2-SHA256" && "ct" in parsed;
  } catch {
    return false;
  }
}

/**
 * Decrypt an envelope produced by {@link encryptBackup}. Throws on a wrong
 * passphrase (AES-GCM authentication tag fails) or a malformed envelope.
 */
export async function decryptBackup(
  envelope: string,
  passphrase: string,
): Promise<string> {
  let parsed: Partial<EncryptedEnvelope>;
  try {
    parsed = JSON.parse(envelope) as Partial<EncryptedEnvelope>;
  } catch {
    throw new Error("Encrypted backup is not valid JSON");
  }
  if (
    parsed.v !== 1 ||
    parsed.kdf !== "PBKDF2-SHA256" ||
    !parsed.ct ||
    !parsed.salt ||
    !parsed.iv
  ) {
    throw new Error("Encrypted backup envelope is malformed");
  }
  const salt = fromB64(parsed.salt);
  const iv = fromB64(parsed.iv);
  const ct = fromB64(parsed.ct);
  const iterations = parsed.iter ?? PBKDF2_ITERATIONS;
  const key = await deriveAesKey(passphrase, salt, iterations);
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error(
      "Could not decrypt backup — wrong passphrase or corrupted file",
    );
  }
}

import { describe, it, expect } from "vitest";
import {
  encryptBackup,
  decryptBackup,
  isEncryptedEnvelope,
} from "@/services/history/crypto";

const PLAINTEXT =
  '{"version":1,"exportedAt":"2026-01-01T00:00:00.000Z","entries":[]}';

describe("history crypto", () => {
  it("round-trips encrypt → decrypt with the correct passphrase", async () => {
    const envelope = await encryptBackup(PLAINTEXT, "correct horse battery");
    expect(isEncryptedEnvelope(envelope)).toBe(true);
    const recovered = await decryptBackup(envelope, "correct horse battery");
    expect(recovered).toBe(PLAINTEXT);
  });

  it("produces a fresh envelope (random salt/iv) each time", async () => {
    const a = await encryptBackup(PLAINTEXT, "pw");
    const b = await encryptBackup(PLAINTEXT, "pw");
    expect(a).not.toBe(b);
    const ea = JSON.parse(a) as { ct: string };
    const eb = JSON.parse(b) as { ct: string };
    expect(ea.ct).not.toBe(eb.ct);
  });

  it("rejects a wrong passphrase", async () => {
    const envelope = await encryptBackup(PLAINTEXT, "right");
    await expect(decryptBackup(envelope, "wrong")).rejects.toThrow(
      /wrong passphrase|Could not decrypt/,
    );
  });

  it("refuses to encrypt with an empty passphrase", async () => {
    await expect(encryptBackup(PLAINTEXT, "")).rejects.toThrow(
      /Passphrase is required/,
    );
  });

  it("detects encrypted envelopes vs plaintext backups", () => {
    expect(isEncryptedEnvelope(PLAINTEXT)).toBe(false);
    expect(isEncryptedEnvelope("not even json")).toBe(false);
    expect(isEncryptedEnvelope('{"v":1,"entries":[]}')).toBe(false);
  });

  it("rejects a malformed envelope", async () => {
    await expect(
      decryptBackup('{"v":1,"kdf":"PBKDF2-SHA256"}', "pw"),
    ).rejects.toThrow(/malformed/);
  });

  it("rejects non-JSON envelopes", async () => {
    await expect(decryptBackup("not json", "pw")).rejects.toThrow(
      /not valid JSON/,
    );
  });
});

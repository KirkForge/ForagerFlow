#!/usr/bin/env node
"use strict";

/**
 * Generate public/.well-known/assetlinks.json for Trusted Web Activity.
 *
 * Usage:
 *   TWA_HOST=foragerflow.example.com \
 *   TWA_SHA256_FINGERPRINT=AA:BB:CC:... \
 *     node scripts/generate-assetlinks.cjs
 *
 * The fingerprint is the SHA-256 certificate fingerprint of the APK signing
 * key. For Play/App signing, use the fingerprint shown in Play Console.
 *
 * If TWA_SHA256_FINGERPRINT is not set, a placeholder file is written so the
 * .well-known path can be verified, but the TWA will not launch until the real
 * fingerprint is provided.
 */

const { resolve } = require("node:path");
const { mkdirSync, writeFileSync } = require("node:fs");

const PUBLIC_DIR = resolve(__dirname, "..", "public");
const OUT_DIR = resolve(PUBLIC_DIR, ".well-known");
const OUT_FILE = resolve(OUT_DIR, "assetlinks.json");

function normalizeFingerprint(fp) {
  return fp
    .toUpperCase()
    .replace(/[^0-9A-F]/g, "")
    .replace(/(.{2})(?=.)/g, "$1:");
}

function generateAssetLinks() {
  const rawFingerprint = process.env["TWA_SHA256_FINGERPRINT"];

  const fingerprint = rawFingerprint
    ? normalizeFingerprint(rawFingerprint)
    : "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00";

  if (!rawFingerprint) {
    console.warn(
      "TWA_SHA256_FINGERPRINT not set; writing placeholder assetlinks.json.",
    );
  }

  const relation = ["delegate_permission/common.handle_all_urls"];
  const target = {
    namespace: "android_app",
    package_name: "com.kirkforge.foragerflow",
    sha256_cert_fingerprints: [fingerprint],
  };

  return JSON.stringify([{ relation, target }], null, 2);
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const content = generateAssetLinks();
  writeFileSync(OUT_FILE, `${content}\n`);
  console.log(`Wrote ${OUT_FILE}`);
}

main();

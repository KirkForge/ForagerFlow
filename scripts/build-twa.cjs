#!/usr/bin/env node
"use strict";

/**
 * Build the ForagerFlow Trusted Web Activity (TWA) Android APK.
 *
 * Prerequisites:
 *   - ANDROID_SDK_ROOT or ANDROID_HOME must point to an Android SDK.
 *   - dist/ must already contain the built PWA.
 *
 * Usage:
 *   TWA_HOST=foragerflow.example.com node scripts/build-twa.cjs
 */

const { resolve } = require("node:path");
const {
  existsSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  rmSync,
} = require("node:fs");
const { execFileSync } = require("node:child_process");

const ROOT = resolve(__dirname, "..");
const DIST_DIR = resolve(ROOT, "dist");
const TWA_DIR = resolve(ROOT, "twa");
const APP_RES = resolve(TWA_DIR, "app/src/main/res");
const PUBLIC_ICONS = resolve(ROOT, "public/icons");
const OUT_DIR = resolve(DIST_DIR, "twa");

const HOST = process.env["TWA_HOST"] || "foragerflow.kirkforge.com";
const DEFAULT_URL = `https://${HOST}/`;

const DENSITIES = {
  mdpi: { size: 48, source: "icon-192.png" },
  hdpi: { size: 72, source: "icon-192.png" },
  xhdpi: { size: 96, source: "icon-192.png" },
  xxhdpi: { size: 144, source: "icon-512.png" },
  xxxhdpi: { size: 192, source: "icon-512.png" },
};

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function copyIcon(density, { source }) {
  const srcPath = resolve(PUBLIC_ICONS, source);
  if (!existsSync(srcPath)) {
    throw new Error(`Missing source icon: ${srcPath}`);
  }

  // density qualifier only — do NOT create mipmap-<density>-round dirs: the
  // "round" qualifier must precede density (mipmap-round-<density>), and these
  // PNGs are unused anyway because the manifest's roundIcon points at
  // @mipmap/ic_launcher and mipmap-anydpi-v26/ic_launcher_round.xml handles
  // Android 8+ adaptive icons.
  const dir = resolve(APP_RES, `mipmap-${density}`);
  ensureDir(dir);
  copyFileSync(srcPath, resolve(dir, "ic_launcher_foreground.png"));
  copyFileSync(srcPath, resolve(dir, "ic_launcher.png"));
}

function generateTwaConfig() {
  const assetStatements = JSON.stringify([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "web",
        site: `https://${HOST}`,
      },
    },
  ]);

  // Escape JSON quotes for an Android <string> resource: each literal `"`
  // must become `\"` so AAPT decodes it back to `"` at runtime. A lone `\`
  // (the previous behaviour) produced invalid escapes such as `\r`/`\n`,
  // garbling the asset_statements payload so Digital Asset Links never
  // validated and the TWA silently fell back to a plain Custom Tab.
  const assetStatementsEscaped = assetStatements.replace(/"/g, '\\"');

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="defaultUrl" translatable="false">${DEFAULT_URL}</string>
    <string name="assetStatements" translatable="false">${assetStatementsEscaped}</string>
</resources>
`;
  ensureDir(resolve(APP_RES, "values"));
  writeFileSync(resolve(APP_RES, "values/twa-config.xml"), xml);
}

function runGradle() {
  const sdkRoot =
    process.env["ANDROID_SDK_ROOT"] || process.env["ANDROID_HOME"];
  if (!sdkRoot) {
    throw new Error(
      "ANDROID_SDK_ROOT or ANDROID_HOME must be set to build the TWA APK.",
    );
  }

  const gradlew = resolve(TWA_DIR, "gradlew");
  if (!existsSync(gradlew)) {
    throw new Error(`Gradle wrapper not found at ${gradlew}`);
  }

  execFileSync(gradlew, ["assembleRelease"], {
    cwd: TWA_DIR,
    stdio: "inherit",
    env: {
      ...process.env,
      ANDROID_SDK_ROOT: sdkRoot,
      ANDROID_HOME: sdkRoot,
    },
  });

  const unsignedApk = resolve(
    TWA_DIR,
    "app/build/outputs/apk/release/app-release-unsigned.apk",
  );
  if (!existsSync(unsignedApk)) {
    throw new Error(`Expected APK not found: ${unsignedApk}`);
  }

  ensureDir(OUT_DIR);
  const outApk = resolve(OUT_DIR, "foragerflow-release-unsigned.apk");
  copyFileSync(unsignedApk, outApk);
  console.log(`Built TWA APK: ${outApk}`);
}

function cleanGeneratedResources() {
  for (const density of Object.keys(DENSITIES)) {
    rmSync(resolve(APP_RES, `mipmap-${density}`), {
      recursive: true,
      force: true,
    });
  }
  rmSync(resolve(APP_RES, "values/twa-config.xml"), { force: true });
}

function main() {
  if (!existsSync(DIST_DIR)) {
    throw new Error("dist/ not found. Run pnpm build first.");
  }

  const assetlinks = resolve(DIST_DIR, ".well-known/assetlinks.json");
  if (!existsSync(assetlinks)) {
    throw new Error(
      `${assetlinks} not found. Run node scripts/generate-assetlinks.cjs before building the TWA.`,
    );
  }

  cleanGeneratedResources();
  generateTwaConfig();

  for (const [density, spec] of Object.entries(DENSITIES)) {
    copyIcon(density, spec);
  }

  try {
    runGradle();
  } finally {
    // Leave generated resources in place so local debugging is easy, but do not
    // commit them. They are ignored via twa/app/src/main/res/mipmap-*/ and
    // twa/app/src/main/res/values/twa-config.xml.
  }
}

main();

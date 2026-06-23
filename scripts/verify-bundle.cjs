#!/usr/bin/env node
"use strict";

const { readdirSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { gzipSync } = require("node:zlib");

const DIST_DIR = resolve(__dirname, "..", "dist");
const ASSETS_DIR = resolve(DIST_DIR, "assets");
const BUDGET_BYTES = Number(process.env["BUNDLE_BUDGET_BYTES"] ?? 35 * 1024);

function findMainBundle() {
  const entries = readdirSync(ASSETS_DIR);
  const main = entries.find(
    (name) => name.startsWith("main-") && name.endsWith(".js"),
  );
  if (!main) {
    throw new Error(`No main-*.js bundle found in ${ASSETS_DIR}`);
  }
  return resolve(ASSETS_DIR, main);
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

function main() {
  const path = findMainBundle();
  const raw = readFileSync(path);
  const gzipped = gzipSync(raw);

  console.log(`main bundle: ${path}`);
  console.log(`  raw:   ${formatBytes(raw.length)}`);
  console.log(`  gzip:  ${formatBytes(gzipped.length)}`);
  console.log(`  budget: ${formatBytes(BUDGET_BYTES)}`);

  if (gzipped.length > BUDGET_BYTES) {
    console.error(
      `\nERROR: main bundle gzip size exceeds budget (${formatBytes(
        gzipped.length,
      )} > ${formatBytes(BUDGET_BYTES)})`,
    );
    console.error("Run 'pnpm analyze:bundle' to inspect dependencies.");
    process.exit(1);
  }

  console.log("\nOK: bundle size is within budget.");
}

main();

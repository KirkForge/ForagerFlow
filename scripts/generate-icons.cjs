#!/usr/bin/env node
"use strict";

/**
 * Generate maskable/adaptive icon variants from the existing 512x512 icon.
 *
 * The source icon already declares `purpose: "any maskable"`, but some TWA
 * splash screens and Play Store flows prefer a dedicated maskable asset with
 * extra padding. This script uses sharp (if available) to scale the source icon
 * to 80% of the canvas and center it on the theme-color background.
 *
 * Run manually after changing the source icon:
 *   pnpm dlx sharp scripts/generate-icons.cjs
 * or install sharp as a dev dependency and run:
 *   node scripts/generate-icons.cjs
 */

const { resolve } = require("node:path");
const { existsSync, writeFileSync } = require("node:fs");

const PUBLIC_DIR = resolve(__dirname, "..", "public");
const ICONS_DIR = resolve(PUBLIC_DIR, "icons");
const SOURCE = resolve(ICONS_DIR, "icon-512.png");

const SIZES = [192, 512];
const THEME = { r: 15, g: 17, b: 21 }; // #0f1115

async function generate() {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    console.log(
      "sharp is not installed. Skipping icon generation; existing icons are already maskable.",
    );
    console.log(
      "To regenerate padded maskable icons, install sharp: pnpm add -D sharp",
    );
    return;
  }

  if (!existsSync(SOURCE)) {
    throw new Error(`Source icon not found: ${SOURCE}`);
  }

  for (const size of SIZES) {
    const iconSize = Math.round(size * 0.8);
    const offset = Math.round((size - iconSize) / 2);
    const padded = await sharp(SOURCE)
      .resize(iconSize, iconSize, { fit: "inside" })
      .extend({
        top: offset,
        bottom: size - iconSize - offset,
        left: offset,
        right: size - iconSize - offset,
        background: THEME,
      })
      .png()
      .toBuffer();

    const out = resolve(ICONS_DIR, `icon-maskable-${size}.png`);
    writeFileSync(out, padded);
    console.log(`Wrote ${out}`);
  }
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});

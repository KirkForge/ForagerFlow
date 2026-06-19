#!/usr/bin/env node
/**
 * Post-build helper: copy ONNX weights from pwa/model/ to dist/model/.
 *
 * pnpm build produces dist/ with the JS/CSS/HTML/SW/manifest/wasm, but the
 * ONNX model weights are gitignored (large, produced by export scripts). For a
 * local end-to-end run or a release image, you also need them at dist/model/.
 *
 * The release workflow (release.yml) runs this step automatically. This script
 * is the local equivalent; it warns rather than fails when models are missing,
 * so `pnpm build` remains useful without exporting weights.
 */

const {
  existsSync,
  readdirSync,
  mkdirSync,
  cpSync,
  rmSync,
} = require("node:fs");
const { join } = require("node:path");

const SRC = "pwa/model";
const DST = "dist/model";

function copyModels() {
  if (!existsSync(SRC)) {
    console.warn(
      `[postbuild] ${SRC}/ does not exist; skipping ONNX copy. Run export scripts first if you need models in dist/.`,
    );
    return;
  }

  const onnxFiles = readdirSync(SRC).filter((f) => f.endsWith(".onnx"));
  if (onnxFiles.length === 0) {
    console.warn(
      "[postbuild] No .onnx files found in pwa/model/; skipping ONNX copy.",
    );
    return;
  }

  mkdirSync(DST, { recursive: true });
  // Remove stale files first so a renamed model doesn't leave old sidecars.
  if (existsSync(DST)) {
    for (const f of readdirSync(DST)) {
      if (f.endsWith(".onnx") || f.endsWith(".onnx.data")) {
        rmSync(join(DST, f), { force: true });
      }
    }
  }

  for (const file of onnxFiles) {
    cpSync(join(SRC, file), join(DST, file));
  }

  console.log(`[postbuild] Copied ${onnxFiles.length} ONNX file(s) to ${DST}/`);
}

copyModels();

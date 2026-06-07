#!/usr/bin/env bash
# Copy the real ONNX weights from pwa/model/ to dist/model/.
#
# pnpm build produces dist/ with the JS/CSS/HTML/SW/manifest/wasm, but
# the ONNX model weights are gitignored (they are large and produced by
# export_bvra_onnx.py / export_dima806_onnx.py, not by Vite). For a
# local end-to-end run, you also need them at dist/model/.
#
# The release workflow (release.yml) runs this step automatically. This
# script is the local equivalent.
#
# Usage:
#   bash scripts/copy-models-to-dist.sh

set -euo pipefail

if [ ! -d "pwa/model" ]; then
  echo "FAIL: pwa/model/ does not exist. Run the export scripts first:"
  echo "  python export_bvra_onnx.py"
  echo "  python export_dima806_onnx.py"
  exit 1
fi

count=$(find pwa/model -maxdepth 1 -name "*.onnx" | wc -l)
if [ "$count" -ne 2 ]; then
  echo "FAIL: pwa/model/ has $count .onnx files (expected 2)."
  echo "Run the export scripts to produce them."
  exit 1
fi

mkdir -p dist/model
# Remove any stale files (including old external-data sidecars) before copy
rm -f dist/model/*.onnx dist/model/*.onnx.data
cp pwa/model/*.onnx dist/model/ 2>/dev/null || true
# Sidecars are no longer produced by the export scripts (we save monolithic
# .onnx files; see export_*_onnx.py for the rationale). Keep this line
# for safety in case an old export left a sidecar behind.
cp pwa/model/*.onnx.data dist/model/ 2>/dev/null || true

echo "Copied to dist/model/:"
ls -la dist/model/
echo
echo "Total dist/ size: $(du -sh dist/ | cut -f1)"

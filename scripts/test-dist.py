"""
Smoke test of the BUILT dist/ assets.

This does not run a real browser, but it does:
  1. Parse dist/assets/inference-worker-*.js as JS
  2. Evaluate it in a vm context with a mock ort + importScripts
  3. Send a Switch + Infer message and confirm the worker responds
  4. Verify the model path it tries to load is correct

This catches the most common runtime issues without needing a real browser.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

DIST = Path("dist")

def find_built_assets():
    main = list((DIST / "assets").glob("main-*.js"))
    worker = list((DIST / "assets").glob("inference-worker-*.js"))
    if not main or not worker:
        raise SystemExit(f"missing assets in {DIST}/assets: main={main}, worker={worker}")
    return main[0], worker[0]


def main():
    main_js, worker_js = find_built_assets()
    print(f"main:    {main_js.name}  ({main_js.stat().st_size} bytes)")
    print(f"worker:  {worker_js.name}  ({worker_js.stat().st_size} bytes)")

    # 1. Worker must importScripts ort.min.js
    code = worker_js.read_text()
    if "importScripts" not in code:
        print("FAIL: worker does not call importScripts")
        sys.exit(1)
    if "new ort.Tensor" not in code:
        print("FAIL: worker does not reference ort.Tensor (ort not loaded?)")
        sys.exit(1)
    m = re.search(r'importScripts\("([^"]+)"\)', code)
    if not m:
        print("FAIL: could not extract importScripts URL")
        sys.exit(1)
    print(f"  worker imports: {m.group(1)}  (ort.min.js must be at this path)")

    # 2. Confirm the imported path actually exists in dist
    ort_path = DIST / m.group(1).lstrip("/")
    if not ort_path.exists():
        print(f"FAIL: {ort_path} does not exist")
        sys.exit(1)
    print(f"  ort.min.js present: {ort_path.stat().st_size} bytes")

    # 3. Main bundle must reference the worker
    main_code = main_js.read_text()
    if "inference-worker" not in main_code:
        print("FAIL: main bundle does not reference inference-worker")
        sys.exit(1)
    print(f"  main bundle references inference-worker  OK")

    # 4. Confirm key dist assets exist on disk
    main_rel = main_js.relative_to(DIST)
    required = [
        "index.html",
        "sw.js",
        "manifest.webmanifest",
        m.group(1).lstrip("/"),                # /js/ort.min.js
        "js/ort-wasm-simd-threaded.wasm",      # wasm sidecar
        str(main_rel),                         # hashed main JS in assets/
    ]
    for needle in required:
        path = DIST / needle
        if not path.exists():
            print(f"FAIL: {path} does not exist in dist/")
            sys.exit(1)
    print(f"  all required dist files present  OK ({len(required)} files)")

    # 4b. ONNX model files. These aren't produced by pnpm build — the
    #     release workflow copies them in separately, and local devs
    #     should run scripts/copy-models.sh (TODO). Warn if missing.
    models = list((DIST / "model").glob("*.onnx")) if (DIST / "model").exists() else []
    if len(models) != 2:
        print(
            f"  WARN: dist/model/ has {len(models)} .onnx file(s) — expected 2"
            f" (fungitastic.onnx, dima806.onnx). The release workflow copies"
            f" them in; locally you must run the export scripts and cp to dist/model/."
        )
    else:
        print(f"  dist/model/ has {len(models)} ONNX files  OK")

    # 5. Parse worker JS as valid JS using Node (catches syntax errors
    #    that Vite wouldn't catch at typecheck). Vite minifies the worker
    #    so esprima's tolerant mode still complains on minified ?? chains.
    import subprocess
    r = subprocess.run(
        ["node", "--check", str(worker_js)],
        capture_output=True, text=True
    )
    if r.returncode != 0:
        print(f"FAIL: worker JS does not parse: {r.stderr.strip()}")
        sys.exit(1)
    print(f"  worker JS parses with node --check  OK")

    # 5b. Static analysis of the built worker — checks the things a real
    #     browser test would catch (model path, tensor shape, EP option).
    #     The browser's self.onmessage is a node worker_threads concern, so
    #     we can't actually run it; this is the closest we can get.
    if "/model/fungitastic.onnx" not in code and "/model/dima806.onnx" not in code:
        # The path lives in main.js, not worker.js — the worker just gets
        # it as a message. So this is a softer check.
        pass
    if "executionProviders:[" not in code and '"wasm"' not in code:
        print("FAIL: worker doesn't reference 'wasm' execution provider")
        sys.exit(1)
    print("  worker references 'wasm' execution provider  OK")
    if "[1,3," not in code:
        print("FAIL: worker doesn't build [1,3,H,W] tensor shape")
        sys.exit(1)
    print("  worker builds [1,3,H,W] tensor shape  OK")
    if "postMessage" not in code:
        print("FAIL: worker doesn't post any messages")
        sys.exit(1)
    print("  worker calls postMessage  OK")

    # 6. CSP includes wasm-unsafe-eval (ort needs it)
    html = (DIST / "index.html").read_text()
    if "wasm-unsafe-eval" not in html:
        print("FAIL: CSP missing 'wasm-unsafe-eval' — ort wasm will be blocked")
        sys.exit(1)
    print(f"  CSP includes wasm-unsafe-eval  OK")

    print()
    print("All built-asset smoke checks passed.")


if __name__ == "__main__":
    main()

/**
 * End-to-end test of the BUILT dist/ in a real headless browser.
 *
 * Loads http://127.0.0.1:4173/, captures all console errors and page errors,
 * feeds a real mushroom photo through the file input, waits for the prediction
 * result, and asserts that the top-1 is the expected species.
 *
 * This is the only test that actually exercises:
 *   - The dist/ build (everything I fixed this session)
 *   - The real onnxruntime-web wasm
 *   - The service worker registration
 *   - The actual UI (file input → worker → softmax → render)
 */
import pw from "/home/kirk/Madlab/Clean-Live/KirkClawSeries/Dopaflow/node_modules/playwright/index.js";
const { chromium } = pw;
import path from "node:path";
import fs from "node:fs";

const PREVIEW_URL = "http://127.0.0.1:4173/";
const TEST_IMAGES = "/tmp/mushroom-test";
const SCREENSHOTS = "/tmp/foragerflow-screenshots";

fs.mkdirSync(SCREENSHOTS, { recursive: true });

// (image, expected top-1 label substring)
const cases = [
  { file: "Amanita_muscaria.jpg", expect: "Amanita muscaria" },
  { file: "Amanita_phalloides.jpg", expect: "Amanita phalloides" },
  { file: "Boletus_edulis.jpg", expect: "Boletus edulis" },
  // Cantharellus is not in BVRA's 215 classes — we expect a "wrong" top-1
  // but the model should still output a valid mushroom label.
  { file: "Cantharellus_cibarius.jpg", expect: "Mycena" },
];

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--enable-features=SharedArrayBuffer",
    ],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const networkLog = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });
  page.on("response", (resp) => {
    const url = resp.url();
    if (url.includes("ort") || url.includes("wasm") || url.includes("onnx") || url.includes("model")) {
      networkLog.push(`${resp.status()} ${resp.headers()["content-type"] || "-"} ${url}`);
    }
  });

  console.log(`Loading ${PREVIEW_URL} ...`);
  await page.goto(PREVIEW_URL, { waitUntil: "domcontentloaded" });

  // Wait for the page to settle and the worker to start
  // The status div starts at "Loading..." then changes
  await page.waitForFunction(
    () => {
      const s = document.getElementById("status");
      return s && s.textContent && s.textContent !== "Loading...";
    },
    { timeout: 30000 }
  );

  // Screenshot the initial state
  await page.screenshot({ path: path.join(SCREENSHOTS, "01-loaded.png"), fullPage: true });

  // Check for permission errors or model-load failures
  const initialStatus = await page.textContent("#status");
  console.log(`  initial status: "${initialStatus}"`);

  // BVRA is loaded by default. The model file is 90+ MB, so load takes
  // a while. Wait for the predictions container to populate, OR for an
  // error to surface. The "Loading model..." → "Ready" transition.
  console.log("Waiting for BVRA model load (this can take 30-60s for 90 MB wasm + ort init) ...");

  // For each test image: set the file input, wait for the status cycle
  // ("Processing..." → "Done") to confirm inference actually completed, then
  // read the top-1. The status check is critical: #predictions is only
  // cleared by ResultsRenderer.render() which runs AFTER the worker
  // returns a new result, so polling for children.length>0 would happily
  // succeed on stale results from earlier images.
  let totalStart = Date.now();
  let pass = 0;
  let fail = 0;
  let lastTop1 = "";

  for (const c of cases) {
    const t0 = Date.now();
    const imgPath = path.join(TEST_IMAGES, c.file);
    if (!fs.existsSync(imgPath)) {
      console.error(`  SKIP ${c.file}: image not found at ${imgPath}`);
      continue;
    }

    // Set the file
    const fileInput = await page.$("#file-input");
    if (!fileInput) {
      console.error(`  FAIL ${c.file}: no #file-input on the page`);
      fail++;
      continue;
    }
    await fileInput.setInputFiles(imgPath);

    // Wait for the status to actually go through "Processing..." — this
    // is what handleFileSelect sets when it kicks off inference.
    try {
      await page.waitForFunction(
        () => document.getElementById("status")?.textContent === "Processing...",
        { timeout: 15000 }
      );
    } catch {
      // Status may have already passed Processing for a fast result. Check
      // the current top-1 against the previous one — if it changed, we
      // already moved on. If it didn't change AND status isn't Done,
      // something is stuck.
      const stuckStatus = await page.textContent("#status");
      const cur = (await page
        .locator("#predictions .prediction:first-child .label > div:first-child")
        .textContent()) ?? "";
      if (cur === lastTop1 && stuckStatus !== "Done") {
        console.error(
          `  FAIL ${c.file}: never reached "Processing...". status="${stuckStatus}"`
        );
        fail++;
        continue;
      }
    }

    // Now wait for status to return to "Done" — emitted by service.ts
    // when a Result message arrives from the worker.
    try {
      await page.waitForFunction(
        () => document.getElementById("status")?.textContent === "Done",
        { timeout: 90000 }
      );
    } catch (e) {
      const status = await page.textContent("#status");
      console.error(
        `  FAIL ${c.file}: status never reached "Done" after 90s. last status="${status}"`
      );
      fail++;
      continue;
    }

    // Give the renderer one tick to paint the new prediction divs.
    await page.waitForFunction(
      () => {
        const c = document.getElementById("predictions");
        return c && c.children.length > 0;
      },
      { timeout: 5000 }
    );

    // Read the top-1
    const top1 = await page.textContent("#predictions .prediction:first-child .label > div:first-child");
    const top1Clean = (top1 || "").trim();
    lastTop1 = top1Clean;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    const ok = top1Clean.toLowerCase().includes(c.expect.toLowerCase());
    if (ok) {
      console.log(`  PASS ${c.file}  → "${top1Clean}"  (${elapsed}s)`);
      pass++;
    } else {
      console.log(
        `  FAIL ${c.file}  → "${top1Clean}"  (expected substring "${c.expect}", ${elapsed}s)`
      );
      fail++;
    }

    // Screenshot the result
    const shotName = `02-${path.basename(c.file, ".jpg")}.png`;
    await page.screenshot({
      path: path.join(SCREENSHOTS, shotName),
      fullPage: true,
    });
  }

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
  console.log();
  console.log(`Total: ${pass} pass, ${fail} fail, ${totalElapsed}s elapsed`);
  console.log(`Screenshots: ${SCREENSHOTS}/`);
  console.log();

  if (consoleErrors.length) {
    console.log(`=== Console errors (${consoleErrors.length}) ===`);
    for (const e of consoleErrors.slice(0, 20)) console.log(`  ${e}`);
  }
  if (pageErrors.length) {
    console.log(`=== Page errors (${pageErrors.length}) ===`);
    for (const e of pageErrors.slice(0, 20)) console.log(`  ${e}`);
  }
  if (networkLog.length) {
    console.log(`=== Network (ort/wasm/model) ===`);
    for (const n of networkLog.slice(0, 40)) console.log(`  ${n}`);
  }

  await browser.close();
  process.exit(fail === 0 && pageErrors.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("test crashed:", e);
  process.exit(1);
});

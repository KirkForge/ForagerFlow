const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PWA = path.join(ROOT, "pwa");
const JS = path.join(PWA, "js");

function extractModelLabels(appJs, modelKey) {
  const startRe = new RegExp(`${modelKey}:\\s*\\{`);
  const startMatch = appJs.match(startRe);
  if (!startMatch) throw new Error(`Could not find ${modelKey} in app.js`);

  let braceCount = 0;
  let inLabels = false;
  let labelsStart = -1;
  let labelsEnd = -1;

  for (let i = startMatch.index; i < appJs.length; i++) {
    const ch = appJs[i];
    if (inLabels) {
      if (ch === "[") braceCount++;
      if (ch === "]") {
        braceCount--;
        if (braceCount === 0) {
          labelsEnd = i;
          break;
        }
      }
    } else if (appJs.slice(i, i + 7) === "labels:") {
      inLabels = true;
      for (let j = i + 7; j < appJs.length; j++) {
        if (appJs[j] === "[") {
          labelsStart = j;
          braceCount = 1;
          i = j;
          break;
        }
      }
    }
  }

  if (labelsStart === -1 || labelsEnd === -1) {
    throw new Error(`Could not extract labels array for ${modelKey}`);
  }

  const block = appJs.slice(labelsStart + 1, labelsEnd);
  // pwa/js/app.js writes labels with 4 entries per line, e.g.
  //   "Agaricus altipes","Agaricus arvensis","Agaricus augustus","Agaricus bernardii",
  // Split each line on ',' first, then unquote each part.
  const items = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/,$/, "").trim();
    if (!line) continue;
    for (const part of line.split(",")) {
      const t = part.trim();
      if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
        items.push(t.slice(1, -1));
      }
    }
  }
  return items;
}

function extractKnowledgeKeys(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const keys = [];
  const regex = /"([^"]+)":\s*\{/g;
  let m;
  while ((m = regex.exec(content)) !== null) {
    keys.push(m[1]);
  }
  return new Set(keys);
}

const appJs = fs.readFileSync(path.join(JS, "app.js"), "utf8");
const knowledge = extractKnowledgeKeys(path.join(JS, "knowledge.js"));

// Source of truth for BVRA: the class list shipped with the ONNX model
// (pwa/model/fungitastic-classes.json). Some upstream FungiTastic classes
// appear more than once in this file — that's part of the model's training
// output, not a bug. We must match the model class file *exactly* to keep
// logit index → label alignment intact.
const bvraExpectedPath = path.join(PWA, "model", "fungitastic-classes.json");
const bvraExpected = JSON.parse(fs.readFileSync(bvraExpectedPath, "utf8"));
const dimaExpected = JSON.parse(fs.readFileSync(
  path.join(ROOT, "src", "data", "labels-dima806.json"),
  "utf8",
));

const appBvra = extractModelLabels(appJs, "bvra");
const appDima = extractModelLabels(appJs, "dima806");

let exitCode = 0;

function check(name, appLabels, sourceLabels, knowledgeSet) {
  console.log(`\n--- ${name} ---`);
  if (appLabels.length !== sourceLabels.length) {
    console.error(
      `FAIL: app.js has ${appLabels.length} labels but source has ${sourceLabels.length}`,
    );
    exitCode = 1;
  } else {
    console.log(`PASS: Label count = ${appLabels.length}`);
  }

  // Exact match, order-sensitive (model logit i → label[i])
  const firstDiff = appLabels.findIndex((l, i) => l !== sourceLabels[i]);
  if (firstDiff !== -1) {
    const show = (arr) =>
      arr
        .slice(Math.max(0, firstDiff - 2), firstDiff + 5)
        .map((x, j) => `    [${firstDiff - 2 + j}] ${x}`)
        .join("\n");
    console.error(
      `FAIL: app.js labels diverge from source at index ${firstDiff}.\n` +
        `  app.js:\n${show(appLabels)}\n` +
        `  source:\n${show(sourceLabels)}`,
    );
    exitCode = 1;
  } else {
    console.log("PASS: app.js labels match source exactly");
  }

  // Knowledge coverage — every distinct label should have a knowledge entry.
  // Duplicates share the same knowledge key, so report on the unique set.
  const uniqueLabels = new Set(sourceLabels);
  const missing = [];
  for (const l of uniqueLabels) {
    if (!knowledgeSet.has(l)) missing.push(l);
  }
  if (missing.length > 0) {
    console.error(
      `FAIL: Missing knowledge entries (${missing.length}): ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "..." : ""}`,
    );
    exitCode = 1;
  } else {
    console.log(
      `PASS: All ${uniqueLabels.size} unique labels have knowledge entries`,
    );
  }
}

check("BVRA", appBvra, bvraExpected, knowledge);
check("dima806", appDima, dimaExpected, knowledge);

process.exit(exitCode);

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
  return block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith('"'))
    .map((l) => l.replace(/,$/, "").replace(/^"/, "").replace(/"$/, ""));
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
const bvra = extractModelLabels(appJs, "bvra");
const dima = extractModelLabels(appJs, "dima806");
const knowledge = extractKnowledgeKeys(path.join(JS, "knowledge.js"));

let exitCode = 0;

function check(name, labels, expectedCount, knowledgeSet) {
  console.log(`\n--- ${name} ---`);
  if (labels.length !== expectedCount) {
    console.error(`FAIL: Expected ${expectedCount} labels, got ${labels.length}`);
    exitCode = 1;
  } else {
    console.log(`PASS: Label count = ${labels.length}`);
  }

  const seen = new Set();
  const dups = [];
  for (const l of labels) {
    if (seen.has(l)) dups.push(l);
    seen.add(l);
  }
  if (dups.length > 0) {
    console.error(`FAIL: Duplicate labels: ${dups.join(", ")}`);
    exitCode = 1;
  } else {
    console.log("PASS: No duplicate labels");
  }

  const missing = [];
  for (const l of labels) {
    if (!knowledgeSet.has(l)) missing.push(l);
  }
  if (missing.length > 0) {
    console.error(`FAIL: Missing knowledge entries (${missing.length}): ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "..." : ""}`);
    exitCode = 1;
  } else {
    console.log("PASS: All labels have knowledge entries");
  }
}

check("BVRA", bvra, 215, knowledge);
check("dima806", dima, 100, knowledge);

process.exit(exitCode);

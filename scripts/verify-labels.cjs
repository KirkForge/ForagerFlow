// scripts/verify-labels.cjs
//
// Asserts that the labels and knowledge in src/data/ agree with the
// canonical class list shipped with the BVRA ONNX model
// (pwa/model/fungitastic-classes.json).
//
// What this catches:
//   - TS code referencing a label that the ONNX model does not output
//     (label/logit alignment drift would be silently wrong).
//   - Knowledge JSON missing an entry for a label that the model can
//     predict (would render as "No data available." on a real
//     identification — bad for a food-safety app).
//
// dima806 has no equivalent canonical class list checked into the repo
// (the model is loaded by class name; the TS label array IS the
// source of truth). We verify the dima806 label array is well-formed
// and that every label has a knowledge entry.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC_DATA = path.join(ROOT, "src", "data");
const PWA_MODEL = path.join(ROOT, "pwa", "model");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const bvraExpected = readJson(path.join(PWA_MODEL, "fungitastic-classes.json"));
const bvraLabels = readJson(path.join(SRC_DATA, "labels-bvra.json"));
const bvraKnowledge = readJson(path.join(SRC_DATA, "knowledge-bvra.json"));
const dimaLabels = readJson(path.join(SRC_DATA, "labels-dima806.json"));
const dimaKnowledge = readJson(path.join(SRC_DATA, "knowledge-dima806.json"));

let exitCode = 0;

function compareOrder(name, appLabels, sourceLabels) {
  console.log(`\n--- ${name} ---`);
  if (appLabels.length !== sourceLabels.length) {
    console.error(
      `FAIL: TS labels has ${appLabels.length} entries but source has ${sourceLabels.length}`,
    );
    exitCode = 1;
    return;
  }
  console.log(`PASS: ${name} label count = ${appLabels.length}`);

  const firstDiff = appLabels.findIndex((l, i) => l !== sourceLabels[i]);
  if (firstDiff !== -1) {
    const show = (arr) =>
      arr
        .slice(Math.max(0, firstDiff - 2), firstDiff + 5)
        .map((x, j) => `    [${firstDiff - 2 + j}] ${x}`)
        .join("\n");
    console.error(
      `FAIL: TS labels diverge from source at index ${firstDiff}.\n` +
        `  src/data/labels:\n${show(appLabels)}\n` +
        `  source:\n${show(sourceLabels)}`,
    );
    exitCode = 1;
    return;
  }
  console.log(`PASS: ${name} labels match source exactly (order-sensitive)`);
}

function checkKnowledge(name, labels, knowledge) {
  const uniqueLabels = new Set(labels);
  const missing = [];
  for (const l of uniqueLabels) {
    if (!Object.prototype.hasOwnProperty.call(knowledge, l)) missing.push(l);
  }
  if (missing.length > 0) {
    console.error(
      `FAIL: ${name} knowledge missing ${missing.length} entries: ${missing
        .slice(0, 5)
        .join(", ")}${missing.length > 5 ? "..." : ""}`,
    );
    exitCode = 1;
    return;
  }
  console.log(
    `PASS: All ${uniqueLabels.size} unique ${name} labels have knowledge entries`,
  );
}

compareOrder("BVRA", bvraLabels, bvraExpected);
checkKnowledge("BVRA", bvraLabels, bvraKnowledge);

// dima806: no canonical class file in the repo. We just check that
// every label has a knowledge entry, and that there are exactly 100
// (the model's known output count, from the registry and the export
// script smoke test).
console.log(`\n--- dima806 ---`);
if (dimaLabels.length !== 100) {
  console.error(
    `FAIL: dima806 label count = ${dimaLabels.length} (expected 100)`,
  );
  exitCode = 1;
} else {
  console.log(`PASS: dima806 label count = 100`);
}
const dimaUnique = new Set(dimaLabels);
if (dimaUnique.size !== dimaLabels.length) {
  console.error(
    `FAIL: dima806 labels have ${dimaLabels.length - dimaUnique.size} duplicate(s)`,
  );
  exitCode = 1;
} else {
  console.log(`PASS: dima806 labels are unique`);
}
checkKnowledge("dima806", dimaLabels, dimaKnowledge);

process.exit(exitCode);

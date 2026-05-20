#!/usr/bin/env python3
"""Build-time verification that label lists match expected counts and have knowledge entries."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
PWA = ROOT / "pwa"
JS = PWA / "js"


def extract_js_string_array(content, key_prefix):
    """Extract a string array assigned to a JS object key, e.g. labels: [...]"""
    idx = content.find(key_prefix)
    if idx == -1:
        raise ValueError(f"Could not find {key_prefix}")
    bracket_start = content.find("[", idx)
    if bracket_start == -1:
        raise ValueError(f"Could not find array start for {key_prefix}")
    depth = 0
    bracket_end = -1
    for i, ch in enumerate(content[bracket_start:], start=bracket_start):
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                bracket_end = i
                break
    if bracket_end == -1:
        raise ValueError(f"Could not find array end for {key_prefix}")
    block = content[bracket_start + 1 : bracket_end]
    items = []
    for line in block.splitlines():
        line = line.strip()
        if not line:
            continue
        for item in line.split(","):
            item = item.strip()
            if item.startswith('"') and item.endswith('"'):
                items.append(item[1:-1])
    return items


def extract_model_labels(app_js, model_key):
    model_start = app_js.find(f"{model_key}:")
    if model_start == -1:
        raise ValueError(f"Could not find {model_key}")
    block = app_js[model_start:]
    labels = extract_js_string_array(block, "labels:")
    return labels


def extract_knowledge_keys(path):
    content = path.read_text()
    return set(re.findall(r'"([^"]+)":\s*\{', content))


def check(name, labels, expected_count, knowledge_set):
    print(f"\n--- {name} ---")
    ok = True
    if len(labels) != expected_count:
        print(f"FAIL: Expected {expected_count} labels, got {len(labels)}")
        ok = False
    else:
        print(f"PASS: Label count = {len(labels)}")

    seen = set()
    dups = [l for l in labels if l in seen or seen.add(l)]
    # BVRA dataset has two Clitocybe nebularis entries with different author citations
    allowed_dups = {"Clitocybe nebularis"}
    unexpected_dups = [d for d in dups if d not in allowed_dups]
    if unexpected_dups:
        print(f"FAIL: Unexpected duplicate labels: {', '.join(unexpected_dups)}")
        ok = False
    else:
        print("PASS: No unexpected duplicate labels")

    missing = [l for l in labels if l not in knowledge_set]
    if missing:
        print(f"FAIL: Missing knowledge entries ({len(missing)}): {', '.join(missing[:5])}{'...' if len(missing) > 5 else ''}")
        ok = False
    else:
        print("PASS: All labels have knowledge entries")

    return ok


def main():
    app_js = (JS / "app.js").read_text()
    knowledge = extract_knowledge_keys(JS / "knowledge.js")

    bvra = extract_model_labels(app_js, "bvra")
    dima = extract_model_labels(app_js, "dima806")

    ok = True
    ok &= check("BVRA", bvra, 215, knowledge)
    ok &= check("dima806", dima, 100, knowledge)

    # Also verify the canonical JSON file matches the embedded labels
    if (PWA / "model" / "fungitastic-classes.json").exists():
        canonical = json.loads((PWA / "model" / "fungitastic-classes.json").read_text())
        if canonical != bvra:
            print("\nFAIL: Embedded BVRA labels do not match fungitastic-classes.json")
            ok = False
        else:
            print("\nPASS: Embedded BVRA labels match fungitastic-classes.json")

    if not ok:
        raise SystemExit(1)
    print("\nAll checks passed.")


if __name__ == "__main__":
    main()

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const noRawUiStrings = require("./eslint-rules/no-raw-ui-strings.cjs");

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["scripts/*.cjs", "scripts/*.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.worker,
        ...globals.es2022,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["tests/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-deprecated": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/non-nullable-type-assertion-style": "off",
      "@typescript-eslint/no-misused-spread": "off",
      "@typescript-eslint/no-empty-function": "off",
    },
  },
  {
    files: ["scripts/**/*.cjs", "scripts/**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "no-console": "off",
    },
  },
  {
    // e2e + playwright config live outside tsconfig's include (playwright
    // compiles them itself), so they can't go through projectService — but
    // they still get recommended + stylistic rules, just not type-checked.
    files: ["e2e/**/*.ts", "playwright.config.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    plugins: {
      local: {
        rules: {
          "no-raw-ui-strings": noRawUiStrings,
        },
      },
    },
    rules: {
      "local/no-raw-ui-strings": "warn",
    },
  },
  {
    // ponytail: *.js in flat-config doesn't cross /, so generated/vendored
    // .js under subdirs must be ignored by directory. coverage/ is vitest
    // output, public/js/ is the vendored ONNX runtime.
    ignores: [
      "dist/",
      "node_modules/",
      "pwa/",
      "coverage/",
      "public/js/",
      "*.js",
      "eslint-rules/",
    ],
  },
);

import { resolve } from "node:path";
import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

export default defineConfig({
  root: "src",
  publicDir: "../public",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(
      JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")).version,
    ),
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/index.html"),
        sw: resolve(__dirname, "src/sw.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          // Service worker is loaded by the browser at the root path
          // (/sw.js), so keep its filename stable (no hash).
          chunk.name === "sw" ? "sw.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  worker: {
    // Classic (IIFE) worker so it can use importScripts to load the
    // vendored UMD ort.min.js. Module workers cannot use importScripts
    // and ort.min.js is not an ES module.
    format: "iife",
    rollupOptions: {
      output: {
        entryFileNames: "assets/inference-worker-[hash].js",
      },
    },
  },
});

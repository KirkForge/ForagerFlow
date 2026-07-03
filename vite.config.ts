import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { readFileSync } from "node:fs";
import { visualizer } from "rollup-plugin-visualizer";

const analyze = process.env["ANALYZE"] === "true";

export default defineConfig({
  root: "src",
  publicDir: "../public",
  plugins: analyze
    ? [
        visualizer({
          open: false,
          filename: resolve(__dirname, "dist/stats.html"),
          gzipSize: true,
        }) as unknown as Plugin,
      ]
    : [],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(
      (
        JSON.parse(
          readFileSync(resolve(__dirname, "package.json"), "utf8"),
        ) as { version: string }
      ).version,
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

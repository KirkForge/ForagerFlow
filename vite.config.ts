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
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  worker: {
    format: "es",
    rollupOptions: {
      output: {
        entryFileNames: "assets/inference-worker-[hash].js",
      },
    },
  },
});

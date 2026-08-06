import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";
import path from "node:path";
import { cpSync, existsSync, mkdirSync } from "node:fs";

/** Ensure manifest-referenced icon PNGs land in dist/. */
function copyExtensionIcons() {
  return {
    name: "openkey-copy-icons",
    closeBundle() {
      const src = path.resolve(__dirname, "icons");
      const dest = path.resolve(__dirname, "dist/icons");
      if (!existsSync(src)) return;
      mkdirSync(dest, { recursive: true });
      cpSync(src, dest, { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [
    webExtension({
      manifest: path.resolve(__dirname, "manifest.json"),
      additionalInputs: [
        "src/popup/popup.html",
        "src/options/options.html",
        "src/passkey/page-script.ts",
      ],
      assets: "icons",
    }),
    copyExtensionIcons(),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  base: "./",
});

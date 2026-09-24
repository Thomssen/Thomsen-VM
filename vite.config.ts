import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// The Tauri CLI sets this when it drives Vite.
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  // Vite options tailored for Tauri development.
  clearScreen: false,
  server: {
    port: 1430,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1431,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  build: {
    target: "esnext",
    minify: "esbuild",
    sourcemap: false,
  },

  // The dev-server dependency pre-bundler (esbuild) infers its own, older
  // default target unrelated to `build.target` above - without this,
  // `@novnc/novnc`'s top-level `await` (browser codec feature detection)
  // fails to pre-bundle in `npm run dev` / `tauri dev` even though the
  // production build (which already used `esnext`) is unaffected.
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
}));

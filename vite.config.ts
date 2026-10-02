import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;

const googleProxy = (target: string, prefix: string) => ({
  target,
  changeOrigin: true,
  rewrite: (p: string) => p.replace(new RegExp(`^${prefix}`), ""),
});

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      ignored: ["**/src-tauri/**", "**/dev-secrets/**"],
    },
    // Browser mode (dev/E2E) reaches Google APIs same-origin to avoid CORS.
    proxy: {
      "/g/firestore": googleProxy("https://firestore.googleapis.com", "/g/firestore"),
      "/g/remoteconfig": googleProxy("https://firebaseremoteconfig.googleapis.com", "/g/remoteconfig"),
      "/g/oauth2": googleProxy("https://oauth2.googleapis.com", "/g/oauth2"),
    },
  },

  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests-integration/**/*.test.ts"],
    passWithNoTests: true,
  },
}));

import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  // The offline build can be hosted from any sub-path (static hosting, artifact preview).
  base: mode === "offline" ? "./" : "/",
  server: { port: 5173, host: true },
  build: { chunkSizeWarningLimit: 2000 },
}));

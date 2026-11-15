import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
  preview: {
    host: "0.0.0.0",
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});

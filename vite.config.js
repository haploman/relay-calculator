import { defineConfig } from "vite";
import content from "./site-editor/content.json";

export default defineConfig({
  plugins: [{
    name: "help-page-content",
    transformIndexHtml(html) {
      const escaped = String(content.helpIntro).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      return html.replace("{{helpIntro}}", () => escaped);
    },
  }],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
  preview: {
    host: "0.0.0.0",
  },
  build: {
    rollupOptions: { input: { calculator: "index.html", help: "help/index.html" } },
    target: "es2022",
    sourcemap: true,
  },
});

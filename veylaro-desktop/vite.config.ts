import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so the built bundle also loads from file:// inside Electron
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5176 },
});

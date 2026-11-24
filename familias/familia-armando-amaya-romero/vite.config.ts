import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { readFileSync } from "node:fs";

const appConfig = JSON.parse(readFileSync(new URL("./src/data/app-config.json", import.meta.url), "utf8")) as { basePath: string };

export default defineConfig({
  base: appConfig.basePath,
  plugins: [react(), tailwindcss(), tsconfigPaths()],
});

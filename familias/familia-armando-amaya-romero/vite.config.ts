import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { readFileSync } from "node:fs";

const appConfig = JSON.parse(readFileSync(new URL("./src/data/app-config.json", import.meta.url), "utf8")) as { basePath: string };
const pagesRepo = process.env["ATLAS_PAGES_REPO"];

export default defineConfig({
  base: pagesRepo ? `/${pagesRepo}${appConfig.basePath}` : appConfig.basePath,
  plugins: [react(), tailwindcss(), tsconfigPaths()],
});

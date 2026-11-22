import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("App routing", () => {
  it("ships a static Spanish app shell with a PWA manifest", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).toContain("<html lang=\"es\">");
    expect(html).toContain("%BASE_URL%manifest.webmanifest");
    expect(html).toContain("/src/main.tsx");
  });
});

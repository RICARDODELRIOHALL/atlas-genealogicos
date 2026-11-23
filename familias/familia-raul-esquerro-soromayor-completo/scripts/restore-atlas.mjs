import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const dataDir = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, "/src/data");
const parts = readdirSync(dataDir).filter((name) => /^atlas\.part-\d+\.b64$/.test(name)).sort();
if (parts.length !== 5) throw new Error("Expected 5 compressed Atlas parts, found " + parts.length);
const compressed = Buffer.from(parts.map((name) => readFileSync(join(dataDir, name), "utf8").trim()).join(""), "base64");
const json = gunzipSync(compressed);
JSON.parse(json.toString("utf8"));
writeFileSync(join(dataDir, "atlas.json"), json);

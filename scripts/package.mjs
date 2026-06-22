import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "release";

function fail(msg: string): never {
  console.error(`\n  package: ${msg}\n`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
if (!existsSync(manifest.entry)) {
  fail(`${manifest.entry} not found — run \`npm run build\` first.`);
}

const ablxName = `${(manifest.name || "extension").replace(/\s+/gu, "-")}-${manifest.version || "0.0.0"}.ablx`;
const outPath = join(OUT_DIR, ablxName);

mkdirSync(OUT_DIR, { recursive: true });
for (const f of readdirSync(OUT_DIR)) {
  if (f.endsWith(".ablx")) rmSync(join(OUT_DIR, f));
}

const cliBin = join("node_modules", ".bin", process.platform === "win32" ? "extensions-cli.cmd" : "extensions-cli");
execFileSync(cliBin, ["package", "-o", outPath, "-i", "dist/vendor", "-i", "dist/models"], { stdio: ["ignore", "ignore", "inherit"] });

const sizeMB = (statSync(outPath).size / 1024 / 1024).toFixed(2);
console.log(`\n  package: ${manifest.name} ${manifest.version} → ${outPath} (${sizeMB} MB)`);
console.log(`  install: drag it onto Live → Preferences → Extensions.\n`);

if (process.argv.includes("--reveal") && process.platform === "darwin") {
  execFileSync("open", ["-R", outPath]);
}

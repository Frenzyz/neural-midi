#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

function readEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(".env", "utf8")
      .split("\n")
      .find((l) => l.trim().startsWith(`${name}=`));
    if (line) return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  } catch {
    // no .env
  }
  return undefined;
}

function isLiveBetaRunning(livePath) {
  try {
    const needle = livePath.replace(/\/$/u, "");
    const ps = execSync("ps ax -o command=", { encoding: "utf8" });
    return ps.split("\n").some((line) => line.includes(needle));
  } catch {
    return false;
  }
}

const livePath = readEnv("EXTENSION_HOST_PATH");
if (!livePath) {
  console.error("\n  dev-preflight: EXTENSION_HOST_PATH is not set in .env\n");
  process.exit(1);
}

if (!existsSync(livePath)) {
  console.error(`\n  dev-preflight: Live app not found at:\n    ${livePath}\n`);
  console.error("  Use Ableton Live 12 Beta (Extensions), not Standard/Intro.\n");
  process.exit(1);
}

const hostModule = join(
  livePath.replace(/\/$/u, ""),
  "Contents/Helpers/ExtensionHost/ExtensionHostNodeModule.node",
);

if (!existsSync(hostModule)) {
  console.error(`\n  dev-preflight: Extension Host not found in:\n    ${livePath}\n`);
  console.error("  This build of Live does not support Extensions. Use Live 12 Beta.\n");
  process.exit(1);
}

if (!isLiveBetaRunning(livePath)) {
  console.error("\n  dev-preflight: Ableton Live 12 Beta is not running.\n");
  console.error("  The Extension Host handshake times out (~25s) if Live is closed.");
  console.error("  1. Open Ableton Live 12 Beta");
  console.error("  2. Preferences → Extensions → enable Developer Mode");
  console.error("  3. Leave Live running, then run: npm start\n");
  process.exit(1);
}

console.log("  dev-preflight: OK — Live Beta running + Extension Host found");
console.log("");
console.log("  Ensure Developer Mode is ON (Preferences → Extensions).");
console.log("  If handshake still fails, quit npm start, toggle Developer Mode, reopen Live, retry.");
console.log("");

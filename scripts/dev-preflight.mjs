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
    return ps.split("\n").some((line) => line.includes(needle) && line.includes("/MacOS/Live"));
  } catch {
    return false;
  }
}

function listDevExtensionHosts() {
  try {
    const ps = execSync("ps ax -o pid=,command=", { encoding: "utf8" });
    return ps
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("ExtensionHostNodeModule.node") && line.includes("initialize"));
  } catch {
    return [];
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
  console.error("  1. Open Ableton Live 12 Beta and wait until a set is loaded");
  console.error("  2. Preferences → Extensions → enable Developer Mode");
  console.error("  3. Run: npm start\n");
  process.exit(1);
}

const staleHosts = listDevExtensionHosts();
if (staleHosts.length > 0) {
  console.error("\n  dev-preflight: stale Extension Host process(es) detected.\n");
  console.error("  A previous `npm start` may still be running or was killed without cleanup.");
  console.error("  This often causes: Extension Host bring-up timed out (control channel handshake)\n");
  console.error("  Fix:");
  console.error("    npm run stop-host");
  console.error("    npm start\n");
  process.exit(1);
}

console.log("  dev-preflight: OK — Live Beta running, no stale Extension Host");
console.log("");
console.log("  Required: Preferences → Extensions → Developer Mode ON");
console.log("  (Preflight cannot verify Developer Mode — if handshake fails, toggle it off/on and restart Live.)");
console.log("");

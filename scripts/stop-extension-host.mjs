#!/usr/bin/env node
import { execSync } from "node:child_process";

const MARKER = "ExtensionHostNodeModule.node";

function listDevHosts() {
  try {
    const ps = execSync("ps ax -o pid=,command=", { encoding: "utf8" });
    return ps
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes(MARKER) && line.includes("initialize"))
      .map((line) => {
        const match = /^(\d+)\s+(.*)$/.exec(line);
        return match ? { pid: Number(match[1]), command: match[2] } : null;
      })
      .filter((entry) => entry !== null);
  } catch {
    return [];
  }
}

const hosts = listDevHosts();
if (hosts.length === 0) {
  console.log("  stop-host: no dev Extension Host processes found");
  process.exit(0);
}

for (const host of hosts) {
  try {
    process.kill(host.pid, "SIGTERM");
    console.log(`  stop-host: stopped pid ${host.pid}`);
  } catch (err) {
    console.warn(`  stop-host: could not stop pid ${host.pid}:`, err);
  }
}

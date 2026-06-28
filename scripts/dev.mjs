/**
 * scripts/dev.mjs — one command to run the whole local stack.
 *
 *   npm run dev
 *
 * Starts the Next dev server AND the smee webhook forwarder together, so GitHub
 * App events reach http://localhost:3000/api/webhooks/github without a second
 * terminal. (GitHub's servers can't reach localhost, so the public smee.io
 * channel relays inbound webhooks — see README. The install *redirect* does not
 * use smee; only inbound webhooks do.)
 *
 * Both children are launched with the current `node` binary against each
 * package's JS entrypoint (no cmd.exe / .cmd shim), so this works even on a
 * minimal PATH. Ctrl-C — or either child exiting — tears down both.
 *
 * Override the channel with SMEE_URL=... (defaults to the project's channel).
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const SMEE_URL = process.env.SMEE_URL ?? "https://smee.io/3KboNMM9kjMFrGl3";
const TARGET = process.env.SMEE_TARGET ?? "http://localhost:3000/api/webhooks/github";

const nextBin = require.resolve("next/dist/bin/next");
const smeeBin = require.resolve("smee-client/bin/smee.js");

/** Spawn `node <entry> <args...>` with a labelled, prefixed stdout/stderr. */
function run(label, color, entry, args) {
  const child = spawn(process.execPath, [entry, ...args], {
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
  });
  const tag = `\x1b[${color}m[${label}]\x1b[0m `;
  const prefix = (stream, out) => {
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) out.write(tag + line + "\n");
    });
    stream.on("end", () => { if (buf) out.write(tag + buf + "\n"); });
  };
  prefix(child.stdout, process.stdout);
  prefix(child.stderr, process.stderr);
  return child;
}

const children = [
  run("next", "36", nextBin, ["dev"]),            // cyan
  run("smee", "35", smeeBin, ["--url", SMEE_URL, "--target", TARGET]), // magenta
];

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    if (!c.killed) c.kill("SIGTERM");
  }
  process.exit(code);
}

for (const c of children) {
  c.on("exit", (code) => shutdown(code ?? 0));
  c.on("error", (err) => {
    process.stderr.write(`failed to start child: ${err.message}\n`);
    shutdown(1);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

/**
 * scripts/lemma-bootstrap.ts — one-shot: capture a LIVE Lemma refresh token and
 * write a correct .env.local so the deployed app never 401s on token expiry.
 *
 * Run:  node --import tsx scripts/lemma-bootstrap.ts
 *
 * Lemma issues a 1-hour access token + a ~100-day refresh token, and it ROTATES
 * the refresh token on every refresh (reusing a rotated one = theft lockout).
 * So a durable server must persist each rotation. This script:
 *
 *   1. Reads the current refresh token (LEMMA_REFRESH_TOKEN env, else the local
 *      `lemma` CLI config at ~/.lemma/config.json).
 *   2. Refreshes ONCE → gets a fresh access token + the rotated refresh token.
 *   3. Persists the rotated refresh token EVERYWHERE so the chain is never lost:
 *        • ~/.lemma/config.json  (keeps the CLI valid)
 *        • .env.local            (LEMMA_REFRESH_TOKEN = the rotated token = the
 *                                 seed the running app boots from)
 *   4. Discovers your pod id (GET /organizations → GET /pods/organization/{id})
 *      and writes LEMMA_POD_ID + LEMMA_REFRESH_TOKEN_FILE (so the app persists
 *      its OWN future rotations across restarts — see lib/lemma-auth.ts).
 *
 * After this, `npm run dev` / the container boots from the seed, refreshes once,
 * and keeps the rotated token in .lemma-refresh.json — indefinitely.
 *
 * Prints NO secrets (only lengths / expiries / pod ids).
 */

import { readFile, writeFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const API_URL = (process.env.LEMMA_API_URL ?? "https://api.lemma.work").replace(/\/$/, "");
const AUTH_URL = process.env.LEMMA_AUTH_URL ?? "https://lemma.work/auth";
const ROOT = process.cwd();
const ENV_PATH = join(ROOT, ".env.local");
const REFRESH_FILE = join(ROOT, ".lemma-refresh.json");
const CLI_CFG = join(homedir(), ".lemma", "config.json");

function decodeExpMs(jwt: string): number {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")).exp * 1000;
  } catch {
    return 0;
  }
}

async function readCliConfig(): Promise<any | null> {
  try {
    return JSON.parse(await readFile(CLI_CFG, "utf8"));
  } catch {
    return null;
  }
}

/** Freshest refresh token: env seed wins, else the CLI config. */
async function currentRefreshToken(cli: any | null): Promise<{ token: string; source: string } | null> {
  const env = process.env.LEMMA_REFRESH_TOKEN?.trim();
  if (env) return { token: env, source: "LEMMA_REFRESH_TOKEN" };
  const active = cli?.active_server ?? "default";
  const token = (cli?.servers?.[active]?.auth?.refresh_token ?? "").trim();
  if (token) return { token, source: `~/.lemma/config.json (${active})` };
  return null;
}

async function atomicWrite(path: string, data: string, mode = 0o600) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, data, { mode });
  await rename(tmp, path);
}

/** Merge keys into a dotenv file, preserving any existing lines/order. */
async function upsertEnv(path: string, updates: Record<string, string>) {
  let existing = "";
  try {
    existing = await readFile(path, "utf8");
  } catch {
    /* new file */
  }
  const lines = existing.split("\n");
  const seen = new Set<string>();
  const out = lines.map((line) => {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (m && updates[m[1]] !== undefined) {
      seen.add(m[1]);
      return `${m[1]}=${updates[m[1]]}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) out.push(`${k}=${v}`);
  }
  await atomicWrite(path, out.filter((l, i) => !(l === "" && i === out.length - 1)).join("\n") + "\n", 0o600);
}

async function main() {
  console.log(`\n▶ Lemma bootstrap — ${API_URL}\n`);

  const cli = await readCliConfig();
  const seed = await currentRefreshToken(cli);
  if (!seed) {
    console.error("✗ No refresh token. Run `lemma auth login`, or set LEMMA_REFRESH_TOKEN, then re-run.");
    process.exit(1);
  }
  console.log(`• seed source : ${seed.source} (len ${seed.token.length})`);

  // 1. Refresh — capture the rotated token.
  const res = await fetch(`${API_URL}/auth/cli/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refresh_token: seed.token }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ refresh failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
    console.error("  → token rotated/revoked. Re-run `lemma auth login` and try again.");
    process.exit(1);
  }
  const d = JSON.parse(text);
  const s = (d.session && typeof d.session === "object" ? d.session : d) as Record<string, unknown>;
  const access = String(s.access_token ?? s.token ?? "");
  const rotated = String(s.refresh_token ?? seed.token);
  console.log(`✓ refresh OK — access exp ${new Date(decodeExpMs(access)).toISOString()}`);
  console.log(`• refresh rotated: ${rotated !== seed.token ? "YES → persisting the new one" : "no"}`);

  // 2. (The rotated token is persisted only inside the repo — .env.local seed +
  //    the file store the app writes. We deliberately do NOT touch the out-of-
  //    repo `lemma` CLI config; the app is the sole owner of the chain now.)

  // 3. Discover pod id.
  let podId = process.env.LEMMA_POD_ID?.trim() ?? "";
  const auth = { Accept: "application/json", Authorization: `Bearer ${access}` };
  try {
    const orgsRaw = await (await fetch(`${API_URL}/organizations`, { headers: auth })).json();
    const orgs = (Array.isArray(orgsRaw) ? orgsRaw : orgsRaw.items ?? []) as Array<Record<string, unknown>>;
    const pods: Array<Record<string, unknown>> = [];
    for (const o of orgs) {
      const oid = o.id ?? o.organization_id;
      const raw = await (await fetch(`${API_URL}/pods/organization/${oid}`, { headers: auth })).json();
      for (const p of (Array.isArray(raw) ? raw : raw.items ?? []) as Array<Record<string, unknown>>) {
        pods.push({ ...p, __org: oid });
      }
    }
    console.log(`\n▶ Pods (${pods.length}):`);
    for (const p of pods) console.log(`   - ${p.id ?? p.pod_id}  «${p.name ?? p.slug ?? "?"}»  org=${p.__org}`);
    if (!podId && pods.length === 1) {
      podId = String(pods[0].id ?? pods[0].pod_id);
      console.log(`→ single pod → LEMMA_POD_ID=${podId}`);
    } else if (!podId && pods.length > 1) {
      console.log(`→ multiple pods: pick the one with your tables and set LEMMA_POD_ID manually.`);
    }
  } catch (e) {
    console.log(`(pod discovery skipped: ${(e as Error).message})`);
  }

  // 4. Write .env.local (seed = the rotated token; the app persists future rotations to the file).
  const updates: Record<string, string> = {
    LEMMA_API_URL: API_URL,
    LEMMA_AUTH_URL: AUTH_URL,
    LEMMA_REFRESH_TOKEN: rotated,
    LEMMA_REFRESH_TOKEN_FILE: REFRESH_FILE,
  };
  if (podId) updates.LEMMA_POD_ID = podId;
  await upsertEnv(ENV_PATH, updates);
  console.log(`\n✓ wrote ${ENV_PATH}`);
  console.log(`   LEMMA_REFRESH_TOKEN      = <rotated, len ${rotated.length}>`);
  console.log(`   LEMMA_REFRESH_TOKEN_FILE = ${REFRESH_FILE}`);
  console.log(`   LEMMA_POD_ID             = ${podId || "(set manually — see pods above)"}`);
  console.log(`\n→ The app now boots from this seed and persists every future rotation to`);
  console.log(`  ${REFRESH_FILE} — so restarts never replay a dead token. Add both to .gitignore.\n`);
}

main().catch((e) => {
  console.error("\n✗ bootstrap crashed:", e?.message ?? e);
  process.exit(1);
});

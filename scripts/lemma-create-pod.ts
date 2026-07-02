/**
 * scripts/lemma-create-pod.ts — create a fresh Lemma pod for AutoHeal and point
 * LEMMA_POD_ID at it. Run once:
 *
 *   node --env-file=.env.local --import tsx scripts/lemma-create-pod.ts [name]
 *
 * Uses the app's own auth path (ensureAccessToken → durable refresh store), then
 * POST /pods, then rewrites LEMMA_POD_ID in .env.local. Follow with
 * `npm run lemma:setup` to provision the tables into the new pod.
 */

import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { ensureAccessToken, currentAccessToken } from "../lib/lemma-auth";

const API_URL = (process.env.LEMMA_API_URL ?? "https://api.lemma.work").replace(/\/$/, "");
const ENV_PATH = join(process.cwd(), ".env.local");
const POD_NAME = process.argv[2] ?? "autoheal";

async function upsertEnv(path: string, key: string, value: string) {
  let text = "";
  try {
    text = await readFile(path, "utf8");
  } catch {
    /* new file */
  }
  const lines = text.split("\n");
  let found = false;
  const out = lines.map((l) => (l.match(new RegExp(`^${key}=`)) ? ((found = true), `${key}=${value}`) : l));
  if (!found) out.push(`${key}=${value}`);
  const tmp = `${path}.tmp`;
  await writeFile(tmp, out.join("\n").replace(/\n+$/, "\n"), { mode: 0o600 });
  await rename(tmp, path);
}

async function main() {
  await ensureAccessToken();
  const auth = { Accept: "application/json", Authorization: `Bearer ${currentAccessToken()}` };

  // Resolve an organization to create the pod in.
  const orgsRaw = await (await fetch(`${API_URL}/organizations`, { headers: auth })).json();
  const orgs = (Array.isArray(orgsRaw) ? orgsRaw : orgsRaw.items ?? []) as Array<Record<string, unknown>>;
  if (orgs.length === 0) throw new Error("no organizations available to create a pod in");
  const orgId = String(orgs[0].id ?? orgs[0].organization_id);
  console.log(`▶ creating pod «${POD_NAME}» in org ${orgId}`);

  const res = await fetch(`${API_URL}/pods`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ name: POD_NAME, organization_id: orgId }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`pod create failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  const pod = JSON.parse(text) as Record<string, unknown>;
  const podId = String(pod.id ?? pod.pod_id);
  if (!podId || podId === "undefined") throw new Error(`pod create returned no id: ${text.slice(0, 200)}`);

  await upsertEnv(ENV_PATH, "LEMMA_POD_ID", podId);
  console.log(`✓ created pod ${podId} and set LEMMA_POD_ID in .env.local`);
  console.log(`→ next: npm run lemma:setup   (provision tables)  then  npm run lemma:verify`);
}

main().catch((e) => {
  console.error("✗ create-pod failed:", e?.message ?? e);
  process.exit(1);
});

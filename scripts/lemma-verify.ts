/**
 * scripts/lemma-verify.ts — prove the app's auth path works end-to-end and find
 * which pod actually holds the AutoHeal tables.
 *
 * Run:  node --env-file=.env.local --import tsx scripts/lemma-verify.ts
 *
 *   1. Calls ensureAccessToken() — the SAME entry point lib/lemma.ts uses. This
 *      refreshes via the file/env store and PERSISTS the rotated token to
 *      LEMMA_REFRESH_TOKEN_FILE, establishing the durable store.
 *   2. Lists datastore tables for every candidate pod so we can pick the right
 *      LEMMA_POD_ID (the one with projects/reviews/findings/chat_messages).
 */

import { ensureAccessToken, currentAccessToken } from "../lib/lemma-auth";

const API_URL = (process.env.LEMMA_API_URL ?? "https://api.lemma.work").replace(/\/$/, "");
const WANT = ["projects", "reviews", "findings", "chat_messages"];

const CANDIDATES = [
  { id: process.env.LEMMA_POD_ID ?? "", label: "LEMMA_POD_ID (.env.local)" },
  { id: "019f0111-5f5f-77ad-9609-77c13e1613f1", label: "codeheal" },
  { id: "019f007a-e479-74d3-96ba-ba9353b62056", label: "Meal log from Telegram" },
].filter((c, i, a) => c.id && a.findIndex((x) => x.id === c.id) === i);

async function tablesFor(podId: string): Promise<string[] | { error: string }> {
  const res = await fetch(`${API_URL}/pods/${podId}/datastore/tables?limit=200`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${currentAccessToken()}` },
  });
  if (!res.ok) return { error: `HTTP ${res.status} ${(await res.text()).slice(0, 120)}` };
  const body = (await res.json()) as unknown;
  const items = (Array.isArray(body) ? body : (body as { items?: unknown[] }).items) ?? [];
  return (items as Array<Record<string, unknown>>).map((t) => String(t.name ?? t.id ?? "?"));
}

async function main() {
  console.log(`\n▶ verify — ${API_URL}`);
  await ensureAccessToken(); // refresh + persist rotated token to the file store
  console.log(`✓ ensureAccessToken() OK — durable store now owns the refresh chain\n`);

  let winner = "";
  for (const c of CANDIDATES) {
    const t = await tablesFor(c.id);
    if (Array.isArray(t)) {
      const hasAll = WANT.every((w) => t.includes(w));
      console.log(`• ${c.id}  «${c.label}»  tables=[${t.join(", ") || "—"}]  ${hasAll ? "◀ HAS ALL AUTOHEAL TABLES" : ""}`);
      if (hasAll && !winner) winner = c.id;
    } else {
      console.log(`• ${c.id}  «${c.label}»  ✗ ${t.error}`);
    }
  }

  console.log("");
  if (winner) {
    const current = process.env.LEMMA_POD_ID ?? "";
    console.log(`→ Correct pod: ${winner}`);
    if (winner !== current) {
      console.log(`⚠ .env.local LEMMA_POD_ID is ${current || "(unset)"} — UPDATE it to ${winner}.`);
    } else {
      console.log(`✓ LEMMA_POD_ID already matches. You're fully configured.`);
    }
  } else {
    console.log(`⚠ No candidate pod has all AutoHeal tables. Run \`npm run lemma:setup\` against the`);
    console.log(`  chosen pod to provision them, then set LEMMA_POD_ID to it.`);
  }
  console.log("");
}

main().catch((e) => {
  console.error("✗ verify failed:", e?.message ?? e);
  process.exit(1);
});

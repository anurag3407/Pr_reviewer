/**
 * scripts/lemma-setup.ts — idempotently create the two tables in the live pod.
 *
 *   npx tsx scripts/lemma-setup.ts        (or: npm run lemma:setup)
 *
 * Lists existing tables, then creates `pull_requests` / `identified_risks` from
 * their JSON payloads only if missing. Safe to re-run.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTable, lemmaConfig, listTableNames } from "../lib/lemma";

const HERE = dirname(fileURLToPath(import.meta.url));
const TABLES_DIR = join(HERE, "..", "lemma", "tables");
const TABLE_NAMES = ["pull_requests", "identified_risks"] as const;

async function main(): Promise<void> {
  const cfg = lemmaConfig();
  if (!cfg.configured) {
    console.error(
      "[lemma-setup] Not configured. Set LEMMA_TOKEN and LEMMA_POD_ID (and " +
        "optionally LEMMA_API_URL) in .env.local — the state layer is a live pod.",
    );
    process.exit(1);
  }

  console.log(`[lemma-setup] pod ${cfg.podId} @ ${cfg.apiUrl}`);

  let existing: Set<string>;
  try {
    existing = new Set(await listTableNames());
  } catch (error) {
    console.error(`[lemma-setup] Could not list tables: ${(error as Error).message}`);
    process.exit(1);
  }

  for (const name of TABLE_NAMES) {
    if (existing.has(name)) {
      console.log(`  ✓ ${name} already exists`);
      continue;
    }
    const payload = JSON.parse(readFileSync(join(TABLES_DIR, `${name}.json`), "utf8"));
    try {
      await createTable(payload);
      console.log(`  + created ${name}`);
    } catch (error) {
      console.error(`  ✗ failed to create ${name}: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  console.log("[lemma-setup] done.");
}

main().catch((error) => {
  console.error("[lemma-setup] unexpected error:", error);
  process.exit(1);
});

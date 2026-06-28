/**
 * scripts/reconcile-projects.ts — sync stored projects with live GitHub App grants.
 *
 *   node --env-file=.env.local --import tsx scripts/reconcile-projects.ts
 *
 * Walks every installation of the GitHub App, and for each one reconciles the
 * stored project rows of whichever owner(s) connected it: imports newly granted
 * repos, prunes repos the install no longer covers, and collapses duplicate rows.
 *
 * The same reconcile runs automatically on the App's Setup URL after an install /
 * reconfigure (see app/api/github/setup/route.ts) — this script just lets you fix
 * existing data on demand without re-running the GitHub flow.
 *
 * The owner (Clerk user id) for an installation is discovered from existing rows
 * tagged with that installation_id, so an installation nobody has connected yet
 * is skipped (nothing to reconcile until they finish the in-app connect).
 */

import { App } from "octokit";
import {
  lemma,
  reconcileInstallationProjects,
  TABLES,
  type ReconcileResult,
} from "@/lib/lemma";

async function ownersForInstallation(installationId: string): Promise<string[]> {
  const res = await lemma().records.list(TABLES.projects, { limit: 500 });
  const owners = new Set<string>();
  for (const row of (res.items ?? []) as Array<Record<string, any>>) {
    if (String(row.installation_id) === installationId && row.owner_id) {
      owners.add(String(row.owner_id));
    }
  }
  return [...owners];
}

async function main(): Promise<void> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!appId || !privateKey) {
    console.error("[reconcile] GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY missing — load .env.local");
    process.exit(1);
  }

  const app = new App({ appId: String(appId), privateKey });
  const totals: ReconcileResult = { added: 0, updated: 0, removed: 0, deduped: 0 };

  for await (const { installation } of app.eachInstallation.iterator()) {
    const instId = String(installation.id);
    const account = (installation.account as { login?: string })?.login ?? "?";

    const owners = await ownersForInstallation(instId);
    if (owners.length === 0) {
      console.log(`[reconcile] install ${instId} (${account}): no connected owner — skipped`);
      continue;
    }

    let granted: Array<{ fullName: string; id: string; defaultBranch: string }>;
    try {
      const octokit = await app.getInstallationOctokit(installation.id);
      const repos = await octokit.paginate("GET /installation/repositories", { per_page: 100 });
      granted = (repos as Array<Record<string, any>>).map((r) => ({
        fullName: r.full_name,
        id: String(r.id),
        defaultBranch: r.default_branch ?? "main",
      }));
    } catch (error) {
      console.error(`[reconcile] install ${instId} (${account}): repo list failed — ${(error as Error).message}`);
      continue;
    }

    for (const owner of owners) {
      const r = await reconcileInstallationProjects(owner, instId, granted);
      totals.added += r.added;
      totals.updated += r.updated;
      totals.removed += r.removed;
      totals.deduped += r.deduped;
      console.log(
        `[reconcile] install ${instId} (${account}) owner ${owner}: ` +
          `${granted.length} granted → +${r.added} added, ${r.updated} updated, ` +
          `-${r.removed} removed, ${r.deduped} de-duped`,
      );
    }
  }

  console.log(
    `[reconcile] done — +${totals.added} added, ${totals.updated} updated, ` +
      `-${totals.removed} removed, ${totals.deduped} de-duped`,
  );
}

main().catch((error) => {
  console.error(`[reconcile] failed: ${(error as Error).message}`);
  process.exit(1);
});

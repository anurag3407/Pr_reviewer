/**
 * GET /api/github/setup — the GitHub App "Setup URL".
 *
 * GitHub redirects here after a user installs/reconfigures the App, with
 * `?installation_id=…&setup_action=…&state=<clerkUserId>`. The visitor is in a
 * Clerk session (middleware-gated), so we attribute the install to the logged-in
 * user and import every granted repo as a project (idempotent). Repo selection /
 * branch watching is then managed on /dashboard/projects.
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { listInstallationRepos } from "@/lib/github";
import { reconcileInstallationProjects } from "@/lib/lemma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { userId } = await auth();
  const url = new URL(request.url);
  // Behind a reverse proxy the standalone server sees its internal bind host
  // (0.0.0.0:3000), so redirects built from `request.url` leak that to the
  // browser. Anchor them to the public APP_URL when configured.
  const base = process.env.APP_URL ?? request.url;
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", base));
  }

  const installationId = url.searchParams.get("installation_id");
  if (!installationId) {
    return NextResponse.redirect(new URL("/dashboard/projects?error=no_installation", base));
  }

  try {
    // Reconcile against what the App actually grants: import new repos, prune
    // repos the install no longer covers, and collapse any duplicate rows. This
    // keeps the dashboard's "connected" list truthful even after a user narrows
    // or widens the App's repository access on GitHub.
    const repos = await listInstallationRepos(installationId);
    const { added, removed, deduped } = await reconcileInstallationProjects(
      userId,
      installationId,
      repos,
    );

    const synced = removed + deduped;
    return NextResponse.redirect(
      new URL(`/dashboard/projects?connected=${added}&synced=${synced}`, base),
    );
  } catch (error) {
    const msg = encodeURIComponent((error as Error).message);
    return NextResponse.redirect(new URL(`/dashboard/projects?error=${msg}`, base));
  }
}

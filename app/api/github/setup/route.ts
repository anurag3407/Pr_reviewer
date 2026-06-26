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
import { createProject, listProjects } from "@/lib/lemma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { userId } = await auth();
  const url = new URL(request.url);
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const installationId = url.searchParams.get("installation_id");
  if (!installationId) {
    return NextResponse.redirect(new URL("/dashboard/projects?error=no_installation", request.url));
  }

  try {
    const repos = await listInstallationRepos(installationId);
    const existing = await listProjects(userId);
    const have = new Set(existing.map((p) => p.repo));

    let added = 0;
    for (const repo of repos) {
      if (have.has(repo.fullName)) continue;
      await createProject({
        owner_id: userId,
        repo: repo.fullName,
        repo_id: repo.id,
        installation_id: installationId,
        default_branch: repo.defaultBranch,
        watched_branches: [], // empty = watch all base branches by default
        auto_review: true,
      });
      added += 1;
    }

    return NextResponse.redirect(
      new URL(`/dashboard/projects?connected=${added}`, request.url),
    );
  } catch (error) {
    const msg = encodeURIComponent((error as Error).message);
    return NextResponse.redirect(new URL(`/dashboard/projects?error=${msg}`, request.url));
  }
}

/**
 * /api/projects — list and add connected repos for the signed-in user.
 *   GET  → this user's projects
 *   POST → add a repo as a project (must belong to an installation the user has)
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { githubConfigured, listInstallationRepos } from "@/lib/github";
import { createProject, listProjects } from "@/lib/lemma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const projects = await listProjects(userId);
  return NextResponse.json({ projects });
}

const AddBody = z.object({
  repo: z.string().min(1), // owner/name
  installation_id: z.string().min(1),
  repo_id: z.string().optional(),
  default_branch: z.string().optional(),
  watched_branches: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = AddBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const { repo, installation_id, repo_id, default_branch, watched_branches } = parsed.data;

  // Guard: the repo must actually be in that installation (prevents adding a repo
  // under an installation the user doesn't control). Skipped in demo mode.
  if (githubConfigured()) {
    try {
      const repos = await listInstallationRepos(installation_id);
      if (!repos.some((r) => r.fullName === repo)) {
        return NextResponse.json({ error: "repo not in installation" }, { status: 403 });
      }
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 502 });
    }
  }

  // De-dupe by repo for this user.
  const existing = await listProjects(userId);
  const dupe = existing.find((p) => p.repo === repo);
  if (dupe) return NextResponse.json({ project: dupe, deduped: true });

  const project = await createProject({
    owner_id: userId,
    repo,
    repo_id,
    installation_id,
    default_branch,
    watched_branches: watched_branches ?? [],
    auto_review: true,
  });
  return NextResponse.json({ project }, { status: 201 });
}

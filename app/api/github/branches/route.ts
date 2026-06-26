/**
 * GET /api/github/branches?repo=owner/name&installation_id=… — branch names for
 * a repo, used by the projects UI to pick which base branches to watch. The user
 * must already own a project on that installation (prevents branch enumeration
 * of repos they haven't connected).
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getRepoBranches, githubConfigured } from "@/lib/github";
import { listProjects } from "@/lib/lemma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const repo = url.searchParams.get("repo");
  const installationId = url.searchParams.get("installation_id");
  if (!repo || !installationId) {
    return NextResponse.json({ error: "repo and installation_id required" }, { status: 400 });
  }

  const projects = await listProjects(userId);
  const owns = projects.some((p) => p.installation_id === installationId && p.repo === repo);
  if (!owns) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!githubConfigured()) return NextResponse.json({ branches: [] });

  try {
    const branches = await getRepoBranches(installationId, repo);
    return NextResponse.json({ branches });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}

/**
 * POST /api/review — on-demand review of a REAL GitHub PR (no webhook needed).
 *
 * Body (either shape):
 *   { "url": "https://github.com/owner/name/pull/42" }
 *   { "repo": "owner/name", "number": 42 }
 *
 * Fetches the live PR via lib/github.ts (real GitHub REST when GITHUB_TOKEN is
 * set, else the mock fixture), records a pull_requests row with the real
 * metadata, then launches the processing loop fire-and-forget. The dashboard
 * observes progress by polling the pod.
 *
 * This is the pull-model counterpart to the push-model webhook — ideal for a
 * demo because it needs no public tunnel.
 */

import { NextResponse } from "next/server";
import { fetchPRContext, parsePrUrl } from "@/lib/github";
import { createPR } from "@/lib/lemma";
import { runReview } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { url?: string; repo?: string; number?: number | string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // Resolve repo + number from either a PR URL or explicit fields.
  let repo: string | undefined = body.repo;
  let number: number | undefined = body.number != null ? Number(body.number) : undefined;
  if (body.url) {
    const parsed = parsePrUrl(body.url);
    if (!parsed) {
      return NextResponse.json({ error: "could not parse a PR URL" }, { status: 400 });
    }
    repo = parsed.repo;
    number = parsed.number;
  }
  if (!repo || !number || Number.isNaN(number)) {
    return NextResponse.json(
      { error: "provide { url } or { repo, number }" },
      { status: 400 },
    );
  }

  // Fetch the live PR (diff + files + commits).
  let ctx;
  try {
    ctx = await fetchPRContext(repo, number);
  } catch (error) {
    return NextResponse.json(
      { error: `could not fetch PR: ${(error as Error).message}` },
      { status: 502 },
    );
  }

  // Record the real PR.
  let prId: string;
  try {
    const pr = await createPR({
      pr_number: String(ctx.number),
      repo: ctx.repo,
      branch: ctx.branch,
      author: ctx.author,
      title: ctx.title,
    });
    prId = pr.id;
  } catch (error) {
    return NextResponse.json(
      { error: `could not record PR: ${(error as Error).message}` },
      { status: 502 },
    );
  }

  // Fire-and-forget review of the real diff (Phase 2: a Lemma workflow run).
  void runReview(prId, ctx);

  return NextResponse.json(
    {
      ok: true,
      pr_id: prId,
      source: ctx.source,
      context: {
        repo: ctx.repo,
        number: ctx.number,
        title: ctx.title,
        files_changed: ctx.files.length,
        commits: ctx.commits.length,
        diff_bytes: ctx.diff.length,
      },
    },
    { status: 202 },
  );
}

/**
 * POST /api/webhooks/github — inbound GitHub App events.
 *
 * Verifies the HMAC signature, then on a `pull_request` event for a watched
 * repo+branch: maps repo+installation → project (→ owner_id), upserts a review
 * row, and launches the review loop fire-and-forget. Loop progress is observable
 * purely through the Lemma tables (the dashboard polls them).
 *
 * (Fire-and-forget needs a long-running host; fine for `next dev` / a Node host.)
 */

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  createReview,
  findProjectByRepo,
  findReviewByPr,
  updateReview,
} from "@/lib/lemma";
import { runReviewLoop } from "@/lib/reviewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PR_ACTIONS = new Set(["opened", "synchronize", "reopened", "ready_for_review"]);

function verifySignature(secret: string, rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const digest = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (secret) {
    const sig = request.headers.get("x-hub-signature-256");
    if (!verifySignature(secret, rawBody, sig)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let body: Record<string, any>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // Accept the real `x-github-event` header; fall back to inferring from payload
  // (the simulate script can omit the header).
  const event = request.headers.get("x-github-event") ?? (body.pull_request ? "pull_request" : "");
  if (event !== "pull_request") {
    return NextResponse.json({ ignored: event || "unknown" }, { status: 202 });
  }

  const action: string | undefined = body.action;
  if (action && !PR_ACTIONS.has(action)) {
    return NextResponse.json({ ignored: action }, { status: 202 });
  }

  const pr = body.pull_request ?? {};
  const repo: string | undefined = body.repository?.full_name ?? body.repo;
  const installationId: string | undefined = body.installation?.id
    ? String(body.installation.id)
    : body.installation_id
      ? String(body.installation_id)
      : undefined;
  const prNumber = String(pr.number ?? body.pr_number ?? "");

  if (!repo || !prNumber) {
    return NextResponse.json({ error: "missing repo or pr number" }, { status: 400 });
  }

  // Map to a watching project (this resolves the owner).
  const project = await findProjectByRepo(repo, installationId);
  if (!project) return NextResponse.json({ ignored: "no project watching this repo" }, { status: 202 });
  if (project.status === "PAUSED" || !project.auto_review) {
    return NextResponse.json({ ignored: "project paused / auto-review off" }, { status: 202 });
  }

  const baseBranch = pr.base?.ref ?? body.base_branch ?? "";
  if (project.watched_branches.length > 0 && baseBranch && !project.watched_branches.includes(baseBranch)) {
    return NextResponse.json({ ignored: `base ${baseBranch} not watched` }, { status: 202 });
  }

  const fields = {
    title: pr.title ?? body.title ?? "Untitled PR",
    author: pr.user?.login ?? body.author ?? "",
    head_branch: pr.head?.ref ?? body.head_branch ?? "",
    base_branch: baseBranch,
    head_sha: pr.head?.sha ?? body.head_sha ?? null,
    html_url: pr.html_url ?? body.html_url ?? null,
  };

  let reviewId: string;
  try {
    const existing = await findReviewByPr(project.id, prNumber);
    if (existing) {
      await updateReview(existing.id, { ...fields, flag: "REVIEWING" });
      reviewId = existing.id;
    } else {
      const review = await createReview({
        owner_id: project.owner_id,
        project_id: project.id,
        repo,
        pr_number: prNumber,
        ...fields,
      });
      reviewId = review.id;
    }
  } catch (error) {
    return NextResponse.json(
      { error: `could not record review: ${(error as Error).message}` },
      { status: 502 },
    );
  }

  void runReviewLoop(reviewId);
  return NextResponse.json({ ok: true, review_id: reviewId }, { status: 202 });
}

/**
 * POST /api/webhooks/github — inbound PR event.
 *
 * Verifies the GitHub HMAC signature (when GITHUB_WEBHOOK_SECRET is set),
 * upserts a `pull_requests` row, then launches the auto-healing loop
 * fire-and-forget so the HTTP response returns immediately. Loop progress is
 * observable purely through the Lemma table (the dashboard polls it).
 *
 * Accepts both a real GitHub `pull_request` event payload and the simplified
 * shape that scripts/simulate-pr.ts sends.
 */

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createPR } from "@/lib/lemma";
import { runHealingLoop } from "@/lib/orchestrator";
import type { NewPR } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifySignature(secret: string, rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const digest = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parsePayload(body: Record<string, any>): NewPR {
  const pr = body.pull_request ?? body;
  const repo = body.repository?.full_name ?? body.repo ?? "demo/repo";
  return {
    pr_number: String(pr.number ?? body.pr_number ?? Date.now()),
    repo,
    branch: pr.head?.ref ?? body.branch ?? "feature/demo",
    author: pr.user?.login ?? body.author ?? "octocat",
    title: pr.title ?? body.title ?? "Untitled PR",
    preview_url: body.preview_url ?? pr.preview_url ?? null,
  };
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

  // Only act on opened/synchronized/reopened PRs (real GitHub sends an `action`).
  const action: string | undefined = body.action;
  if (action && !["opened", "synchronize", "reopened", "ready_for_review"].includes(action)) {
    return NextResponse.json({ ignored: action }, { status: 202 });
  }

  let prId: string;
  try {
    const pr = await createPR(parsePayload(body));
    prId = pr.id;
  } catch (error) {
    return NextResponse.json(
      { error: `could not record PR: ${(error as Error).message}` },
      { status: 502 },
    );
  }

  // Fire-and-forget: the loop drives state in the pod; the response returns now.
  // (Caveat: serverless platforms may cut off background work — fine for
  // `next dev` / a long-running Node host during the demo.)
  void runHealingLoop(prId);

  return NextResponse.json({ ok: true, pr_id: prId }, { status: 202 });
}

/**
 * POST /api/reviews/[id]/fix — "Fix with PR" (owner-checked).
 *
 * Launches the closed fix loop fire-and-forget: generate whole-file edits for the
 * open findings → commit them to the PR's head branch → re-scan → repeat until
 * the flag is SAFE or the iteration budget is spent. Progress is observed by the
 * dashboard poll (flag walks REVIEWING → … → SAFE).
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { githubConfigured } from "@/lib/github";
import { llmConfigured } from "@/lib/llm";
import { getReviewForOwner, updateReview } from "@/lib/lemma";
import { runFixLoop } from "@/lib/reviewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const review = await getReviewForOwner(id, userId);
  if (!review) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!githubConfigured() || !llmConfigured()) {
    return NextResponse.json({ error: "GitHub App and a model provider are required" }, { status: 400 });
  }
  if (review.flag === "SAFE") {
    return NextResponse.json({ ok: true, note: "already safe" });
  }

  // Flip to REVIEWING immediately so the UI reflects work-in-flight.
  await updateReview(id, { flag: "REVIEWING", last_error: null });
  void runFixLoop(id);
  return NextResponse.json({ ok: true }, { status: 202 });
}

/**
 * /api/reviews/[id]
 *   GET  → one review + its findings (owner-checked)
 *   POST → { action: "rescan" } re-runs the review loop on the current head
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getReviewWithFindings } from "@/lib/lemma";
import { runReviewLoop } from "@/lib/reviewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const review = await getReviewWithFindings(id, userId);
  if (!review) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ review });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  // Owner check before kicking off any work.
  const review = await getReviewWithFindings(id, userId);
  if (!review) return NextResponse.json({ error: "not found" }, { status: 404 });

  let action = "rescan";
  try {
    const body = await request.json();
    if (body?.action) action = String(body.action);
  } catch {
    /* default to rescan */
  }

  if (action === "rescan") {
    void runReviewLoop(id);
    return NextResponse.json({ ok: true, action }, { status: 202 });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

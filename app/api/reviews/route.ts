/**
 * GET /api/reviews — the dashboard feed: this user's reviews joined with their
 * findings, plus a small config block for status indicators. Always 200 so the
 * client poll never trips an error state.
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { githubConfigured } from "@/lib/github";
import { llmConfigured, activeModel } from "@/lib/llm";
import { lemmaConfig, listReviewsWithFindings } from "@/lib/lemma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const config = {
    lemma: lemmaConfig().configured,
    github: githubConfigured(),
    model: llmConfigured() ? activeModel() : null,
  };

  try {
    const reviews = await listReviewsWithFindings(userId);
    return NextResponse.json({ config, reachable: true, reviews });
  } catch (error) {
    return NextResponse.json({
      config,
      reachable: false,
      error: (error as Error).message,
      reviews: [],
    });
  }
}

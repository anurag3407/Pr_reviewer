/**
 * POST /api/prs/[id]/rerun — reset the retry counter and heal again.
 *
 * Used to retry a rejected/escalated PR (e.g. after the underlying issue
 * changed). Clears retry_count, resets status, and relaunches the loop.
 */

import { NextResponse } from "next/server";
import { updatePR } from "@/lib/lemma";
import { runHealingLoop } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await updatePR(id, { status: "PENDING", retry_count: 0, last_error: null });
    void runHealingLoop(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}

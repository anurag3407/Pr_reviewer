/**
 * POST /api/prs/[id]/approve — human override of a stalled PR.
 *
 * Sets status to APPROVED_OVERRIDE: the operator is releasing a PR that the
 * auto-healing loop couldn't get green within the retry budget.
 */

import { NextResponse } from "next/server";
import { getPR, updatePR } from "@/lib/lemma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await updatePR(id, { status: "APPROVED_OVERRIDE", last_error: null });
    const pr = await getPR(id);
    return NextResponse.json({ ok: true, pr });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}

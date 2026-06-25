/**
 * POST /api/prs/[id]/reject — operator declines to release a stalled PR.
 * Sets status to REJECTED (it can still be re-run later).
 */

import { NextResponse } from "next/server";
import { updatePR } from "@/lib/lemma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await updatePR(id, { status: "REJECTED" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}

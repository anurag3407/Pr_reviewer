/**
 * PATCH /api/findings/[id] — change a finding's status (owner-checked).
 * Dismissed findings are excluded from the "Fix with PR" loop.
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getFinding, updateFinding } from "@/lib/lemma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ status: z.enum(["OPEN", "FIXED", "DISMISSED"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const finding = await getFinding(id);
  if (!finding || finding.owner_id !== userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  await updateFinding(id, { status: parsed.data.status });
  return NextResponse.json({ ok: true });
}

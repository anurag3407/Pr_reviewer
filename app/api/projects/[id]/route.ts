/**
 * /api/projects/[id] — update or remove one connected repo (owner-checked).
 *   PATCH  → { watched_branches?, status?, auto_review? }
 *   DELETE → disconnect the repo
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { deleteProject, getProject, updateProject } from "@/lib/lemma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  watched_branches: z.array(z.string()).optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  auto_review: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const project = await getProject(id, userId);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  await updateProject(id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const project = await getProject(id, userId);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  await deleteProject(id);
  return NextResponse.json({ ok: true });
}

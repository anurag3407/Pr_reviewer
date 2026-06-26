/**
 * /api/reviews/[id]/chat — converse about a review (owner-checked).
 *   GET  ?finding_id=… → message history (PR-level if omitted)
 *   POST { content, finding_id? } → persist the user turn, answer with full code
 *        context, persist the assistant turn. If the discussion is about a
 *        specific finding and the reply ends in a fenced code block, that block
 *        is captured as the finding's updated suggested_fix (feeds Fix-with-PR).
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getFileContent, githubConfigured } from "@/lib/github";
import { chatAboutReview, type LLMMessage } from "@/lib/llm";
import { describeFinding } from "@/lib/prompts";
import {
  addChatMessage,
  getProject,
  getReviewForOwner,
  listChat,
  listFindings,
  updateFinding,
} from "@/lib/lemma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const review = await getReviewForOwner(id, userId);
  if (!review) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = new URL(request.url);
  const findingId = url.searchParams.get("finding_id");
  const messages = await listChat(id, findingId ?? null);
  return NextResponse.json({ messages });
}

const Body = z.object({
  content: z.string().min(1).max(8000),
  finding_id: z.string().nullish(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const review = await getReviewForOwner(id, userId);
  if (!review) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const { content } = parsed.data;
  const findingId = parsed.data.finding_id ?? null;

  // Persist the user's turn first.
  await addChatMessage({ owner_id: userId, review_id: id, finding_id: findingId, role: "user", content });

  // Build context: PR + (focused finding or all findings) + relevant file.
  const findings = await listFindings(id);
  const focus = findingId ? findings.find((f) => f.id === findingId) ?? null : null;

  const ctx: string[] = [
    `PR #${review.pr_number} on ${review.repo}: ${review.title}`,
    review.summary ? `Review summary: ${review.summary}` : "",
  ];
  if (focus) {
    ctx.push(`Finding under discussion:\n${describeFinding(focus)}`);
    if (focus.file_path && githubConfigured()) {
      const project = await getProject(review.project_id, userId);
      if (project && review.head_sha) {
        const fileContent = await getFileContent(
          project.installation_id,
          project.repo,
          focus.file_path,
          review.head_sha,
        );
        if (fileContent) ctx.push(`Current content of ${focus.file_path}:\n${fileContent.slice(0, 24000)}`);
      }
    }
  } else if (findings.length) {
    ctx.push(
      "All findings in this review:\n" + findings.map((f, i) => `${i + 1}. ${describeFinding(f)}`).join("\n\n"),
    );
  }

  // Conversation turns (history + the new message we just stored).
  const history = await listChat(id, findingId);
  const turns: LLMMessage[] = history.map((m) => ({ role: m.role, content: m.content }));

  let reply: string;
  try {
    reply = await chatAboutReview(turns, ctx.filter(Boolean).join("\n\n"));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }

  const assistant = await addChatMessage({
    owner_id: userId,
    review_id: id,
    finding_id: findingId,
    role: "assistant",
    content: reply,
  });

  // If we were discussing a finding and the reply proposes code, capture it as
  // the (updated) suggested fix so "Fix with PR" applies the converged version.
  if (focus) {
    const code = lastCodeBlock(reply);
    if (code) await updateFinding(focus.id, { suggested_fix: code });
  }

  return NextResponse.json({ reply, message: assistant });
}

/** Extract the last fenced code block from a markdown reply, if any. */
function lastCodeBlock(text: string): string | null {
  const re = /```[a-zA-Z0-9]*\n([\s\S]*?)```/g;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) last = m[1].trim();
  return last && last.length > 0 ? last : null;
}

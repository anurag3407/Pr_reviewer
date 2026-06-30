/**
 * /api/reviews/[id]/chat — converse about a review (owner-checked).
 *   GET  ?finding_id=… → message history (PR-level if omitted)
 *   POST { content, finding_id? } → persist the user turn, answer with WHOLE-repo
 *        awareness, persist the assistant turn. The model is given read-only repo
 *        tools (read_file / list_files) and pulls any file it needs on demand via
 *        the installation's Octokit — so it reasons about the real codebase, not
 *        just one file. If the discussion is about a specific finding and the
 *        reply ends in a fenced code block, that block is captured as the
 *        finding's updated suggested_fix (feeds Fix-with-PR).
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getFileContent, getPullRequest, getRepoTree, githubConfigured } from "@/lib/github";
import { chatWithTools, type ChatTool, type LLMMessage } from "@/lib/llm";
import { describeFinding } from "@/lib/prompts";
import {
  addChatMessage,
  getProject,
  getReviewForOwner,
  listChat,
  listFindings,
  updateFinding,
} from "@/lib/lemma";
import type { Review } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The tool loop makes a few sequential model + GitHub calls; give it headroom so
// the platform doesn't kill the invocation mid-conversation.
export const maxDuration = 60;

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

  // Build context: PR + (focused finding or all findings).
  const findings = await listFindings(id);
  const focus = findingId ? findings.find((f) => f.id === findingId) ?? null : null;

  const ctx: string[] = [
    `PR #${review.pr_number} on ${review.repo}: ${review.title}`,
    review.summary ? `Review summary: ${review.summary}` : "",
  ];
  if (focus) {
    ctx.push(`Finding under discussion:\n${describeFinding(focus)}`);
  } else if (findings.length) {
    ctx.push(
      "All findings in this review:\n" + findings.map((f, i) => `${i + 1}. ${describeFinding(f)}`).join("\n\n"),
    );
  }

  // Wire read-only repo tools so the model can pull any file it needs on demand
  // (whole-codebase awareness) instead of being limited to one pre-fetched file.
  const tools = await buildRepoTools(review, userId, focus?.file_path ?? null, ctx);

  // Conversation turns (history + the new message we just stored).
  const history = await listChat(id, findingId);
  const turns: LLMMessage[] = history.map((m) => ({ role: m.role, content: m.content }));

  let reply: string;
  try {
    reply = await chatWithTools(turns, ctx.filter(Boolean).join("\n\n"), tools);
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

/**
 * Build the read-only repo tools the chat model can call (read_file / list_files),
 * scoped to the PR's head commit via the installation's Octokit. Returns [] when
 * GitHub isn't configured or we can't resolve a commit to read — the chat then
 * runs without tools (graceful degradation). Also pre-seeds the focused file into
 * `ctx` so the common case needs zero tool round-trips. The closures never throw:
 * misses return an `ERROR:`/empty string the model can recover from.
 */
async function buildRepoTools(
  review: Review,
  ownerId: string,
  focusPath: string | null,
  ctx: string[],
): Promise<ChatTool[]> {
  if (!githubConfigured()) return [];
  const project = await getProject(review.project_id, ownerId);
  if (!project) return [];

  // Resolve the commit to read at (the PR head); fall back to a live lookup if
  // the review row never captured it.
  let headSha = review.head_sha;
  if (!headSha) {
    try {
      headSha = (await getPullRequest(project.installation_id, project.repo, Number(review.pr_number))).headSha;
    } catch {
      headSha = null;
    }
  }
  if (!headSha) return [];

  const sha = headSha; // stable, non-null capture for the closures
  const installationId = project.installation_id;
  const repo = project.repo;

  // Pre-seed the focused file — the model almost always needs it.
  if (focusPath) {
    const seed = await getFileContent(installationId, repo, focusPath, sha);
    if (seed) ctx.push(`Current content of ${focusPath}:\n${seed.slice(0, 20000)}`);
  }

  let tree: string[] | null = null; // lazily fetched + cached repo file list

  return [
    {
      name: "read_file",
      description: "Read the current full contents of a file in this repository at the PR head commit",
      args: '{ "path": "<repo-relative file path>" }',
      run: async (a) => {
        const path = String(a.path ?? "").trim();
        if (!path) return "ERROR: missing 'path' argument.";
        if (path.startsWith("/") || path.split("/").includes("..")) {
          return "ERROR: path must be repo-relative (no leading '/' and no '..').";
        }
        const content = await getFileContent(installationId, repo, path, sha);
        if (content == null) {
          return `ERROR: no readable file at "${path}" at this commit (missing, binary, or too large). Call list_files to find the correct path.`;
        }
        return content;
      },
    },
    {
      name: "list_files",
      description: "List repository file paths at the PR head commit, optionally filtered by a directory prefix",
      args: '{ "dir": "<optional directory prefix, e.g. lib/ or app/api>" }',
      run: async (a) => {
        if (!tree) {
          const entries = await getRepoTree(installationId, repo, sha);
          tree = entries.filter((t) => t.type === "blob").map((t) => t.path).sort();
        }
        const dir = String(a.dir ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
        const paths = dir ? tree.filter((p) => p.startsWith(dir)) : tree;
        if (paths.length === 0) return dir ? `No files found under "${dir}".` : "Repository file list is empty.";
        const CAP = 400;
        const head = paths.slice(0, CAP).join("\n");
        return paths.length > CAP ? `${head}\n… (+${paths.length - CAP} more — narrow with a 'dir' prefix)` : head;
      },
    },
  ];
}

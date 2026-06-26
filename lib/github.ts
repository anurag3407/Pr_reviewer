/**
 * lib/github.ts — the GitHub I/O seam (v2, Phase 1).
 *
 * One interface, two backends — chosen by GITHUB_MODE (or auto: real when a
 * GITHUB_TOKEN is present, else mock):
 *   real  — GitHub REST API via global fetch + a fine-grained PAT (GITHUB_TOKEN).
 *   mock  — reads fixtures/sample-pr.json so a full review runs with zero setup.
 *
 * ── Why this is a "seam" ──────────────────────────────────────────────────────
 * Phase 2 swaps ONLY the bodies of fetchPRContext / postPRComment to use the
 * Lemma GitHub connector (`client.connectors.operations.execute`). Callers (the
 * webhook, the /api/review route, the orchestrator) import the signatures, never
 * the implementation — so the migration touches this file alone.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChangedFile, PRCommit, PullRequestContext } from "./types";

const GITHUB_API = "https://api.github.com";
const HERE = dirname(fileURLToPath(import.meta.url));

/** real when explicitly set, or when a token exists; otherwise mock. */
function mode(): "real" | "mock" {
  const explicit = (process.env.GITHUB_MODE ?? "").toLowerCase();
  if (explicit === "real" || explicit === "mock") return explicit;
  return process.env.GITHUB_TOKEN ? "real" : "mock";
}

function ghHeaders(accept: string): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required for GITHUB_MODE=real");
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "lemma-pr-reviewer",
  };
}

/** Accepts "owner/name", a full PR URL, or an API URL → { owner, repo }. */
export function parseRepo(repo: string): { owner: string; name: string } {
  const url = repo.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (url) return { owner: url[1], name: url[2] };
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error(`Bad repo "${repo}" — expected owner/name`);
  return { owner, name: name.replace(/\.git$/, "") };
}

/** Pull a PR number out of a github.com PR URL (for the on-demand path). */
export function parsePrUrl(input: string): { repo: string; number: number } | null {
  const m = input.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) return null;
  return { repo: `${m[1]}/${m[2]}`, number: Number(m[3]) };
}

async function ghJson<T>(path: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: ghHeaders("application/vnd.github+json"),
  });
  if (!res.ok) {
    throw new Error(`GitHub ${path} → ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// ── public API (the seam) ────────────────────────────────────────────────────

/**
 * Fetch the full review context for one PR: metadata + unified diff + per-file
 * patches + commit messages. The single input every reviewer agent consumes.
 */
export async function fetchPRContext(repo: string, prNumber: number): Promise<PullRequestContext> {
  if (mode() === "mock") return mockContext(repo, prNumber);

  const { owner, name } = parseRepo(repo);
  const base = `/repos/${owner}/${name}/pulls/${prNumber}`;

  // Metadata is the must-have. A 404 here is the real "can't access" signal —
  // fail with a clear, actionable message (private repo → 404 for a PAT that
  // wasn't granted that repo).
  let meta: GhPull;
  try {
    meta = await ghJson<GhPull>(base);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("404")) {
      throw new Error(
        `PR ${owner}/${name}#${prNumber} not found (404). Either it doesn't exist, ` +
          `or your GITHUB_TOKEN can't access this repo — a fine-grained PAT only sees ` +
          `repos you explicitly grant it (private repos return 404, not 403).`,
      );
    }
    throw e;
  }

  // diff / files / commits are best-effort: a hiccup on any of these degrades the
  // review (less context) but never drops it. Commits only feed release notes.
  const [diff, files, commits] = await Promise.all([
    fetch(`${GITHUB_API}${base}`, { headers: ghHeaders("application/vnd.github.v3.diff") })
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => ""),
    ghJson<GhFile[]>(`${base}/files?per_page=100`).catch(() => [] as GhFile[]),
    ghJson<GhCommit[]>(`${base}/commits?per_page=100`).catch(() => [] as GhCommit[]),
  ]);

  return {
    repo: `${owner}/${name}`,
    number: prNumber,
    title: meta.title ?? "",
    author: meta.user?.login ?? "unknown",
    branch: meta.head?.ref ?? "",
    baseBranch: meta.base?.ref ?? "main",
    body: meta.body ?? "",
    diff,
    files: files.map(toChangedFile),
    commits: commits.map(toCommit),
    source: "github",
  };
}

/** Post the finished review back to the PR as an issue comment. */
export async function postPRComment(repo: string, prNumber: number, body: string): Promise<void> {
  if (mode() === "mock") {
    console.log(`[github:mock] would comment on ${repo}#${prNumber} (${body.length} chars)`);
    return;
  }
  const { owner, name } = parseRepo(repo);
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${name}/issues/${prNumber}/comments`, {
    method: "POST",
    headers: { ...ghHeaders("application/vnd.github+json"), "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    throw new Error(`GitHub comment → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

// ── mappers ──────────────────────────────────────────────────────────────────
interface GhPull {
  title?: string;
  body?: string;
  user?: { login?: string };
  head?: { ref?: string };
  base?: { ref?: string };
}
interface GhFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}
interface GhCommit {
  sha: string;
  commit?: { message?: string; author?: { name?: string } };
}

function toChangedFile(f: GhFile): ChangedFile {
  return {
    filename: f.filename,
    status: f.status,
    additions: f.additions ?? 0,
    deletions: f.deletions ?? 0,
    patch: f.patch,
  };
}
function toCommit(c: GhCommit): PRCommit {
  return {
    sha: (c.sha ?? "").slice(0, 12),
    message: c.commit?.message ?? "",
    author: c.commit?.author?.name ?? "unknown",
  };
}

// ── mock backend ─────────────────────────────────────────────────────────────
function mockContext(repo: string, prNumber: number): PullRequestContext {
  const fixture = JSON.parse(
    readFileSync(join(HERE, "..", "fixtures", "sample-pr.json"), "utf8"),
  ) as Partial<PullRequestContext>;
  return {
    repo: fixture.repo ?? repo,
    number: fixture.number ?? prNumber,
    title: fixture.title ?? "Sample PR",
    author: fixture.author ?? "octocat",
    branch: fixture.branch ?? "feature/demo",
    baseBranch: fixture.baseBranch ?? "main",
    body: fixture.body ?? "",
    diff: fixture.diff ?? "",
    files: fixture.files ?? [],
    commits: fixture.commits ?? [],
    source: "mock",
  };
}

/**
 * lib/github.ts — GitHub App access layer.
 *
 * Auth model: a single GitHub App (App ID + private key) installs on each user's
 * selected repos. Per request we mint a short-lived *installation* token via
 * Octokit's `App.getInstallationOctokit`, so all repo I/O is scoped to exactly
 * what the user granted — and writes (commits, reviews) appear as the App bot.
 *
 * Everything returns plain shapes (not raw Octokit types) so the rest of the app
 * doesn't couple to the SDK. Throws `GitHubNotConfiguredError` when the App env
 * is absent, so callers can degrade gracefully (e.g. the simulate/demo path).
 */

import { App, Octokit } from "octokit";

export class GitHubNotConfiguredError extends Error {
  constructor() {
    super(
      "GitHub App not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY " +
        "(and GITHUB_WEBHOOK_SECRET) in .env.local — see README for registration.",
    );
    this.name = "GitHubNotConfiguredError";
  }
}

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
}

/**
 * The GitHub App installation URL. `state` round-trips back to our Setup URL so
 * we can attribute the install to the user who started it. Null if the app slug
 * isn't configured.
 */
export function appInstallUrl(state: string): string | null {
  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) return null;
  const qs = new URLSearchParams({ state }).toString();
  return `https://github.com/apps/${slug}/installations/new?${qs}`;
}

let _app: App | null = null;
function getApp(): App {
  if (_app) return _app;
  if (!githubConfigured()) throw new GitHubNotConfiguredError();
  // PEM may arrive with literal "\n" escapes (single-line .env) — normalize.
  // Also strip surrounding quotes: Docker's --env-file/compose env_file keeps
  // the quotes from `KEY="..."` as part of the value, corrupting the PEM header
  // and triggering OpenSSL's `1E08010C:DECODER routines::unsupported`.
  const privateKey = String(process.env.GITHUB_APP_PRIVATE_KEY)
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n");
  _app = new App({
    appId: String(process.env.GITHUB_APP_ID),
    privateKey,
    ...(process.env.GITHUB_WEBHOOK_SECRET
      ? { webhooks: { secret: String(process.env.GITHUB_WEBHOOK_SECRET) } }
      : {}),
  });
  return _app;
}

/** An Octokit scoped to one installation (short-lived installation token). */
export async function installationOctokit(installationId: string | number): Promise<Octokit> {
  return getApp().getInstallationOctokit(Number(installationId));
}

// ── shapes ──────────────────────────────────────────────────────────────────
export interface InstallRepo {
  id: string;
  fullName: string; // owner/name
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
}

export interface PRInfo {
  number: number;
  title: string;
  body: string;
  author: string;
  headBranch: string;
  baseBranch: string;
  headSha: string;
  htmlUrl: string;
  state: string;
}

export interface ChangedFile {
  filename: string;
  status: string; // added | modified | removed | renamed
  additions: number;
  deletions: number;
  patch?: string;
  previousFilename?: string;
}

export interface TreeEntry {
  path: string;
  type: string; // blob | tree
  size?: number;
}

function splitRepo(fullName: string): { owner: string; repo: string } {
  const [owner, ...rest] = fullName.split("/");
  return { owner, repo: rest.join("/") };
}

// ── installation / repo discovery ───────────────────────────────────────────
export async function listInstallationRepos(installationId: string | number): Promise<InstallRepo[]> {
  const octokit = await installationOctokit(installationId);
  const repos = await octokit.paginate("GET /installation/repositories", { per_page: 100 });
  return (repos as Array<Record<string, any>>).map((r) => ({
    id: String(r.id),
    fullName: r.full_name,
    owner: r.owner?.login ?? r.full_name?.split("/")[0],
    name: r.name,
    defaultBranch: r.default_branch ?? "main",
    private: Boolean(r.private),
  }));
}

export async function getRepoBranches(
  installationId: string | number,
  fullName: string,
): Promise<string[]> {
  const octokit = await installationOctokit(installationId);
  const { owner, repo } = splitRepo(fullName);
  const branches = await octokit.paginate("GET /repos/{owner}/{repo}/branches", {
    owner,
    repo,
    per_page: 100,
  });
  return (branches as Array<{ name: string }>).map((b) => b.name);
}

// ── pull request reads ──────────────────────────────────────────────────────
export async function getPullRequest(
  installationId: string | number,
  fullName: string,
  number: number,
): Promise<PRInfo> {
  const octokit = await installationOctokit(installationId);
  const { owner, repo } = splitRepo(fullName);
  const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: number });
  return {
    number: data.number,
    title: data.title ?? "",
    body: data.body ?? "",
    author: data.user?.login ?? "",
    headBranch: data.head?.ref ?? "",
    baseBranch: data.base?.ref ?? "",
    headSha: data.head?.sha ?? "",
    htmlUrl: data.html_url ?? "",
    state: data.state ?? "open",
  };
}

export async function getPullRequestFiles(
  installationId: string | number,
  fullName: string,
  number: number,
): Promise<ChangedFile[]> {
  const octokit = await installationOctokit(installationId);
  const { owner, repo } = splitRepo(fullName);
  const files = await octokit.paginate("GET /repos/{owner}/{repo}/pulls/{pull_number}/files", {
    owner,
    repo,
    pull_number: number,
    per_page: 100,
  });
  return (files as Array<Record<string, any>>).map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions ?? 0,
    deletions: f.deletions ?? 0,
    patch: f.patch,
    previousFilename: f.previous_filename,
  }));
}

/** The raw unified diff for the whole PR. */
export async function getDiff(
  installationId: string | number,
  fullName: string,
  number: number,
): Promise<string> {
  const octokit = await installationOctokit(installationId);
  const { owner, repo } = splitRepo(fullName);
  const res = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: number,
    mediaType: { format: "diff" },
  });
  return res.data as unknown as string;
}

/** Full current content of a file at a ref, or null if missing/binary/dir. */
export async function getFileContent(
  installationId: string | number,
  fullName: string,
  path: string,
  ref: string,
): Promise<string | null> {
  const octokit = await installationOctokit(installationId);
  const { owner, repo } = splitRepo(fullName);
  try {
    const res = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
      mediaType: { format: "raw" },
    });
    return res.data as unknown as string;
  } catch {
    return null;
  }
}

/** Recursive repo file tree at a ref (paths + types) — the repo map. */
export async function getRepoTree(
  installationId: string | number,
  fullName: string,
  ref: string,
): Promise<TreeEntry[]> {
  const octokit = await installationOctokit(installationId);
  const { owner, repo } = splitRepo(fullName);
  try {
    const { data } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: ref,
      recursive: "1",
    });
    return (data.tree ?? []).map((t) => ({
      path: t.path ?? "",
      type: t.type ?? "blob",
      size: t.size,
    }));
  } catch {
    return [];
  }
}

// ── writes ──────────────────────────────────────────────────────────────────
export interface FileEdit {
  path: string;
  content: string; // full new file content
}

/**
 * Commit a set of full-file edits onto `branch` as a single atomic commit via
 * the Git Data API (blobs → tree → commit → update ref). Returns the new SHA.
 */
export async function commitFiles(
  installationId: string | number,
  fullName: string,
  branch: string,
  files: FileEdit[],
  message: string,
): Promise<string> {
  if (files.length === 0) throw new Error("commitFiles: no files to commit");
  const octokit = await installationOctokit(installationId);
  const { owner, repo } = splitRepo(fullName);
  const refName = `heads/${branch}`;

  const { data: refData } = await octokit.rest.git.getRef({ owner, repo, ref: refName });
  const baseCommitSha = refData.object.sha;
  const { data: baseCommit } = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: baseCommitSha,
  });

  const tree = await Promise.all(
    files.map(async (f) => {
      const { data: blob } = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: Buffer.from(f.content, "utf8").toString("base64"),
        encoding: "base64",
      });
      return { path: f.path, mode: "100644", type: "blob", sha: blob.sha } as const;
    }),
  );

  const { data: newTree } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseCommit.tree.sha,
    tree,
  });

  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: newTree.sha,
    parents: [baseCommitSha],
  });

  await octokit.rest.git.updateRef({ owner, repo, ref: refName, sha: newCommit.sha });
  return newCommit.sha;
}

/**
 * Post a review with inline comments on a PR (Phase 7 — native GitHub surface).
 * `event` maps from our flag: SAFE→APPROVE, BLOCKED/UNSAFE→REQUEST_CHANGES,
 * else COMMENT.
 */
export async function postReview(
  installationId: string | number,
  fullName: string,
  number: number,
  body: string,
  comments: Array<{ path: string; line: number; body: string }>,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
): Promise<void> {
  const octokit = await installationOctokit(installationId);
  const { owner, repo } = splitRepo(fullName);
  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: number,
    body,
    event,
    comments: comments.map((c) => ({ path: c.path, line: c.line, body: c.body })),
  });
}

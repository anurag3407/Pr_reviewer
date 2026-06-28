/**
 * lib/lemma.ts — single source of truth for talking to the live Lemma pod.
 *
 * State layer = a real PostgreSQL-backed Lemma pod. We read/write through the
 * official `lemma-sdk` `LemmaClient` with a server-side bearer token
 * (`LEMMA_TOKEN`). One service token drives ALL tenants; isolation is enforced
 * at the application layer by an `owner_id` (Clerk user id) column on every row
 * — every accessor here filters/sets it. Never import this client-side.
 *
 * ── Why the TokenAuth shim ──────────────────────────────────────────────────
 * `lemma-sdk`'s `AuthManager` only injects a bearer from the browser
 * (`localStorage["lemma_token"]`); in Node it falls back to cookie auth, which
 * doesn't exist server-side, and there is no `token` config field. So we
 * subclass `AuthManager` to force "token mode" (`isTokenMode → true`,
 * `getBearerToken → LEMMA_TOKEN`) — exactly what the generated request layer
 * reads (`OpenAPI.TOKEN = auth.getBearerToken()`).
 *
 * ── Tenancy & joins ─────────────────────────────────────────────────────────
 * We scope reads by listing a table and filtering by `owner_id` in memory
 * rather than via `datastore.query` SQL — robust regardless of the physical
 * type of the `id` primary key and it sidesteps RLS row-visibility modes (the
 * same call style the original build verified against a real pod).
 */

import { LemmaClient, AuthManager } from "lemma-sdk";
import type {
  ChatMessage,
  Finding,
  NewChatMessage,
  NewFinding,
  NewProject,
  NewReview,
  Project,
  PRFlag,
  Review,
  ReviewWithFindings,
} from "./types";

const API_URL = process.env.LEMMA_API_URL ?? "https://api.lemma.work";
const AUTH_URL = process.env.LEMMA_AUTH_URL ?? "https://lemma.work/auth";

export const TABLES = {
  projects: "projects",
  reviews: "reviews",
  findings: "findings",
  chat: "chat_messages",
} as const;

/** Force the SDK into headless bearer-token mode (see file header). */
class TokenAuth extends AuthManager {
  constructor(apiUrl: string, authUrl: string, private readonly token: string) {
    super(apiUrl, authUrl);
  }
  override get isTokenMode(): boolean {
    return true;
  }
  override getBearerToken(): string {
    return this.token;
  }
  override getRequestInit(init: RequestInit = {}): RequestInit {
    return {
      ...init,
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${this.token}`,
      },
    };
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[lemma] Missing ${name}. The state layer is a live Lemma pod — set ` +
        `LEMMA_TOKEN and LEMMA_POD_ID in .env.local (see README / .env.example).`,
    );
  }
  return value;
}

let _client: LemmaClient | null = null;
/** Lazy singleton, pod-scoped client. Server-only — never import client-side. */
export function lemma(): LemmaClient {
  if (_client) return _client;
  const token = requireEnv("LEMMA_TOKEN");
  const podId = requireEnv("LEMMA_POD_ID");
  const auth = new TokenAuth(API_URL, AUTH_URL, token);
  _client = new LemmaClient({ apiUrl: API_URL, authUrl: AUTH_URL, podId }, { authManager: auth });
  return _client;
}

/** Non-throwing config snapshot for status indicators. */
export function lemmaConfig() {
  return {
    apiUrl: API_URL,
    podId: process.env.LEMMA_POD_ID ?? null,
    configured: Boolean(process.env.LEMMA_TOKEN && process.env.LEMMA_POD_ID),
  };
}

/** Cheap reachability probe — lists one table. */
export async function healthcheck(): Promise<{ ok: boolean; error?: string }> {
  try {
    await lemma().tables.list({ limit: 1 });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

// ── value coercion helpers ──────────────────────────────────────────────────
type Row = Record<string, unknown>;

function num(value: unknown, fallback: number | null = 0): number | null {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function str(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}
function nullableStr(value: unknown): string | null {
  return value == null ? null : String(value);
}
function bool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value == null) return fallback;
  const s = String(value).toLowerCase();
  return s === "true" || s === "t" || s === "1";
}
/** watched_branches is stored as JSON; tolerate array, JSON string, or null. */
function strArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Strip backend-managed columns before a create/update write. */
function clean<T extends Row>(patch: T): Row {
  const { id, created_at, updated_at, user_id, ...rest } = patch as Row;
  void id;
  void created_at;
  void updated_at;
  void user_id;
  return rest;
}

// ── row mappers ─────────────────────────────────────────────────────────────
function toProject(row: Row): Project {
  return {
    id: str(row.id),
    owner_id: str(row.owner_id),
    repo: str(row.repo),
    repo_id: nullableStr(row.repo_id),
    installation_id: str(row.installation_id),
    default_branch: nullableStr(row.default_branch),
    watched_branches: strArray(row.watched_branches),
    auto_review: bool(row.auto_review, true),
    status: (str(row.status, "ACTIVE") as Project["status"]) ?? "ACTIVE",
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

function toReview(row: Row): Review {
  return {
    id: str(row.id),
    owner_id: str(row.owner_id),
    project_id: str(row.project_id),
    repo: str(row.repo),
    pr_number: str(row.pr_number),
    title: str(row.title),
    author: str(row.author),
    head_branch: str(row.head_branch),
    base_branch: str(row.base_branch),
    head_sha: nullableStr(row.head_sha),
    flag: (str(row.flag, "REVIEWING") as PRFlag) ?? "REVIEWING",
    scan_count: num(row.scan_count, 0) ?? 0,
    summary: nullableStr(row.summary),
    html_url: nullableStr(row.html_url),
    last_error: nullableStr(row.last_error),
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

function toFinding(row: Row): Finding {
  return {
    id: str(row.id),
    owner_id: str(row.owner_id),
    review_id: str(row.review_id),
    scan: num(row.scan, 1) ?? 1,
    severity: (str(row.severity, "MEDIUM") as Finding["severity"]) ?? "MEDIUM",
    category: (str(row.category, "BUG") as Finding["category"]) ?? "BUG",
    file_path: nullableStr(row.file_path),
    line_start: num(row.line_start, null),
    line_end: num(row.line_end, null),
    title: str(row.title),
    detail: nullableStr(row.detail),
    suggested_fix: nullableStr(row.suggested_fix),
    confidence: num(row.confidence, null),
    status: (str(row.status, "OPEN") as Finding["status"]) ?? "OPEN",
    created_at: row.created_at as string | undefined,
  };
}

function toChat(row: Row): ChatMessage {
  return {
    id: str(row.id),
    owner_id: str(row.owner_id),
    review_id: str(row.review_id),
    finding_id: nullableStr(row.finding_id),
    role: (str(row.role, "assistant") as ChatMessage["role"]) ?? "assistant",
    content: str(row.content),
    created_at: row.created_at as string | undefined,
  };
}

// ── generic list helper (fetch + in-memory filter) ──────────────────────────
async function listRows(
  table: string,
  opts: { limit?: number; sortField?: string; direction?: "asc" | "desc" } = {},
): Promise<Row[]> {
  const res = await lemma().records.list(table, {
    limit: opts.limit ?? 500,
    sort: [{ field: opts.sortField ?? "created_at", direction: opts.direction ?? "desc" }],
  });
  return (res.items ?? []) as Row[];
}

// ── projects ────────────────────────────────────────────────────────────────
export async function createProject(input: NewProject): Promise<Project> {
  const row = await lemma().records.create(TABLES.projects, clean({
    owner_id: input.owner_id,
    repo: input.repo,
    repo_id: input.repo_id ?? null,
    installation_id: input.installation_id,
    default_branch: input.default_branch ?? null,
    watched_branches: input.watched_branches ?? [],
    auto_review: input.auto_review ?? true,
    status: "ACTIVE",
  }));
  return toProject(row as Row);
}

export async function listProjects(ownerId: string): Promise<Project[]> {
  const rows = await listRows(TABLES.projects);
  return rows.map(toProject).filter((p) => p.owner_id === ownerId);
}

/** Get a project, asserting it belongs to `ownerId` (returns null otherwise). */
export async function getProject(id: string, ownerId: string): Promise<Project | null> {
  const row = await lemma().records.get(TABLES.projects, id).catch(() => null);
  if (!row) return null;
  const project = toProject(row as Row);
  return project.owner_id === ownerId ? project : null;
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<void> {
  await lemma().records.update(TABLES.projects, id, clean(patch as Row));
}

export async function deleteProject(id: string): Promise<void> {
  await lemma().records.delete(TABLES.projects, id);
}

/** True when a project row is eligible to drive an automatic review. */
function isActionable(p: Project): boolean {
  return p.status !== "PAUSED" && p.auto_review;
}

/** Newest-first by created_at; rows without a timestamp sort last. */
function byCreatedDesc(a: Project, b: Project): number {
  return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
}

/**
 * Webhook path: resolve the owning project for an incoming repo + installation.
 * No owner filter — this is how we DISCOVER the owner_id.
 *
 * Prefers an exact installation match, then an *actionable* row (ACTIVE +
 * auto_review), then the newest. The actionable preference makes the result
 * deterministic and correct even if a stale/paused duplicate row still exists —
 * so a leftover `auto_review:false` twin can't shadow the live one.
 */
export async function findProjectByRepo(
  repo: string,
  installationId?: string,
): Promise<Project | null> {
  const rows = await listRows(TABLES.projects);
  let projects = rows.map(toProject).filter((p) => p.repo === repo);
  if (projects.length === 0) return null;
  if (installationId) {
    const exact = projects.filter((p) => p.installation_id === String(installationId));
    if (exact.length > 0) projects = exact;
  }
  projects.sort((a, b) => {
    const rank = Number(isActionable(b)) - Number(isActionable(a));
    return rank !== 0 ? rank : byCreatedDesc(a, b);
  });
  return projects[0];
}

export interface ReconcileResult {
  added: number;
  updated: number;
  removed: number;
  deduped: number;
}

/**
 * Make the stored projects for one (owner, installation) match the repos the
 * GitHub App actually grants — the single source of truth.
 *
 *  1. Collapse duplicate rows for the same repo (keep the newest, delete rest).
 *  2. Prune rows for repos this installation no longer grants.
 *  3. Update surviving rows whose repo_id / default_branch drifted.
 *  4. Create rows for newly granted repos the owner doesn't have yet.
 *
 * User-managed fields (auto_review, watched_branches, status) on surviving rows
 * are preserved. Only rows tagged with THIS installation are pruned/deduped, so
 * repos served by another installation are left untouched.
 */
export async function reconcileInstallationProjects(
  ownerId: string,
  installationId: string,
  granted: Array<{ fullName: string; id?: string | null; defaultBranch?: string | null }>,
): Promise<ReconcileResult> {
  const instId = String(installationId);
  const all = await listProjects(ownerId);
  const grantedByRepo = new Map(granted.map((g) => [g.fullName, g]));
  const result: ReconcileResult = { added: 0, updated: 0, removed: 0, deduped: 0 };

  // Group this installation's rows by repo to collapse duplicates.
  const byRepo = new Map<string, Project[]>();
  for (const p of all) {
    if (p.installation_id !== instId) continue;
    (byRepo.get(p.repo) ?? byRepo.set(p.repo, []).get(p.repo)!).push(p);
  }

  const survivors = new Map<string, Project>();
  for (const [repo, rows] of byRepo) {
    const [keep, ...dupes] = [...rows].sort(byCreatedDesc);
    for (const dup of dupes) {
      await deleteProject(dup.id);
      result.deduped += 1;
    }
    if (grantedByRepo.has(repo)) {
      survivors.set(repo, keep);
    } else {
      // No longer granted by this installation — drop it.
      await deleteProject(keep.id);
      result.removed += 1;
    }
  }

  // Update surviving rows whose GitHub metadata drifted.
  for (const [repo, keep] of survivors) {
    const g = grantedByRepo.get(repo)!;
    const patch: Partial<Project> = {};
    if (g.id && keep.repo_id !== String(g.id)) patch.repo_id = String(g.id);
    if (g.defaultBranch && keep.default_branch !== g.defaultBranch) {
      patch.default_branch = g.defaultBranch;
    }
    if (Object.keys(patch).length > 0) {
      await updateProject(keep.id, patch);
      result.updated += 1;
    }
  }

  // Add newly granted repos the owner has no row for (under any installation).
  const ownedRepos = new Set(all.map((p) => p.repo));
  for (const g of granted) {
    if (ownedRepos.has(g.fullName) || survivors.has(g.fullName)) continue;
    await createProject({
      owner_id: ownerId,
      repo: g.fullName,
      repo_id: g.id ? String(g.id) : null,
      installation_id: instId,
      default_branch: g.defaultBranch ?? null,
      watched_branches: [],
      auto_review: true,
    });
    result.added += 1;
  }

  return result;
}

// ── reviews ─────────────────────────────────────────────────────────────────
export async function createReview(input: NewReview): Promise<Review> {
  const row = await lemma().records.create(TABLES.reviews, clean({
    owner_id: input.owner_id,
    project_id: input.project_id,
    repo: input.repo,
    pr_number: input.pr_number,
    title: input.title ?? "",
    author: input.author ?? "",
    head_branch: input.head_branch ?? "",
    base_branch: input.base_branch ?? "",
    head_sha: input.head_sha ?? null,
    flag: "REVIEWING",
    scan_count: 0,
    html_url: input.html_url ?? null,
  }));
  return toReview(row as Row);
}

export async function getReview(id: string): Promise<Review | null> {
  const row = await lemma().records.get(TABLES.reviews, id).catch(() => null);
  return row ? toReview(row as Row) : null;
}

/** Owner-scoped fetch for API routes. */
export async function getReviewForOwner(id: string, ownerId: string): Promise<Review | null> {
  const review = await getReview(id);
  return review && review.owner_id === ownerId ? review : null;
}

export async function listReviews(ownerId: string): Promise<Review[]> {
  const rows = await listRows(TABLES.reviews);
  return rows.map(toReview).filter((r) => r.owner_id === ownerId);
}

/** Existing review for a (project, pr_number) pair — used to upsert on webhook. */
export async function findReviewByPr(projectId: string, prNumber: string): Promise<Review | null> {
  const rows = await listRows(TABLES.reviews);
  return (
    rows.map(toReview).find((r) => r.project_id === projectId && r.pr_number === prNumber) ?? null
  );
}

export async function updateReview(id: string, patch: Partial<Review>): Promise<void> {
  await lemma().records.update(TABLES.reviews, id, clean(patch as Row));
}

/** Read-modify-write bump of the scan counter; returns the new value. */
export async function incrementScan(id: string): Promise<number> {
  const review = await getReview(id);
  const next = (review?.scan_count ?? 0) + 1;
  await updateReview(id, { scan_count: next });
  return next;
}

// ── findings ────────────────────────────────────────────────────────────────
export async function addFinding(finding: NewFinding): Promise<Finding> {
  const row = await lemma().records.create(TABLES.findings, clean({
    owner_id: finding.owner_id ?? "",
    review_id: finding.review_id ?? "",
    scan: finding.scan ?? 1,
    severity: finding.severity,
    category: finding.category,
    file_path: finding.file_path ?? null,
    line_start: finding.line_start ?? null,
    line_end: finding.line_end ?? null,
    title: finding.title,
    detail: finding.detail ?? null,
    suggested_fix: finding.suggested_fix ?? null,
    confidence: finding.confidence ?? null,
    status: "OPEN",
  }));
  return toFinding(row as Row);
}

export async function listFindings(reviewId: string): Promise<Finding[]> {
  const rows = await listRows(TABLES.findings, { sortField: "created_at", direction: "asc" });
  return rows.map(toFinding).filter((f) => f.review_id === reviewId);
}

export async function getFinding(id: string): Promise<Finding | null> {
  const row = await lemma().records.get(TABLES.findings, id).catch(() => null);
  return row ? toFinding(row as Row) : null;
}

export async function updateFinding(id: string, patch: Partial<Finding>): Promise<void> {
  await lemma().records.update(TABLES.findings, id, clean(patch as Row));
}

/** Wipe a review's findings before persisting a fresh scan (current-state model). */
export async function clearFindings(reviewId: string): Promise<void> {
  const existing = await listFindings(reviewId);
  await Promise.all(
    existing.map((f) => lemma().records.delete(TABLES.findings, f.id).catch(() => {})),
  );
}

// ── chat ────────────────────────────────────────────────────────────────────
export async function addChatMessage(msg: NewChatMessage): Promise<ChatMessage> {
  const row = await lemma().records.create(TABLES.chat, clean({
    owner_id: msg.owner_id,
    review_id: msg.review_id,
    finding_id: msg.finding_id ?? null,
    role: msg.role,
    content: msg.content,
  }));
  return toChat(row as Row);
}

export async function listChat(reviewId: string, findingId?: string | null): Promise<ChatMessage[]> {
  const rows = await listRows(TABLES.chat, { sortField: "created_at", direction: "asc" });
  return rows
    .map(toChat)
    .filter((m) => m.review_id === reviewId)
    .filter((m) => (findingId === undefined ? true : (m.finding_id ?? null) === (findingId ?? null)));
}

// ── joins ───────────────────────────────────────────────────────────────────
export async function listReviewsWithFindings(ownerId: string): Promise<ReviewWithFindings[]> {
  const [reviews, findingRows] = await Promise.all([
    listReviews(ownerId),
    listRows(TABLES.findings, { sortField: "created_at", direction: "asc" }),
  ]);
  const findings = findingRows.map(toFinding);
  const byReview = new Map<string, Finding[]>();
  for (const f of findings) {
    const bucket = byReview.get(f.review_id);
    if (bucket) bucket.push(f);
    else byReview.set(f.review_id, [f]);
  }
  return reviews.map((r) => ({ ...r, findings: byReview.get(r.id) ?? [] }));
}

export async function getReviewWithFindings(
  id: string,
  ownerId: string,
): Promise<ReviewWithFindings | null> {
  const review = await getReviewForOwner(id, ownerId);
  if (!review) return null;
  const findings = await listFindings(id);
  return { ...review, findings };
}

// ── table provisioning (scripts/lemma-setup.ts) ─────────────────────────────
export async function listTableNames(): Promise<string[]> {
  const res = await lemma().tables.list({ limit: 200 });
  return ((res.items ?? []) as Array<{ name?: string }>).map((t) => t.name ?? "").filter(Boolean);
}

export async function createTable(payload: unknown): Promise<void> {
  await lemma().tables.create(payload as Parameters<LemmaClient["tables"]["create"]>[0]);
}

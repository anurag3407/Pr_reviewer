/**
 * The "code schema" — TypeScript mirrors of the Lemma tables that back the
 * multi-tenant PR-review product. Shapes match `lemma/tables/*.json`. Every
 * row is scoped by `owner_id` (the Clerk user id) for app-level tenancy.
 *
 * Reserved/auto columns the backend manages (never sent on create): `id`,
 * `created_at`, `updated_at`, and `user_id` (RLS tables only — ours use
 * app-level `owner_id` instead).
 */

// ── PR-level verdict ────────────────────────────────────────────────────────
// The single flag shown per pull request. REVIEWING is transient (a scan is in
// flight); ERROR means a scan failed. The rest are the rubric outcomes.
export const PR_FLAGS = [
  "REVIEWING",
  "SAFE",
  "NEEDS_REVIEW",
  "UNSAFE",
  "BLOCKED",
  "ERROR",
] as const;
export type PRFlag = (typeof PR_FLAGS)[number];

/** Flags the review/fix loop treats as "settled" (won't auto-reprocess). */
export const TERMINAL_FLAGS: readonly PRFlag[] = ["SAFE"];

// ── Per-finding severity & taxonomy ─────────────────────────────────────────
export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CATEGORIES = [
  "SECURITY",
  "BUG",
  "PERFORMANCE",
  "RELIABILITY",
  "STYLE",
  "COMPLIANCE",
  "TEST",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const FINDING_STATUSES = ["OPEN", "FIXED", "DISMISSED"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const PROJECT_STATUSES = ["ACTIVE", "PAUSED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type ChatRole = "user" | "assistant";

/** Max automatic fix→re-scan iterations before handing back to a human. */
export const MAX_FIX_ITERS = Number(process.env.MAX_FIX_ITERS ?? 4);

// ── projects table ──────────────────────────────────────────────────────────
export interface Project {
  id: string;
  owner_id: string;
  repo: string; // owner/name
  repo_id: string | null;
  installation_id: string;
  default_branch: string | null;
  watched_branches: string[]; // empty = watch all base branches
  auto_review: boolean;
  status: ProjectStatus;
  created_at?: string;
  updated_at?: string;
}

export interface NewProject {
  owner_id: string;
  repo: string;
  repo_id?: string | null;
  installation_id: string;
  default_branch?: string | null;
  watched_branches?: string[];
  auto_review?: boolean;
}

// ── reviews table ───────────────────────────────────────────────────────────
export interface Review {
  id: string;
  owner_id: string;
  project_id: string;
  repo: string;
  pr_number: string;
  title: string;
  author: string;
  head_branch: string;
  base_branch: string;
  head_sha: string | null;
  flag: PRFlag;
  scan_count: number;
  summary: string | null;
  html_url: string | null;
  last_error: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface NewReview {
  owner_id: string;
  project_id: string;
  repo: string;
  pr_number: string;
  title?: string;
  author?: string;
  head_branch?: string;
  base_branch?: string;
  head_sha?: string | null;
  html_url?: string | null;
}

// ── findings table ──────────────────────────────────────────────────────────
export interface Finding {
  id: string;
  owner_id: string;
  review_id: string;
  scan: number;
  severity: Severity;
  category: Category;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  title: string;
  detail: string | null;
  suggested_fix: string | null;
  confidence: number | null;
  status: FindingStatus;
  created_at?: string;
}

/** A finding produced by the model before it's persisted (no ids yet). */
export interface NewFinding {
  owner_id?: string; // filled in by the reviewer
  review_id?: string; // filled in by the reviewer
  scan?: number; // filled in by the reviewer
  severity: Severity;
  category: Category;
  file_path?: string | null;
  line_start?: number | null;
  line_end?: number | null;
  title: string;
  detail?: string | null;
  suggested_fix?: string | null;
  confidence?: number | null;
}

// ── chat_messages table ─────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  owner_id: string;
  review_id: string;
  finding_id: string | null;
  role: ChatRole;
  content: string;
  created_at?: string;
}

export interface NewChatMessage {
  owner_id: string;
  review_id: string;
  finding_id?: string | null;
  role: ChatRole;
  content: string;
}

/** A review joined with its current findings — what the review page renders. */
export interface ReviewWithFindings extends Review {
  findings: Finding[];
}

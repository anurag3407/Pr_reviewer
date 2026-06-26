/**
 * The "code schema" — TypeScript mirrors of the two Lemma tables.
 *
 * These shapes match `lemma/tables/pull_requests.json` and
 * `lemma/tables/identified_risks.json`. The whole app imports from here so the
 * orchestrator, API routes, and dashboard all agree on the state model.
 *
 * Reserved/auto columns the backend manages (never sent on create): `id`,
 * `created_at`, `updated_at`, and `user_id` (RLS tables only).
 */

// ── Pull request lifecycle ──────────────────────────────────────────────────
// The status walks: PENDING → TESTING → HEALING → (READY_FOR_MERGE | back to
// TESTING) … and on exhaustion → AWAITING_HUMAN_APPROVAL → (APPROVED_OVERRIDE |
// REJECTED). A human "Approve Release" sets APPROVED_OVERRIDE.
export const PR_STATUSES = [
  "PENDING",
  "TESTING",
  "HEALING",
  "READY_FOR_MERGE",
  "AWAITING_HUMAN_APPROVAL",
  "APPROVED_OVERRIDE",
  "REJECTED",
] as const;
export type PRStatus = (typeof PR_STATUSES)[number];

export const RISK_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];

export const RISK_CATEGORIES = [
  "BUG",
  "COMPLIANCE",
  "TEST_FAILURE",
  "SECURITY",
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const RISK_STATUSES = ["OPEN", "FIXED", "WONT_FIX"] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

export type RiskSource = "testsprite" | "npm-test" | "mock";

/** The maximum number of auto-healing attempts before escalating to a human. */
export const MAX_RETRIES = 5;

// ── pull_requests table ─────────────────────────────────────────────────────
export interface PullRequest {
  id: string;
  pr_number: string;
  repo: string;
  branch: string;
  author: string;
  title: string;
  status: PRStatus;
  retry_count: number;
  preview_url: string | null;
  testsprite_test_id: string | null;
  last_error: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Fields supplied when a PR row is first created (the rest get defaults). */
export interface NewPR {
  pr_number: string;
  repo: string;
  branch: string;
  author?: string;
  title?: string;
  preview_url?: string | null;
  testsprite_test_id?: string | null;
}

// ── identified_risks table ──────────────────────────────────────────────────
export interface IdentifiedRisk {
  id: string;
  pr_id: string; // the pull_requests.id this risk belongs to (stored as text)
  attempt: number;
  severity: RiskSeverity;
  category: RiskCategory;
  title: string;
  detail: string | null;
  recommended_fix: string | null;
  source: RiskSource | string;
  status: RiskStatus;
  created_at?: string;
}

/** A normalized failure produced by a test runner, before it's persisted. */
export interface NewRisk {
  pr_id?: string; // filled in by the orchestrator
  attempt?: number; // filled in by the orchestrator
  severity: RiskSeverity;
  category: RiskCategory;
  title: string;
  detail?: string;
  recommended_fix?: string;
  source: RiskSource | string;
}

/** A PR joined with its identified risks — what the dashboard renders. */
export interface PRWithRisks extends PullRequest {
  risks: IdentifiedRisk[];
}

export interface AuthorizedBranch {
  id: string;
  repo: string;
  branch: string;
  user_id: string | null;
  created_at?: string;
}

export interface NewAuthorizedBranch {
  repo: string;
  branch: string;
  user_id?: string | null;
}

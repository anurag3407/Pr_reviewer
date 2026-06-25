/**
 * Presentation metadata for PR statuses and risk severities/categories.
 * Pure display layer — maps domain enums to human labels and a "tone" token
 * the CSS targets via [data-tone="…"].
 */

import type { PRStatus, RiskCategory, RiskSeverity } from "@/lib/types";

export interface StatusMeta {
  label: string;
  tone: "idle" | "test" | "heal" | "ready" | "await" | "reject";
  /** True for states where the agent is actively working (drives the pulse). */
  active?: boolean;
}

export const STATUS_META: Record<PRStatus, StatusMeta> = {
  PENDING: { label: "Queued", tone: "idle" },
  TESTING: { label: "Testing", tone: "test", active: true },
  HEALING: { label: "Healing", tone: "heal", active: true },
  READY_FOR_MERGE: { label: "Ready to merge", tone: "ready" },
  AWAITING_HUMAN_APPROVAL: { label: "Awaiting approval", tone: "await" },
  APPROVED_OVERRIDE: { label: "Released · override", tone: "ready" },
  REJECTED: { label: "Rejected", tone: "reject" },
};

export const SEVERITY_TONE: Record<RiskSeverity, "low" | "med" | "high" | "crit"> = {
  LOW: "low",
  MEDIUM: "med",
  HIGH: "high",
  CRITICAL: "crit",
};

/** Row order for the threat grid: most severe at the top. */
export const SEVERITY_ROWS: RiskSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

/** Column order for the threat grid. */
export const CATEGORY_COLS: RiskCategory[] = ["SECURITY", "BUG", "TEST_FAILURE", "COMPLIANCE"];

export const CATEGORY_LABEL: Record<RiskCategory, string> = {
  SECURITY: "Security",
  BUG: "Bug",
  TEST_FAILURE: "Test",
  COMPLIANCE: "Compliance",
};

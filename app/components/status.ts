/**
 * Presentation metadata — maps domain enums to labels and a CSS "tone" token
 * (targeted by [data-tone] / [data-sev] in globals.css). Pure display layer.
 */

import type { Category, PRFlag, Severity } from "@/lib/types";

export type Tone = "idle" | "test" | "heal" | "ready" | "await" | "reject";

export interface FlagMeta {
  label: string;
  tone: Tone;
  /** Actively-working state → drives the pulse. */
  active?: boolean;
}

export const FLAG_META: Record<PRFlag, FlagMeta> = {
  REVIEWING: { label: "Reviewing", tone: "heal", active: true },
  SAFE: { label: "Safe", tone: "ready" },
  NEEDS_REVIEW: { label: "Needs review", tone: "test" },
  UNSAFE: { label: "Unsafe", tone: "await" },
  BLOCKED: { label: "Blocked", tone: "reject" },
  ERROR: { label: "Error", tone: "reject" },
};

export const SEVERITY_TONE: Record<Severity, "low" | "med" | "high" | "crit"> = {
  LOW: "low",
  MEDIUM: "med",
  HIGH: "high",
  CRITICAL: "crit",
};

/** Most-severe first (threat-grid row order). */
export const SEVERITY_ROWS: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

/** Threat-grid columns. */
export const CATEGORY_COLS: Category[] = [
  "SECURITY",
  "BUG",
  "RELIABILITY",
  "PERFORMANCE",
  "COMPLIANCE",
  "TEST",
  "STYLE",
];

export const CATEGORY_LABEL: Record<Category, string> = {
  SECURITY: "Sec",
  BUG: "Bug",
  PERFORMANCE: "Perf",
  RELIABILITY: "Rel",
  STYLE: "Style",
  COMPLIANCE: "Compl",
  TEST: "Test",
};

/**
 * lib/agents/risk-reviewer.ts — the first real reviewer agent (v2).
 *
 * Seam signature:  reviewRisks(ctx: PullRequestContext) => Promise<NewRisk[]>
 *
 * Phase 1 (now): build a prompt from the REAL PR diff, ask the LLM (via
 * lib/llm.ts) for a structured JSON list of risks, validate + map to NewRisk[].
 * Phase 2 (later): the body becomes `client.agents.run("risk-reviewer", …)` —
 * callers (the orchestrator) never change.
 *
 * If no LLM is configured, or the call/parse fails, we fall back to a
 * deterministic scan of the diff (hardcoded secrets, debug leftovers) so the
 * pipeline still surfaces *something real from the actual code* — never the old
 * hardcoded demo risks.
 */

import { activeModel, chatJSON, llmConfigured } from "../llm";
import {
  RISK_CATEGORIES,
  RISK_SEVERITIES,
  type NewRisk,
  type PullRequestContext,
  type RiskCategory,
  type RiskSeverity,
} from "../types";

const MAX_DIFF_CHARS = 12_000; // keep prompts cheap; truncate huge diffs
const MAX_RISKS = 8;

const SYSTEM = [
  "You are a senior code reviewer for pull requests. You receive a unified diff",
  "and must flag concrete risks an engineer should fix before merge: bugs,",
  "security issues (leaked secrets, injection, authz), compliance/accessibility",
  "gaps, and likely test failures.",
  "",
  "Reply with ONLY a JSON array (no prose, no code fence). Each element:",
  '{ "severity": "LOW|MEDIUM|HIGH|CRITICAL",',
  '  "category": "BUG|SECURITY|COMPLIANCE|TEST_FAILURE",',
  '  "title": "short label (max ~60 chars)",',
  '  "detail": "what & where, referencing the file/line",',
  '  "recommended_fix": "the concrete fix" }',
  `Return at most ${MAX_RISKS} of the most important risks. If the diff is clean,`,
  "return an empty array [].",
].join("\n");

interface RawRisk {
  severity?: string;
  category?: string;
  title?: string;
  detail?: string;
  recommended_fix?: string;
}

export async function reviewRisks(ctx: PullRequestContext): Promise<NewRisk[]> {
  if (!llmConfigured()) return heuristicRisks(ctx);

  try {
    const raw = await chatJSON<RawRisk[]>({ system: SYSTEM, user: buildPrompt(ctx) });
    if (!Array.isArray(raw)) return heuristicRisks(ctx);
    const model = activeModel();
    const risks = raw.slice(0, MAX_RISKS).map((r) => normalize(r, model)).filter(Boolean) as NewRisk[];
    // If the model returned an empty/garbage array, still run the cheap scan so
    // an obvious leaked secret never slips through.
    return risks.length ? risks : heuristicRisks(ctx);
  } catch {
    return heuristicRisks(ctx);
  }
}

function buildPrompt(ctx: PullRequestContext): string {
  const diff = ctx.diff.length > MAX_DIFF_CHARS
    ? ctx.diff.slice(0, MAX_DIFF_CHARS) + "\n…[diff truncated]…"
    : ctx.diff;
  const fileList = ctx.files
    .map((f) => `  ${f.status.padEnd(8)} ${f.filename} (+${f.additions}/-${f.deletions})`)
    .join("\n");
  return [
    `PR #${ctx.number} "${ctx.title}" on ${ctx.repo} (${ctx.branch} → ${ctx.baseBranch})`,
    ctx.body ? `Description: ${ctx.body.slice(0, 500)}` : "",
    "",
    `Changed files (${ctx.files.length}):`,
    fileList || "  (none reported)",
    "",
    "Unified diff:",
    diff || "(no diff available)",
  ]
    .filter(Boolean)
    .join("\n");
}

// ── validation / mapping ─────────────────────────────────────────────────────
function normalize(r: RawRisk, model: string): NewRisk | null {
  const title = (r.title ?? "").trim();
  if (!title) return null;
  const severity = coerce(r.severity, RISK_SEVERITIES, "MEDIUM") as RiskSeverity;
  const category = coerce(r.category, RISK_CATEGORIES, "BUG") as RiskCategory;
  return {
    severity,
    category,
    title: title.slice(0, 120),
    detail: (r.detail ?? "").trim() || undefined,
    recommended_fix: (r.recommended_fix ?? "").trim() || undefined,
    source: `ai:${model}`,
  };
}

function coerce(value: string | undefined, allowed: readonly string[], fallback: string): string {
  const up = (value ?? "").toUpperCase();
  return (allowed as readonly string[]).includes(up) ? up : fallback;
}

// ── deterministic fallback (scans the real diff) ─────────────────────────────
function heuristicRisks(ctx: PullRequestContext): NewRisk[] {
  const risks: NewRisk[] = [];
  const added = addedLines(ctx.diff);

  const secret = added.find((l) =>
    /(sk_live_|sk-[a-z]|api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{12,}/i.test(l),
  );
  if (secret) {
    risks.push({
      severity: "CRITICAL",
      category: "SECURITY",
      title: "Possible hardcoded secret in diff",
      detail: `A line added in this PR looks like a credential: ${secret.trim().slice(0, 120)}`,
      recommended_fix: "Move it to an environment variable and rotate the exposed value.",
      source: "scan",
    });
  }

  const debug = added.filter((l) => /console\.(log|debug)|debugger\b|print\(/.test(l));
  if (debug.length) {
    risks.push({
      severity: "LOW",
      category: "BUG",
      title: `Debug statement left in (${debug.length})`,
      detail: "Debug/logging statements were added in this PR.",
      recommended_fix: "Remove debug logging before merge.",
      source: "scan",
    });
  }

  if (!risks.length) {
    risks.push({
      severity: "LOW",
      category: "TEST_FAILURE",
      title: "Automated review unavailable",
      detail: `No LLM configured and no obvious issues found by the scan across ${ctx.files.length} file(s).`,
      recommended_fix: "Set BYNARA_API_KEY (or ANTHROPIC_API_KEY) to enable full AI review.",
      source: "scan",
    });
  }
  return risks;
}

function addedLines(diff: string): string[] {
  return diff
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1));
}

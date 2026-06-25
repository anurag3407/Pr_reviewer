/**
 * lib/fixer.ts — turn a failure into a proposed code change.
 *
 * Uses the Anthropic SDK (Claude `claude-opus-4-8` by default). When
 * ANTHROPIC_API_KEY is unset — or the call errors — it falls back to a
 * deterministic mock fix so the auto-healing loop always advances in a demo.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { NewRisk, PullRequest } from "./types";

export interface FixResult {
  summary: string; // one-line human summary
  patch: string; // unified diff or description of the change
  model: string; // "claude-opus-4-8" | "mock" | …
}

const DEFAULT_MODEL = "claude-opus-4-8";

export async function generateFix(pr: PullRequest, risks: NewRisk[]): Promise<FixResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return mockFix(pr, risks);

  const model = process.env.FIXER_MODEL ?? DEFAULT_MODEL;
  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      system:
        "You are an automated PR-healing agent. Given the failing checks/risks " +
        "for a pull request, propose a concrete, minimal code fix. Reply with a " +
        "single human-readable summary line first, then — if you can infer one — " +
        "a fenced unified diff. Be terse and specific.",
      messages: [{ role: "user", content: buildPrompt(pr, risks) }],
    });
    const text = message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    if (!text) return mockFix(pr, risks);
    return { summary: firstLine(text), patch: text, model };
  } catch (error) {
    const fallback = mockFix(pr, risks);
    return {
      ...fallback,
      summary: `Claude unavailable (${(error as Error).message}); applied mock fix`,
    };
  }
}

function buildPrompt(pr: PullRequest, risks: NewRisk[]): string {
  const lines = [
    `Pull request: "${pr.title}" on branch ${pr.branch} (${pr.repo}).`,
    `Healing attempt ${pr.retry_count + 1}. The following checks failed:`,
    "",
  ];
  risks.forEach((r, i) => {
    lines.push(`${i + 1}. [${r.severity}/${r.category}] ${r.title}`);
    if (r.detail) lines.push(`   detail: ${r.detail}`);
    if (r.recommended_fix) lines.push(`   hint: ${r.recommended_fix}`);
  });
  lines.push("", "Propose the smallest change that makes these checks pass.");
  return lines.join("\n");
}

function firstLine(text: string): string {
  const line = text.split("\n").find((l) => l.trim().length > 0) ?? text;
  return line.replace(/^#+\s*/, "").trim().slice(0, 200);
}

function mockFix(pr: PullRequest, risks: NewRisk[]): FixResult {
  const top = risks[0];
  const attempt = pr.retry_count + 1;
  const file = guessFile(top);
  const summary = top
    ? `Auto-fix attempt ${attempt}: address "${top.title}"`
    : `Auto-fix attempt ${attempt}`;
  const patch = [
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ healing attempt ${attempt} @@`,
    `- // ${top?.title ?? "failing check"}`,
    `+ // fixed: ${top?.recommended_fix ?? "applied remediation"}`,
    "",
  ].join("\n");
  return { summary, patch, model: "mock" };
}

function guessFile(risk?: NewRisk): string {
  switch (risk?.category) {
    case "SECURITY":
      return "src/config/secrets.ts";
    case "COMPLIANCE":
      return "src/components/CouponField.tsx";
    case "TEST_FAILURE":
      return "src/checkout/total.ts";
    default:
      return "src/checkout/cart.ts";
  }
}

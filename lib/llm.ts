/**
 * lib/llm.ts — the model client.
 *
 * Primary: MiMo-V2.5-Pro via Bynara/NaraRouter (OpenAI-compatible
 * `/v1/chat/completions`, `BYNARA_API_KEY`). MiMo is a 1M-context reasoning
 * model purpose-built for software engineering — ideal for whole-codebase
 * review. Fallback: Anthropic (`ANTHROPIC_API_KEY`) when Bynara is absent.
 *
 * Exposes three review-domain helpers (reviewPullRequest / chatAboutReview /
 * generateFileEdits) plus the low-level chatCompletion. Structured calls coerce
 * to strict JSON and validate with zod, retrying once on a parse miss.
 */

import { z } from "zod";
import {
  CATEGORIES,
  type Category,
  type PRFlag,
  SEVERITIES,
  type Severity,
} from "./types";
import {
  CHAT_SYSTEM,
  FIX_SYSTEM,
  REVIEW_SYSTEM,
  buildFixUserPrompt,
  buildReviewUserPrompt,
  describeFinding,
} from "./prompts";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const BYNARA_BASE = process.env.BYNARA_BASE_URL ?? "https://router.bynara.id/v1";
const REVIEW_MODEL = process.env.REVIEW_MODEL ?? "mimo-v2.5-pro-free";
const FALLBACK_MODEL = process.env.FALLBACK_MODEL ?? "claude-opus-4-8";

export function llmConfigured(): boolean {
  return Boolean(process.env.BYNARA_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export function activeModel(): string {
  if (process.env.BYNARA_API_KEY) return REVIEW_MODEL;
  if (process.env.ANTHROPIC_API_KEY) return FALLBACK_MODEL;
  return "(none)";
}

interface CompletionOpts {
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
}

/** One chat completion → assistant text. Throws if no provider is configured. */
export async function chatCompletion(messages: LLMMessage[], opts: CompletionOpts = {}): Promise<string> {
  const { maxTokens = 4096, temperature = 0.1, json = false } = opts;

  if (process.env.BYNARA_API_KEY) {
    return bynaraCompletion(messages, { maxTokens, temperature, json });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropicCompletion(messages, { maxTokens, temperature });
  }
  throw new Error(
    "No model provider configured. Set BYNARA_API_KEY (MiMo via Bynara) or ANTHROPIC_API_KEY in .env.local.",
  );
}

async function bynaraCompletion(
  messages: LLMMessage[],
  opts: Required<Omit<CompletionOpts, "json">> & { json: boolean },
): Promise<string> {
  const res = await fetch(`${BYNARA_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.BYNARA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: REVIEW_MODEL,
      messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bynara ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 300)}` : ""}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Bynara returned an empty completion");
  }
  return stripReasoning(content);
}

async function anthropicCompletion(
  messages: LLMMessage[],
  opts: { maxTokens: number; temperature: number },
): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  const message = await client.messages.create({
    model: FALLBACK_MODEL,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    system,
    messages: rest,
  });
  const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  if (!text) throw new Error("Anthropic returned an empty completion");
  return text;
}

/** Reasoning models sometimes emit <think>…</think> before the answer — drop it. */
function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/** Pull the first JSON object/array out of a model response (tolerates fences). */
function extractJson(text: string): string | null {
  let t = stripReasoning(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.search(/[[{]/);
  if (start === -1) return null;
  const open = t[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return t.slice(start, i + 1);
    }
  }
  return null;
}

/** Parse + zod-validate a structured response, retrying once with a nudge. */
async function structured<T>(
  messages: LLMMessage[],
  schema: z.ZodType<T>,
  opts: CompletionOpts,
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await chatCompletion(messages, { ...opts, json: true });
    const jsonText = extractJson(raw) ?? raw;
    try {
      return schema.parse(JSON.parse(jsonText));
    } catch {
      if (attempt === 0) {
        messages = [
          ...messages,
          { role: "assistant", content: raw.slice(0, 2000) },
          {
            role: "user",
            content:
              "That was not valid JSON matching the required schema. Reply again with ONLY the JSON object, no prose, no code fences.",
          },
        ];
        continue;
      }
    }
  }
  throw new Error("Model did not return valid JSON after a retry.");
}

// ── normalization helpers ───────────────────────────────────────────────────
function normSeverity(v: unknown): Severity {
  const s = String(v ?? "").toUpperCase();
  return (SEVERITIES as readonly string[]).includes(s) ? (s as Severity) : "MEDIUM";
}
function normCategory(v: unknown): Category {
  const c = String(v ?? "").toUpperCase();
  return (CATEGORIES as readonly string[]).includes(c) ? (c as Category) : "BUG";
}
function clampConfidence(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.6;
  return Math.min(1, Math.max(0, n));
}
const SEVERITY_RANK: Record<Severity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

/** Derive the PR flag deterministically from the findings (don't trust self-report). */
function flagFromFindings(findings: { severity: Severity }[]): PRFlag {
  let worst = 0;
  for (const f of findings) worst = Math.max(worst, SEVERITY_RANK[f.severity]);
  if (worst >= 4) return "BLOCKED";
  if (worst >= 3) return "UNSAFE";
  if (worst >= 1) return "NEEDS_REVIEW";
  return "SAFE";
}

// ── review ──────────────────────────────────────────────────────────────────
const ReviewSchema = z.object({
  flag: z.string().optional(),
  summary: z.string().optional(),
  findings: z
    .array(
      z.object({
        file_path: z.string().nullish(),
        line_start: z.number().nullish(),
        line_end: z.number().nullish(),
        severity: z.string(),
        category: z.string(),
        title: z.string(),
        detail: z.string().nullish(),
        suggested_fix: z.string().nullish(),
        confidence: z.number().nullish(),
      }),
    )
    .default([]),
});

export interface ReviewResult {
  flag: PRFlag;
  summary: string;
  findings: Array<{
    file_path: string | null;
    line_start: number | null;
    line_end: number | null;
    severity: Severity;
    category: Category;
    title: string;
    detail: string | null;
    suggested_fix: string | null;
    confidence: number;
  }>;
}

export async function reviewPullRequest(contextText: string): Promise<ReviewResult> {
  const messages: LLMMessage[] = [
    { role: "system", content: REVIEW_SYSTEM },
    { role: "user", content: buildReviewUserPrompt(contextText) },
  ];
  const parsed = await structured(messages, ReviewSchema, { maxTokens: 8000, temperature: 0.1 });

  const findings = parsed.findings.map((f) => ({
    file_path: f.file_path ?? null,
    line_start: f.line_start ?? null,
    line_end: f.line_end ?? f.line_start ?? null,
    severity: normSeverity(f.severity),
    category: normCategory(f.category),
    title: f.title,
    detail: f.detail ?? null,
    suggested_fix: f.suggested_fix ?? null,
    confidence: clampConfidence(f.confidence),
  }));

  return {
    flag: flagFromFindings(findings),
    summary: parsed.summary?.trim() || (findings.length ? "Issues found — see findings." : "No material issues found."),
    findings,
  };
}

// ── chat ────────────────────────────────────────────────────────────────────
/**
 * `turns` are the user/assistant conversation (ending with the new user
 * message). `context` (PR + finding + code) rides on the system message so role
 * alternation stays valid for the Anthropic fallback.
 */
export async function chatAboutReview(turns: LLMMessage[], context: string): Promise<string> {
  const system = context ? `${CHAT_SYSTEM}\n\nCONTEXT FOR THIS CONVERSATION:\n${context}` : CHAT_SYSTEM;
  return chatCompletion([{ role: "system", content: system }, ...turns], {
    maxTokens: 2500,
    temperature: 0.3,
  });
}

// ── fix generation ──────────────────────────────────────────────────────────
const FixSchema = z.object({
  edits: z
    .array(z.object({ path: z.string(), new_content: z.string() }))
    .default([]),
  note: z.string().optional(),
});

export interface FileEditResult {
  edits: Array<{ path: string; new_content: string }>;
  note: string;
}

export async function generateFileEdits(
  findings: Array<Parameters<typeof describeFinding>[0]>,
  files: Array<{ path: string; content: string }>,
): Promise<FileEditResult> {
  const messages: LLMMessage[] = [
    { role: "system", content: FIX_SYSTEM },
    { role: "user", content: buildFixUserPrompt(findings, files) },
  ];
  const parsed = await structured(messages, FixSchema, { maxTokens: 16000, temperature: 0 });
  return { edits: parsed.edits, note: parsed.note?.trim() || "Applied review fixes." };
}

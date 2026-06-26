/**
 * lib/llm.ts — one chat() call site for every agent (v2, Phase 1).
 *
 * Provider order: Bynara (OpenAI-compatible, free) → Anthropic → throw. The four
 * reviewer agents all call chat()/chatJSON() so the provider lives in ONE place.
 *
 * ── Phase 2 swap ──────────────────────────────────────────────────────────────
 * This file is the seam between "call an LLM ourselves" and "let Lemma run the
 * agent". In Phase 2, chat() becomes `client.agents.run(agentName, prompt)` +
 * read the conversation reply — and no agent file above it changes.
 */

import Anthropic from "@anthropic-ai/sdk";

const BYNARA_URL = "https://router.bynara.id/v1/chat/completions";
const DEFAULT_BYNARA_MODEL = "mimo-v2.5-pro-free";
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8";

export interface ChatParams {
  system: string;
  user: string;
  maxTokens?: number;
}

/** True when some LLM provider is configured (else agents use a local fallback). */
export function llmConfigured(): boolean {
  return Boolean(process.env.BYNARA_API_KEY || process.env.ANTHROPIC_API_KEY);
}

// Bynara and Anthropic take DIFFERENT model ids. Keep them on separate env vars
// so e.g. FIXER_MODEL=claude-opus-4-8 can't be sent to Bynara (which rejects it).
function bynaraModel(): string {
  return process.env.BYNARA_MODEL ?? DEFAULT_BYNARA_MODEL;
}
function anthropicModel(): string {
  return process.env.ANTHROPIC_MODEL ?? process.env.FIXER_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
}

/** Which model string the current provider will use (for the `source`/`model` field). */
export function activeModel(): string {
  if (process.env.BYNARA_API_KEY) return bynaraModel();
  if (process.env.ANTHROPIC_API_KEY) return anthropicModel();
  return "none";
}

/** Send one system+user turn, return the assistant's text. Throws if no provider. */
export async function chat({ system, user, maxTokens = 1500 }: ChatParams): Promise<string> {
  const bynaraKey = process.env.BYNARA_API_KEY;
  if (bynaraKey) {
    const model = bynaraModel();
    const res = await fetch(BYNARA_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${bynaraKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Bynara ${res.status} ${res.statusText}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return (data.choices?.[0]?.message?.content ?? "").trim();
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const model = anthropicModel();
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    return msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
  }

  throw new Error("No LLM provider configured (set BYNARA_API_KEY or ANTHROPIC_API_KEY)");
}

/**
 * Like chat(), but expects the model to return JSON and parses it. Tolerates
 * ```json fences and leading/trailing prose by extracting the first JSON value.
 * Returns null if parsing fails (callers fall back to a deterministic result).
 */
export async function chatJSON<T = unknown>(params: ChatParams): Promise<T | null> {
  const text = await chat(params);
  return extractJSON<T>(text);
}

/** Pull the first JSON array/object out of a model reply (handles ``` fences). */
export function extractJSON<T = unknown>(text: string): T | null {
  if (!text) return null;
  // Strip a ```json ... ``` (or ``` ... ```) fence if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  // Find the first { or [ and the matching last } or ].
  const start = body.search(/[[{]/);
  if (start === -1) return null;
  const openChar = body[start];
  const closeChar = openChar === "[" ? "]" : "}";
  const end = body.lastIndexOf(closeChar);
  if (end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

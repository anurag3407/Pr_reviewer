/**
 * lib/lemma.ts — single source of truth for talking to the live Lemma pod.
 *
 * State layer = a real PostgreSQL-backed Lemma pod (decision #1: live pod only,
 * no local DB fallback). We read/write through the official `lemma-sdk`
 * `LemmaClient` with a server-side bearer token (`LEMMA_TOKEN`).
 *
 * ── Why the TokenAuth shim ──────────────────────────────────────────────────
 * `lemma-sdk`'s `AuthManager` only injects a bearer token from the browser
 * (`localStorage["lemma_token"]`); in Node it falls back to cookie auth, which
 * doesn't exist server-side. There is no `token` config field. So we subclass
 * `AuthManager` to force "token mode": `isTokenMode → true`, `getBearerToken →
 * LEMMA_TOKEN`. That's exactly what the SDK's generated request layer reads
 * (`OpenAPI.TOKEN = auth.getBearerToken()`), so every tables/records/datastore
 * call goes out as `Authorization: Bearer <token>` against the live pod.
 *
 * Note: the SDK pulls in `supertokens-web-js`, whose subpath uses directory
 * imports that raw Node ESM rejects. It resolves fine under a bundler — tsx
 * (esbuild) for the scripts and webpack for Next route handlers — which is why
 * `next.config.mjs` deliberately bundles `lemma-sdk` rather than externalizing it.
 */

import { LemmaClient, AuthManager } from "lemma-sdk";
import type {
  IdentifiedRisk,
  NewPR,
  NewRisk,
  PRWithRisks,
  PRStatus,
  PullRequest,
} from "./types";

const API_URL = process.env.LEMMA_API_URL ?? "https://api.lemma.work";
const AUTH_URL = process.env.LEMMA_AUTH_URL ?? "https://lemma.work/auth";

export const TABLES = { prs: "pull_requests", risks: "identified_risks" } as const;

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
    // Covers the raw `client.request()` escape hatch too (HttpClient path).
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

/** Non-throwing config snapshot for the dashboard's "live pod" indicator. */
export function lemmaConfig() {
  return {
    apiUrl: API_URL,
    podId: process.env.LEMMA_POD_ID ?? null,
    configured: Boolean(process.env.LEMMA_TOKEN && process.env.LEMMA_POD_ID),
  };
}

/** Cheap reachability probe — lists one table. Used by the health endpoint. */
export async function healthcheck(): Promise<{ ok: boolean; error?: string }> {
  try {
    await lemma().tables.list({ limit: 1 });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

// ── Row mappers (raw JSON → typed) ──────────────────────────────────────────
type Row = Record<string, unknown>;

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function nullableStr(value: unknown): string | null {
  return value == null ? null : String(value);
}

function toPR(row: Row): PullRequest {
  return {
    id: String(row.id),
    pr_number: String(row.pr_number ?? ""),
    repo: String(row.repo ?? ""),
    branch: String(row.branch ?? ""),
    author: String(row.author ?? ""),
    title: String(row.title ?? ""),
    status: (row.status as PRStatus) ?? "PENDING",
    retry_count: num(row.retry_count, 0),
    preview_url: nullableStr(row.preview_url),
    testsprite_test_id: nullableStr(row.testsprite_test_id),
    last_error: nullableStr(row.last_error),
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

function toRisk(row: Row): IdentifiedRisk {
  return {
    id: String(row.id),
    pr_id: String(row.pr_id ?? ""),
    attempt: num(row.attempt, 0),
    severity: (row.severity as IdentifiedRisk["severity"]) ?? "MEDIUM",
    category: (row.category as IdentifiedRisk["category"]) ?? "BUG",
    title: String(row.title ?? ""),
    detail: nullableStr(row.detail),
    recommended_fix: nullableStr(row.recommended_fix),
    source: String(row.source ?? "mock"),
    status: (row.status as IdentifiedRisk["status"]) ?? "OPEN",
    created_at: row.created_at as string | undefined,
  };
}

// ── pull_requests CRUD ──────────────────────────────────────────────────────
export async function createPR(input: NewPR): Promise<PullRequest> {
  const row = await lemma().records.create(TABLES.prs, {
    pr_number: input.pr_number,
    repo: input.repo,
    branch: input.branch,
    author: input.author ?? "unknown",
    title: input.title ?? "",
    status: "PENDING",
    retry_count: 0,
    preview_url: input.preview_url ?? null,
    testsprite_test_id: input.testsprite_test_id ?? null,
  });
  return toPR(row as Row);
}

export async function getPR(id: string): Promise<PullRequest> {
  const row = await lemma().records.get(TABLES.prs, id);
  return toPR(row as Row);
}

export async function listPRs(): Promise<PullRequest[]> {
  const res = await lemma().records.list(TABLES.prs, {
    limit: 200,
    sort: [{ field: "created_at", direction: "desc" }],
  });
  return (res.items ?? []).map((r) => toPR(r as Row));
}

export async function updatePR(id: string, patch: Partial<PullRequest>): Promise<void> {
  // Never send backend-managed columns.
  const { id: _id, created_at: _c, updated_at: _u, ...data } = patch;
  await lemma().records.update(TABLES.prs, id, data as Record<string, unknown>);
}

/** Read-modify-write bump of the loop counter; returns the new value. */
export async function incrementRetry(id: string): Promise<number> {
  const pr = await getPR(id);
  const next = pr.retry_count + 1;
  await updatePR(id, { retry_count: next });
  return next;
}

// ── identified_risks CRUD ───────────────────────────────────────────────────
export async function addRisk(risk: NewRisk): Promise<IdentifiedRisk> {
  const row = await lemma().records.create(TABLES.risks, {
    pr_id: String(risk.pr_id ?? ""),
    attempt: risk.attempt ?? 0,
    severity: risk.severity,
    category: risk.category,
    title: risk.title,
    detail: risk.detail ?? null,
    recommended_fix: risk.recommended_fix ?? null,
    source: risk.source,
    status: "OPEN",
  });
  return toRisk(row as Row);
}

export async function listRisks(): Promise<IdentifiedRisk[]> {
  const res = await lemma().records.list(TABLES.risks, {
    limit: 1000,
    sort: [{ field: "created_at", direction: "asc" }],
  });
  return (res.items ?? []).map((r) => toRisk(r as Row));
}

/**
 * PRs joined with their risks for the dashboard. We fetch both tables and join
 * in memory rather than via `datastore.query` SQL — robust regardless of the
 * physical type of the `id` primary key (no UUID/text cast to get wrong) and it
 * sidesteps RLS row-visibility modes. `datastore.query` remains available for
 * ad-hoc SQL when needed.
 */
export async function listPRsWithRisks(): Promise<PRWithRisks[]> {
  const [prs, risks] = await Promise.all([listPRs(), listRisks()]);
  const byPr = new Map<string, IdentifiedRisk[]>();
  for (const risk of risks) {
    const key = String(risk.pr_id);
    const bucket = byPr.get(key);
    if (bucket) bucket.push(risk);
    else byPr.set(key, [risk]);
  }
  return prs.map((pr) => ({ ...pr, risks: byPr.get(String(pr.id)) ?? [] }));
}

// ── Table provisioning (used by scripts/lemma-setup.ts) ─────────────────────
export async function listTableNames(): Promise<string[]> {
  const res = await lemma().tables.list({ limit: 200 });
  return ((res.items ?? []) as Array<{ name?: string }>).map((t) => t.name ?? "").filter(Boolean);
}

export async function createTable(payload: unknown): Promise<void> {
  // The JSON payloads use real default values; the generated `ColumnSchema.default`
  // type is narrowed to `null`, so cast at this boundary.
  await lemma().tables.create(payload as Parameters<LemmaClient["tables"]["create"]>[0]);
}

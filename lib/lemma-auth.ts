/**
 * lib/lemma-auth.ts — keep a Lemma access token fresh for the headless server.
 *
 * Lemma issues a short-lived (~1h) SuperTokens *access token* and a long-lived
 * (~100d) *refresh token*. `lemma auth login` stores both; the access token is
 * what the SDK sends as the bearer. Baking a static access token into env (the
 * old `LEMMA_TOKEN` approach) means the deployed app 401s the moment it expires.
 *
 * This module owns the token lifecycle instead:
 *   • caches the access token + its decoded `exp` in memory,
 *   • refreshes ~60s before expiry (and on demand) via the same endpoint the CLI
 *     uses — `POST {LEMMA_API_URL}/auth/cli/refresh` { refresh_token } — so the
 *     access token is always valid and the site never goes down on expiry,
 *   • proactively refreshes every 45 minutes in the background (via setInterval)
 *     so token renewal never waits for an incoming request,
 *   • retries transient refresh failures with exponential backoff (3 attempts),
 *   • on unrecoverable failure (token theft / session revoked), exits the process
 *     so Docker's --restart policy brings the container back with a fresh token,
 *   • survives refresh-token ROTATION: if a refresh returns a new refresh token
 *     it is persisted to a durable store so a container restart still has a live
 *     credential. This matters because Lemma/SuperTokens ROTATES the refresh
 *     token on every refresh and treats reuse of an already-rotated token as
 *     `token theft detected` — it then revokes the whole session family. So a
 *     restart that replays the stale env seed hard-fails with a 401 forever
 *     until you re-login. The store is pluggable (checked in priority order):
 *       - `LEMMA_SSM_REFRESH_PARAM` set → AWS SSM Parameter Store (SecureString):
 *         read the latest token on cold start, write the rotated one back. This
 *         is the production path on App Runner.
 *       - `LEMMA_REFRESH_TOKEN_FILE` set → a JSON file on a mounted volume. This
 *         is the path for a single Docker container on EC2 (no AWS SDK/IAM
 *         needed): mount a volume, point this at a file inside it, and rotated
 *         tokens survive `docker run`/recreate and image rebuilds.
 *       - otherwise → fall back to the `LEMMA_REFRESH_TOKEN` env var (fine for
 *         local dev and for tokens that don't rotate).
 *
 *     Both durable stores tag the persisted token with a fingerprint of the
 *     current env seed. On load, a stored token is trusted only if that
 *     fingerprint still matches — so re-running `lemma auth login` and updating
 *     `LEMMA_REFRESH_TOKEN` automatically supersedes a stale stored token
 *     instead of replaying it into another theft-detection lockout.
 *
 * Server-only — never import client-side (it would leak the refresh token).
 */

import { createHash } from "node:crypto";

const API_URL = process.env.LEMMA_API_URL ?? "https://api.lemma.work";
const REFRESH_PATH = "/auth/cli/refresh";
/** Refresh this many ms before the JWT `exp` to absorb clock skew + latency. */
const SKEW_MS = 60_000;

// ── in-memory token state (per server instance) ─────────────────────────────
let accessToken: string | null = process.env.LEMMA_TOKEN?.trim() || null;
let accessExpMs: number = accessToken ? decodeExpMs(accessToken) : 0;
let refreshToken: string | null = null;
let refreshTokenLoaded = false;
/** Dedupes concurrent refreshes into a single in-flight request. */
let inflight: Promise<void> | null = null;

/** ── health tracking (for /api/health + Docker HEALTHCHECK) ──────────────── */
let isHealthy = true;
let lastAuthError: string | null = null;
let consecutiveFailures = 0;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2_000;
/** Proactive refresh interval — 45 min, well before the 1h access token expiry. */
const PROACTIVE_REFRESH_MS = 45 * 60 * 1_000;
let proactiveTimer: ReturnType<typeof setInterval> | null = null;

/** Milliseconds-until-`exp` epoch from a JWT, or 0 if undecodable. */
function decodeExpMs(jwt: string): number {
  try {
    const seg = jwt.split(".")[1];
    if (!seg) return 0;
    const payload = JSON.parse(Buffer.from(seg, "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function accessTokenStale(): boolean {
  // exp === 0 means "couldn't decode" — treat as stale so we refresh rather than
  // ship a token we can't reason about (the refresh is cheap and deduped).
  return !accessToken || accessExpMs === 0 || Date.now() >= accessExpMs - SKEW_MS;
}

// ── durable refresh-token store (pluggable) ─────────────────────────────────
/**
 * Short fingerprint of the current `LEMMA_REFRESH_TOKEN` env seed. Persisted
 * alongside a rotated token so we can tell whether the operator has since
 * re-seeded (via `lemma auth login`). If they have, the stored token is stale
 * and must NOT be replayed — doing so re-triggers theft detection.
 */
function seedFingerprint(): string {
  const seed = process.env.LEMMA_REFRESH_TOKEN?.trim() || "";
  return createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

async function ssmGet(name: string): Promise<string | null> {
  const { SSMClient, GetParameterCommand } = await import("@aws-sdk/client-ssm");
  const client = new SSMClient({});
  const res = await client.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return res.Parameter?.Value?.trim() || null;
}

async function ssmPut(name: string, value: string): Promise<void> {
  const { SSMClient, PutParameterCommand } = await import("@aws-sdk/client-ssm");
  const client = new SSMClient({});
  await client.send(
    new PutParameterCommand({ Name: name, Value: value, Type: "SecureString", Overwrite: true }),
  );
}

/**
 * File store on a mounted volume. Envelope: `{ seed, token }`, where `seed` is
 * the fingerprint of the env seed the rotated `token` descends from. Returns the
 * token only when that fingerprint still matches the current env seed, so a
 * re-login (which changes `LEMMA_REFRESH_TOKEN`) transparently invalidates it.
 */
async function fileGet(): Promise<string | null> {
  const path = process.env.LEMMA_REFRESH_TOKEN_FILE?.trim();
  if (!path) return null;
  try {
    const { readFile } = await import("node:fs/promises");
    const parsed = JSON.parse(await readFile(path, "utf8")) as { seed?: string; token?: string };
    const token = parsed.token?.trim();
    if (token && parsed.seed === seedFingerprint()) return token;
    return null; // missing token, or stale (env re-seeded) → ignore.
  } catch {
    // File absent on first boot, or unreadable/corrupt — fall through to the
    // env seed so the very first boot can still authenticate.
    return null;
  }
}

/** Atomically write the rotated token + current seed fingerprint to the file. */
async function filePut(token: string): Promise<void> {
  const path = process.env.LEMMA_REFRESH_TOKEN_FILE?.trim();
  if (!path) return;
  try {
    const { writeFile, rename, mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify({ seed: seedFingerprint(), token }), { mode: 0o600 });
    await rename(tmp, path); // atomic swap — a crash can't leave a half-written file.
  } catch (error) {
    console.error(`[lemma-auth] refresh-token file write failed: ${(error as Error).message}`);
  }
}

/** Load the freshest refresh token: SSM → file → env seed (first hit wins). */
async function loadRefreshToken(): Promise<string | null> {
  const param = process.env.LEMMA_SSM_REFRESH_PARAM?.trim();
  if (param) {
    try {
      const fromSsm = await ssmGet(param);
      if (fromSsm) return fromSsm;
    } catch (error) {
      // Cold start with no param yet, or transient SSM error — fall through.
      console.error(`[lemma-auth] SSM read failed, trying file/env seed: ${(error as Error).message}`);
    }
  }
  const fromFile = await fileGet();
  if (fromFile) return fromFile;
  return process.env.LEMMA_REFRESH_TOKEN?.trim() || null;
}

/** Persist a rotated refresh token so the next cold start has a live credential. */
async function persistRefreshToken(token: string): Promise<void> {
  const param = process.env.LEMMA_SSM_REFRESH_PARAM?.trim();
  if (param) {
    try {
      await ssmPut(param, token);
      return;
    } catch (error) {
      // Don't fail the request — the in-memory token still works for this
      // instance's lifetime; only restart durability is at risk. Still try the
      // file store below as a fallback if one is configured.
      console.error(`[lemma-auth] SSM write failed (rotated token not persisted): ${(error as Error).message}`);
    }
  }
  await filePut(token); // no-op unless LEMMA_REFRESH_TOKEN_FILE is set.
}

// ── refresh ─────────────────────────────────────────────────────────────────
/**
 * Single refresh attempt with detailed logging. Separated from retry logic so
 * callers can distinguish transient from unrecoverable failures (token theft).
 */
async function refreshOnce(): Promise<void> {
  if (!refreshTokenLoaded) {
    refreshToken = await loadRefreshToken();
    refreshTokenLoaded = true;
    console.log(
      `[lemma-auth] refresh token loaded (len=${refreshToken?.length ?? 0}, ` +
        `source=${refreshToken ? (process.env.LEMMA_REFRESH_TOKEN_FILE ? "file/env" : "env") : "NONE"})`,
    );
  }
  if (!refreshToken) {
    throw new Error(
      "[lemma-auth] No refresh token available. Set LEMMA_REFRESH_TOKEN (from " +
        "`lemma auth login` — the refresh_token in ~/.lemma/config.json) or " +
        "LEMMA_SSM_REFRESH_PARAM. The legacy 1-hour LEMMA_TOKEN cannot self-renew.",
    );
  }

  const url = API_URL.replace(/\/$/, "") + REFRESH_PATH;
  console.log(`[lemma-auth] refreshing access token via ${url}`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[lemma-auth] refresh HTTP ${res.status}: ${body.slice(0, 400)}`);
    const err = new Error(`[lemma-auth] refresh failed (${res.status}): ${body.slice(0, 300)}`);
    // Tag unrecoverable errors so the retry wrapper can short-circuit.
    if (body.includes("token theft") || body.includes("INVALID_REFRESH_TOKEN")) {
      (err as any).unrecoverable = true;
    }
    throw err;
  }

  const data = (await res.json()) as Record<string, unknown>;
  console.log(`[lemma-auth] refresh response top-level keys: [${Object.keys(data).join(", ")}]`);

  // The CLI stores the session under the response root; tolerate a `session`
  // envelope and a few key spellings.
  const session = (typeof data.session === "object" && data.session
    ? (data.session as Record<string, unknown>)
    : data) as Record<string, unknown>;

  if (data.session && typeof data.session === "object") {
    console.log(`[lemma-auth] session envelope keys: [${Object.keys(session).join(", ")}]`);
  }

  const newAccess =
    (session.access_token as string) ??
    (session.token as string) ??
    (session.accessToken as string) ??
    null;
  // Search for the rotated refresh token in both the session envelope AND the
  // top-level response — covers all known Lemma/SuperTokens response shapes.
  const newRefresh =
    (session.refresh_token as string) ??
    (session.refreshToken as string) ??
    (data.refresh_token as string) ??
    (data.refreshToken as string) ??
    null;

  if (!newAccess) {
    throw new Error(`[lemma-auth] refresh response missing access token; keys=${Object.keys(data).join(",")}`);
  }

  accessToken = String(newAccess);
  accessExpMs = decodeExpMs(accessToken);
  console.log(`[lemma-auth] ✅ new access token — expires ${new Date(accessExpMs).toISOString()}`);

  if (newRefresh && newRefresh !== refreshToken) {
    console.log(
      `[lemma-auth] 🔄 refresh token ROTATED (old len=${refreshToken?.length}, ` +
        `new len=${newRefresh.length}) — persisting to durable store`,
    );
    refreshToken = String(newRefresh);
    await persistRefreshToken(refreshToken);
  } else if (!newRefresh) {
    // This is the likely ROOT CAUSE of the 1-hour crash: if Lemma rotates the
    // token server-side but the response doesn't include it under any key we
    // check, we keep using the old (now-dead) token and get "token theft" on
    // the next refresh.
    console.warn(
      `[lemma-auth] ⚠️  response did NOT include a new refresh token!\n` +
        `  → response keys: [${Object.keys(data).join(", ")}]\n` +
        `  → session keys: [${Object.keys(session).join(", ")}]\n` +
        `  → if Lemma rotated it server-side, the NEXT refresh will fail with token theft`,
    );
  } else {
    console.log("[lemma-auth] refresh token unchanged (no rotation this cycle)");
  }
}

/**
 * Refresh with retry + exponential backoff. Unrecoverable errors (token theft /
 * session revoked) short-circuit immediately and trigger process.exit(1) so
 * Docker's --restart policy brings the container back.
 */
async function refreshWithRetry(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await refreshOnce();
      // Success — reset health tracking.
      consecutiveFailures = 0;
      isHealthy = true;
      lastAuthError = null;
      return;
    } catch (error) {
      const msg = (error as Error).message ?? String(error);
      console.error(`[lemma-auth] refresh attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`);

      // Token theft / revoked session = unrecoverable within this process.
      // Exit so Docker's --restart policy brings us back with the latest
      // persisted token (or a manually-injected fresh one).
      if ((error as any).unrecoverable) {
        isHealthy = false;
        lastAuthError = msg;
        console.error(
          "\n[lemma-auth] ❌ SESSION REVOKED (token theft detected).\n" +
            "  The refresh token chain is broken — Lemma revoked the entire session.\n" +
            "  → Container will exit in 5 seconds for auto-restart.\n" +
            "  → If this keeps happening after restart, you need to re-login:\n" +
            "    1. On your local machine: run `lemma auth login`\n" +
            "    2. Then run: ./scripts/recover-token.sh <EC2_IP>\n",
        );
        setTimeout(() => process.exit(1), 5_000);
        throw error;
      }

      // Transient failure — retry with backoff (unless last attempt).
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
        console.log(`[lemma-auth] ⏳ retrying in ${delay}ms …`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  // All retries exhausted — track but don't exit (might be transient).
  consecutiveFailures++;
  lastAuthError = `refresh failed after ${MAX_RETRIES} attempts`;
  isHealthy = consecutiveFailures < 3; // tolerate a few transient blips
  throw new Error(`[lemma-auth] ${lastAuthError} (consecutive failures: ${consecutiveFailures})`);
}

/**
 * Start a proactive background refresh that fires every 45 minutes — well
 * before the 1-hour access token expiry. This means token renewal never waits
 * for an incoming request; the token is always fresh when a request arrives.
 */
function startProactiveRefresh(): void {
  if (proactiveTimer) return;
  console.log("[lemma-auth] 🔁 proactive background refresh started (every 45 min)");
  proactiveTimer = setInterval(async () => {
    try {
      console.log("[lemma-auth] ⏰ proactive refresh triggered");
      if (!inflight) {
        inflight = refreshWithRetry().finally(() => {
          inflight = null;
        });
      }
      await inflight;
      console.log(
        `[lemma-auth] ✅ proactive refresh OK — next expiry: ${new Date(accessExpMs).toISOString()}`,
      );
    } catch (error) {
      // Don't crash here — health tracking + process.exit for token theft is
      // already handled inside refreshWithRetry().
      console.error(`[lemma-auth] ⚠️ proactive refresh failed: ${(error as Error).message}`);
    }
  }, PROACTIVE_REFRESH_MS);
  // Don't keep the process alive just for this timer.
  if (typeof proactiveTimer === "object" && proactiveTimer && "unref" in proactiveTimer) {
    (proactiveTimer as NodeJS.Timeout).unref();
  }
}

// ── public API ──────────────────────────────────────────────────────────────
/** Ensure a non-expired access token, refreshing if needed. Returns it. */
export async function ensureAccessToken(): Promise<string> {
  if (!accessTokenStale()) return accessToken as string;
  if (!inflight) inflight = refreshWithRetry().finally(() => { inflight = null; });
  await inflight;
  startProactiveRefresh();
  return accessToken as string;
}

/**
 * The current cached access token, read synchronously by the SDK's auth shim.
 * Always call `ensureAccessToken()` (which `lemma()` does) before the SDK reads
 * this, so it returns a fresh value.
 */
export function currentAccessToken(): string {
  return accessToken ?? "";
}

/** Force a refresh regardless of expiry (e.g. recovering from a 401). */
export async function forceRefresh(): Promise<string> {
  if (!inflight) inflight = refreshWithRetry().finally(() => { inflight = null; });
  await inflight;
  return accessToken as string;
}

/** Non-throwing view of whether we *can* authenticate (for status indicators). */
export function authConfigured(): boolean {
  return Boolean(
    process.env.LEMMA_TOKEN ||
      process.env.LEMMA_REFRESH_TOKEN ||
      process.env.LEMMA_REFRESH_TOKEN_FILE ||
      process.env.LEMMA_SSM_REFRESH_PARAM,
  );
}

/** Health snapshot for the /api/health endpoint and Docker HEALTHCHECK. */
export function getAuthHealth(): {
  healthy: boolean;
  lastError: string | null;
  consecutiveFailures: number;
  accessTokenExpiry: string | null;
  hasRefreshToken: boolean;
} {
  return {
    healthy: isHealthy,
    lastError: lastAuthError,
    consecutiveFailures,
    accessTokenExpiry: accessExpMs ? new Date(accessExpMs).toISOString() : null,
    hasRefreshToken: Boolean(refreshToken),
  };
}

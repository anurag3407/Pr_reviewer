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
 *   • survives refresh-token ROTATION: if a refresh returns a new refresh token
 *     it is persisted to a durable store so a container restart still has a live
 *     credential. The store is pluggable:
 *       - `LEMMA_SSM_REFRESH_PARAM` set → AWS SSM Parameter Store (SecureString):
 *         read the latest token on cold start, write the rotated one back. This
 *         is the production path on App Runner.
 *       - otherwise → fall back to the `LEMMA_REFRESH_TOKEN` env var (fine for
 *         local dev and for tokens that don't rotate).
 *
 * Server-only — never import client-side (it would leak the refresh token).
 */

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

/** Load the freshest refresh token: SSM if configured, else the env seed. */
async function loadRefreshToken(): Promise<string | null> {
  const param = process.env.LEMMA_SSM_REFRESH_PARAM?.trim();
  if (param) {
    try {
      const fromSsm = await ssmGet(param);
      if (fromSsm) return fromSsm;
    } catch (error) {
      // Cold start with no param yet, or transient SSM error — fall through to
      // the env seed so the very first boot can still authenticate.
      console.error(`[lemma-auth] SSM read failed, using env seed: ${(error as Error).message}`);
    }
  }
  return process.env.LEMMA_REFRESH_TOKEN?.trim() || null;
}

/** Persist a rotated refresh token so the next cold start has a live credential. */
async function persistRefreshToken(token: string): Promise<void> {
  const param = process.env.LEMMA_SSM_REFRESH_PARAM?.trim();
  if (!param) return; // env-only mode: nothing durable to write to.
  try {
    await ssmPut(param, token);
  } catch (error) {
    // Don't fail the request — the in-memory token still works for this
    // instance's lifetime; only restart durability is at risk.
    console.error(`[lemma-auth] SSM write failed (rotated token not persisted): ${(error as Error).message}`);
  }
}

// ── refresh ─────────────────────────────────────────────────────────────────
async function refresh(): Promise<void> {
  if (!refreshTokenLoaded) {
    refreshToken = await loadRefreshToken();
    refreshTokenLoaded = true;
  }
  if (!refreshToken) {
    throw new Error(
      "[lemma-auth] No refresh token available. Set LEMMA_REFRESH_TOKEN (from " +
        "`lemma auth login` — the refresh_token in ~/.lemma/config.json) or " +
        "LEMMA_SSM_REFRESH_PARAM. The legacy 1-hour LEMMA_TOKEN cannot self-renew.",
    );
  }

  const url = API_URL.replace(/\/$/, "") + REFRESH_PATH;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[lemma-auth] refresh failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  // The CLI stores the session under the response root; tolerate a `session`
  // envelope and a few key spellings.
  const session = (typeof data.session === "object" && data.session
    ? (data.session as Record<string, unknown>)
    : data) as Record<string, unknown>;
  const newAccess =
    (session.access_token as string) ??
    (session.token as string) ??
    (session.accessToken as string) ??
    null;
  const newRefresh =
    (session.refresh_token as string) ?? (session.refreshToken as string) ?? null;

  if (!newAccess) {
    throw new Error(`[lemma-auth] refresh response missing access token; keys=${Object.keys(data).join(",")}`);
  }

  accessToken = String(newAccess);
  accessExpMs = decodeExpMs(accessToken);
  if (newRefresh && newRefresh !== refreshToken) {
    refreshToken = String(newRefresh);
    await persistRefreshToken(refreshToken);
  }
}

// ── public API ──────────────────────────────────────────────────────────────
/** Ensure a non-expired access token, refreshing if needed. Returns it. */
export async function ensureAccessToken(): Promise<string> {
  if (!accessTokenStale()) return accessToken as string;
  if (!inflight) inflight = refresh().finally(() => { inflight = null; });
  await inflight;
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
  if (!inflight) inflight = refresh().finally(() => { inflight = null; });
  await inflight;
  return accessToken as string;
}

/** Non-throwing view of whether we *can* authenticate (for status indicators). */
export function authConfigured(): boolean {
  return Boolean(
    process.env.LEMMA_TOKEN ||
      process.env.LEMMA_REFRESH_TOKEN ||
      process.env.LEMMA_SSM_REFRESH_PARAM,
  );
}

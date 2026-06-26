# Autoheal — AI PR Review & Release-Readiness Assistant

A closed-loop, state-driven **auto-healing PR assistant**. When a PR arrives the
system tests it; if it fails it diagnoses the risks, generates a fix, pushes it,
and retries — up to **5 times** — then escalates to a human. Four pillars:

- **Lemma** — state memory (a live PostgreSQL-backed pod; the source of truth).
- **Tester** — pluggable runner: deterministic mock · `npm test` · real TestSprite.
- **Orchestrator** — the `while (retry_count < 5)` loop, in Node.
- **Operator console** — a Next.js dashboard (dark, instrument-grade) with a
  threat grid, a retry vital-sign, and a human approval gate.

```
GitHub PR ──webhook──▶ /api/webhooks/github ──create row──▶ Lemma pod (pull_requests)
                              │
                              ▼  void runHealingLoop(prId)   (fire-and-forget)
                    ┌───────────────────────────────────────────┐
                    │ ORCHESTRATOR  while (retry_count < 5)      │
                    │  1. TESTING  → runTests()  mock|npm|TS     │
                    │  2. pass?    → READY_FOR_MERGE, stop       │
                    │  3. fail     → write identified_risks,     │
                    │                generateFix() (Claude),     │
                    │                pushFix() (mock), retry++    │
                    │  4. hit 5?   → AWAITING_HUMAN_APPROVAL      │
                    └───────────────────────────────────────────┘
                              │ (every transition persisted)
                              ▼
   Operator console ◀─ poll /api/prs ─ route handlers ─ LemmaClient (server, LEMMA_TOKEN)
```

## Quick start

```bash
npm install

# 1. Point at a live Lemma pod (the state layer — required).
cp .env.example .env.local           # fill LEMMA_POD_ID + LEMMA_TOKEN
#   token:  lemma auth login   (or a service token)
#   pod:    lemma pod create pr-healing-pod   → its id

# 2. Create the two tables in the pod (idempotent).
npm run lemma:setup

# 3. Run it.
npm run dev                          # http://localhost:3000

# 4. Drive a full demo (no GitHub needed): mock runner fails twice, then passes.
npm run simulate
#   watch the console:  TESTING → HEALING (1/5, 2/5) → READY_FOR_MERGE

# Demo the human gate (force every attempt to fail):
FORCE_FAIL=1 npm run dev             # in one terminal
npm run simulate                     # in another → reaches 5/5 → AWAITING_HUMAN_APPROVAL
#   then click "Approve release" on the card.
```

## Real GitHub PRs (v2)

The mock/`simulate` path needs zero GitHub setup. To review **real** PRs, get a
token and pick one of two delivery models. The seam is `lib/github.ts`
(`fetchPRContext` / `postPRComment`); `GITHUB_MODE=mock` (or no token) reads
`fixtures/sample-pr.json` so everything still runs offline.

**1. Create a token.** A fine-grained PAT at
<https://github.com/settings/personal-access-tokens> with **Pull requests:
Read+Write** and **Contents: Read** on the target repo. Put it in `.env.local`:

```bash
GITHUB_MODE=real
GITHUB_TOKEN=github_pat_xxx
```

**2a. On-demand (pull model — easiest, no tunnel).** Just POST a PR:

```bash
curl -X POST http://localhost:3000/api/review \
  -H 'content-type: application/json' \
  -d '{"url":"https://github.com/owner/name/pull/42"}'
# or: -d '{"repo":"owner/name","number":42}'
```

The app fetches the live diff + files + commits, records the PR, and starts
processing. Watch the dashboard.

**2b. Webhook (push model — auto on every PR).** Expose localhost and register a
webhook so opening/syncing a PR triggers a review:

```bash
# expose localhost (no signup):
npx smee-client --url https://smee.io/<your-channel> \
  --target http://localhost:3000/api/webhooks/github
```

Then in the repo: **Settings → Webhooks → Add webhook** → Payload URL = your
smee URL, Content type = `application/json`, Secret = `GITHUB_WEBHOOK_SECRET`
(set the same value in `.env.local`), events = **Pull requests**. The webhook
verifies the HMAC, fetches the real diff, and launches the loop.

## How state lives in Lemma

Two tables (schemas in `lemma/tables/*.json`, mirrored in `lib/types.ts`):

- **`pull_requests`** — one row per PR: `status`, `retry_count`, `last_error`, …
- **`identified_risks`** — one row per surfaced risk: `severity`, `category`,
  `recommended_fix`, `pr_id` (join key), …

`lib/lemma.ts` is the only module that talks to the pod. It uses the official
`lemma-sdk` `LemmaClient`, with one twist worth knowing:

> **Server-side auth.** `lemma-sdk` only injects a bearer token from the browser
> (`localStorage`); in Node it expects cookie auth. There's no `token` config
> field. So `lib/lemma.ts` subclasses the SDK's `AuthManager` to force
> "token mode" (`isTokenMode → true`, `getBearerToken → LEMMA_TOKEN`), which is
> exactly what the SDK's request layer reads. Also: the SDK pulls in
> `supertokens-web-js`, whose subpath uses directory imports that **raw Node ESM
> rejects** — fine under a bundler, so `next.config.mjs` deliberately *bundles*
> `lemma-sdk` (rather than externalizing it) and the scripts run under `tsx`.

The dashboard never holds the token: it polls server **route handlers**
(`/api/prs`, `/api/prs/[id]/approve|reject|rerun`) that read/write the pod.

## Configuration

| var | default | meaning |
|---|---|---|
| `LEMMA_POD_ID`, `LEMMA_TOKEN` | — | **required** — the live pod + bearer token |
| `LEMMA_API_URL`, `LEMMA_AUTH_URL` | `api.lemma.work`, `lemma.work/auth` | pod endpoints |
| `TEST_RUNNER` | `mock` | `mock` · `npm` · `testsprite` |
| `FORCE_FAIL` | `0` | mock runner fails every attempt (demo the gate) |
| `TESTSPRITE_API_KEY`, `TESTSPRITE_TEST_ID` | — | real TestSprite path (needs a public preview URL) |
| `ANTHROPIC_API_KEY` | — | unset → fixer uses a deterministic mock |
| `FIXER_MODEL` | `claude-opus-4-8` | Claude model for fix generation |
| `GITHUB_MODE` | `mock` | `real` · `mock` (mock reads `fixtures/sample-pr.json`) |
| `GITHUB_TOKEN` | — | fine-grained PAT (PRs r/w, Contents r) for real ingestion |
| `GITHUB_WEBHOOK_SECRET` | — | verifies the inbound HMAC when set |
| `SLACK_WEBHOOK_URL` | — | optional outbound review notification |
| `GIT_MODE` | `mock` | legacy v1 auto-heal push (`mock` · `real`) |
| `LOOP_STEP_DELAY_MS` | `1200` | pause between heals so transitions are visible |

## The three pluggable adapters

- **Tester** (`lib/tester.ts`) — `mock` scripts a fail→fail→pass arc; `npm` runs
  `npm test` and maps a non-zero exit to a `TEST_FAILURE`; `testsprite` runs the
  real CLI (`test run … --wait`, then `test failure get`) against a public URL.
- **Fixer** (`lib/fixer.ts`) — Claude (`claude-opus-4-8`) turns risks into a
  proposed diff; falls back to a deterministic mock when no API key (or on error).
- **Git** (`lib/git.ts`) — mock by default (logs a fake sha, per the brief);
  `real` commits to a *separate* checkout via `simple-git`, never this repo.

## Verification

- `npm run build` — compiles clean (lemma-sdk bundles under webpack).
- Loop mechanics (mock backends, no pod needed): the arc is
  `heal#1 → heal#2 → READY_FOR_MERGE on attempt 3`; with `FORCE_FAIL=1` it
  walks five heals to `AWAITING_HUMAN_APPROVAL`.
- With a live pod: `npm run lemma:setup` then
  `lemma table list --pod-id <id>` shows both tables; `npm run simulate` walks a
  PR through the states and populates the threat grid.

## Caveats

- **Live pod required.** State is the pod only (no local DB fallback). Without
  `LEMMA_TOKEN`/`LEMMA_POD_ID` the app boots and the console shows a clear
  "no pod" banner, but nothing persists.
- **Fire-and-forget webhook** survives under `next dev` / a long-running Node
  host; serverless platforms may cut off background work mid-loop.
- **TestSprite** rejects localhost — the real path needs a public preview URL,
  which is why `mock` is the default runner.

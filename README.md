# Autoheal — multi-tenant AI PR review (self-healing)

Connect a GitHub repo. On every pull request, Autoheal reviews the diff **with
full-codebase context**, ranks each finding by severity, gives the PR one clear
**flag**, lets you **chat** to a fix, and can **commit the fix and re-scan until
the flag is SAFE**. Built to be higher-signal than diff-only review bots.

- **Auth** — Clerk (multi-tenant; every row scoped by the Clerk user id).
- **Repo access** — a GitHub App (real-time PR webhooks, bot identity).
- **Model** — MiMo-V2.5-Pro via Bynara (OpenAI-compatible, ~1M-token context).
- **State** — a live PostgreSQL-backed Lemma pod (the source of truth).

```
landing ─Clerk─▶ /dashboard ─install GitHub App─▶ projects (repo + watched branches)
                                                         │
GitHub PR ─webhook(HMAC)─▶ /api/webhooks/github ─ map repo+installation → owner ─▶ reviews row
                                                         │ void runReviewLoop()
        ┌────────────────────────────────────────────────────────────────┐
        │ gatherContext: diff + FULL changed files + 1-hop imports + map   │
        │ → MiMo structured review → flag + findings(file:line, severity,  │
        │   suggested fix) persisted to the Lemma pod                      │
        └────────────────────────────────────────────────────────────────┘
                                                         │
   /dashboard/reviews/[id] ◀─ poll ─ route handlers ─ Lemma (owner-scoped)
     flag · findings · chat · "Fix with PR"
                                                         │ void runFixLoop()
        ┌────────────────────────────────────────────────────────────────┐
        │ while flag≠SAFE and iter<MAX: generate whole-file edits →        │
        │ commit to head branch (Git Data API) → re-scan                  │
        └────────────────────────────────────────────────────────────────┘
```

## Setup

```bash
npm install
cp .env.example .env.local      # then fill it in (see below)
```

**1. Lemma (state).** `lemma auth login` (on Linux/macOS) writes a `refresh_token`
to `~/.lemma/config.json`; put it in `.env.local` as `LEMMA_REFRESH_TOKEN`. The
server self-renews the 1-hour access token from it (see `lib/lemma-auth.ts`), so
you no longer re-run login when reviews stall. `lemma pod create` gives the pod
id (`LEMMA_POD_ID`). Then provision the tables (idempotent, additive):

```bash
node --env-file=.env.local --import tsx scripts/lemma-setup.ts   # or: npm run lemma:setup
```

**2. Model.** `BYNARA_API_KEY` (MiMo). An `ANTHROPIC_API_KEY` fallback is used
only if Bynara is unset.

**3. Clerk (auth).** Dev works in **keyless** mode automatically (keys in
`.clerk/.tmp`). For production, claim the app and set
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`.

**4. GitHub App (repo access).** Register one at
**github.com/settings/apps/new**:

- **Permissions:** Pull requests *Read & write*, Contents *Read & write*,
  Metadata *Read*.
- **Subscribe to events:** *Pull request*, *Installation*.
- **Webhook URL:** `<APP_URL>/api/webhooks/github` — for local dev forward it with
  a free tunnel: `npx smee-client --url https://smee.io/<id> --target http://localhost:3000/api/webhooks/github`.
- **Setup URL:** `<APP_URL>/api/github/setup` (where users land after installing).
- Generate a **private key** and a **webhook secret**.

Put `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_CLIENT_ID/SECRET`,
`GITHUB_APP_SLUG`, `GITHUB_WEBHOOK_SECRET` in `.env.local`.

```bash
npm run dev                     # http://localhost:3000  (may pick another port if busy)
```

## Using it

1. Sign up → **Dashboard** → **Projects** → **Install GitHub App** on a repo.
2. The repo appears as a project; pick which **base branches** to watch (empty =
   all), toggle auto-review.
3. Open a PR on a watched branch → a review appears, walks `REVIEWING → {flag}`,
   with findings (file:line, severity, suggested fix) and a **threat grid**.
4. **Chat** about the PR or a specific finding ("why is this happening", "give me
   a better approach"); a converged fix is saved back to the finding.
5. **Fix with PR** → Autoheal commits whole-file fixes to the head branch and
   re-scans until the flag is `SAFE` (or it spends `MAX_FIX_ITERS` and asks for a
   human).

**Trigger a review without a live webhook** (point at a connected repo + open PR):

```bash
SIM_REPO=owner/name SIM_INSTALLATION_ID=12345678 SIM_PR_NUMBER=42 \
  node --env-file=.env.local --import tsx scripts/simulate-pr.ts
```

## Data model

Four `owner_id`-scoped tables (schemas in `lemma/tables/*.json`, mirrored in
`lib/types.ts`): **`projects`** (connected repos + watched branches),
**`reviews`** (one per PR: `flag`, `scan_count`, `summary`, `head_sha`),
**`findings`** (per-line: severity, category, suggested_fix, confidence),
**`chat_messages`**.

`lib/lemma.ts` is the only module that talks to the pod. It forces the SDK into
headless bearer-token mode by subclassing `AuthManager` (the SDK only reads a
browser token otherwise), and `next.config.mjs` deliberately **bundles**
`lemma-sdk` so its `supertokens-web-js` directory imports resolve.

## Accuracy: how context is built

`lib/context.ts` packs, to a token budget (`CONTEXT_TOKEN_BUDGET`, ~1M available):
PR metadata → unified diff → **full line-numbered content of changed files** →
their **first-order local imports** → a **repo map**. Seeing the change *in situ*
(not just the hunk) is what lets the review catch issues a diff-only pass misses.
The review prompt (`lib/prompts.ts`) is tuned for **precision** — a few true,
material findings over noise.

## Configuration (`.env.local`)

See `.env.example` for the full list. Key knobs: `REVIEW_MODEL`
(`mimo-v2.5-pro-free`), `CONTEXT_TOKEN_BUDGET` (300k), `MAX_FIX_ITERS` (4),
`POST_GITHUB_REVIEWS` (set to `1` to also post findings as native PR comments).

## Notes

- **Lemma auth self-renews** — the 1-hour access token is refreshed automatically
  from `LEMMA_REFRESH_TOKEN` (`lib/lemma-auth.ts`), so the server doesn't 401 on
  expiry. For a long-running deploy where the refresh token may rotate, set
  `LEMMA_SSM_REFRESH_PARAM` to an AWS SSM Parameter Store name so the rotated
  token is persisted and reloaded across restarts.
- **Fire-and-forget** review/fix loops need a long-running Node host (App Runner /
  Fargate / EC2 — **not** Lambda or Amplify, which cut off background work after
  the HTTP response).
- Fixes commit to the contributor's **head branch** (a deliberate choice so the
  same PR re-scans to SAFE); the commit is attributed to the GitHub App bot.

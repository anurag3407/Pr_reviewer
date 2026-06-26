# AI PR Review & Release-Readiness Assistant — Implementation Plan **v2**

> **What changed from v1:** v1 was an *auto-healing* PR loop (test → fix → retry ×5). v2 refocuses on the actual challenge: a **PR Review & Release-Readiness Assistant** that (1) reviews PR context, (2) checks a release checklist, (3) flags risks, (4) prepares a test plan, (5) writes release notes. v1 is preserved in git history.
>
> **Two strategic decisions locked with the team:**
> 1. **Build the brains in Node first** (the team is fluent in Node; the Lemma SDK is new), then **port to Lemma in a scheduled Week-1→Week-2 milestone** — *not* "someday". The port is mechanical because every movable piece sits behind a fixed function signature (a "seam", below).
> 2. **Real GitHub PRs** as input (not just the `simulate-pr.ts` script).
>
> **Why the seam matters:** the hackathon scores *meaningful Lemma usage*. "Lemma as just a database" scores low. The end state runs the agents + orchestration + integrations **inside Lemma**. Phase 1 is a stepping stone, not the destination.

---

## The product in one paragraph

A real GitHub PR is opened → our app ingests the **diff, changed files, and commits** → four AI reviewers analyze it in parallel: a **risk-reviewer** flags bugs/security/compliance risks, a **release-auditor** scores a release checklist (tests? docs? migrations? breaking changes?), a **test-planner** drafts a test plan, and a **notes-writer** drafts release notes. The results land in a **state store** and render on an operator **dashboard**. A human reviews, edits, and **approves** → the app posts the review back as a **GitHub PR comment** and a **Slack** message. Everything observable, every step persisted.

---

## Architecture (target / end state)

```
Real GitHub PR ──(Phase1: webhook + Octokit  │  Phase2: Lemma GitHub connector trigger)──▶
                                                   ORCHESTRATION  (Phase1: Node sequence │ Phase2: Lemma workflow graph)
   ┌─────────────────────────────────────────────────────────────────────────────────────┐
   │ 1. fetch_pr      → real diff + files + commits                                         │
   │ 2. store_context → diff saved (Phase1: table/text │ Phase2: Lemma doc store)           │
   │ 3. flag_risks    → AGENT risk-reviewer    → identified_risks rows                      │
   │ 4. run_checklist → AGENT release-auditor  → checklist_items rows + readiness score     │
   │ 5. test_plan     → AGENT test-planner     → test_plan document                         │
   │ 6. release_notes → AGENT notes-writer     → release_notes document                     │
   │ 7. HUMAN GATE    → operator approves/edits (Phase1: approve route │ Phase2: workflow FORM wait) │
   │ 8. publish       → GitHub PR comment + Slack (Phase1: Octokit/webhook │ Phase2: connectors) │
   └─────────────────────────────────────────────────────────────────────────────────────┘
                                          │ all state in the Lemma pod
                                          ▼
                          Next.js dashboard — Review · Checklist · Test Plan · Release Notes · Approve
```

State of truth is **always the live Lemma pod** (datastore + doc store). Only the *orchestration and AI execution* migrate from Node into Lemma between phases.

---

## The seams (this is what makes the Lemma port a 1-file swap)

Every piece we intend to move into Lemma is built behind a fixed signature. Phase 2 swaps the **body**, never the callers.

```ts
// lib/github.ts  — GitHub I/O
fetchPRContext(repo: string, prNumber: number): Promise<PullRequestContext>
postPRComment(repo: string, prNumber: number, body: string): Promise<void>
//   Phase1 body: GitHub REST via fetch + GITHUB_TOKEN
//   Phase2 body: client.connectors.operations.execute(GitHub op)

// lib/agents/*.ts  — the four AI reviewers (one file each, same shape)
reviewRisks(ctx: PullRequestContext): Promise<NewRisk[]>
auditChecklist(ctx: PullRequestContext): Promise<NewChecklistItem[]>
planTests(ctx: PullRequestContext, risks: NewRisk[]): Promise<TestPlan>
writeNotes(ctx: PullRequestContext): Promise<ReleaseNotes>
//   Phase1 body: @anthropic-ai/sdk call (like the old fixer.ts)
//   Phase2 body: client.agents.run("<agent-name>", prompt) → read conversation reply

// lib/orchestrator.ts  — the review pipeline
runReview(prId: string): Promise<void>
//   Phase1 body: a Node async sequence calling the seams above
//   Phase2 body: client.workflows.runs.create("review-pr")

// lib/notify.ts  — outbound (Slack etc.)
notifyReview(pr: PullRequest, summary: string): Promise<void>
//   Phase1 body: Slack incoming webhook  │  Phase2 body: Slack connector op
```

**Rule:** callers (routes, dashboard) only ever import these signatures. If a teammate is tempted to call the Anthropic SDK or Octokit directly from a route, that's a seam violation — route it through `lib/`.

---

## Verified Lemma SDK ground truth (Phase 2 — do not invent past this)

Confirmed from the installed `lemma-sdk@0.5.2` type definitions:

```ts
// Agents — client.agents
agents.create(payload: CreateAgentRequest)        // define an agent once (name, instructions, model, tools)
agents.run(name, message, { stream?, title? })    // ASYNC: opens a conversation, returns it
//   read the reply: client.conversations.messages.list(conv.id)
//   final answer = last message where kind==="text" && metadata.is_final_answer===true

// Workflows — client.workflows
workflows.create(payload) ; workflows.graph.update(name, graph)
workflows.runs.create(name)        // runs take NO inputs; a starting FORM makes the run WAIT
workflows.runs.submitForm(runId, payload)   // ← native human-in-the-loop (the approval gate!)
workflows.runs.get / list / cancel / visualize

// Connectors — client.connectors  (GitHub + Slack live here; Composio-backed, org-scoped)
connectors.enableApp(orgId, connectorId, opts) ; connectors.createConnectRequest(orgId, input)
connectors.operations.execute(scope, opName, payload, accountId?)
connectors.triggers.list/get(scope)          // a real GitHub PR event can trigger a workflow

// Already in use (Phase 1): client.records.* (CRUD), client.tables.* , client.datastore.query
// Doc store for diffs/plans/notes: client.files.*
```

**React (frontend, both phases):** `lemma-sdk/react` hooks — `useLiveRecords` (WebSocket live rows, replaces polling), `useRecords`, `useWorkflowRun`, `useWorkflowResume` (the approval form), `useRecordForm`.

---

## State model (datastore tables + doc store)

Keep the two existing tables, extend statuses, add two tables. Diffs/plans/notes go to the **doc store** (Phase 2) or a `text`/JSON column (Phase 1).

**`pull_requests`** (extend): add `base_branch`, `readiness_score` (INTEGER 0–100), `diff_ref` (doc id or inline). New statuses: `PENDING · REVIEWING · AWAITING_SIGNOFF · APPROVED · CHANGES_REQUESTED · PUBLISHED`.

**`identified_risks`** (keep as-is): severity × category × title × detail × recommended_fix × source × status.

**`checklist_items`** (new): `pr_id`, `key` (e.g. `tests_present`, `docs_updated`, `migrations_safe`, `breaking_changes`, `secrets_clean`), `label`, `status` (`PASS·FAIL·WARN·NA`), `detail`.

**`review_artifacts`** (new): `pr_id`, `kind` (`TEST_PLAN·RELEASE_NOTES`), `content` (markdown), `model`.

---

## File manifest — keep / change / add / delete

| File | v2 action |
|---|---|
| `lib/lemma.ts` | **Keep + extend** — reuse the `TokenAuth` shim; add accessors for `checklist_items`, `review_artifacts`; (Phase 2) add `agents`/`workflows`/`connectors`/`files` wrappers. |
| `lib/types.ts` | **Extend** — new statuses, `ChecklistItem`, `TestPlan`, `ReleaseNotes`, `PullRequestContext`. |
| `lib/github.ts` | **NEW (Phase 1, this PR)** — real PR context fetch + comment, mock fallback. *(Replaces the deleted `git.ts` role.)* |
| `lib/agents/risk-reviewer.ts` | **NEW** — `reviewRisks()` (Anthropic now → Lemma agent later). |
| `lib/agents/release-auditor.ts` | **NEW** — `auditChecklist()`. |
| `lib/agents/test-planner.ts` | **NEW** — `planTests()`. |
| `lib/agents/notes-writer.ts` | **NEW** — `writeNotes()`. |
| `lib/notify.ts` | **NEW** — `notifyReview()` (Slack). |
| `lib/orchestrator.ts` | **Rewrite** — `runReview()` sequence (the `while`-loop healing logic retired; healing becomes an optional bonus mode later). |
| `lib/fixer.ts` | **Retire** — logic folds into `lib/agents/*` behind the new seams. |
| `lib/git.ts` | **Delete** — replaced by `lib/github.ts`. |
| `lib/tester.ts` | **Keep (optional)** — `npm` runner becomes one checklist signal ("tests pass?"); not the headline. |
| `app/api/webhooks/github/route.ts` | **Change** — fetch real diff via `fetchPRContext`, launch `runReview`. |
| `app/api/prs/route.ts` | **Change** — return PR + risks + checklist + artifacts. |
| `app/api/prs/[id]/{approve,reject,rerun}` | **Repurpose** — approve → `APPROVED` + publish; reject → `CHANGES_REQUESTED`; rerun → re-review. |
| `app/page.tsx` + components | **Expand** — Review report, Checklist+score, Test Plan, Release Notes, Approve form. |
| `scripts/simulate-pr.ts` | **Keep** — offline demo driver (now feeds a realistic fixture diff). |

---

## Phasing & the 3-person split (2-week window)

| Member | Phase 1 (Week 1, Node) | Phase 2 (Week 2, Lemma port) |
|---|---|---|
| **Agentic AI + Lemma** | Build the 4 agents behind their seams using `@anthropic-ai/sdk`; tune prompts on real diffs. | `agents.create` the 4 agents; swap each seam body to `agents.run`; assemble the `review-pr` **workflow graph** + the **FORM** approval gate. |
| **Database + AWS** | Extend tables (`checklist_items`, `review_artifacts`); wire `lib/github.ts` real fetch; deploy on **App Runner / ECS Fargate / EC2** (*not* Lambda in Phase 1 — Node background work). | Move diffs/plans/notes to the **doc store**; connect **GitHub + Slack connectors** (`enableApp`/`createConnectRequest`); connector **trigger** on real PRs. |
| **Frontend** | Review/Checklist/Test-Plan/Notes views off the tables (poll `/api/prs`). | Switch to `lemma-sdk/react` `useLiveRecords`; build the approval form with `useWorkflowResume`/`<WorkflowForm>`. |

**Week-1 exit checklist (the migration gate):** every movable piece sits behind its seam signature; a real GitHub PR drives a full review end-to-end in Node; tables + dashboard show risks/checklist/plan/notes; human approve posts a GitHub comment. Then Phase 2 is "swap bodies", not "rewrite".

---

## Real GitHub PR setup (Phase 1 — what we build now)

**Auth:** a GitHub **Personal Access Token** (fine-grained, repo: Pull requests read+write, Contents read). Env `GITHUB_TOKEN`. (Phase 2: a GitHub connector account instead.)

**Two ways a real PR reaches us:**
1. **Webhook (push model):** add a repo webhook → `https://<public-url>/api/webhooks/github`, event = *Pull requests*, secret = `GITHUB_WEBHOOK_SECRET`. Locally, expose `localhost:3000` with a tunnel — **smee.io** (no signup) or **cloudflared/ngrok**.
2. **On-demand (pull model):** paste a PR URL in the dashboard → `POST /api/review` → `fetchPRContext` fetches it live. (No webhook needed; great for the demo.)

**What `fetchPRContext` pulls (GitHub REST):**
- `GET /repos/{owner}/{repo}/pulls/{n}` with `Accept: application/vnd.github.v3.diff` → unified diff
- `GET /repos/{owner}/{repo}/pulls/{n}/files` → per-file additions/deletions/patch
- `GET /repos/{owner}/{repo}/pulls/{n}/commits` → commit messages (for release notes)

**Mock fallback:** `GITHUB_MODE=mock` (or no token) → read `fixtures/sample-pr.json` so the loop still runs offline. `GITHUB_MODE=real` (default when `GITHUB_TOKEN` is set).

---

## Env (`.env.local` additions)

```
# ── GitHub (Phase 1: real PR ingestion) ──
GITHUB_MODE=real                 # real | mock
GITHUB_TOKEN=ghp_xxx             # fine-grained PAT: PRs r/w, Contents r
GITHUB_WEBHOOK_SECRET=           # set the same value in the repo webhook
# ── Outbound notify (optional) ──
SLACK_WEBHOOK_URL=
# ── Agents (Phase 1) ──
ANTHROPIC_API_KEY=               # unset → agents return deterministic mock output
FIXER_MODEL=claude-opus-4-8
```

---

## Runbook

```powershell
# offline (mock) — still works with zero GitHub setup
npm run dev
npm run simulate                 # feeds a realistic fixture PR

# real GitHub, on-demand (no webhook)
#   set GITHUB_TOKEN in .env.local, then from the dashboard paste a PR URL,
#   or:  curl -X POST localhost:3000/api/review -d '{"repo":"owner/name","number":42}'

# real GitHub, webhook (push)
npx smee-client --url https://smee.io/<channel> --target http://localhost:3000/api/webhooks/github
#   add the smee URL as the repo webhook (event: Pull requests, secret: GITHUB_WEBHOOK_SECRET)
#   open/sync a PR → watch the dashboard
```

---

## Migration checklist (Phase 1 Node → Phase 2 Lemma)

| Piece | Phase 1 | Phase 2 | Done |
|---|---|---|---|
| State tables | ✅ Lemma datastore | keep | ☐ |
| Diff/plan/notes storage | text/JSON column | Lemma **doc store** (`files`) | ☐ |
| 4 agents | `@anthropic-ai/sdk` | `agents.create` + `agents.run` | ☐ |
| Orchestration | Node `runReview()` | `workflows` graph | ☐ |
| Human gate | approve route | workflow `FORM` wait + `submitForm` | ☐ |
| GitHub I/O | Octokit/fetch | GitHub **connector** ops + trigger | ☐ |
| Slack notify | incoming webhook | Slack **connector** op | ☐ |
| Frontend reads | poll `/api/prs` | `useLiveRecords` | ☐ |

When every row's right column ships, Lemma is the infrastructure layer — not just the database.

/**
 * lib/orchestrator.ts — the auto-healing loop (decision #2, the heart of it).
 *
 *   while (retry_count < 5):
 *     TESTING → run tests
 *       pass → READY_FOR_MERGE, stop
 *       fail → record risks, generate a fix, push it, retry_count++, loop
 *   hit 5 → AWAITING_HUMAN_APPROVAL, stop (escalate to a human)
 *
 * Every state transition is written to the live Lemma pod, so the dashboard
 * observes progress just by polling. Launched fire-and-forget from the webhook.
 */

import { reviewRisks } from "./agents/risk-reviewer";
import { generateFix } from "./fixer";
import { pushFix } from "./git";
import { addRisk, getPR, incrementRetry, updatePR } from "./lemma";
import { runTests } from "./tester";
import { MAX_RETRIES, type PRStatus, type PullRequestContext } from "./types";

const STEP_DELAY_MS = Number(process.env.LOOP_STEP_DELAY_MS ?? 1200);

/** Statuses the loop should never re-process. */
const TERMINAL: ReadonlySet<PRStatus> = new Set<PRStatus>([
  "READY_FOR_MERGE",
  "AWAITING_HUMAN_APPROVAL",
  "APPROVED_OVERRIDE",
  "REJECTED",
]);

/** Guard against the same PR being healed by two concurrent launches. */
const running = new Set<string>();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runHealingLoop(prId: string): Promise<void> {
  if (running.has(prId)) return;
  running.add(prId);
  try {
    while (true) {
      const pr = await getPR(prId);

      if (TERMINAL.has(pr.status)) return;

      // Stop condition #1: attempts exhausted → escalate to a human.
      if (pr.retry_count >= MAX_RETRIES) {
        await updatePR(prId, { status: "AWAITING_HUMAN_APPROVAL" });
        return;
      }

      await updatePR(prId, { status: "TESTING" });
      const outcome = await runTests(pr);

      // Stop condition #2: success.
      if (outcome.passed) {
        await updatePR(prId, { status: "READY_FOR_MERGE", last_error: null });
        return;
      }

      // Failure → record risks, generate + push a fix, bump the counter, loop.
      const attempt = pr.retry_count + 1;
      await updatePR(prId, {
        status: "HEALING",
        last_error: outcome.risks[0]?.title ?? "tests failed",
      });
      for (const risk of outcome.risks) {
        await addRisk({ ...risk, pr_id: prId, attempt });
      }
      const fix = await generateFix(pr, outcome.risks);
      await pushFix(pr, fix.patch);
      await incrementRetry(prId);

      // A small pause so the dashboard can show TESTING → HEALING transitions.
      await sleep(STEP_DELAY_MS);
    }
  } catch (error) {
    // Never leave a PR stuck mid-loop: surface the error and hand it to a human.
    await updatePR(prId, {
      status: "AWAITING_HUMAN_APPROVAL",
      last_error: `loop error: ${(error as Error).message}`,
    }).catch(() => {});
  } finally {
    running.delete(prId);
  }
}

// ── v2: the review path (analyzes the REAL diff) ─────────────────────────────
// Unlike runHealingLoop (mock test→fix→retry), this reads the actual PR diff via
// the risk-reviewer agent, writes the surfaced risks, and parks the PR for a
// human when anything serious shows up. Statuses are reused so the existing
// dashboard renders it unchanged:
//   in-progress → TESTING ; blocker (CRITICAL/HIGH) → AWAITING_HUMAN_APPROVAL ;
//   otherwise → READY_FOR_MERGE.
// Phase 2: this becomes a Lemma workflow run.
export async function runReview(prId: string, ctx: PullRequestContext): Promise<void> {
  if (running.has(prId)) return;
  running.add(prId);
  try {
    await updatePR(prId, { status: "TESTING", last_error: null });

    const risks = await reviewRisks(ctx);
    for (const risk of risks) {
      await addRisk({ ...risk, pr_id: prId, attempt: 1 });
    }

    const blocker = risks.find((r) => r.severity === "CRITICAL" || r.severity === "HIGH");
    await updatePR(prId, {
      status: blocker ? "AWAITING_HUMAN_APPROVAL" : "READY_FOR_MERGE",
      last_error: blocker ? blocker.title : null,
    });
  } catch (error) {
    await updatePR(prId, {
      status: "AWAITING_HUMAN_APPROVAL",
      last_error: `review error: ${(error as Error).message}`,
    }).catch(() => {});
  } finally {
    running.delete(prId);
  }
}

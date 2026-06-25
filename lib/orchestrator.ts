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

import { generateFix } from "./fixer";
import { pushFix } from "./git";
import { addRisk, getPR, incrementRetry, updatePR } from "./lemma";
import { runTests } from "./tester";
import { MAX_RETRIES, type PRStatus } from "./types";

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

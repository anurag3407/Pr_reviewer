/**
 * scripts/diag-review.ts — diagnose /api/review failures without HTTP/curl/Next.
 *
 *   npx tsx scripts/diag-review.ts <owner/name> <pr-number>
 *   npx tsx scripts/diag-review.ts Mohnish27_dev/Indigenous_Culture_Chatbot_Community 2
 *
 * Runs the same two steps the route does (fetch PR context → create PR row),
 * printing exactly which one fails and the full error. Then runs the review.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { fetchPRContext } from "../lib/github";
import { createPR } from "../lib/lemma";
import { runReview } from "../lib/orchestrator";

async function main() {
  const repo = process.argv[2] ?? "acme/checkout";
  const number = Number(process.argv[3] ?? 142);

  console.log(`\n[diag] GITHUB_MODE=${process.env.GITHUB_MODE ?? "(unset)"} ` +
    `token=${process.env.GITHUB_TOKEN ? "set" : "MISSING"} ` +
    `lemma=${process.env.LEMMA_TOKEN ? "set" : "MISSING"} ` +
    `bynara=${process.env.BYNARA_API_KEY ? "set" : "MISSING"}`);
  console.log(`[diag] target: ${repo} #${number}\n`);

  // Step 1 — fetch PR context (GitHub).
  let ctx;
  try {
    ctx = await fetchPRContext(repo, number);
    console.log(`[diag] ✓ step 1 fetchPRContext: source=${ctx.source} ` +
      `files=${ctx.files.length} commits=${ctx.commits.length} diff=${ctx.diff.length}b`);
  } catch (e) {
    console.error(`[diag] ✗ step 1 fetchPRContext FAILED:\n   ${(e as Error).message}\n`);
    process.exit(1);
  }

  // Step 2 — create the PR row (Lemma pod).
  let prId: string;
  try {
    const pr = await createPR({
      pr_number: String(ctx.number),
      repo: ctx.repo,
      branch: ctx.branch,
      author: ctx.author,
      title: ctx.title,
    });
    prId = pr.id;
    console.log(`[diag] ✓ step 2 createPR: pr_id=${prId}`);
  } catch (e) {
    console.error(`[diag] ✗ step 2 createPR FAILED (pod/token):\n   ${(e as Error).message}\n`);
    process.exit(1);
  }

  // Step 3 — run the review (analyze diff → write risks).
  try {
    await runReview(prId, ctx);
    console.log(`[diag] ✓ step 3 runReview done — check the dashboard for pr_id=${prId}\n`);
  } catch (e) {
    console.error(`[diag] ✗ step 3 runReview FAILED:\n   ${(e as Error).message}\n`);
    process.exit(1);
  }
}

main();

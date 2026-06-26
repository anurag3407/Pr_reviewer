/**
 * lib/reviewer.ts — the review + self-healing loops.
 *
 *  runReviewLoop: gather context → MiMo structured review → persist findings +
 *  derive the PR flag. One scan.
 *
 *  runFixLoop (the closed loop, same shape as the original retry orchestrator):
 *    while iter < MAX_FIX_ITERS and flag !== SAFE:
 *      generate whole-file edits → commit to the head branch → re-scan
 *  Stop on SAFE (success) or when the iteration budget is spent (→ human).
 *
 * Both run fire-and-forget from API routes; all state goes to the Lemma pod so
 * the dashboard observes progress by polling.
 */

import {
  commitFiles,
  getFileContent,
  getPullRequest,
  githubConfigured,
  postReview,
} from "./github";
import { gatherContext } from "./context";
import {
  generateFileEdits,
  llmConfigured,
  type ReviewResult,
  reviewPullRequest,
} from "./llm";
import type { Project, Review } from "./types";
import {
  addFinding,
  clearFindings,
  getProject,
  getReview,
  incrementScan,
  listFindings,
  updateReview,
} from "./lemma";
import { MAX_FIX_ITERS } from "./types";

/** Re-entrancy guard (prefixed keys so review/fix don't collide). */
const running = new Set<string>();

export async function runReviewLoop(reviewId: string): Promise<void> {
  const key = `review:${reviewId}`;
  if (running.has(key)) return;
  running.add(key);
  try {
    const review = await getReview(reviewId);
    if (!review) return;

    if (!githubConfigured() || !llmConfigured()) {
      await updateReview(reviewId, {
        flag: "ERROR",
        last_error: !githubConfigured()
          ? "GitHub App not configured"
          : "No model provider configured (set BYNARA_API_KEY)",
      });
      return;
    }

    const project = await getProject(review.project_id, review.owner_id);
    if (!project) {
      await updateReview(reviewId, { flag: "ERROR", last_error: "owning project not found" });
      return;
    }

    await updateReview(reviewId, { flag: "REVIEWING" });

    const ctx = await gatherContext(project, review);
    if (ctx.headSha && ctx.headSha !== review.head_sha) {
      await updateReview(reviewId, { head_sha: ctx.headSha });
    }

    const result = await reviewPullRequest(ctx.contextText);

    const scan = await incrementScan(reviewId);
    await clearFindings(reviewId);
    for (const f of result.findings) {
      await addFinding({
        owner_id: review.owner_id,
        review_id: reviewId,
        scan,
        severity: f.severity,
        category: f.category,
        file_path: f.file_path,
        line_start: f.line_start,
        line_end: f.line_end,
        title: f.title,
        detail: f.detail,
        suggested_fix: f.suggested_fix,
        confidence: f.confidence,
      });
    }

    await updateReview(reviewId, {
      flag: result.flag,
      summary: result.summary,
      last_error: null,
    });

    // Optional: surface the review natively on the PR (off by default — it's an
    // outward-facing write). Never fail the review if posting errors.
    if (process.env.POST_GITHUB_REVIEWS) {
      await postGithubReview(project, review, result).catch(() => {});
    }
  } catch (error) {
    await updateReview(reviewId, {
      flag: "ERROR",
      last_error: `review failed: ${(error as Error).message}`,
    }).catch(() => {});
  } finally {
    running.delete(key);
  }
}

/** Post the review to the PR: inline comments where possible, body otherwise. */
async function postGithubReview(project: Project, review: Review, result: ReviewResult): Promise<void> {
  const event =
    result.flag === "BLOCKED" || result.flag === "UNSAFE"
      ? "REQUEST_CHANGES"
      : "COMMENT";
  const body =
    `**Autoheal review — ${result.flag}**\n\n${result.summary}` +
    `\n\n_Reviewed with full-codebase context by MiMo-V2.5-Pro._`;

  const comments = result.findings
    .filter((f) => f.file_path && f.line_start)
    .map((f) => ({
      path: f.file_path as string,
      line: f.line_start as number,
      body:
        `**[${f.severity}/${f.category}] ${f.title}**\n\n${f.detail ?? ""}` +
        (f.suggested_fix ? `\n\n**Suggested fix:**\n\`\`\`\n${f.suggested_fix}\n\`\`\`` : ""),
    }));

  const prNumber = Number(review.pr_number);
  try {
    await postReview(project.installation_id, project.repo, prNumber, body, comments, event);
  } catch {
    // Inline lines outside the diff get rejected (422) — retry with body only.
    await postReview(project.installation_id, project.repo, prNumber, body, [], event);
  }
}

export async function runFixLoop(reviewId: string): Promise<void> {
  const key = `fix:${reviewId}`;
  if (running.has(key)) return;
  running.add(key);
  try {
    if (!githubConfigured() || !llmConfigured()) return;

    for (let iter = 0; iter < MAX_FIX_ITERS; iter++) {
      const review = await getReview(reviewId);
      if (!review) return;
      if (review.flag === "SAFE") return; // success

      const project = await getProject(review.project_id, review.owner_id);
      if (!project) return;

      // Accepted findings = everything not explicitly dismissed.
      const findings = (await listFindings(reviewId)).filter((f) => f.status !== "DISMISSED");
      if (findings.length === 0) return;

      // Fresh PR state — head SHA changes after each commit we push.
      const pr = await getPullRequest(project.installation_id, project.repo, Number(review.pr_number));
      const headBranch = pr.headBranch || review.head_branch;
      if (!headBranch) return;

      // Pull current content of every file a finding points at.
      const targetPaths = [...new Set(findings.map((f) => f.file_path).filter(Boolean))] as string[];
      const files: Array<{ path: string; content: string }> = [];
      for (const path of targetPaths) {
        const content = await getFileContent(project.installation_id, project.repo, path, pr.headSha);
        if (content != null) files.push({ path, content });
      }
      if (files.length === 0) return;

      const { edits, note } = await generateFileEdits(
        findings.map((f) => ({
          severity: f.severity,
          category: f.category,
          file_path: f.file_path,
          line_start: f.line_start,
          line_end: f.line_end,
          title: f.title,
          detail: f.detail,
          suggested_fix: f.suggested_fix,
        })),
        files,
      );
      if (edits.length === 0) return;

      const message = `fix(autoheal): address ${findings.length} review finding(s)\n\n${note}`;
      await commitFiles(
        project.installation_id,
        project.repo,
        headBranch,
        edits.map((e) => ({ path: e.path, content: e.new_content })),
        message,
      );

      // Re-scan the updated PR (sets a new flag + findings), then loop.
      await runReviewLoop(reviewId);
    }

    // Budget spent and still not SAFE → leave the flag and hand back to a human.
    const review = await getReview(reviewId);
    if (review && review.flag !== "SAFE") {
      await updateReview(reviewId, {
        last_error: `auto-fix stopped after ${MAX_FIX_ITERS} attempts — needs a human`,
      });
    }
  } catch (error) {
    await updateReview(reviewId, {
      last_error: `fix loop failed: ${(error as Error).message}`,
    }).catch(() => {});
  } finally {
    running.delete(key);
  }
}

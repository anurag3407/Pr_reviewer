/**
 * lib/git.ts — push a generated fix to the PR branch.
 *
 * MOCK BY DEFAULT (per the brief): logs the push and returns a fake commit sha,
 * so the loop runs with no real repo. Set GIT_MODE=real to actually commit —
 * and only against a *separate* checkout pointed at by GIT_REPO_DIR, never this
 * project's working tree (a safety guard so a demo can't clobber its own repo).
 */

import { randomBytes } from "node:crypto";
import type { PullRequest } from "./types";

export interface PushResult {
  sha: string;
  branch: string;
  mocked: boolean;
}

export async function pushFix(pr: PullRequest, patch: string): Promise<PushResult> {
  const mode = (process.env.GIT_MODE ?? "mock").toLowerCase();
  if (mode !== "real") return mockPush(pr, patch);

  const repoDir = process.env.GIT_REPO_DIR;
  if (!repoDir) {
    console.warn(
      "[git:real] GIT_MODE=real but GIT_REPO_DIR is unset — refusing to touch the " +
        "app's own working tree. Falling back to a mock push.",
    );
    return mockPush(pr, patch);
  }

  try {
    const { simpleGit } = await import("simple-git");
    const git = simpleGit({ baseDir: repoDir });
    await git.checkout(pr.branch).catch(() => git.checkoutLocalBranch(pr.branch));
    // The patch is advisory; record the heal as a commit on the branch.
    const message = `chore(auto-heal): attempt ${pr.retry_count + 1} for PR #${pr.pr_number}\n\n${patch.slice(0, 500)}`;
    await git.add(".");
    await git.commit(message, undefined, { "--allow-empty": null });
    if (process.env.GITHUB_TOKEN) {
      await git.push("origin", pr.branch);
    }
    const sha = (await git.revparse(["HEAD"])).trim().slice(0, 12);
    console.log(`[git:real] committed ${sha} to ${pr.branch} in ${repoDir}`);
    return { sha, branch: pr.branch, mocked: false };
  } catch (error) {
    console.warn(`[git:real] push failed (${(error as Error).message}); falling back to mock.`);
    return mockPush(pr, patch);
  }
}

function mockPush(pr: PullRequest, patch: string): PushResult {
  const sha = randomBytes(6).toString("hex");
  console.log(`[git:mock] pushed ${sha} to ${pr.branch} (${patch.length}-byte patch)`);
  return { sha, branch: pr.branch, mocked: true };
}

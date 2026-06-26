/**
 * scripts/simulate-pr.ts — trigger a review without waiting for a real webhook.
 *
 *   node --env-file=.env.local --import tsx scripts/simulate-pr.ts
 *
 * POSTs a GitHub-shaped `pull_request` event to the running app for a repo you've
 * already connected (so a project row exists to resolve the owner + installation).
 * Set these to point at a real open PR the App can see:
 *
 *   SIM_REPO=owner/name           (required)
 *   SIM_INSTALLATION_ID=12345678  (required — from the connected project)
 *   SIM_PR_NUMBER=42              (required — an open PR)
 *   SIM_BASE=main                 (base branch; default main)
 *   SIM_HEAD=feature/x            (head branch; default feature/demo)
 *   APP_URL=http://localhost:3000
 *   GITHUB_WEBHOOK_SECRET=...      (if the server verifies signatures)
 */

import crypto from "node:crypto";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const repo = process.env.SIM_REPO;
const installationId = process.env.SIM_INSTALLATION_ID;
const prNumber = process.env.SIM_PR_NUMBER;

async function main(): Promise<void> {
  if (!repo || !installationId || !prNumber) {
    console.error(
      "[simulate] Set SIM_REPO, SIM_INSTALLATION_ID and SIM_PR_NUMBER to a real connected repo + open PR.\n" +
        "[simulate] (Connect the repo first at /dashboard/projects; the installation id is shown on the project.)",
    );
    process.exit(1);
  }

  const [owner, name] = repo.split("/");
  const payload = {
    action: "opened",
    installation: { id: Number(installationId) },
    repository: { full_name: repo, name, owner: { login: owner } },
    pull_request: {
      number: Number(prNumber),
      title: process.env.SIM_TITLE ?? `Review request for PR #${prNumber}`,
      user: { login: process.env.SIM_AUTHOR ?? "contributor" },
      head: { ref: process.env.SIM_HEAD ?? "feature/demo", sha: process.env.SIM_HEAD_SHA ?? "" },
      base: { ref: process.env.SIM_BASE ?? "main" },
      html_url: `https://github.com/${repo}/pull/${prNumber}`,
    },
  };
  const body = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-github-event": "pull_request",
  };
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (secret) {
    headers["x-hub-signature-256"] =
      "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  }

  const url = `${APP_URL}/api/webhooks/github`;
  console.log(`[simulate] POST ${url}  (${repo} #${prNumber})`);
  try {
    const res = await fetch(url, { method: "POST", headers, body });
    const text = await res.text();
    console.log(`[simulate] ← ${res.status} ${text}`);
    if (!res.ok) process.exitCode = 1;
    else console.log(`[simulate] watch the dashboard at ${APP_URL}/dashboard`);
  } catch (error) {
    console.error(`[simulate] request failed: ${(error as Error).message}`);
    console.error("[simulate] is the app running?  npm run dev");
    process.exit(1);
  }
}

main();

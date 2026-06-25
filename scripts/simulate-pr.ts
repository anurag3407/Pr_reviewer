/**
 * scripts/simulate-pr.ts — drive a full auto-healing run with zero GitHub setup.
 *
 *   npx tsx scripts/simulate-pr.ts            (or: npm run simulate)
 *
 * POSTs a synthetic PR webhook to the running app. Watch the dashboard:
 *   TESTING → HEALING (1/5, 2/5) → READY_FOR_MERGE
 *
 * Demo the human-approval gate by forcing failures (set on the *server* that
 * runs the loop, i.e. the `next dev` process):
 *   TEST_RUNNER=mock FORCE_FAIL=1 npm run dev      # in one terminal
 *   npm run simulate                               # in another → reaches 5/5
 *
 * Env: APP_URL (default http://localhost:3000), PREVIEW_URL (optional),
 *      GITHUB_WEBHOOK_SECRET (if the server verifies signatures).
 */

import crypto from "node:crypto";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

const SAMPLES = [
  { repo: "acme/checkout", branch: "feature/apply-coupon", author: "daniela", title: "Apply coupon at checkout" },
  { repo: "acme/checkout", branch: "fix/empty-cart-crash", author: "marcus", title: "Guard against empty cart" },
  { repo: "acme/web", branch: "feature/a11y-coupon-field", author: "priya", title: "Accessible coupon input" },
];

async function main(): Promise<void> {
  const sample = SAMPLES[Math.floor((Date.now() / 1000) % SAMPLES.length)];
  const body = JSON.stringify({
    pr_number: String(Date.now()).slice(-5),
    preview_url: process.env.PREVIEW_URL ?? null,
    ...sample,
  });

  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (secret) {
    headers["x-hub-signature-256"] =
      "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  }

  const url = `${APP_URL}/api/webhooks/github`;
  console.log(`[simulate] POST ${url}`);
  console.log(`[simulate] ${sample.title} (${sample.branch})`);

  try {
    const res = await fetch(url, { method: "POST", headers, body });
    const text = await res.text();
    console.log(`[simulate] ← ${res.status} ${text}`);
    if (!res.ok) process.exitCode = 1;
    else console.log("[simulate] watch the dashboard at " + APP_URL);
  } catch (error) {
    console.error(`[simulate] request failed: ${(error as Error).message}`);
    console.error("[simulate] is the app running?  npm run dev");
    process.exit(1);
  }
}

main();

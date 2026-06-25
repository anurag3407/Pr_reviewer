/**
 * lib/tester.ts — the pluggable test runner (decision #3).
 *
 * One interface, three backends, chosen at runtime by `TEST_RUNNER`:
 *   mock        (default) — scripted arc: fails attempts 1–2, passes on 3, so a
 *                           demo walks TESTING → HEALING → READY_FOR_MERGE. Set
 *                           FORCE_FAIL=1 to fail every attempt (exercises the
 *                           5/5 human-approval gate).
 *   npm         — child_process `npm run test`; non-zero exit → a TEST_FAILURE.
 *   testsprite  — real TestSprite CLI against a public preview URL.
 */

import { execFile, spawn } from "node:child_process";
import type { NewRisk, PullRequest } from "./types";

export interface TestOutcome {
  passed: boolean;
  risks: NewRisk[];
  raw?: unknown;
}

export async function runTests(pr: PullRequest): Promise<TestOutcome> {
  const runner = (process.env.TEST_RUNNER ?? "mock").toLowerCase();
  switch (runner) {
    case "npm":
      return runNpm();
    case "testsprite":
      return runTestSprite(pr);
    case "mock":
    default:
      return runMock(pr);
  }
}

// ── mock backend ────────────────────────────────────────────────────────────
function risk(
  severity: NewRisk["severity"],
  category: NewRisk["category"],
  title: string,
  detail: string,
  recommended_fix: string,
): NewRisk {
  return { severity, category, title, detail, recommended_fix, source: "mock" };
}

function runMock(pr: PullRequest): TestOutcome {
  const forceFail = process.env.FORCE_FAIL === "1";
  const attempt = pr.retry_count + 1; // 1-based

  // Healthy arc: pass once we've "healed" twice.
  if (!forceFail && pr.retry_count >= 2) {
    return { passed: true, risks: [], raw: { runner: "mock", attempt, passed: true } };
  }

  let risks: NewRisk[];
  if (forceFail) {
    risks = [
      risk(
        "CRITICAL",
        "SECURITY",
        "Hardcoded credential in diff",
        "A static API token was detected in the changed files on the checkout service.",
        "Move the token to an environment variable and rotate the exposed key.",
      ),
      risk(
        "HIGH",
        "TEST_FAILURE",
        "Checkout smoke test timed out",
        "The end-to-end checkout flow did not complete within the 30s budget.",
        "Add a loading guard and await the payment intent before asserting.",
      ),
    ];
  } else if (attempt === 1) {
    risks = [
      risk(
        "HIGH",
        "TEST_FAILURE",
        "Coupon validation test failed",
        "Expected total $90.00 after 10% coupon, received $100.00 — discount not applied.",
        "Apply the coupon multiplier before computing the order total.",
      ),
      risk(
        "MEDIUM",
        "BUG",
        "Null dereference on empty cart",
        "cart.items[0] accessed without a length check when the cart is empty.",
        "Guard with `if (!cart.items.length) return EMPTY_TOTAL`.",
      ),
    ];
  } else {
    risks = [
      risk(
        "MEDIUM",
        "COMPLIANCE",
        "Missing accessible labels on the coupon field",
        "The coupon input has no associated <label>, failing WCAG 2.1 (4.1.2).",
        "Add a visually-hidden <label htmlFor> bound to the input id.",
      ),
    ];
  }

  return { passed: false, risks, raw: { runner: "mock", attempt, forceFail } };
}

// ── npm backend ─────────────────────────────────────────────────────────────
function tail(text: string, max = 1500): string {
  return text.length > max ? `…${text.slice(-max)}` : text;
}

function runNpm(): Promise<TestOutcome> {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "test"], { cwd: process.cwd(), shell: false });
    let out = "";
    child.stdout?.on("data", (d) => (out += String(d)));
    child.stderr?.on("data", (d) => (out += String(d)));
    child.on("error", (err) =>
      resolve({
        passed: false,
        risks: [
          {
            severity: "HIGH",
            category: "TEST_FAILURE",
            title: "npm test could not start",
            detail: err.message,
            recommended_fix: "Ensure a `test` script exists and dependencies are installed.",
            source: "npm-test",
          },
        ],
        raw: { error: err.message },
      }),
    );
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ passed: true, risks: [], raw: { code, out: tail(out) } });
        return;
      }
      resolve({
        passed: false,
        risks: [
          {
            severity: "HIGH",
            category: "TEST_FAILURE",
            title: `npm test exited with code ${code}`,
            detail: tail(out),
            recommended_fix: "Inspect the failing assertions in the test output above.",
            source: "npm-test",
          },
        ],
        raw: { code, out: tail(out) },
      });
    });
  });
}

// ── testsprite backend ──────────────────────────────────────────────────────
function execJson(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err && typeof (err as { code?: number }).code === "number" ? (err as { code: number }).code : err ? 1 : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

async function runTestSprite(pr: PullRequest): Promise<TestOutcome> {
  const testId = process.env.TESTSPRITE_TEST_ID;
  const apiKey = process.env.TESTSPRITE_API_KEY;
  const target = pr.preview_url;

  // TestSprite rejects localhost — it needs a public URL and a created test id.
  if (!apiKey || !testId || !target) {
    return {
      passed: false,
      risks: [
        {
          severity: "HIGH",
          category: "TEST_FAILURE",
          title: "TestSprite not configured",
          detail: `Missing ${[!apiKey && "TESTSPRITE_API_KEY", !testId && "TESTSPRITE_TEST_ID", !target && "preview_url"]
            .filter(Boolean)
            .join(", ")}. TestSprite needs a public preview URL (Vercel/ngrok), not localhost.`,
          recommended_fix: "Set the TestSprite env vars and attach a public preview_url to the PR.",
          source: "testsprite",
        },
      ],
      raw: { configured: false },
    };
  }

  const run = await execJson("npx", [
    "@testsprite/testsprite-cli",
    "test",
    "run",
    testId,
    "--target-url",
    target,
    "--wait",
    "--output",
    "json",
  ]);

  if (run.code === 0) {
    return { passed: true, risks: [], raw: { run: safeJson(run.stdout) } };
  }

  // Pull the failure bundle (root cause + recommended fix) and normalize it.
  const failure = await execJson("npx", [
    "@testsprite/testsprite-cli",
    "test",
    "failure",
    "get",
    testId,
    "--output",
    "json",
  ]);

  const bundle = safeJson(failure.stdout) as Record<string, unknown> | null;
  return {
    passed: false,
    risks: [bundleToRisk(bundle, run.code)],
    raw: { run: safeJson(run.stdout), failure: bundle },
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text?.trim() ? text.trim() : null;
  }
}

function bundleToRisk(bundle: Record<string, unknown> | null, exitCode: number): NewRisk {
  const get = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = bundle?.[k];
      if (typeof v === "string" && v.trim()) return v;
    }
    return undefined;
  };
  const sev = (get("severity") ?? "HIGH").toUpperCase();
  return {
    severity: (["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(sev) ? sev : "HIGH") as NewRisk["severity"],
    category: "TEST_FAILURE",
    title: get("title", "name", "summary") ?? (exitCode === 7 ? "TestSprite run timed out" : "TestSprite check failed"),
    detail: get("root_cause", "rootCause", "detail", "message") ?? "See the TestSprite failure bundle.",
    recommended_fix: get("recommended_fix", "recommendedFix", "suggestion", "fix"),
    source: "testsprite",
  };
}

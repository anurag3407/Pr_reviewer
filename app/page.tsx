/**
 * Marketing landing page (public). The product entry point: pitch, feature
 * grid, the PR-flag legend, and auth CTAs. Signed-in visitors get a straight
 * shot to the dashboard.
 *
 * Conditional auth UI is driven by `auth()` server-side (this Clerk major drops
 * the <SignedIn>/<SignedOut> control components in favor of a `Show`/`auth`).
 */

import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";

const FEATURES = [
  {
    icon: "{ }",
    title: "Reads your whole codebase",
    body: "Not just the diff. Every changed file in full, the modules they import, and a map of the repo — packed into a 1M-token context window so the review understands the change in situ.",
  },
  {
    icon: "⚠",
    title: "Severity-ranked findings",
    body: "Each problematic line is pinpointed and graded LOW → CRITICAL, with a root-cause explanation and a concrete suggested fix — not vague nitpicks.",
  },
  {
    icon: "✕",
    title: "One clear verdict per PR",
    body: "A single flag — SAFE, NEEDS_REVIEW, UNSAFE, or BLOCKED — so you know at a glance whether a pull request is mergeable.",
  },
  {
    icon: "✦",
    title: "Chat your way to the fix",
    body: "Ask why an issue is happening or for a better approach. The reviewer answers with your actual code in context and converges on a final fix.",
  },
  {
    icon: "↻",
    title: "Fix with PR — then re-scan",
    body: "One click commits the fix to the branch and re-reviews automatically, looping until the PR flag turns SAFE.",
  },
  {
    icon: "◆",
    title: "Premium model",
    body: "Powered by MiMo-V2.5-Pro — a SWE-bench-grade reasoning model built for complex software engineering over very long contexts.",
  },
];

const FLAGS = [
  { tone: "ready", label: "SAFE", note: "no material issues" },
  { tone: "test", label: "NEEDS_REVIEW", note: "minor / medium findings" },
  { tone: "await", label: "UNSAFE", note: "high-severity issues" },
  { tone: "reject", label: "BLOCKED", note: "critical: security / data loss" },
];

export default async function LandingPage() {
  const { userId } = await auth();
  const signedIn = Boolean(userId);

  return (
    <main className="landing">
      <nav className="nav">
        <div className="brand">
          <span className="brand__glyph">↻</span>
          <div>
            <div className="brand__name">Autoheal</div>
            <div className="brand__sub">ai pr review · self-healing</div>
          </div>
        </div>
        <div className="nav__links">
          {signedIn ? (
            <>
              <Link href="/dashboard" className="btn btn--go">
                Open dashboard
              </Link>
              <UserButton />
            </>
          ) : (
            <>
              <Link href="/sign-in" className="btn">
                Sign in
              </Link>
              <Link href="/sign-up" className="btn btn--go">
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>

      <section className="hero">
        <span className="hero__eyebrow">code review, done right</span>
        <h1 className="hero__title">
          AI code review that actually
          <br />
          reads your whole codebase.
        </h1>
        <p className="hero__sub">
          Connect a GitHub repo. On every pull request, Autoheal reviews the diff with
          full-codebase context, ranks each finding by severity, flags the PR, and can fix it —
          re-scanning until it&apos;s safe. More signal, less noise than the review bots you know.
        </p>
        <div className="hero__cta">
          {signedIn ? (
            <Link href="/dashboard" className="btn btn--go btn--lg">
              Open your dashboard →
            </Link>
          ) : (
            <>
              <Link href="/sign-up" className="btn btn--go btn--lg">
                Start reviewing free
              </Link>
              <Link href="/sign-in" className="btn btn--lg">
                I have an account
              </Link>
            </>
          )}
        </div>

        <div className="flagrow">
          {FLAGS.map((f) => (
            <span className="flagchip" data-tone={f.tone} key={f.label}>
              <span className="flagchip__dot" />
              <b>{f.label}</b>
              <span className="flagchip__note">{f.note}</span>
            </span>
          ))}
        </div>
      </section>

      <section className="features">
        {FEATURES.map((f) => (
          <div className="feature panel" key={f.title}>
            <div className="feature__icon">{f.icon}</div>
            <h3 className="feature__title">{f.title}</h3>
            <p className="feature__body">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="foot">
        <span>Autoheal</span>
        <span className="foot__dot">·</span>
        <span>state on a live Lemma pod</span>
        <span className="foot__dot">·</span>
        <span>reviews by MiMo-V2.5-Pro</span>
      </footer>
    </main>
  );
}

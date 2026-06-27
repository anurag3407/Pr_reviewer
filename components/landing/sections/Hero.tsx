"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.09,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: easeOut,
    },
  },
};

const visualVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.8,
      ease: easeOut,
      delay: 0.35,
    },
  },
};

interface Check {
  id: string;
  group: string;
  name: string;
  /** true = passes from the start; otherwise fails until AutoHeal repairs it */
  alwaysGreen?: boolean;
}

const checks: Check[] = [
  { id: "build", group: "build", name: "install · compile", alwaysGreen: true },
  { id: "unit", group: "test", name: "unit · 1,284 specs" },
  { id: "integration", group: "test", name: "integration · api" },
  { id: "deploy", group: "deploy", name: "staging · canary" },
];

/**
 * Drives the red → green build animation. Cycles failing → healing → healed,
 * then loops. With reduced motion it parks on the healed state.
 */
function useHealCycle(animate: boolean): { healed: boolean; healing: boolean } {
  const [phase, setPhase] = useState<"failing" | "healing" | "healed">(
    animate ? "failing" : "healed",
  );

  useEffect(() => {
    if (!animate) return;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const run = () => {
      setPhase("failing");
      timers.push(setTimeout(() => setPhase("healing"), 1900));
      timers.push(setTimeout(() => setPhase("healed"), 3400));
      timers.push(setTimeout(run, 6400));
    };
    run();

    return () => timers.forEach(clearTimeout);
  }, [animate]);

  return { healed: phase === "healed", healing: phase === "healing" };
}

export function Hero() {
  const prefersReducedMotion = useReducedMotion();
  const animate = !prefersReducedMotion;
  const { healed, healing } = useHealCycle(animate);

  return (
    <section className="landing-v2 ln-hero" data-landing="true">
      <div className="ln-hero__background" aria-hidden="true">
        <div className="ln-hero__mesh" />
        <div className="ln-hero__grid" />
      </div>

      <div className="ln-container ln-hero__container">
        <motion.div
          className="ln-hero__content"
          initial={animate ? "hidden" : false}
          animate={animate ? "visible" : false}
          variants={containerVariants}
        >
          <motion.div variants={itemVariants} className="ln-hero__eyebrow">
            <span className="ln-hero__eyebrow-dot" />
            Autonomous CI/CD · multi-agent engine
          </motion.div>

          <motion.h1 variants={itemVariants} className="ln-display ln-hero__title">
            Autonomous Pipeline Healing.
            <br />
            <span className="ln-hero__gradient">Zero Downtime.</span>
          </motion.h1>

          <motion.p variants={itemVariants} className="ln-body ln-hero__sub">
            A multi-agent CI/CD engineer that automatically triages, repairs, and
            commits fixes for broken builds. Ship resilient software faster, with
            absolute confidence.
          </motion.p>

          <motion.div variants={itemVariants} className="ln-hero__cta">
            <Link href="/sign-up" className="ln-hero__btn ln-hero__btn--primary">
              Install AutoHeal
              <span className="ln-hero__btn-arrow" aria-hidden="true">→</span>
            </Link>
            <Link href="#engine" className="ln-hero__btn ln-hero__btn--secondary">
              Explore the Engine
            </Link>
          </motion.div>
        </motion.div>

        <motion.div
          className="ln-hero__visual"
          initial={animate ? "hidden" : false}
          animate={animate ? "visible" : false}
          variants={visualVariants}
          aria-hidden="true"
        >
          <div className="ln-hero__window" data-healed={healed}>
            <div className="ln-hero__window-bar">
              <span className="ln-hero__window-dot" />
              <span className="ln-hero__window-dot" />
              <span className="ln-hero__window-dot" />
              <span className="ln-hero__window-path">
                autoheal · pipeline #2231 · main
              </span>
            </div>

            <div className="ln-hero__window-body">
              <div className="ln-hero__pr-head">
                <span className="ln-hero__pr-branch">
                  fix: refactor payment retry queue
                </span>
                <span
                  className="ln-hero__status-pill"
                  data-state={healed ? "green" : "red"}
                >
                  <span className="ln-hero__status-dot" />
                  {healed ? "All checks passed" : "Build failing"}
                </span>
              </div>

              <div className="ln-hero__checks">
                {checks.map((check) => {
                  const green = check.alwaysGreen || healed;
                  return (
                    <div
                      key={check.id}
                      className="ln-hero__check"
                      data-state={green ? "green" : "red"}
                    >
                      <span className="ln-hero__check-icon" aria-hidden="true">
                        {green ? "✓" : "✕"}
                      </span>
                      <span className="ln-hero__check-group">{check.group}</span>
                      <span className="ln-hero__check-name">{check.name}</span>
                      <span className="ln-hero__check-state">
                        {green ? "passed" : "failed"}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="ln-hero__commit" data-show={healing || healed}>
                <span className="ln-hero__commit-sha">a3f9c1d</span>
                <span className="ln-hero__commit-msg">
                  fix(autoheal): repair retry backoff · resolve 2 failing specs
                </span>
                <span className="ln-hero__commit-bot">AutoHeal · attempt 3/5</span>
              </div>

              <div
                className="ln-hero__scan"
                data-state={healed ? "green" : "red"}
              >
                <span className="ln-hero__scan-dot" />
                {healed
                  ? "Healed in 3 attempts · re-scan clean · auto-merged to main"
                  : healing
                    ? "Triaging failure · isolating faulty commit · applying fix…"
                    : "Pipeline failed · AutoHeal engaged"}
              </div>
            </div>
          </div>
          <div className="ln-hero__glow" data-healed={healed} />
        </motion.div>
      </div>

      <style jsx>{`
        .ln-hero {
          position: relative;
          overflow: hidden;
          background: var(--ln-hero-gradient);
          padding-top: var(--ln-space-24);
          padding-bottom: var(--ln-space-24);
        }

        .ln-hero__background {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;
        }

        .ln-hero__mesh {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(640px 360px at 80% 0%, rgba(139, 92, 246, 0.22), transparent 70%),
            radial-gradient(560px 340px at 12% 8%, rgba(56, 189, 248, 0.16), transparent 70%);
        }

        .ln-hero__grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(to right, var(--ln-line-soft) 1px, transparent 1px),
            linear-gradient(to bottom, var(--ln-line-soft) 1px, transparent 1px);
          background-size: 64px 64px;
          mask-image: radial-gradient(ellipse 80% 70% at 50% 30%, black 0%, transparent 72%);
          -webkit-mask-image: radial-gradient(ellipse 80% 70% at 50% 30%, black 0%, transparent 72%);
          opacity: 0.5;
        }

        .ln-hero__container {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .ln-hero__content {
          text-align: center;
          max-width: 860px;
          margin-inline: auto;
        }

        .ln-hero__eyebrow {
          display: inline-flex;
          align-items: center;
          gap: var(--ln-space-2);
          padding: var(--ln-space-2) var(--ln-space-4);
          border: 1px solid var(--ln-line);
          border-radius: var(--ln-radius-full);
          background: var(--ln-glass);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          font-family: var(--ln-font-mono);
          font-size: var(--ln-text-xs);
          letter-spacing: var(--ln-tracking-wide);
          color: var(--ln-accent-bright);
          box-shadow: var(--ln-shadow-sm);
          margin-bottom: var(--ln-space-6);
        }

        .ln-hero__eyebrow-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--ln-accent-lime-bright);
          box-shadow: 0 0 10px var(--ln-success-glow);
        }

        .ln-hero__title {
          font-size: var(--ln-text-2xl);
          letter-spacing: var(--ln-tracking-tight);
          color: var(--ln-heading);
        }

        .ln-hero__gradient {
          background: linear-gradient(
            120deg,
            var(--ln-accent-violet) 0%,
            var(--ln-accent-cyan) 55%,
            var(--ln-accent-lime) 100%
          );
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .ln-hero__sub {
          font-size: var(--ln-text-md);
          max-width: 640px;
          margin-inline: auto;
          margin-top: var(--ln-space-6);
          color: var(--ln-muted);
        }

        .ln-hero__cta {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: var(--ln-space-4);
          margin-top: var(--ln-space-10);
        }

        .ln-hero__btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--ln-space-2);
          padding: var(--ln-space-3) var(--ln-space-7);
          border-radius: var(--ln-radius);
          font-family: var(--ln-font-body);
          font-size: 1rem;
          font-weight: 600;
          text-decoration: none;
          transition: transform 0.12s var(--ln-ease-out), box-shadow 0.18s var(--ln-ease-out),
            background 0.18s var(--ln-ease-out), border-color 0.18s var(--ln-ease-out);
          min-width: 190px;
        }

        .ln-hero__btn:hover {
          transform: translateY(-2px);
        }

        .ln-hero__btn:active {
          transform: translateY(0);
        }

        .ln-hero__btn--primary {
          color: #0a0712;
          background: linear-gradient(135deg, var(--ln-accent-violet-bright), var(--ln-accent-violet));
          box-shadow: 0 8px 28px var(--ln-accent-glow);
          font-weight: 700;
        }

        .ln-hero__btn--primary:hover {
          box-shadow: 0 12px 40px var(--ln-accent-glow);
        }

        .ln-hero__btn-arrow {
          transition: transform 0.15s var(--ln-ease-out);
        }

        .ln-hero__btn--primary:hover .ln-hero__btn-arrow {
          transform: translateX(3px);
        }

        .ln-hero__btn--secondary {
          color: var(--ln-heading);
          background: var(--ln-glass);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid var(--ln-line-strong);
          box-shadow: var(--ln-shadow-sm);
        }

        .ln-hero__btn--secondary:hover {
          border-color: var(--ln-accent);
          box-shadow: 0 0 24px var(--ln-accent-glow);
        }

        /* product visual mockup ------------------------------------------------- */
        .ln-hero__visual {
          position: relative;
          width: 100%;
          max-width: 760px;
          margin-top: var(--ln-space-20);
        }

        .ln-hero__glow {
          position: absolute;
          inset: -40px -20px 10% -20px;
          background: radial-gradient(60% 60% at 50% 0%, var(--ln-accent-glow), transparent 70%);
          filter: blur(48px);
          z-index: -1;
          transition: background 0.6s var(--ln-ease-out);
        }

        .ln-hero__glow[data-healed="true"] {
          background: radial-gradient(60% 60% at 50% 0%, var(--ln-success-glow), transparent 70%);
        }

        .ln-hero__window {
          border: 1px solid var(--ln-line-strong);
          border-radius: var(--ln-radius-lg);
          background: var(--ln-glass-hi);
          backdrop-filter: blur(28px) saturate(140%);
          -webkit-backdrop-filter: blur(28px) saturate(140%);
          box-shadow: var(--ln-shadow-xl);
          overflow: hidden;
        }

        .ln-hero__window-bar {
          display: flex;
          align-items: center;
          gap: var(--ln-space-2);
          padding: var(--ln-space-3) var(--ln-space-4);
          border-bottom: 1px solid var(--ln-line-soft);
          background: var(--ln-bg-sunken);
        }

        .ln-hero__window-dot {
          width: 11px;
          height: 11px;
          border-radius: 50%;
          background: var(--ln-line-strong);
        }

        .ln-hero__window-path {
          margin-left: var(--ln-space-4);
          font-family: var(--ln-font-mono);
          font-size: var(--ln-text-xs);
          color: var(--ln-faint);
        }

        .ln-hero__window-body {
          padding: var(--ln-space-6);
          display: flex;
          flex-direction: column;
          gap: var(--ln-space-4);
        }

        .ln-hero__pr-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--ln-space-4);
        }

        .ln-hero__pr-branch {
          font-family: var(--ln-font-mono);
          font-size: var(--ln-text-sm);
          color: var(--ln-heading);
          font-weight: 600;
        }

        .ln-hero__status-pill {
          display: inline-flex;
          align-items: center;
          gap: var(--ln-space-2);
          padding: var(--ln-space-1) var(--ln-space-3);
          border-radius: var(--ln-radius-full);
          font-family: var(--ln-font-mono);
          font-size: var(--ln-text-xs);
          white-space: nowrap;
          transition: color 0.5s var(--ln-ease-out), border-color 0.5s var(--ln-ease-out),
            background 0.5s var(--ln-ease-out);
        }

        .ln-hero__status-pill[data-state="red"] {
          color: var(--ln-danger);
          border: 1px solid color-mix(in srgb, var(--ln-danger) 40%, transparent);
          background: color-mix(in srgb, var(--ln-danger) 12%, transparent);
        }

        .ln-hero__status-pill[data-state="green"] {
          color: var(--ln-accent-lime-bright);
          border: 1px solid color-mix(in srgb, var(--ln-accent-lime-bright) 40%, transparent);
          background: color-mix(in srgb, var(--ln-accent-lime-bright) 12%, transparent);
        }

        .ln-hero__status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 8px currentColor;
        }

        .ln-hero__checks {
          display: flex;
          flex-direction: column;
          gap: var(--ln-space-2);
        }

        .ln-hero__check {
          display: grid;
          grid-template-columns: auto auto 1fr auto;
          align-items: center;
          gap: var(--ln-space-3);
          padding: var(--ln-space-3) var(--ln-space-4);
          border: 1px solid var(--ln-line-soft);
          border-radius: var(--ln-radius);
          background: rgba(255, 255, 255, 0.015);
          transition: border-color 0.5s var(--ln-ease-out), background 0.5s var(--ln-ease-out);
        }

        .ln-hero__check[data-state="red"] {
          border-color: color-mix(in srgb, var(--ln-danger) 32%, transparent);
          background: color-mix(in srgb, var(--ln-danger) 7%, transparent);
        }

        .ln-hero__check[data-state="green"] {
          border-color: color-mix(in srgb, var(--ln-accent-lime-bright) 26%, transparent);
          background: color-mix(in srgb, var(--ln-accent-lime-bright) 6%, transparent);
        }

        .ln-hero__check-icon {
          font-family: var(--ln-font-mono);
          font-weight: 700;
          font-size: 0.85rem;
          width: 18px;
          height: 18px;
          display: grid;
          place-items: center;
          border-radius: 50%;
        }

        .ln-hero__check[data-state="red"] .ln-hero__check-icon {
          color: var(--ln-danger);
          background: color-mix(in srgb, var(--ln-danger) 16%, transparent);
        }

        .ln-hero__check[data-state="green"] .ln-hero__check-icon {
          color: var(--ln-accent-lime-bright);
          background: color-mix(in srgb, var(--ln-accent-lime-bright) 16%, transparent);
        }

        .ln-hero__check-group {
          font-family: var(--ln-font-mono);
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ln-faint);
        }

        .ln-hero__check-name {
          font-size: 0.88rem;
          color: var(--ln-ink);
        }

        .ln-hero__check-state {
          font-family: var(--ln-font-mono);
          font-size: var(--ln-text-xs);
          white-space: nowrap;
          color: var(--ln-faint);
        }

        .ln-hero__commit {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: var(--ln-space-3);
          padding: var(--ln-space-3) var(--ln-space-4);
          border: 1px solid color-mix(in srgb, var(--ln-accent-violet) 30%, transparent);
          border-radius: var(--ln-radius);
          background: color-mix(in srgb, var(--ln-accent-violet) 8%, transparent);
          opacity: 0;
          transform: translateY(-6px);
          transition: opacity 0.45s var(--ln-ease-out), transform 0.45s var(--ln-ease-out);
        }

        .ln-hero__commit[data-show="true"] {
          opacity: 1;
          transform: translateY(0);
        }

        .ln-hero__commit-sha {
          font-family: var(--ln-font-mono);
          font-size: var(--ln-text-xs);
          color: var(--ln-accent-violet-bright);
        }

        .ln-hero__commit-msg {
          font-family: var(--ln-font-mono);
          font-size: 0.78rem;
          color: var(--ln-ink);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ln-hero__commit-bot {
          font-family: var(--ln-font-mono);
          font-size: 0.62rem;
          letter-spacing: 0.04em;
          color: var(--ln-accent-violet-bright);
          white-space: nowrap;
        }

        .ln-hero__scan {
          display: inline-flex;
          align-items: center;
          gap: var(--ln-space-2);
          padding: var(--ln-space-3) var(--ln-space-4);
          border-radius: var(--ln-radius);
          font-family: var(--ln-font-mono);
          font-size: var(--ln-text-xs);
          transition: color 0.5s var(--ln-ease-out), border-color 0.5s var(--ln-ease-out),
            background 0.5s var(--ln-ease-out);
        }

        .ln-hero__scan[data-state="red"] {
          color: var(--ln-danger);
          background: color-mix(in srgb, var(--ln-danger) 8%, transparent);
          border: 1px solid color-mix(in srgb, var(--ln-danger) 25%, transparent);
        }

        .ln-hero__scan[data-state="green"] {
          color: var(--ln-accent-lime-bright);
          background: color-mix(in srgb, var(--ln-accent-lime-bright) 8%, transparent);
          border: 1px solid color-mix(in srgb, var(--ln-accent-lime-bright) 25%, transparent);
        }

        .ln-hero__scan-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 8px currentColor;
          animation: ln-hero-pulse 1.5s ease-in-out infinite;
        }

        @keyframes ln-hero-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        @media (prefers-reduced-motion: reduce) {
          .ln-hero__scan-dot {
            animation: none !important;
          }
          .ln-hero__commit {
            transition: none !important;
          }
        }

        @media (max-width: 900px) {
          .ln-hero {
            padding-top: var(--ln-space-12);
            padding-bottom: var(--ln-space-20);
          }
          .ln-hero__title {
            font-size: var(--ln-text-xl);
          }
          .ln-hero__sub {
            font-size: var(--ln-text-base);
          }
          .ln-hero__visual {
            margin-top: var(--ln-space-12);
          }
        }

        @media (max-width: 640px) {
          .ln-hero {
            padding-top: var(--ln-space-10);
            padding-bottom: var(--ln-space-16);
          }
          .ln-hero__btn {
            width: 100%;
            min-width: auto;
          }
          .ln-hero__title {
            font-size: var(--ln-text-lg);
          }
          .ln-hero__check {
            grid-template-columns: auto auto 1fr;
          }
          .ln-hero__check-state {
            display: none;
          }
          .ln-hero__commit-msg {
            font-size: 0.7rem;
          }
        }
      `}</style>
    </section>
  );
}

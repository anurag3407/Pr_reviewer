"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface EngineItem {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  accent: string;
  glow: string;
}

const ITEMS: EngineItem[] = [
  {
    id: "codebase",
    eyebrow: "Codebase Intelligence",
    title: "It maps your whole repository, not just the failing line.",
    body:
      "AutoHeal doesn't just read the failing line — it maps your entire repository. By understanding dependency graphs, historical commits, and project structure, it ensures that a quick fix won't cause downstream collateral damage.",
    accent: "var(--ln-accent-violet)",
    glow: "rgba(167, 139, 250, 0.4)",
  },
  {
    id: "conversational",
    eyebrow: "Conversational Pull Requests",
    title: "Talk to the engine, right inside the PR.",
    body:
      'Chat directly with the multi-agent system inside your PRs. Ask, "Why did this specific unit test fail?" or "Optimize this repair for lower memory usage," and the agent responds dynamically with updated commits.',
    accent: "var(--ln-accent-cyan)",
    glow: "rgba(56, 189, 248, 0.4)",
  },
  {
    id: "context",
    eyebrow: "Deep External Context",
    title: "Decisions informed by everything around the code.",
    body:
      "To make accurate decisions, the engine goes beyond your codebase. It automatically pulls context from external documentation, linked Jira issues, and architectural decision records (ADRs) to formulate a complete picture before writing a single line of code.",
    accent: "var(--ln-accent-lime)",
    glow: "rgba(52, 211, 153, 0.4)",
  },
  {
    id: "oversight",
    eyebrow: "Absolute Human Oversight",
    title: "It drafts the solution. You hold the keys.",
    body:
      "AutoHeal drafts the solution, but you hold the keys. Every autonomous fix is submitted as a standard Pull Request. You retain full control to review, edit, and approve the code before it ever touches your main branch.",
    accent: "#fbbf24",
    glow: "rgba(251, 191, 36, 0.4)",
  },
];

/* ----- minimalist glass visuals, one per capability ---------------------- */

function CodebaseVisual() {
  // Dependency graph: a repaired node and its safe downstream neighbours.
  return (
    <svg viewBox="0 0 320 200" className="ln-eng__art-svg" aria-hidden="true">
      <g className="ln-eng__edges">
        <line x1="160" y1="60" x2="80" y2="130" />
        <line x1="160" y1="60" x2="240" y2="130" />
        <line x1="160" y1="60" x2="160" y2="140" />
        <line x1="80" y1="130" x2="160" y2="140" />
        <line x1="240" y1="130" x2="160" y2="140" />
      </g>
      <g className="ln-eng__nodes">
        <circle cx="160" cy="60" r="13" className="ln-eng__node ln-eng__node--hot" />
        <circle cx="80" cy="130" r="9" className="ln-eng__node" />
        <circle cx="240" cy="130" r="9" className="ln-eng__node" />
        <circle cx="160" cy="140" r="9" className="ln-eng__node" />
      </g>
      <text x="160" y="38" textAnchor="middle" className="ln-eng__art-tag">
        patched module
      </text>
    </svg>
  );
}

function ConversationalVisual() {
  return (
    <div className="ln-eng__chat" aria-hidden="true">
      <div className="ln-eng__bubble ln-eng__bubble--user">
        Why did the <span>checkout.spec</span> test fail?
      </div>
      <div className="ln-eng__bubble ln-eng__bubble--agent">
        A race in the retry queue dropped the 2nd attempt. Patching the backoff and
        re-running now.
      </div>
      <div className="ln-eng__commit-chip">
        <span className="ln-eng__commit-dot" />
        pushed fix · +1 commit · re-scan clean
      </div>
    </div>
  );
}

function ContextVisual() {
  const sources = ["Docs", "Jira", "ADRs"];
  return (
    <div className="ln-eng__context" aria-hidden="true">
      <div className="ln-eng__sources">
        {sources.map((s) => (
          <span key={s} className="ln-eng__source">
            {s}
          </span>
        ))}
      </div>
      <svg viewBox="0 0 260 60" className="ln-eng__context-wires" aria-hidden="true">
        <path d="M40 4 C40 40, 130 20, 130 52" />
        <path d="M130 4 L130 52" />
        <path d="M220 4 C220 40, 130 20, 130 52" />
      </svg>
      <div className="ln-eng__core">
        <span className="ln-eng__core-dot" />
        AutoHeal context engine
      </div>
    </div>
  );
}

function OversightVisual() {
  return (
    <div className="ln-eng__pr" aria-hidden="true">
      <div className="ln-eng__pr-head">
        <span className="ln-eng__pr-branch">autoheal:fix/retry-backoff → main</span>
        <span className="ln-eng__pr-state">Open</span>
      </div>
      <p className="ln-eng__pr-line">
        <span className="ln-eng__pr-add">+ await queue.flush(&#123; retries: 5 &#125;)</span>
      </p>
      <p className="ln-eng__pr-line">
        <span className="ln-eng__pr-del">- queue.flush()</span>
      </p>
      <div className="ln-eng__pr-actions">
        <span className="ln-eng__pr-note">Awaiting your approval</span>
        <span className="ln-eng__pr-btn ln-eng__pr-btn--ghost">Edit</span>
        <span className="ln-eng__pr-btn ln-eng__pr-btn--go">Approve & merge</span>
      </div>
    </div>
  );
}

const VISUALS: Record<string, ReactNode> = {
  codebase: <CodebaseVisual />,
  conversational: <ConversationalVisual />,
  context: <ContextVisual />,
  oversight: <OversightVisual />,
};

export function ArchitectureEngine() {
  const prefersReducedMotion = useReducedMotion();
  const animate = !prefersReducedMotion;

  return (
    <section className="landing-v2 ln-eng" id="architecture" data-landing="true">
      <div className="ln-container">
        <motion.div
          className="ln-eng__intro"
          initial={animate ? { opacity: 0, y: 24 } : false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, ease: easeOut }}
        >
          <p className="ln-eyebrow ln-eng__eyebrow">The Architecture Engine</p>
          <h2 className="ln-display ln-eng__title">
            The mechanism behind the autonomy.
          </h2>
          <p className="ln-body ln-eng__lede">
            Four engineering capabilities work in concert — so every fix is informed,
            safe, and fully under your control.
          </p>
        </motion.div>

        <div className="ln-eng__rows">
          {ITEMS.map((item, index) => {
            const reverse = index % 2 === 1;
            return (
              <motion.div
                key={item.id}
                className="ln-eng__row"
                data-reverse={reverse}
                style={
                  {
                    "--row-accent": item.accent,
                    "--row-glow": item.glow,
                  } as React.CSSProperties
                }
                initial={animate ? "hidden" : false}
                whileInView="visible"
                viewport={{ once: true, margin: "-120px" }}
              >
                <motion.div
                  className="ln-eng__text"
                  variants={{
                    hidden: { opacity: 0, x: reverse ? 30 : -30 },
                    visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: easeOut } },
                  }}
                >
                  <span className="ln-eng__row-eyebrow">{item.eyebrow}</span>
                  <h3 className="ln-eng__row-title">{item.title}</h3>
                  <p className="ln-eng__row-body">{item.body}</p>
                </motion.div>

                <motion.div
                  className="ln-eng__art"
                  variants={{
                    hidden: { opacity: 0, scale: 0.94, x: reverse ? -24 : 24 },
                    visible: { opacity: 1, scale: 1, x: 0, transition: { duration: 0.6, ease: easeOut, delay: 0.1 } },
                  }}
                >
                  <div className="ln-eng__art-glow" aria-hidden="true" />
                  <div className="ln-eng__art-frame">{VISUALS[item.id]}</div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <style jsx global>{`
        .ln-eng {
          position: relative;
          overflow: hidden;
          padding-top: var(--ln-space-24);
          padding-bottom: var(--ln-space-24);
          background: var(--ln-bg);
        }

        .ln-eng__intro {
          text-align: center;
          max-width: 720px;
          margin-inline: auto;
          margin-bottom: var(--ln-space-20);
        }

        .ln-eng__eyebrow {
          display: inline-block;
          padding: var(--ln-space-2) var(--ln-space-4);
          border: 1px solid color-mix(in srgb, var(--ln-accent-violet) 28%, transparent);
          border-radius: var(--ln-radius-full);
          background: color-mix(in srgb, var(--ln-accent-violet) 10%, transparent);
          margin-bottom: var(--ln-space-6);
          color: var(--ln-accent-violet-bright);
        }

        .ln-eng__title {
          font-size: var(--ln-text-xl);
          color: var(--ln-heading);
        }

        .ln-eng__lede {
          max-width: 600px;
          margin-inline: auto;
          margin-top: var(--ln-space-6);
        }

        .ln-eng__rows {
          display: flex;
          flex-direction: column;
          gap: var(--ln-space-24);
        }

        .ln-eng__row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          align-items: center;
          gap: var(--ln-space-16);
        }

        .ln-eng__row[data-reverse="true"] {
          direction: rtl;
        }

        .ln-eng__row[data-reverse="true"] > * {
          direction: ltr;
        }

        .ln-eng__row-eyebrow {
          font-family: var(--ln-font-mono);
          font-size: var(--ln-text-xs);
          letter-spacing: var(--ln-tracking-wider);
          text-transform: uppercase;
          color: var(--row-accent);
        }

        .ln-eng__row-title {
          margin: var(--ln-space-4) 0 var(--ln-space-4);
          font-family: var(--ln-font-display);
          font-size: var(--ln-text-lg);
          font-weight: 700;
          line-height: var(--ln-leading-snug);
          letter-spacing: var(--ln-tracking-tight);
          color: var(--ln-heading);
        }

        .ln-eng__row-body {
          margin: 0;
          font-family: var(--ln-font-body);
          font-size: var(--ln-text-base);
          line-height: var(--ln-leading-normal);
          color: var(--ln-muted);
        }

        /* visual frame ---------------------------------------------------------- */
        .ln-eng__art {
          position: relative;
        }

        .ln-eng__art-glow {
          position: absolute;
          inset: 8% 12%;
          background: radial-gradient(60% 60% at 50% 50%, var(--row-glow), transparent 70%);
          filter: blur(44px);
          pointer-events: none;
        }

        .ln-eng__art-frame {
          position: relative;
          display: grid;
          place-items: center;
          min-height: 240px;
          padding: var(--ln-space-8);
          border: 1px solid var(--ln-line-strong);
          border-radius: var(--ln-radius-xl);
          background: var(--ln-glass);
          backdrop-filter: blur(26px) saturate(140%);
          -webkit-backdrop-filter: blur(26px) saturate(140%);
          box-shadow: var(--ln-shadow-lg);
          overflow: hidden;
          transition: transform 0.4s var(--ln-ease-spring),
            box-shadow 0.4s var(--ln-ease-out), border-color 0.4s var(--ln-ease-out);
        }

        /* animated accent border ring that traces the frame */
        .ln-eng__art-frame::before {
          content: "";
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1px;
          background: conic-gradient(
            from var(--ln-eng-angle, 0deg),
            transparent 0deg,
            color-mix(in srgb, var(--row-accent) 85%, transparent) 60deg,
            transparent 160deg,
            transparent 360deg
          );
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0;
          transition: opacity 0.4s var(--ln-ease-out);
          animation: ln-eng-rotate 6s linear infinite;
        }

        /* faint dotted texture inside the frame */
        .ln-eng__art-frame::after {
          content: "";
          position: absolute;
          inset: 0;
          background-image: radial-gradient(var(--ln-line-soft) 1px, transparent 1px);
          background-size: 22px 22px;
          -webkit-mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, #000, transparent 75%);
          mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, #000, transparent 75%);
          opacity: 0.5;
          pointer-events: none;
        }

        .ln-eng__row:hover .ln-eng__art-frame {
          transform: translateY(-6px);
          border-color: color-mix(in srgb, var(--row-accent) 45%, var(--ln-line-strong));
          box-shadow: var(--ln-shadow-xl), 0 0 40px var(--row-glow);
        }

        .ln-eng__row:hover .ln-eng__art-frame::before {
          opacity: 1;
        }

        @property --ln-eng-angle {
          syntax: "<angle>";
          inherits: false;
          initial-value: 0deg;
        }

        @keyframes ln-eng-rotate {
          to {
            --ln-eng-angle: 360deg;
          }
        }

        .ln-eng__art-svg {
          width: 100%;
          max-width: 320px;
          height: auto;
        }

        .ln-eng__art-tag {
          fill: var(--ln-faint);
          font-family: var(--ln-font-mono);
          font-size: 11px;
        }

        /* codebase graph */
        .ln-eng__edges line {
          stroke: var(--ln-line-strong);
          stroke-width: 1.5;
          stroke-dasharray: 3 6;
          animation: ln-eng-dash 16s linear infinite;
        }
        @keyframes ln-eng-dash {
          to { stroke-dashoffset: -100; }
        }
        .ln-eng__node {
          fill: var(--ln-glass-hi);
          stroke: color-mix(in srgb, var(--row-accent) 50%, var(--ln-line-strong));
          stroke-width: 1.5;
          transform-box: fill-box;
          transform-origin: center;
          animation: ln-eng-node-pulse 3.2s var(--ln-ease-in-out) infinite;
        }
        .ln-eng__nodes circle:nth-child(2) { animation-delay: 0.3s; }
        .ln-eng__nodes circle:nth-child(3) { animation-delay: 0.6s; }
        .ln-eng__nodes circle:nth-child(4) { animation-delay: 0.9s; }
        .ln-eng__node--hot {
          fill: color-mix(in srgb, var(--row-accent) 22%, transparent);
          stroke: var(--row-accent);
          filter: drop-shadow(0 0 12px var(--row-glow));
          animation: ln-eng-hot-pulse 2.4s var(--ln-ease-in-out) infinite;
        }

        @keyframes ln-eng-node-pulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        @keyframes ln-eng-hot-pulse {
          0%, 100% {
            filter: drop-shadow(0 0 8px var(--row-glow));
            transform: scale(1);
          }
          50% {
            filter: drop-shadow(0 0 18px var(--row-glow));
            transform: scale(1.12);
          }
        }

        /* conversational chat */
        .ln-eng__chat {
          display: flex;
          flex-direction: column;
          gap: var(--ln-space-3);
          width: 100%;
          max-width: 360px;
        }
        .ln-eng__bubble {
          padding: var(--ln-space-3) var(--ln-space-4);
          border-radius: var(--ln-radius);
          font-size: var(--ln-text-sm);
          line-height: 1.5;
          border: 1px solid var(--ln-line-soft);
        }
        .ln-eng__bubble--user {
          align-self: flex-end;
          max-width: 80%;
          color: var(--ln-heading);
          background: color-mix(in srgb, var(--row-accent) 14%, transparent);
          border-color: color-mix(in srgb, var(--row-accent) 30%, transparent);
        }
        .ln-eng__bubble--user span {
          font-family: var(--ln-font-mono);
          color: var(--row-accent);
        }
        .ln-eng__bubble--agent {
          align-self: flex-start;
          max-width: 88%;
          color: var(--ln-ink);
          background: rgba(255, 255, 255, 0.03);
        }
        .ln-eng__commit-chip {
          align-self: flex-start;
          display: inline-flex;
          align-items: center;
          gap: var(--ln-space-2);
          padding: var(--ln-space-2) var(--ln-space-3);
          border-radius: var(--ln-radius-full);
          font-family: var(--ln-font-mono);
          font-size: var(--ln-text-xs);
          color: var(--ln-accent-lime-bright);
          background: color-mix(in srgb, var(--ln-accent-lime-bright) 10%, transparent);
          border: 1px solid color-mix(in srgb, var(--ln-accent-lime-bright) 28%, transparent);
        }
        .ln-eng__commit-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--ln-accent-lime-bright);
          box-shadow: 0 0 8px var(--ln-success-glow);
        }

        /* context sources */
        .ln-eng__context {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          width: 100%;
          max-width: 320px;
        }
        .ln-eng__sources {
          display: flex;
          justify-content: space-between;
          width: 100%;
          padding: 0 var(--ln-space-2);
        }
        .ln-eng__source {
          padding: var(--ln-space-2) var(--ln-space-4);
          border-radius: var(--ln-radius);
          font-family: var(--ln-font-mono);
          font-size: var(--ln-text-xs);
          color: var(--ln-ink);
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid var(--ln-line-strong);
        }
        .ln-eng__context-wires {
          width: 100%;
          height: 56px;
        }
        .ln-eng__context-wires path {
          fill: none;
          stroke: color-mix(in srgb, var(--row-accent) 45%, transparent);
          stroke-width: 1.5;
          stroke-dasharray: 4 8;
          animation: ln-eng-flow 1.4s linear infinite;
        }
        @keyframes ln-eng-flow {
          to { stroke-dashoffset: -24; }
        }
        .ln-eng__core {
          display: inline-flex;
          align-items: center;
          gap: var(--ln-space-2);
          padding: var(--ln-space-3) var(--ln-space-5);
          border-radius: var(--ln-radius-full);
          font-family: var(--ln-font-mono);
          font-size: var(--ln-text-sm);
          color: var(--ln-heading);
          background: color-mix(in srgb, var(--row-accent) 14%, transparent);
          border: 1px solid color-mix(in srgb, var(--row-accent) 40%, transparent);
          box-shadow: 0 0 24px var(--row-glow);
        }
        .ln-eng__core-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--row-accent);
          box-shadow: 0 0 10px var(--row-accent);
        }

        /* oversight PR card */
        .ln-eng__pr {
          width: 100%;
          max-width: 360px;
          display: flex;
          flex-direction: column;
          gap: var(--ln-space-2);
          font-family: var(--ln-font-mono);
        }
        .ln-eng__pr-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--ln-space-3);
          margin-bottom: var(--ln-space-2);
        }
        .ln-eng__pr-branch {
          font-size: var(--ln-text-xs);
          color: var(--ln-ink);
        }
        .ln-eng__pr-state {
          font-size: 0.62rem;
          letter-spacing: 0.06em;
          padding: 2px 8px;
          border-radius: var(--ln-radius-full);
          color: var(--row-accent);
          border: 1px solid color-mix(in srgb, var(--row-accent) 40%, transparent);
          background: color-mix(in srgb, var(--row-accent) 12%, transparent);
        }
        .ln-eng__pr-line {
          margin: 0;
          font-size: var(--ln-text-xs);
          padding: var(--ln-space-1) var(--ln-space-3);
          border-radius: var(--ln-radius-sm);
          background: rgba(255, 255, 255, 0.02);
        }
        .ln-eng__pr-add {
          color: var(--ln-accent-lime-bright);
        }
        .ln-eng__pr-del {
          color: var(--ln-danger);
        }
        .ln-eng__pr-actions {
          display: flex;
          align-items: center;
          gap: var(--ln-space-2);
          margin-top: var(--ln-space-3);
        }
        .ln-eng__pr-note {
          margin-right: auto;
          font-size: var(--ln-text-xs);
          color: #fbbf24;
        }
        .ln-eng__pr-btn {
          padding: var(--ln-space-2) var(--ln-space-3);
          border-radius: var(--ln-radius-sm);
          font-size: var(--ln-text-xs);
          border: 1px solid var(--ln-line-strong);
          color: var(--ln-ink);
        }
        .ln-eng__pr-btn--go {
          color: #0a0712;
          background: var(--ln-accent-lime-bright);
          border-color: transparent;
          font-weight: 700;
        }

        @media (prefers-reduced-motion: reduce) {
          .ln-eng__edges line,
          .ln-eng__context-wires path {
            animation: none !important;
          }
        }

        @media (max-width: 880px) {
          .ln-eng {
            padding-top: var(--ln-space-16);
            padding-bottom: var(--ln-space-16);
          }
          .ln-eng__title {
            font-size: var(--ln-text-lg);
          }
          .ln-eng__rows {
            gap: var(--ln-space-16);
          }
          .ln-eng__row,
          .ln-eng__row[data-reverse="true"] {
            grid-template-columns: 1fr;
            gap: var(--ln-space-8);
            direction: ltr;
          }
          .ln-eng__art {
            order: -1;
          }
          .ln-eng__art-frame {
            min-height: 200px;
          }
        }
      `}</style>
    </section>
  );
}

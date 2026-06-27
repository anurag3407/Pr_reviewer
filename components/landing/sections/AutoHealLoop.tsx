"use client";

import { motion, useReducedMotion } from "framer-motion";

const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.12 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: easeOut },
  },
};

const stepVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: easeOut },
  },
};

interface LoopNode {
  id: string;
  index: string;
  title: string;
  body: string;
  accent: string;
  glow: string;
  cx: number;
}

const NODES: LoopNode[] = [
  {
    id: "monitor",
    index: "01",
    title: "Monitor",
    body:
      "The agent continuously watches the CI/CD pipeline for build failures or test regressions.",
    accent: "var(--ln-accent-cyan)",
    glow: "rgba(56, 189, 248, 0.55)",
    cx: 120,
  },
  {
    id: "triage",
    index: "02",
    title: "Triage & Isolate",
    body:
      "The multi-agent system identifies the exact faulty commit and dependency conflict.",
    accent: "var(--ln-accent-violet)",
    glow: "rgba(167, 139, 250, 0.55)",
    cx: 380,
  },
  {
    id: "heal",
    index: "03",
    title: "Self-Correction Loop",
    body:
      "The engine enters an automated loop, attempting to repair the code, run tests, and verify the fix up to 5 times.",
    accent: "var(--ln-accent-lime)",
    glow: "rgba(52, 211, 153, 0.55)",
    cx: 620,
  },
  {
    id: "human",
    index: "04",
    title: "Human-in-the-Loop",
    body:
      "If the repair requires complex architectural decisions, the loop pauses and flags a human engineer, providing a detailed root-cause analysis and suggested paths forward.",
    accent: "#fbbf24",
    glow: "rgba(251, 191, 36, 0.55)",
    cx: 860,
  },
];

const NODE_W = 176;
const NODE_H = 92;
const NODE_Y = 150;
const HALF = NODE_W / 2;

function NodeIcon({ id, color }: { id: string; color: string }) {
  switch (id) {
    case "monitor":
      return (
        <g stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round">
          <circle cx={0} cy={0} r={2.4} fill={color} stroke="none" />
          <path d="M-6 0a6 6 0 0 1 6-6" />
          <path d="M-10 0a10 10 0 0 1 10-10" />
        </g>
      );
    case "triage":
      return (
        <g stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round">
          <circle cx={0} cy={0} r={7} />
          <path d="M0 -11v4M0 7v4M-11 0h4M7 0h4" />
          <circle cx={0} cy={0} r={1.8} fill={color} stroke="none" />
        </g>
      );
    case "heal":
      return (
        <g stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 -2a9 9 0 1 0 -2.2 6.4" />
          <path d="M9 -8v6h-6" />
        </g>
      );
    case "human":
    default:
      return (
        <g stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle cx={0} cy={-4} r={4} />
          <path d="M-7 10c0-5 3.2-8 7-8s7 3 7 8" />
        </g>
      );
  }
}

export function AutoHealLoop() {
  const prefersReducedMotion = useReducedMotion();
  const animate = !prefersReducedMotion;

  return (
    <section className="landing-v2 ln-loop" id="engine" data-landing="true">
      <div className="ln-container">
        <motion.div
          className="ln-loop__intro"
          initial={animate ? "hidden" : false}
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
        >
          <motion.p variants={itemVariants} className="ln-eyebrow ln-loop__eyebrow">
            The AutoHeal Loop
          </motion.p>
          <motion.h2 variants={itemVariants} className="ln-display ln-loop__title">
            A closed loop that doesn&apos;t
            <br />
            <span className="ln-loop__gradient">rest until the build is green.</span>
          </motion.h2>
          <motion.p variants={itemVariants} className="ln-body ln-loop__body">
            Four agents, one continuous cycle. AutoHeal watches, diagnoses, repairs,
            and verifies — escalating to a human only when the decision is truly
            architectural.
          </motion.p>
        </motion.div>

        <motion.div
          className="ln-loop__panel"
          initial={animate ? { opacity: 0, y: 30 } : false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: easeOut }}
        >
          <div className="ln-loop__panel-glow" aria-hidden="true" />

          <svg
            className="ln-loop__svg"
            viewBox="0 0 980 300"
            role="img"
            aria-label="AutoHeal cycle: Monitor, Triage and Isolate, Self-Correction Loop with up to five attempts, then Human-in-the-Loop"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient id="ln-loop-flow" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--ln-accent-cyan)" />
                <stop offset="50%" stopColor="var(--ln-accent-violet)" />
                <stop offset="100%" stopColor="var(--ln-accent-lime)" />
              </linearGradient>
            </defs>

            {/* connectors between consecutive nodes */}
            {NODES.slice(0, -1).map((node, i) => {
              const next = NODES[i + 1];
              const x1 = node.cx + HALF;
              const x2 = next.cx - HALF;
              const y = NODE_Y;
              return (
                <g key={`link-${node.id}`}>
                  <line
                    x1={x1}
                    y1={y}
                    x2={x2}
                    y2={y}
                    className="ln-loop__wire"
                  />
                  <line
                    x1={x1}
                    y1={y}
                    x2={x2}
                    y2={y}
                    className="ln-loop__flow"
                    style={{ animationDelay: `${i * 0.4}s` }}
                  />
                  <path
                    d={`M${x2 - 9} ${y - 5} L${x2} ${y} L${x2 - 9} ${y + 5}`}
                    className="ln-loop__arrow"
                  />
                </g>
              );
            })}

            {/* self-correction retry arc above node 03 */}
            <g>
              <path
                d="M576 116 C576 64, 664 64, 664 116"
                className="ln-loop__retry"
              />
              <path
                d="M576 116 C576 64, 664 64, 664 116"
                className="ln-loop__retry-flow"
              />
              <path d="M664 116 l-6 -7 m6 7 l7 -5" className="ln-loop__arrow ln-loop__arrow--retry" />
              <text x="620" y="70" className="ln-loop__retry-label" textAnchor="middle">
                retry ≤ 5
              </text>
              {[0, 1, 2, 3, 4].map((n) => (
                <circle
                  key={n}
                  cx={596 + n * 12}
                  cy={92}
                  r={3}
                  className="ln-loop__tick"
                  style={{ animationDelay: `${n * 0.22}s` }}
                />
              ))}
            </g>

            {/* nodes */}
            {NODES.map((node) => {
              const x = node.cx - HALF;
              const y = NODE_Y - NODE_H / 2;
              return (
                <g
                  key={node.id}
                  className="ln-loop__node"
                  style={{ "--node-accent": node.accent, "--node-glow": node.glow } as React.CSSProperties}
                >
                  <rect
                    x={x}
                    y={y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={16}
                    className="ln-loop__node-box"
                  />
                  <g transform={`translate(${node.cx}, ${y + 28})`}>
                    <NodeIcon id={node.id} color={node.accent} />
                  </g>
                  <text
                    x={node.cx}
                    y={y + 58}
                    className="ln-loop__node-index"
                    textAnchor="middle"
                  >
                    {node.index}
                  </text>
                  <text
                    x={node.cx}
                    y={y + 76}
                    className="ln-loop__node-title"
                    textAnchor="middle"
                  >
                    {node.title}
                  </text>
                </g>
              );
            })}
          </svg>

          <motion.ol
            className="ln-loop__steps"
            initial={animate ? "hidden" : false}
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={containerVariants}
          >
            {NODES.map((node) => (
              <motion.li
                key={node.id}
                className="ln-loop__step"
                variants={stepVariants}
                style={{ "--node-accent": node.accent } as React.CSSProperties}
              >
                <span className="ln-loop__step-index">{node.index}</span>
                <h3 className="ln-loop__step-title">{node.title}</h3>
                <p className="ln-loop__step-body">{node.body}</p>
              </motion.li>
            ))}
          </motion.ol>
        </motion.div>
      </div>

      <style jsx>{`
        .ln-loop {
          position: relative;
          overflow: hidden;
          padding-top: var(--ln-space-24);
          padding-bottom: var(--ln-space-24);
          background:
            radial-gradient(900px 500px at 50% -10%, rgba(139, 92, 246, 0.08), transparent 65%),
            var(--ln-bg);
          border-top: 1px solid var(--ln-line-soft);
          border-bottom: 1px solid var(--ln-line-soft);
        }

        .ln-loop__intro {
          text-align: center;
          max-width: 760px;
          margin-inline: auto;
          margin-bottom: var(--ln-space-12);
        }

        .ln-loop__eyebrow {
          display: inline-block;
          padding: var(--ln-space-2) var(--ln-space-4);
          border: 1px solid color-mix(in srgb, var(--ln-accent) 28%, transparent);
          border-radius: var(--ln-radius-full);
          background: color-mix(in srgb, var(--ln-accent) 10%, transparent);
          margin-bottom: var(--ln-space-6);
        }

        .ln-loop__title {
          font-size: var(--ln-text-xl);
          color: var(--ln-heading);
        }

        .ln-loop__gradient {
          background: linear-gradient(120deg, var(--ln-accent-cyan), var(--ln-accent-lime));
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .ln-loop__body {
          max-width: 620px;
          margin-inline: auto;
          margin-top: var(--ln-space-6);
        }

        /* glass panel ----------------------------------------------------------- */
        .ln-loop__panel {
          position: relative;
          border: 1px solid var(--ln-line-strong);
          border-radius: var(--ln-radius-xl);
          background: var(--ln-glass);
          backdrop-filter: blur(30px) saturate(140%);
          -webkit-backdrop-filter: blur(30px) saturate(140%);
          box-shadow: var(--ln-shadow-xl);
          padding: var(--ln-space-10) var(--ln-space-8) var(--ln-space-8);
          overflow: hidden;
        }

        .ln-loop__panel-glow {
          position: absolute;
          inset: -20% -10% auto -10%;
          height: 60%;
          background: radial-gradient(60% 80% at 50% 0%, rgba(139, 92, 246, 0.16), transparent 70%);
          filter: blur(40px);
          pointer-events: none;
        }

        .ln-loop__svg {
          position: relative;
          z-index: 1;
          display: block;
          width: 100%;
          height: auto;
          overflow: visible;
        }

        .ln-loop__wire {
          stroke: var(--ln-line-strong);
          stroke-width: 2;
        }

        .ln-loop__flow {
          stroke: url(#ln-loop-flow);
          stroke-width: 2.4;
          stroke-linecap: round;
          stroke-dasharray: 5 13;
          filter: drop-shadow(0 0 4px rgba(139, 92, 246, 0.5));
          animation: ln-loop-march 1.1s linear infinite;
        }

        @keyframes ln-loop-march {
          to {
            stroke-dashoffset: -18;
          }
        }

        .ln-loop__arrow {
          stroke: var(--ln-line-strong);
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
          fill: none;
        }

        .ln-loop__arrow--retry {
          stroke: var(--ln-accent-lime);
        }

        .ln-loop__retry {
          fill: none;
          stroke: color-mix(in srgb, var(--ln-accent-lime) 35%, transparent);
          stroke-width: 2;
        }

        .ln-loop__retry-flow {
          fill: none;
          stroke: var(--ln-accent-lime);
          stroke-width: 2.4;
          stroke-linecap: round;
          stroke-dasharray: 4 12;
          filter: drop-shadow(0 0 4px rgba(52, 211, 153, 0.6));
          animation: ln-loop-march 1s linear infinite;
        }

        .ln-loop__retry-label {
          fill: var(--ln-accent-lime-bright);
          font-family: var(--ln-font-mono);
          font-size: 12px;
          letter-spacing: 0.04em;
        }

        .ln-loop__tick {
          fill: var(--ln-accent-lime);
          opacity: 0.3;
          animation: ln-loop-tick 1.1s ease-in-out infinite;
        }

        @keyframes ln-loop-tick {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 1; }
        }

        .ln-loop__node-box {
          fill: var(--ln-glass-hi);
          stroke: color-mix(in srgb, var(--node-accent) 45%, var(--ln-line-strong));
          stroke-width: 1.5;
          filter: drop-shadow(0 0 16px var(--node-glow));
        }

        .ln-loop__node-index {
          fill: var(--node-accent);
          font-family: var(--ln-font-mono);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
        }

        .ln-loop__node-title {
          fill: var(--ln-heading);
          font-family: var(--ln-font-display);
          font-size: 14px;
          font-weight: 600;
        }

        /* step descriptions ----------------------------------------------------- */
        .ln-loop__steps {
          position: relative;
          z-index: 1;
          list-style: none;
          margin: var(--ln-space-10) 0 0;
          padding: 0;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: var(--ln-space-5);
        }

        .ln-loop__step {
          position: relative;
          padding: var(--ln-space-5);
          border: 1px solid var(--ln-line-soft);
          border-top: 2px solid var(--node-accent);
          border-radius: var(--ln-radius-lg);
          background: rgba(255, 255, 255, 0.018);
        }

        .ln-loop__step-index {
          font-family: var(--ln-font-mono);
          font-size: var(--ln-text-xs);
          font-weight: 700;
          letter-spacing: 0.1em;
          color: var(--node-accent);
        }

        .ln-loop__step-title {
          margin: var(--ln-space-2) 0 var(--ln-space-3);
          font-family: var(--ln-font-display);
          font-size: var(--ln-text-base);
          font-weight: 700;
          letter-spacing: -0.01em;
          color: var(--ln-heading);
        }

        .ln-loop__step-body {
          margin: 0;
          font-family: var(--ln-font-body);
          font-size: var(--ln-text-sm);
          line-height: 1.55;
          color: var(--ln-muted);
        }

        @media (prefers-reduced-motion: reduce) {
          .ln-loop__flow,
          .ln-loop__retry-flow,
          .ln-loop__tick {
            animation: none !important;
          }
          .ln-loop__flow,
          .ln-loop__retry-flow {
            stroke-dasharray: none;
            opacity: 0.7;
          }
          .ln-loop__tick {
            opacity: 0.8;
          }
        }

        @media (max-width: 900px) {
          .ln-loop {
            padding-top: var(--ln-space-16);
            padding-bottom: var(--ln-space-16);
          }
          .ln-loop__title {
            font-size: var(--ln-text-lg);
          }
          .ln-loop__panel {
            padding: var(--ln-space-6) var(--ln-space-5);
          }
          .ln-loop__steps {
            grid-template-columns: repeat(2, 1fr);
            gap: var(--ln-space-4);
          }
        }

        @media (max-width: 560px) {
          .ln-loop__steps {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}

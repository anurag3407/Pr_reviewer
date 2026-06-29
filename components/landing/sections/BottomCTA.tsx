"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.12,
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

export function BottomCTA() {
  const prefersReducedMotion = useReducedMotion();
  const animate = !prefersReducedMotion;

  return (
    <section className="landing-v2 ln-bottom-cta" id="bottom-cta" data-landing="true">
      <div className="ln-container ln-bottom-cta__container">
        <motion.div
          className="ln-bottom-cta__card"
          initial={animate ? "hidden" : false}
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
        >
          <div className="ln-bottom-cta__glow" aria-hidden="true" />
          <motion.p variants={itemVariants} className="ln-eyebrow ln-bottom-cta__eyebrow">
            Autonomous DevOps
          </motion.p>

          <motion.h2 variants={itemVariants} className="ln-display ln-bottom-cta__title">
            Ready to ship unbreakable code?
          </motion.h2>

          <motion.p variants={itemVariants} className="ln-body ln-bottom-cta__body">
            Join the next generation of autonomous DevOps and let your pipelines heal
            themselves.
          </motion.p>

          <motion.div variants={itemVariants} className="ln-bottom-cta__actions">
            <Link href="/sign-up" className="ln-bottom-cta__btn ln-bottom-cta__btn--primary">
              Deploy AutoHeal Today
            </Link>
            <Link href="#engine" className="ln-bottom-cta__btn ln-bottom-cta__btn--secondary">
              Read the Documentation
            </Link>
          </motion.div>
        </motion.div>
      </div>

      <style jsx global>{`
        .ln-bottom-cta {
          position: relative;
          overflow: hidden;
          padding-top: var(--ln-space-24);
          padding-bottom: var(--ln-space-24);
          background: var(--ln-bg-elevated);
          border-top: 1px solid var(--ln-line-soft);
        }

        .ln-bottom-cta__container {
          position: relative;
          z-index: 1;
        }

        .ln-bottom-cta__card {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          max-width: 760px;
          margin-inline: auto;
          padding: var(--ln-space-20) var(--ln-space-12);
          border: 1px solid var(--ln-line-strong);
          border-radius: var(--ln-radius-xl);
          background: var(--ln-glass);
          backdrop-filter: blur(30px) saturate(140%);
          -webkit-backdrop-filter: blur(30px) saturate(140%);
          box-shadow: var(--ln-shadow-xl);
          overflow: hidden;
        }

        .ln-bottom-cta__glow {
          position: absolute;
          top: -60%;
          left: 50%;
          transform: translateX(-50%);
          width: 80%;
          height: 80%;
          background: radial-gradient(50% 50% at 50% 50%, var(--ln-accent-glow), transparent 70%);
          filter: blur(40px);
          pointer-events: none;
          opacity: 0.5;
        }

        .ln-bottom-cta__eyebrow {
          position: relative;
          display: inline-block;
          padding: var(--ln-space-2) var(--ln-space-4);
          border: 1px solid color-mix(in srgb, var(--ln-accent-violet) 24%, transparent);
          border-radius: var(--ln-radius-full);
          background: color-mix(in srgb, var(--ln-accent-violet) 6%, transparent);
          margin-bottom: var(--ln-space-6);
          color: var(--ln-accent-violet-bright);
        }

        .ln-bottom-cta__title {
          position: relative;
          font-size: var(--ln-text-xl);
          color: var(--ln-heading);
        }

        .ln-bottom-cta__body {
          position: relative;
          max-width: 520px;
          margin-top: var(--ln-space-6);
        }

        .ln-bottom-cta__actions {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: var(--ln-space-4);
          margin-top: var(--ln-space-10);
        }

        .ln-bottom-cta__btn {
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
          transition: transform 0.12s var(--ln-ease-out),
            background 0.18s var(--ln-ease-out),
            box-shadow 0.18s var(--ln-ease-out),
            border-color 0.18s var(--ln-ease-out);
        }

        .ln-bottom-cta__btn:hover {
          transform: translateY(-2px);
        }

        .ln-bottom-cta__btn {
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }

        .ln-bottom-cta__btn--primary {
          color: #0a0712;
          font-weight: 700;
          background: linear-gradient(
            120deg,
            var(--ln-accent-violet-bright),
            var(--ln-accent-violet) 55%,
            var(--ln-accent-cyan)
          );
          background-size: 180% 180%;
          box-shadow: 0 8px 28px var(--ln-accent-glow), inset 0 1px 0 rgba(255, 255, 255, 0.4);
          animation: ln-gradient-pan 7s var(--ln-ease-in-out) infinite;
        }

        .ln-bottom-cta__btn--primary::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          background: linear-gradient(
            110deg,
            transparent 25%,
            rgba(255, 255, 255, 0.5) 50%,
            transparent 75%
          );
          background-size: 220% 100%;
          background-position: -160% 0;
          animation: ln-shimmer 4s var(--ln-ease-in-out) infinite;
        }

        .ln-bottom-cta__btn--primary:hover {
          box-shadow: 0 16px 44px var(--ln-accent-glow), inset 0 1px 0 rgba(255, 255, 255, 0.45);
        }

        .ln-bottom-cta__btn--secondary {
          color: var(--ln-heading);
          background: var(--ln-glass);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid var(--ln-line-strong);
          box-shadow: var(--ln-shadow-sm);
        }

        .ln-bottom-cta__btn--secondary:hover {
          border-color: var(--ln-accent);
          box-shadow: 0 0 24px var(--ln-accent-glow);
        }

        @media (prefers-reduced-motion: reduce) {
          .ln-bottom-cta__glow {
            animation: none !important;
          }
        }

        @media (max-width: 900px) {
          .ln-bottom-cta {
            padding-top: var(--ln-space-16);
            padding-bottom: var(--ln-space-16);
          }
          .ln-bottom-cta__card {
            padding: var(--ln-space-16) var(--ln-space-8);
          }
          .ln-bottom-cta__title {
            font-size: var(--ln-text-lg);
          }
        }

        @media (max-width: 640px) {
          .ln-bottom-cta__title {
            font-size: var(--ln-text-md);
          }
          .ln-bottom-cta__actions {
            flex-direction: column;
            align-items: stretch;
            width: 100%;
            max-width: 320px;
          }
          .ln-bottom-cta__btn {
            padding: var(--ln-space-3) var(--ln-space-6);
          }
        }
      `}</style>
    </section>
  );
}

"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: easeOut,
    },
  },
};

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.235-.015-2.25-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const linkColumns = [
  {
    title: "Product",
    links: [
      { label: "The AutoHeal Loop", href: "#engine" as const },
      { label: "Architecture Engine", href: "#architecture" as const },
      { label: "Install AutoHeal", href: "/sign-up" as const },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
    ],
  },
];

export function Footer() {
  const prefersReducedMotion = useReducedMotion();
  const animate = !prefersReducedMotion;

  return (
    <footer className="landing-v2 ln-footer" id="footer" data-landing="true">
      <div className="ln-container ln-footer__container">
        <motion.div
          className="ln-footer__content"
          initial={animate ? "hidden" : false}
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={containerVariants}
        >
          <motion.div variants={itemVariants} className="ln-footer__brand">
            <Link href="/" className="ln-footer__brand-link">
              <span className="ln-footer__logo-glyph" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M21 12a9 9 0 1 1-3.5-7.1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M8.5 12.5l2.2 2.2L16 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="ln-footer__logo">Autoheal</span>
            </Link>
            <p className="ln-footer__tagline">
              Autonomous pipeline healing. Zero downtime.
            </p>
          </motion.div>

          <nav className="ln-footer__links" aria-label="Footer navigation">
            {linkColumns.map((column) => (
              <motion.div key={column.title} variants={itemVariants} className="ln-footer__column">
                <h3 className="ln-footer__column-title">{column.title}</h3>
                <ul className="ln-footer__column-list">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className="ln-footer__link">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </nav>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="ln-footer__meta"
          initial={animate ? "hidden" : false}
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
        >
          <p className="ln-footer__copyright">
            © 2026 Autoheal. All rights reserved.
          </p>

          <div className="ln-footer__social">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="ln-footer__social-link"
              aria-label="GitHub"
            >
              <GitHubIcon />
            </a>
            <a
              href="https://x.com"
              target="_blank"
              rel="noopener noreferrer"
              className="ln-footer__social-link"
              aria-label="X (Twitter)"
            >
              <XIcon />
            </a>
          </div>
        </motion.div>
      </div>

      <style jsx>{`
        .ln-footer {
          position: relative;
          padding-top: var(--ln-space-20);
          padding-bottom: var(--ln-space-8);
          background: var(--ln-bg-elevated);
          border-top: 1px solid var(--ln-line);
        }

        .ln-footer__container {
          display: flex;
          flex-direction: column;
          gap: var(--ln-space-12);
        }

        .ln-footer__content {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: var(--ln-space-12);
          align-items: start;
        }

        .ln-footer__brand {
          display: flex;
          flex-direction: column;
          gap: var(--ln-space-3);
          max-width: 320px;
        }

        .ln-footer__brand-link {
          display: inline-flex;
          align-items: center;
          gap: var(--ln-space-3);
          text-decoration: none;
          color: inherit;
        }

        .ln-footer__logo-glyph {
          display: inline-grid;
          place-items: center;
          width: 30px;
          height: 30px;
          border-radius: 9px;
          color: #ffffff;
          background: linear-gradient(140deg, var(--ln-accent-violet), var(--ln-accent-cyan));
        }

        .ln-footer__logo {
          font-family: var(--ln-font-display);
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: var(--ln-heading);
        }

        .ln-footer__tagline {
          margin: 0;
          font-family: var(--ln-font-body);
          font-size: var(--ln-text-base);
          line-height: var(--ln-leading-normal);
          color: var(--ln-muted);
        }

        .ln-footer__links {
          display: grid;
          grid-template-columns: repeat(3, minmax(120px, 1fr));
          gap: var(--ln-space-10);
        }

        .ln-footer__column {
          display: flex;
          flex-direction: column;
          gap: var(--ln-space-3);
        }

        .ln-footer__column-title {
          margin: 0;
          font-family: var(--ln-font-body);
          font-size: var(--ln-text-sm);
          font-weight: 600;
          color: var(--ln-heading);
        }

        .ln-footer__column-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--ln-space-2);
        }

        .ln-footer__link {
          display: inline-flex;
          font-family: var(--ln-font-body);
          font-size: var(--ln-text-sm);
          color: var(--ln-muted);
          text-decoration: none;
          transition: color 0.15s var(--ln-ease-out);
        }

        .ln-footer__link:hover {
          color: var(--ln-heading);
        }

        .ln-footer__meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--ln-space-4);
          padding-top: var(--ln-space-8);
          border-top: 1px solid var(--ln-line-soft);
        }

        .ln-footer__copyright {
          margin: 0;
          font-family: var(--ln-font-body);
          font-size: var(--ln-text-xs);
          color: var(--ln-faint);
        }

        .ln-footer__social {
          display: flex;
          align-items: center;
          gap: var(--ln-space-3);
        }

        .ln-footer__social-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: var(--ln-radius-full);
          color: var(--ln-muted);
          background: var(--ln-bg);
          border: 1px solid var(--ln-line);
          text-decoration: none;
          transition: color 0.18s var(--ln-ease-out),
            background 0.18s var(--ln-ease-out),
            border-color 0.18s var(--ln-ease-out),
            transform 0.18s var(--ln-ease-out);
        }

        .ln-footer__social-link:hover {
          color: var(--ln-heading);
          background: var(--ln-bg-elevated);
          border-color: var(--ln-line-strong);
          transform: translateY(-2px);
        }

        @media (max-width: 900px) {
          .ln-footer__content {
            grid-template-columns: 1fr;
            gap: var(--ln-space-10);
          }
          .ln-footer__links {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 560px) {
          .ln-footer {
            padding-top: var(--ln-space-16);
          }
          .ln-footer__links {
            grid-template-columns: 1fr;
            gap: var(--ln-space-8);
          }
          .ln-footer__meta {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </footer>
  );
}

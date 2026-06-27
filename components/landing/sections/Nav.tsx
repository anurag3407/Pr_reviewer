"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const links = [
  { label: "The Loop", href: "#engine" as const },
  { label: "Architecture", href: "#architecture" as const },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="landing-v2 ln-nav" data-landing="true" data-scrolled={scrolled}>
      <div className="ln-container ln-nav__container">
        <Link href="/" className="ln-nav__brand" aria-label="Autoheal home">
          <span className="ln-nav__brand-glyph" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M21 12a9 9 0 1 1-3.5-7.1"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <path
                d="M8.5 12.5l2.2 2.2L16 9"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="ln-nav__brand-name">Autoheal</span>
        </Link>

        <nav className="ln-nav__links" aria-label="Primary">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="ln-nav__link">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ln-nav__actions">
          <Link href="/sign-in" className="ln-nav__link ln-nav__link--signin">
            Sign in
          </Link>
          <Link href="/sign-up" className="ln-nav__btn">
            Install AutoHeal
          </Link>
        </div>
      </div>

      <style jsx>{`
        .ln-nav {
          position: sticky;
          top: 0;
          z-index: 50;
          width: 100%;
          transition: background 0.2s var(--ln-ease-out),
            border-color 0.2s var(--ln-ease-out), box-shadow 0.2s var(--ln-ease-out);
          background: color-mix(in srgb, var(--ln-bg) 72%, transparent);
          border-bottom: 1px solid transparent;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .ln-nav[data-scrolled="true"] {
          background: color-mix(in srgb, var(--ln-bg-elevated) 88%, transparent);
          border-bottom-color: var(--ln-line);
          box-shadow: var(--ln-shadow-sm);
        }

        .ln-nav__container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--ln-space-6);
          height: var(--ln-header-height);
        }

        .ln-nav__brand {
          display: inline-flex;
          align-items: center;
          gap: var(--ln-space-3);
          text-decoration: none;
          color: var(--ln-heading);
        }

        .ln-nav__brand-glyph {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          color: #ffffff;
          background: linear-gradient(140deg, var(--ln-accent-violet), var(--ln-accent-cyan));
          box-shadow: 0 4px 14px var(--ln-accent-glow);
        }

        .ln-nav__brand-name {
          font-family: var(--ln-font-display);
          font-weight: 700;
          font-size: 1.05rem;
          letter-spacing: -0.01em;
        }

        .ln-nav__links {
          display: flex;
          align-items: center;
          gap: var(--ln-space-2);
        }

        .ln-nav__link {
          font-family: var(--ln-font-body);
          font-size: 0.92rem;
          font-weight: 500;
          color: var(--ln-muted);
          text-decoration: none;
          padding: var(--ln-space-2) var(--ln-space-3);
          border-radius: var(--ln-radius-sm);
          transition: color 0.15s var(--ln-ease-out), background 0.15s var(--ln-ease-out);
        }

        .ln-nav__link:hover {
          color: var(--ln-heading);
          background: var(--ln-line-soft);
        }

        .ln-nav__actions {
          display: flex;
          align-items: center;
          gap: var(--ln-space-3);
        }

        .ln-nav__link--signin {
          display: none;
        }

        .ln-nav__btn {
          display: inline-flex;
          align-items: center;
          gap: var(--ln-space-2);
          padding: var(--ln-space-2) var(--ln-space-5);
          border-radius: var(--ln-radius);
          font-family: var(--ln-font-body);
          font-size: 0.92rem;
          font-weight: 600;
          color: #ffffff;
          text-decoration: none;
          background: linear-gradient(135deg, var(--ln-accent-violet), var(--ln-accent-violet-bright));
          box-shadow: 0 4px 14px var(--ln-accent-glow);
          transition: transform 0.12s var(--ln-ease-out), box-shadow 0.18s var(--ln-ease-out);
        }

        .ln-nav__btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 22px var(--ln-accent-glow);
        }

        .ln-nav__btn:active {
          transform: translateY(0);
        }

        @media (max-width: 900px) {
          .ln-nav__links {
            display: none;
          }
          .ln-nav__link--signin {
            display: inline-flex;
          }
        }

        @media (max-width: 560px) {
          .ln-nav__brand-name {
            font-size: 0.98rem;
          }
          .ln-nav__btn {
            padding: var(--ln-space-2) var(--ln-space-4);
          }
        }
      `}</style>
    </header>
  );
}

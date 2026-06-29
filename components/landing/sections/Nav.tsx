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
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

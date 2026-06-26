/**
 * DashHeader — shared top bar for the authenticated dashboard pages: brand
 * (links home), section tabs, and the Clerk user button.
 */

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export function DashHeader({ active }: { active?: "home" | "projects" }) {
  return (
    <header className="bar">
      <Link href="/dashboard" className="brand brand--link">
        <span className="brand__glyph">↻</span>
        <div>
          <div className="brand__name">Autoheal</div>
          <div className="brand__sub">ai pr review · self-healing</div>
        </div>
      </Link>
      <div className="bar__right">
        <nav className="navtabs">
          <Link href="/dashboard" className="navtab" data-active={active === "home"}>
            Reviews
          </Link>
          <Link href="/dashboard/projects" className="navtab" data-active={active === "projects"}>
            Projects
          </Link>
        </nav>
        <UserButton />
      </div>
    </header>
  );
}

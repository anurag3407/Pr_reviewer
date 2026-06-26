/** FlagPill — the PR-level verdict pill (SAFE / NEEDS_REVIEW / UNSAFE / …). */

import type { PRFlag } from "@/lib/types";
import { FLAG_META } from "./status";

export function FlagPill({ flag, big }: { flag: PRFlag; big?: boolean }) {
  const meta = FLAG_META[flag];
  return (
    <span className={`pill${big ? " pill--big" : ""}`} data-tone={meta.tone} data-active={Boolean(meta.active)}>
      <span className="pill__dot" />
      {meta.label}
    </span>
  );
}

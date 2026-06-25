"use client";

/**
 * RiskMatrix — the threat grid. Severity (rows, most-severe on top) ×
 * category (cols). Each cell shows how many risks the agent has surfaced there
 * and glows brighter the more concentrated the threat. The page's centerpiece.
 */

import { Fragment } from "react";
import type { IdentifiedRisk } from "@/lib/types";
import { CATEGORY_COLS, CATEGORY_LABEL, SEVERITY_ROWS, SEVERITY_TONE } from "./status";

export function RiskMatrix({ risks }: { risks: IdentifiedRisk[] }) {
  const counts = new Map<string, number>();
  let max = 0;
  for (const r of risks) {
    const key = `${r.severity}|${r.category}`;
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    if (next > max) max = next;
  }

  return (
    <div className="matrix">
      <div className="matrix__corner">sev ╲ type</div>
      {CATEGORY_COLS.map((cat) => (
        <div key={cat} className="matrix__col">
          {CATEGORY_LABEL[cat]}
        </div>
      ))}

      {SEVERITY_ROWS.map((sev) => (
        <Fragment key={sev}>
          <div className="matrix__row" data-sev={SEVERITY_TONE[sev]}>
            {sev}
          </div>
          {CATEGORY_COLS.map((cat) => {
            const n = counts.get(`${sev}|${cat}`) ?? 0;
            const load = max > 0 ? n / max : 0;
            return (
              <div
                key={cat}
                className="cell"
                data-sev={SEVERITY_TONE[sev]}
                data-on={n > 0}
                style={{ ["--load"]: load } as React.CSSProperties}
                title={`${n} ${sev} ${CATEGORY_LABEL[cat]} risk${n === 1 ? "" : "s"}`}
              >
                {n > 0 ? n : <span className="cell__zero">·</span>}
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

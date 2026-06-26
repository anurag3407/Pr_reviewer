/**
 * ThreatGrid — severity (rows) × category (cols). Each cell counts findings and
 * glows brighter the more concentrated the threat. Adapts its column count to
 * the category taxonomy.
 */

import { Fragment } from "react";
import type { Finding } from "@/lib/types";
import { CATEGORY_COLS, CATEGORY_LABEL, SEVERITY_ROWS, SEVERITY_TONE } from "./status";

export function ThreatGrid({ findings }: { findings: Finding[] }) {
  const counts = new Map<string, number>();
  let max = 0;
  for (const f of findings) {
    const key = `${f.severity}|${f.category}`;
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    if (next > max) max = next;
  }

  const cols = CATEGORY_COLS;
  return (
    <div className="matrix" style={{ gridTemplateColumns: `54px repeat(${cols.length}, 1fr)` }}>
      <div className="matrix__corner">sev╲type</div>
      {cols.map((cat) => (
        <div key={cat} className="matrix__col">
          {CATEGORY_LABEL[cat]}
        </div>
      ))}

      {SEVERITY_ROWS.map((sev) => (
        <Fragment key={sev}>
          <div className="matrix__row" data-sev={SEVERITY_TONE[sev]}>
            {sev}
          </div>
          {cols.map((cat) => {
            const n = counts.get(`${sev}|${cat}`) ?? 0;
            const load = max > 0 ? n / max : 0;
            return (
              <div
                key={cat}
                className="cell"
                data-sev={SEVERITY_TONE[sev]}
                data-on={n > 0}
                style={{ ["--load"]: load } as React.CSSProperties}
                title={`${n} ${sev} ${CATEGORY_LABEL[cat]}`}
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

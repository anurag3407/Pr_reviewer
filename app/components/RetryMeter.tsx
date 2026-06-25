"use client";

/**
 * RetryMeter — the "vital sign" of the auto-healing loop.
 * Five segments fill as retry_count rises; the segment being worked pulses while
 * the agent is testing/healing. This is the page's signature read-at-a-glance.
 */

import { MAX_RETRIES, type PRStatus } from "@/lib/types";
import { STATUS_META } from "./status";

export function RetryMeter({ status, retryCount }: { status: PRStatus; retryCount: number }) {
  const meta = STATUS_META[status];
  const active = Boolean(meta.active);
  const capped = Math.min(Math.max(retryCount, 0), MAX_RETRIES);

  const filled = status === "AWAITING_HUMAN_APPROVAL" ? MAX_RETRIES : capped;
  const current = active ? Math.min(capped, MAX_RETRIES - 1) : -1;

  return (
    <div className="vitals" data-tone={meta.tone}>
      <div className="meter" role="img" aria-label={label(status, capped)}>
        {Array.from({ length: MAX_RETRIES }).map((_, i) => (
          <span
            key={i}
            className="seg"
            data-fill={i < filled || i === current}
            data-current={i === current}
          />
        ))}
      </div>
      <span className="meter__label">{label(status, capped)}</span>
    </div>
  );
}

function label(status: PRStatus, retryCount: number): string {
  switch (status) {
    case "READY_FOR_MERGE":
      return retryCount === 0
        ? "Green on the first run"
        : `Healed in ${retryCount} attempt${retryCount === 1 ? "" : "s"}`;
    case "APPROVED_OVERRIDE":
      return `Released by operator · ${retryCount}/${MAX_RETRIES}`;
    case "AWAITING_HUMAN_APPROVAL":
      return `Retry budget spent · ${MAX_RETRIES}/${MAX_RETRIES}`;
    case "REJECTED":
      return `Rejected · ${retryCount}/${MAX_RETRIES}`;
    case "PENDING":
      return `Queued · 0/${MAX_RETRIES}`;
    default:
      return `Attempt ${Math.min(retryCount + 1, MAX_RETRIES)} / ${MAX_RETRIES}`;
  }
}

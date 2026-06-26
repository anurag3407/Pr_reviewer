/**
 * ReviewCard — one PR in the dashboard feed: identity, flag, and a severity
 * breakdown of its findings. Links to the review detail page.
 */

import Link from "next/link";
import type { ReviewWithFindings, Severity } from "@/lib/types";
import { FLAG_META, SEVERITY_ROWS, SEVERITY_TONE } from "./status";
import { FlagPill } from "./FlagPill";

export function ReviewCard({ review }: { review: ReviewWithFindings }) {
  const meta = FLAG_META[review.flag];
  const bySeverity = new Map<Severity, number>();
  for (const f of review.findings) bySeverity.set(f.severity, (bySeverity.get(f.severity) ?? 0) + 1);

  return (
    <Link
      href={`/dashboard/reviews/${review.id}`}
      className="card card--link"
      data-tone={meta.tone}
      data-active={Boolean(meta.active)}
    >
      <div className="card__top">
        <div>
          <h3 className="card__title">{review.title || `PR #${review.pr_number}`}</h3>
          <div className="card__meta">
            <span>
              <b>{review.repo}</b>
            </span>
            <span>#{review.pr_number}</span>
            {review.author && <span>@{review.author}</span>}
            {review.base_branch && (
              <span>
                {review.base_branch} ← {review.head_branch}
              </span>
            )}
          </div>
        </div>
        <FlagPill flag={review.flag} />
      </div>

      <div className="card__findings">
        {review.findings.length === 0 ? (
          <span className="card__nofind">
            {review.flag === "REVIEWING" ? "analyzing…" : "no findings"}
          </span>
        ) : (
          SEVERITY_ROWS.filter((s) => bySeverity.get(s)).map((s) => (
            <span className="sevchip" key={s} data-sev={SEVERITY_TONE[s]}>
              {bySeverity.get(s)} {s}
            </span>
          ))
        )}
      </div>
    </Link>
  );
}

"use client";

/**
 * ReviewsFeed — the dashboard's live view. Polls /api/reviews every few seconds
 * and renders the at-a-glance counts + the PR pipeline. Surfaces setup gaps
 * (Lemma unreachable, no model, no GitHub App) inline so the user knows what's
 * left to configure.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { PRFlag, ReviewWithFindings } from "@/lib/types";
import { ReviewCard } from "@/app/components/ReviewCard";

interface Feed {
  config: { lemma: boolean; github: boolean; model: string | null };
  reachable: boolean;
  error?: string;
  reviews: ReviewWithFindings[];
}

const POLL_MS = 3000;

export function ReviewsFeed() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const seen = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reviews", { cache: "no-store" });
      if (!res.ok) return;
      setFeed((await res.json()) as Feed);
      seen.current = true;
    } catch {
      /* keep last good frame */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const reviews = feed?.reviews ?? [];
  const counts = useMemo(() => {
    const c = {} as Record<PRFlag, number>;
    for (const r of reviews) c[r.flag] = (c[r.flag] ?? 0) + 1;
    return c;
  }, [reviews]);

  const safe = counts.SAFE ?? 0;
  const attention = (counts.UNSAFE ?? 0) + (counts.BLOCKED ?? 0) + (counts.NEEDS_REVIEW ?? 0);
  const reviewing = counts.REVIEWING ?? 0;

  return (
    <>
      {feed && setupBanner(feed)}

      <section className="grid-top">
        <div className="panel">
          <div className="panel__head">
            <span className="eyebrow">At a glance</span>
            <span className="panel__hint">{reviews.length} reviews</span>
          </div>
          <div className="fleet">
            <div className="fleet__row" data-tone="ready">
              <span className="fleet__tick" />
              <span className="fleet__label">Safe</span>
              <span className="fleet__count">{safe}</span>
            </div>
            <div className="fleet__row" data-tone="await">
              <span className="fleet__tick" />
              <span className="fleet__label">Needs attention</span>
              <span className="fleet__count">{attention}</span>
            </div>
            <div className="fleet__row" data-tone="heal">
              <span className="fleet__tick" />
              <span className="fleet__label">Reviewing</span>
              <span className="fleet__count">{reviewing}</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel__head">
            <span className="eyebrow">Engine</span>
            <span className="panel__hint">providers</span>
          </div>
          <div className="fleet">
            <StatusRow ok={feed?.config.lemma && feed?.reachable} label="Lemma state pod" />
            <StatusRow ok={Boolean(feed?.config.model)} label={feed?.config.model ?? "Model provider"} />
            <StatusRow ok={feed?.config.github} label="GitHub App" />
          </div>
        </div>
      </section>

      <section className="pipe">
        <div className="pipe__head">
          <span className="eyebrow">Pipeline</span>
          <span className="panel__hint">newest first</span>
        </div>

        {reviews.length === 0 && seen.current ? (
          <div className="empty">
            <div className="empty__big">No reviews yet.</div>
            <div>
              Connect a repo on the{" "}
              <Link href="/dashboard/projects" className="linkbtn">
                Projects
              </Link>{" "}
              page, then open a pull request on a watched branch.
            </div>
          </div>
        ) : (
          <div className="pipe__list">
            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function StatusRow({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <div className="fleet__row" data-tone={ok ? "ready" : "reject"}>
      <span className="fleet__tick" />
      <span className="fleet__label">{label}</span>
      <span className="fleet__count">{ok ? "✓" : "—"}</span>
    </div>
  );
}

function setupBanner(feed: Feed): React.ReactNode {
  if (feed.config.lemma && !feed.reachable) {
    return (
      <div className="banner">
        State pod unreachable{feed.error ? <> — <code>{feed.error}</code></> : null}. Check{" "}
        <code>LEMMA_TOKEN</code> (it may have expired — re-run <code>lemma auth login</code>).
      </div>
    );
  }
  if (!feed.config.model) {
    return (
      <div className="banner">
        No model provider configured. Set <code>BYNARA_API_KEY</code> in <code>.env.local</code> to
        enable reviews.
      </div>
    );
  }
  return null;
}

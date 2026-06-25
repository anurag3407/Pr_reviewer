"use client";

/**
 * Operator console. Polls /api/prs every ~2.5s and renders the live state of
 * every PR under autonomous care: the threat grid, the fleet summary, and the
 * pipeline of PR cards. All state lives in the Lemma pod — this is a read view
 * over it, plus the human approval controls.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PRCard } from "./components/PRCard";
import { RiskMatrix } from "./components/RiskMatrix";
import { STATUS_META } from "./components/status";
import { MAX_RETRIES, type IdentifiedRisk, type PRStatus, type PRWithRisks } from "@/lib/types";

interface PodInfo {
  configured: boolean;
  reachable: boolean;
  podId: string | null;
  error?: string;
}
interface Feed {
  pod: PodInfo;
  prs: PRWithRisks[];
}

const POLL_MS = 2500;

const FLEET_ORDER: PRStatus[] = [
  "TESTING",
  "HEALING",
  "AWAITING_HUMAN_APPROVAL",
  "READY_FOR_MERGE",
  "APPROVED_OVERRIDE",
  "REJECTED",
  "PENDING",
];

export default function Page() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const seen = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/prs", { cache: "no-store" });
      const data = (await res.json()) as Feed;
      setFeed(data);
      seen.current = true;
    } catch {
      /* transient poll error — keep the last good frame */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const prs = feed?.prs ?? [];
  const pod = feed?.pod;

  const counts = useMemo(() => {
    const c = {} as Record<PRStatus, number>;
    for (const pr of prs) c[pr.status] = (c[pr.status] ?? 0) + 1;
    return c;
  }, [prs]);

  const allRisks = useMemo<IdentifiedRisk[]>(() => prs.flatMap((p) => p.risks), [prs]);
  const activeCount = (counts.TESTING ?? 0) + (counts.HEALING ?? 0);
  const live = Boolean(pod?.configured && pod?.reachable);

  return (
    <main className="console">
      <header className="bar">
        <div className="brand">
          <span className="brand__glyph">↻</span>
          <div>
            <div className="brand__name">Autoheal</div>
            <div className="brand__sub">autonomous pr healing · {MAX_RETRIES}-try loop</div>
          </div>
        </div>
        <div className="bar__right">
          <div className="barstat">
            <b>{prs.length}</b> tracked
          </div>
          <div className="barstat">
            <b>{activeCount}</b> active
          </div>
          <div className="barstat">
            <b>{counts.AWAITING_HUMAN_APPROVAL ?? 0}</b> awaiting you
          </div>
          <span className="podlight" data-live={live}>
            <span className="podlight__dot" />
            {podLabel(pod)}
          </span>
        </div>
      </header>

      {pod && !pod.configured && (
        <div className="banner">
          Live pod not configured. Set <code>LEMMA_TOKEN</code> and <code>LEMMA_POD_ID</code> in{" "}
          <code>.env.local</code>, then run <code>npm run lemma:setup</code>.
        </div>
      )}
      {pod && pod.configured && !pod.reachable && (
        <div className="banner">
          Pod unreachable{pod.error ? <> — <code>{pod.error}</code></> : null}. Check the token and pod id.
        </div>
      )}

      <section className="grid-top">
        <div className="panel">
          <div className="panel__head">
            <span className="eyebrow">Threat grid</span>
            <span className="panel__hint">{allRisks.length} risks surfaced</span>
          </div>
          <RiskMatrix risks={allRisks} />
        </div>

        <div className="panel">
          <div className="panel__head">
            <span className="eyebrow">Fleet</span>
            <span className="panel__hint">by status</span>
          </div>
          <div className="fleet">
            {FLEET_ORDER.filter((s) => (counts[s] ?? 0) > 0).map((s) => (
              <div className="fleet__row" key={s} data-tone={STATUS_META[s].tone}>
                <span className="fleet__tick" />
                <span className="fleet__label">{STATUS_META[s].label}</span>
                <span className="fleet__count">{counts[s]}</span>
              </div>
            ))}
            {prs.length === 0 && <span className="fleet__label">No PRs in flight.</span>}
          </div>
        </div>
      </section>

      <section className="pipe">
        <div className="pipe__head">
          <span className="eyebrow">Pipeline</span>
          <span className="panel__hint">newest first</span>
        </div>

        {prs.length === 0 && seen.current && live ? (
          <div className="empty">
            <div className="empty__big">No pull requests yet.</div>
            <div>
              Drive a demo run: <code>npm run simulate</code>
            </div>
          </div>
        ) : (
          <div className="pipe__list">
            {prs.map((pr) => (
              <PRCard key={pr.id} pr={pr} onChange={load} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function podLabel(pod?: PodInfo): string {
  if (!pod) return "connecting…";
  if (!pod.configured) return "no pod";
  if (!pod.reachable) return "unreachable";
  return `live · ${pod.podId?.slice(0, 8) ?? "pod"}`;
}

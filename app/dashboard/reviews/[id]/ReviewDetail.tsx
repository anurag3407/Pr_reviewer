"use client";

/**
 * ReviewDetail — the live review view. Polls /api/reviews/[id], shows the flag,
 * scan state, summary, the threat grid, and findings grouped by file. Supports
 * re-scan and per-finding dismiss. (Chat panel and "Fix with PR" are layered on
 * in later phases.)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Finding, ReviewWithFindings, Severity } from "@/lib/types";
import { FlagPill } from "@/app/components/FlagPill";
import { FindingCard } from "@/app/components/FindingCard";
import { ThreatGrid } from "@/app/components/ThreatGrid";
import { ChatPanel } from "@/app/components/ChatPanel";
import { FLAG_META } from "@/app/components/status";

const POLL_MS = 3500;
const RANK: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export function ReviewDetail({ initial }: { initial: ReviewWithFindings }) {
  const [review, setReview] = useState<ReviewWithFindings>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; title: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews/${initial.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.review) setReview(data.review as ReviewWithFindings);
    } catch {
      /* keep last frame */
    }
  }, [initial.id]);

  useEffect(() => {
    pollRef.current = setInterval(refresh, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  async function rescan() {
    setBusy("rescan");
    try {
      await fetch(`/api/reviews/${initial.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "rescan" }),
      });
      setReview((r) => ({ ...r, flag: "REVIEWING" }));
      setTimeout(refresh, 800);
    } finally {
      setBusy(null);
    }
  }

  async function fixWithPR() {
    if (
      !confirm(
        "Autoheal will commit fixes to the PR's head branch and re-scan until the flag is SAFE. Continue?",
      )
    )
      return;
    setBusy("fix");
    try {
      const res = await fetch(`/api/reviews/${initial.id}/fix`, { method: "POST" });
      if (res.ok) {
        setReview((r) => ({ ...r, flag: "REVIEWING" }));
        setTimeout(refresh, 1000);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(`Could not start fix: ${data.error ?? res.statusText}`);
      }
    } finally {
      setBusy(null);
    }
  }

  async function setFindingStatus(id: string, status: "OPEN" | "DISMISSED") {
    setBusy(`f:${id}`);
    // optimistic
    setReview((r) => ({
      ...r,
      findings: r.findings.map((f) => (f.id === id ? { ...f, status } : f)),
    }));
    try {
      await fetch(`/api/findings/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } finally {
      setBusy(null);
    }
  }

  const meta = FLAG_META[review.flag];
  const reviewing = review.flag === "REVIEWING";
  const canFix =
    !reviewing &&
    review.flag !== "SAFE" &&
    review.flag !== "ERROR" &&
    review.findings.some((f) => f.status !== "DISMISSED");

  // Group findings by file, severity-sorted within each group.
  const groups = useMemo(() => groupByFile(review.findings), [review.findings]);

  return (
    <>
      <section className="panel rev__hero" data-tone={meta.tone}>
        <div className="rev__heroTop">
          <div>
            <h1 className="rev__title">{review.title || `PR #${review.pr_number}`}</h1>
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
              {review.head_sha && <span>@ {review.head_sha.slice(0, 8)}</span>}
            </div>
          </div>
          <FlagPill flag={review.flag} big />
        </div>

        <div className="rev__actions">
          <span className="rev__scan" data-on={reviewing}>
            <span className="rev__scanDot" />
            {reviewing ? "scanning…" : `scan ${Math.max(review.scan_count, 1)}`}
          </span>
          <div className="rev__spacer" />
          {review.html_url && (
            <a className="btn" href={review.html_url} target="_blank" rel="noreferrer">
              View on GitHub ↗
            </a>
          )}
          <button className="btn" onClick={rescan} disabled={busy === "rescan" || reviewing}>
            {busy === "rescan" ? "starting…" : "Re-scan"}
          </button>
          {canFix && (
            <button className="btn btn--go" onClick={fixWithPR} disabled={busy === "fix"}>
              {busy === "fix" ? "fixing…" : "⚡ Fix with PR"}
            </button>
          )}
        </div>

        {review.last_error && <div className="rev__err">{review.last_error}</div>}
        {review.summary && <p className="rev__summary">{review.summary}</p>}
      </section>

      <section className="grid-top">
        <div className="panel">
          <div className="panel__head">
            <span className="eyebrow">Threat grid</span>
            <span className="panel__hint">{review.findings.length} findings</span>
          </div>
          <ThreatGrid findings={review.findings} />
        </div>
        <div className="panel">
          <div className="panel__head">
            <span className="eyebrow">Verdict</span>
            <span className="panel__hint">flag rubric</span>
          </div>
          <p className="rev__rubric">
            {reviewing
              ? "Reviewing the diff against the full codebase context…"
              : verdictCopy(review.flag)}
          </p>
        </div>
      </section>

      <section className="rev__work">
        <div className="rev__findings">
          <div className="pipe__head">
            <span className="eyebrow">Findings</span>
            <span className="panel__hint">grouped by file</span>
          </div>

          {review.findings.length === 0 ? (
            <div className="empty">
              <div className="empty__big">
                {reviewing ? "Analyzing…" : "No findings — looks clean."}
              </div>
              {!reviewing && <div>Nothing material surfaced in this scan.</div>}
            </div>
          ) : (
            <div className="findgroups">
              {groups.map(([file, items]) => (
                <div className="findgroup" key={file}>
                  <div className="findgroup__file">{file}</div>
                  {items.map((f) => (
                    <FindingCard
                      key={f.id}
                      finding={f}
                      busy={busy === `f:${f.id}`}
                      onToggleDismiss={(next) => setFindingStatus(f.id, next)}
                      onDiscuss={() => setFocus({ id: f.id, title: f.title })}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="rev__chat">
          <ChatPanel reviewId={review.id} focus={focus} onClearFocus={() => setFocus(null)} />
        </aside>
      </section>
    </>
  );
}

function groupByFile(findings: Finding[]): Array<[string, Finding[]]> {
  const map = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = f.file_path ?? "general";
    const bucket = map.get(key);
    if (bucket) bucket.push(f);
    else map.set(key, [f]);
  }
  for (const items of map.values()) {
    items.sort((a, b) => RANK[a.severity] - RANK[b.severity] || (a.line_start ?? 0) - (b.line_start ?? 0));
  }
  // Order groups by their worst severity.
  return [...map.entries()].sort(
    (a, b) => Math.min(...a[1].map((f) => RANK[f.severity])) - Math.min(...b[1].map((f) => RANK[f.severity])),
  );
}

function verdictCopy(flag: ReviewWithFindings["flag"]): string {
  switch (flag) {
    case "SAFE":
      return "No material issues found. Safe to merge.";
    case "NEEDS_REVIEW":
      return "Minor or medium findings. Worth a look before merging.";
    case "UNSAFE":
      return "High-severity issues present. Address them before merging.";
    case "BLOCKED":
      return "Critical issue (security / data loss). Do not merge until fixed.";
    case "ERROR":
      return "The scan failed — see the error above and try Re-scan.";
    default:
      return "";
  }
}

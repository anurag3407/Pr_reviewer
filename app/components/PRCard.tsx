"use client";

/**
 * PRCard — one pull request under autonomous care: identity, live status,
 * the retry vital sign, the risks surfaced so far, and (when stalled) the
 * human approval gate.
 */

import type { PRWithRisks } from "@/lib/types";
import { ApprovalGate } from "./ApprovalGate";
import { RetryMeter } from "./RetryMeter";
import { SEVERITY_TONE, STATUS_META } from "./status";

export function PRCard({ pr, onChange }: { pr: PRWithRisks; onChange: () => void }) {
  const meta = STATUS_META[pr.status];

  // Show the most recent attempt's risks first, capped so a card stays scannable.
  const risks = [...pr.risks].sort((a, b) => b.attempt - a.attempt).slice(0, 6);

  return (
    <article className="card" data-tone={meta.tone} data-active={Boolean(meta.active)}>
      <div className="card__top">
        <div>
          <h3 className="card__title">{pr.title || "Untitled PR"}</h3>
          <div className="card__meta">
            <span><b>{pr.repo}</b></span>
            <span>branch <b>{pr.branch}</b></span>
            <span>@{pr.author}</span>
            <span>#{pr.pr_number}</span>
          </div>
        </div>
        <span className="pill" data-active={Boolean(meta.active)}>
          <span className="pill__dot" />
          {meta.label}
        </span>
      </div>

      <RetryMeter status={pr.status} retryCount={pr.retry_count} />

      {risks.length > 0 && (
        <div className="risks">
          {risks.map((r) => (
            <div className="riskline" key={r.id} data-sev={SEVERITY_TONE[r.severity]}>
              <span className="riskline__sev">{r.severity}</span>
              <span className="riskline__cat">{r.category}</span>
              <div className="riskline__body">
                <div className="riskline__title">{r.title}</div>
                {r.recommended_fix && (
                  <div className="riskline__fix">
                    <span>FIX</span>
                    {r.recommended_fix}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ApprovalGate prId={pr.id} status={pr.status} onChange={onChange} />
    </article>
  );
}

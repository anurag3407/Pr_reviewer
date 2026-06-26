/**
 * FindingCard — one problematic location: severity, category, file:line, the
 * root-cause detail, and the suggested fix. Optional dismiss/restore control
 * (the fix loop skips dismissed findings).
 */

"use client";

import type { Finding } from "@/lib/types";
import { SEVERITY_TONE } from "./status";

function loc(f: Finding): string {
  if (!f.file_path) return "(no location)";
  if (!f.line_start) return f.file_path;
  const span = f.line_end && f.line_end !== f.line_start ? `${f.line_start}-${f.line_end}` : `${f.line_start}`;
  return `${f.file_path}:${span}`;
}

export function FindingCard({
  finding,
  onToggleDismiss,
  onDiscuss,
  busy,
}: {
  finding: Finding;
  onToggleDismiss?: (next: "OPEN" | "DISMISSED") => void;
  onDiscuss?: () => void;
  busy?: boolean;
}) {
  const dismissed = finding.status === "DISMISSED";
  return (
    <article className="finding" data-sev={SEVERITY_TONE[finding.severity]} data-dismissed={dismissed}>
      <div className="finding__head">
        <span className="finding__sev">{finding.severity}</span>
        <span className="finding__cat">{finding.category}</span>
        <span className="finding__loc">{loc(finding)}</span>
        {typeof finding.confidence === "number" && (
          <span className="finding__conf" title="model confidence">
            {Math.round(finding.confidence * 100)}%
          </span>
        )}
        <span className="finding__actions">
          {onDiscuss && (
            <button className="linkbtn" disabled={busy} onClick={onDiscuss}>
              discuss
            </button>
          )}
          {onToggleDismiss && (
            <button
              className="linkbtn"
              disabled={busy}
              onClick={() => onToggleDismiss(dismissed ? "OPEN" : "DISMISSED")}
            >
              {dismissed ? "restore" : "dismiss"}
            </button>
          )}
        </span>
      </div>
      <div className="finding__title">{finding.title}</div>
      {finding.detail && <p className="finding__detail">{finding.detail}</p>}
      {finding.suggested_fix && (
        <pre className="finding__fix">
          <code>{finding.suggested_fix}</code>
        </pre>
      )}
    </article>
  );
}

"use client";

/**
 * ApprovalGate — the human-in-the-loop control. Appears when the agent has
 * exhausted its retry budget (AWAITING_HUMAN_APPROVAL) so an operator can
 * release the PR anyway, reject it, or re-run the loop from scratch.
 */

import { useState } from "react";
import type { PRStatus } from "@/lib/types";

type Action = "approve" | "reject" | "rerun";

export function ApprovalGate({
  prId,
  status,
  onChange,
}: {
  prId: string;
  status: PRStatus;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<Action | null>(null);

  async function run(action: Action) {
    setBusy(action);
    try {
      await fetch(`/api/prs/${prId}/${action}`, { method: "POST" });
      onChange();
    } finally {
      setBusy(null);
    }
  }

  if (status === "AWAITING_HUMAN_APPROVAL") {
    return (
      <div className="gate">
        <span className="gate__msg">Retry budget spent — needs a human call.</span>
        <button className="btn btn--go" disabled={busy !== null} onClick={() => run("approve")}>
          {busy === "approve" ? "Releasing…" : "Approve release"}
        </button>
        <button className="btn btn--no" disabled={busy !== null} onClick={() => run("reject")}>
          Reject
        </button>
        <button className="btn" disabled={busy !== null} onClick={() => run("rerun")}>
          Re-run
        </button>
      </div>
    );
  }

  if (status === "REJECTED") {
    return (
      <div className="gate">
        <span className="gate__msg">Rejected by operator.</span>
        <button className="btn" disabled={busy !== null} onClick={() => run("rerun")}>
          {busy === "rerun" ? "Restarting…" : "Re-run healing"}
        </button>
      </div>
    );
  }

  return null;
}

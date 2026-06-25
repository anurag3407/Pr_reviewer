/**
 * GET /api/prs — the dashboard's data feed (polled ~every 2.5s).
 *
 * Returns every PR joined with its identified risks, plus a pod-status block the
 * header uses for its "live pod" indicator. Always 200 so the poll never trips
 * an error state; the client reads `pod.reachable` / `pod.configured` instead.
 */

import { NextResponse } from "next/server";
import { lemmaConfig, listPRsWithRisks } from "@/lib/lemma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = lemmaConfig();

  if (!cfg.configured) {
    return NextResponse.json({
      pod: { configured: false, reachable: false, podId: null },
      prs: [],
    });
  }

  try {
    const prs = await listPRsWithRisks();
    return NextResponse.json({
      pod: { configured: true, reachable: true, podId: cfg.podId },
      prs,
    });
  } catch (error) {
    return NextResponse.json({
      pod: {
        configured: true,
        reachable: false,
        podId: cfg.podId,
        error: (error as Error).message,
      },
      prs: [],
    });
  }
}

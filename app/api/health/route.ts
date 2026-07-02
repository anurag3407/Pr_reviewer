/**
 * /api/health — health check endpoint for Docker HEALTHCHECK + external
 * monitoring. Returns 200 when the Lemma auth subsystem is healthy, 503 when
 * it's broken (token theft, persistent refresh failures). This endpoint is NOT
 * protected by Clerk auth so Docker/load-balancers can probe it freely.
 */

import { NextResponse } from "next/server";
import { getAuthHealth, authConfigured } from "@/lib/lemma-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = getAuthHealth();
  const configured = authConfigured();
  const healthy = configured ? auth.healthy : false;
  const status = healthy ? 200 : 503;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "unhealthy",
      configured,
      auth: {
        healthy: auth.healthy,
        lastError: auth.lastError,
        consecutiveFailures: auth.consecutiveFailures,
        accessTokenExpiry: auth.accessTokenExpiry,
        hasRefreshToken: auth.hasRefreshToken,
      },
      timestamp: new Date().toISOString(),
    },
    { status },
  );
}

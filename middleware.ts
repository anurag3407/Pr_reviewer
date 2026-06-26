/**
 * Clerk middleware — gates the app behind authentication except for the public
 * marketing/auth surface and the GitHub webhook (authenticated by its own HMAC).
 *
 * Unauthenticated handling is explicit so it doesn't depend on Clerk's sign-in
 * URL config: page routes redirect to /sign-in; API routes get a clean 401.
 *
 * Dev runs in Clerk "keyless" mode (keys auto-loaded from `.clerk/.tmp`); set
 * NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY for a real instance.
 */

import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/", // marketing landing
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)", // GitHub-signed; must stay open
]);
const isApiRoute = createRouteMatcher(["/api/(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const { userId } = await auth();
  if (userId) return;

  if (isApiRoute(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const signIn = new URL("/sign-in", req.url);
  return NextResponse.redirect(signIn);
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless referenced in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};

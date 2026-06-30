# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Autoheal — production image for AWS App Runner.
# Multi-stage: install → build (Next standalone) → tiny runtime that runs
# `node server.js`. The server listens on $PORT (App Runner sends traffic here).
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
# `git` binary is available in case simple-git ever shells out at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*

# 1) Install dependencies from the lockfile (cached unless package*.json change)
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2) Build. NEXT_PUBLIC_* vars are inlined into the client bundle at build time,
#    so the Clerk publishable key must be passed as a build arg here.
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_CLERK_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_URL \
    NEXT_PUBLIC_CLERK_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_SIGN_UP_URL
RUN npm run build

# 3) Runtime — copy only the standalone server + static assets.
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

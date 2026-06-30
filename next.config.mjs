import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle (`.next/standalone/server.js`) so the
  // Docker image for App Runner stays small and runs with `node server.js` —
  // no `next start` / full node_modules needed at runtime.
  output: "standalone",
  // Pin the workspace root: a stray lockfile elsewhere (e.g. ~/package-lock.json)
  // can make Next/Turbopack infer the wrong root and fail page-data collection.
  turbopack: { root: projectRoot },
  // simple-git spawns the `git` binary and @anthropic-ai/sdk is a heavy node lib —
  // keep them external to the server bundle. lemma-sdk is deliberately NOT listed:
  // it must be bundled by webpack so its `supertokens-web-js/recipe/session`
  // directory imports resolve (raw Node ESM rejects them — see lib/lemma.ts).
  // @aws-sdk/client-ssm is dynamically imported by lib/lemma-auth.ts only when
  // LEMMA_SSM_REFRESH_PARAM is set; keep it external so webpack doesn't try to
  // bundle the heavy AWS SDK into the server output.
  serverExternalPackages: ["simple-git", "@anthropic-ai/sdk", "@aws-sdk/client-ssm"],
};

export default nextConfig;

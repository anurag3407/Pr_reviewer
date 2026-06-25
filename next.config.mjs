/** @type {import('next').NextConfig} */
const nextConfig = {
  // simple-git spawns the `git` binary and @anthropic-ai/sdk is a heavy node lib —
  // keep them external to the server bundle. lemma-sdk is deliberately NOT listed:
  // it must be bundled by webpack so its `supertokens-web-js/recipe/session`
  // directory imports resolve (raw Node ESM rejects them — see lib/lemma.ts).
  serverExternalPackages: ["simple-git", "@anthropic-ai/sdk"],
};

export default nextConfig;

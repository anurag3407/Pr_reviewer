/**
 * lib/context.ts — assemble the review context.
 *
 * The accuracy edge over diff-only bots: we give the model the change IN SITU.
 * Priority-packed to a token budget (MiMo's window is ~1M, but we stay well
 * under to leave room for reasoning + output), logging what we drop:
 *   1. PR metadata (title/body)                     [essential]
 *   2. Unified diff (per-file patches)              [essential]
 *   3. FULL current content of changed files        [high]  ← line-numbered
 *   4. First-order local dependencies (1 import hop) [medium]
 *   5. Repo map (file tree)                          [low, truncated]
 *
 * Full files are line-numbered so findings can cite exact lines.
 */

import { posix } from "node:path";
import {
  type ChangedFile,
  getFileContent,
  getPullRequest,
  getPullRequestFiles,
  getRepoTree,
} from "./github";
import type { Project, Review } from "./types";

const TOKEN_BUDGET = Number(process.env.CONTEXT_TOKEN_BUDGET ?? 300_000);
const CHAR_BUDGET = TOKEN_BUDGET * 4; // ~4 chars/token estimate
const MAX_DEP_FILES = Number(process.env.CONTEXT_MAX_DEP_FILES ?? 40);
const MAX_FULL_FILE_CHARS = 60_000; // skip enormous single files from full inclusion

// Files we include in the diff but never as full content (noise / generated).
const SKIP_FULL = /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|\.min\.(js|css)$|\.(png|jpe?g|gif|svg|ico|pdf|woff2?|ttf|zip)$)/i;
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;

export interface GatheredContext {
  contextText: string;
  headSha: string;
  prTitle: string;
  changedFiles: ChangedFile[];
  stats: { fullFiles: number; depFiles: number; droppedFiles: number; approxTokens: number };
}

export async function gatherContext(project: Project, review: Review): Promise<GatheredContext> {
  const installationId = project.installation_id;
  const repo = project.repo;
  const prNumber = Number(review.pr_number);

  const pr = await getPullRequest(installationId, repo, prNumber);
  const headSha = pr.headSha || review.head_sha || pr.baseBranch;
  const changedFiles = await getPullRequestFiles(installationId, repo, prNumber);

  // Budgeted string builder.
  const out: string[] = [];
  let used = 0;
  function add(text: string, force = false): boolean {
    if (!force && used + text.length > CHAR_BUDGET) return false;
    out.push(text);
    used += text.length;
    return true;
  }

  // 1. PR metadata (essential).
  add(
    `# PULL REQUEST\nRepo: ${repo}\nPR #${pr.number}: ${pr.title}\n` +
      `Author: ${pr.author}\nBase: ${pr.baseBranch}  ←  Head: ${pr.headBranch} @ ${headSha.slice(0, 12)}\n` +
      `\nDescription:\n${pr.body?.trim() || "(none)"}\n`,
    true,
  );

  // 2. Unified diff — per-file patches (essential).
  const diffParts = ["\n# DIFF (changed files)\n"];
  for (const f of changedFiles) {
    diffParts.push(`\n--- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions}) ---`);
    diffParts.push(f.patch ? f.patch : "(no textual patch — binary or too large)");
  }
  add(diffParts.join("\n"), true);

  // 3. Full current content of changed code files (line-numbered), highest priority.
  let fullFiles = 0;
  let droppedFiles = 0;
  const includedPaths = new Set<string>();
  const changedCode = changedFiles
    .filter((f) => f.status !== "removed" && !SKIP_FULL.test(f.filename))
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions));

  add("\n# FULL CONTENT OF CHANGED FILES (line-numbered)\n", true);
  const importSpecs: Array<{ from: string; spec: string }> = [];
  for (const f of changedCode) {
    const content = await getFileContent(installationId, repo, f.filename, headSha);
    if (content == null) continue;
    if (content.length > MAX_FULL_FILE_CHARS) {
      droppedFiles++;
      continue;
    }
    const block = `\n===== ${f.filename} =====\n${numberLines(content)}\n`;
    if (add(block)) {
      fullFiles++;
      includedPaths.add(f.filename);
      if (CODE_EXT.test(f.filename)) {
        for (const spec of extractImports(content)) importSpecs.push({ from: f.filename, spec });
      }
    } else {
      droppedFiles++;
    }
  }

  // 4. First-order local dependencies (1 hop).
  let depFiles = 0;
  const seenDeps = new Set<string>();
  const depBlocks: string[] = ["\n# FIRST-ORDER DEPENDENCIES OF CHANGED FILES\n"];
  for (const { from, spec } of importSpecs) {
    if (depFiles >= MAX_DEP_FILES) break;
    const candidates = resolveCandidates(spec, from);
    for (const cand of candidates) {
      if (includedPaths.has(cand) || seenDeps.has(cand)) break;
      seenDeps.add(cand);
      const content = await getFileContent(installationId, repo, cand, headSha);
      if (content == null || content.length > MAX_FULL_FILE_CHARS) continue;
      const block = `\n===== ${cand} =====\n${numberLines(content)}\n`;
      if (add(block)) {
        depFiles++;
        includedPaths.add(cand);
      }
      break; // first existing candidate wins
    }
  }
  if (depFiles > 0) add(depBlocks[0]); // header only if we found any (kept simple)

  // 5. Repo map (low priority, truncate to remaining budget).
  const tree = await getRepoTree(installationId, repo, headSha);
  if (tree.length) {
    const paths = tree.filter((t) => t.type === "blob").map((t) => t.path).sort();
    const header = `\n# REPOSITORY MAP (${paths.length} files)\n`;
    const remaining = CHAR_BUDGET - used - header.length;
    if (remaining > 500) {
      let map = "";
      for (const p of paths) {
        if (map.length + p.length + 1 > remaining) {
          map += `… (+${paths.length - map.split("\n").length} more)`;
          break;
        }
        map += p + "\n";
      }
      add(header + map, true);
    }
  }

  return {
    contextText: out.join(""),
    headSha,
    prTitle: pr.title,
    changedFiles,
    stats: { fullFiles, depFiles, droppedFiles, approxTokens: Math.round(used / 4) },
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────
function numberLines(content: string): string {
  const lines = content.split("\n");
  const width = String(lines.length).length;
  return lines.map((l, i) => `${String(i + 1).padStart(width, " ")}: ${l}`).join("\n");
}

/** Local import specifiers (relative or `@/` alias) from a JS/TS file. */
function extractImports(content: string): string[] {
  const specs = new Set<string>();
  const re = /\b(?:from|import|require)\b[^'"\n]*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const spec = m[1];
    if (spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("@/")) specs.add(spec);
  }
  return [...specs];
}

/** Candidate repo paths for an import specifier, in resolution order. */
function resolveCandidates(spec: string, fromFile: string): string[] {
  const bases: string[] = [];
  if (spec.startsWith("@/")) {
    const rel = spec.slice(2);
    bases.push(rel, posix.join("src", rel));
  } else {
    const dir = posix.dirname(fromFile);
    bases.push(posix.normalize(posix.join(dir, spec)));
  }
  const exts = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
  const out: string[] = [];
  for (const base of bases) {
    if (/\.[a-z]+$/i.test(base)) out.push(base); // already has an extension
    for (const e of exts) out.push(base + e);
    for (const e of exts) out.push(posix.join(base, "index" + e));
  }
  return out;
}

/**
 * Refuse to report on captured markup that is older than the code it came from.
 *
 * ── The failure this closes ───────────────────────────────────────────────────
 * All three scripts in this directory read serialized markup out of
 * `.visual-qa/markup/`. Nothing tied that markup to a moment in the source's
 * history, so a run would happily audit a capture taken before the last three
 * commits and print a confident, well-formatted, entirely obsolete report.
 *
 * This was not hypothetical. Immediately after 21 accessibility violations were
 * fixed and the CI ratchet went to zero, the Chromium script still reported 5 —
 * every one of them in markup captured seven minutes before the fix. Two
 * instruments, two answers, and the wrong one was the one that looked more
 * authoritative because it ran in a real browser.
 *
 * The rule the rest of this directory follows is that a harness proves itself
 * before it is believed. Freshness is part of that proof: an audit of a stale
 * capture is not a weaker measurement, it is a measurement of something else.
 *
 * Exit code 2 is deliberate and matches the self-check failures — it means "do
 * not trust this run", as distinct from exit 1, "the product has findings".
 *
 * @module scripts/visual-qa/capture-freshness
 */

import fs from 'node:fs';
import path from 'node:path';

/** Directories whose changes invalidate a capture. */
const SOURCE_DIRS = ['client/src', 'shared'];
const SOURCE_EXT = new Set(['.ts', '.tsx', '.css', '.js', '.jsx']);
const SKIP_DIRS = new Set(['node_modules', '__tests__', '.git']);

/**
 * Newest source file under `dirs`, and which one it is.
 *
 * Exported because a capture is not the only artefact that can go stale against
 * the source: `scripts/ci/check-component-class-coverage.mjs` reads the built
 * CSS in dist/ and needs the same answer about the same tree, plus
 * design-system. One implementation, two callers — a second copy of "what is
 * the newest source file" would be free to drift and quietly disagree, which
 * is the failure this whole file exists to prevent.
 *
 * @param {string} root absolute repo root
 * @param {string[]} [dirs] repo-relative trees to walk; defaults to the ones a
 *   markup capture depends on
 * @returns {{ newest: number, newestFile: string }} epoch ms, and the path
 */
export function newestSourceMtime(root, dirs = SOURCE_DIRS) {
  let newest = 0;
  let newestFile = '';
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable or absent — not a reason to block the run
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name));
        continue;
      }
      if (!SOURCE_EXT.has(path.extname(e.name))) continue;
      const full = path.join(dir, e.name);
      const { mtimeMs } = fs.statSync(full);
      if (mtimeMs > newest) {
        newest = mtimeMs;
        newestFile = path.relative(root, full);
      }
    }
  };
  for (const d of dirs) walk(path.join(root, d));
  return { newest, newestFile };
}

function oldestCaptureMtime(markupDir) {
  let oldest = Infinity;
  for (const f of fs.readdirSync(markupDir)) {
    if (!f.endsWith('.html')) continue;
    const { mtimeMs } = fs.statSync(path.join(markupDir, f));
    if (mtimeMs < oldest) oldest = mtimeMs;
  }
  return oldest;
}

const mins = (ms) => Math.round(ms / 60000);

/**
 * Exit(2) if any source file is newer than the oldest captured surface.
 *
 * @param {string} tag  the script's log prefix
 * @param {string} markupDir  absolute path to .visual-qa/markup
 * @param {string} repoRoot  absolute repo root
 */
export function assertCaptureIsFresh(tag, markupDir, repoRoot) {
  const captured = oldestCaptureMtime(markupDir);
  if (!Number.isFinite(captured)) return; // no captures; the caller already errors

  const { newest, newestFile } = newestSourceMtime(repoRoot);
  if (newest <= captured) {
    console.log(`${tag} capture is current (newer than every source file).`);
    return;
  }

  console.error(`${tag} STALE CAPTURE — refusing to report.`);
  console.error(`${tag}   captured:      ${new Date(captured).toISOString()}`);
  console.error(
    `${tag}   newest source: ${new Date(newest).toISOString()}  (${newestFile})`,
  );
  console.error(
    `${tag}   the source is ${mins(newest - captured)} minute(s) ahead of the capture, so this`,
  );
  console.error(`${tag}   run would describe code that no longer exists.`);
  console.error(`${tag}`);
  console.error(`${tag}   Refresh it:  npm run visual-qa:capture`);
  console.error(`${tag}   Or run the whole suite in order:  npm run visual-qa`);
  process.exit(2);
}

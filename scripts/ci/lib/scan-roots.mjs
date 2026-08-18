/**
 * A scan root that is not there is not an empty scan.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Most guards in this directory walk a fixed set of directories and report on
 * what they find. Nearly all of them open the walk with some form of
 *
 *     if (!fs.existsSync(dir)) return out;      // nothing to scan
 *
 * which turns a missing directory into a clean bill of health. Individually
 * that is unremarkable — `server/` is not going to vanish. Collectively it is a
 * single point of silent failure: one directory rename turns a dozen guards
 * green at once, and not one of them says a word. The same shape has already
 * bitten this repo twice, in guards that DID get fixed and wrote down why:
 *
 *   • require-migration-headers.sh — "I could not determine what changed is not
 *     nothing changed."
 *   • ban-new-pool.sh — made a missing `grep` fatal, "never again may this
 *     script report success for a scan that did not execute."
 *
 * This is the same rule for the directories themselves. A guard declares the
 * roots it cannot do its job without; if one is absent the guard fails loudly
 * instead of passing over nothing.
 *
 * Use it only for roots that are genuinely required. A guard with an optional
 * root — one that may legitimately not exist in some checkout — should keep its
 * existsSync branch and say in a comment why absence is acceptable there.
 */
import fs from 'node:fs';

/**
 * @param {string} tag      the guard's log tag, e.g. '[ci:jwt-verify-pinned]'
 * @param {string[]} roots  absolute paths the guard must be able to scan
 */
export function requireScanRoots(tag, roots) {
  const missing = roots.filter((r) => !fs.existsSync(r));
  if (missing.length === 0) return;
  console.error(`\n${tag} FAILED — required scan root(s) missing:\n`);
  for (const r of missing) console.error(`    ${r}`);
  console.error(
    '\n  This guard cannot report on a tree it cannot read. A missing root is a\n' +
      '  broken scan, not a clean one — reporting success here would make the\n' +
      '  guard useless in exactly the situation it is most needed (a rename or a\n' +
      '  bad checkout). Fix the path, or drop the root from the guard if the\n' +
      '  directory is genuinely gone.\n',
  );
  process.exit(1);
}

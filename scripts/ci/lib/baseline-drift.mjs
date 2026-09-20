/**
 * Why a baselined entry stopped being reported — which is two different facts,
 * not one.
 *
 * Extracted from scripts/ci/check-tables-against-live-schema.mjs on 2026-09-18
 * so it can be tested: that script connects to a database at module load, so
 * nothing could import its logic while it lived inline, and a verification
 * routine no test can reach is one nobody has checked.
 *
 * ── THE DEFECT THIS FIXES ────────────────────────────────────────────────────
 * The original was one line:
 *
 *     const resolvedSince = [...baselined].filter((t) => !absent.includes(t));
 *
 * reported as "N baselined table(s) now exist". But `absent` is the intersection
 * of two conditions — REFERENCED by server SQL, and unresolvable on the live
 * database — so a name leaves it for either of two unrelated reasons:
 *
 *   1. it now resolves: the table was created;
 *   2. it is no longer referenced: the querying code was deleted, so it left
 *      the gate's scope and was never created at all.
 *
 * Both are legitimate grounds to shrink the baseline, which is this gate's
 * purpose. They are not the same fact. Run against the live database on
 * 2026-09-18 the old message named nine tables as "now exist" and eight of them
 * did not exist — they had dropped out when commit 153481465 deleted
 * /api/design-risk and the code that queried them. Only vault.evidence_citations
 * had actually been created.
 *
 * Telling an operator that eight tables now exist, when what happened is that
 * their callers were deleted, is a verdict reported for a check that did not
 * establish it.
 */

/**
 * Split the baselined names that are no longer being reported as absent.
 *
 * @param {object}      args
 * @param {Set<string>} args.baselined  names currently in the baseline file
 * @param {Set<string>} args.referenced names server SQL still mentions
 * @param {string[]}    args.absent     referenced names that do not resolve live
 * @returns {{ nowExists: string[], noLongerReferenced: string[] }}
 *   Disjoint and jointly exhaustive over the departed entries, so every removal
 *   from the baseline can be justified by exactly one stated reason.
 */
export function classifyBaselineDrift({ baselined, referenced, absent }) {
  const absentSet = new Set(absent);
  const nowExists = [];
  const noLongerReferenced = [];

  for (const name of baselined) {
    if (absentSet.has(name)) continue; // still a live defect; stays baselined
    // Referenced but not absent ⇒ it resolved. Not referenced at all ⇒ out of
    // scope. The order matters: an unreferenced name is never checked against
    // the database, so it cannot be claimed to exist.
    if (referenced.has(name)) nowExists.push(name);
    else noLongerReferenced.push(name);
  }

  nowExists.sort();
  noLongerReferenced.sort();
  return { nowExists, noLongerReferenced };
}

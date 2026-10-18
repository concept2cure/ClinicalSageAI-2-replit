# Preceding hosted integration failure census

Source `fa39bd5d8cd5641a6dc0d5b573c145f4e17731cd`, run `38625681016`,
Integration job `116073085566`, artifact `11928344023`. Native step 10 and
integration step 12 failed; the final artifact upload succeeded.

Vitest reported 50,826 tests: 50,228 passed, 297 failed and 301 pending.
There were 52 failed file rows, including six file-initialization failures.
The separately reported 133 failed nested suites are not 133 failed files.
Jest passed all 40 tests across seven files.

Projects and Vault account for most failures. The retained read-only review
identifies current-authority fixture gaps and setup collisions; these diagnoses
are not tested repairs. One failed file has later scoped verification. The
other 51 remain unchanged in the compared phase. The separately repaired
native `tests/db` fixtures do not qualify this integration collection.

The original ZIP and raw reporter are privately retained and hash-identified;
the manifest seals the derived census and independent subset review. This
preceding source phase cannot assess the newer Required deliverables feature,
and this release does not claim whole-platform CI is green.

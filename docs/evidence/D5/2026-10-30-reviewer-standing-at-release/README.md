# D5: a CSR whose scientific reviewer no longer stands says so at release (2026-10-30)

Session `…01E8btkB`, D5 CSR-path lane (release). Found by the CSR path
sweep's scientific-review finder and verified by hand. The sweep's verifiers
did not run: they failed on a billing error.

## What already exists

| Exists | Path | What it does | What was wrong |
|---|---|---|---|
| The receipt check at release | `server/services/authoring/csr-scientific-review.ts` `currentCsrScientificApproval` | Every e-sign, freeze, export and filing of a CSR re-reads the retained scientific-review receipt. It re-checks the audit chain, the snapshot binding, the source tables, and the reviewer's current standing (`verifyReviewer`) | The receipt read joined `users u … u.status='active'` and the reviewer's active membership. A deactivated reviewer's receipt was dropped by the join, so release said there was no receipt |
| The reviewer's standing | `verifyReviewer` (same file) | Checks project access (`authorizeAuthoringProgram`), review permission and independence (`assertSignerIsNotAuthor`) | Its access and independence errors are not `CSR_` codes, so the boundary rethrew them and the routes answered 500 |
| The release boundary | `server/services/authoring/workflow-import-governance.ts` `requireCsrScientificRelease` | Turns each `CSR_` refusal into a `WorkflowImportGovernanceError` the routes answer. An unreadable identity is a 503 (`b84f297ca`) | Every `CSR_` refusal got one sentence: "No current scientific-review receipt covers the saved CSR…" |
| The same rule for adoption | `workflow-import-governance.ts` (`requires the adopting reviewer to retain current membership in this tenant`, `workflow-import-governance.pglite.test.ts`) | Release of an imported copy requires its adopting reviewer's current membership | Nothing. It is the same rule, on purpose: requiring the reviewer's current standing is this codebase's design, and this change keeps it |

**What it did to a client.** Take a CRO biostatistician, on a contract
account, who records the LMN-201 CSR's scientific review. The medical director
approves, and the CSR is sealed. When the engagement ends, an admin
deactivates the account. The publisher then exports for 5.3.5.1 and is told
"No current scientific-review receipt covers the saved CSR and its approved
source versions." That is false: the receipt, its chained audit row and its
binding are intact. If the reviewer was instead removed from the project,
export, freeze and e-sign answered 500.

## What changed

- **The receipt is read first, then the reviewer's standing.**
  `currentReceiptRow` reads every retained receipt for this snapshot, newest
  first. It takes the first whose reviewer is still an active member, and
  locks that member's rows against a concurrent deactivation, as the join
  did.
  - A receipt from an earlier active reviewer is still used, as before.
  - When receipts exist but no reviewer of them stands:
    `CSR_SCIENTIFIC_REVIEWER_NOT_CURRENT`, "…recorded by a reviewer who is no
    longer an active member of this organization, and release requires the
    reviewer's current access…".
  - When there is no receipt, the refusal is unchanged.
- **The reviewer's access and independence refusals keep their meaning**
  (`reviewerStandingRefusal`):
  - removed from the project (403): `CSR_EVIDENCE_REVIEWER_UNAVAILABLE`;
  - the project itself not found or its anchor unresolved (404, 409): the
    same code, with the project's own sentence, so it does not claim the
    reviewer lost access;
  - now recorded as an author: `CSR_EVIDENCE_REVIEWER_NOT_INDEPENDENT`;
  - authorship unestablished: `CSR_EVIDENCE_REVIEWER_INDEPENDENCE_UNRESOLVED`.
- **The boundary answers each of these in its own words**, 409, not the
  generic "no receipt" sentence. A lookup that did not run (separation of
  duties unverified, or project access unavailable) is a 503 that says it
  could not be checked. None of them is a 500 any more.
- **The rule itself is unchanged.** Release still requires the reviewer's
  current standing, and nothing is signed or released without it.
- **The boundary's mapping is one function** (`csrReleaseRefusal`), so
  `requireCsrScientificRelease` stays under the complexity limit. The
  existing branches keep their order, status and sentence.

## Also fixed: the scientific-review harness did not load, so a CI step was red

`scripts/ci/csr-scientific-review/scientific-review.test.mjs` is the
scientific review's own proof suite: 40 cases over the core and its adapter.
CI runs it in the `test:ci-scripts` step (`node --test "scripts/**/*.test.mjs"`).
On 2026-10-30 at 08:47, `fa69eaaad` (another lane's "own the product" batch)
made the core import `shared/canonical-json`. That fixed `ci:canonicalizers`.
But the harness transpiles a fixed list of files, and that list did not
include the new import, so the harness failed with `ERR_MODULE_NOT_FOUND`
before running one case. The fix:
- the harness now transpiles `shared/canonical-json.ts` too (`build.mjs`);
- the core imports it as `canonical-json.js`, as it already imports the shared
  CSR rule, so the import resolves under Node as well as in the server.

The harness also pinned the account lock as `FOR SHARE OF r, u, ou, o` on the
receipt read. The lock now sits where the account is read. The harness pins
both: `FOR SHARE OF r` on the receipt and `FOR SHARE OF u, ou, o` on the
member read, with that read's parameters.

## A decision for the founder

Should a sealed CSR still need its scientific reviewer's current access to be
released? Today it does, and a sealed document cannot be reviewed again: a
review request needs `edit`, which an APPROVED or FROZEN document refuses, and
there is no unfreeze. So when a reviewer leaves, the only way forward is for
an administrator to restore that reviewer's access. The refusal now says so.

- **Keep the rule.** Deactivation for cause, such as a compromised account,
  then voids that account's reviews automatically. The cost is that staff and
  CRO turnover strands approved CSRs.
- **Judge the receipt as it was recorded** (recommended). The review was an
  authorized, independent act when it was made, and the chained audit row
  proves it. Part 11 does not void a signature or a review because its maker
  later left. Voiding the reviews of a compromised account then becomes an
  explicit, audited act, not a side effect of deactivation.

Either way, this change is the honest answer for today's rule.

## Evidence: seen failing first

| Check | Red (`red.txt`, the committed code) | Green (`green.txt`) |
|---|---|---|
| `csr-reviewer-standing.test.ts` (new): a deactivated reviewer is named, not "no receipt" | `CSR_SCIENTIFIC_REVIEW_REQUIRED` | `CSR_SCIENTIFIC_REVIEWER_NOT_CURRENT` |
| …and the boundary answers 409 with its own sentence | the generic "No current scientific-review receipt" sentence | passes |
| …a reviewer removed from the project | raw `AuthoringProgramAccessError` (a 500 at the route) | 409 `CSR_EVIDENCE_REVIEWER_UNAVAILABLE` |
| …the project's anchor unresolved | raw `AuthoringProgramAccessError` (a 500) | 409, with the project's own sentence, not "no longer has access" |
| …a reviewer now recorded as an author | raw `SeparationOfDutiesError` (a 500) | 409 `CSR_EVIDENCE_REVIEWER_NOT_INDEPENDENT` |
| …the check cannot run | raw `SeparationOfDutiesUnverifiedError` (a 500) | 503 "could not be checked" |
| The harness, every file at HEAD | does not load (`ERR_MODULE_NOT_FOUND`) | 41/41 |
| The harness repaired, the service at HEAD | the new adapter case gets "No current assigned scientific-review receipt"; the lock case finds no member read | 41/41 |
| `npm run test:ci-scripts` (the CI step) | fails on the harness | 530/530 |
| The 30 vitest files that reach the release boundary or the e-sign, freeze, export and file-to-vault routes | — | 345/345 |
| ESLint, the 6 changed files | — | no file gained a warning |

## Disclosed (files another lane changed in the last 24 hours)

- `server/services/authoring/csr-scientific-review-core.ts`: changed by
  session `…014DhFkp` at 08:47 today (`fa69eaaad`). This change touches only
  its import specifier, `canonical-json` → `canonical-json.js`.
- `csr-scientific-review.ts`, `workflow-import-governance.ts` and the harness
  files: no other lane changed them in the last 24 hours.
- This change adds a row to `docs/work-orders/README.md`, which other lanes
  also change.

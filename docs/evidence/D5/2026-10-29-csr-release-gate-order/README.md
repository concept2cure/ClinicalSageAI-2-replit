# D5: the CSR release gate decides what a document is before it frames it (2026-10-29)

Session `…01E8btkB`, CSR path review for the LMN-201 / RePreve prospect. One
of the review's agents ran every test of the path. It found that e-signature,
freeze, PDF/DOCX/XML export and filing to Vault for Authoring documents had no
passing route-level test. All eleven of those suites were red.

## What already exists

Searched `assertCsrScientificRelease`, `requiresCsrScientificReview`,
`requireCurrentCsrScientificApproval`, `assertWorkflowImportRelease`,
`prepareWorkflowImportAdoption` and `fullVisibleAuthoringSnapshot` in
`server/`, `shared/`, `scripts/` and `tests/`. `git log --all
--diff-filter=D` on `*csr-scientific*` and `*release-order*` found nothing.

| Exists | Path | What it does | What was wrong |
|---|---|---|---|
| The release gate | `server/services/authoring/csr-scientific-review.ts` `assertCsrScientificRelease` (`07857e3e3`, 2026-10-28) | Every freeze, sign, export and file-to-Vault of every Authoring document calls it, through `workflow-import-governance.ts` | It framed the document as the strict full-visible snapshot (UUID ids, every section's code and content) **before** asking whether the document was a CSR. A document that is not a CSR, with one row the snapshot refuses, got a 500 on every release action |
| The identity rule | `requiresCsrScientificReview` | Decides CSR-ness from the stored row (label, provenance) and the audit trail (CSR origin, earlier receipt) | Correct, but it was typed to need the framed snapshot, so it could not be asked first |
| The gate's own suite | `scripts/ci/csr-scientific-review/` (40 tests, Node's runner) | Runs the real core and adapter against test doubles | `91465a856` (mine, 2026-10-29) moved shared rules to `shared/authoring/csr-scientific-review.ts`, and the runner transpiled only two files, so the import no longer resolved. Separately, `npm run test:ci-scripts` (the CI guard self-test step) globs `scripts/**/*.test.mjs`, and this file threw "Use the included test runner" when reached that way. That has been the case since `07857e3e3` |
| The release-path suites | eleven files, listed in `release-suites-red.txt` | Sign ceremony, approval chain, seal binding, PDF/DOCX/XML export, signature manifest, file-to-Vault snapshot and approval carry, workflow-import adoption | Red since `07857e3e3`. They passed on its parent, as the testing agent showed on the same machine |

Nothing was rebuilt. The gate's order was corrected, and the fixtures now answer
the reads the gate and the separation-of-duties check make, truthfully.

## What changed

- **`csr-scientific-review.ts`.**
  - `requiresCsrScientificReview` takes only what it reads: tenant, stored
    row and id.
  - `assertCsrScientificRelease` asks it first and returns for a document
    that is not a CSR. Only a CSR is framed and checked against its receipt,
    in `currentCsrScientificApproval`, which is split out of
    `requireCurrentCsrScientificApproval` with its body unchanged.
  - The gate still fails closed when the identity cannot be read, and still
    refuses a CSR, labelled or known only from its history, that has no
    receipt.
- **The gate's own suite** builds the repository's files itself (`build.mjs`,
  keeping the repository layout). The same 40 tests run through `run.mjs` and
  through CI's glob. Nothing is substituted.
- **Fixtures:**
  - **New shared fixture, `release-governance-reads.ts`.** It gives the
    truthful answers for a fake database: not a CSR, and created by member 9
    with no other contributor.
  - **Route suites that signed document `D1`.** They now use a UUID, as
    production does. The separation-of-duties check (`265ea2c5b`) cannot
    resolve an author for any other id, and refuses 409.
  - **Retitled fixtures.** "Working CSR" (file-to-Vault snapshot) and "CSR
    carried" (approval carry) are Module 2.5 overviews, which their sections
    already were. A CSR there would need a receipt those suites do not seed.
  - **The workflow-import suite** uses a protocol import for its adoption
    predicates, which are the same for every kind. It gains two CSR cases: a
    CSR import is neither adopted nor released without its scientific review,
    and a renamed copy is held by its stored CSR origin.

## Evidence: seen failing first

| Check | Red | Green |
|---|---|---|
| `csr-scientific-release-order.test.ts` (new) | `order-red-green.txt`: with the gate at HEAD, 1/4 fails on exactly the defect (a non-CSR row the snapshot refuses fails release). The three fail-closed cases pass both ways | 4/4 |
| The eleven release-path suites | `release-suites-red.txt`: 105 failed, 19 passed (124) | `release-suites-green.txt`: with the ordering, independence and CSR review-step suites, 148/148 |
| The two new CSR cases | `csr-cases-mutation.txt`: with `requireCsrScientificRelease` made a no-op, both fail | Pass |
| The gate's own suite | `gate-suite-red.txt`: at HEAD the runner cannot find the shared module, and CI's glob throws | `gate-suite-green.txt`: 40/40 both ways |
| Every test file importing a changed module (112 files) | `affected-suites.txt`: 13 files fail; 12 of them fail identically at HEAD with this change stashed (handed on). The thirteenth, `authoring-atomic-mutations.test.ts`, failed two more cases because its fake did not answer the identity read, and the gate failed closed (409) | `authoring-atomic-mutations.test.ts` given the same fixture: 8/8. At HEAD, 2 of its 8 failed, and its two "ROLLBACK + 500" cases passed only because the gate itself answered 500 |

## Disclosed

`csr-scientific-review.ts`, `run.mjs` and `scientific-review.test.mjs` are inside
the 24-hour window of `07857e3e3` (2026-10-28 17:34 UTC). The edits:
- the gate's order, with the receipt check's body unchanged;
- the runner's file list.

Also: every CI run on `concept2cure-v2` from 02:41 to 03:38 UTC on 2026-10-29
reads "queued", so there is no CI verdict to cite. The proof here is local.

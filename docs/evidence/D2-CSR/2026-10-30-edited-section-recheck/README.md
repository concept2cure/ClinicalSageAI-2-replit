# D2 / D4: a CSR section edited after import is re-checked, not blocked forever

Design: `docs/design/CSR_END_TO_END_2026-10-29.md` (slice 5, follow-on). Launch rows: D2 (Authoring) and D4 (biostatistics evidence). Workstream W1. Boundary: AnA's saved-CSR critique verdict only. Nothing in the D5 lane changed: release, review, approval, signing, transmission, `shared/authoring/csr-scientific-review.ts` and the narration tools are untouched.

## What already exists

Re-read before any change. Each piece below was extended. None was rebuilt.

- `server/services/ana/csr-saved-evidence.ts` `assessSavedCsrEvidence` (slice 5, `docs/evidence/D2-CSR/2026-10-30-slice5-saved-csr-evidence/`). It bound each section's claim receipts to the section's hash at import. Any edit made the hash differ, so the section was `SECTION_VERSION_CHANGED` and blocked for good. Slice 5 listed this as "not built". It already had the parts the re-check needs:
  - the unclaimed-figure check (`findUnclaimedNumbers` over the claimed values plus `studyInformationNumbers`), blocking in §2 and §10–13;
  - `CLAIM_NOT_STATED`;
  - the cross-section n/N conflict;
  - the cell comparison against the retained run as it is now (`NUMERIC_MISMATCH`, through `verifyCsrDocumentEvidence`).

  **Extended**, details below.
- `server/services/ana/saved-document-critique.ts` `critiqueSavedDocument` produces the `critique_document` output (`csrSummary`, `csrItems`, `INSTRUCTION`). **Extended** additively: `editedSectionCount` and a `csr-edited-section` item.
- `server/services/ana/csr-section-evidence-binding.ts`, `csr-document-evidence-gate.ts` and `csr-claim-reconciliation.ts`: unchanged. The hash check stays in the binding. The saved-CSR assessor now re-binds an edited section to its current hash, and only after the claim-by-claim re-check below has run.
- `server/services/csr/csr-claim-receipts.ts` (receipt shape, `sectionSha256`) and `unsupplied-statistics.ts`: unchanged, reused.
- Searches run: `SECTION_VERSION_CHANGED|CLAIM_NOT_STATED|sectionSha256|editedSection|re-bind|rebind` over `server shared client/src`, and `git log --all --diff-filter=D -- '*csr*edit*' '*recheck*'`. No other re-reconciliation of an edited CSR section exists. The only producer of the hash binding is the slice-5 import.

## What changed

1. **New `server/services/ana/csr-edited-section.ts` `editedClaimOutcome`** (pure). It tests each claimed cell against a section's current text. It works on numbers only and makes no model call.
   - **stated**: the cell text appears verbatim, or every number of it does (a reformat such as "16 of 305 subjects (5.2%)").
   - **changed**: one of two matches, with numbers that differ from the cell's and that no other claimed cell in the section holds:
     - text in the cell's shape, where the cell's punctuation is fixed and its numbers are free (`18/305 (5.2%)`), for cells with at least two numbers;
     - an n/N or "n of N" with the cell's denominator.
   - **removed**: neither of the above.
2. **`csr-saved-evidence.ts`**:
   - A receipted section whose saved content hash differs from the receipts' `sectionSha256` counts as edited.
   - The gate binds an edited section to its current hash, so the hash alone no longer blocks it. The section is still checked for run and evidence digest, the cell against the current retained run, the endpoint and the population.
   - Every claim goes through `editedClaimOutcome`:
     - **`FIGURE_CHANGED`** blocks. It names `stated` and the `cell` (table, row, column, claimed, current).
     - **`CLAIM_NOT_STATED`** is reported with `blocking: false` when an edit removed the figure. Outside an edited section it still blocks. A removed figure states nothing false, and the reviewer sees it.
   - Unclaimed numbers block in results sections as before.
   - The verdict carries `editedSections: [{ section, state: 'edited after import, re-checked', importedSha256, currentSha256 }]`.
   - The status is `blocked` when any issue that is not `blocking: false` remains, or when a blocking unclaimed figure remains.
3. **`saved-document-critique.ts`**: adds `csrEvidence.editedSectionCount` and a `csr-edited-section` item for each edited section, and updates the instruction text. The snapshot digest already covers the verdict.

## Proof (fail first)

| Check | Red | Green |
|---|---|---|
| `saved-csr-evidence.pglite.test.ts`, new describe block (real SQL, receipts from the real drafting → import path) | `red.txt`: 4 of the 5 new cases fail on the slice-5 code: the reworded edit, 16→18/305, the unsourced number in §11 and the removed figure. The fifth case (an edited section whose source cell changed still blocks) is a guard that passes on both. | `green.txt`: a reworded §11.4 keeping `16/305 (5.2%)` → `reconciled_pending_human_review`, `editedSectionCount: 1`, item `edited after import, re-checked`. 16/305 → 18/305 → `blocked` with `FIGURE_CHANGED` `stated: '18/305 (5.2%)'`, cell `primaryEfficacy[0][2]` claimed and current `16/305 (5.2%)`, blocking unclaimed `18`, and no `SECTION_VERSION_CHANGED`. "Median time to cure was 12 days." added in §11.4 → `blocked`, blocking unclaimed `12`. Figure removed → `CLAIM_NOT_STATED`, `blocking: false`, reconciled. Changed source → `NUMERIC_MISMATCH` on the edited section. |
| `csr-edited-section.test.ts` (new, pure) | (new) | verbatim and reformatted are stated; shape and n/N changes are named; another claimed cell is never mistaken for a changed one; a one-number cell has no shape |
| Mutations (`red-mutations.txt`) | M1, the edited section not re-bound (the hash alone blocks): 5 fail. M2, FIGURE_CHANGED removed: 3 fail. M3, a removed figure blocks: 1 fails. M4, issues never block: 5 fail. | restored, 19/19 |
| Neighbours (`neighbours.txt`) | | 48 files, 473 tests: saved-document critique, the CSR evidence gates, workflow-source import, every `server/services/csr/__tests__` |

One existing slice-5 assertion was updated deliberately. The synopsis edited to `15/305 (4.9%)` used to show `SECTION_VERSION_CHANGED` plus `CLAIM_NOT_STATED`. It now shows `FIGURE_CHANGED` (stated `15/305 (4.9%)`, the cell named), and the case asserts that `SECTION_VERSION_CHANGED` is absent. It is still `blocked`, still `revise`, and still carries the cross-section conflict and the blocking unclaimed `15` and `4.9`.

ESLint is clean on every changed file. The largest file is 307 lines.

## Adversarial review (2026-10-30)

A changed figure passed. `16/305 (5.2%)` edited to `18 of 305 subjects (5.2%)` in a section that also claims `18/300 (6.0%)` was classified `removed` (non-blocking), and 18, 305 and 5.2 are all claimed numbers, so nothing blocked and the verdict was `reconciled_pending_human_review`. Cause: `changedRatio` skipped any numerator that appeared in any claimed cell. Fix: it now skips a hit only when that exact n/N is a claimed ratio. Red: `red-review.txt` (the new case in `csr-edited-section.test.ts` gets `{ state: 'removed' }`). Green: `csr-edited-section.test.ts`, `saved-csr-evidence.pglite.test.ts` and `medical-writing-review-document-ref.pglite.test.ts`, 31/31.

## Not done here (reported, not claimed)

- **"Likely meant to be" is a pattern heuristic, and it is limited.** A changed figure is paired with its cell only if it keeps the cell's shape or its n/N denominator. If a writer rewrites `16/305 (5.2%)` as "5.9% of subjects", that is not paired. It is still caught: the claim is `CLAIM_NOT_STATED` and `5.9` is a blocking unclaimed figure in a results section. It is just not named against the cell. Numbers written as words are still not detected (slice-2 note).
- **The removal policy is a judgement.** A claimed figure removed by an edit does not block. Removing the primary result from §11.4 is a completeness question for the human reviewer, not a number-to-source failure. If the founder wants removal to block, it is one line: the `blocking: false` in `unstatedClaims`.
- **The re-check reads the accepted text.** Pending tracked insertions change the content hash but not the accepted text. The section then shows as edited and re-checked, and the critique's existing pending-change coverage still makes the document verdict `revise`.
- **The `medical_writing_review` document-reference lane** (`saved-section-writing-review.ts`) builds its per-section gate input from `gateEntry`, so an edited section is re-bound there too. Adversarial review checked that path: it also filters the whole-document verdict's `issues` (so `FIGURE_CHANGED` and `CLAIM_NOT_STATED` reach it, and its status honours `blocking`) and reports the section's `edited` entry. No further hand-on is needed from this item.
- **A one-number cell replaced by another claimed number still passes.** If `5.2%` (claimed alone) is edited to `6.0%` and `6.0` is a number another claim of the same section carries, the claim is `CLAIM_NOT_STATED` with `blocking: false` and `6.0` is not unclaimed. No structural signal separates that from a deletion. Making removal block (the judgement above) would close it.
- **The full-project typecheck is still owed.** `tsc --noEmit -p .` with 12 GB was OOM-killed (exit 137) on this 15 GB container while other lanes ran. A scoped check over the changed files, with imports pulled in transitively, shows 0 errors in them (`typecheck.txt`).
- **End to end on LMN-201 / PUNCH CD3 is still blocked**, as in slice 5. No deployed retained run, job or import exists.
- The verdict remains `reconciled_pending_human_review`, never approval. The D5 approval gates are unchanged.

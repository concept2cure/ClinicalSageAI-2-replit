# D2 — CSR: a revised CSR replaces the earlier one; partly placed files can be withdrawn

Design: `docs/design/CSR_END_TO_END_2026-10-29.md`, slice 8 reach. Launch row D2 (Authoring, Submission Center), workstream W1. Board row: "AnA builds a CSR end to end". Closes `2026-10-30-assembly-reach` Remaining 5 ("A placement is `new` leaves only. Replacing a CSR already placed in an earlier sequence … is not offered"), its follow-up Remaining 1 (a revised CSR "files it `new` beside the earlier one"), and the adversarial-verification remainder ("the build is edited after a part-way placement … the earlier leaves stay in the open sequence … Removing them is a manual leaf deletion today").

Boundary: the D5 lane's release, review, approval, signing and transmission, `shared/authoring/csr-scientific-review.ts` and the narration tools `draft_safety_narrative` / `narrate_statistical_result` / `record_endpoint_result` were not touched. No sequence gate (freeze, validation, signature, dispatch, transmit) changed.

## What already exists

Searched for: `lifecycleOp`, `lifecycle_op`, `parentLeafId`, `parent_leaf_id`, `replace`, `modified-file`, `modifiedFile`, `computeLifecycleOperations`, `bindVaultVersionsToFiledPredecessors`, `bindToFiledPredecessor`, `readVaultPredecessorKeys`, `version-lineage`, `bindWithdrawalToFiledLeaf`, `loadLatestPriorManifestBySubmission`, `priorModule3Leaves`, `removeLeaf`, `LEAF_REMOVED`, `sameDocumentLeafInSection`, `alreadyPlaced`, `leafFileCarriesKey`, `renderedLeafPackageName`, `stf_file_tag`, `study_id`, `CSR_SUPPLIED_APPENDICES`, `CSR_LISTING_APPENDICES`, `CSR_BODY_FILE_TAG`, `withdraw`, across `server/`, `shared/`, `client/src/`, `migrations/`. `git log --all --diff-filter=D` on `*lifecycle*`, `*withdraw*`, `*placement*`: nothing relevant deleted.

| Piece | Path | What it does | What it did not do (before this change) |
|---|---|---|---|
| Canonical leaf writer | `server/services/submission-service/submission-service.ts` `upsertLeaf` | Every placement door; records `lifecycle_op` and `parent_leaf_id`; refuses a frozen/dispatched sequence. | Admitted a `parentLeafId` **only in the same sequence**, so no leaf could name the filed leaf it supersedes. CMC Module 3 placement (`cmc/place-module3-into-submission.ts`) worked round it by placing `replace` with no parent. **Extended**: the parent check moved into `assertParentLeafInScope`; for replace/append/delete it also admits a live, non-withdrawal leaf of an *earlier* sequence (by number) of the *same* submission and organization. Same-sequence parents behave as before. |
| Canonical leaf remover | same file, `removeLeaf` | Soft delete under the sequence lock, refuses a leaf another leaf points at, `LEAF_REMOVED` audit row with the reason. | **Reused unchanged** by the withdrawal. |
| Lifecycle at packaging | `server/services/ectd/package-from-core.ts`, `lifecycle-operator.ts`, `version-lineage-binding.ts` | Diffs the sequence against the filed prior manifest by `section/fileName` (or a lineage key); Vault versions bind to their filed predecessor (P-42). A declared replace the diff cannot bind is left out with "no filed leaf named …", which blocks transmit. | A rendered leaf's name carries its rendered-file id, so a revised CSR body never matched the filed body: a declared `replace` was refused at packaging. **Extended** (`readEarlierParentKeys`, `lineageSources`): a declared replace/append whose row names a parent leaf in an earlier sequence of the submission is given that parent's document key as its predecessor, through the *existing* binder (renamed input: `sources` instead of `vaultUuids` + `predecessors`; Vault behaviour unchanged). |
| CSR placement | `server/services/csr/csr-assembly-placement.ts` | Places every assembled leaf through `upsertLeaf` under `m5.3.5.x` with study id and STF role; refusals before writing; claim/resume. | Every leaf `new`, no parent. No preview. A `partial` placement could only be finished, never undone. **Extended.** |
| Assembly record | `csr_assembly_runs.placement` (`migrations/20260628_csr_job_state.sql`) | Records each placed leaf `{ appendix, leafId, fileName }`. | Used here as the authority for which *part* of the report a filed `study-report` leaf is (body vs §14). **No migration.** |
| Board | `client/src/concept2cure/v2/surfaces/CsrAssemblyControl.tsx` | Assemble, show, place. | **Extended** with `CsrPlacementLifecycle.tsx` (new, 106 lines). |
| Submission Center leaf screens | `EctdCompile.tsx`, `SubmissionSeqWorkspaces.tsx` | Show and remove leaves; a user's withdrawal (delete) is placed there. | Not changed. The CSR flow points the user there for a withdrawal; it never withdraws a filed file itself. |

## What changed

- `server/services/csr/csr-placement-lifecycle.ts` (new). `readPriorCsrStudyLeaves`: the study's current CSR leaves in earlier sequences of the target's submission, by `study_id` (the job's protocol/study id, which placement writes) and section, limited to the CSR STF roles; superseded leaves (a later earlier-sequence leaf names them as parent), removed leaves and withdrawals excluded; a delete in the target sequence naming one is read as the user's withdrawal. Each leaf's part: the appendix the CSR placement recorded for it, else its STF role (every §16 appendix has its own); a `study-report` leaf no CSR placement wrote is *not identified*. `planCsrLifecycle` (pure): one current predecessor → `replace` with that parent; none → `new`; two or more → refused (`CSR_PLACEMENT_PREDECESSOR_AMBIGUOUS`); a current predecessor the assembly no longer has, or an unidentified one → listed. **Never by file name.**
- `csr-assembly-placement.ts`: before the claim, the plan is computed and refused when undecided: `CSR_PLACEMENT_PREDECESSOR_UNDECIDED` names each earlier file (part, title, sequence, leaf id) and says it stays current at the agency unless withdrawn in Submission Center or confirmed on file. `keepOnFile` (leaf ids) records that confirmation; an id that is not such a file is refused (`CSR_PLACEMENT_KEEP_ON_FILE_INVALID`), not ignored. Each leaf is written with its operation and `parentLeafId`; the placement records `lifecycle: { replaced, keptOnFile, withdrawnHere }`. `previewCsrPlacementLifecycle` returns the plan and writes nothing. A `withdrawn` placement may be placed afresh into any open sequence.
- `server/services/csr/csr-placement-withdraw.ts` (new): `withdrawPartialCsrPlacement` — only a `partial` or `interrupted` placement (a placed one is refused, `CSR_PLACEMENT_WITHDRAW_NOT_PARTIAL`, and pointed to Submission Center); only while its sequence is open (`CSR_PLACEMENT_SEQUENCE_LOCKED`); claimed on the row; only the leaves the placement record names that are still live in that sequence and still point at one of this assembly's own rendered files (others are listed as not removed, untouched); each through `removeLeaf` with the user's reason (≥ 8 characters), so each removal has its `LEAF_REMOVED` row; recorded as `withdrawn` with who, when, why, removed and not removed. A removal refused part-way is recorded as it happened.
- `server/routes/csr-jobs-assembly.ts`: `GET …/assembly/:assemblyId/lifecycle?sequenceId=`, `POST …/assembly/:assemblyId/withdraw-placement`; `place` takes `keepOnFile`. Same scope checks (write access for the POST). `ci:launch-scope-api`: 545 paths, none refused.
- Board: on choosing a sequence, each file's operation ("replaces leaf 700 (Earlier body) in sequence 0003" / "new (study … has no earlier file …)"), each ambiguous part as an alert, and each earlier file left out with a "Stays on file" checkbox; "Place CSR files" stays disabled until each is decided. A partial or interrupted placement offers "Withdraw the partly placed CSR files" with a reason; the server's refusal is shown as stated; a withdrawal is stated with who, when and why, and placement is offered again.

## Proof, red first

| Red (before the change) | File | Green |
|---|---|---|
| A declared replace of a revised CSR body was left out at packaging: "declared replace: no filed leaf named csr-body-pdf-rendered-leaf-files-501.pdf …" | `red-packager-binding.txt` | `lifecycle-parent-leaf-binding.test.ts`: `operation="replace"` with `modified-file="../0000/index.xml#leaf-csr-body-500"`; nothing skipped; the §14 tables 0001 does not mention stay on file |
| Revised CSR placed `new` (`lifecycle_op: 'new'`, no parent); an earlier file left out placed over silently; no withdrawal | `red-placement-lifecycle.txt` | `csr-assembly-lifecycle.pglite.test.ts` (real assembler, `storeRenderedLeafFile`, `upsertLeaf`, `removeLeaf`): every part `replace` with its own parent (body and §14 each their own, though both are `study-report`); the new part `new`; the third placement replaces 0001's files, not superseded 0000's; the dropped part refused by name until kept on file; withdrawal removes exactly the two partly placed leaves, leaves a hand-placed leaf and the earlier sequences alone, one `LEAF_REMOVED` row per leaf carrying the reason; refused for a placed assembly, a frozen sequence, twice |
| `upsertLeaf` refused an earlier-sequence parent: "parentLeafId must reference a leaf in this sequence …" (placement and writer tests) | `red-leaf-writer.txt` | `leaf-parent-earlier-sequence.pglite.test.ts`: earlier same-submission parent admitted; a later sequence, another submission, another organization, a removed leaf, a withdrawal, and any outside parent for a `new` leaf refused |
| Board: no lifecycle shown, no withdraw control, no withdrawn state | `red-board.txt` | `csrAssemblyControl.test.tsx` (3 new) |

Adversarial (`mutations.txt`; file restored, SHA-256 equal): skipping the undecided refusal turns the "refuses to drop silently" test red; not excluding superseded earlier leaves turns all four red (every part reported ambiguous).

## Verification

- `green.txt`: 34 files, 342 tests: the CSR assembly suites (run, packaged, lifecycle, route, assembly, -source, -review, -scale), `csrAssemblyControl`, every `lifecycle-*`, `assemble-from-core*`, `vault-version-lifecycle-binding`, `withdrawal-approval-binding`, `package-sequence-lifecycle`, `export-application-identity`, `rendered-leaf-files`, `place-module3-into-submission`, `leaf-*` and `remove-leaf`. The one failing file there, `leaf-study-tagging.pglite.test.ts` (20), fails identically with `submission-service.ts` at `HEAD` (checked by swapping the file: 36 failed / 28 passed in that file plus `sequence-validated-honesty`, `submission-program-anchor`, `gateway-selection`, both ways). Not caused here; not fixed here.
- ESLint, every changed file: no new warning. `upsertLeaf` went from 235 lines / complexity 57 to 216 / 56; `packageSequenceFromCore` 220 → 219 lines, complexity 47 unchanged (both pre-existing); `submission-service.ts` keeps its pre-existing max-lines warning (4093 → 4115 lines at HEAD → now, the working tree including other lanes; this change adds the 47-line helper and removes 26; the file was already over 1500, the edit is the smallest that reaches the writer). Largest new file 300 lines (`CsrAssemblyControl.tsx`).
- `ci:sql-interpolation`: OK (every value bound). `ci:tenant-isolation:no-regression`: one finding, `server/services/qms/training-compliance.ts` (`users`), not a file touched here (another lane's working tree); every new raw query states `organization_id`.
- **Full `tsc` not completed.** `NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .` was killed by the kernel (exit 137, `tsc.txt`) four times: this 15 GB container ran other lanes' full `tsc` at the same moments, and two cannot fit. In its place, `tsc-changed-files.txt`: the root tsconfig with only the changed and new files (and their imports) as roots. It reports no error in any changed file; its 20 errors are in untouched files and come from that subset leaving out the ambient declarations the full project includes (`server/types/*.d.ts`, the Express `Request` augmentation). The root session should run the full check before committing.

## Remaining

1. "Same application" is the submission. A CSR filed under another submission of the program (another IND) is not its predecessor, which is eCTD's own scope; it is not listed either.
2. Earlier sequences count whether or not they were transmitted; the packager binds against **filed** state only, so a replace whose parent sits in an unfiled earlier sequence is reported by the packager (skipped, which blocks transmit) rather than shipped.
3. The Study Tagging File itself is regenerated per sequence and ships `new`; whether a follow-up STF should `replace` the filed one is a packager question, unchanged here.
4. ~~The board offers "stays on file"; withdrawing an earlier file is done in Submission Center.~~ Superseded by the adversarial review below: no Submission Center screen could do it.
5. `cmc/place-module3-into-submission.ts` still places `replace` with no parent; its comment that upsertLeaf admits only same-sequence parents is now out of date. Not this lane's file.
6. The AnA tool description (`submission-center-tool-defs.ts`, `parent_leaf_id`: "the leaf in THIS sequence") is narrower than the writer now is. Not this lane's file.

## Adversarial review (2026-10-30)

**Finding (honesty, blocking).** The refusal `CSR_PLACEMENT_PREDECESSOR_UNDECIDED`, the ambiguous-part refusal and the board all told the user to "withdraw it in this sequence from Submission Center". That could not be done in a way placement would see:
- the only thing read as a withdrawal was a `delete` whose `parent_leaf_id` names the earlier leaf;
- no client surface sends `parentLeafId` (`grep -rn parentLeafId client/src`: none outside tests);
- the Submission Center leaf form (`SubmissionSeqWorkspaces.tsx`) places a `delete` of a Vault document, and AnA's `place_into_sequence` describes `parent_leaf_id` as "the leaf in THIS sequence".

So a user who followed the instruction stayed refused. The only exit was "stays on file", which is the opposite of what they wanted. An ambiguous part had no exit at all. The `withdrawnHere` path also had no test.

Red: `red-review-withdraw-by-document.txt`. A `delete` naming the earlier file's document, written through the real `upsertLeaf` the way Submission Center or AnA writes one, was not honoured: the file was still listed as undecided.

**Fix** (only in the files this item owns):
- `csr-placement-lifecycle.ts`:
  - A `delete` in the target sequence that names the same document (`document_table` and `document_id`) counts as a withdrawal, as does one that names the parent leaf.
  - A document-naming `delete` in an earlier sequence, later than the leaf, supersedes it.
  - New user decision `withdraw` (leaf ids). It may name only an earlier file the assembly leaves out, or one of an ambiguous pair. Anything else is refused (`CSR_PLACEMENT_WITHDRAW_INVALID`), and so is a leaf named both to keep and to withdraw. Naming one of an ambiguous pair settles which leaf the remaining file replaces.
  - The refusal texts now say what the user can actually do.
- `csr-assembly-placement.ts`: after the claim and before any CSR file, each chosen withdrawal is written as a `delete` through `upsertLeaf`. It names the earlier leaf as parent, points at its document and carries the user's reason, so the existing writer audits it. The withdrawals are recorded on the placement (`withdrawals`, `lifecycle.withdrawing`). If the writer refuses part-way, the refusal says which withdrawals were written. If a CSR file is refused after a withdrawal was written, the placement is recorded as `partial` and is not erased. Nothing is withdrawn that the user did not name.
- `csr-jobs-assembly.ts`: `place` now accepts `withdraw`.
- `CsrPlacementLifecycle.tsx` / `CsrAssemblyControl.tsx`:
  - Each earlier file left out gets a choice between "Stays on file" and "Withdraw in this sequence".
  - Each file of an ambiguous pair gets "Withdraw in this sequence".
  - Place stays disabled until every file left out is decided and at most one current file is left for each part.

**Proof:**
- `csr-assembly-lifecycle.pglite.test.ts`, new case on the real writer:
  - A document-naming `delete` is honoured.
  - A stray leaf id is refused, and so is a leaf both kept and withdrawn.
  - The chosen withdrawal is written as a `delete` with parent and document. The earlier file is untouched, and a later sequence no longer lists it.
- `csr-placement-lifecycle.test.ts` (new, pure): an ambiguous pair is settled only by withdrawing one, and a file the assembly still replaces cannot be withdrawn.
- `csrAssemblyControl.test.tsx`, new case: the board posts `withdraw: [702, 700]` and stays disabled while two bodies are current.
- Mutations (`mutations-review.txt`, each file restored with an equal SHA-256):
  - removing the eligibility check turns the pure test red;
  - reading only parent-naming deletes turns the pglite case red;
  - the builder's board rule (`ambiguous.length > 0`) turns the board case red.

**Re-run:**
- 8 CSR/lifecycle/leaf-parent/board files: 40 tests passed.
- 10 neighbour files (`lifecycle-*`, `withdrawal-approval-binding`, `vault-version-lifecycle-binding`, `remove-leaf`, `place-module3`): 98 tests passed.
- ESLint on every file changed in the review: no warnings. `placeCsrAssembly` was kept at complexity 15 or below.
- `ci:sql-interpolation` OK. `ci:launch-scope-api`: 545 paths, none refused. `ci:tenant-isolation:no-regression`: the one finding is still `server/services/qms/training-compliance.ts`, another lane's file.
- **Full `tsc --noEmit -p .` completed: exit 0, no output** (`tsc-review.txt`).

**Remaining from the review:**
- A chosen withdrawal of a CSR file reaches the package through the existing withdrawal binder, which matches on the document's key (`bindWithdrawalToFiledLeaf`; the rendered file's id is in its filed name). This review did not add an end-to-end packaging test of a CSR withdrawal.
- `upsertLeaf` now accepts earlier-sequence parents for every caller (REST, AnA), not only CSR placement. That widens what the writer accepts, and the packager binds such a parent only for `replace`/`append`. A `delete` is still bound by its document.

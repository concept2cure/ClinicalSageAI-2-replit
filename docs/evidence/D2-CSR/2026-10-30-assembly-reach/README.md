# D2 — CSR: reach assembly from the build board and place its leaves in a sequence

Design: `docs/design/CSR_END_TO_END_2026-10-29.md`, slice 8 ("Remaining 1. Reach"), on the LMN-201 / RePreve study shape. Launch row: D2 (Authoring, Submission Center). Workstream W1. Board row: "AnA builds a CSR end to end" (its "Next": "a control that starts an assembly and places its leaves in a sequence").

Boundary: the D5 CSR-path lane keeps release, review, approval, signing and transmission, `shared/authoring/csr-scientific-review.ts`, and the AnA tools `draft_safety_narrative`, `narrate_statistical_result` and `record_endpoint_result`. None of them was touched. Placing leaves into an open sequence is not a release or a transmission: the sequence's own freeze, validation, signature and dispatch gates are unchanged and still run.

## What already exists

Searched for: assembleCsrJob, assembleCsr, csr-assembly, storeRenderedLeafFile, leafSourceFor, rendered_leaf_files, renderedFrom, upsertLeaf, isSequenceLocked, place_into_sequence, submission_leaves, 5.3.5.1, launchCSRBuildAsync, enqueueCSRBuildJob, runCSRBuildJob, setImmediate, job queue / pg-boss / bull, withTenantConnection, readVerifiedVaultBytes, vaultBinaryAvailableSql, CsrNarrativeBuild, CsrWorkflowBoard, EctdCompile. Across `server/`, `shared/`, `client/src/`, `migrations/`. `git log --all --diff-filter=D` on `*csr*assembl*`, `*assembly-run*` and `*CsrAssembl*` found nothing deleted.

| Piece | Path | What it does today | What it did not do (before this change) |
|---|---|---|---|
| CSR assembler | `server/services/csr/csr-assembly.ts`, `csr-assembly-source.ts` `assembleCsrJob` (slice 8) | Assembles a saved job from the verified import and its retained run into body, §14, §16.2 listings and supplied §16.1/16.3 leaves, with page counts, SHA-256, missing appendices and whether each blocks. | **No caller** (slice 8 "Remaining 1"). No progress report. **Extended** with an optional `onStage(stage, done)` callback, called before each listing, §14 and the body; nothing else changed. |
| Build queue | `server/services/csr/csr-job-runner.ts` `enqueueCSRBuildJob` + `csr-builder.ts` `launchCSRBuildAsync` | A durable `csr_build_jobs` row, a worker started with `setImmediate`, progress on the row, the outcome or refusal recorded there. | There is no generic job queue in the repo (`scheduled-jobs.ts` is cron; `action-queue.ts` is AnA actions). **Followed**, not duplicated: the assembly gets the same pattern on its own row, because a build row's status machine (queued → drafting → complete) describes drafting, and its `progress` is the drafting progress the board already shows. |
| Job tables | `migrations/20260628_csr_job_state.sql` (on `C2C_MIGRATION_FILES`, amended in place by slices 3 and 7) | csr_build_jobs, csr_section_outputs, csr_narrative_outputs. | **Amended in place** (RULE 1) with Table 4, `csr_assembly_runs`; dated header note. Public, `organization_id INTEGER NOT NULL`, `IF NOT EXISTS` only, no DROP. |
| Rendered-leaf seam | `server/services/ectd/rendered-leaf-files.ts` `storeRenderedLeafFile`, `leafSourceFor` | The one place server-rendered bytes become something a leaf can point at (storage provider + `rendered_leaf_files` row, compensation on failure). | Had no CSR kind. **Extended** with `renderedFrom: 'csr_assembly'` (the column has no CHECK). |
| Canonical leaf writer | `server/services/submission-service/submission-service.ts` `upsertLeaf` | Every placement door funnels here: refuses a frozen or dispatched sequence (`isSequenceLocked`), validates the section code, checks the document's organization and pins its digest, carries `studyId` / `stfFileTag`, writes the Part 11 audit row. | **Reused unchanged.** CSR placement calls it once per leaf with `documentTable: 'rendered_leaf_files'`. |
| Leaf materializer | `server/services/ectd/leaf-source-resolver.ts` (`rendered_leaf_files` branch) | Reads the retained bytes at packaging, re-verifies SHA-256 and `%PDF-`. | Reused unchanged. See Remaining 1 for the file-name finding. |
| Vault byte reader | `server/routes/c2c/project-vault.ts` `readVerifiedVaultBytes`; `document-data-disposition/eligibility.ts`; `vault/vault-version-family.ts` `supersededSql` | Verified reads of a Vault document's bytes; eligibility and current-version SQL. | **Reused** to supply §16.1.x / §16.3 from the project's Vault by exact digest (`csr-assembly-supply.ts`). |
| Build board | `client/src/concept2cure/v2/surfaces/BiopharmaProject.tsx` `CsrWorkflowBoard`, `CsrBuildProgress.tsx` (`CsrHeadingReview`, `CsrNarrativeBuild`) | The build's progress view: section review, narratives. | Had no assembly control. **Extended** with one line rendering `CsrAssemblyControl`. |
| Jobs router | `server/routes/csr-jobs.ts` | `/api/csr/jobs` (claimed by `ectd-compile` in `ui-surface-registry.ts`, the board's existing calls go there). | **Extended** with one `router.use(csrAssemblyRouter(...))`, passing its own access helpers (no copy). The launch-scope claim already covers the new paths (`ci:launch-scope-api`: none refused). |
| Sequence screens | `EctdCompile.tsx`, `SubmissionSeqWorkspaces.tsx`, `StudyTaggingInputFields.tsx` | Show the leaves placed in a sequence, their study tagging, compile and validate. | Not changed: placed CSR leaves appear there as any leaf does. |

## What changed

- `server/services/csr/csr-assembly-run.ts` (new): the assembly queue.
  - `enqueueCsrAssembly` validates the declarations (each a §16 appendix, reason 8 to 2,000 characters, recorded with `declaredBy` and `declaredAt`) and the supplied documents, refuses a build with no bound run (`CSR_ASSEMBLY_RUN_REQUIRED`) and a second running assembly (`CSR_ASSEMBLY_IN_PROGRESS`, a partial unique index), and records a run with no progress for 15 minutes as stalled so a dead worker never blocks the build.
  - `runCsrAssembly` (started by `startCsrAssembly` with `setImmediate`, as `launchCSRBuildAsync` starts a build) runs under the organization's tenant connection (`withTenantConnection`) **as the user who asked**: `assembleCsrJob` re-checks that user's access to the job, its import and its retained run. It writes progress and stage as each listing, §14 and the body start, then retains every leaf through `storeRenderedLeafFile` and refuses the outcome if a stored digest differs from the assembled one (`CSR_ASSEMBLY_RETENTION_DIGEST`). The working folder is removed. A refusal is recorded by code with its message; an unexpected error is recorded as "failed before its leaves were retained" and logged.
- `server/services/csr/csr-assembly-supply.ts` (new): the project's current, data-eligible Vault PDFs offered for §16.1.x / §16.3, and their re-read at assembly time, held to the project, the current version and the digest the user chose (`CSR_ASSEMBLY_SUPPLIED_NOT_FOUND`, `CSR_ASSEMBLY_SUPPLIED_DIGEST`). The assembler re-checks `%PDF-` and the digest of the bytes written.
- `server/services/csr/csr-assembly-placement.ts` (new): placement, refused **before anything is written** when the sequence is frozen, dispatched or transmitted (`dispatch_status` sent or acknowledged) (`CSR_PLACEMENT_SEQUENCE_LOCKED`), belongs to another project's submission or to an unanchored one, when any blocking appendix is missing (`CSR_PLACEMENT_BLOCKING_APPENDIX`, naming each), when the structure check or a listing's source check failed, or without a reason. Then it claims the placement on the row (two placements cannot both run) and calls `upsertLeaf` per leaf under `m5.3.5.1` with `lifecycleOp: 'new'`, the leaf's `studyId`, its STF `stfFileTag`, the retained row and its MD5. A refusal part-way is recorded as `partial`, naming the files placed.
  - **Not-applicable declarations are made on the assembly, not at placement.** The body's §16 list then states the declaration with its reason, so the filed report and the placement agree. Placement carries the declarations onto its record.
- `server/routes/csr-jobs-assembly.ts` (new), mounted by `csr-jobs.ts`: `POST/GET /api/csr/jobs/:jobId/assembly`, `GET …/assembly/supply-candidates`, `GET …/assembly/targets` (the program's open sequences), `POST …/assembly/:assemblyId/place`. Write access to the job's project is checked now, as the user, for both POSTs.
- `client/src/concept2cure/v2/surfaces/CsrAssemblyControl.tsx` (new), on the board under the narratives: "Assemble CSR files" queues; a progress bar and the stage show while it runs (polled every 2 s). The result lists every leaf (file, content, section and STF role, pages, SHA-256) and every missing appendix with "Blocks placement" or "Include if it applies", its reason, a Vault choice for a supplied appendix and a "Not applicable because" field; assembling again carries the choices. "Place CSR files" takes a sequence and a reason. Every refusal and failed read is an alert with the server's words; "This build has not been assembled." appears only when the read succeeded and there is no assembly.

## Proof, red first

`red-guards-removed.txt`: the three suites with the guards removed (the sequence-lock check and the blocking-appendix check in `csr-assembly-placement.ts`, and the control's rendering of a placement refusal). 4 tests fail:

| Red (guard removed) | Green |
|---|---|
| Placing into a frozen sequence: the leaf writer was reached | `CSR_PLACEMENT_SEQUENCE_LOCKED` "Sequence 0004 is frozen; its leaves cannot change. … Nothing was placed." for frozen, dispatched and transmitted (`dispatch_status: 'sent'`); `upsertLeaf` not called; no placement recorded (service and route) |
| A missing blocking 16.1.1: placed anyway | `CSR_PLACEMENT_BLOCKING_APPENDIX` "Appendix 16.1.1 (Protocol and protocol amendments) … missing. Supply each one, or declare it not applicable with a reason and assemble again. Nothing was placed." |
| The control rendered nothing on a placement refusal | The refusal is an alert, word for word |

## Adversarial review (2026-10-30)

The review found two ways to place a CSR the board itself reports as unfit to file. Both are now refused before anything is written, and each was seen red first (`red-guards-removed.txt`, addendum):

- **A body citing a file the assembly does not contain.** The assembler reports each reference it could not link (`unresolvedReferences`, which makes the assembly `incomplete`), but placement checked only blocking appendices, structure and listings. A report saying "see Table 14.3.9" with no such table was placed. Now refused with `CSR_PLACEMENT_UNRESOLVED_REFERENCE`, which names the references.
- **An assembly of a build that is not complete.** `readCsrJobBinding` refused only a cancelled build, so an assembly of a build still `drafting`, or a `failed` one, could be placed as a filing. The body's gap list said "partial draft". Placement now requires the build's status to be `complete` (`CSR_PLACEMENT_BUILD_INCOMPLETE`). Assembling such a build for review on the board is still allowed.

Not changed, recorded here: `bodyGaps` still do not block placement, because §15 is always reported as a gap for a full-scope build (`e3SectionDraftingMode`), so blocking on every gap would block every CSR. The board shows each gap. A placement is also not checked against the job's current fingerprint: an assembly made before a section was edited can still be placed. Placement tests stub `upsertLeaf`. The real writer's contract is exercised by its own suites, not by these.

## Verification

- `green.txt`: 11 files, 56 tests, the new suites and their neighbours (csr-assembly, -source, -review, -scale at 400 subjects, csr-jobs-narratives, csr-narrative-store, csrNarrativeBuild, csrBuildProgress). Further neighbours run green: the schema contract and pglite suites that load `20260628_csr_job_state.sql` (csr-section-review, csr-jobs-build-and-review, authoringWorkflowImport, authoring-section-commits-to-filing), rendered-leaf-files, leaf-source-resolver-rendered-files, csrWorkflowProgramScope (7 files, 122 tests).
- The end-to-end test (`csr-assembly-run.pglite.test.ts`) runs the **real** assembler over slice 8's SYNTHETIC LMN-201 fixture, through the worker, against the real migration replayed twice: every leaf retained with its page count and SHA-256, the stages written, a stored copy that differs refused, placement refused and then placed with each leaf's STF role (the body is `study-report`), and a writer refusal part-way recorded as partial.
- `npm run ci:launch-scope-api`: 542 API paths, none refused. `ci:migration-drop-safety` and `ci:migration-set-order`: OK.
- ESLint on every new and changed file: no new warning (`BiopharmaProject.tsx` keeps its 12 existing warnings; the new files have none). Every file is under 300 lines; `csr-jobs.ts` is 533.
- `tsc.txt`: `NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .`.

## Remaining (not done here)

1. **Cross-file links break when a placed CSR is packaged.** The materializer names each `rendered_leaf_files` leaf `<label>-<source key>.pdf` (`leaf-source-resolver.ts` `leafFileName`), so `csr-14-tables.pdf` ships as `csr-14-tables-pdf-rendered-leaf-files-<id>.pdf`. The body's GoToR links and the packager's `crossReferences` name `csr-14-tables.pdf`. Slice 8's own end-to-end packaged its leaves directly, so it never met this. The fix belongs in the materializer (keep the assembled file name for a `csr_assembly` row, which is unique within the study folder) or in the assembler (link by the shipped name); it changes a shared packaging path and is the next item.
2. The worker holds one tenant connection for the whole assembly (minutes at 10,000 pages) and reads each leaf whole to store it (`storage.put` takes a Buffer), as slice 8 recorded.
3. A worker stopped by a restart is only recorded as stalled when the next assembly is asked for, or 15 minutes later; the board shows the time of the last progress meanwhile. There is no resume: a stalled assembly is assembled again.
4. Population flags, protocol deviations and ADLB are still not read from the retained run (slice 8 Remaining 2), so 16.2.2, 16.2.3 and 16.2.8 are listed missing and blocking until supplied that way or declared not applicable.
5. A placement is `new` leaves only. Replacing a CSR already placed in an earlier sequence (`replace` with a parent leaf) is not offered.
6. The declaration names the user by id on the board; it is recorded with the user id and time on the row and on the placement.

## Follow-up fixes (2026-10-30)

Four defects from the review above, each seen red before it was fixed (`red-followup.txt`: the new tests run against the tree before each change). Launch row D2, workstream W1, unchanged scope: no new surface, route, table or migration.

### What already exists (searched before changing anything)

Searched for: `leafFileName`, `leafFileCarriesKey`, `leafSourceKey`, `rendered_leaf_files` in `leaf-source-resolver.ts`, `package-from-core.ts`, `lifecycle-operator.ts` (`keyOf`, `priorByPath`), `sequence-manifest.ts`, `regional-packager.ts` `leafPackagePath` / `resolveCrossReferences`; `crossReferences` callers (`package-from-core.ts` passes none); `jobFingerprint`, `materializeCsrAssemblySource`, `finish()` fingerprint in `workflow-source-import.ts`; `sameDocumentLeafInSection` / `alreadyPlaced` in `submission-service.ts`; `hasUnresolvedPlaceholders` / `PLACEHOLDER_PATTERN` (`csr-builder.ts`, used by `csr-job-runner.ts`), `csrGaps` "retains a data-to-be-inserted placeholder"; `createIndPgliteDb` (`server/db/pglite-harness.ts`). `git log --all --diff-filter=D` on `*leaf-file-name*`, `*csr-placeholder*`: nothing deleted.

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| Leaf file names | `server/services/ectd/leaf-source-resolver.ts` `leafFileName`, `leafSourceKey`, `leafFileCarriesKey` | Ships every resolved leaf as `<label>-<source key>.pdf`; the key is the document's identity in a filed name (withdrawal binding, version lineage). | Nothing outside the resolver could compute a rendered leaf's shipped name without loading the resolver (database, storage). **Moved verbatim** to `leaf-file-name.ts`, imported and re-exported by the resolver. |
| Lifecycle identity | `lifecycle-operator.ts` `keyOf` = `ctdSection/fileName`; `sequence-manifest.ts` | Decides new/replace across sequences by section and base name. | Has no study in it, which is why the materializer's naming was kept (below). |
| Assembly fingerprint | `workflow-source-import.ts` `finish()` → `materializeCsrAssemblySource().fingerprint` | Hash over every saved section, its content hash, the job's status and the gaps; recorded on the assembly as `jobFingerprint`. | Never compared at placement. **Reached** from placement. |
| Canonical leaf writer | `submission-service.ts` `upsertLeaf` → `sameDocumentLeafInSection` / `alreadyPlaced` | Returns the live leaf (`unchanged: true`) for the same document in the same section, op, study metadata and pin, inside the sequence lock. | Nothing; this is what makes placing again idempotent. **Reused unchanged**, now exercised for real by a placement test. |
| Placeholder rule | `csr-builder.ts` `hasUnresolvedPlaceholders` | The build runner refuses to complete a job with a bracketed placeholder; section status uses it. | The assembly never applied it. **Moved verbatim** to `csr/csr-placeholders.ts`, re-exported by `csr-builder.ts`, applied by the assembler. |

### 1. Cross-file links broke after packaging

Option chosen: **the body links by the name the packager will ship each file under.** The materializer is not changed, so every leaf of every kind, CSR or not, keeps its name byte for byte (`git diff` of `leaf-source-resolver.ts` is the five moved functions, removed, plus one import and one re-export; a script confirmed each removed block is present verbatim in `leaf-file-name.ts`; `leaf-file-name.test.ts`, the six `leaf-source-resolver*` suites and the lifecycle suites pass unchanged).

The other option (have the materializer keep the assembled name `csr-body.pdf` for a `csr_assembly` row) was rejected for two reasons found in the search: lifecycle identity is `ctdSection/fileName` with no study, so study B's `csr-body.pdf` in 5.3.5.1 would be filed as a `replace` of study A's; and a withdrawal binds by `leafFileCarriesKey`, which a name without the key can never match.

- `csr-assembly.ts`: new optional `shipAs(leaf)` input. After the listings, §14 and the supplied documents are written and before the body is drawn, each is passed to `shipAs`, which returns its shipped name. The link targets, the §16 "Filed as" entries, the structure check and the cross-references use those names. Omitted (slice 8's own packaging test), every name is unchanged.
- `csr-assembly-body.ts`: §14 text and links name the tables file through the target map, not the `CSR_TABLES_FILE` constant.
- `csr-assembly-run.ts`: the worker's `shipAs` retains each such leaf at once through `storeRenderedLeafFile` (digest checked as before) and returns `renderedLeafPackageName(fileName, id)` (`leaf-file-name.ts`, which is the materializer's own `leafFileName(row.fileName || 'rendered', 'rendered_leaf_files:<id>')`). The body is retained last. Every leaf is stored once. The summary now carries `packageFileName` per leaf.
- **Red first** (`csr-assembly-packaged.pglite.test.ts`): place a SYNTHETIC LMN-201 CSR through the real `upsertLeaf`, read the sequence's `submission_leaves`, materialize with the real `materializeLeafSources`, package with the real `packageEctdSubmission`, read every GoToR in the packaged body (`readPdfStructure`). Red: 12 targets missing (`csr-14-tables.pdf`, `csr-16-1-1-protocol.pdf`, …). Green: none missing.

### 2. Stale assembly placed

`csr-assembly-placement.ts` `staleRefusal`: re-reads the build through `materializeCsrAssemblySource` as the signed-in user and refuses `CSR_PLACEMENT_ASSEMBLY_STALE` ("The build's sections have changed since this assembly was made … Assemble again … Nothing was placed.") when its fingerprint is not the assembly's `jobFingerprint`, or when the assembly has none. A read failure refuses `CSR_PLACEMENT_SOURCE_UNVERIFIED`, never passes. Red: the placement resolved. Green: refused, no leaf written, no placement recorded.

### 3. Stuck placing claim

- Each placed leaf rewrites the claim (leaves so far, `updated_at`), so a live claim keeps fresh and a stopped one leaves a record.
- `csr-assembly-run.ts` `placementView`: a `placing` claim with no progress for `STALL_MINUTES` (15, the stalled-assembly rule) reads as `interrupted`. The board says "Placement in sequence 0004 stopped before it finished: N file(s) placed. Place again into sequence 0004 to finish." and offers the control with that sequence chosen; it never says "Being placed" for it again.
- Placement claims a fresh row, a `partial` one, or a `placing` one older than 15 minutes (checked in the `UPDATE`'s `WHERE` against the database clock, so two retries cannot both claim), **into the same sequence only** (`CSR_PLACEMENT_RESUME_SEQUENCE` otherwise: the earlier attempt may have written leaves there). A live claim is still refused.
- Idempotence is the canonical writer's: `upsertLeaf` returns the live leaf for the same document in the same section with the same op, study metadata and pin. Proven with the real writer: first attempt refused at the third leaf (2 rows in `submission_leaves`), placing again → exactly one row per leaf, no duplicate `document_id`. A refusal part-way on the second attempt keeps the first attempt's leaves in the record.
- Red: `CSR_PLACEMENT_ALREADY_PLACED` on the retry; the board read `placing`. Green as above.

### 4. Placeholder body not blocking

`csr-assembly-source.ts` records `placeholderSections`: each drafted section the body draws whose text still matches the build runner's placeholder rule. Placement refuses `CSR_PLACEMENT_BODY_PLACEHOLDER` naming them ("Section 11.4.1 still holds a data placeholder … Nothing was placed."); an assembly without the field is refused as stale. The §15 manual-heading gap stays in `bodyGaps`, listed on the board and not blocking: the same test places the clean assembly whose only gap is §15. The board shows each placeholder section as an alert, "Blocks placement". Red: `placeholderSections` absent and the placement resolved.

The build runner already refuses to complete a job with a placeholder (`csr-job-runner.placeholder-gate.test.ts`), so this gate catches text that reaches a complete build later (an edit in review), and an assembly of a build whose status was changed by hand.

### Test header corrected

`csr-assembly-run.pglite.test.ts` said its storage and leaf-writer fakes had the real contracts. They are stubs without those checks; the header now says so and points to `csr-assembly-packaged.pglite.test.ts`, which uses the real `storeRenderedLeafFile`, `upsertLeaf`, `getSequence`, `materializeLeafSources` and `packageEctdSubmission` on the PGlite harness (`createIndPgliteDb`) plus the real `20260628_csr_job_state.sql`. Only object storage (in-memory provider) and the audit sink are stubbed there.

### Verification

- `green-followup.txt`: 32 files, 306 tests (re-run by the adversarial verifier; the builder's 27/248 was from before the CsrAssemblyControl split and its file was left empty): the assembly suites (run, packaged, route, assembly, -source, -review, -scale, csrAssemblyControl), `leaf-file-name`, the six `leaf-source-resolver*` suites, `rendered-leaf-files`, lifecycle (`lifecycle-*`, `package-sequence-lifecycle`, `vault-version-lifecycle-binding`, `submission-leaf-source-evidence`), the `csr-builder-*` and `csr-job-runner*` suites, `csrBuildProgress`.
- ESLint on every changed file: no new warning (`csr-builder.ts` keeps its 3 and `leaf-source-resolver.ts` its 3, as at HEAD; `PlacementControl` was split to stay under complexity 15). Largest changed file: `csr-assembly-run.ts`, 307 lines.
- `tsc-followup.txt`: `NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .`.

### Remaining

1. A CSR leaf ships as `csr-body-pdf-rendered-leaf-files-<id>.pdf`. Each new assembly is a new document identity, so placing a revised CSR in a later sequence files it `new` beside the earlier one; superseding it (`replace` with the parent leaf) is still Remaining 5 above.
2. The stall window is judged by the application clock on read (`placementView`) and the database clock on claim; a skew of minutes between them shifts when the board says "interrupted" but not whether a claim can be taken.
3. A section with no saved output in a complete build ("has no saved output in this selection") is still a listed, non-blocking gap.

### Adversarial verification (2026-10-30)

Each fix was broken on purpose and the suites re-run; every mutation was reverted and the files' SHA-256 checked equal to before.

| Fix | Mutation | Result |
|---|---|---|
| 1. links after packaging | `shipAs` returns the assembler's own name (`leaf.fileName`) instead of `renderedLeafPackageName` | `csr-assembly-packaged` red: 12 GoToR targets not in the package (`csr-14-tables.pdf`, `csr-16-1-1-protocol.pdf`, …, `csr-16-3-crfs.pdf`) |
| 2. stale assembly | `staleRefusal` ignores the fingerprint | `csr-assembly-run` red: "refuses to place an assembly made before the build's sections changed" |
| 3. stuck claim | claim `UPDATE` no longer accepts an expired `placing` row | `csr-assembly-run` red: "lets a placement claim left by a stopped worker expire" |
| 4. placeholder | `bodyRefusal` skips `placeholderSections` | `csr-assembly-run` red: "refuses to place a body whose drafted text keeps a data placeholder" |

- Retry duplicates: the packaged suite retries a part-way placement through the real `upsertLeaf`; every leaf, the two already placed included, is written again and the sequence ends with exactly one row per leaf, no repeated `document_id`. A crash between `upsertLeaf` and the claim refresh is the same case (the writer returns the live leaf).
- The stale check compares like with like: `materializeCsrAssemblySource` is called with the same organization, target and job by the assembler and by placement, and its fingerprint (`workflow-source-import.ts` `finish()`) covers the job row, every output's content and hash, and the gaps.
- Other leaves' names: the five functions removed from `leaf-source-resolver.ts` were extracted from `HEAD` and found verbatim in `leaf-file-name.ts`; the resolver's call sites (`leafFileName(row.fileName || 'rendered', key)` for a rendered leaf, `leafFileName(vaultRow.file_name || 'vault', key)` for an uploaded Vault leaf, and the rest) are unchanged lines, so a non-CSR rendered leaf and an uploaded leaf ship under the same name as at `HEAD`.
- ESLint on every changed file: `csr-builder.ts` and `leaf-source-resolver.ts` have the same three warnings each as their `HEAD` versions (same rules, same functions); every other file has none.
- `tsc`: the first full run found one error, in the new packaged test (`CoreLeaf[]` passed to `materializeLeafSources`, whose input requires `documentTable`/`documentId` present). Fixed by passing the input as `assemble-from-core.ts` does (each field `?? null`); no assertion changed. Full run then exit 0 (`tsc-followup.txt`).
- Remaining, outside the four fixes: the build is edited after a part-way placement. The retry is then refused as stale (correctly), but the earlier leaves stay in the open sequence, and a new assembly placed there would sit beside them. Removing them is a manual leaf deletion today.


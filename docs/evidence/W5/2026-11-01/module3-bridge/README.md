# A compiled Module 3 section is a governed artifact: approvable, never written over once released (F1, 2026-11-09)

**Found by** this lane while designing P-95 Q2 (`../p95-q2/README.md`, "A separate defect"). A read-only agent mapped
every writer of `concept2cure_artifacts`, and this session re-checked each claim in the code.

**The function.** `bridgeCompileToArtifact` (`server/services/module3-convergence-service.ts`). It writes a compiled
Module 3 section (`3.2.S.*`, `3.2.P.*`) into the governed artifact the editor, review, signature and eCTD filing read.
It is called by the CMC compile routes (`server/api/cmc/module3ConvergenceRoutes.ts`,
`module3OperatingSystemRoutes.ts`) and by AnA's Module 3 commands (`server/services/ana-ri/module3-command-handlers.ts`).

## What was wrong (each shown red at HEAD `3ea6208639`)

1. **No compiled section could ever be approved.**
   - The bridge stored `createSourceHash({ narrative, sectionKey })`, a hash of a JSON object, as `content_hash`.
   - The signed act requires a populated head hash to equal `sha256(content)` (`artifact-signed-act.ts`,
     `lockCurrentSignedTarget`).
   - So every approval of a bridged section answered 409 `ARTIFACT_CHANGED`, "The document changed while it was being
     signed". That held even after an independent reviewer had approved it (`red-first-approval-refused.txt`).
   - Module 3 is the featured CMC work area, and its sections are eCTD leaves. A leaf that cannot be approved cannot be
     filed as approved.
2. **A released section was written over.**
   - The bridge updated the latest artifact for the section whatever its status. It replaced the text and set
     `status = 'draft'`, so a **signed, locked release was undone with no signature**.
   - `locked_at`, `approved_version_id` and `published_version_id` were left set beside a draft.
   - The trigger meant to stop this, `prevent_locked_artifact_mutation`
     (`db/migrations/20260318_ga_immutability_hardening.sql`), is on no applier
     (`migrations/20261029k_artifact_versions_no_rewrite.sql` says so).
   - PUT `…/artifacts/:id` refuses a locked artifact; this path did not.
3. **Versions went unrecorded.** The bridge incremented `version` but wrote no `concept2cure_artifact_versions` row, so
   a second compile overwrote the first compile's text with no record of it (21 CFR Part 11 version history).
4. **Metadata was replaced.** `metadata = $3` deleted the governance harness and anything else other writers recorded.

## What already exists (RULE 3)

| Path | What it does |
|---|---|
| `server/services/artifact-signed-act.ts` `lockCurrentSignedTarget`, `lockCurrentSignedVersion`, `recordSignedVersion` | The one signed act. It binds the exact text: the head hash and every version row's hash are `sha256(content)` |
| `server/routes/c2c/artifacts.ts` PUT `…/artifacts/:id` | The editor's write. It refuses a locked artifact, stores `calculateContentHash` (`sha256`), records a version row when content changes, and merges the harness |
| `server/services/cmc-module3-compiler.ts` `createSourceHash` | The compile's own hash of `{narrative, sectionKey}`. It is still written on the bridge's provenance event, which is where it belongs |
| Callers of `bridgeCompileToArtifact` | Already report `{ bridged: false, reason, detail }` to the user (the convergence route's `bridgeSkip`, the OS route's per-section list, AnA's non-fatal path) |

No file, route, table or tool is added. The repair completes `bridgeCompileToArtifact` to the rules its siblings
already follow.

## The repair

- **Under the artifact's row lock** (`SELECT … FOR UPDATE`), so a signature and a compile on the same section
  serialize.
- **A locked artifact is refused** (status `locked`, or any status with `locked_at` set), with
  `{ bridged: false, reason: 'artifact_locked', detail }`:
  - the detail says the section was released by signature, that the compiled text was not written, and how to change
    it (return it to draft, then compile again);
  - the result type gains `artifact_locked`.
- **`content_hash = sha256(text)`**, on both the insert and the update. The compile hash stays on the provenance event.
- **The version row** for the version written is recorded on the same transaction. A row already at that version
  violates the unique key, and the bridge rolls back.
- **Metadata is merged:** `COALESCE(metadata::jsonb, '{}') || $3::jsonb`. The column is `json`, and `jsonb → json` is an
  assignment cast, which was checked on a real engine.

**Unchanged.** An approved (not locked) section that is recompiled still returns to draft with the new version, so its
approval no longer covers the text, as an edit's does.

## Runs

| Run | File | Result |
|---|---|---|
| Red first: the four ceremony-suite cases against HEAD's bridge | `red-first.txt` | 4 red |
| The consequence at HEAD: the approval case with its hash assertions removed | `red-first-approval-refused.txt` | 409 `ARTIFACT_CHANGED` after an independent approving review |
| Mutant: the update stores the compile hash again | `mutant-compile-hash-stored.txt` | 1 red |
| Mutant: a locked artifact is written over again | `mutant-locked-written-over.txt` | 1 red |
| Mutant: only `status` is read, not `locked_at` | `mutant-locked-at-ignored.txt` | 1 red: the legacy `published` row with `locked_at` |
| Mutant: no version row | `mutant-no-version-row.txt` | 3 red |
| Mutant: metadata replaced, not merged | `mutant-metadata-replaced.txt` | 1 red |
| Green: the ceremony suite | (in the commit) | 53/53 |
| Downstream: every suite that imports the bridge or its callers | `downstream.txt` | 37 files, 466/466 |
| Lint | `eslint-changed-files.txt` | 0 errors; warnings unchanged (1 and 6) |
| Scoped tsc: the service, its three callers and the suite | — | 0 errors in them; only TS7016 in unrelated imports |

**Not tested, and why.** The row lock: a single PGlite connection cannot run two transactions at once. The lock is the
same `FOR UPDATE` the signed act takes on the same row.

**The tests** extend `server/routes/c2c/__tests__/artifact-approval-ceremony.pglite.integration.test.ts`, because only
that suite drives the real signed act through the status route on a real engine:
- the bridge's span-lineage gate is mocked there, because its tables are not built and no other case reaches it;
- `cmc_provenance_events` is built from `db/migrations/20260401_cmc_convergence_os.sql`.

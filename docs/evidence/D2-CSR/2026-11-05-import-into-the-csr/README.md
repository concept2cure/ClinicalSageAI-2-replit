# D2: a CSR build's approved sections are imported into the CSR document itself (F6, 2026-11-05)

Launch row D2, workstream W1, package F1 (repairs). Roadmap step 3 of `docs/design/CSR_END_TO_END_2026-10-29.md`
("a heading's draft is the editor's section draft"); CLAUDE.md RULE 4 (one editor, never a second copy of the
document).

**The defect (F6 of `../2026-11-02-phase2-demo-walk/README.md`).** The CSR document's own panel, "Build from the
study's data", offered "Import approved sections into Authoring". That created a new working copy titled with the
study. The CSR the person started from New document, froze the study data in and built from, stayed a template. The
demo therefore had two CSR documents, and the reviewer worked on the other one.

**Now.** The panel's button reads "Import approved sections into this document". The approved headings are written
into that document's matching sections, by ICH E3 number, and no document is created. On success the panel calls
`onDocumentChanged`, so the editor re-reads the sections in place. There is no navigation.

## What already exists (RULE 3)

| Piece | Path | Before | What this change does with it |
|---|---|---|---|
| The import route | `server/routes/authoring.router.ts` `POST /api/authoring/import/source` | Creates a working copy from a source | Unchanged. The same route takes an optional `targetDocumentId`. |
| The import service | `server/services/authoring/authoring-source-import.ts` | Parses, materializes, previews and creates the copy (`createDocumentFromDraft`) | Parses `targetDocumentId` (CSR only). Hands that case to the target mode. The copy path is unchanged. |
| The target mode | `server/services/authoring/csr-import-into-document.ts` | — | The import's target mode. It is split into its own file beside the service, which would otherwise pass 500 code lines (RULE 6: split, don't add). It is not a new route, table or service folder. |
| The source materializer | `server/services/authoring/workflow-source-import.ts` | Reads the build's saved sections. Rechecks approved-only selections: review state and reviewed-content hash per section, on one snapshot. | Unchanged. It runs on the preview's snapshot and again inside the write transaction. |
| The editor's revision path | PATCH `/api/authoring/sections/:sectionId` (inline in `authoring.router.ts`), and the shared writers it calls | The section UPDATE, `enforceAuthorLineage`, `createRevision`, `commitSectionToFiling`, the Part 11 audit row | The same writers, called in the same order, inside one transaction |
| Release governance | `server/services/authoring/workflow-import-governance.ts` | Machine-text qualification, human adoption and source re-verification for imported working copies, keyed on CREATE receipts | Also reads the in-place import's receipts, so the same controls apply to the CSR document |
| The CSR's study data | `server/services/csr/csr-study-data.ts` `listCsrStudyData` | Offers a document's own frozen study data, and an imported copy's build data via `importSource` | Unchanged. The document's provenance names the import, as a copy's does. |
| Section placement | `server/services/authoring/section-placement.ts` | Places a section that POST /sections creates. It does not create ICH E3 headings by number. | Not used. A heading missing from the document is reported, not created. |
| The panel | `client/src/concept2cure/v2/surfaces/CsrRunBuilds.tsx`, `CsrBuildProgress.tsx` `CsrHeadingReview`, `editor/StudyDataBuild.tsx` | Opened `SourceImportDialog` (a copy) | Imports into this document, with a preview, a stated reason and the receipt |
| The working-copy dialog | `client/src/concept2cure/v2/editor/SourceImportDialog.tsx` | Used by every source import | Unchanged, and no longer used by this panel |

**Callers of the copy import, which stay as they are.**
- `surfaces/BiopharmaProject.tsx` (the csr-workflow board, which is not a launch surface).
- `ProtocolDevWorkspace.tsx`, `ProtocolDevProjections.tsx`, `IvdAssessmentWorkbench.tsx` and `AgencyResponseEditor.tsx`.
- `Vault.tsx`, `ProjectHome.tsx`, `editor/ProjectFileActions.tsx` and `editor/DataRoomSourcesPanel.tsx`.

`CsrRunBuilds` is mounted only by `StudyDataBuild`, which always has its document, so this panel no longer opens a
copy.

## Admission (each refusal is named)

| Refused when | Code |
|---|---|
| The document is not in this organization | `IMPORT_TARGET_NOT_FOUND` (404) |
| The document is in another project than the build | `IMPORT_TARGET_OTHER_PROJECT` |
| The person may not edit it, or it is sealed | `IMPORT_TARGET_PERMISSION_DENIED` (403), `DOCUMENT_FROZEN` |
| The document is itself an imported working copy | `IMPORT_TARGET_IS_WORKING_COPY` |
| The build was not drafted from the study data this document froze (`csr_build_jobs.source_run_id` = this document's `csr_study_data.study_data_id`) | `IMPORT_TARGET_STUDY_DATA_MISMATCH` |
| The document already holds sections imported from another build | `IMPORT_TARGET_BOUND_TO_OTHER_BUILD` |
| A selected heading is no longer approved for its saved content hash | `WORKFLOW_CSR_APPROVAL_REQUIRED` |
| The approved state or the document changed since the preview (the fingerprint differs) | `SOURCE_CHANGED` |
| The import is not approved-only | `IMPORT_TARGET_REQUIRES_APPROVED` |

## Design decisions

1. **The edited-section rule.** A section is replaced only if both of these hold:
   - The newest entry of its revision ledger (`doc_revisions`, newest by `created_at`, then `id`) still describes its
     saved text: `content_sha256` is the SHA-256 of the current content.
   - That entry is one of two things:
     - (a) the section's genesis revision, where its creation receipt (the CREATE audit row) records
       `metadata.seeded = true`, a template seed;
     - (b) a revision an earlier import of this same build wrote, where the section's UPDATE audit row records
       `csrBuildImport.jobId` = this build and `csrBuildImport.revisionId` = that revision.

   An empty section holds nothing to lose and is replaced too. Everything else is left untouched and reported as
   "edited here since; not replaced":
   - a human edit, an AnA accept, a revert or a template re-apply;
   - a genesis that was not a template seed;
   - content that no revision describes.

   A section already holding exactly the approved text is reported unchanged and is not rewritten, so importing twice
   writes nothing the second time. This is `replaceable()` in `csr-import-into-document.ts`.
2. **One transaction.** Admission, the approval recheck, the plan, every section write and the receipt run under
   `SERIALIZABLE`. Any failure rolls back everything; a serialization failure is retried once.
3. **The revision path, per section.** Each section gets:
   - the content (the copy's own conversion, `workflowCopySectionContent`);
   - the lineage gate, recording the deterministic compositor (`workflow_import`) as the machine author, as the copy
     does;
   - a ledger revision (`ai-draft-accept`, contributor `workflow_import`);
   - the filing commit (draft source `imported`);
   - a Part 11 UPDATE row carrying the person's reason as the change reason.

   That row's metadata, `csrBuildImport`, records the build, heading, source row, source hash, stored hash, revision,
   fingerprint, reviewer and approval time. It also states "Imported from CSR build N, §X, heading approved by
   <reviewer> at <time>." Span rows have no free-text column, so that sentence lives on the audit row; the spans name
   the workflow-import author.
4. **A document-level receipt.** Each import that writes a section, or finds the build's approved state changed since
   the last receipt, writes a `CSR_IMPORT` audit row with its origin. The document's `provenance.importSource` names
   the same origin. An import that writes nothing must still record the current source: without it, release would
   verify a stale origin. The test caught this.
5. **The same release controls as a copy.** `workflow-import-governance.ts` reads the newest `CSR_IMPORT` origin when
   the document has no genesis receipt. Every written section must be covered by that origin, or release is refused.
   So machine-drafted build text still meets `WORKFLOW_MODEL_QUALIFICATION_REQUIRED`, and the document still needs
   human adoption, exactly as a working copy does. Leaving this out would have let imported machine text bypass a
   fail-closed release check.
6. **One build per document.** Each import selects again every heading this build already wrote here, so one origin
   covers all of them. A heading imported earlier whose approval was later revoked therefore refuses the next import.
   A different build is refused (`IMPORT_TARGET_BOUND_TO_OTHER_BUILD`). Widening this would need per-section origins
   in release governance.
7. **§14.3.3** is held by reference to the build's narrative store. It is reported "held by reference; not copied" and
   not written. The section's read-only rule (`document-lock.ts`) reads only genesis receipts.
8. **A heading the document lacks** is reported "no matching heading; not added". `section-placement.ts` does not
   create ICH E3 headings by number, and the CSR template seeds them all.

## Tests

| Test | On the code before this change | After |
|---|---|---|
| `server/routes/__tests__/authoringCsrImportIntoDocument.pglite.integration.test.ts` (5) | 4 failed: the target was ignored and a copy was created (201), the target refusals were not made, and release governance saw no import (`red/server.txt`). The revoked-approval case passes on both, since the copy refuses it too. | 5 of 5 |
| `client/.../csrCardReach.test.tsx`: "imports exactly the approved sections into this document…", "states a refused import by name…" | 2 failed (no such button) (`red/client.txt`) | green |

The server cases cover:
- writing into the target with no document created;
- the revision, the audit row with the approval statement, and the machine lineage;
- importing twice, which writes nothing;
- a person's edit left untouched;
- a revoked approval refused, and a hash changed after approval refused, with nothing written;
- a foreign target, another project and an unbound study data each refused by name;
- `listCsrStudyData` still offering this document's frozen study data;
- release governance reading the import (`knownMachineRemains`).

**Every suite on the path, after the change:**
- the server CSR, import and release-governance suites: 123 files, 1,598 tests, all passing (`green/server-suites.txt`);
- the client CSR, import and panel suites: 27 files, 411 tests, all passing (`green/client-suites.txt`).

ESLint gives 0 warnings in every touched file.

Two `csrCardReach` cases pinned this panel's copy dialog ("…opens the saved copy there", "names the target project in
the import dialog…"), which F6 removes. They are now the in-place cases above. `csrRunBuildsScope` mounts the panel
with its document.

## Not done here

- **The editor's re-read of the sections.** `StudyDataBuild` takes an `onDocumentChanged` prop, but
  `editor/DocumentWorkbench.tsx` belongs to another session. Its line ~4897 needs one attribute:
  `onDocumentChanged={() => void loadSections(activeDocId)}` on `<StudyDataBuild …/>`. Until then the receipt is shown
  and the editor shows the new text on its next read.
- **The running app.** Not opened by this session. The servers on 5000, 5100 and 5200 belong to other agents.
- **The full typecheck.** Not run, at the coordinator's instruction, because the machine is shared. A scoped tsc over
  the changed files and their imports found 0 errors in them.

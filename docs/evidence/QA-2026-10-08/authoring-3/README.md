# QA 2026-10-08, walk 2: Authoring (j4), five findings

Source: the j4-authoring findings of the second browser walk (`:5078` at `e79cca4d9`, author emily.watson, reviewer raj.patel). Each item was shown failing first and then passing. Nothing here is committed.

| # | Finding | Red | Green |
|---|---|---|---|
| 1 | BLOCKER. A second Place, after an edit, rewrote the filing copy that leaf #81 pins, and the dialog said "Nothing was written" | `item1-red.txt` (6/7 fail), `item1-client-red.txt` (2 fail) | `item1-green.txt` (14/14) |
| 2 | The 2.5 Clinical Overview template's 2.5.1–2.5.7 never reached the IND outline's single 2.5 | `item2-red.txt`, `item2-client-red.txt`, `item2-outline-red.txt` | `item2-green.txt` (34/34), `item2-client-green.txt`, `item2-outline-green.txt`, mutation `item2-mutation-containers.txt` |
| 3 | With no document open, the outline said "sections are still being read" | `item3-red.txt` (2 fail) | `item3-green.txt` (13/13) |
| 4 | Record review decision opened on "Approve" | `item4-red.txt` | `item4-green.txt` (11/11) |
| 5 | File to vault stored the plain-text PDF fallback, without saying so | `item5-red.txt` (filed, 201) | `item5-green.txt` (10/10) |

## 1. A filing copy that a leaf pins is never rewritten

**Cause.** `takeAuthoringSnapshot` keeps one filing copy for each source. The alias map enforces this with `UNIQUE (canonical_id, store)`. A second placement re-takes that same copy and rewrites its text in place. `upsertLeaf` then found the leaf already holding that document id and answered `unchanged: true` without checking the pin. The dialog turned that answer into "Nothing was written".

**Fix.**
- `server/services/coauthor/filing-copy-pins.ts` (new), called from `retakeAliasedCopy`. If a live leaf in a live sequence points at the copy, the copy's text and title are never rewritten. Its status can only move forward (draft → finalized → approved), and only when the text is unchanged. Anything else gets `409 FILING_COPY_PINNED`, which names the leaves and the path forward, and nothing is written, versioned or audited.
- Every snapshot outcome now carries `written`.
- `upsertLeaf` (`alreadyPlaced`) answers `unchanged` only while the leaf's `document_content_sha256` still matches the document. Otherwise it returns `ALREADY_PLACED` with "changed since that leaf pinned it. Nothing was written."
- The dialog (`AuthoringPlaceIntoFiling.tsx`) shows the refusal verbatim. It says "Nothing was written" only when the server reports `written: false`.

The new pglite test is `server/routes/__tests__/coauthorSnapshotPinnedByLeaf.pglite.test.ts`. It uses the real router, snapshot service and `upsertLeaf`. After an edit and a re-place, the copy's text, title, status, `updated_at` and sha256 all still equal the leaf's pin.

**Detection (read-only).** The query is in `detect-rewritten-filing-copies.sql`, and its output on the QA database `c2c_qa` is in `detect-qa-result.txt`.
- Exactly one leaf is affected: **leaf 81, sequence 0000 (draft), section 2.5, copy 53**. The pin is `54633e7a…` and the copy's current text is `cf26c5e1…`. It was re-taken after the pin.
- The pinned text is still recoverable from `coauthor_document_versions` version 1 of copy 53.
- 59 live co-author leaves, of which 3 carry a pin. There is 1 re-take event in total.
- The second query, for leaves placed before pinning existed, found none.

## 2. Sections under an undivided outline node file into that node

**Decision, from the code.** Both the outline and the template are right.
- eCTD files 2.5 as one document, and the IND rule pack has a single node, 2.5.
- The template's 2.5.1–2.5.7 are ICH M4E's headings inside that document.
- The placement dialog already files such a document as one leaf at its own code, 2.5 (`documentFilingCode`).

So the binding was too narrow.

**Fix.** `shared/regulatory/filing-section-key.ts` holds the one rule, shared by the server and the editor's outline. A section belongs to:
- its own outline key, if it has one;
- otherwise its nearest outline ancestor, when the outline does not subdivide that ancestor and the ancestor sits below a bare module;
- otherwise nothing.

`commitSectionToFiling` writes the node as the document's sections under it that have text, assembled in editor order by the one assembler. That assembler is `assembleAuthoredSections`, now exported from the bridge. The save reports `partOf`, and the confirmation names the node. The outline's 2.5 opens 2.5.1.

**What stays as it was.** A section under a node the outline subdivides (for example 3.2.S.9 under 3.2.S) still gets "The filing has no section …". `item2-mutation-containers.txt` shows that guard failing when the container rule is removed.

## 3. "Still being read" with no document

**F4 check.** F4 (an unstarted section in an open document can be started) is the other session's slice, so starting a section is not built here.

**The distinct defect.** With no document open, `sectionsState` stays `idle`. The outline treated `idle` as "being read", so the message described a read that never starts.

**Fix.** `editor/outlineReadState.ts` separates five states: documents being read, documents unreadable, no document open, sections being read, sections unreadable. With no document open, the node title and the click now say "No document is open … create one with New document."

## 4. The review decision starts unstated (P-21)

The dialog now opens on "Not stated — choose". The button reads "Record decision" and stays disabled. Nothing is sent until a verdict is chosen.

## 5. File to vault refuses the plain-text PDF fallback

No decision anywhere allows filing the fallback with an acknowledgement. I checked `docs/LAUNCH_DEFINITION_OF_DONE.md` and `docs/design`, so this fails closed.

The refusal is `503 PDF_RENDERER_UNAVAILABLE`: "The PDF renderer is not available here; this would file a plain-text rendering. Nothing was filed. Word (.docx) is filed with its formatting." It fires before ingest. The test confirms there is no storage put, no vault row, no audit row and no export-history row, and that DOCX still files.

## Gates and checks

| Check | Result | File |
|---|---|---|
| `ci:sign-ceremony` | OK | `gate-ci:sign-ceremony.txt` |
| `ci:undefined-css-classes` | OK | `gate-ci:undefined-css-classes.txt` |
| `ci:untracked-imports` | OK | `gate-ci:untracked-imports.txt` |
| Touched server suites | 110 files: 1402 passed, 2 skipped | `suites-server.txt` |
| v2 client suites and `tests/ui` | 486 of 487 files passed. The 3 failures were in `newProjectWizardName.test.tsx`, which another worker was editing; that file passes on rerun | `suites-client.txt`, `suites-client-rerun.txt` |
| Golden journeys and `tests/lineage` (`RLS_ENFORCE=off`) | 32/37. Founder path hops 1–7 pass, including file-to-vault and place. Hop 8 (transmit) and the four checks that depend on it fail with `PACKAGE_IDENTITY_MISSING`. That code comes from another worker's untracked `server/services/ectd/package-identity.ts`, not from this change | `golden-lineage.txt` |
| DB tier on `concept2cure-ri_qa_fresh2` (`RLS_ENFORCE=on`): 3 authoring, 4 vault-placement and filing, RLS, sign-ceremony and project-persistence dbtests | 11 files, 151 passed | `db-fresh2.txt` |
| Scoped tsc | No error on a changed line. The remaining errors come from type augmentations the scoped config leaves out (`establishRequestTenantScope`, `req.user`), plus `coauthor.ts:110`, which is another worker's GET /documents hunk | `tsc-scoped-*.txt` |

## ESLint, HEAD → working tree

| File | HEAD | Now |
|---|---|---|
| server/services/coauthor/filing-copy-pins.ts | new | 0 |
| server/services/coauthor/coauthor-snapshot.ts | 0 | 0 |
| server/routes/coauthor.ts | 6 | 6 |
| server/services/submission-service/submission-service.ts | 8 | 9 (the added one is `regulatoryPrograms` unused, line 56, another worker's hunk) |
| server/services/authoring/authoring-file-to-vault.ts | 0 | 0 |
| server/services/c2c/commit-section-to-filing.ts | 0 | 0 |
| server/services/c2c/filing-section-target.ts | new | 0 |
| server/services/ana/authoring-canonical-bridge.ts | 0 | 0 |
| server/routes/authoring.router.ts | 23 | 23 |
| shared/regulatory/filing-section-key.ts | new | 0 |
| client/.../surfaces/AuthoringPlaceIntoFiling.tsx | 2 | 2 |
| client/.../surfaces/Review.tsx | 5 | 5 |
| client/.../editor/DocumentWorkbench.tsx | 14 | 14 |
| client/.../editor/outlineReadState.ts | new | 0 |
| client/.../useFilingOutline.ts | 0 | 0 |
| test files changed or added | unchanged (0–2 each) | unchanged |

`ci:untracked-imports` reads the push diff. The new files must therefore be committed with the changes that import them: `filing-copy-pins.ts`, `filing-section-target.ts`, `filing-section-key.ts` and `outlineReadState.ts`.

# Spine F1 — section status follows the governed work

Launch rows **D2** (one AnA, the filing spine) and **D5** (Part 11). Design: `docs/design/FILING_SPINE.md` §1 ("First fix"), §6 rows 1–2, §7.2 F1.

Line numbers are from the working tree after the change.

## What was wrong

- The scaffold writes every governed section `todo` (`server/services/c2c/scaffold-project-documents.ts:184`). A save in the document editor commits its text into the filing (`commitSectionToFiling`), and that UPDATE wrote content only. So a section with text stayed `todo`. Module completion, the project's `c2c_documents.readiness` and every "what is missing" figure count status, so all read zero for work done in the editor.
- The approval signature approved the working copy and froze it, and moved no filing section. Readiness counts only `approved` and `locked` sections (`c2c_recompute_document_readiness`, `migrations/20260528_phase9_document_schema.sql`). A signed, approved filing read 0% ready, and the dispatch gate (`leaf-source-resolver.ts`) reported its sections unfinalized.
- `PATCH /api/c2c/documents/:id/sections/:key` accepted status `approved` (and `locked`) with only a reason. A section could read approved, and count toward readiness and dispatch, with no signature behind it.

- Found in review of the first version of this change: (1) on `/sign`, `advanceWorkflowForSignature` reported "approved" whenever the workflow had steps and none was pending. A later `/sign` of any meaning on a completed workflow then approved sections again and wrote a second `approve` row carrying that meaning. (2) An `approved` section kept `approved` when its text was replaced, through a later save (for example a second authoring document bound to the same filing; `authoring_documents.c2c_document_id` is not unique) or a content PATCH. Readiness and the dispatch gate then counted text nobody signed as approved.

## What changed

- `server/services/c2c/commit-section-to-filing.ts:111` `WRITE_SECTION_SQL`: one statement. A CTE reads the section's status (`FOR UPDATE`), then the UPDATE:
  - moves `todo` to `drafted` when the new text is not only whitespace (the governed outline's own test, `sectionHasContentSql`);
  - keeps `drafted` and `review`;
  - moves `approved` to `drafted` (`todo` if the new text is empty) when the new text is not the text already there (`:126`). An identical save keeps `approved`;
  - does not write a `locked` section at all (`:135`).
- `commit-section-to-filing.ts:315` `settleWrite`: a locked section returns `{ committed: false, reason: 'Section "…" of the filing is locked, so its text was not changed. …' }`. A withdrawn approval writes one `recordGovernedAction` row on the save's transaction (`:360`; command `transition`, target `section:<doc>:<key>`, payload `from: 'approved'`, `to`, `approvalWithdrawn: true`) and returns `approvalWithdrawn: true`.
- `server/routes/authoring.router.ts:6678` `approveBoundFilingSections`: on the signing transaction, moves to `approved` the governed sections of the bound document whose key is the code of one of this document's sections, that have text, and whose filing text is exactly the authored text the signature covers. Only `todo`, `drafted` and `review` move. `locked` is never touched. It writes one `recordGovernedAction` row (command `approve`, target `c2c_document:<id>`, the signer's reason, payload naming the sections, the signature id, the meaning and the path). A section with different filing text is not approved and is listed as `notApproved`.
- `authoring.router.ts:6784` `filingApprovalForSignature`: returns null unless the signature approves the document.
  - `/docs/:docId/e-sign` (`:5036`): only meaning `APPROVER` approves.
  - `/docs/:docId/sign` (`:7109`): only the signature that clears the last step of an existing workflow approves. The step UPDATE in `advanceWorkflowForSignature` now has `RETURNING id`, read as rows (`:6929`), and the function returns true only when this signature decided a pending step and none is left (`:6963`). A later signature on a complete workflow decides nothing and approves nothing.
- `authoring.router.ts:6816` `filingApprovalReply`: the responses carry `filingApproval: { approved, notApproved, documentId }`, or null. When there is no filing (`documentId: null`) it adds `reason`, so "not bound to a filing" does not read like "nothing left to approve".
- `server/routes/c2c/documents.ts:504-513`: status `approved` or `locked` is refused with 409 `APPROVAL_REQUIRES_SIGNATURE` before anything is read or written. The messages now state the fact: "A section is approved only by an electronic signature with the meaning Approval on the authoring document bound to this filing, and only when its text is the text signed. Nothing was changed." and "A section cannot be locked here. Lock the document (POST /api/c2c/documents/:id/lock). Nothing was changed." (Nothing sets a section `locked`; the document lock sets `c2c_documents.status` only.)
- `documents.ts:601-621`: the same PATCH reads the section's status on its transaction. A `locked` section is refused with 409 `SECTION_LOCKED` ("This section is locked, so it is not edited in place. Nothing was changed."), for content and status alike. `:670`: a content change on an `approved` section with no status in the body moves it to `drafted` in the same UPDATE when the body differs. `:711`: the governed-action row names the withdrawal (`from: 'approved'`, `to`, `approvalWithdrawn: true`).
- Client callers of that PATCH: `useSectionSave.ts` (used by `PathwayPanes.tsx`) sends content, a reason and `draftSource`, never a status. No launch screen sends `approved` or `locked`. A 409 is shown by `useSectionSave` as "Not saved — HTTP 409: …".
- No migration. The status column and its CHECK exist.

## Shown

`server/services/c2c/__tests__/node-status-follows-work.pglite.test.ts`: the real authoring and c2c documents routers over HTTP, on the real migrations in PGlite (readiness trigger, snapshot trigger, signature tables, governed-action ledger).

| Test | Before (red) | After (green) |
|---|---|---|
| 1. a save with text leaves the bound section `drafted` | fails at HEAD: stays `todo` | passes |
| 1. a whitespace-only save stays `todo` | passes (guard) | passes |
| 1. a later save keeps `review` | fails at HEAD; fails when the CASE drops `ds.status = 'todo'` (`mutation/save-moves-status-backwards.txt`) | passes |
| 1. new text on an `approved` section: withdrawn to `drafted`, readiness 100 → 50, `transition` row with `approvalWithdrawn` | fails on the first version: stays `approved` | passes |
| 1. a save does not write a `locked` section; `filing.committed` false, reason names the lock | fails on the first version: written, `committed: true` | passes |
| 2. e-sign APPROVER: written sections `approved`, unwritten stays `todo`, readiness 67, one `c2c.work.approve` row naming the signature | fails at HEAD: all `todo` | passes |
| 2. e-sign REVIEWER and AUTHOR approve nothing; no approve row | fails at HEAD | passes; fails when any meaning approves (`mutation/any-meaning-approves.txt`) |
| 2. a section whose filing text is not the text signed is not approved | fails at HEAD | passes |
| 2. APPROVER on an unbound document: `documentId: null` and a reason | fails at HEAD and on the first version (no reason) | passes |
| 2. a second authoring document bound to the same filing saves other text: the section is withdrawn to `drafted`, readiness 0 | fails on the first version: stays `approved` | passes |
| 2. `/sign` clearing the last workflow step approves (readiness 50); `/sign` with no workflow does not | fails at HEAD | passes |
| 2. a `/sign` (REVIEWER) after the workflow is complete approves nothing, one approve row only | fails on the first version: `filingApproval.approved ['2.5']`, section back to `approved`; fails when the function returns true again (`mutation/later-sign-approves.txt`) | passes |
| 2. a signature that rolls back leaves sections, readiness, signatures and approve rows unchanged | fails at HEAD (no `drafted`) | passes |
| 3. PATCH `approved` → 409 `APPROVAL_REQUIRES_SIGNATURE`, nothing changed, no audit row | fails at HEAD: 200 | passes |
| 3. PATCH `locked` → 409, message points to the document lock | fails at HEAD: 200; on the first version: old message | passes |
| 3. content PATCH on an `approved` section → `drafted`, readiness 100 → 0, withdrawal recorded | fails at HEAD and on the first version: stays `approved`; fails when the branch is disabled (`mutation/patch-keeps-approved-on-new-text.txt`) | passes |
| 3. PATCH (content or status) on a `locked` section → 409 `SECTION_LOCKED`, nothing changed | fails at HEAD and on the first version: 200, text overwritten | passes |
| 3. PATCH `review` still works | passes (guard) | passes |

Runs:
- `red/node-status-follows-work.txt`: all three source files at HEAD (`3fddfeeed`): 16 failed, 2 passed.
- `red/review-fixes-implementer-version.txt`: the first version of this change (before review): 11 failed, 7 passed. Three of the eleven fail only on the reply shape (`documentId` added) or the new `locked` message; the other eight are the review findings.
- `red/approval-half-only-router-reverted.txt`: only `authoring.router.ts` at HEAD: the 8 approval cases fail.
- `green/node-status-follows-work.txt`: 18 passed.
- `green/regression-suites.txt`: 188 existing test files (every suite that imports or mocks the changed files, all c2c route suites, the golden journeys, the signature and readiness suites): 187 files and 2332 tests passed; the one other file is another agent's test that was removed from the tree during the run. Three client suites that reference these routes: 34 passed. `ci:sign-ceremony` OK.

Command: `npx vitest run --config vitest.config.ts server/services/c2c/__tests__/node-status-follows-work.pglite.test.ts`.

## Not done

- No OQ case. The OQ protocols (`docs/validation/OQ-003-AUTHORING.md`) are executed by `tests/validation/oq/authoring/run.mjs` against a running deployment. A scripted row needs that runner and a protocol revision, which are not this slice's files. Proposed OQ-AUTH-21: "e-sign APPROVER on a bound document with one written and one empty section; read the governed outline; PATCH a section to `approved`; PATCH new text into the approved section" → "written section `approved`, empty section unchanged, readiness above 0; PATCH 409 `APPROVAL_REQUIRES_SIGNATURE`; after the text change the section reads `drafted`".
- The rollback case runs on PGlite's single connection. It proves the approval is inside the signing transaction as written; a write on a second connection would not be caught here.
- `ci:sign-ceremony` does not see this write: it scans `sign` ledger rows and `approved_by`/`approved_at` stamps, and this is a status move recorded with command `approve`. Its two callers are inside the e-sign and sign handlers, after `reverifyAuthoringSigner`.
- A section written only through the old mdx editor (`content.paragraphs`, no `text`) is never approved by the Authoring signature: it is not the text that signature covers. It is listed in `notApproved`.
- The three readiness figures still disagree (§6 row 26, F23).
- `approveAndFreezeDocument` (the `/sign` path) stamps `approved_at = NOW()` without the COALESCE the e-sign path uses. It also still runs on a later `/sign` after the workflow is complete (as before this change); only the filing approval was made to depend on this signature deciding a step. Not changed here.
- The save replies (`PATCH /api/authoring/sections/:id` at `authoring.router.ts:2258` and the AI-draft accept at `:4179`) build their `filing` block from `committed`, `documentId` and `sectionKey` only, so `approvalWithdrawn` does not reach the client. Those handlers are not this slice's files; the withdrawal is in the database and the governed-action record.
- `commitSectionToFiling` does not check the document's own status (`c2c_documents.status` `locked` or `submitted`); the c2c PATCH does (`documents.ts:559`). Not changed here.
- The Authoring client (`AuthoringFilingBar.tsx` `postAuthoringSignature`) reads only `documentHash` and `signedAt`, so it does not tell the signer which sections were not approved. Not this slice's file.

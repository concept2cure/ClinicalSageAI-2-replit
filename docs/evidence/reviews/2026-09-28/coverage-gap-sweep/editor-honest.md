## Editor-core honesty audit — DocumentWorkbench.tsx, RichSectionEditor.tsx, editor/*

Head: `232ecae9c` (`concept2cure-v2`). Read-only; no file edited, no gate run with `write-baseline`, local Postgres not touched.

### Summary

This is, by a wide margin, the most defensively-written surface I have read in this codebase for the four distinctions: nearly every read function returns `{ok, body}` rather than discarding the success flag, every rail pairs a `loading`/`error`/`ready`/empty render with distinct copy, the round-trip fidelity gate refuses rich mode rather than silently rewriting content, the AI-draft acceptance path names the model or says it was not recorded, and dozens of inline comments document a *prior* honesty bug and its fix — evidence the file has already been through exactly this kind of audit more than once. Two concrete, reproducible gaps remain.

### GE-H-1 (high) — a failed data-room read renders as "add documents first," in the citation picker

- **File:** `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`
- **Lines:** `loadProjectSources` at 1661–1671 (specifically line 1670); consumed at 4535–4546.
- **Failure:** `loadProjectSources` reads `GET /api/c2c/projects/:programId/sources` via `readJson`, which correctly returns `{ok, body}` — but the loader discards `ok`:
  ```
  setProjectSources(ok && Array.isArray(body?.sources) ? body!.sources! : []);
  ```
  Any failure — a transient 500, an expired session (401), a network blip — collapses to the same `[]` as a data room that genuinely has zero sources. The "Record a source" picker then renders (line 4535-4546):
  > "No project sources available. Add documents to the project's data room first, or open this document from its project so the data room is in context."

  **The false sentence a user reads:** an author whose project's data room has extracted, citable sources will be told there are none and told to go add documents — when the true fact is that the read failed. On a surface whose stated purpose is recording what a section is drafted from (an evidentiary/citation record), this is exactly the distinction-2 anti-pattern named in the brief: a read failure asserted as an empty result. There is no distinct retry for this specific list — the only way to clear it is to switch sections (which re-fires the effect) and switch back; nothing on screen suggests that is necessary.
- **Fix:** thread `ok` through, same as every other loader in this file (`loadSections`, `loadHistory`, `loadComments`, `loadAudit`, `loadSources` all already do this correctly). Add a `projectSourcesState: 'idle'|'loading'|'ready'|'error'` and render the picker's error branch with retry, matching the `sourcesState === 'error'` pattern already used two rails over (line 4516-4521) for the sibling Sources list.

### GE-H-2 (medium) — a failed program-name read is shown as "Reading the program…" forever

- **Files:** `client/src/concept2cure/v2/editor/programSummary.ts` (lines 21, 45-67); `client/src/concept2cure/v2/editor/DocumentCanvas.tsx` (line 281).
- **Failure:** `programSummary.ts` declares `export type ProgramSummaryState = 'idle' | 'loading' | 'ready' | 'error'` (line 21) and its own doc comment promises "a failed read is `error`, not an unnamed program" — but `useProgramSummary`'s return type is just `ProgramSummary | null` (line 45); the state type is never returned or exposed. On any fetch failure (`!res.ok` at line 54, or the network-error `catch` at line 58-60), the hook silently leaves `program` as `null` — indistinguishable from "still loading" or "no program id."

  `DocumentCanvas.tsx:281` consumes this with a null-coalesce fallback that assumes the only reason `programLine` would be null is that the fetch hasn't finished yet:
  ```
  <span className="dcv-project">{I.folder} {programLine ?? 'Reading the program…'}</span>
  ```
  **The false sentence a user reads:** "Reading the program…" — stated as an in-progress read — on a card where the read has actually already finished and failed (e.g., a transient 500 from `/api/c2c/projects/:id`, or the session expiring mid-conversation). There is no timeout, no retry affordance tied to this specific field, and no way for the state to ever resolve within that mount; the text is permanently wrong until the whole canvas remounts on a different `docId`. This is the same defect class as GE-H-1 (a failed read shown as something it is not) applied to project attribution on the AnA-conversation → canvas card rather than to source data.

  By contrast, `DocumentWorkbench.tsx`'s own consumer of the same hook (`programHeadline(program) &&` at line 3096) simply omits the block on a null value rather than asserting anything — that is silence, not a claim, and is correctly out of scope for this finding per the calibration rule. Only the `DocumentCanvas.tsx` consumer turns the absence into an active (and, on failure, false) claim.
- **Fix:** have `useProgramSummary` return `{ program, state }` (the type already exists, unused) and have `DocumentCanvas.tsx` render "Reading the program…" only while `state === 'loading'`, and something honest like "Program details unavailable" (with the folder icon still shown) when `state === 'error'`.

### What was checked and found clean (worth stating, per calibration)

- Every document/section/history/comments/audit/sources loader in `DocumentWorkbench.tsx` *except* `loadProjectSources` correctly distinguishes loading / error / genuinely-empty, several with comments citing the exact prior incident (e.g., the `loadHistory` comment describing a 42883 SQL error that used to render as "No prior revisions").
- `saveSectionContent` (the one save funnel): 401, 409 (conflict — author's text is not lost, explicitly told not to retry blindly), and the general `ApiRequestError` path each get a distinct, correct sentence; nothing is claimed persisted without the server's row coming back.
- `RichSectionEditor.tsx`'s save-state footer (`saved`/`dirty`/`saving`/`error`) and the fail-closed round-trip fidelity gate (`boot`) both refuse to claim more than they can prove; the device crash-cache is never auto-loaded over server content.
- The AI-draft-accept path (`onAiDraftAccepted`) reports the server's real coverage/citation numbers or explicitly says none were reported — never a zero standing in for "no summary."
- `provenance.ts` never guesses a model or author; "model not recorded" is a first-class outcome, not a null collapsed into silence.
- `ReviewTasksPanel.tsx`'s task count line (`${openCount} open · ${rows.length} total`) is gated on `state === 'ready'` with distinct `'not read'`/`'reading…'` alternatives, and the server route behind it (`taskManagement.routes.ts:875-916`) runs no `LIMIT`, so the panel's own "bounded, real list" claim about `by-module` is accurate, not just asserted.
- The revision ledger (`verifyLedger`) states "Couldn't recompute the ledger — this is a failed check, not a verdict" rather than defaulting to intact or broken.

No instance of distinction 3 (nothing-assessed vs. assessed-and-clear) or distinction 4 (fixture data in a governed path) was found in this file set: the one fixtures/ import (`vault-data.ts`) carries only status-label lookup tables and type guards, not fabricated rows, and every readiness-adjacent figure I traced (revision counts, ledger verdicts, deficiency-scan counts, citation coverage) is either the server's own live count or explicitly labeled heuristic/non-authoritative.

---

**Covered.** Read end to end, both branches of every fetch/save: client/src/concept2cure/v2/editor/DocumentWorkbench.tsx (full, 5,134 lines — docs/sections/history/comments/audit/sources/project-sources loaders, saveSectionContent's PATCH funnel, revert, toggleTrackChanges, citeSource/uncite/reresolve/refreshAllSources, addComment/addReply/setCommentStatus, saveRename, runCheck (deficiency scan), onAiDraftAccepted, flushDecisions/recordTrackedChangeDecision, verifyLedger, the unsaved-work leave guard, and every render branch pairing a *State with its EmptyState/notice). client/src/concept2cure/v2/editor/RichSectionEditor.tsx (save/autosave/doSave, the fail-closed round-trip fidelity gate in `boot`, the device crash-cache offer/restore/discard, live-coedit status labels, track-changes toggle, paste-fidelity notice, attribution-bar wiring) — read closely on honesty-relevant logic; toolbar command wiring and ProseMirror mechanics were skimmed rather than audited line-by-line since they carry no fetch/save state. Full reads: ProjectFilesPanel.tsx, ReviewTasksPanel.tsx, AssignReviewDialog.tsx, FileToVaultDialog.tsx, DocumentCanvas.tsx, programSummary.ts, askAnaToDraft.ts, provenance.ts, and the fixtures/vault-data.ts import from ProjectFilesPanel (confirmed reference-only: status/icon lookup tables and type guards, no fabricated tenant rows). Verified the server-side counting query behind DocumentCanvas's section count (`server/routes/authoring.router.ts:1498-1542,1544+`) is a live `COUNT(DISTINCT ...)`, not a cached column, before ruling out a suspected version-count defect there. Cross-checked both findings below against `docs/evidence/reviews/2026-09-24/`, `2026-09-26/`, and `2026-09-28/` (all six lenses) to confirm neither is already recorded as open; `2026-09-28/microcopy.md` and `README.md` explicitly name these files as unread this cycle, confirming the gap this pass closes.

**Not covered.** Not read line-by-line: suggestions.ts (1,009 lines, track-changes ProseMirror mechanics — skimmed for the AI-authorship attribution contract only), roundTrip.ts (beyond the `boot` fidelity-gate call sites already verified from RichSectionEditor.tsx), captionNumbering.ts, citationNode.ts, crossReferenceNode.ts, commentAnchor.ts, findReplace.ts, textDiff.ts, imageNode.ts (beyond the fetch/cache path), AuthoredHtml.tsx. These are mostly ProseMirror node/mark/plugin definitions with no network or governed-write honesty surface, but were not exhaustively checked for the four distinctions beyond a grep for `catch`/fetch patterns (none found outside what's reported). Did not open a browser or run `hostilePayloadProbe.test.tsx` against these specific surfaces (read-only harness; no test run performed — findings are from static reading, not execution). Did not touch the local reference Postgres — neither finding needed a data-shape check the client/server code reading couldn't answer. `../surfaces/AuthoringAiDraft.tsx`, `AuthoringExports.tsx`, `AuthoringSignatures.tsx`, `AuthoringCollab.tsx`, `AuthoringRevisionDiff.tsx` and `v2/lineage` (DocumentAttributionBar) are imported by these files but live outside `editor/*` and outside this pass's assignment — not audited here. `check:microcopy` / `ci:internals-in-copy` were not run (read-only, no write-baseline, per the harness instruction) — no automated gate evidence beyond manual reading.

## Independent verification

Each finding went to three agents, each told to refute it through one lens: reachability, reproduction or intent. A finding is confirmed when two of the three could not. Low findings had one reproduction verifier.

### GE-H-1 — **confirmed** (3 of 3)

- **reach** — real: I tried to show this path was unreachable and could not. The defect is real and a user can reach it in production.

1. **The code is as reported.** At `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:1667-1670` the call `readJson` (lines 485-496) returns `{ok:false}` on any non-2xx response or thrown error. `loadProjectSources` then drops that flag: `setProjectSources(ok && Array.isArray(body?.sources) ? body!.sources! : [])`. There is no `projectSourcesState`. The picker at lines 4535-4546 branches only on `projectSources.length === 0` and shows "No project sources available. Add documents to the project's data room first…".

2. **The surface is mounted.** `client/src/concept2cure/v2/surfaceViews.ts:302` lazy-registers `DocumentAuthoring`. `surfaces/DocumentAuthoring.tsx:98` renders `DocumentWorkbench` with the real `programId`. The Sources rail is opened by the toggle at line 3201 and rendered at line 4456. `loadProjectSources` runs whenever a section is open (effect at lines 1700-1703).

3. **The server route is mounted.** `server/bootstrap/register-inline-routes.ts:848` has `app.use('/api/c2c/projects', authMiddleware, c2cProjectsModule.default)`, which serves `GET /:id/sources` (`server/routes/c2c/projects.ts:1630`). That handler can fail in several ways:
   - 403 when there is no org.
   - 404 when the project is not found in the org.
   - 500 from its catch block when `listClientDocuments` or `summarizeSourceUsage` throws.
   - The auth middleware returns 401 when the session expires.
   - A network error makes `readJson` return `ok:false` with status 0.

   Every one of these becomes `[]`.

4. **No other layer catches it.** The sibling section-sources read, `/api/authoring/sections/:id/sources`, goes to a different route and service. It can succeed, putting `sourcesState` at 'ready', while the project-sources read fails. The rail then renders the normal branch and the picker shows the false "add documents first" text. The `sourcesState==='error'` guard does not cover this read.

5. **It is not already recorded.** I grepped `docs/evidence/reviews/2026-09-2{4,6,8}/` for projectSources, "Record a source" and "No project sources" and found nothing.

This breaks the CLAUDE.md rule "an error is never rendered as an empty result". The author is told the data room is empty and to add documents that already exist.

**Covered:** the client load path, the render branch, the effect trigger, surface registration, the server route and its mount, and the failure statuses.

**Not covered:** I did not run the UI in a browser or reproduce against the local Postgres. Reachability was established statically.

- **repro** — real: Reproduced at 232ecae9c and at the working-tree HEAD 494b4fc14. The file has no commits between them, and the lines are identical.

The code path, traced:
1. `apiRequest` (client/src/lib/queryClient.ts:399-420) throws `ApiRequestError` on any non-2xx response other than 401. It returns a 401 response as-is.
2. `readJson` (client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:485-495) catches that throw, and also a network TypeError, and returns `{ok:false,status:0,body:null}`. For a 401 it returns `ok:false` with the error body.
3. `loadProjectSources` (DocumentWorkbench.tsx:1661-1671) runs `setProjectSources(ok && Array.isArray(body?.sources) ? body!.sources! : [])`. So every failure produces the same `[]` as an empty data room. There is no `projectSourcesState` anywhere in the file: grep finds only lines 796, 1661, 1703, 1713, 1738, 1740, 4535, 4553 and 4666.
4. The effect at 1701-1704 calls it whenever a section is open, alongside `loadSources`. The two reads are independent, so `sourcesState` can be 'ready' while the project-sources read has failed. In that state the picker branch at 4535-4537 renders "No project sources available. Add documents to the project's data room first, or open this document from its project so the data room is in context."

The server route (server/routes/c2c/projects.ts:1630) has real failure branches: 403 when there is no org, 404 when the project is not found, and 500 from `serverError`.

Focused repro (scratchpad repro.mjs): the apiRequest, readJson and loader logic copied verbatim, with fetch stubbed, printing the resulting state and picker branch:
- 200 {sources:[]} -> [] -> "No project sources available..."
- 200 with 3 sources -> list of 3
- 500 -> [] -> "No project sources available..."
- 401 SESSION_IDLE -> [] -> same message
- 403 -> [] -> same message
- network failure -> [] -> same message

So a failed read is indistinguishable from an empty data room, and the author is told to add documents that already exist.

The same silent `[]` also reaches two other consumers:
- `citationLibrary` (1738): the editor's citation picker silently loses the whole data room.
- `ProjectFilesPanel`'s `projectSources` prop (4666): `matchingProjectSource` finds no match, so Vault files show as not being sources.

Not already reported: grep over docs/evidence/reviews/2026-09-24, 2026-09-26 and 2026-09-28 finds no reference to projectSources, loadProjectSources or this picker. The 2026-09-28 README:46 and a11y.md:44 say DocumentWorkbench.tsx was not read line by line.

Covered:
- The loader, readJson, apiRequest's throw semantics, the effect wiring, the picker render branch, the citationLibrary and ProjectFilesPanel consumers, and the server route's error branches.

Not covered:
- No browser run of the real component.
- The database was not queried; the defect is client-side state handling, so a database query adds nothing.
- ProjectFilesPanel's own UI for the empty case was not traced.
- There is also a stale-response race: unlike loadSources and loadAudit, this loader has no programId ref guard. I noticed it but did not reproduce it.

- **intent** — real: I tried to refute this and could not. HEAD is 494b4fc14, where these lines are the same as at 232ecae9c.

The code, in /home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:
- `loadProjectSources` (1661-1671) ends with `setProjectSources(ok && Array.isArray(body?.sources) ? body!.sources! : [])`.
- `readJson` (485-495) does report failure: it returns `ok: res.ok` for any non-2xx response and `ok:false, status:0` on a network throw. The call site throws that away.
- The server route in /home/user/ClinicalSageAI-2-replit/server/routes/c2c/projects.ts:1630-1702 can fail in three ways: `send403` when no org resolves, `send404` when the project is not in the caller's org, and `serverError` (500) from the catch block. A failed read is a real outcome, not a hypothetical one.
- When `projectSources.length === 0`, the picker (4535-4546) says "No project sources available. Add documents to the project's data room first, or open this document from its project…". A 500 or an expired session therefore shows up as a genuinely empty data room, with advice to add documents that already exist.
- The empty list also feeds `citationLibrary` (1737-1740). The editor's inline citation picker loses every project source without any message.

Is this a deliberate design choice? No:
- The only design comment at the site (1657-1660) covers the case where no project is in context, which is the `!pid` branch. It says nothing about read failures.
- The code arrived in c402dbb6b ("WN: the canvas that expands into the full editor…") when it moved out of DocumentAuthoring.tsx. That commit message does not mention this behaviour or justify it.
- The same file does the opposite a few lines earlier. `loadSources` (1638-1654) sets `sourcesState='error'`, and the sibling rail (4516-4521) says in its own text: "The read failed, so nothing is shown — this is not the same as the section citing nothing."
- CLAUDE.md's working agreement says: "An error is never rendered as an empty result."
- The `projectSources`/`loadProjectSources` finding does not appear in docs/evidence/reviews/2026-09-2{4,6,8}/.

Covered: the client load path, the render branch, the citationLibrary consumer, readJson's semantics, the server route's error exits, and the commit history. Not covered: I did not run the UI or the database. None of those steps needs them, because the failure follows from the code alone.

### GE-H-2 — **confirmed** (3 of 3)

- **reach** — real: I could not refute this finding. The code is reachable in production, and no other layer stops the failure.

Reachability. The surface registry has `'conversation-thread': { component: ConversationThread }` (client/src/concept2cure/v2/surfaceViews.ts:408). ConversationThread.tsx:216-219 mounts `<DocumentCanvas programId={turn.authoringDoc.programId} …>` for any AnA turn that carries an `authoringDocId`. That id comes from the live `artifact_draft` event (server/routes/ana-ri/stream.ts:2300-2322) or from the trace (`authoringDocOf`, ConversationThread.tsx:86-93). The tool description for `draft_authoring_document` (server/services/ana/document-surface-tool-defs.ts:143) says it "Requires an open project; refuses otherwise". So every real canvas has a non-null programId and always takes the `programId ?` branch at DocumentCanvas.tsx:280-281.

Failure path, all at head:
- DocumentCanvas.tsx:134 calls `useProgramSummary(programId)`, line 237 computes `programLine = programHeadline(program)`, and line 281 renders `{programLine ?? 'Reading the program…'}`.
- `useProgramSummary` (programSummary.ts:45-67) returns only `ProgramSummary | null`. On a non-2xx, `apiRequest` throws `ApiRequestError` (client/src/lib/queryClient.ts:396-420). The catch at lines 58-60 swallows it, so `program` stays null. On a 401, `apiRequest` resolves, and line 54 `if (!res.ok) return;` also leaves null.
- The `ProgramSummaryState` type at line 21 is declared and never used. The file header at lines 6-7 says "a failed read is `error`", which the code does not do.
- The effect depends only on `[programId]`, so nothing retries within the mount.

Deterministic repro, no transient fault needed:
1. In a project, ask AnA to draft a document. The canvas card shows "<name> · <phase>".
2. Delete the program. DELETE /:id (server/routes/c2c/projects.ts:1902) sets `deleted_at = now()`.
3. Reopen that conversation from history.
4. GET /api/c2c/projects/:id returns 404, because `readProgramDetail` filters `p.deleted_at IS NULL` (projects.ts:453, used by the route at lines 997-998).
5. The card's program line reads "Reading the program…" forever.

A transient 500 or an expired session (401) mid-conversation gives the same result. The document's own load/error states (lines 294-300) are independent and do not cover this line. The expanded bar at line 378 correctly shows nothing on failure, so only line 281 turns a failed read into an ongoing "in progress" claim. That breaks the repo's rule that an error is never rendered as something else.

Not already reported. A grep of docs/evidence/reviews/2026-09-2{4,6,8}/ for programSummary, useProgramSummary, ProgramSummaryState and "Reading the program" found no matches.

Severity check. The claim is false and misleading, but it only touches a display label. No data is written wrongly, no Part 11 attribution is involved, and nothing crosses tenants.

Coverage. I read programSummary.ts, DocumentCanvas.tsx lines 134, 237 and 250-300, the ConversationThread mount and `authoringDocOf`, `apiRequest`, and GET/DELETE /api/c2c/projects/:id. I did not run the UI or the DB repro; the 404 path is established from the route code. I did not check DocumentWorkbench's other uses of the hook beyond the finding's own note.

- **repro** — real: Reproduced at head (494b4fc14; the task named 232ecae9c, and programSummary.ts / DocumentCanvas.tsx match the finding's line numbers). I did not edit the repo. The only files I wrote were a scratchpad test and a vitest config, and `git status` is clean.

The code path:
- `client/src/concept2cure/v2/editor/programSummary.ts:45-67` declares `useProgramSummary` as returning `ProgramSummary | null`.
- `ProgramSummaryState` at line 21 is exported but nothing uses it. A repo-wide grep finds it nowhere except its declaration.
- `apiRequest` (`client/src/lib/queryClient.ts:362-420`) throws `ApiRequestError` on any non-2xx except 401 and returns the response on a 401.
- In the hook, a 401 hits `if (!res.ok) return;` (line 54). A 4xx or 5xx, or a network error, hits the silent `catch {}` (lines 58-60).
- In every case `program` stays null, which is the same value it holds while the read is still in flight.
- `DocumentCanvas.tsx:134` calls `useProgramSummary(programId)`, `:237` sets `programLine = programHeadline(program)`, and `:281` renders `{programLine ?? 'Reading the program…'}` whenever `programId` is set.
- There is no retry and no state change after the failure, so the text stays for the whole mount.

The test: scratchpad `ps.test.tsx`, run with jsdom, `renderHook(useProgramSummary('prog-1'))`, a stubbed `fetch`, and the `?? 'Reading the program…'` expression from line 281. All 6 tests passed:
- 500 JSON → hook=null, rendered "Reading the program…"
- 404 JSON → same
- 401 → same
- 502 HTML → same
- `fetch` throws TypeError → same
- Control, 200 with `{name:'ABC-101', phase:'ind_enabling'}` → rendered "ABC-101 · IND enabling"

The 404 case is reachable in practice. `projects.ts` GET `/:id` returns 404 when the id is not a UUID or the row is not visible to the org, for example a deleted program or one the caller's tenant cannot see.

This is not the benign "no name recorded" case. In the reference DB (`c2c_full`), `regulatory_programs.name` and `.code` are both NOT NULL. So a successful read always produces a headline, and the only way to get the permanent "Reading the program…" is a failed read.

The card therefore asserts a read is in progress when it has already failed. That is an error shown as a pending state, which the file's own header comment says must not happen: "a failed read is `error`". `DocumentWorkbench.tsx` (a guarded `programHeadline(program) &&`) and `DocumentCanvas.tsx:378` (`programLine &&`) just omit the line, so the false claim appears only at `DocumentCanvas.tsx:281`.

Nothing in `docs/evidence/reviews/2026-09-24`, `-26` or `-28` mentions `programSummary` or "Reading the program", so this is not a re-report.

What I covered: `programSummary.ts` in full, `DocumentCanvas.tsx` consumer lines 134/237/281/378, `apiRequest`'s non-ok behaviour, the route's 404 branches, the DB nullability of name/code/phase, and a grep of the three prior review folders. I did not render `DocumentCanvas` itself in a browser. The rendered string comes from its exact `??` expression applied to the hook's real output.

- **intent** — real: I tried to refute this and could not. The code does not match its own stated intent, and there is no comment or commit that makes the behaviour a deliberate choice.

1. **The hook's own contract says a failure is `error`.** The docstring at client/src/concept2cure/v2/editor/programSummary.ts:1-8 says "a failed read is `error`, not an unnamed program". Line 21 declares `ProgramSummaryState = 'idle'|'loading'|'ready'|'error'`. That type is referenced nowhere: a grep across client/src and server finds only the declaration. `useProgramSummary` (lines 45-67) returns only `ProgramSummary | null`. On `!res.ok` (line 54) it returns early, and the catch at 58-60 swallows the error. Either way `program` stays null, which is exactly its value while the read is still in flight.

2. **The catch comment promises nothing is shown.** Line 59 says: "A failed read names no program. The header then shows none." The canvas does show something. DocumentCanvas.tsx:237 sets `programLine = programHeadline(program)`, and line 281 renders `{programId ? <span className="dcv-project">{I.folder} {programLine ?? 'Reading the program…'}</span> : …}`. So when a `programId` is present and the read fails (500, 401 or 403 on an expired session, 404 on a deleted or other-tenant program, a network error), the card says "Reading the program…" for the whole mount. There is no retry. That is a false in-progress claim.

3. **The other consumers do what the hook comment describes.** The expanded bar at DocumentCanvas.tsx:378 (`{programLine && …}`) and DocumentWorkbench.tsx (`programHeadline(program) &&`) both omit the line when there is no program. Only line 281 turns the null into an assertion.

4. **Commit history shows no decision.** `git log -L` shows line 281 arrived unchanged in c402dbb6b ("WN: the canvas that expands into the full editor…"), later changed only by a CSS class rename. That same commit's message and tests insist that "a failed read is an error with a retry" for the document read, so the canvas's honest-state rule was applied to the document and not to the program line.

5. **It breaks the repository's own rules.** CLAUDE.md says "Fail closed, never fabricate… honest empty states. An error is never rendered as an empty result". Here an error is rendered as a pending result.

6. **A second trigger the auditor did not name.** A successful read whose row has both `name` and `code` null makes `programHeadline` return null, so the card also shows "Reading the program…" forever. That is untrue after a completed read.

7. **Not already recorded.** It is not in docs/evidence/reviews/2026-09-2{4,6,8}/. The 2026-09-28 microcopy lens explicitly lists DocumentCanvas.tsx as not covered. The a11y lens mentions DocumentCanvas only at line 355, for a different finding.

**Coverage:** I read all of programSummary.ts, DocumentCanvas.tsx lines 130-140, 237, 250-300 and 378, the call site in DocumentWorkbench.tsx, the commit history for line 281, and the three review folders. I did not run the UI or the database, and did not execute any test. The conclusion rests on deterministic control flow: no state is ever set on the failure path.


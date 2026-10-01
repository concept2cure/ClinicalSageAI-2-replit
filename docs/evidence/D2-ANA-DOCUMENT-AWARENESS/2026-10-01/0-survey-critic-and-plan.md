**Critique of the six surveys: spot-checks, gaps, and an implementation plan.** Everything below comes from reading code at HEAD `907263fb31`. Nothing was edited or run.

## 1. Spot-check of the 8 most load-bearing claims

1. **The open document never shapes tool selection (`stream.ts:1606-1607`).** CONFIRMED.
   - `asStr` (`stream.ts:1582`) returns `undefined` for anything that is not a string.
   - So `documentType: asStr(document_context)` and `surface: asStr(intent_lens) ?? asStr(authoring_context)` are always undefined.

2. **A tool missing from the register is treated as `confirm`.** CONFIRMED.
   - The code is `toolAuthorizationOf` at `server/services/ana/tool-authorization.ts:172-174`; the survey cited `:168`.
   - The register counts are exact: 783 entries, of which 571 read, 158 confirm, 21 conditional, 17 refuse, 15 self, 1 command.
   - One small error: the register's `site` line numbers are stale. `act_on_screen` points at `AnaToolExecutor.ts:17134`, while the survey puts its handler at `:17804`. Do not trust `site` as a line number.

3. **`ToolContext` has no field for the open authoring document or section.** CONFIRMED (`AnaToolExecutor.ts:233-340`).
   - It does have `surface`, `projectType` and `documentType` string fields. The stream fills none of them (`stream.ts:2049-2061`).

4. **The authoring read routes do not scale.** CONFIRMED. One claim is WRONG.
   - `GET /docs/:docId/sections` selects `s.content` for every section, with no limit (`authoring.router.ts:1699-1706`).
   - `GET /docs/:docId` leaves out `client_program_id` and `c2c_document_id` (`:1655-1656`).
   - `GET /docs` joins sections with no tenant predicate (`:1315`).
   - **Wrong:** the tool-registration survey says a handler must "repeat the per-document access check" these routes apply, citing `callerDocumentAccess` at `:1683`. These routes apply no per-document permission check, only the tenant filter after the JWT middleware (`:127`).
     - `callerDocumentAccess` (`:1578`) only reports which freeze, e-sign, file-to-vault and assign-review gates apply, for display.
     - `decideAuthoringPermission` supports a `'view'` action (`authoring-permissions.ts:14`), but no read route calls it.
     - The only way to build the user identity it needs takes an Express request (`authoringPrincipalFromRequest`, `:103`). A tool handler has no such builder.
   - **Also wrong:** "no reusable read service" overstates it. These pieces can be reused:
     - `resolveAuthoringDocumentScope` and `resolveAuthoringSectionScope` (`authoring-permissions.ts:140`, `:163`);
     - `resolveOpenProgram` (`server/services/c2c/program-access.ts`, already used by `catalog-scope.ts:36`);
     - `sectionContentToBlocks` (`server/export/authoring-section-content.ts:705`), whose `InlineRun.suggestion` (`:90`) already marks pending insertions and deletions;
     - `compareSectionCode` and `sortBySectionCode` (`shared/regulatory/section-code.ts:127`, `:140`).

5. **`authoring_sections` is flat.** CONFIRMED.
   - The table has no parent or depth column, and its only index is on `(doc_id, tenant_id)` (`db/migrations/20260725_authoring_document_loop_tables.sql:59-72`).
   - No migration found adds a column to it with `ALTER TABLE authoring_sections ADD COLUMN`.

6. **`insertSuggestedContent` deletes the selected text without tracking it.** CONFIRMED.
   - It calls `tr.replaceSelection(slice)`, then sets `SUGGESTION_ACTION_META` and `addToHistory=false` (`client/src/concept2cure/v2/editor/suggestions.ts:~990-997`).
   - The tracking plugin skips any step carrying that flag (`:~1030-1037`).
   - `insertSuggestion` calls `chain().focus()` and does not collapse the selection first (`RichSectionEditor.tsx:1497-1503`).

7. **`navigate_to authoring {sectionCode}` drops the section code.** CONFIRMED, with a correction that makes the fix smaller.
   - The `authoring` target declares only `authoringDocType` (`shared/navigation/index.ts:160-163`). The resolver copies only declared parameters (`~:287-305`). `surface-actions.ts:357` still tells AnA to use exactly this route.
   - The client side already supports more than the surveys say:
     - `consumeNavParams` passes every string parameter through (`client/src/concept2cure/v2/navParams.ts:95-113`).
     - The workbench's open target already has a `docId` slot (`DocumentWorkbench.tsx:1015-1029`) and an exact-id branch (`:1525-1550`).
   - Two new limits:
     - The `docId` branch opens the document and returns without opening any section (`:1536-1550`).
     - Navigation parameters are read once, when the workbench mounts (`:1004`, `useState` initializer). A second `navigate_to` while the editor is already open does nothing; I did not verify whether the shell remounts the editor.

8. **"Proposed by AnA" can only be verified through a turn record written when the turn ends.** CONFIRMED.
   - `resolveTurnRecordSource` (`server/services/authoring/authoring-record.ts:39-56`) is applied at `authoring.router.ts:~6856-6863`.
   - `ana_turn_records` gets its id from `INSERT … RETURNING id` (`server/services/ana/turn-record.ts:~510-532`).

**Also confirmed, from the edit-path survey:**
- The save route's pre-check reads the section outside the transaction (`authoring.router.ts:1823-1826`).
- The `UPDATE` matches only `id` and `tenant_id` (`:2016-2021`).
- `createRevision` runs before the `UPDATE` (`:~2050` before `:2061`).

**A trap no survey named.** The stream treats any tool result with `status === 'generated'` and a non-empty `content` as a draft (`stream.ts:2388-2418`).
- It pushes the result into `collectedDrafts`, which post-processing persists, and emits an `artifact_draft` event.
- A read tool must never return that shape.

**A boundary the edit-path survey missed.** `act_on_screen` is class `self` with "view-only screen directive" (register).
- `surface-actions.ts:16-20` limits screen actions to changing "WHAT IS SHOWN, never WHAT IS TRUE".
- So carrying model text into the editor as an `authoring.propose-edit` screen action (gap 3 in the editor-scale-ux survey) breaks that rule. It would also skip the approved-model gate.
- The safer carrier is the `tool_result` event. `useAnaChat.ts:1356-1398` already maps results per tool name (precedent: `verify_docx_against_source`, `check_dossier_consistency`).

## 2. What is missing for "read, navigate and propose across a whole IND"

1. **No server read path that pages.**
   - Missing: an outline of a whole program without content (documents, then sections with code, title, depth derived from the code, `order_index`, `updated_at`, length, content hash).
   - Missing: a windowed read of one section (`offset` and `max_chars`, within the 8,000-character result cap in `agentic-loop.ts:581-596`).
   - Missing: a content search scoped to the program, returning snippets.
   - None of these exist.
2. **No reading scoped to the open program.** Reads must filter on `tenant_id` and on `client_program_id = resolveOpenProgram(ctx)`.
   - No authoring route enforces a per-document `view` check today. Whether the tool should be stricter than the routes is a decision to make, not to inherit.
   - It needs the person's identity built from `ctx.userId` plus their roles, and no such builder exists.
3. **Pending tracked changes must be visible to the model.** When AnA reads a section, pending `<ins>` and `<del>` text should be labelled as pending, using `sectionContentToBlocks`, rather than shown as settled text.
4. **No join between the governed outline and authoring text.** "Where is §3.2.P.8 written?" means matching `c2c_document_sections.section_key` to `authoring_sections.code` across every authoring document in the program.
   - Codes can repeat, because nothing enforces `UNIQUE (doc_id, code)`, and repeats across documents are possible.
   - Today only the client does this, and only over `docs.slice(0,8)` (`DocumentWorkbench.tsx:1583`).
5. **Proposals need a stable base.** A proposal must carry the section's `updated_at` and content hash, and the read tools must return both.
6. **Navigation by document id.**
   - Nothing AnA emits carries a `docId`.
   - The `docId` branch ignores the section code.
   - An editor that is already open ignores new navigation parameters.
   - A document outside the workbench's current status filter fails with a notice (`:1541-1546`).
7. **The read tools would not reliably be offered.** With the cap of 50 tools and the `asStr` defect, they could be dropped on turns where the editor is open, unless they are pinned.
8. **No editor command anchors a replacement.** Only `insert` exists (`DocumentWorkbench.tsx:667-677`).
9. **Pending AnA text is recorded as the saver's own assertion.** The lineage check scans raw HTML, so a person who saves with an AnA suggestion still pending is recorded as asserting it. This is reported by the edit-path survey and not re-verified. Proposals would make this far more common.
10. **No existing document can be shown as a canvas.** `DocumentCanvas` mounts only for a draft produced in the same turn. This can wait: navigation to the workbench covers it.
11. **Rule 2.** The implementing session must name the launch row it moves and the evidence it will file. The `docs/work-orders/README.md:65` mapping cited in the turn-context survey was not re-verified.

## 3. Implementation plan (6 steps, in order)

No new editor, no Vault catalog tools touched, and every AnA write stays a redline the person accepts.

**Step 1. Read service and three read-only tools.**
- New `server/services/authoring/authoring-read.ts`, all queries scoped by tenant and program, and never copying the untenanted join at `:1315`:
  - `outlineForProgram(pool, {tenantId, programId, cursor, limit})` returns no content. It derives depth from the code segments, sorts with `sortBySectionCode`, and computes a SQL hash `encode(sha256(convert_to(content,'UTF8')),'hex')` and the `length`.
  - `readSection(pool, {tenantId, programId, sectionId, offset, maxChars})` renders through `sectionContentToBlocks`, marks pending insertions and deletions, and returns `updatedAt`, `sha256` and `nextOffset`.
  - `searchSections(pool, {tenantId, programId, query, limit})` uses `ILIKE` and returns snippets, with no migration in this step.
- New `server/services/ana/authoring-read-tools.ts`:
  - It exports `AUTHORING_READ_TOOLS` (`list_authoring_outline`, `read_authoring_section`, `search_authoring_sections`) and `registerAuthoringReadHandlers(register: RegisterFn)`, using literal `register('…')` calls.
  - It imports only types from the executor.
  - Input names must avoid the free-text field pattern (`content`, `text`, `body`, `html`), and results must never carry `status:'generated'`.
- Wiring:
  - `AnaToolDefinitions.ts`: 2 lines.
  - `AnaToolExecutor.ts`: 2 lines, after `:15646`.
  - `tool-authorization.register.json`: 3 entries with `{"class":"read","writes":"none"}`.
  - `ana-launch-scope.inventory.json`: 3 names in `inScope`.
- Test, shown failing first: a document in program B or tenant 2 is invisible from program A.

**Step 2. Make sure the tools are offered.**
- In `stream.ts:1606-1607`, pass strings (`authoring_context?.sectionCode` and `moduleCode`) instead of objects.
- Pin the three read tools in `stream.ts:1583-1604` and `send-message.ts:809-822` whenever an `authoring_context` or a project is present.
- Add a case to `tool-selection-routing.test.ts`.

**Step 3. Navigation by id, reusing the existing open-target flow.**
- `shared/navigation/index.ts:160-163`: add `docId` and `sectionCode` to the `authoring` target.
- `DocumentWorkbench.tsx:1004-1029`: read `p.docId` into `sectionOpenTarget`.
- In the `docId` branch (`:1525-1550`), pass the section code to the existing pending-section mechanism instead of returning.
- `authoring.open-document` (`:1708`) also accepts `docId`, for the case where the editor is already open.
- Correct the text at `surface-actions.ts:357`.
- Test, shown failing first: `resolveNavigation('authoring', {docId, sectionCode})` keeps both parameters.

**Step 4. Editor command for anchored proposals, inside the existing editor.**
- In `suggestions.ts`:
  - fix `insertSuggestedContent` so a selection becomes an AnA deletion mark, not a silent delete;
  - add `proposeReplacement(quote, replacement, author)`. It uses `computeMatches` (`findReplace.ts:74`), requires exactly one match, puts a deletion mark on the quoted range and an insertion after it, and sets `SUGGESTION_ACTION_META` and `addToHistory=false`.
- Expose it as `RichSectionEditorHandle.proposeReplacement` (`RichSectionEditor.tsx:131-160`, `:1497`) and `EditorBridge.propose` (`DocumentWorkbench.tsx:667-677`, `:1180-1199`).
- The bridge refuses when the loaded section's `updatedAt` or hash differs from the proposal's base.
- Test, shown failing first: a selection plus an insert leaves a tracked deletion.

**Step 5. Harden the person's save before proposals ship.**
- In `authoring.router.ts`, inside the transaction:
  - read the section with `SELECT … FOR UPDATE`;
  - compare `expectedUpdatedAt` there;
  - call `createRevision` after the lock;
  - add `AND updated_at = $expected` to the `UPDATE`.
- In `lineage-gate.ts`, exclude pending `<ins>` AnA text (and struck `<del>` text) from the saver's assertion.
- Tests, shown failing first: two concurrent saves that both pass today; pending AnA text recorded as the person's.

**Step 6. `propose_section_edit` (writes nothing).**
- Add it to `authoring-read-tools.ts` with input `{section_id, base_updated_at, base_sha256, quote, prefix?, suffix?, replacement}`.
- The handler checks:
  - the section is in the open program;
  - `decideAuthoringPermission(…,'edit')`, whose status rule refuses frozen or approved documents;
  - the quote occurs exactly once;
  - the base still matches.
- It returns `{proposal:{docId, sectionId, code, base, quote, replacement}}`.
- Register it as class `read` with writes `none`. Also add it to `GOVERNED_CONTENT_WRITE_TOOLS` (`governed-write-tools.ts:37-64`) so only approved models can produce the replacement text, and so `governed-write-gate.test.ts` passes if `replacement` matches its free-text pattern (not verified).
- Client:
  - In `useAnaChat.ts:~1380`, map results named `propose_section_edit`, as the existing per-tool mappers do.
  - `ConversationThread.tsx` (`:178-195`, `:880-898`) renders a card with "Show in document". It navigates as in step 3, then calls `EditorBridge.propose` as in step 4, with `sourceRecord` attached after `post_done`.
- Acceptance stays on the existing `tracked-change-decisions` routes, followed by the person's save with a reason. That save is the only write.

Files that change: 2 new server files plus tests. Existing files: `AnaToolDefinitions.ts`, `AnaToolExecutor.ts`, the two JSON registers, `stream.ts`, `send-message.ts`, `shared/navigation/index.ts`, `surface-actions.ts`, `DocumentWorkbench.tsx`, `RichSectionEditor.tsx`, `suggestions.ts`, `useAnaChat.ts`, `ConversationThread.tsx`, `governed-write-tools.ts`, `authoring.router.ts`, `lineage-gate.ts`.

No migration is needed. A later trigram index for search would be an additive `IF NOT EXISTS` migration, which Rule 1 allows.
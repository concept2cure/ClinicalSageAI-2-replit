# What already exists, and the plan — AnA reads, navigates and proposes edits (2026-10-22)

RULE 3 record for board row "D2 — AnA reads, navigates and proposes edits across every authoring document". Six read-only surveys at `aff62826da` (2,645 commits after this lane last worked), then a critic that re-checked the eight load-bearing claims against the code. The critic's report follows unedited; the six survey reports are in `0-survey-reports.md`.

# D2 L104 critic report: AnA reads, navigates and proposes edits across every authoring document

Checked at HEAD `aff62826da` on `concept2cure-v2`, read-only. The only file I wrote is the probe `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/a8e385de-72d5-5f22-9fa3-6a9b2ecaadb9/scratchpad/critic-probe.mts`; nothing in the repo changed.

**Bottom line:** all 8 load-bearing claims hold. The surveys miss one thing that changes the plan: navigation and proposals land in two different copies of the one editor. AnA can navigate the full-screen editor, but only the copy inside the conversation accepts proposals.

## 1. The eight most load-bearing claims, re-checked

1. **`stream.ts` still loses the open screen, and no authoring read tool is pinned.** Confirmed.
   - `asStr` is defined at `server/routes/ana-ri/stream.ts:2111`. At `:2139`, `surface: asStr(intent_lens) ?? asStr(authoring_context)` is always undefined: the client never sends `intent_lens` (no match in `client/src`), and `authoring_context` is an object.
   - The only pins are `selected_tools`, `invokedAppPins`, `SELF_DRIVE_TOOLS` and `run_agent` (`:2117-2133`).
   - `send-message.ts:813-827` pins only `selected_tools` and `SELF_DRIVE_TOOLS`.
2. **The three read tools are not always-on.** Confirmed.
   - `ALWAYS_ON_TOOLS` (`tool-selection.ts:31-75`) does not contain them.
   - Searching by tool name, they appear only in `authoring-read-tools.ts`, the two JSON registers and `authoringOversight.ts:3-4`.
   - **Minor correction to the offered-on-turn report:** `AnaToolDefinitions.ts:49,2257` and `AnaToolExecutor.ts:232` reference `AUTHORING_READ_TOOLS` and `registerAuthoringReadHandlers`, not the tool names.
3. **A merge dropped the `module_context` rendering.** Confirmed.
   - `stream.ts` has no `module_context`.
   - `appendAnaRequestContextBlocks` and `buildChatContext` are called only from tests.
   - `git diff 9639c5f48e 252ebb9ce3 -- stream.ts` is empty, so the merge kept the other side's file unchanged.
   - `813229153d:stream.ts` had all the wiring: the import at `:120`, the client-type promise at `:410`/`:558`, the call at `:585-588`, and the selection context at `:1202-1245`, which derived `surface` from `module_context.surface`. The merge base `6c1c15c67d` never had it.
4. **Navigation drops parameters it does not declare, and still reports success.** Confirmed.
   - The `authoring` target declares only `authoringDocType` (`shared/navigation/index.ts:164-165`), and the resolver copies only declared parameters (`:290-307`).
   - `resolveSurfaceAction` does the same (`surface-actions.ts:1654-1667`).
   - `authoring.open-document` requires `title` (`:339-351`).
   - The text at `:357` still sends AnA to `navigate_to authoring` with `sectionCode`, which drops the code.
   - `navigate_to` lists only the destination screen's own actions (`AnaToolExecutor.ts:18401`), so `section-workspace` lists none.
5. **The cross-document section search stops at 8 documents.** Confirmed.
   - `DocumentWorkbench.tsx:2359` loops over `docs.slice(0, 8)`.
   - The list has no limit and is ordered `updated_at DESC` (`authoring.router.ts:1458`). The project-scoped list adds `source=ana` (`:1454`).
6. **AnA's fix cards reach `EditorBridge.propose`; a fix has no document id; "Open section" works only inside the open document.** Confirmed, but incomplete:
   - **Proposals and navigation land on different copies of the editor.** The editor bridge exists only for the copy embedded in the conversation's canvas (`DocumentWorkbench.tsx:1805` reads `embedded?.onEditorBridge`; only `DocumentCanvas.tsx:613` passes it).
   - That canvas mounts the editor with `surfaceActionId={null}` and `consumeDeepLinks={false}` (`DocumentCanvas.tsx:614-615`). So `act_on_screen`, editor-target events (the handler returns at `DocumentWorkbench.tsx:2211`) and navigation parameters (`:1500`) never reach it.
   - When the conversation is on screen, the action bus stores the action and moves the person to the full-screen editor (`client/src/concept2cure/v2/surfaceActions.ts:536-542`), away from the fix cards.
   - **The navigation report's "smallest completion" therefore works only on the full-screen editor,** not where proposals are applied.
   - The fix parser is shared with the server's check of AnA's claimed text (`machine-claim-verify.ts:69,162`). Its strict key list (`remedies.ts:24`) rejects a `docId` on both sides today.
7. **The section save checks the version outside the transaction.** Confirmed.
   - The current row is read from the pool before the transaction (`authoring.router.ts:2002-2005`) and compared at `:2044-2063`. A token that does not parse as a date gives NaN, and the check is skipped (`:2049`).
   - The transaction begins at `:2280-2281`. The `FOR UPDATE` at `:2286-2289` reads only `content`, only when content is sent, and does not re-check the version.
   - The UPDATE matches only id and tenant (`:2204-2208`).
   - **Likely false 409 (not run):** the track-changes toggle keeps only `track_changes` on the client (`DocumentWorkbench.tsx:3283`), while the server bumps `updated_at` on every save (`:2199`). The person's next content save then carries a stale token and is refused for their own change.
8. **The lineage gate records pending AnA insertions and deletions as the saver's own words.** Confirmed by reading the code; I did not re-run the survey's probe.
   - Neither `lineage-gate.ts` nor `machine-attribution.ts` handles `<ins>`, `<del>` or anything pending.
   - The suggestion attributes `data-author-name` and `data-at` are in the "printed attributes" list (`machine-attribution.ts:273-276`), and those clauses are documented as "not compared, stays the saver's" (`:73-77`).

**Claims that are wrong or overstated:**
- **"authoring-read-scope.ts applies exactly that check to route and service reads"** (offered-on-turn §6; board-and-drift, divergence 1). It does not cover the authoring routes. `authoringObjectAuthorization.ts:305-309` skips per-document checks for GET, HEAD and OPTIONS (except `/documents/:id/reviews`). `authoring-read-scope.ts` is used only by the review board, source tracer, submissions, assembly sources, project records, source usage and leaf evidence. So the premise at `authoring-read.ts:22-26` still holds for the editor's own reads. AnA's reader, limited to the open project, is narrower than the editor's organization-wide reads. Whether to add per-document view checks is a policy question for the founder, not a reader defect.
- **Fixing `surface` alone does not close plan step 2.** My probe ran the real launch tool pool with `surface: 'document-authoring'` and `documentType: 'Clinical Overview'`:

  | Request | Read tools offered |
  |---|---|
  | "review this section and suggest improvements" | all three |
  | "where else do we mention the 10 mg/kg dose?" | all three |
  | "check the whole dossier for inconsistent dosing" | all three |
  | "summarize the IND for me" | `read_authoring_section` only |
  | "does 2.7.3 agree with the protocol on the primary endpoint?" | none |

  A pin is still needed.
- **Proposal-path option B is incomplete.** A fix card has somewhere to apply only while some canvas editor exists (`ConversationThread.tsx:1185-1187`). With none open, the card says "Open this document in the editor to apply the fix" (`AuthoringRemedies.tsx:18`) and offers no way to open it. Opening by document id must work without the editor bridge.
- **The context report's step 1 has an unstated side effect.** Rendering `module_context` would also advertise the full-screen editor's screen actions from the conversation canvas (added unconditionally at `DocumentWorkbench.tsx:1907-1909`). If AnA called them, the person would be moved off the conversation.
- **Minor:** the board report's 24-hour list for `authoring.router.ts` leaves out merge `f715b97a4a` (01F252Ci, 10-22 06:39).

## 2. What already exists

- **`server/services/authoring/authoring-read.ts` and `authoring-read-render.ts`** (`970aa8d054`, `2ae0b1cb5a`).
  - Does today: lists the outline (200 per page by default, 500 max, with a cursor), reads a section in 4000-character windows, and searches up to 1000 sections, saying when that cap was hit. Every query is limited to the tenant and the open project. Pending changes are labelled ⟦…⟧. `acceptedSectionText` (`render.ts:53`) separates accepted text from pending.
  - Does not: check per-document view permission; feed anything into lineage or the filing commit.
- **`server/services/ana/authoring-read-tools.ts`**: `list_authoring_outline`, `read_authoring_section`, `search_authoring_sections`. They are registered, in launch scope and classed read. Scope comes from `admitAnaProjectScope` (`9bd3ee7345`).
  - Does today: returns `docId`, `sectionId`, `updatedAt` and `sha256`.
  - Does not: guarantee the tools are offered on a turn; tell AnA how to propose a fix.
- **`server/services/ana/tool-selection.ts`**: always-on tools, carried-over tools (`0d2537a864`), cap of 50.
  - Does not: pin anything by the open document.
- **`server/routes/ana-ri/stream.ts`**: the authoring block (`context-blocks.ts:80-125`; linked section codes cut silently at 24), and the open document's type and template outline (`dc8746a037`).
  - Does not: render `module_context` (document title, selection, screen actions); steer tools by `surface`.
- **`server/services/ana-ri/surface-context-block.ts`**: the screen block, including a fenced selection line.
  - Does not: run on any live path.
- **`shared/authoring/remedies.ts`, `AuthoringRemedies.tsx`, `ConversationThread.tsx:379/457`** (`30e80b571f`, `2c299974d4`): AnA's fenced `authoring-remedy` fixes. The parser is strict, allows at most 6 fixes, and is shared with the server check.
  - Does today: renders a card with "Apply as tracked suggestion", which calls `EditorBridge.propose`.
  - Does not: carry a document id, open a section in another document, or appear for anything other than the four "Review with AnA" buttons. The instruction exists only in client prompt text (`authoringOversight.ts:4`).
- **`DocumentWorkbench.tsx` `EditorBridge.propose` (`:1850-1865`), plus `suggestions.ts` `proposeReplacement` and `RichSectionEditor` `proposeReplacement`, `getProposalState`, `canProposeReplacement`.**
  - Does today: checks the approved-model rule first (`ee9a33c46b`), then section, editability, saved version and that the quoted passage occurs exactly once, then adds a tracked redline.
  - Does not: work on the full-screen editor surface, which publishes no bridge.
- **`DocumentCanvas` cardless open** (`ConversationThread.tsx:1365`, `:1386-1392`, `:1404-1415`, `:2209-2233`; `canvasFocus.ts:4-15`).
  - Does today: opens any document id at a given section beside the conversation (`documentRecordRead.ts:93-94` has no `source` filter).
  - Does not: respond to anything AnA emits. It is reached only from the document list and the editor's "Ask AnA" hand-off.
- **Full-screen editor navigation** (`DocumentWorkbench.tsx`):
  - Does today: the `docId` branch with `openExactDocumentSection` (`:2236-2249`, `:2290-2302`; `0e4ccf46f4`), opening a document by title (`:2498`), opening a section by code within the open document (`:2539`), and the code search over 8 documents (`:2359`).
  - Does not: open by id from anything AnA sends. A section code sent while the list loads is refused for good (`:2544` comes before the retry check at `:2547`).
- **Section save** (`authoring.router.ts:1975-2499`): locks the parent document (`reserveWritableSection`, `:2281`) and the section row (`:2287`).
  - Does not: check the version under the lock; exclude pending marks from lineage.
  - A pattern to reuse is already in the repo: `protocol-development-service.ts:285-310` and `module3OperatingSystemRoutes.ts:697-712`.
- **CI gates:**
  - `check-canvas-path.mjs` pins draft → canvas → editor → Vault. It has no propose or remedy reference.
  - `check-ana-surface-context.mjs` passes even though `stream.ts` renders nothing (it never checks `stream.ts`).
- **Not found:**
  - Searched `git grep` and `git log --all -S` for `propose_section_edit`, `open_authoring_section` and `openDocumentSection`.
  - Searched deletions since 2026-09-01 (`git log --all --diff-filter=D`) for `*remed*`, `*propos*`, `*authoring-read*`, `*openDocument*`, `*navHandOff*` and `*editorTarget*`; the only hits are unrelated `.claude/skills` files.
  - There is no navigation target or screen action for the conversation itself.

## 3. Smallest plan (row D2 L104; evidence under `docs/evidence/D2-ANA-DOCUMENT-AWARENESS/2026-10-22/`)

### Step 1: Fix the turn door in `server/routes/ana-ri/stream.ts`
- **Files:**
  - `stream.ts`: restore the `813229153d` wiring (`:120`, `:410`, `:558`, `:585-588`, plus `surface` and `clientType` from `:1202-1245`). Add a pin for the three read tools whenever `authoring_context.sectionId` or `artifactId` is a string.
  - `send-message.ts:813-827`: the same pin, so both doors match.
  - `authoring-read-tools.ts`: export the pin rule next to `AUTHORING_READ_TOOLS`.
  - `DocumentWorkbench.tsx:1907-1909`: drop `screen_actions` when embedded.
  - `scripts/ci/check-ana-surface-context.mjs`: also check `stream.ts`.
  - `chat-context-builder.ts:5`: correct the docblock.
- **Touched in the last 24 hours:** only `DocumentWorkbench.tsx`, by `1ae74ba2e1` (011DpxUy, claimed L29/L114), at hunks `:2178-2185` and `:3888-3895`, which do not overlap. Lanes that hold `stream.ts` are still claimed but have been quiet since 10-19: L191 (01TTTQ1h, whose "Next" list includes the open section's title in tool selection) and L145 (019ZvHmh).
- **Failing first:**
  - In `tool-selection-routing.test.ts` (production composition), all five requests above offer `read_authoring_section` with the pin. Today: 0 of 5.
  - A source check modelled on `self-drive-regressions.test.ts:270-274`, requiring both doors to pin the read tools.
  - `ci:ana-surface-context` goes red on HEAD's `stream.ts`.

### Step 2: Complete the `authoring-remedy` path (`shared/authoring/remedies.ts`) for typed requests and every document
- **Files:**
  - `remedies.ts`: export the fix instruction and add an optional UUID `docId`. Because the parser is shared, the server check accepts it too.
  - `authoringOversight.ts`: import that instruction and delete the local copy.
  - `authoring-read-tools.ts:118-131`: the `read_authoring_section` description carries the instruction (trusted text, unlike the untrusted context block).
  - `AuthoringRemedies.tsx:10-39`, `:94`: "Open section" for a fix in another document, available even with no editor open.
  - `ConversationThread.tsx:1185`, `:1365-1415`, `:2209-2233`: route that open into the existing canvas open (the canvas from the card, or the cardless one), with `focusSectionId`.
  - `anaInsertGate.ts:85-88`: a `propose` wording entry.
  - `propose` itself does not change.
- **Touched in the last 24 hours:** none of these files.
- **Failing first:**
  - `parseRemedyAnswer` on a fix that carries `docId` returns "Fix 1 is incomplete or invalid" today.
  - A fix naming a section in another document shows "Proposed fix for another section" with no button today; it must open that document at that section in the canvas.

### Step 3: Complete navigation by id (`shared/navigation/surface-actions.ts`, `index.ts`)
- **Files:**
  - `surface-actions.ts:339-357`: `authoring.open-document` takes `docId` and `sectionId`, with `title` optional. Correct the text at `:357`.
  - `index.ts:121`: add `docId` to `section-workspace`.
  - `DocumentWorkbench.tsx`:
    - `:1499-1506`: pass `p.docId` through, so the existing `docId` branch at `:2290` handles it and the 8-document search is bypassed.
    - `:2498`: resolve the id, retry while the list loads, then call the existing `requestLeave({kind:'document', id, sectionId})` (as at `:2370`).
    - `:2544`: run the loading check before the "no document" refusal.
    - `:2559`: correct the refusal text.
    - `:2069-2081`: show a notice when the requested section is not found.
- **Touched in the last 24 hours:**
  - `index.ts`: `c7af50d15b` (01T2wooC, which holds L33, claimed 10-22), at `:233` only.
  - `DocumentWorkbench.tsx`: as in step 1, no overlap.
  - L134 (01JNRgCK, idle since 10-01) also covers navigation parameters.
- **Failing first:**
  - `resolveSurfaceAction('authoring.open-document', {docId, sectionId})` returns `missing_param` today.
  - `resolveNavigation('section-workspace', {sectionCode, docId})` drops `docId` today.
  - A section in the 9th most recently updated document reports "Couldn't find" today.

### Step 4: Fix the section save (`authoring.router.ts:1975-2499`) and lineage (`lineage-gate.ts`)
- **Files:**
  - `authoring.router.ts`:
    - Read `updated_at` and `content` `FOR UPDATE` at `:2286-2289`, and compare the version there.
    - Return 400 for a token that does not parse, instead of skipping (`:2049`).
    - Add `AND updated_at = $expected` to the UPDATE at `:2204-2208`.
    - Take the audit row's "before" text from the locked row (`:2388`).
  - `lineage-gate.ts:168-206` and `machine-attribution.ts:73-77`, `:273-276`: attribute the accepted view. A pending `<ins>` is nobody's assertion yet, and `<del>` text keeps its earlier attribution. Reuse the insertion/deletion recognition in `authoring-read-render.ts`.
  - `DocumentWorkbench.tsx:3283`: take the server row's `updated_at` after the toggle, as rename does at `:3608-3610`.
- **Touched in the last 24 hours:** `authoring.router.ts`, by `c0e8a36137` and merge `f715b97a4a` (01F252Ci, no board row), at `:6792-6883` only. The lineage files were last touched by `adec93a30d` on 10-15.
- **Failing first:**
  - Two saves with the same token: both return 200 today; the second must get 409.
  - A save with a pending AnA `<ins>`: today it records one span asserted by the saver; it must record none.
  - Toggle track changes, then save: must not return `SECTION_CHANGED`.

### Step 5: Pin the path in CI and correct the plan and board
- **Files:**
  - `scripts/ci/check-canvas-path.mjs` and its selftest: pin fix card → `RemedyCard` → `EditorBridge.propose` → `proposeReplacement`.
  - The plan file and `docs/work-orders/README.md:104`: plan step 4 has landed, and plan step 6 is replaced by "complete `authoring-remedy` (`30e80b571f`)".
  - `README.md:103`: add `03ea3dc76c`.
- **Touched in the last 24 hours:** the board was, by many lanes; edit only rows 103 and 104.
- **Failing first:** the selftest, with the `target.propose` call cut from `AuthoringRemedies.tsx`, must turn the gate red.

## Left out on purpose
- **Pending marks in the filing copy:** `commitSectionToFiling` writes them into the filing copy (`commit-section-to-filing.ts:137`). That belongs to L33 (01T2wooC, claimed 2026-10-22); hand it on.
- **The client half of the selection field (SEC-C-4 (a)):** the editor still pastes the selected text into the message (`RichSectionEditor.tsx:1521-1527`).
- **Production:** every fix stays refused until a model passes performance qualification. All 17 entries in `approved-models.ts` are `pending`. That is the D4 row's job.
- **Seal check outside the transaction:** the tracked-change decision routes check the seal outside the transaction (`authoring.router.ts:8299`, `:8375`).
- **Founder decisions:**
  - Per-document view permission for AnA's reads.
  - Whether AnA should be able to open a document in the conversation canvas itself. Today she can only drive the person away to the full-screen editor; there is no conversation target or screen action for this.
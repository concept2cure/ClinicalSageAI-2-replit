### offered-on-turn
**Verdict:** the three read tools are registered, in launch scope and classed `read`. Nothing makes sure they are offered on a turn, though. On the streaming door they reach the model only when the person's wording happens to score above the cutoff. Nobody has pinned them, nobody has fixed the `surface` half of the `asStr` defect, and nobody has added selection that looks at the open document. Plan step 2 is still open.

## 1. Stream door: `server/routes/ana-ri/stream.ts`
- **Selection call** (`stream.ts:2112-2150`): it pins only three things:
  - `selected_tools` (`:2117-2119`)
  - `invokedAppPins(message)` (`:2122`), which is four self-drive tools when an `@app` is named (`invoked-apps-block.ts:41-45`)
  - `SELF_DRIVE_TOOLS` (`:2131`), plus `run_agent` when agents are offered (`:2133`)
- **No authoring read tool is pinned on any door.** A non-docs `rg` for the three names finds them only in:
  - `authoring-read-tools.ts`
  - `AnaToolDefinitions.ts:49,2257`
  - `AnaToolExecutor.ts:232,16074`
  - `tool-authorization.register.json:4471,5324,6339`
  - `ana-launch-scope.inventory.json:785,858,932`
  - comments, tests, and client prompt text
- **The `asStr` defect is half fixed:**
  - Fixed: `documentType` now comes from `prefetchedStreamContext.openDocumentLabel` (`stream.ts:2137-2138`, commit dc8746a037, 2026-10-15, "tool selection got asStr(document_context), always undefined"). It carries the registry name, e.g. "Clinical Overview", which pulls in tools that mention that type, not the read tools.
  - Still broken: `surface: asStr(intent_lens) ?? asStr(authoring_context)` (`stream.ts:2139`, unchanged since 5e69366703, 2026-08-22). The client sends `authoring_context` as an object (`useAnaChat.ts:1611-1630`, `:1695`) and never sends `intent_lens` (no match in `client/src`). So `surface` is always undefined.
- **Nobody pins tools from the client either.** No caller of `useAnaChat` passes `selectedTools` or `toolsOverride`: `V2App.tsx:686`, `ConversationThread.tsx:1151`, `EctdCoauthor.tsx:336` and `Rbm.tsx:217` don't, and the only read is `useAnaChat.ts:1723-1726`. The picker's catalog route `GET /api/ana-tool-policy/catalog` (`server/routes/ana-tool-policy.ts:103-116`) has no client caller, so `selected_tools` is always empty.

## 2. `server/services/ana/tool-selection.ts`
- `ALWAYS_ON_TOOLS` (`:31-75`) does not contain the read tools.
- The cap is 50 (`:322`). The tools are scored by word overlap with each tool's name and description (`:258-271`, `:355-361`).
- Since 2026-10-02 the selector has gained:
  - the always-on record tools (df30b4bbd2, a0b3de231c)
  - code tokens (788ca613c4)
  - carried tools (0d2537a864): up to 4 tools that ran successfully earlier in the conversation (`:156`, `:342-347`; `stream.ts:1502-1505`; `tool-trace.ts:215-221`)
  - the refactor into `turnIntentSignal` (7df89f4f79)

  None of these touch authoring tools. Carrying only helps once a read tool has already succeeded in that conversation.
- **Probe:** I ran `selectToolsForTurn` on the real launch pool with tsx; the script is in the scratchpad (`probe.mts`, `probe2.mts`, `probe3.mts`). It used 619 tools, with 18 always-on, 6 self-drive and `run_agent` pinned, which leaves 25 relevance slots.

  | Prompt | Read tools offered (outline / read / search) |
  |---|---|
  | "does 2.7.3 agree with the protocol on the primary endpoint?" (doc=Clinical Overview) | none; all three score 0 |
  | "review this section and suggest improvements" | none; read and search rank #48/#49 with a cutoff score of 3 |
  | "where else do we mention the 10 mg/kg dose?" | none |
  | "summarize the IND for me" | none |
  | "check the whole dossier for inconsistent dosing" | none |
  | "is this consistent with what we said in the nonclinical overview?" | none |
  | "tighten the second paragraph of this section" | read, search |
  | "propose edits to section 2.5.4" | read, search |
  | "and the next one?" | outline, read (noise: the word "next") |
  | The editor's four oversight buttons | all three |

- **Why the oversight buttons work:** their prompt text names the tools literally (`client/src/concept2cure/v2/editor/authoringOversight.ts:3-4`, sent by `AuthoringOversightActions.tsx:18`). That is wording, not a pin.

## 3. Other doors
- **`server/routes/chat/send-message.ts:813-827`:** pins `selected_tools` plus `SELF_DRIVE_TOOLS` and passes the raw `tool_context` through. No authoring pins. No client calls this route (no `send-message` match in `client/src`).
- **`ana-realtime.ts:137-141`:** pins only `input.selectedTools`.
- **`deep-investigation.ts:223-229`:** passes no options at all.

## 4. Filtering: none removes them by default
- **Launch scope:** all three are `inScope` and absent from `hiddenApp`, so `withoutHiddenAppTools` keeps them (`governed-toolset.ts:95`).
- **Tenant policy:** only an explicit deny-list (`mdx-tool-policy.ts:137-145`, applied at `governed-toolset.ts:110`). No default list names them.
- **Catalog gate:** `CATALOG_GATED_TOOLS` (`document-tools-shared.ts:27-31`) does not include them.
- **Plan tiers:** no plan-tier filter on the tool list in `services/ana`, `stream.ts` or `send-message.ts`.
- **Read-only turns:** `readOnlyToolRefusal` lets `read` class through (`read-only-turn.ts:10`), and the register says `class: "read"`.
- **Kill switch:** `ANA_TOOL_SELECTION_DISABLED` is unset (only `.env.example:647`).

## 5. Tests
- **`authoring-read-registration.test.ts:26-29`:** its "are offered to the model" case only checks membership in `ALL_ANA_TOOLS`, not whether a turn offers them.
- **`tool-selection-biotech-workflows.test.ts:59-61`:** pins three wordings only.
- **`tool-selection-routing.test.ts`:** has no authoring case, although the plan's step 2 asked for one.
- **System prompt:** no persona or system-prompt text names the read tools (the `rg` above).

## 6. Are the tools still present and unchanged?
They are present but not unchanged. The registration lines are untouched since f698516b29 (blame on `AnaToolDefinitions.ts:2257` and `AnaToolExecutor.ts:16074`). After f698516b29, the service and tool files changed in these commits:

| File | Commits after f698516b29 |
|---|---|
| `authoring-read.ts` | 970aa8d054 (10-01) only |
| `authoring-read-render.ts` | created in 970aa8d054; f90b9703eb (10-05, 3 nosemgrep lines); 2ae0b1cb5a (10-14, added `acceptedSectionText`) |
| `authoring-read-tools.ts` | 970aa8d054; 6df7678509 (10-08, shared `RESULT_BUDGET` and `fitReadWindow`); 9bd3ee7345 (10-16, see below) |

What 9bd3ee7345 changed in `authoring-read-tools.ts`:
- Scope now comes from `admitAnaProjectScope` (`authoring-read-tools.ts:308`) instead of `resolveOpenProgram`.
- A tool call now needs `ctx.userId` and `ctx.projectId` or `ctx.projectRef`.
- It reads through `ctx.sqlClient` or `withTenantConnection`; the default app pool is gone.

The register `site` lines were also re-pointed in 4d27ecc74c (10-22); the class is still `read`.

One thing outside this area: the comment at `authoring-read.ts:22-26` says no authoring read route checks `decideAuthoringPermission('view')`. Since 2026-10-14, `authoring-read-scope.ts` (14362ef006, 404e94efc2) applies exactly that check to route and service reads, but the AnA read path does not use it. I did not dig further.

## 7. Not found
I searched for `propose_section_edit`, an authoring pin, document-aware selection, and deleted selection files (`git log --all --diff-filter=D` on `*select*`, `*toolset*`, `*pin*` and `*authoring*` under `server/services/ana`, since 2026-09-15). None exist.

### navigation
**Short answer: no, not by id.** Today AnA can open a document only by its title, and a section only by its code. The code search covers just the 8 most recently updated documents. The ids that AnA's own read tools return (`docId`, `sectionId`) cannot be passed to any navigation path: the resolver drops them silently and still answers `ok: true`.

I confirmed this by running `resolveNavigation` and `resolveSurfaceAction` with tsx (probe: `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/a8e385de-72d5-5f22-9fa3-6a9b2ecaadb9/scratchpad/nav-probe.ts`). Nothing in the repo was changed.
- `authoring` with `{sectionCode, docId}` comes back with no params at all.
- `section-workspace` with `{sectionCode, docId, authoringDocType}` keeps only `sectionCode`.
- `authoring.open-document` with `{title, docId, sectionCode}` keeps only `title`.

## What works today

1. **`navigate_to section-workspace {sectionCode}`.**
   - `shared/navigation/index.ts:121` declares the param, and `registryModel.ts:989` aliases the target to `document-authoring`.
   - The client stashes the params (`V2App.tsx:395`, `AnaActionChips.tsx:70`) and `DocumentWorkbench.tsx:1499-1532` reads them once at mount.
   - The cross-document search at `:2359` only reads `docs.slice(0, 8)`. The list comes back ordered `updated_at DESC` with no limit (`authoring.router.ts:1458`), so a section in the 9th or later document is reported "Couldn't find".
   - The first code match wins, with no ambiguity check (`editorTarget.ts:300`).
   - Tested only by writing to the channel directly (`documentAuthoringDeepLink.test.tsx:226`), not through `resolveNavigation`.
2. **`navigate_to authoring {authoringDocType}`** (`index.ts:163-166`). Despite the name, the value is matched against document titles, first containment hit, no ambiguity refusal, and it calls `setActiveDocId` directly (`DocumentWorkbench.tsx:2420-2448`).
3. **`act_on_screen authoring.open-document {title}`** (`surface-actions.ts:339`, handler `DocumentWorkbench.tsx:2498`). This works whether or not the editor is open: the action bus stashes it and navigates there (`surfaceActions.ts:531-537`). It refuses ambiguous titles, and its outcome is reported back to AnA.
4. **`authoring.open-section {sectionCode}`** works only within the document already open (`:2539`).
5. **Live Drive onto an editor already showing** remounts it, so new params apply (`V2App.tsx:394-401`, `bodyKey` at `:1097`).
6. **The exact document + section path already exists, but nothing AnA emits reaches it.** `setEditorTarget({docId, code})` (`editorTarget.ts:176`) is honoured even while the editor is open, via the `EDITOR_TARGET_EVENT` listener (`DocumentWorkbench.tsx:2209-2226`). The `docId` branch (`:2290`) opens the section by code through `openExactDocumentSection` (`:2234-2249`), added in `0e4ccf46f4` on 2026-10-13. That closes one of the limits the plan listed. Its senders are the Vault, Project Home, notifications (`?documentId=&sectionCode=`, `editorTarget.ts:206`) and specialist handoffs (`authoringHandoff.ts:139`, `9bd3ee7345`). None of them is AnA.

## What is dropped or broken

- **Parameters dropped:**
  - The `authoring` target declares only `authoringDocType`, so a `sectionCode` or `docId` sent to it is dropped (`index.ts:290-306`).
  - Two strings still send AnA down that path: `surface-actions.ts:357` ("use navigate_to authoring with sectionCode") and the refusal text at `DocumentWorkbench.tsx:2559`. The working target is `section-workspace`.
  - The `navigate_to` example at `navigationTools.ts:47` shows `sectionCode` without naming a target.
- **No navigation parameter or action carries `docId` or `sectionId`.** The navigation registry and the editor target have no `sectionId` field. The pending-section mechanism (`targetSectionRef`, set at `:1650`, consumed at `:2069-2081`) falls back to the first section without saying so when the section is not found.
- **A chip pressed while the editor is already open does nothing.** The URL changes, but both aliases resolve to `document-authoring`, so `bodyKey` stays the same and there is no remount. `DocumentWorkbench` has no `NAV_PARAMS_EVENT` listener (other surfaces do, e.g. `TaskBoard.tsx:408`). The stashed entry can then open on an unrelated visit within the 2-minute window (`navParams.ts:43`).
- **AnA is never told when a navigation parameter misses.** The move counts as landed once the screen shows (`V2App.tsx:352-369`); the "Couldn't find" notice reaches only the person.
- **Navigate then open-section on a fresh mount probably fails** (found by reading, not run). The handler refuses "No document is open" at `:2544` before its retry check at `:2547`. `activeDocId` is `docs[0]`, which is null while the list loads (`:1270-1274`). Registration runs the stashed action at mount, so this refusal is final rather than retried.
- **Screen actions after `navigate_to section-workspace`.** `navigate_to` returns none, because it filters by target id (`AnaToolExecutor.ts:18401`) and the authoring actions are registered under `authoring`.

## Conversation canvas

- **An existing document can already be shown.** The cardless `DocumentCanvas` (`ConversationThread.tsx:2208-2232`, with `focusSectionId`) opens any `docId`.
- **But it is reached only two ways:**
  - The Documents list (`openFromList`, `:1404`). Its project scope lists only AnA-built documents (`source=ana`, `authoring.router.ts:1454`), so a human-authored IND document never appears.
  - The editor's "Ask AnA" handoff (`:1366-1395`).
- **AnA cannot trigger it.** Canvases come only from `generatedDraft` or from `draft_authoring_document` / `save_document_to_vault` results (`:150-175`). There are no conversation-thread screen actions.
- **The conversation's fix cards can open a section only inside the document already in the canvas.** These are the "AnA remedies" cards added 2026-10-13 (`30e80b571f`): `bridge.openSection` (`DocumentWorkbench.tsx:1830`, `AuthoringRemedies.tsx:36`). The fix format carries `sectionId` but no `docId` (`shared/authoring/remedies.ts:4-24`).

## Newer mechanisms since 2026-10-02

None for AnA navigation. `shared/navigation/index.ts` changed three times since then (`4a6f01188b`, `0308ee257d`, `c7af50d15b`), none on `authoring` or `section-workspace`. There are no recent commits on `navHandOff` or the `authoring.open-*` actions. Searches for `propose_section_edit`, `open_authoring`, `open_in_editor`, `navigate_to_section` and `docId` parameters across `--all` refs found nothing relevant. `git log --all --diff-filter=D` found only `SectionWorkspace.tsx` (`e5a74a4dfa`, 2026-06-02) and `DocumentCanvasPanel.tsx` (`6a25ab34d3`, 2026-05-01). The plan's steps 3, 5 and 6 are still open, and the D2 row is still "claimed 2026-10-01" (`docs/work-orders/README.md:104`).

Outside this area but relevant: plan step 2 (keeping the read tools offered on every turn) is not done. `list_authoring_outline` appears only in its own tool file and the two JSON registers; it is not referenced in `stream.ts`, `send-message.ts` or `tool-selection.ts`.

## Smallest completion

This extends the existing handler, bus and pending-section mechanism; no new path is needed.

1. **Text-only fix, no code.** Change `surface-actions.ts:357` and `DocumentWorkbench.tsx:2559` to point at `section-workspace`. AnA then has a working document-by-section-code path today, still capped at 8 documents.
2. **Open by id, in two files.**
   - Add optional `docId` and `sectionId` to `authoring.open-document` (`surface-actions.ts:339-351`); `title` becomes optional when `docId` is given.
   - In the handler (`:2498`): find `docId` in `docs` (retry while loading, honest refusal on a miss), then call `requestLeave({kind:'document', id, sectionId})`. If it is the open document, use `{kind:'section'}`.
   - In `loadSections` (`:2069-2081`): show a notice when the section is not found instead of silently opening the first one.
   - Move the loading/retry check ahead of the "no document" refusal in `authoring.open-section` (`:2544`).

   This covers Live Drive and chips, whether or not the editor is open, reports the outcome back to AnA, and removes the 8-document cap for id-based opens. The first failing test is the probe above, which shows `docId` and `sectionId` being dropped.
3. **Optional: the `navigate_to` version (plan step 3).** Add `docId` and `sectionCode` to the `authoring` target. Feed `p.docId` into `sectionOpenTarget` (`:1511`) so the existing `docId` branch handles it. Add a `NAV_PARAMS_EVENT` listener mirroring the one at `:2209-2226`.
4. **Optional: canvas.** Add a conversation-thread screen action that calls the existing `openFromList` path with `focusSectionId` (no new canvas). Whether to drop the `source=ana` filter is a scope decision for the founder.

### context-and-module-context
**What AnA is told each turn about the screen and the open document (HEAD `aff62826da`, read-only)**

## 1. Is `module_context` rendered in `stream.ts`? No. Hand-off item 14 is still open, and the fix was already written once, then lost in a merge.

- **The route never reads it.** `stream.ts:744-764` takes the request fields apart and `module_context` is not among them. Searching `stream.ts` for `module_context|moduleContext|buildSurfaceContextBlock|appendAnaRequestContextBlocks` finds nothing.
- **Item 14 has not changed since it was filed.** It is at `docs/work-orders/README.md:1271-1294`. The last commits touching those lines are `7f905e5e6d` and `d73b215d11`, both from 2026-09-28, and neither records a status.
- **Other documents still describe it as open:**
  - row 103 (`README.md:103`, "stream.ts renders no module_context");
  - `docs/evidence/D2-ANA-OPEN-DOCUMENT/2026-10-15/README.md:10`;
  - `docs/evidence/ANA-REASONING/2026-10-05/r7/README.md:109`.
- **Who calls `buildSurfaceContextBlock` (`surface-context-block.ts:143`):**
  - In production, only `buildChatContext` does (`chat-context-builder.ts:630`, function at `:410`).
  - `buildChatContext` has no production caller. Its only callers are tests: `server/services/__tests__/ana-recall-overlap.test.ts`, `ana-ri/__tests__/chat-context-latency.test.ts` and the mock in `tests/routes/ana-ri-health.test.ts:215`.
  - `appendAnaRequestContextBlocks` (`surface-context-block.ts:259`) is called only by `tests/routes/ana-ri-context.test.ts`.
  - `resolveOrganizationClientType` (`chat-context-builder.ts:113`) is referenced only by the mock in `tests/routes/ana-ri-health.test.ts:217`.
  - So the screen block, the organization client-type block and the client-type lookup are all code nothing reaches.
- **Rule 3 finding: the wiring existed and a merge dropped it.**
  - `669b81c419` (2026-09-08, author "concept2cure", "consolidate local development work") added `appendAnaRequestContextBlocks(orchestration.systemPrompt, { moduleContext: module_context, organizationClientType })` to `stream.ts`.
  - On that same line, `813229153d` has the call at `stream.ts:585-588`. It also fed tool selection from the screen and the open section (`:1202-1245`): `surface: moduleContextForTools?.surface ?? context.screenName …` and `documentType: … authoringContext.moduleCode/sectionCode`.
  - Merge `252ebb9ce3` (2026-10-09, parents `813229153d` and `9639c5f48e`) kept the canonical side's `stream.ts` unchanged: `git diff 9639c5f48e 252ebb9ce3 -- stream.ts` is empty. That dropped the call.
  - The helpers came in from the other side in the same merge, which is why they now exist with no caller. The merge base `6c1c15c67d` never had the call.
  - The fix is to restore the call from `813229153d:server/routes/ana-ri/stream.ts:585-588`, not to write a new one.
- **Out-of-date comments and gates:**
  - `chat-context-builder.ts:5` says "Both endpoints call buildChatContext()". Neither does, and `/api/ana-ri/chat` was deleted in `5aaa057930` on 2026-08-23.
  - The header of `scripts/ci/check-ana-surface-context.mjs` says the server renders `module_context`. The gate never checks `stream.ts`.
- **A related defect is still there:** `stream.ts:2139` sets `surface: asStr(intent_lens) ?? asStr(authoring_context)`, and `asStr` (`:2111`) returns `undefined` for an object. So the screen never steers which tools are offered. `documentType` was fixed at `:2138` (it now uses `openDocumentLabel`).

## 2. The `selection` field (SEC-C-4 (a)): the server half exists but nothing reaches it

- **Server side:** `surface-context-block.ts:117` and `:127-135` render the selection as one quoted line, fenced, capped at 1000 characters (`:57`). It is reachable only through `buildSurfaceContextBlock`, which no live path calls (see 1).
- **Client side: not found.**
  - `AnaSendOptions` (`useAnaChat.types.ts:841-863`) has no `selection` option.
  - The request body (`useAnaChat.ts:1684-1712`) has no `selection` field.
  - Searching `client/src/concept2cure` for a `selection:` key turns up only unrelated uses (import provenance, CSR, table state).
- **The editor still pastes the selection into the message:** `RichSectionEditor.tsx:1521-1527` sends `onAsk(\`Suggest a source for this claim: "${s}"\`)`. The selection reaches the model as if the person had typed it.
- **Its own comment says so:** the comment at `surface-context-block.ts:111-115` says the finding stays open, which matches the code.

## 3. What the client sends per turn

- **The `authoringContext` send option:** declared at `useAnaChat.types.ts:853`. At `useAnaChat.ts:1590` the turn's own value wins over the hook's.
  - It is unpacked into `authoring_context` at `:1612-1632`, with these fields: projectId, workflowStage, artifactId, artifactVersionId, artifactStatus, sectionCode, moduleCode, sectionTitle, sectionId, sectionUpdatedAt, dossierId, linkedSectionCodes, sourceArtifactIds, regulatorBody, domainTrack, submissionType, documentType.
  - `document_context` carries `{section, module, documentType}`.
  - `module_context` is sent unchanged at `:1696`.
  - The older `context` object mislabels the field: `artifactTitle: ac?.sectionTitle` at `:1708`.
- **ConversationThread (`ConversationThread.tsx:1178-1205`):**
  - It sends `{authoringContext, moduleContext}` from the `EditorBridge`, but only while the editor is open beside the conversation and in the open project (`:1184`, `:1193`).
  - A question handed over from another screen carries that screen's context on one turn only, through `originTurnContext` (`authoringConversationOrigin.ts:34-46`).
- **DocumentWorkbench:**
  - `contextForWorkbench` (`DocumentWorkbench.tsx:1188-1201`) builds the pack.
    - It has the document id, status and module; the section's code, title, id and `updated_at`; filing agency and type; and `linkedSectionCodes`, which is the codes of every other section.
    - It has no document title.
    - The bridge exposes it at `:1838`.
  - The editor's `moduleContext` (`:1878-1910`) carries documentId, **documentTitle**, sectionId/Code/Title/UpdatedAt, the saved-template facts, evidence source ids, import provenance and `screen_actions`. Because this travels only as `module_context`, the model never receives it.
  - Standalone (not embedded), the workbench publishes `{...moduleContext, authoringContext}` as surface context (`:1912`). That also reaches the model only through `module_context`.

## 4. What the model actually receives about the open document (`stream.ts:1174`, `:1314-1385`)

- **The route block** (`context-blocks.ts:48-76`): screen, project id and name, product type, user role and section code. The `artifactId` and `artifactTitle` in `context` are not rendered.
- **The authoring block** (`context-blocks.ts:80-125`):
  - It contains section_code, section_title, section_id, section_updated_at, artifact_id, module_code, artifact_status, dossier, regulator, submission type and linked_section_code.
  - Linked section codes are cut silently at 24 (`:22`, `:93`), with no "N more" note. For an IND-scale document the list stops partway without saying so.
- **The OPEN DOCUMENT block** (`open-document.ts:192-228`, landed in `dc8746a037` and `5288c0722d` on 2026-10-15):
  - It gives the registry type and the platform's template outline for that type, read from the saved `template_id` or from the type the screen states.
  - It does not give this document's actual sections or their content.
- **Section guidance:** ICH M4 guidance for the section via `buildSectionSpecificPrompt(sectionCode)` (`stream.ts:1380-1386`).
- **Readiness context:** when a section or artifact is open, readiness with the top 5 gaps and RIM signals (`orchestrator.ts:775-836`).
- **Not given:**
  - the document's title;
  - any text of the open section;
  - the selection;
  - the document's own outline with drafted/not-drafted and pending-change state;
  - any instruction to read the open section.
    - Neither the persona nor `orchestrator.ts` mentions `read_authoring_section`.
    - The only mention is client prompt text in `authoringOversight.ts:3-4`.

## 5. Is there a per-turn index of the project's documents? Not found.

- **Session briefing** (`server/services/ana/session-briefing.ts:110-160`): deadlines, decisions and blockers only. It is sent on the first turn only (`chat-context-builder.ts:259-275`).
- **ana-session-bootstrap** (`server/services/ana-session-bootstrap.ts:254-330`, called at `stream.ts:1528-1537`): memory atoms, outcome lessons, up to 12 Vault files and 8 chat uploads, at session start only. No authoring documents.
- **Intelligence prefix** (`lumen-context/intelligence-prefix.ts`): client and project memory. No documents.
- **The outline exists only as a tool.** `list_authoring_outline` (`authoring-read-tools.ts:98-116`) returns every document and section with id, code, depth, drafted, pending-changes and sha256.
  - It is neither always-on (`tool-selection.ts:31-74`) nor pinned in `stream.ts:2112-2133`, so whether it is offered depends on the wording of the message. `tool-selection-biotech-workflows.test.ts:59-61` covers explicit phrasings only.
  - This is step 2 of the plan file, and it is still open. `propose_section_edit` (plan step 6) was not found anywhere.
- **Deleted history:**
  - `git log --all --diff-filter=D` over `*authoring-context*`, `*surface-context*`, `*session-bootstrap*`, `*open-section*` and `*document-index*` finds:
    - `client/.../authoring-context-resolver.ts`, deleted in `2895218b8b`;
    - `tests/unit/authoring-context.test.ts`, deleted in `bc315a6eff`;
    - `server/routes/__tests__/session-bootstrap-wiring.test.ts`, deleted in `1514d854d0`.
  - None of these was a per-turn document index.
  - `-G 'sectionContent|section_content|selectedText|openSectionText'` over `stream.ts`, `chat-context-builder.ts`, `context-blocks.ts` and `orchestrator.ts` matches nothing. Section text has never been injected per turn.

## 6. What is still missing for AnA to know which document and section is open and what it says

1. **Render `module_context` in `stream.ts`.** Restore the `appendAnaRequestContextBlocks` call dropped by `252ebb9ce3`. That puts the document title, section identity, template facts and screen actions in front of the model, and makes the selection line reachable.
2. **SEC-C-4 (a), client half.** Add a `selection` send option and body field, and stop `askForSource` pasting the selection into the message (`RichSectionEditor.tsx:1521-1527`). The same applies to the DocumentCanvas host.
3. **Steer tool selection by the open document.** Fix `surface` at `stream.ts:2139`, and pin `list_/read_/search_authoring_*` whenever `authoring_context.artifactId` or `sectionId` is present (plan step 2). Otherwise the `section_id` the model is given may have no reader on offer.
4. **Give a per-turn outline of the open document.** Today it gets only linked section codes, silently cut at 24, with no titles or drafted state. Say "N more", or point to `list_authoring_outline` with `document_id`.
5. **Show or fetch the open section's text.** Either a bounded excerpt of the open section, or an explicit instruction in the authoring block to call `read_authoring_section(section_id)` before answering about "this section".
6. **Clean up after 1.** Retire `buildChatContext` or wire it, correct the docblocks at `chat-context-builder.ts:5` and `surface-context-block.ts:18-25`, and make `ci:ana-surface-context` check that `stream.ts` renders the block. Today it passes while the block reaches no model.

### save-and-lineage
**Section save and pending AnA text, as of HEAD aff62826da (2026-10-22), compared with a849a5d6a9 (2026-10-01)**

Plan step 5 is still open, both halves. The section save has a parent-document lock and a section-row lock, but the version check runs before either is taken. The lineage gate still records pending AnA `<ins>` text, and the AnA-struck `<del>` text, as the saver's own assertion.

**1. PATCH /sections/:sectionId**

The route is still inline at `server/routes/authoring.router.ts:1975-2499`. I found no service it moved to (searched for `saveSection`, `updateSection`, `patchSection` and `section-save*`).

Commits on these lines since 2026-10-02 (`git log -L1975,2499`):
- b86baf55e5: response helper.
- 8c48d5db5f (10-12): the machine-claim verdict, the 403 for a model Rule 2 does not admit, the lineage gate moved before the revision, and the claim recorded on the Part 11 row.
- 13d6b36979: that Part 11 entry is computed once.
- cfa4d5b5c7: comment change only.
- 0e4ccf46f4 (10-13): the parent reservation.
- 83fe486112 (10-13): the section `FOR UPDATE` read, and the 422 for unverified formatting.

**Locks.** Since 0e4ccf46f4, `reserveWritableSection` (`:2281`) locks the parent `authoring_documents` row with `FOR UPDATE` and bumps its `updated_at` (`server/services/authoring/document-lock.ts:55-71`). Since 83fe486112, the section is read with `SELECT content ... FOR UPDATE` (`:2286-2289`). That second read happens only when `content` is sent, it fetches only `content`, and it exists to supply `previousContent` to the lineage gate.

**Version guard: still opt-in, and still outside the transaction.**
- It compares `expectedUpdatedAt` (`:2044-2063`) against a pool read taken before the transaction (`:2002-2005`). `BEGIN` comes later, at `:2280`.
- Nothing compares it again under the lock.
- The UPDATE (`:2204-2208`) is `WHERE id = $n AND tenant_id = $n`, with no `AND updated_at = $expected`.
- A token that does not parse as a date gives NaN, and the check is silently skipped (`:2049`).
- The logic is unchanged since c86724dfb8 (2026-08-28).

So the race is still there. Two saves loaded at the same version both pass the check; the second waits on the parent lock (document-lock.ts:56) and then overwrites the first with no 409. The window between the read and the lock includes `creditMachineClaims(pool, …)` (`:2236-2239`). The Part 11 audit row also takes its "before" text from the pre-lock read (`:2388`, `currentSection.rows[0].content`), not the locked `previous`, so it can misstate what was overwritten.

**createRevision** now runs after the lock and after the lineage gate (`:2345-2354`). At a849a5d6a9 it ran directly after `BEGIN`, with no lock.

**Which clients send `expectedUpdatedAt`.** Only the content save, `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:3093`, and only when `activeSection.updated_at` is set. The route's other two callers send none: the track-changes toggle (`:3261`, `{track_changes}`) and rename (`:3588`, `{code,title}`). `ProtocolDevWrites.ts:159`, `ProtocolDevSection.tsx:106` and `SubmissionSeqWorkspaces.tsx:457` send it to other routes (protocol-development and submissions).

**Likely false 409 after the track-changes toggle (from reading the code, not run).** The server bumps `updated_at = NOW()` on every PATCH (`:2199`). The toggle adopts only `track_changes` (`DocumentWorkbench.tsx:3283`), so the next content save sends a stale token and gets SECTION_CHANGED for the person's own toggle. Rename adopts the server row (`:3608-3610`) and reorder reloads (`:3679`), so they are fine.

**Pattern to reuse rather than rebuild.** `server/services/protocol-development/protocol-development-service.ts:285-310` reads `id, updated_at ... FOR UPDATE` and compares under the lock (`:296`, `:309`). It refuses a bad token with BAD_INPUT. `server/api/cmc/module3OperatingSystemRoutes.ts:697-712` does the same.

**Searches that found nothing.** No server test covers the authoring 409 (the only server test using SECTION_CHANGED is `server/api/cmc/__tests__/module3SectionApproveIntegrity.test.ts:122`). `git log --all -S"AND updated_at = $"` on the router returns nothing, so a guard on the UPDATE has never existed.

**2. Lineage: pending AnA text — not fixed**

**Pending marks are saved.** `client/src/concept2cure/v2/editor/suggestions.ts:25-27` says pending marks persist in the saved HTML. They carry `data-author-id`, `data-author-name`, `data-at` and `data-source-record` (`:120-150`, `:181-217`). The editor serializes without stripping them (`RichSectionEditor.tsx:409-420`, `:1304-1324`). The save sends only accepted insertions (`DocumentWorkbench.tsx:3078`). Plan step 4 is recorded as landed in `docs/evidence/ANA-REASONING/2026-10-05/r14/d4-propose/README.md`, which confirms that the person's next save PATCHes these `ins`/`del` marks into `authoring_sections`.

**What the server does with them.**
- The save passes the gate only `previousContent`, the credited `acceptedMachineText`, and `recordOccurrences` (`authoring.router.ts:2299-2318`). It never passes `machineDraft`.
- In `server/services/clinical-regulatory-evidence/lineage-gate.ts:168-206`, a clause becomes the machine's only through `attributeMachineSpans` (`machine-attribution.ts:699-847`): an earlier acceptance carried forward, newly credited accepted text, a live `machine_draft` span, or `machineDraft`.
- Every other clause goes to `replaceAuthorSpans` with `assertedBy` set to the saver (`lineage-gate.ts:196-198`).
- Nothing in `lineage-gate.ts`, `machine-attribution.ts` or `span-lineage.service.ts` treats `<ins>`/`<del>` as pending.
- The design states it outright: a clause overlapping a suggestion's author or date "is not compared, and stays the saver's" (`machine-attribution.ts:73-77`; `PRINTED_ATTRIBUTES` includes `data-author-name` and `data-at`, `:273-276`).

**Probe.** I ran the gate's attribution functions in a scratchpad script, `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/a8e385de-72d5-5f22-9fa3-6a9b2ecaadb9/scratchpad/probe/pending-ins-probe.ts`. The input was a paragraph with a pending AnA `<del>` and `<ins>`, nothing accepted and no earlier spans. Result: 0 machine spans and one author span, asserted by the actor, covering both the struck and the proposed AnA text. Importing the modules opened a database pool; one `SELECT to_regclass` was blocked by tenant scoping, and nothing was written.

**History.** Commits to the lineage files since the baseline: 283fe08c42, c2851b97b1, 0e4ccf46f4, 83fe486112, 3a4657f042, adec93a30d, e1f3fd425e, fbe9ab4d9d. None excludes pending marks. `git log --all -G"pendingInsertion|excludePending|pending AnA|PENDING_MACHINE|pendingMachineText"` over these paths finds nothing. The plan's line (`0-survey-critic-and-plan.md:140`) and the D2 row (`docs/work-orders/README.md:104`, step 4) are still unmet.

**Related gaps.**
- The server's Rule 2 refusal (`authoring.router.ts:2253-2268`) checks only accepted claims. Pending AnA marks inside `content` are checked only by the client gate (`DocumentWorkbench.tsx:1851`).
- `commitSectionToFiling` writes the raw text, pending marks included, into `c2c_document_sections` (`server/services/c2c/commit-section-to-filing.ts:137`).
- `propose_section_edit` (plan step 6) is not found: grep over server, client and shared, plus `git log -S` since the baseline.

**3. Tracked-change decision routes — they exist and check `data-source-record`, but do not refuse**

- Routes: POST `/documents/:id/tracked-change-decisions` (`authoring.router.ts:8261`), POST `.../bulk` (`:8339`), GET (`:8416`). The middleware requires the `edit` action (`server/middleware/authoringObjectAuthorization.ts:190`).
- **Verification.** `recordTrackedChangeAct` (`:8144`) calls `resolveTurnRecordSources` (`server/services/authoring/authoring-record.ts:175-216`). That marks a claim unverified when the id is not a uuid, when no text was decided, or when the turn-record store is missing. Otherwise it runs `verifyMachineText` against `ana_turn_records` to confirm the turn wrote those words. `describeTrackedChange` (`:8227`) sets `proposedByVerified` to false unless the source verified.
- **Unverified claims are recorded, not refused.**
- **History.** The last change to these route lines is 2879ee384e (2026-10-05). 4f712159c9 (2026-10-12) reworked `authoring-record.ts`.
- **Seal-check gap.** The seal check is `checkDocumentWritable(pool, …)` at `:8299` and `:8375`, outside the transaction. `document-lock.ts:125-129` itself warns about exactly that window; the routes do not use `reserveWritableDocument`.
- **Decisions are not checked against the section's stored text.** A decision writes no content. An accept takes effect only through the person's next PATCH, which re-verifies on its own through `creditMachineClaims` and does not read the decision rows.
- The client sends `sourceRecord` (`DocumentWorkbench.tsx:3791-3840`).

### proposal-path
**AnA's proposal already reaches the open editor as a redline: `EditorBridge.propose` has a production caller.** It arrived on 2026-10-13 in `30e80b571f` and `2c299974d4`, which did not update the D2 row or its plan. Plan step 6 (`propose_section_edit`) is therefore superseded: building it now would be a second way of carrying the same proposal. The real work is to complete the `authoring-remedy` path that exists. In production every AnA proposal is still refused, because no approved model has passed performance qualification (PQ). That is the D4 row's job, not code.

## What already exists (HEAD `aff62826da`, read-only)

The path, in order:

1. **Request.** The editor's "Review with AnA" menu (`AuthoringOversightActions.tsx:8-18`, mounted at `DocumentWorkbench.tsx:4630`) calls `askAna` (`DocumentWorkbench.tsx:1925-1931`). It sends `oversightPrompt()` (`authoringOversight.ts:10-18`), which appends the `REMEDY` instruction (`authoringOversight.ts:4`). That instruction tells AnA to call `read_authoring_section`, then return up to six fenced `authoring-remedy` JSON blocks: `sectionId`, `baseSha256` and/or `baseUpdatedAt`, `quote`, `replacement`, `reason`, and optional `prefix`/`suffix`.
2. **Read tools.** `read_authoring_section` returns `docId`, `updatedAt` and `sha256` (`authoring-read-tools.ts:118-131`, `:245-248`). The prompt context also carries `section_id` and `section_updated_at` (`context-blocks.ts:87-88`).
3. **Parsing.** `shared/authoring/remedies.ts:4-75` parses the blocks: strict key list (`:24`), UUID and hash checks, at most six fixes, cut-off blocks reported as errors.
4. **Card.** `AuthoringRemedies.tsx` draws a card with "Apply as tracked suggestion", "Open section" and a del/ins preview. On apply it calls `target.propose` (`AuthoringRemedies.tsx:83`). The conversation renders it at `ConversationThread.tsx:378-381` and `:457`. Answer text has its fences removed (`:375`), and the whole-answer insert is hidden when a fix is present (`:231`).
5. **Bridge.** The conversation builds its target from the editor bridge (`ConversationThread.tsx:1178-1187`). That bridge comes from `DocumentCanvas.tsx:363`, `:382-385` and `:613`, which takes it from `DocumentWorkbench.tsx:1805-1873`.
6. **`propose` checks, in order** (`DocumentWorkbench.tsx:1850-1865`):
   - the approved-model rule first (`anaProposeRefusal`, `:1775-1785`, which calls `anaInsertRefusal`, `anaInsertGate.ts:136`); added in `ee9a33c46b`;
   - then wrong section, not editable, and the saved-version check (`baseRefusal`, `:1126`).
7. **Redline.** `RichSectionEditor.tsx:1680-1682` calls `proposeReplacement` (`suggestions.ts:2107`), which needs exactly one live match of the quote. `getProposalState` and `canProposeReplacement` (`RichSectionEditor.tsx:1587-1591`) let the card follow the suggestion afterwards.
8. **Save.** The person accepts or rejects as for any tracked change, then saves through `PATCH /api/authoring/sections/:sectionId`. Its governed-write check (`8c48d5db5f`) returns 403 when a model the rule does not admit served the turn. `machine-claim-verify.ts:160-176` reads the remedy `quote` and `replacement` out of the verified turn record.
9. **Tests:** `workbenchRemedies.test.tsx`, `authoringAnAUI.test.tsx`, `editorOversightNavigation.test.tsx`, `authoringConversationScope.test.tsx:162`, `authoringRemedies.test.ts`, `editorBridgePropose*.test.tsx`, `suggestionsPropose.test.tsx`, `governed-machine-claims.pglite.test.ts:272`. No CI gate pins this path: `check-canvas-path.mjs` has no propose, insert or remedy references.

**Corrections to the task text:**
- The editor's own AnA rail input in `DocumentWorkbench` was removed in `0bf71a61ed` (2026-10-13) and replaced by the conversation path. "Insert into {code} as tracked suggestion" now exists only at `ConversationThread.tsx:267-268`.
- The `useAnaChat` per-tool mappers moved to `useAnaChat.ts:405-450` and `:2200-2217`. None maps an authoring tool, and none needs to.

## Not found

- **Current code** (`git grep`): `propose_section_edit`, `propose_edit`, `suggest_edit`, `revise_section`, `propose_redline`, `proposeSectionEdit`, `'ana-proposal'`, "Show in document", `ProposalCard`, and any proposal SSE event in `stream.ts`. The only mention is the board text at `docs/work-orders/README.md:104`.
- **History:** `git log --all -S'propose_section_edit'` and `-S'suggest_edit'` over `server`, `client` and `shared` returned nothing.
- **Deleted files** (`git log --all --diff-filter=D`) matching propos*, suggest*, redline*, remed*, AnaPane*, AnaRail* or revise*: only unrelated ones, for example `mdx/shell/AnaRail.tsx` (`2895218b8b`) and `ProtocolCorrectionSuggestions.tsx` (`83fa7f6cfb`).
- **Revise and redline tools are not proposal paths:**
  - `revise_qms_document` (`qms-labeling-analytics-tool-defs.ts:65-80`, class confirm) opens a QMS change-control revision and takes no text.
  - `review_protocol_redline` is class read.
  - `surgical_docx_xml_edit` is class self and edits a scratch .docx.
  - `update_protocol_section` writes `protocol_sections`.
  - No AnA tool writes `authoring_sections`. Every writer is in `authoring.router.ts`, `authoring-section-seed.ts` or `section-placement.ts`.
- `GOVERNED_CONTENT_WRITE_TOOLS` (`governed-write-tools.ts:37-64`) holds no proposal tool. `FREE_TEXT_FIELD` (`:34`) includes `replacement`, so any new tool with that input must be classified, and it would be refused in production.

## Gaps at HEAD

1. **Refused in production.** The rule is `approvedForHighRisk && (!production || pq.status === 'passed')` (`approved-models.ts:385`). All 17 entries are `pending`; none has passed. Outside production it works.
2. **Only the four oversight buttons ask for fixes.** The format exists only as client-written prompt text. On the server, `authoring-remedy` appears only in `machine-claim-verify.ts:69,162`; the persona and tool descriptions never mention it. A request the person types gets no redline card.
3. **No route to a fix in another document.** `AuthoringRemedy` has no `docId` (`remedies.ts:4-13`, `:24`). "Open section" works only within the open document (`AuthoringRemedies.tsx:26-38`). A fix for another document shows "Proposed fix for another section" with no way forward, even though the reader returns `docId`.
4. **Refusal wording.** The card shows the insert wording "can't be inserted" (`AuthoringRemedies.tsx:76`; the `ACT` table at `anaInsertGate.ts:84-88` has only `insert` and `document`). `ee9a33c46b` recorded this as owed.
5. **Plan step 2 is still open.** `stream.ts:2139` still passes `asStr(authoring_context)`, which is undefined for an object. The read tools are neither in `ALWAYS_ON_TOOLS` (`tool-selection.ts:31-75`) nor pinned (`stream.ts:2115-2133`). Half of it was fixed: `documentType` now comes from `openDocumentLabel` (`:2137-2138`).
6. **Plan step 3 is still open for AnA.** The `authoring` navigation target declares only `authoringDocType` (`shared/navigation/index.ts:164-165`), and the resolver copies only declared parameters (`:291-307`). The editor-target hand-off does handle `docId` plus `sectionCode` (`DocumentWorkbench.tsx:2291-2297`).
7. **Plan step 5 is still open.** The save compares `expectedUpdatedAt` (`authoring.router.ts:2044-2061`) against a read made outside the transaction (`:2002`). The transaction begins at `:2280`, and the UPDATE (`:2204-2208`) matches only id and tenant. The `FOR UPDATE` at `:2287` serves the lineage check and does not re-check the version. I did not re-verify whether pending AnA insertions are recorded as the saver's own words; searching `lineage-gate.ts` and `machine-attribution.ts` for ins/del/pending handling found none.

## Smallest completion

Complete the `authoring-remedy` path; do not build `propose_section_edit`.

- **A. Every turn with a section open can propose.** Export the `REMEDY` sentence from `shared/authoring/remedies.ts`. Import it in `authoringOversight.ts` and put it in `read_authoring_section`'s description, not in the `authoring_context` block, which is labelled untrusted (`context-blocks.ts:23`, `:83`). Pin the three read tools when `authoring_context.sectionId` is present (`stream.ts:2115-2133`), and fix `:2139`.
- **B. Fixes in another document.** Add an optional UUID `docId` to `AuthoringRemedy`. Give the remedy target an `openDocumentSection(docId, sectionId)`, implemented with the conversation's existing way of opening any project document at a section: `listOpened` with `focusSectionId` plus `setExpandedDocId` (`ConversationThread.tsx:1386-1392`, `:1404-1415`, `:2209-2233`). Changing the section re-focuses (`canvasFocus.ts:4-15`), and the open goes through the unsaved-work guard (`DocumentWorkbench.tsx:1722-1729`). `propose` itself does not change, so the section, version and model checks still apply.
- **C. Wording.** Add a `propose` entry to `ACT` and pass it at `AuthoringRemedies.tsx:76` and `DocumentWorkbench.tsx:1782`.
- **Then:** add a CI pin for the remedy-to-`propose` path, and correct the D2 row and plan to say "complete `authoring-remedy`" (Rule 3, item 4).

**How this keeps the three constraints:**
- **Governed-write rule:** the model check runs first in `propose`, and the save door enforces it on the server.
- **The `status: 'generated'` draft trap** (`stream.ts:3085-3124`): it is not touched, because a fix travels in the answer text, never as a tool result.
- **`act_on_screen`'s rule** (`shared/navigation/surface-actions.ts:16-25`, "what is shown, never what is true"): it is not used, because the redline is applied by the person's click, from text the hash-checked turn record holds.
- **Production:** it stays blocked until a model passes PQ.

A `propose_section_edit` tool would only add an earlier server-side refusal and server-side quote checks. Under the zero-duplication rule, the fenced format would then have to move onto it and be deleted in the same change.

### board-and-drift
**Claims board and drift for session `…01WcyqbqWn6LszBqUWUSNnqA` (HEAD `aff62826da`, read-only)**

Overall: neither of this session's two rows has changed since 2026-10-01, and the session has made no commit since `a849a5d6a9` (`git log a849a5d6a9..HEAD --grep=01WcyqbqWn…` returns nothing). In those 21 days other lanes reused and hardened this lane's work, and an editor lane with no board row delivered plan step 6 in another form. Nothing of this lane's was deleted.

## A. This session's two rows (`docs/work-orders/README.md`)

**L103 — "D2 — the AnA document canvas → editor"**
- Status: **claimed** 2026-10-01. Claimed in `7577725ea9`; the text was last edited by `03ea3dc76c` (2026-10-01 16:47).
- The text lists steps (1)–(9), but "Landed" names only (1)–(8): `78aef41a`, `870edc42`, `52697e0c`, `cf4aa780`, `4c8b5534`, `f822dba1`, `c2f17977`, `9b4fd069`. Step (9) landed as `03ea3dc76c` and its hash is missing from the row.
- The row's open note ("`stream.ts` renders no `module_context`") is still true at HEAD: `grep module_context server/routes/ana-ri/*.ts` finds nothing.

**L104 — "D2 — AnA reads, navigates and proposes edits … at IND scale"**
- Status: **claimed** 2026-10-01. Claimed in `d10de752c9`; the text was last edited by `d33c45f0ac` (2026-10-01 20:42).
- Landed: (1) `48c43013` plus wiring `f698516b`. Item (2) is cited as "this commit's parent message", but the hash is `d33c45f0ac`.
- Its list of files "held for the 24-hour rule" (windows dated 10-01/10-02) is obsolete.
- Its step numbering is not the plan's: board (2)/(3)/(4)/(5) are plan steps 4/3/5/6. Plan step 2 (making sure the tools are offered) has no board item.
- The plan and evidence (`docs/evidence/D2-ANA-DOCUMENT-AWARENESS/`, `D2-CANVAS-EDITOR/`, `docs/design/ANA_DOCUMENT_CANVAS.md`) are unchanged since `a849a5d6a9`.

## B. Other rows that overlap (line: session, state, date, overlap)

- **L105**, ONE-AnA canvas on the right: `01T2wooC`, released 2026-10-22. Built on L103's `ConversationThread.tsx` and `DocumentCanvas.tsx` ("builds on them rather than beside them").
- **L33**, editor write-through honours a locked filing: `01T2wooC`, claimed 2026-10-22. Touches `commitSectionToFiling` only, not the editor files.
- **L191**, AnA reasoning checked by an engine: `01TTTQ1h`, claimed 2026-10-04, last commit 2026-10-19. Touches `stream.ts`, `ConversationThread.tsx`, the `DocumentWorkbench.tsx` bridge and `suggestions.ts` (`reattributePasted`). Its "Next" list includes "the open section's title in tool selection", which overlaps plan step 2.
- **L147**, editor-family review: `01TTTQ1h`, claimed 2026-09-28 (`DocumentWorkbench.tsx`, `RichSectionEditor.tsx`).
- **L145**, multi-agent and Manual/Auto: `019ZvHmh`, claimed 2026-09-27, last commit 2026-10-19 (`stream.ts`, `ConversationThread.tsx`, `useAnaChat`).
- **L190**, AnA document intelligence round 2: `017d4r3C`, claimed 2026-10-04, last commit 2026-10-19 (the DW section check).
- **L189**, the open document's type reaches AnA's turn: `01SuVLo2`, released 2026-10-15 (`stream.ts`). It handed on "the send-message path (no open-document read)".
- **L106**, QA journeys and AnA Summary: `01DiJJAk`, claimed 2026-10-08, last commit 2026-10-08 22:13 (idle). Its S1 commit touched `authoring-read-tools.ts`.
- **L134**, opening a task opens the item (`navParams`, `shared/navigation`): `01JNRgCK`, claimed 2026-10-01 23:00, last commit 2026-10-01 22:49 (idle). This overlaps plan step 3.
- **L42**, task drawer and navigation helpers: Codex, published 2026-10-20.
- **L45**, launch-boundary re-proof: `01E8btkB`, claimed 2026-10-15. It waits for `AnaToolExecutor.ts`'s window "2026-10-23T00:12Z". `dfe94a3002` (`011DpxUy`, 10-22 15:11) touched that file, so the window now runs to about 10-23 15:11.
- **L107**, FILING_SPINE F16/F17/F19 (two `DocumentCanvas.tsx` props): `011DpxUy`, claimed 2026-10-08 (`f10e35a1ee`). The row has been malformed since `83e81a93d5` (2026-10-15): it ends mid-sentence with no session or state cells.
- **L54**, AnA speed (`stream.ts` memory hunk): Codex, complete 2026-10-08.
- **L125/L126**, AnA progress record and turn record (`stream.ts`): `01T2wooC`, released 2026-10-22.
- **L227**, tracked-change decisions (`authoring.router.ts`): `01PwLFr8`, released 2026-10-05.
- **L57**: `0194UQPx` handed this lane a tenant-isolation red on `authoring-read-fixture.ts:352`. `6755378702` (10-01 21:06) already fixed it with the marker now at fixture lines 391/399.

**Lanes with no board row that edited this lane's files:**
- **D2-EDITOR-INTEGRATION**, 2026-10-13→10-21, author "Jon-Michael P Smith", no Claude-Session trailer. Designs are `docs/design/EDITOR_INTEGRATION_2026-10-13.md`, `EDITOR_REMEDY_LIFECYCLE_2026-10-14.md` and `AUTHORING_CURRENT_ACCESS_AND_HANDOFF_2026-10-16.md`. A board grep for `D2-EDITOR-INTEGRATION` or `EDITOR_*` returns nothing.
- **Document-store consolidation**, `01F252Ci`, design `docs/design/DOCUMENT_STORE_CONSOLIDATION.md`. Not on the board, yet it touched `authoring.router.ts` and `AnaToolExecutor.ts` within the last 24 hours.

**Last 24 hours** (since 2026-10-21 16:58 UTC):
- Lane target files:
  - `DocumentWorkbench.tsx`: `1ae74ba2e1` (10-22 00:15, `011DpxUy`, which holds claimed rows L29 and L114).
  - `shared/navigation/index.ts`: `c7af50d15b` (10-22 08:20, `01T2wooC`, L32 released 10-22 / L33 claimed 10-22).
  - Nothing touched `authoring-read*.ts`, `authoring-read-tools.ts`, `suggestions.ts`, `RichSectionEditor.tsx`, `DocumentCanvas.tsx`, `draftToDocument.ts`, `ConversationThread.tsx` or `stream.ts`.
- Registration files:
  - `AnaToolExecutor.ts`: `dfe94a3002` (`011DpxUy` 15:11), `7118c328f4` (`01F252Ci` 06:36), `d4be3c13f8` (`01KnUGoX` 04:57), `1354c0f5f5` and `64168f8e6d` (`01TzCCfq`, 10-22), `862dc0f075` (`01TzCCfq`, 10-21 23:44).
  - `ana-launch-scope.inventory.json`: `0bce953b47` (`01KnUGoX`).
  - `tool-authorization.register.json`: `4d27ecc74c` (`01TzCCfq`).
  - `authoring.router.ts`: `c0e8a36137` (`01F252Ci`).

## C. Commits since `a849a5d6a9` that touched the listed files

There are 123, excluding merges, in topological order. Two of them were authored before `a849a5d6a9` but reached trunk later: `eb62b566c3` arrived via `8120d4c802` (10-05), and `f2ab9b3cd2` was committed 10-04.

File keys: AR = `authoring-read.ts`, ARR = `authoring-read-render.ts`, ARS = `authoring-read-scope.ts` (new), ART = `authoring-read-tools.ts`, SUG = `suggestions.ts`, RSE = `RichSectionEditor.tsx`, DW = `DocumentWorkbench.tsx`, DC = `DocumentCanvas.tsx`, CT = `ConversationThread.tsx`, NAV = `shared/navigation/*`, STR = `stream.ts`. `draftToDocument.ts` and AR are untouched since 10-01 (`cf4aa78009` and `970aa8d054`). Author keys: JMPS = "Jon-Michael P Smith", c2c = "concept2cure", both without session trailers.

```
eb62b566c3 09-28 019ZvHmh [DW CT STR] Manual/Auto run policy (S4)
f2ab9b3cd2 09-29 01TTTQ1h [SUG] Undo/Redo stop at a recorded accept/reject
a3775bcef9 10-04 01TTTQ1h [CT STR] engine answer check drives strip/post_done/record
c2851b97b1 10-04 01TTTQ1h [RSE] batch-draft accept credits AnA only where readers show her words
ef70b10f4a 10-05 01TTTQ1h [CT STR] figure check needs its own measure
0507bb9262 10-05 01TTTQ1h [STR] governed draft checked before approval
ab2693c568 10-05 019ZvHmh [STR] a person's "no" is not a failure to route around
0446f22401 10-05 01TTTQ1h [STR] reasoning effort on evidence/high-stakes rounds
1356aeeaa8 10-05 01TTTQ1h [STR] AnA told a step returned nothing usable
1bee0b5eb2 10-05 019ZvHmh [CT] warnings from one component
e12ec645b9 10-05 01YZFCXR [STR] tool output is untrusted data
ab582250e2 10-05 017d4r3C [STR] NDA/BLA/IND chat framing
0d2537a864 10-05 01TTTQ1h [STR] follow-up keeps carried tools
e67c264f91 10-05 01TTTQ1h [STR] Module 2 summary open => high-stakes
f90b9703eb 10-05 01YZFCXR [ARR] 3 nosemgrep annotations on escaped RegExps
bb70aacff6 10-05 01TTTQ1h [STR] turn record states each call's input and why high-stakes
e5893fcf45 10-05 01TTTQ1h [DW SUG RSE CT] AnA insert gated by governed-write rule (anaInsertGate)
38c4ce1016 10-05 c2c [CT] conversation ownership, action outcomes
c7acab3414 10-05 c2c [STR] keep partial draft on Continue
5d7faedd85 10-05 c2c [STR] bounded context prefetch
b4b9832668 10-05 c2c [STR] bounded enrichment
0bb1cd6db4 10-05 c2c [STR] overlap recall with prefetch
2bf299776f 10-05 c2c [STR] thread access before memory recall
e5b01812dd 10-06 c2c [STR] recovery copy out of model history
afe63076cd 10-06 c2c [STR] verified conversation context before routing
8212d3c693 10-06 c2c [STR] conversation blind spots, late corrections
2c2417d7a7 10-06 c2c [STR] reviewed document dispositions, lineage
4147048613 10-06 c2c [DW] review-task receipts, unknown creates
f3b642189d 10-06 c2c [DW] export recording vs delivery
d390f96465 10-08 01T2wooC [CT] document opens on the right while AnA builds
a8b0dbf870 10-08 01T2wooC [CT] one composer steers a run
4e5374c58f 10-08 01T2wooC [CT] every ask lands in the one conversation
9ff77226c7 10-08 01T2wooC [CT] right rail removed
054f31081f 10-08 01T2wooC [STR] conversation writes only to its project
c77a594b08 10-07 c2c [STR] context startup perf
e04b568fed 10-08 01DiJJAk [STR] stopped turn kept; paging; upload chip
519c6acd58 10-07 c2c [STR] steering receipts; disconnected turns stop
ee05edc1ee 10-08 01DiJJAk [CT] program in URL; conversation survives reload
a056eb9ead 10-08 01DiJJAk [DW] reviewer assign/sign; approval bound to snapshot
661a2c93af 10-07 c2c [STR] release cancelled parent holds
e76ae571c2 10-08 01T2wooC [DC CT] canvas lists built docs, working-copy download, wrong-project refusal
9018545a1d 10-08 01T2wooC [DW] Send for review
71492adc0d 10-08 01T2wooC [DC] canvas card sends for review
9a94754c6a 10-08 01T2wooC [CT] rail code goes; nav lists places
427775e542 10-08 01T2wooC [STR] program UUID resolves to project row (ana-14)
da24c6ea5d 10-08 01T2wooC [CT] steers/pre-mortem component
6df7678509 10-08 01DiJJAk [STR ART] ART's local RESULT_BUDGET+bisection replaced by shared agentic-loop RESULT_BUDGET + read-receipts fitReadWindow
d498577218 10-08 01T2wooC [DW] review loop closes
ebc3076e43 10-08 c2c [STR] tool waits, mid-tool Stop
58876cf3a6 10-08 01T2wooC [NAV surface-actions] five project tabs; Author holds documents
d6e0be49be 10-08 01DiJJAk [STR] one step-presentation table (608 tools)
e796ae9ca6 10-08 011DpxUy [DW] F17 placement states copy status
1f25572554 10-08 01DiJJAk [CT STR] AnA Summary S4
b86baf55e5 10-08 01DiJJAk [DW] signing authority, package identity, paging
afca35467c 10-08 011DpxUy [NAV] cross-region verdict retired
2b6bca73fc 10-08 01DiJJAk [DW] signers only; AnA card/toolbar fit
c3b9524c4b 10-08 01DiJJAk [STR] DT1 steps mirrored to ana_run_events
ceb3d7dfc2 10-08 01T2wooC [DC DW] F4 start unstarted outline section in filing copy
d48e25c709 10-08 01T2wooC [DC] filing binding via AuthDoc
bd0bc1962b 10-08 011DpxUy [DC] filing-spine design review fixes
3fe12ad71d 10-08 01KnUGoX [DW] S5a figure check vs cited sources
2c17bcf273 10-08 011DpxUy [DC DW] placement role stated before dialog
202e118142 10-08 01DiJJAk [CT] DT2 follow a live turn from another device
bebd425367 10-08 c2c [STR] drop unused direct-answer/Live Drive prefetch
8c75defca3 10-11 01TTTQ1h [DW SUG CT] honest refused insert; pasted AnA suggestion keeps its turn
b71eda3c4c 10-11 01TTTQ1h [DW CT] design review of refused insert/audit rail/paste door
1d19566c8c 10-11 019ZvHmh [STR] stream hosts sub-agents; /api/agent-swarm retired
ee9a33c46b 10-12 01TTTQ1h [DW] EditorBridge.propose applies governed-write rule (model-not-approved)
5d8e60f3ec 10-12 019ZvHmh [STR] sub-agent review defects
4a6f01188b 10-12 01KZK3jg [NAV index, surface-actions +126] AnA actions on 13 launch screens
5b8d0e7950 10-12 019ZvHmh [CT] AnA asks in positions a person can take
2fa2ada7e2 10-12 01TTTQ1h [CT] "Open as document" under governed-write rule
5a82e8e46b 10-12 01TTTQ1h [CT] drop invented CSS class
ce8146e337 10-12 01TTTQ1h [CT] JSX fix
1975747641 10-12 01TTTQ1h [SUG] turn id carried to the server
f3927184a2 10-12 01GJidg5 [NAV demo-scripts] CMC eighth launch app
4b77deb891 10-12 017d4r3C [DW] section check states record requirements
bb166714ad 10-12 017d4r3C [DW] claims engine at save
0365b4eae2 10-12 017d4r3C [DW] self-consistency check
8c48d5db5f 10-12 01TTTQ1h [DW RSE] machine-authorship claim needs a vouching record
86a0c3766d 10-13 01KZK3jg [NAV surface-actions +103] eCTD Compile/transmittal actions
30e80b571f 10-13 JMPS [DW CT] AnA remedies: authoring-remedy blocks -> RemedyCard -> EditorBridge.propose; oversight prompts
0bf71a61ed 10-13 JMPS [DC DW(-539) RSE CT] private Workbench AnA input deleted; remedies render in CT
18df9a0b8d 10-13 JMPS [CT] editor source access, saved AnA context
0e4ccf46f4 10-13 JMPS [DW RSE STR] stored workflow drafts governed; reserveWritableSection in section save
92864923bc 10-14 JMPS [DW RSE] citation verification, full source catalogue
14362ef006 10-14 JMPS [DW STR ARS new] per-document view-ACL read scope for other readers
2ae0b1cb5a 10-14 JMPS [DC DW ARR] ARR exports acceptedSectionText (saved-document critique, QMS training)
0f34e50cdd 10-14 JMPS [DW] onboarding discovery
49dba3d214 10-14 JMPS [DW] IND pyramid templates
2c299974d4 10-14 JMPS [DW RSE SUG] proposal receipts, getProposalState/canPropose, safe retries
4c5546cec1 10-14 JMPS [DW] IND template context in AnA review
404e94efc2 10-14 JMPS [DW ARS] ARS actor binding + org-level documents
9c266724f7 10-14 JMPS [STR] Data Room integrity, AnA source access
55c252aad9 10-14 JMPS [DW] open assigned tasks directly
2df2adde85 10-14 JMPS [DW] creation/recovery guards
a76a50aec6 10-15 01TzCCfq [NAV] inconsistency gate is the server's
dc8746a037 10-15 01SuVLo2 [STR] open document's type/requirements reach turn
5288c0722d 10-15 01SuVLo2 [STR] surface states document type
9305fbf462 10-15 011DpxUy [DW] F22b outline is the doc's filing
d25f1ac3d7 10-15 01TzCCfq [NAV demo-scripts] no credentials/seeded scores
f304c87d96 10-15 Claude(no trailer) [STR +194-75] "land current work"
2aa766a76c 10-16 Claude(no trailer) [STR] explicit read-only turns enforced
1ea8ea2038 10-16 Claude(no trailer) [STR] no drafting suggestions after read-only
9bd3ee7345 10-16 JMPS [ART] per-call admitAnaProjectScope replaces resolveOpenProgram; request-scoped RLS client
1e18cdd49a 10-17 01F252Ci [NAV test] communication triage; readiness folded into Submission Center
dc42797cbb 10-17 01F252Ci [CT] store consolidation 1-2: AnA drafts land in authoring
5d76f2b6a9 10-17 JMPS [DC DW] creation outcomes; DC record read moved to documentRecordRead.ts
2d71b5e5b9 10-17 JMPS [DW] saved program identity check
e1f3fd425e 10-17 c2c [DW STR] audited remedies
ad372567d2 10-17 JMPS [DW] build documents/sections in the existing editor
82839d3860 10-18 JMPS [DW] lint ratchet
e62320e0a9 10-18 JMPS [DW] assembly from selected sources
6562dd67ae 10-18 JMPS [DW] source-handoff retry
3cae08d236 10-18 JMPS [DW] reuse saved assembly refs
23f8f0bf5e 10-18 01B3Zfcd [CT] OCR coverage honest
0308ee257d 10-18 011e42DE [NAV] agency answer approved by signature
67d96c0601 10-20 c2c [DC STR] audited launch handoffs
5153f62c8e 10-21 JMPS [STR] passage round bodies
7780de83f1 10-21 JMPS [STR] strict raw tool-round handoff
5bf4aef01a 10-21 JMPS [DC DW] authoring-to-Vault filing identity
1ae74ba2e1 10-22 011DpxUy [DW] F22b focus on opened document
c7af50d15b 10-22 01T2wooC [NAV index] F18 records
```

## D. What converged on, replaced or deleted this lane's work

**Deleted:** none of this lane's files. `git log --all --diff-filter=D` on the lane paths returns nothing. Nearby deletions:
- `0bf71a61ed` removed the Workbench's private AnA input, which dates from `c402dbb6b7` (2026-09-21). The commit names its replacement path as ConversationThread → DocumentCanvas → DocumentWorkbench, proved by `ci:canvas-path`.
- `981c27b3a7` removed `mdx/hooks/useSectionSave.ts`.

**Replaced:** in `authoring-read-tools.ts`, the scope and budget code was swapped. `9bd3ee7345` uses `admitAnaProjectScope` (`authoring-read-tools.ts:54`, `:308`) where it used `resolveOpenProgram`. `6df7678509` uses the shared `RESULT_BUDGET`/`fitReadWindow` where it had its own bisection.

**Converged onto this lane's work:**
- `30e80b571f` is the first production caller of `EditorBridge.propose` and `proposeReplacement`. Its design note (`EDITOR_INTEGRATION_2026-10-13.md`) says the bridge "has no production caller".
  - AnA writes fenced `authoring-remedy` blocks with `sectionId`, `baseSha256`/`baseUpdatedAt`, `quote`, `replacement` and optional prefix/suffix (`shared/authoring/remedies.ts`).
  - They are rendered by `AuthoringRemedies.tsx` → `ConversationThread.tsx:378-379` and `:457`.
  - The prompts (`authoringOversight.ts:3-4`) tell AnA to call `list_authoring_outline` and `read_authoring_section` first.
- `authoring-read-render.ts` is now imported by `saved-document-critique.ts`, `qms/training-content.ts`, `authoring-from-draft.ts` and `authoring.router.ts:75`.
- `DOCUMENT_STORE_CONSOLIDATION.md:16` names `authoring_documents`/`authoring_sections`, the store the read tools read, as the one store for editable drafts.

**Open plan steps at HEAD:**
- **Step 2 (tools offered):** open.
  - `stream.ts:2111`/`:2139` still pass `asStr(authoring_context)`, which is undefined for the object.
  - The three tools are pinned neither in `stream.ts:2112-2131` nor in `send-message.ts:813`, and are not in `ALWAYS_ON_TOOLS` (`tool-selection.ts:31-50`).
  - Partial mitigation: `documentType` now comes from `openDocumentLabel` (`dc8746a037`), earlier tools are carried forward (`0d2537a864`), and the oversight prompts name the tools.
- **Step 3 (navigation by id):** open.
  - The `navigate_to` target `authoring` takes only `authoringDocType` (`shared/navigation/index.ts:164-165`).
  - `authoring.open-document` works by title and `authoring.open-section` by code (`surface-actions.ts:339-365`, unchanged since `b66a625969`, 2026-08-24).
  - Only client-side `EditorBridge.openSection(sectionId)` exists (`DocumentWorkbench.tsx:998`, added by `30e80b571f`).
- **Step 5 (harden the save):** partly done by others.
  - Done: the section is reserved and locked with `FOR UPDATE` inside the transaction (`0e4ccf46f4`, `83fe486112`; `authoring.router.ts:2281`/`:2287`).
  - Still open: `expectedUpdatedAt` is compared against a pool read taken before `BEGIN` (`:2002`, `:2044-2061`), and the `UPDATE` has no `updated_at` predicate (`:2204-2209`).
  - Not found: the pending-`<ins>` exclusion in `lineage-gate.ts` (grepped for pending, `<ins`, tracked, insertion).
- **Step 6 (`propose_section_edit`):** no such tool; the name appears only in docs. It was superseded by the remedy protocol above. No server tool checks a remedy before it renders: the shared parser checks shape only, and every other check happens in `EditorBridge.propose`.

**Divergences to resolve:**
1. **Two read-access rules.** `authoring-read-scope.ts` (`14362ef006`) applies the per-document `decideAuthoringPermission('view')` check for review, source-usage, leaf-evidence and assembly readers. AnA's authoring-read tools do not apply it (`authoring-read.ts:22-26`). `AUTHORING_CURRENT_ACCESS_AND_HANDOFF_2026-10-16.md` records this as an open policy question.
2. **A second whole-document reader.** `critique_document`'s saved-record path (`saved-document-critique.ts`, `2ae0b1cb5a`) pages authoring content with its own offset/snapshot scheme alongside `read_authoring_section`.
3. **Filing-store reader still active.** `read_governed_document`/`list_governed_documents` (`AnaToolExecutor.ts:20982`, `:21032`, present since `126eb88bdb`, 2026-07-03) read the filing outline; `dfe94a3002` changed it today.

Plan file: /home/user/ClinicalSageAI-2-replit/docs/evidence/D2-ANA-DOCUMENT-AWARENESS/2026-10-01/0-survey-critic-and-plan.md
Board: /home/user/ClinicalSageAI-2-replit/docs/work-orders/README.md
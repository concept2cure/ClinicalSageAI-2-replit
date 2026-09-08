# AnA UI Validation Report — 2026-09-06

**Phase 7–8 of the AnA UI Master Work Order.** Evidence for `docs/plans/ANA_UI_CONVERGENCE_WORK_ORDER_2026-09-06.md`. Measured in a real browser (Playwright over the pre-installed Chromium 1194) against the Vite dev server on the tree at `874a8a26`, signed in through `POST /api/auth/dev-login`. Raw measurements: `docs/reports/evidence/ana-ui-2026-09-06/*.json`; screenshots referenced below are in the same directory.

## What changed

| File | Change |
|---|---|
| `client/src/concept2cure/v2/styles/app-v2.css` | ≤900px: an open AnA rail is a fixed right-side drawer (`min(380px, 92vw)`) over `.ana-scrim`; the grid gives its third column up; desktop rules byte-identical |
| `client/src/concept2cure/v2/V2App.tsx` | renders `.ana-scrim` (tap closes); Escape closes the rail drawer at ≤640px and the AnA drawer at ≤900px |
| `shared/navigation/index.ts` | `communication-center` is a `navigate_to` target |
| `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx` | last literal `#d97757` in `v2/` → token |
| `scripts/audit-ui-authority.ts`, `config/ui-surface-registry.json`, `package.json` | the authority audit rewritten for the real shell and wired as `npm run audit:ui-authority` |
| `tests/ui/ana-rail-phone-drawer.test.ts` | pins the drawer rules; failed 4/4 before the rule existed |

**Legacy shell files demoted or removed:** none remained to demote (see the audit §Q2). **Rail, account menu, serif chrome, accent and palette:** unchanged, per the 2026-07-28 product decision.

## Widths and flows tested

Seven widths × eleven surfaces = 77 pages, rail collapsed (the shell's default), AnA rail closed: home, conversation-thread, projects, project-home, communication-center, apps, tasks, submission-center, review, document-authoring, biostatistics. Then the same four surfaces (home, projects, tasks, communication-center) at 834, 768, 430 and 390 with the AnA rail **open**, before and after the fix.

### Full walk — rail closed (`full-walk-metrics.json`)

| Check | Result |
|---|---|
| Pages that rendered the shell (`.c2c-v2.shell`) | 77 / 77 |
| Pages with horizontal overflow (`scrollWidth > viewport`) | 0 |
| Composers rendered outside the viewport | 0 |
| Uncaught page errors | 0 |
| Rail buttons per page | 20 (5 segment toggles + 15 destinations; the flag-gated CRL library is absent in this environment) |
| Grid at 1440 / 390 (rail collapsed, AnA seam) | `56px 1352px 32px` / `56px 302px 32px` |
| Editor and thread (`ownsConversation`) at 1440 / 390 | `56px 1384px 0px` / `56px 334px 0px` — the AnA column is 0, as designed |

Every surface reached its own `<h1>` at every width (Home: greeting; Projects; Project home; Communication center; Apps catalog; Task board; Submission center; Review & approval; Biostatistics; the thread and the editor render no `h1` by design).

### AnA rail open — the defect and the fix (`before-ana-metrics.json`, `after-ana-metrics.json`)

| Width | Before: grid columns | Before: content column | Before: AnA composer | After: grid columns | After: content column | After: AnA drawer |
|---|---|---|---|---|---|---|
| 834 | `56 398 380` | 398px | on screen | `56 778 0` | 778px | 380px fixed drawer over scrim |
| 768 | `56 332 380` | 332px | on screen | `56 712 0` | 712px | 380px drawer |
| 430 | `56 0 380` | **0px** | on screen | `56 374 0` | 374px | 380px drawer |
| 390 | `56 0 380` | **0px** | **off screen** (past the right edge) | `56 334 0` | 334px | 359px drawer (92vw) |

Screenshots: `before-ana-390-tasks.png` (composer's send control cut off at the right edge) vs `after-ana-390-tasks.png` (drawer with scrim, composer whole); `before-ana-430-home.png` vs `after-ana-430-home.png`; `after-ana-768-home.png` (tablet: drawer over the landing composer).

## Flows

| Flow (§18.2) | Proof |
|---|---|
| New general chat in one click | Home composer seeds `conversation-thread` (`Surfaces.tsx:send`); rail composer streams in place (`Shell.tsx:1122`) — both rendered at all seven widths |
| New project chat in one click | `ProjectHome.tsx:832-848` composer → `openThread()`; the project-home surface rendered at all widths (honest "No project selected" with no program in this database) |
| Resume recent chat | `conversation-thread` rendered at all widths; thread history is the surface's own state |
| File attach from composer | real `POST /api/chat/upload` on the rail, thread and home composers (`useChatUpload`); the file input is present in the walk's DOM at every width |
| `@app` invocation | **not present** at the 2026-09-06 walk — escalated (E3). Built 2026-09-07; see the addendum. |
| Project context visible | TopBar breadcrumb + `readShellProject()`; the walk's breadcrumb text carried the segment and surface on every page |
| Communication Center routes into work | the surface renders (FDA loop, inbox, meetings, profiles); AnA can now `navigate_to` it. It is the agency loop, not the §10.4 inbox/tasks/reviews router — recorded in the work order. |

## Regression (§18.5)

| Check | Result |
|---|---|
| Editor opens | `document-authoring` rendered at all seven widths (`data-editor="true"`, AnA column 0) |
| Artifact lifecycle reachable | `review` ("Review & approval") and `submission-center` rendered at all widths |
| Review reachable | ✓ |
| Submission reachable | ✓ |
| Dead routes | none: every `/concept2cure/<surface>` resolved to its surface; ZenRouter's catch-all redirects the rest |
| Shell escape | none: all 77 pages rendered inside `.c2c-v2.shell` |
| Contract suites | `tests/ui` (one-shell, surface-registry-coverage, token-authority, shell-kit-lazy, ana-rail-phone-drawer), `shared/navigation`, `tests/ci/no-ghost-globals`, `tests/ci/unreferenced-modules` — green |
| Gates | microcopy, catalog-copy, compliance-claims, design-system (no spring/bounce), shell-css-collisions (baseline 22, no new), and the full pre-push set — green on push |

## `config/ui-surface-registry.json`

Created. 7 shell files, 5 nav files, 3 token files, 11 views, 2 hosted former apps, 9 legacy files (all `deleted`, all verified absent), 5 destinations with their reachability. `npm run audit:ui-authority`: 46 checks, 0 failures (shown failing on three findings first — `docs/reports/ui-authority-audit-2026-09-06.md`).

## Remaining gaps, honestly

- ~~Product landing is not conversation-first~~ — done 2026-09-07 (addendum).
- ~~No inline `@app` autocomplete~~ — done 2026-09-07 (addendum). ~~Slash-command autocomplete is still not built.~~ — done in the second pass (addendum 2).
- **Five composers, not one** (§10.1). Measured 2026-09-07: the shared pieces are the `useChatUpload` and `useAppMentions` hooks; the chip markup is not duplicated (it exists only in the rail), so no extraction was made. Remaining scope recorded in the work order (E2).
- **IA and typography** (§4, §12): sixteen rail destinations, serif on four chrome classes, terracotta accent on a warm-cream palette — all retained by the 2026-07-28 decision; re-opening is E4.
- **Browser comparison against ChatGPT** was not performed: no reference instance is reachable from this environment. Validation is against the design specification.
- **Database**: the walk ran against an auth-only local schema (Drizzle push fails on this tree's known FK issue; pgvector is not installable here). Every surface therefore rendered its honest empty or failed-read state for project data, which is what these checks needed; it is not a data-path validation.
- **Widths above 640 with the rail expanded** were not walked (the shell defaults to a collapsed rail); the rail's own drawer rule is unchanged from before this pass.

## Addendum 2026-09-07 — E1 and E3 delivered, E2 measured

Verified with the unit and contract suites (25 files, 233 tests green), scoped `tsc` and `eslint` on the touched files. The browser walk was not repeated; the changes are behavioural and are pinned by tests that were written to fail first.

### E1 — conversation-first project landing, with real resumable threads

| Piece | What it does | Proof |
|---|---|---|
| `server/services/chat-thread-helpers.ts` | `getOrCreateThread` stores the shell's program UUID in `chat_threads.metadata.programId` (`project_id` is an integer column the UUID never fit, which is why nothing could list a project's threads). No migration. | `threads-program-list.test.ts` |
| `server/routes/chat/threads.ts` | `GET /api/chat/threads?program_id=<uuid>&limit=` — org-scoped, first user message as the title, newest first; non-UUID → 400 `THREAD_PROGRAM_INVALID`; no org → `[]`; missing store → 503 (a failure, never an empty). | `threads-program-list.test.ts` (5) |
| `server/routes/ana-ri/stream.ts` | passes the program key at mint time | read |
| `surfaces/ProjectHome.tsx` | composer leads the main column; "Conversations" lists the program's threads and a click sets `window.C2C_CONVO = { id }` and opens `conversation-thread`; honest empty / failed-read states; readiness ring moved to the aside | `projectHomeConversations.test.tsx` (3) |

### E3 — `@app` in the composer

| Piece | What it does | Proof |
|---|---|---|
| `shared/navigation/callable-apps.ts` | the vocabulary: module-group `NAVIGATION_TARGETS` plus four global tools; `parseAppMentions` (skips e-mail-like `@`, each app once), `searchCallableApps` | `callable-apps.test.ts` |
| `client/src/concept2cure/v2/appMentions.tsx` | `useAppMentions` + `AppMentionMenu`: `@` at start/after whitespace opens a `role="listbox"`; ↑/↓, Enter/Tab insert `@<label> `, Escape closes; while open, Enter chooses instead of sending | `appMentions.test.tsx` (hook via a host; wiring pinned by source for `Shell.tsx`, `ConversationThread.tsx`, `Surfaces.tsx`) |
| `server/services/ana-ri/invoked-apps-block.ts` | server-side parse of the sent text: `=== INVOKED APPS` block (labels and ids only, the person's words are not echoed), tool-selection hints, self-drive pins (`list_app_screens`, `navigate_to`, `list_screen_actions`, `act_on_screen`); cap of six | `invoked-apps-block.test.ts` (4) |
| `chat-context-builder.ts`, `stream.ts` | block appended to the system prompt; hints and pins fed to `selectToolsForTurn` | read |

The client asserts nothing about "which app": it only inserts the label. A mention typed by hand in any composer, or sent by the API, resolves identically on the server.

### E2 — measured, not extracted

`grep` over `v2/` shows the attachment-chip markup (`.ana-files`, `.ana-file`) in `Shell.tsx` only. The thread, home and eCTD composers render their own chips and send controls over `useChatUpload`; the project-home composer seeds and navigates. With `useAppMentions` added, the shared behaviour is entirely in hooks and there is no identical markup to lift, so no `Composer` component was created. Remaining scope is stated in the work order (E2).

### Not done at the first pass

- Slash-command (`/`) autocomplete — built in the second pass below.
- ~~Browser re-walk of the project landing with a program present: this database has none.~~ — done in the third pass (addendum 4), against a seeded program.

## Addendum 2 — 2026-09-07, second pass: one vocabulary, slash autocomplete, and the suite made green

### The duplicate `@app` path, removed

The first pass added a label-based `@app` parser beside a server path that already existed and was not found in the audit: `message-intent.ts` recognised ten short ids (`@biostats`, `@vault`, `@510k` …) at the start of a message, pulled enrichment data for them, and injected its own "App Context" header. Two vocabularies for one feature is the thing the working agreement forbids, so they were merged:

| Piece | Now |
|---|---|
| `shared/navigation/callable-apps.ts` | the one vocabulary; each app answers to its label, its navigation id and short aliases (the ten the server honoured, mapped onto real screens — `biostats` → `biostat-workbench`, `510k` → `device-510k`, `ectd` → `ectd-coauthor` …); parsing is longest-handle-first anywhere in the text; `stripAppMentions` removes the tokens |
| `server/services/ana-ri/message-intent.ts` | `KNOWN_APPS` and `detectAppMention` derive from it; `APP_ENRICHMENT_MAP` is keyed by navigation id and pinned to real apps by test |
| `server/services/ana-ri/context-enrichment.ts` | every invoked app contributes enrichment; the prompt block is the shared `buildInvokedAppsBlock`; a slash command and a mention can coexist |
| `server/services/ana-ri/chat-context-builder.ts` | the first pass's separate block append removed (that builder has no route consumer; the enrichment path is the live one) |

Pinned by `callable-apps.test.ts` (aliases, handle precedence, uniqueness across ids and aliases — the last one found a real collision, `quality`, which was dropped), `message-intent.test.ts`, and the existing `invoked-apps-block.test.ts`.

### Slash autocomplete

`SUPPORTED_SLASH_COMMANDS` (79 commands) moved verbatim to `shared/ana/slash-commands.ts`, with one line of copy per command typed as total over the tuple, and the parser imports it — `slash-commands.test.ts` asserts the server list *is* the shared tuple and every command parses. In the composer, `/` as the first character of the draft opens the same menu component listing those commands (`appMentions.test.tsx`: `/pow` → `/power `, Enter inserts rather than sends, a command followed by a space closes the menu). The `+` menu entry "Slash commands" now seeds `/` into the composer and focuses it.

### Suites repaired

The full run had five failing files, none caused by the first pass's diff and all left red by earlier commits:

| Suite | Cause | Fix |
|---|---|---|
| `anaDrivesScreens` (Vault search) | Vault search became server-backed; the test's mock never answered `GET /:id/search` | the mock answers the search contract from the same two documents |
| `schedule-of-activities` ("defensible design stays low risk") | the new missing-data (`MIS-001`) and safety-population (`POP-004`) gates fire on the fixture | the fixture now carries a missing-data strategy and a Safety analysis set — what a defensible design has |
| `retention-cron` (5) | the sweep summary gained `heldByLegalHold` for the legal-hold fix; expectations not updated | expectations carry `heldByLegalHold: 0` |
| `mdx-submission-gateway-transmit-bundle-guard` (25) | the transmit route gained `requireEditorAccess`; the harness user had no role | the harness acts as `admin`, as the sibling routes test does |
| `routes/concept2cure` (signature) | the route now re-verifies the signer's password (§11.200); the test sent none | the deps are stubbed, the test signs with the right password, asserts the persisted method is derived, and a wrong password is a 401 |

Also fixed: `hostilePayloadProbe > biostatistics` (a first-pass defect — the bridge list crashed on rows without fields; it now uses the repo's `isRowsWith` guard).

Full typecheck: clean. Jest half of `npm test`: 6 suites, 37 tests green.

## Addendum 3 — 2026-09-07, the composer menus in a real browser

The `@app` and `/command` menus had been proven only in jsdom, and the server's read-back of a mention only in unit tests. Both were checked against the running app (Vite dev server on the pushed tree, Chromium 1194, signed in through `dev-login`, nothing mocked). Script and measurements: `evidence/ana-ui-2026-09-06/composer-menus-walk-2026-09-07.mjs`, `composer-menus-2026-09-07.json`; screenshots `composer-landing-at-menu-2026-09-07.png`, `composer-rail-slash-menu-2026-09-07.png`, `composer-rail-plus-slash-2026-09-07.png`.

| Step | Measured |
|---|---|
| Home composer, type `@bio` | `role="listbox"` "Apps", two options (Biostatistics designer, Biostatistics workbench), first active, inside the viewport |
| ↓ then Enter | draft becomes `@Biostatistics workbench ` |
| Rail composer, type `/pow` | `role="listbox"` "Commands", one option `/power` with its summary |
| Tab | draft becomes `/power ` |
| `run /pow` | no menu — a command counts only as the first word |
| `+` → "Slash commands" | draft becomes `/`, the command list opens with the first eight commands |
| Send `@biostats size a two-arm superiority study` | the stream request carries the text verbatim |
| Page errors | none |

### Two defects the browser found and jsdom had not

1. **The app menu reopened after an insertion.** The caret landing after `@Biostatistics workbench ` fires a select event; the token reader saw the completed label as a query and offered its own exact match again. A completed mention (label plus trailing space) is now finished text (`appMentions.tsx`, `mentionTokenAt`); pinned in `appMentions.test.tsx`, shown failing on the old hook first. Re-run in the browser: no menu after Enter.
2. **A mention with no project open was never read.** `enrichContextForChat` returns early on the project-less path — exactly the front-door composer's situation — before the mention section ran, so the model was never told which app was invoked and the token was never stripped. The project-less branch now emits the shared INVOKED APPS block, the `app:<id>` source, the rewritten message and `detectedAppMention` (data enrichment still needs a project). Pinned in `ana-ri.test.ts`, shown failing on the old code first; also run as a one-off against the real function outside vitest: sources `app:biostat-workbench`, rewrite `size a two-arm superiority study`, block names `Biostatistics workbench (id: biostat-workbench)`.

### What this environment could not prove

The stream route returned 503 `GATEWAY_UNAVAILABLE` in 18 ms — no AI provider is configured here — so the model was never called and the prompt block's arrival at the model is proven by the enrichment tests and the one-off run, not by a model turn.

## Addendum 4 — 2026-09-07, E1 walked with a real program, and resume was broken

The report had said a browser walk of the project landing was impossible because the local database held no program. That was a gap, not a fact about the feature: a program and three conversations were seeded into the local dev database (two on the program, one on a different program, so scoping is exercised) and the landing was walked against the running app. Script, measurements and screenshots: `evidence/ana-ui-2026-09-06/project-threads-walk-2026-09-07.mjs`, `project-threads-2026-09-07.json`, `project-threads-landing-2026-09-07.png`, `project-threads-resumed-2026-09-07.png`.

| Step | Measured |
|---|---|
| `GET /api/chat/threads?program_id=<uuid>&limit=8` | the program's two conversations, newest first, each titled by its first user message; the third conversation (different program) absent |
| `program_id=42` | 400 `THREAD_PROGRAM_INVALID` |
| Landing | both rows under `pj-threads`, "Sep 7 · Resume" / "Sep 2 · Resume"; no empty state, no error state |
| Layout | readiness ring in the aside, not the main column; composer precedes the capability grid |
| Click a row | `window.C2C_CONVO = { id: 'ana-ri_seed_1' }`, navigates to `/concept2cure/conversation-thread`, which reads `/api/chat/threads/ana-ri_seed_1/messages?limit=100` |
| Resumed thread | **both turns render** — the user question and the assistant reply |
| Page errors | none |

### The defect this found: resume restored nothing

The first walk listed and navigated correctly and then showed an empty conversation. The messages endpoint answered `{"messages": [], "error": "Thread not found"}`.

Two thread stores are live in this codebase: `chat_threads`/`chat_messages` (AnA RI — every thread the rail, the thread surface and the project landing mint) and `ai_threads`/`ai_messages` (submission chat, evidence-ask). `GET /threads/:id/messages` verified the thread against **`ai_threads`** and then read the transcript from **`chat_messages`**. So it was wrong in both directions: every AnA thread was "not found", and an `ai_threads` thread passed the gate only to have its real transcript (in `ai_messages`) rendered as an empty conversation. `PATCH /thread/:id` had the same mismatch, which is why "move a conversation to a project" could never reach an AnA thread.

The store is now **resolved** once, org-scoped, and each handler acts on the store that actually owns the thread (`resolveThreadStore` in `server/routes/chat/threads.ts`). Two further corrections came with it:

- The 404 body no longer carries `messages: []`. A thread that cannot be read is not a thread with nothing in it, and a 404 carrying an empty list is exactly the shape a caller reads as "no messages" — the rule the same file's catch block already stated for a failed read.
- `PATCH` refuses a program UUID at `chat_threads.project_id` (an INTEGER column) with a 400 instead of a 22P02 surfacing as a 500. The check uses `Number()`, not `parseInt()`, which returns `0` for `'0f3c1a2b-…'` and would have written the thread to project 0.

Pinned by `server/routes/chat/__tests__/thread-messages-store.test.ts` (6 tests). Shown failing on the old gate first: five of the six fail, including the 404 that carried an empty transcript.

### Note on the walk

The seeded rows live only in this container's local database; nothing was seeded into any deployed environment, and no seed file was added to the migration set.

## Addendum 5 — 2026-09-07, the other half of the loop: minting and continuing

Addendum 4 proved a project's conversations can be listed and resumed. The write half was still unproven: a conversation STARTED with a project open must be minted carrying that program, or the project's list can never find it again, and a RESUMED conversation must continue its own thread rather than mint a second one. Walk: `evidence/ana-ui-2026-09-06/project-send-walk-2026-09-07.mjs`, measurements `project-send-2026-09-07.json`.

| Send | Captured request body |
|---|---|
| New conversation from the project landing composer | `project_id` = the open program's UUID, `thread_id` absent → the server mints a thread carrying the program |
| Continuing a resumed conversation | `thread_id` = `ana-ri_seed_1`, `project_id` carried → the same thread continues; no second thread |
| Page errors | none |

The mint itself cannot be observed in this environment — the stream route resolves the thread well after its AI-provider check, which fails closed at 503 with no provider configured — so the server half is pinned by test instead, where it previously had none at all: `server/services/__tests__/chat-thread-program-key.test.ts` (5) covers that `getOrCreateThread` writes `metadata.programId` lower-cased when a program is open, writes no metadata for a numeric or absent project (the integer `project_id` column is a different channel), never re-homes an existing thread, and that the stream route passes the request's project id through `programIdForThread`. Shown failing first by removing the metadata write: the mint test fails on it.

With addendum 4 this closes the loop end to end — mint → list → resume → continue — with the client half measured in a browser and the server half pinned by tests.

# AnA memory folds into the conversation: "What AnA remembers" beside it (D2, 2026-10-29)

**Row:** D2 (`docs/LAUNCH_DEFINITION_OF_DONE.md`). The founder's direction of 2026-10-29: "We are moving most 'app' into core functionality and away from any out of process 'app'."

**Plan:**
- the placement map, `.design/client-journey/FUNCTION_PARITY.md`, "Into the conversation (`conversation-thread`)", "From `ana-memory`" (8 items, two real today);
- the common fold checklist in `docs/design/DEVICE_FOLDS_2026-10-29.md` (from `2168fd56`);
- the deletion rule in `CLAUDE.md`'s working agreement.

**The work, named for what it is:**
- *reach* the two real reads of the `ana-memory` screen (how AnA is tuned to the person, and the "Things I got wrong" ledger) from the conversation, in one read-only panel;
- *complete* the profile read (`GET /api/mdx/ana/memory/profile`) with the project-scoped profile, which every turn reads and the screen never did;
- *fix* that read's absent-store answer, which was the same `null` as "no notes yet";
- *fold* `ana-memory` into `conversation-thread` (Part 2): delete the screen, its two suites and the six routes only it called, alias the id to the conversation, and take it off every list.

Nothing is built beside an existing implementation. No route was added: the one profile route gained the project-scoped row, behind the conversation's own admission. The panel is the retired screen's left column, moved, on the shell's existing drawer and the screen's own styles.

**The replacement, by path** (CLAUDE.md working agreement):
- `client/src/concept2cure/v2/WhatAnaRemembers.tsx`, mounted by `client/src/concept2cure/v2/surfaces/ConversationThread.tsx`;
- proven reachable by `client/src/concept2cure/v2/__tests__/conversationRemembers.test.tsx` and `client/src/concept2cure/v2/__tests__/foldAnaMemory.test.ts`;
- served in production under the conversation's claim, proven by `ci:launch-scope-api`, `launch-scope-api-gate.test.ts` and `mdx-ana-memory-profile.pglite.test.ts`.

## What already exists

Read at `66efa6179` (part11-console's fold on trunk). Line numbers are at that commit.

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| The `ana-memory` screen | `client/src/concept2cure/v2/surfaces/AnaMemory.tsx` | Left column: AnA's notes, the four tone settings, the latest emotional read, the ledger (:205-240), over `GET /api/mdx/ana/memory/profile` (:107). Right column: memory atoms from `client_memory_entries`, filters, Verify, superseded rows (:242-297). | Never read the project-scoped profile. Labelled `interaction_count`, which counts turns, "conversations" (:194). Out of the launch shell already: `isLaunchSurface('ana-memory')` is false (`launch-scope.test.ts:174`, "shows a store nothing writes, not the memory AnA loads"); `deferred-capability-inventory.ts:43` names `conversation-thread` as where it converges. |
| The routes | `server/routes/mdx-ana-memory.ts` | `GET /ana/memory` (atoms), `GET /ana/memory/profile` (the caller's user-level row, `project_id IS NULL`), `POST /ana/memory/:id/verify`, `POST /ana/memory/:id/supersede`, `GET /ana/threads`, `GET /ana/threads/:id`, `POST /ana/threads/:id/pin`. | No project-scoped read. A missing table (42P01) answered `null`, which a screen can only read as "AnA has formed no notes". |
| The writer and the turn's read | `server/services/ana-ri/relational-profile-service.ts` | `reflectAfterTurn` (called fire-and-forget from `routes/ana-ri/stream.ts:4151`) bumps `interaction_count` once per turn on the user row and the project row, and rewrites the notes on a cadence or a signal. `loadRelationalOverlay` (from `chat-context-builder.ts:249`) reads the user row and the project row for the turn's admitted project into every turn. | — |
| The store | `migrations/20260612_ana_relational_external_intel.sql`, `shared/schema/ana-relational.ts` | One row per (organization, user, project or none), unique on `COALESCE(project_id, 0)`. On `C2C_MIGRATION_FILES`. | — |
| The turn's project admission | `server/services/ana/project-scope-admission.ts` `admitAnaProjectScope` | The stream's admission (`stream.ts:477,994`): a program UUID or an integer project id, in this organization, with one verified anchor, which the caller can open now (`canAccessReportProject` over live membership). Refusals 400/403/404/409, and 503 when the check cannot run. | No client named its codes (`ANA_PROJECT_*`: no hit under `client/src`). |
| The conversation | `client/src/concept2cure/v2/surfaces/ConversationThread.tsx` | Header: New conversation, Documents, the progress chip (:1910-1965). Right column: one of the editor, the Documents list and the progress dock (`expandedDocId`, `listShown`, `dock.open`). The project in context is `readShellProject()` (:1180), the `projectId` its own chat is given; the shell's chat (`V2App.tsx:740`) reads the same `window.C2C_PROJECT` id. | Nothing of AnA's notes. |
| Account settings | `client/src/concept2cure/v2/AccountPanel.tsx` | The person's own account in the shell's right-hand drawer, from the account menu: profile, invitations, reporting role, alerts, password, authenticator. | Has no project in context. |
| The drawer and the styles | `journey-v2.css:455-470` (`de-*`, the right-hand drawer); `ana-v2.css:225-260` (`amem-*`, the screen's profile and ledger styles); `useDialog.ts` | The drawer the Account panel and 36 dialogs use; focus, Tab trap, Escape, focus back to the opener. | — |
| The read plumbing | `client/src/concept2cure/v2/dataConnect.tsx` | `useLiveData` (status, code, meta), `hasKeys`, `ErrorState`. | — |
| Launch scope at the API | `server/services/entitlements/launch-scope-api.ts` | Longest claimed prefix decides; an out-of-scope path is refused in production. | `/api/mdx/ana/memory` was claimed by `ana-memory` alone, so a launch screen calling the profile read would be refused (`ci:launch-scope-api` said so on this change's first run, `gates.txt`). |

### Searches run

- `AnaMemory|ana-memory|anaMemory` across `client`, `server`, `shared`, `scripts`, `tests`, `db`, `migrations`: 23 code files. Every one is handled in Part 2 or is a historical record.
- `memory/profile`: the route, the screen and the screen's two suites only.
- `ana_relational_profiles`: the service, the route, the schema, the migration, the purge list and the migration-set comments.
- `relational|remembers|acknowledged_mistakes|tone_calibration` under `client/src`: the screen and its suites only. No other reader of AnA's notes exists in the client.
- `reflectAfterTurn|loadRelationalOverlay`, `admitAnaProjectScope`, `'conversation-thread'`, `AccountPanel|onAccount`, `ANA_PROJECT_` under `client/src`, `useDialog`, `de-bd`, `amem-`.

### Deletion history (CLAUDE.md working agreement)

`git log --all --diff-filter=D` on `*AnaMemory*`, `*anaMemory*`, `*ana-memory*`, `*AnaRemembers*`, `*anaRemembers*`, `*RelationalProfile*`, `*relational-profile*`, `*WhatAnaRemembers*`, `*AnaTuning*`, `client/**/*Memory*`, `client/**/*memory*`, `server/routes/*memory*`, `client/**/*Editor*` and `client/**/*Canvas*`: no hits.

**The clone is shallow** (`git rev-parse --is-shallow-repository` is `true`; history reaches back to `892739bb7`, 2026-10-22), so "nothing deleted" covers that window only.

## Where the panel goes, and why

**Beside the conversation, in the shell's right-hand drawer, opened from the conversation's header ("What AnA remembers").** Not in account settings, for three reasons:

1. **The fold lands there.** The parity map files `ana-memory` under "Into the conversation (`conversation-thread`)", and Part 2 aliases `ana-memory` to `conversation-thread`. A deep link to the retired screen lands where the panel is one click away.
2. **The project-scoped profile needs the project in context.** The conversation has one: the project its turns are sent under (`readShellProject()` → `useAnaChat({ projectId })` → the stream's `project_id` → `admitAnaProjectScope`). The panel reads the project-scoped row for that same id, through the same admission. The Account panel is account-wide and has no project.
3. **It shows what this conversation's turns read.** `loadRelationalOverlay` reads the user row and this project's row into every turn here. The panel shows those two rows.

It is a drawer, not a fourth occupant of the conversation's right column. That column already arbitrates three (the editor, the Documents list, the progress dock), and a read-only reference needs none of that arbitration. The drawer is the same one the Account panel uses, with `useDialog`'s focus handling.

## Part 1: the two real reads, reached

### Server: `server/routes/mdx-ana-memory.ts` `GET /ana/memory/profile`

- **No `project_id`:** the caller's user-level row, as before, now with `meta: { scope: 'user' }`.
- **`?project_id=<program UUID or integer project id>`:** the stream's own admission runs first (`admitAnaProjectScope(pool, { organizationId, userId, projectRef })`). On a refusal the route answers with the admission's status and code (`{ error, code }`) and reads nothing. Then it reads the caller's row for the admitted `projects.id` with `meta: { scope: 'project', projectId, projectRef }`.
- **Only the caller's rows.** `user_id` is the session's, and no parameter names a user. A `user_id` in the query is stripped by the schema.
- **An absent store** (42P01) now answers `null` with `meta.pendingStore: true` in both scopes, where it was a bare `null`.
- The SQL is static and parameterised. `ci:sql-interpolation` is unchanged.

### Client: `client/src/concept2cure/v2/WhatAnaRemembers.tsx` (the screen's left column, moved)

- **"How AnA is tuned to you":** AnA's notes, the four tone settings (Warmth, Humor, Formality, Detail; "Not set yet" where AnA has set none), the latest emotional read, and "Kept over N turns with you".
- **"For this project: <name>":** AnA's notes for this project. No tone cells here, because a turn reads tone from the user row only.
- **"Things I got wrong":** the ledger in each scope, each mistake with its correction. "Nothing on the ledger yet." when it is empty.
- **The honest states, for each read on its own:**

| State | What the panel says |
|---|---|
| Loading | "Reading AnA's notes…" |
| A failed read | "could not be read … this is not an empty memory. Try again." |
| A refused read (401, 403) | "were not read", with no Try again |
| A project the admission refuses | its own words, with no Try again |
| A project access check that could not run (503) | "could not be checked … This says nothing about the project. Try again." |
| An absent store | "not kept on this server … This is not an empty memory." |
| An answer that does not say it is this project's | not shown, with Try again |
| No row | "has not kept notes … yet", and the ledger empty |
| A row with no notes written yet | "has not written notes … yet" |
| No project open | "No project is open, so AnA reads only the notes above into this conversation." Nothing is read for a project. |

- **Read-only.** It has no control but Close, and it sends only GETs.

### The conversation: `client/src/concept2cure/v2/surfaces/ConversationThread.tsx`

- One header button, "What AnA remembers" (`aria-haspopup="dialog"`).
- One state, and the drawer mounted with `projectRef={shellProjectId}`, which is the id the conversation's own chat is given.
- Nothing is read until the person opens it.

### Launch scope: `shared/constants/ui-surface-registry.ui-v2.ts`

`conversation-thread` claims `/api/mdx/ana/memory/profile`, and only that path. The rest of `/api/mdx/ana/memory` and `/api/mdx/ana/threads` stay `ana-memory`'s, and stay refused.

### Parity: every item of `FUNCTION_PARITY.md` "From `ana-memory`"

| Item | Carried where | Proven by |
|---|---|---|
| See how AnA is tuned to me (`AnaMemory.tsx:107,208-219`) | `WhatAnaRemembers.tsx` "How AnA is tuned to you", over `GET /api/mdx/ana/memory/profile` | `whatAnaRemembers.test.tsx` "reads the caller's own notes…", "shows how AnA is tuned…", "counts turns…"; `mdx-ana-memory-profile.pglite.test.ts` "reads the caller's user-level profile…, and nobody else's" |
| "Things I got wrong" ledger, including the project-scoped profile (`AnaMemory.tsx:223-232`) | The ledger in each scope; the project's row over `?project_id=`, admitted as the turn is | `whatAnaRemembers.test.tsx` "shows the ledger…, in each scope", "an empty ledger says so"; the pglite suite's `?project_id=` cases (admitted, refused, foreign, malformed, unchecked, absent store, a colleague's row never read) |
| Organisation memory atoms (`AnaMemory.tsx:119`) | **Not carried.** Not real today: held until a writer exists. `GET /api/mdx/ana/memory` stays the retired screen's and stays refused. | the pglite suite's launch-scope cases |
| Filter atoms (`AnaMemory.tsx:243-252`) | **Not carried** (with the list) | — |
| Verify an atom (`AnaMemory.tsx:136-149`) | **Not carried** (with the list) | launch-scope case `/api/mdx/ana/memory/7/verify is not` |
| Supersede an atom, API (`mdx-ana-memory.ts:201`) | **Not carried** (with the list) | launch-scope case `/api/mdx/ana/memory/7/supersede is not` |
| See superseded atoms (`AnaMemory.tsx:282-292`) | **Not carried** (with the list) | — |
| List and pin conversations, API (`mdx-ana-memory.ts:246,288,314`) | **Not carried.** Pinning belongs on `/api/chat/threads`, if wanted. | launch-scope case `/api/mdx/ana/threads is not` |

**Also not carried, from the screen's left column and lead:**
- the headline "You and I have worked together across N conversations" (`AnaMemory.tsx:194`). It counted turns, so the panel says "Kept over N turns with you" (M16 pins it);
- "Ask what AnA remembers" (`:200`), a button that typed a question into the chat. The person is already in the conversation, where they can ask.

## Red, green, mutations (Part 1)

| | Result | File |
|---|---|---|
| Red A: the three new suites, before any product change | 17 of 19 fail. The 2 that pass pin behaviour the route already had: a user id in the query is not read, and no organization or no user is refused before any read. The panel suite cannot load, because the component does not exist. | `red.txt` |
| Red B: the panel suite against an empty stub of the component | 17 of 17 fail | `red.txt` |
| Green: the new suites and their neighbours | 10 files, 394 of 394 | `green.txt` |
| Green: every client suite that renders the conversation, and the panel suite | 41 files: 408 of 421 pass. The 13 failures are in 4 files and fail the same way with `ConversationThread.tsx` at HEAD. Left as found (causes in `green.txt`). | `green.txt` |
| Green: the entitlement and launch-scope suites | 20 files, 601 of 601 | `green.txt` |
| Mutations of the product code | 19 of 19 red. Each file was restored and hash-checked, then every file of Part 1 was hash-checked again. | `mutations.txt` |

**The new suites:**
- `server/routes/__tests__/mdx-ana-memory-profile.pglite.test.ts` (22 cases, real SQL on PGlite over the admission's own tables):
  - the caller's user row, and never a colleague's or their own row in another organization;
  - a user id in the query is not read;
  - `null` for no notes, and `pendingStore` for an absent store, in both scopes;
  - 401 and 403 without a user or an organization;
  - the project row through a UUID, an upper-case UUID or an integer id, with its scope in `meta`;
  - `null` for the caller's project row when only a colleague's exists;
  - 403 for a project the caller can no longer open, 404 for a foreign or absent one, 400 for a malformed one and 503 for a check that could not run, each having read no profile row;
  - the launch-scope verdict: the profile read is served, and the atoms, verify, supersede and threads paths are not.
- `client/src/concept2cure/v2/__tests__/whatAnaRemembers.test.tsx` (17 cases): the two reads and no user named; the tone, the latest read, the ledger per scope, the project heading, turns not conversations; every honest state in the table above; no table name on screen; a named read-only dialog that closes on Close and Escape.
- `client/src/concept2cure/v2/__tests__/conversationRemembers.test.tsx` (3 cases):
  - the header opens the panel, nothing is read before then, and it reads for the same project `useAnaChat` is given;
  - Escape closes it and returns focus to the header control;
  - with no project open, only the person's own notes are read.

**Gates** (`gates.txt`): `ci:launch-scope-api` and its selftest, `ci:undefined-css-classes`, `ci:server-error-leaks`, `ci:sql-interpolation`, `ci:tenant-resolvers`, `ci:tenant-isolation:no-regression`, `audit:repo-health:ceiling`. All exit 0. Scoped tsc: 0 errors in the change. ESLint (`eslint.txt`): no file gains a warning.

## Part 2: the fold, by the common checklist

Done on the working tree over `984913ea5`, after main's "checklist go".

| Step | Change |
|---|---|
| 1. Sources | Deleted: `client/src/concept2cure/v2/surfaces/AnaMemory.tsx`, which only `surfaceViews.ts` imported. Its two suites went too: `anaMemoryNoFixtures.test.tsx` and `anaMemoryPlainLanguage.test.tsx`. Their profile cases are carried in `whatAnaRemembers.test.tsx`: no fixture, no table name on screen, a refusal is not a failure, and a failure offers Try again. Their atom-list cases went with the atom list. |
| 2. `MdxSurfaceHost.tsx` | Not applicable: `ana-memory` was never host-mounted. |
| 3. Ids and claims | Out of `v2/surfaceViews.ts` and `ui-surface-registry.ts`. `mdx/surfaceIds.ts` never had it, only a comment, now corrected. The one prefix the conversation calls, `/api/mdx/ana/memory/profile`, moved onto `conversation-thread` in Part 1. `/api/mdx/ana/memory` and `/api/mdx/ana/threads` are claimed by nothing, because nothing serves them now. |
| 4. `registryModel.ts` | `DEEP_LINK_ALIASES`: `ana-memory` → `conversation-thread`. No `ALIAS_APPLIES`: the panel is one click from the conversation's header, and opening it on arrival would need a new surface action, which this change does not add. The id was in none of `NAV_GROUP_OF`, `NAV_HIDDEN`, `SEGMENTS.focus`, `SURFACE_ACTIONS` or `SEGMENT_MODULES`. |
| 5. Scope lists | Not in `launch-scope.ts` (it left the shell on 2026-10-08) or `mdx-project-features.ts`. Guard: `launch-scope.test.ts` "the folded AnA memory". |
| 6. Catalogue (Rule 1) | Not applicable. No catalogue row names `ana-memory` (no hit in `db/migrations/` or `migrations/`), so no migration is amended and none is appended. |
| 7. AnA | No navigation target ever named `ana-memory` (`findNavigationTarget` is undefined, and the fold guard pins that), and it registered no surface actions. |
| 8. Tours | None stopped on it. The fold guard pins that none does. |
| 9. CI | `check-ana-surface-context.mjs`: `ana-memory` off `NO_CONTEXT_NEEDED`. It was exempt and never a publisher, so `ID_BASELINE` stays 109, exact. `check-surface-discoverability.mjs`: its contextual declaration removed. `check-launch-scope-api.ts` `REAL.components`, `dump-v2-surfaces.spec.tsx` and `NO_PROJECT_DOOR` never named it. `sql-interpolation-baseline.json` loses `mdx-ana-memory.ts` (4 → 0). `tenant-resolvers-baseline.json` keeps the file, whose local resolvers remain. |
| 10. Fold guard | `client/src/concept2cure/v2/__tests__/foldAnaMemory.test.ts`, on `foldPart11Console.test.ts`'s model (5 cases). |
| Also | `shared/constants/deferred-capability-inventory.ts` loses its row, and its suite's count goes 12 → 11. `tests/ci/no-ghost-globals.contract.test.ts` loses `AnaMemory.tsx` from its walked and ported lists, and its verify case (the verify went with the screen). `launch-scope-api-gate.test.ts`: the retired paths are refused, and the profile read is served. `FUNCTION_PARITY.md` and `INFORMATION_ARCHITECTURE.md` are amended in place. Stale comments corrected: the seed `70-vault-memory-symbols.mjs`, the two kit smoke suites and the `ana-v2.css` header. |

### Routes with no remaining caller (listed, then deleted)

The retired screen was the only caller of six routes in `server/routes/mdx-ana-memory.ts`. The check was `grep -rnE "/api/mdx/ana|mdx/ana/(memory|threads)|ana/memory|ana/threads"` over `client`, `server`, `shared`, `scripts`, `tests`, `e2e` and `agents`.

| Route | Caller before | Caller after | Done |
|---|---|---|---|
| `GET /api/mdx/ana/memory` (atom list) | `AnaMemory.tsx:119` | none | deleted |
| `POST /api/mdx/ana/memory/:id/verify` | `AnaMemory.tsx:136` | none | deleted |
| `POST /api/mdx/ana/memory/:id/supersede` | none | none | deleted |
| `GET /api/mdx/ana/threads` | none | none | deleted |
| `GET /api/mdx/ana/threads/:threadId` | none | none | deleted |
| `POST /api/mdx/ana/threads/:threadId/pin` | none | none | deleted |
| `GET /api/mdx/ana/memory/profile` | `AnaMemory.tsx:107` | `WhatAnaRemembers.tsx` | kept |

**Nothing else reached the deleted routes:**
- no AnA tool calls them. `AnaToolExecutor` and `client-intelligence-memory.ts` read `client_memory_entries` directly, and still do;
- no test of a kept behaviour calls them. Their own cases in `tests/mdx-notifications-clinical-routes.test.ts` now pin a 404 that reads nothing;
- `launch-scope-api-gate.test.ts` used `/api/mdx/ana/memory` as a refused path. It is refused still: unclaimed is refused in production.

The router keeps its mount (`register-inline-routes.ts:1220`) for the profile read.

**Two references were not callers, and are left:**
- `mdx-search.ts:166` builds a result link `/ana/threads/:id`, a client path rather than the API;
- the seed `70-vault-memory-symbols.mjs` writes `client_memory_entries`, which AnA's memory services read.

**Left as found:**
- `ana-v2.css` keeps the atom list's `amem-*` rules (lead, grid, filters, atoms, superseded). `WhatAnaRemembers.tsx` now uses only the profile and ledger rules. Several of the unused ones sit inside shared dark-theme selector groups in `surface-text-ramp.css`, so removing them belongs to a CSS sweep, not this fold.
- `ci:tenant-resolvers` fails on trunk: `server/routes/mdx-qms-context.ts` (from `e00873b6e`) defines a local resolver. Neither the file nor that commit is part of this change (`gates.txt`).

## Red, green, mutations (Part 2, and both parts on the final tree)

| | Result | File |
|---|---|---|
| Red: the fold guard after Part 1, before any retirement edit | 3 of 5 fail. The 2 that pass pin the destination (Part 1) and the launch scope, which has not carried the id since 2026-10-08. | `red.txt` |
| Green: every suite that reads the registry, the alias map, the surface views, the deferred inventory, the launch scope or the router (192 files listed by grep, plus the panel, route and ghost-globals suites) | 191 files ran; 2,924 of 2,934 pass. The 10 failures are the three `authService`-mock suites already failing at HEAD (Part 1). | `green.txt` |
| Green: the change's 13 suites on the final tree (over `f83fcce03`, which touches none of this change's files) | 13 files, 427 of 427 | `green.txt` |
| Mutations, Part 2 | 8 of 8 red. Each file restored and hash-checked; P4 and P5 were re-run after the gate test's last edit. | `mutations.txt` |
| Mutations, Part 1, re-run on the final tree | 19 of 19 red | `mutations.txt` |

**Gates on the final tree** (`gates.txt`), all exit 0 except `ci:tenant-resolvers` (trunk, above):
- `ci:launch-scope` and its selftest;
- `ci:launch-scope-api` and its selftest;
- `ci:ana-surface-context` (109 exact) and `ci:surface-discoverability`;
- `ci:migration-drop-safety`, `ci:migration-set-order` and `ci:migration-deploy-path`;
- `check:catalog-copy` and `ci:program-ownership-single-source`;
- `ci:sql-interpolation`, `ci:undefined-css-classes`, `ci:server-error-leaks` and `ci:tenant-isolation:no-regression`;
- `audit:repo-health:ceiling` and `ci:unreferenced-modules`.

Scoped tsc over the change's 21 TS files: 0 errors in them. ESLint (`eslint.txt`): no file gains a warning.

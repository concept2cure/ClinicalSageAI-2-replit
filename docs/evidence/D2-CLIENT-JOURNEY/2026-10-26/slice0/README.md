# D2 — slice 0: what a client meets today that is false, locked or a dead end

The plan is in `.design/client-journey/INFORMATION_ARCHITECTURE.md`: section 8, "Slice 0", and each surface's row in
section 5. These are small items. None needs the founder's admission, and each is on a path a client reaches today.
Part 1 is commit `f17454678`. Part 2a is `a40acd714`: the main client and Admin. Part 2b is the commit that carries
this revision of the file: the device lane, Human factors and Labeling, and the fixes from an independent audit of
them (below).

## What already exists

Every item changes something that exists. Nothing is built beside it (Rule 3).

### Part 1 (`f17454678`)

| Path | What it did | What it does now |
| --- | --- | --- |
| `client/src/concept2cure/v2/appMentions.tsx` (`useAppMentions`), `shared/navigation/callable-apps.ts` | The `@` menu in AnA's composers offered every callable feature: 56 on Home locally, about forty of them outside the release. Choosing one ended on "not in this release". | It offers only what this viewer can open, by the rail's rule (`useSurfaceAvailable`). Each navigation id is checked as the surface it opens (`DEEP_LINK_ALIASES`), and the list is filtered before the eight are taken. With `LAUNCH_SCOPE_ENFORCE=on`, as in production, the Home menu offers 28. |
| `client/src/concept2cure/v2/Shell.tsx` `AccountMenu` | "Codebase coverage" sat in every member's account menu and opened a lock. It is an engineering view of the surface registry, outside the release. | It sits beside Licensing, for platform administrators only, and only when it can be opened. |
| `client/src/concept2cure/v2/Shell.tsx` `CmdK` | "Jump to" listed the first eight registry rows. A search listed every registry surface, with those outside the release shown as locks. | "Jump to" lists the places in the rail's order. With a project open, it lists the project's six steps. A surface outside the release is not listed. |
| `client/src/concept2cure/v2/surfaces/ProjectSide.tsx` | Author's Memory and Instructions cards said "No project memory yet" and "No custom instructions yet" on every project. | They say this page does not read them yet. |

### Part 2

**Main client (`v2`)**

| Path | What it did | What it does now |
| --- | --- | --- |
| `v2/programAction.ts` `OPEN_PROGRAM_SURFACE` | "Choose or create a project", the action on every CMC and device empty state, opened Mission Control, which is outside the release. | It opens Projects, where a project is opened and New project creates one. |
| `v2/registryModel.ts` `DEEP_LINK_ALIASES` | `biopharma` resolved to `program-journey`, outside the release. AnA was refused, and a link opened a lock. | It resolves to `projects`. `intelligence` and `safety` keep their targets; see "AnA's navigation" below. |
| `v2/fixtures/conversation-thread-data.ts` `CT_LINKMAP` | A conversation's "evidence" chip opened `evidence-search` and a "module" chip opened `dossier-map`, both locks. | "evidence" opens the Vault and "module" opens the project. No production path sets a turn's chips today, so this guards the first producer. |
| `v2/surfaces/ProjectHome.tsx` (Author's Documents) | "Protocols (organisation-wide)". Protocols carry the project's key since `20261014_protocol_program_scope.sql`. | "Write the protocol in the protocol workspace". |
| `v2/surfaces/AdminAccess.tsx` | "Grant access", "Edit scopes", every settings row and "Audit a member" only sent AnA a sentence. No AnA tool grants project access, edits a role's scopes, changes an organization setting or exports a member's activity. The header said every action "emits a 21 CFR Part 11 audit entry". | Each one now reaches the real thing or is not offered:<br>• Auditing opens the audit trail. From a member's panel it is searched for that member (`audit-trail.search`).<br>• The member's panel says project access is granted on the project's Plan, under Project sharing (`ProjectTeamSharing`).<br>• A role's scopes are shown, not edited.<br>• Settings are shown as they are set.<br>The blanket Part 11 claim is gone. AnA's list of what it can do on the page says the same. |
| `v2/surfaces/HumanFactors.tsx` | `GET /api/human-factors` returns the organization's first file (`files[0]`). The page showed its device, scenarios, critical-task gate and IEC 62366-1 elements as this project's, and told AnA about them. "Add use scenario" wrote to the oldest file. The form said the write was "audit-logged", but scenario creation writes no audit row. | The file panels and the add button are hidden until the route reports `scope: 'program'`, with a line saying why. AnA is given no facts and no actions from the file. The "audit-logged" claim is dropped for scenarios and kept for elements, which do write a row. The panels come back with no client change once the read is keyed (slice 19). |
| `v2/surfaces/Labeling.tsx` | `rows[0]` of an unkeyed `/api/mdx/labeling` drove the header, symbols, UDI-DI, translations and the add-translation write. That is the organization's first document. "Warnings and precautions" was a permanent empty state over a read that does not exist. The header promised a register and risk-file tracing. | The one read is `/api/mdx/labeling?program_id=…`, made only when a project is given. The route already filters on it. Without one, the record panels are hidden and a line names them. Warnings say they are not available yet. The header says what the page holds. No shell caller passes the project yet (slice 20). |

**Device lane (`mdx`)**

| Path | What it did | What it does now |
| --- | --- | --- |
| `mdx/presub/PreSubManager.tsx`, `hooks/usePresub.ts` | The dossier-link buttons called `onJumpToDossier`, which no caller passes. "New Q-Sub" only asked AnA. The "Mine" filter was `['BX-204','OR-801'].includes(prog)`, two demo codes. With zero commitments it read "All integrated" in green and "0% · 0 of 0" in red. | The buttons render only when a handler is passed; otherwise the line reads "Rolls into {section}". The button is labelled "Ask AnA to start a Q-Sub" (`create_q_sub` runs in production). "Mine" is gone until the list carries an owner (slice 12). Zero commitments read "No commitments recorded yet". |
| `mdx/surfaces/SoftwareSurface.tsx`, `hooks/useSoftware.ts` | The empty lifecycle list offered only "Check again". The client type assumed an always-scored summary, so the route's `undetermined` body (null counts and a reason) drew a green "Approved" card. | The empty list offers "Ask AnA to add a lifecycle item" (`create_software_lifecycle_item`). The type matches the route. An undetermined summary reads "Not determined" with the server's reason and no tone. |
| `mdx/surfaces/EngineeringSurface.tsx` | Five panels read organisation-wide: DHF, design-controls trace, change requests, non-conformances and documents in flight. They showed under this project's name with an "Organization-wide" pill. Two cards printed organisation-wide figures. "0 hard blockers" was zero by construction. An empty risk file read as all risks verified. | The five panels' rows are hidden behind a line inside each panel's own state, so a failed read still shows as a failure. The cards show a dash. The blocker line says hard blockers are not counted while their sources are left out. An empty risk file says nothing is recorded yet. Every panel comes back once its route reports `program` (slice 19). |
| `mdx/surfaces/PostmarketSurface.tsx`, `mdx/MdxSurfaceHost.tsx` | Signals, the CAPA board, trends and PMS plan execution came from an organisation-wide read. The documents panel was hard-coded to `EMPTY_DOCS`. The host banner said "organization-wide surveillance feeds". | Those panels are hidden until keyed. Each card says "Not read for this project yet", and the note names PMS plan execution (not the per-project `pms_plan` document) as what has no store. The documents panel says it is not read here yet. The banner says what is shown and what is not. |
| `mdx/surfaces/PmaSurface.tsx`, `IvdSurface.tsx` | PMA stated a phase mapped from a stage index that `useMdxPrograms` makes up when no phase is recorded, and ticked phases before it. The IVDR strip did the same. With no project, IVD showed "Stage 4 of 7 — Notified body review" and made five organisation-wide reads. | Both state the project's recorded phase (`useRecordedPhaseLine`, through the existing `useProgramDetail`). Neither marks a position on the pathway's taxonomy, and each says why. With no project, IVD returns "No project is selected" before any hook runs. |
| `mdx/workbench/Workbench.tsx`, `hooks/useWorkbench.ts`, `hooks/useSubmissions.ts`, `data/workbench.ts` | Validation's header claimed eSTAR rules across "every program". Its prompt hard-coded "the 3 blockers". A low-severity blocker showed a "Pass" pill. A failed read showed as "No programs to validate", and Export wrote an empty CSV. Submissions printed invented targets ("NB · TÜV", "FDA · ESG"). Its gate fell back to {0,0,0} (green, Transmit enabled) while the readiness read was in flight or failed, and it showed "E-signature Signed" from free-form metadata. | Each claim is corrected. Severity maps to error or warning, never pass. A failed read is an error with retry, and Export is off. Targets and `esig` are removed from the type. The gate comes only from the readiness read, and Transmit needs a read gate with no errors. |
| `mdx/surfaces/VaultSurface.tsx`, `hooks/useVault.ts`, `data/vault.ts` | The subtitle claimed a chained audit trail and a 7-year retention. "Export manifest" only asked AnA. The drawer's Download only asked AnA "and log access". For an uploaded file, versions and audit always failed. | The subtitle says what the page shows. Download reaches the governed route (`/api/c2c/project-vault/:id/documents/:documentId/download`, through `downloadVaultFile`); the route writes the access row first. Where the route cannot serve a file, the button says it asks AnA. An uploaded file's drawer points to the project's Vault for its versions and history. |

### AnA's navigation

AnA's navigation keeps `intelligence` and `safety` as targets:
- Under the launch scope the server gives every registered surface outside the release a `launch-scope` lock.
- The shell forwards those locks to AnA as locked screens (`AnaLockPublisher`).
- So `navigate_to` refuses them, and AnA answers in the conversation.

Removing the targets would also remove the three `intelligence.*` screen actions and the `pv` → `safety` alias. That
would be a loss, not a fix, so this differs from the plan's wording. The map now records the reason, and
`navigationReachability.test.ts` pins the rule.

### An independent audit of the device lane, and what it changed

The device items above were built by implementers and checked by their own auditors. Before committing, a second,
independent pass read the final diffs: six honest-state auditors, one per surface group, then one skeptic who
defaulted to "not real".
- They reported 44 findings, and the skeptic confirmed 28.
- One fixer per group then worked through the confirmed findings red first. Each fixer owned only its group's files.
- Three verifiers re-checked every outcome. 29 of 30 checks held.
- The one that did not hold was the post-market Overdue card. It said "No reporting deadline missed", which the
  triage read cannot know. It now says only what the server's `overdue` means: "No unfiled MDR or open CAPA past its
  due date" (`audit3-…` red log).

What the confirmed findings changed, beyond the table above:

**Validation, Submissions, Vault**
- The project cards were a filter that hid every row. They are no longer a filter, and each blocker names its
  project.
- The "readiness" bars are stored progress. They are titled so, and say that an unrecorded project shows 0%.
- An unread or failed package list shows a dash or an error, never zero counts.
- A readiness gate with nothing assessed, or with no counts in the body, is not ticked, and Transmit stays off.
- Unread activity is never "No milestones".
- Cover letter and e-signature come from metadata nothing writes. They say "Not read on this page", and Package reads
  the recorded bundle.
- The pipeline stage is the recorded one, never inferred.
- Vault's link count is no longer a literal 0, and its KPI strip shows a dash, never zeros, while the list is unread.

**Post-market**
- The scope line names the project, not its class code.
- "Triage queue" asks AnA for exactly what `triage_capa_mdr_queue` does, for this project.
- A filed MDR past its date is no longer counted as due within 72 hours.
- Clocks are no longer called "running".
- An answered empty triage read shows 0.
- The scope paragraph and the awareness toggle list only what is held.

**PMA and IVD, and `PathwayPanes`**
- A finished read with no usable row says the phase could not be read, and a project switch never inherits the last
  answer.
- Tab counts show a dash over an unfinished read.
- The Approvals tab, an organisation-wide e-sign queue, carries no count and says it covers all projects.
- An unclassified IVD row asks AnA to classify, not to explain "Class null".

**Pre-Sub and Software**
- A row change never shows the previous Q-Sub's summary or FDA response.
- An unreadable detail is an error with retry, not "Package in draft".
- "Start a Q-Sub" asks only for what `create_q_sub` records.
- Software shows the route's `completionScope` and calls its counts tracked lifecycle records. It is never green
  while documents in the required set go uncounted.

**Engineering and Human factors**
- The blocker line gives no count over an unresolved read.
- Empty hints stop promising records the screen will not show until the read is keyed.
- A stale test that pinned the old all-clear is replaced.

**Labeling**
- The not-keyed note gives the actual reason.

### Not done, and why

- **The open MDR queue (server).** `getTriageQueueTx` / `listMdrEventsTx` (`server/services/capa-mdr/capaMdr.service.ts`)
  should exclude filed, acknowledged and closed MDRs from the open queue, the same set as its overdue rule. Until
  then, the post-market cards say filed MDRs are not yet excluded. `PostmarketSurface.reportingClocks.test.tsx` pins
  that copy and points at it when the server changes.
- **An unrecorded project's progress.** `useMdxPrograms.ts` maps a missing `progressPercent` to 0. Validation's bars
  say so in words until the hook carries null.
- **The Approvals tab's queue.** It is the person's e-sign queue across projects. A per-project filter needs the
  server; the tab says what it holds.
- **A folded id resolving to its canonical in ⌘K.** No registry id is an alias yet (slice 2).
- **Plan & features cards losing Open.** Human factors, device Pre-Sub and others are reached today only from that card
  and ⌘K. Removing the door before their homes exist would lose them, against "nothing is lost".
- **The post-login redirect for client (sponsor) users.** It is founder decision 2: it changes what an external user
  sees.
- **Communication and CMC / Module 3 at signup.** This is the map's pricing decision 1.
- **The server's half of each keyed panel** is slices 19–21:
  - `program_id` on the engineering stores and `hf_engineering_files`;
  - the artifacts read filtered by `project_id`;
  - post-market reads by project;
  - the audit row for a human-factors scenario.
- **`useMdxPrograms.deriveStageIdx`** still invents a stage when none is recorded, for the 510(k) strip and Overview.
  It is a shared hook for those surfaces' rows.
- **The Pre-Sub dossier jump** comes back when `MdxSurfaceHost` passes `onJumpToDossier`.
- **A walk of a freshly provisioned organisation that reaches no lock** is the map's slice 0 evidence. It is done:
  see "The walk" below.

## The walk: a fresh organisation reaches no "not in this release" lock

`tests/e2e/launch-walk-no-lock.e2e.ts` is the map's slice 0 evidence.

**What it ran against.**
- A server with `LAUNCH_SCOPE_ENFORCE=on`, as in production, served from a clean copy of `7d1f7f316` with this
  commit's `NavUnlockPanel` attribute applied.
- It skips itself on a server where launch scope is off.
- It asserts the navigation verdicts (`/api/module-subscriptions/navigation`, `resolved: true`) can be read before
  and after. With no verdict nothing is shown locked (`navEntitlements.tsx`, rule 1), so a walk on a server that
  cannot answer would see nothing and pass.

**What it does.** For a biotech and a medtech organisation, each signed up fresh through `POST /api/auth/signup`
(never the demo seed), it:
- presses every rail entry;
- opens ⌘K from the top bar and presses every "Jump to" row, then every result of 13 searches: vault, submission,
  readiness, protocol, cmc, quality, report, task, audit, ind, device, label and communication;
- creates a first project (an IND; a 510(k)) and presses every door on its six steps. A door is a button that names
  the place it opens. It never presses one that changes a record;
- presses the rail and "Jump to" again with the project open.

**What it fails on, and what it records.**
- It fails on any "not in this release" lock:
  - the full-page gate (`[data-launch-scope-gate]`);
  - the unlock panel when it explains a launch-scope verdict (`.nav-unlock[data-lock-source="launch-scope"]`).
- It records licence locks, which are the organisation's plan, and attaches every place visited as
  `walk-<mode>.json`.

| Organisation | Places visited | "Not in this release" | Licence locks (distinct features) | Doors on the six steps |
| --- | --- | --- | --- | --- |
| biotech, IND project | 134 | 0 | 53 (25) | 12 |
| medtech, 510(k) project | 134 | 0 | 53 (25) | 12 |

Evidence: `walk/walk-biotech.json`, `walk/walk-medtech.json`, `walk/green-run.txt`.

### Made to fail first (`walk/red/`)

The walk's first green run proved nothing. In ⌘K, a locked row of either kind opens the same unlock panel, and the
walk counted every panel as a licence lock. So "not in this release" could be on screen and the walk would pass.

- **The panel now names its verdict.** `NavUnlockPanel` carries `data-lock-source={verdict.source}`, pinned by
  `navUnlockLockSource.test.tsx`. Its red is `unlock-panel-names-no-verdict.txt`: both tests fail against HEAD.
- **The walk, made to fail.** Slice 0's ⌘K filter (`if (isLaunchScopeLocked(verdictFor(s.id))) return false;`) was
  deleted in the scratch copy. The biotech walk then failed with 74 "not in this release" locks, each named by the
  search and result that reached it, for example `⌘K "submission" → Dossier map`. See
  `walk-without-cmdk-launch-filter.txt` and `.json`.
- That run predates the verdict-read assertion above. Its lock classification is the same code.

### Harness notes

These apply to the scratch copy only. Nothing here changes the product.
- **Vite cache.** The copy uses its own Vite cache directory (`cacheDir`). Through the symlinked `node_modules` it
  shared the main tree's dependency cache, and React loaded twice: a blank page.
- **Allowed origins.** A server on a port other than 5000 needs `ALLOWED_ORIGINS=http://127.0.0.1:<port>`. Otherwise
  the CSRF origin check refuses Vite's module requests from the browser.
- **The sign-up limiter.** It allows five sign-ups an hour from one address, held in the server's memory. A run makes
  two, so a third run in the hour needs a fresh server process. The walk does not relax it.

### What the walk found that is not a slice 0 failure

Each is recorded for its owner; none is a "not in this release" lock.

1. **A device company starts as pharma.**
   - The server: `POST /api/auth/signup` stores `industry_mode` but never `client_type`, so the column keeps its
     default `'pharma'`. Every walk organisation reads `client_type = pharma`, the medtech one included.
   - The shell: its lane is the browser-local `prefs.segment` (default `biopharma`), not the organisation's.
   - What a device client sees: CMC / Module 3 on its rail, and a New project picker that says "Tailored for
     biopharma" with the pharma filings first. The raw id is printed because `SEG_LABELS` has no `biopharma` entry.
   - Next change in this lane.
2. **A fresh organisation holds no device feature.**
   - The 510(k) workbench, CER, device clinical studies, PMA, Labeling, Risk, UDI and the rest are licence-locked for
     the medtech organisation as for the biotech one ("not included in your plan").
   - That follows the founder's request of 2026-10-23: device features are on the client's project, keeping every
     feature's existing commercial verdict, with no new organisation grant (`shared/constants/launch-scope.ts`).
   - It is the map's decision 1 widened from Communication and CMC to the device lane. It is for the founder.
3. **⌘K search offers what the account menu does not.** It lists every in-release registry surface that matches:
   - Master licensing ("platform-owner administration") to a customer's administrator;
   - Admin console to members.

   The account menu offers them only on `platformAdmin` and `isOrgAdmin`. This is a slice 0-class gap: offered to
   someone who cannot use it. Next change in this lane.
4. **⌘K search lists 25 features this organisation's plan lacks**, each a licence lock, among them 20 device
   features for a biotech organisation. Their placed names are slice A.1, and which an organisation holds is decision
   1.
5. **Quality's reads fail on this server with `REQUEST_DB_CONTEXT_REQUIRED`.** This was seen in the server log, not
   as a lock:
   - affected: `/api/mdx/qms/documents` and the change, review-due and training reads (`server/routes/mdx-qms.ts`),
     and the project schedule's unified work (`server/routes/project-schedule-of-events.ts`);
   - why: each reads through `requestPgClient(req)`, which refuses a request with no tenant-pinned connection;
   - status: under investigation in this lane.
6. **AnA answers 503 on this server**, because the AI gateway started with no provider. It fails closed, as intended
   for a local server.

## Tests, each made to fail first (`red/`)

Part 1:

| Guard | Test | Red |
| --- | --- | --- |
| The `@` menu offers only what can be opened | `appMentions.test.tsx` (3 new) | `at-menu-offers-out-of-release.txt`, `at-menu-sliced-before-filtering.txt` |
| Coverage only for a platform admin who can open it | `accountMenuMasterLicensing.test.tsx` (3 new) | `coverage-in-every-menu.txt` |
| ⌘K: places, the project's steps, nothing outside the release | `cmdkPlaces.test.tsx` (5) | `cmdk-catalogue.txt` |
| Memory and Instructions say they are not read | `projectSideNotRead.test.tsx` | `author-memory-said-empty.txt` |

Part 2. Each red log is the test run against the code before the change, or against a mutation restored afterwards
(each log says which):

| Guard | Test | Red |
| --- | --- | --- |
| "Choose or create a project" opens Projects | `emptyState.contract.test.tsx` | `open-program-opens-a-lock.txt` |
| `biopharma` opens Projects; every target is in the release or lockable for AnA | `navigationReachability.test.ts` (2 new) | `biopharma-alias-opens-a-lock.txt`, `alias-target-no-lock-for-ana.txt` |
| No conversation chip opens a lock | `conversationRefChipsNoLock.test.ts` (new) | `conversation-chips-open-locks.txt` |
| Author's protocol door names the job | `projectHomeDocuments.test.tsx` | `author-protocol-door-stale-scope.txt` |
| Admin: no prompt-only action, audit opens the trail | `adminAccessNoDeadActions.test.tsx` (5, new) | `admin-dead-actions.txt` |
| Human factors | `humanFactorsProjectKeyed.test.tsx` (new) | `human-factors-*.txt` (3) |
| Labeling | `labelingRecordsNotProjectKeyed.test.tsx`, `labelingWarningsNotAvailable.test.tsx` (new) | `labeling-*.txt` (8) |
| Pre-Sub | `PreSubManager.{dossierLinkUnwired,newQSubAsksAna,noMineFilter,noCommitmentsKpis}.test.tsx` (new) | `presub-*.txt` (5) |
| Software | `SoftwareSurface.emptyAskAna.test.tsx` (new) | `software-*.txt` (2) |
| Engineering | `EngineeringSurface.projectKeyed.test.tsx` (new) | `engineering-*.txt` (6) |
| Post-market | `PostmarketSurface.{projectKeyed,documentsUnread}.test.tsx` (new), `MdxSurfaceHost.test.tsx` | `postmarket-*.txt` (9) |
| PMA and IVD | `PmaSurface.recordedPhase`, `IvdSurface.{recordedPhase,noProject}` (new), `mdxDerivedFiguresAreDerived.test.ts` | `pma-*.txt` (4), `ivd-*.txt` (3) |
| Validation, Submissions, Vault | `ValidationSurface.whatItReads`, `SubmissionsSurface.noInventedTarget`, `VaultSurface.noUnbackedClaim` (new) | `validation-*.txt` (8), `submission-*.txt` (5), `vault-*.txt` (4) |
| The audit's confirmed findings | the same files, plus `PostmarketSurface.reportingClocks.test.tsx` (new) and `EngineeringSurface.unreadable.test.tsx` | `audit2-*.txt` (30, one per fix), `audit3-postmarket-overdue-claims-no-deadline-missed.txt` |

Existing tests changed because they pinned what this slice removes. Each change is commented in the test.
- **Tests that pinned AnA being asked:** `anaAskDestination.test.tsx` and `adminAccessHonesty.test.tsx`. They pinned
  "Grant access" and a settings row asking AnA.
- **Fixtures that needed a scope:** `humanFactorsHonesty` and `humanFactorsSummativeGate`. Their fixtures now report
  `scope: 'program'`, which the route cannot send yet.
- **Tests that needed a project:** `labelingCoverageHonesty` and `labelingAddTranslation`. They now mount with a
  project.
- **Matchers on content now hidden:** `noFavourableDefaults` and `mdx-surfaces-interactive-smoke`. They wait on what
  the surface still shows.
- **Matchers on removed wording:** `MdxSurfaceHost.test.tsx` (the banner), `mdxDerivedFiguresAreDerived` (the
  phase-line regex) and `emptyState.contract`.

### Affected sets

Each set was run at the previous commit and with this change, and the failing test names were compared.

Part 2b, against `a40acd714`:
- **Scope:** every test importing any source file this part changes, plus every new or changed test. That is 168 files
  (146 exist at HEAD) and 2,192 tests.
- **Result:** 23 failures, every one also failing at HEAD; none new. They include the conversation and `useAuth`
  cluster (`cc1607c3a`), `filingPathNoDeadEnds`, three Vault tests, and the two PathwayPanes smoke cases.
- **Gates:**
  - `typecheck-no-regression`: 0 errors.
  - `eslint` on the 52 changed files: 0 errors, and no file gained a warning.

Part 2a, against `77278f941`:
- **Admin:** 12 files, 94 tests, all passing.
- **Aliases:** every test naming `biopharma` or `DEEP_LINK_ALIASES`, 134 files. 11 failures, identical at HEAD.
- **Project home:** 31 files. One failure, `projectDocumentDisposition`, also failing at HEAD.

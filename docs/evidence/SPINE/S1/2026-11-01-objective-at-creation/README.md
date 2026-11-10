# S1: the objective at creation, the charter's read, and the project page's hook

**Package:** S1, project and goal (`docs/design/ONE_DESIGN_PLAN.md` §1a, "S1: where the project's objective lives",
items 1 to 3). **Build order:** `.design/claude-convergence/BUILD_ORDER.md` §3 Wave 0 ("S1 (the charter read and
versioned write) … can proceed on the server only"), and the S1 rows of §1 D2 and D3.
**Date:** 2026-11-01, read at `e10622010` on `concept2cure-v2`.
**State:** built, then reviewed by S1's skeptic, who reran red and green, fixed two defects (see "Review" below)
and committed it under `Plan: S1`.

What this slice completes:
1. `POST /api/c2c/projects` accepts an optional objective and its sources. It records them as version 1 of the
   project charter's `objectives` section, inside the creation's own transaction, through
   `server/services/c2c/charter-objectives.ts`. This is the write the charter route's PUT makes, not a second path.
   The creation's audit row names it. With no objective stated, nothing is recorded.
2. The charter route reads a project's objective and records a new version with its sources. Three gaps are now
   closed:
   - The charter could not be started for most filings the product creates.
   - The read did not say who recorded a version, or whether this reader may record the next one.
   - The PUT could say "nothing was changed" after it had recorded a version.
3. `useProjectObjective(pid)` in `client/src/concept2cure/v2/surfaces/projectSettingsRequest.ts`. It is the hook D3's
   `ProjectObjective` block renders (D3 §4.3). `ProjectHome.tsx` and `Projects.tsx` are not touched: the New project
   field ships with D2-2, and the block with D3.

No migration, route file, mount, table, service file or AnA tool is added (RULE 6). `server/routes/charters.ts`
needed no change: it already mounts the GET and PUT that `charter-objectives.ts` implements.

---

## What already exists (RULE 3)

| Piece, by path | What it does today | What it did not do |
|---|---|---|
| `6ffca88a0` "A project records its objective in its charter, versioned, and AnA reads it every turn" | Added the module and its two routes, with tests (10 service cases, 4 route cases) | The New project field, the About card, and AnA's proposal (its own "Not yet done") |
| `fef3d80f8` (Plan: PLAN, P-80) | Made the charter's `objectives` section the objective of record (plan §1a S1 table) | — |
| `edcbf4f3d` | Made `ana_client_objectives` (the organisation's goals tracker) project-admitted | Stays the goals tracker, so it is not touched here |
| `server/services/c2c/charter-objectives.ts` | `readProjectObjectives` and `recordProjectObjectives`: a versioned, hash-chained section, with an append-only `charter_audit_events` row per change. `sendProjectObjectives` and `changeProjectObjectives` are `GET`/`PUT /api/charters/by-project/:ref/objectives`, project-admitted (pinned to the program for a UUID). `objectivesContextBlock` feeds AnA's per-turn prefix. | See the three gaps below |
| `server/routes/charters.ts:386–393` | Mounts the GET and the PUT | — |
| `shared/schema/project-charter.ts`; migrations `0012`, `20260629`, `20260911`, `20260917` | `project_charters`, `charter_sections` and `charter_audit_events`, with the append-only triggers. `submission_type` and `regulatory_region` are free `TEXT` with no CHECK. | — |
| `server/routes/c2c/projects.ts` `router.post('/')` | The one canonical creator. One transaction holds the program, the scaffold, the submission spine, the project record (`requireProgramProjectAnchor`) and the creation's chained audit row (`writeProgramAudit`). | Accepted no objective |
| `client/src/concept2cure/v2/surfaces/projectSettingsRequest.ts` | The governed settings read and write (`requestProjectSettings`), and archive (`requestProjectArchive`) | No objective read; no hook |
| `client/src/concept2cure/v2/dataConnect.tsx` `useLiveData` (D0-locked: imported, not edited) | The house read hook: it unwraps the envelope, checks the shape, and retires a read when the path changes. Used by `useProjectDossier` (`ProjectDossier.tsx:95`) and `useProjectTeam` (`ProjectTeamResponsibilities.tsx:16`). | — |
| `server/services/tenant/actor-names.ts` | The one name resolver (`public.actor_name`, tenant-scoped). Labels an unknown id `user <id>`, never "Unknown". | — |
| `server/services/c2c/document-class.ts` `PROGRAM_TO_DOC_TYPE`; `server/services/regulatory/market-support.ts` `documentAgencyFor` | The program types that name a governed filing, and the agency normaliser creation already uses (`us` is FDA, a Notified Body is EMA, ICH). | — |
| `review-route.ts:78`, `vault-version-checkin.ts:353`, `submission-service.ts:408` | Drizzle on a `pg` client whose caller holds BEGIN. The last runs inside this same create, through `ensureSubmissionSpine`. | — |
| D3 spec §4.3 (`.design/claude-convergence/D3.md`) | Fixes the hook's contract: `ObjectiveRead`, with reading, failed (retry), none and stated. Stated carries text, version, source, recordedBy, recordedAt and canChange. | — |
| D2 spec §2.4 item 6 | The New project field, which ships with S1's server half in one commit. Version 1 is "stated at creation by <person>". | — |
| Deleted: `client/src/concept2cure/hooks/useProjectCharter.ts` (`0b6847a3c`, deleted in `e5a74a4df`, #675) | TanStack hooks for `/api/charter/...` (singular), a mount that no longer exists. It was removed with 253 other unreachable files. | The new hook reads the existing `/api/charters/by-project/:ref/objectives`, so it reaches existing code and does not rebuild that hook. |

**Searches run:**
- `objective`, `charter`, `useProjectObjective`, `ProjectObjective` and `api/charters` across `server/`, `client/src`
  and `shared/`. No client caller of `/api/charters` existed before this.
- `VALID_PROGRAM_TYPES`, `DRUG_APPLICATION_TYPES`, `PROGRAM_TO_DOC_TYPE`, `documentAgencyFor`, `AGENCY_TO_CODE` and
  `AGENCY_LABEL`.
- `actor_name`, `resolveActorNames`, `drizzle(client`, and `requireProjectAdmission` / `requirePinnedProjectAdmission`.
- The callers of the create in the test suites (`projects-create*.test.ts`).
- `git log --all --diff-filter=D --name-only | grep -iE "objective|charter"`. It found the hook above, its types,
  `ObjectiveComplianceCard.jsx` (a CER card, unrelated) and two 2026-03-27 charter reports.

### Three gaps found while confirming item 2

1. **The charter could not be started for most filings the product creates.** `charterClassification` knew nine
   application types and seven agency spellings. It refused, among others:
   - a CTA in the EU;
   - a CSR under ICH;
   - an EU MDR file and a CER at a Notified Body;
   - ANDA, DMF, IDE and HDE;
   - every document-class filing (an IND amendment, a briefing package and others);
   - the Japanese filings, including a certification-body filing.

   Its refusal told the person to "complete the project's details first", which they could not do. The probe
   (`probe-charter-classification.ts`, read-only) counts the filings New project can create, using the create
   route's own offer check. Its grid crosses every `VALID_PROGRAM_TYPES` value with 28 agency spellings (every agency
   the catalog names, and the spellings people send), keeps the 651 pairs the offer check offers, and hands the
   charter the agency as `POST /api/c2c/projects` does:

   | | Creatable catalog filings classified | Refused | Offered (type × agency) pairs classified | Refused |
   |---|---|---|---|---|
   | Before (`red/catalog-classification-probe.txt`) | 22 | 24 | 59 | 592 |
   | After (`green/catalog-classification-probe.txt`) | 46 | 0 | 651 | 0 |

2. **The read did not say who recorded a version, whether the section is locked, or whether this reader may record
   the next one.** D3's block needs all three.
3. **The PUT could report a false outcome.** When the read-back after a committed version failed, the PUT answered
   "could not be recorded. Nothing was changed."

---

## What changed, by path

### `server/services/c2c/charter-objectives.ts`
- **Classification (`charterSubmissionType`, `charterRegion`, `charterClassification`, lines 141–177).**
  - The charter's own name for a type comes first (`IND`, `510K` and the rest, unchanged).
  - Otherwise, for a program type in `PROGRAM_TO_DOC_TYPE` (every filing the creator can create), the charter uses
    the program's own type, upper-cased: `CTA`, `CSR`, `MDR`, `IND_AMENDMENT`.
  - `biologic`, `device`, `ivd` and `other` name no filing, so they stay refused.
  - The agency is read through `documentAgencyFor`, as creation reads it. The region map gains `ICH`, `MFDS` and
    `JP_RCB`. Swissmedic, which the product does not offer, stays refused.
  - The refusal's grammar is fixed: "records no application type the charter knows", not "records no an
    application type…".
- **One write path.**
  - The body of `recordProjectObjectives` moved, unchanged, into `recordOnTransaction` (line 363), which runs on a
    transaction the caller owns.
  - `recordProjectObjectives` (the PUT) wraps it in `db.transaction`, as before.
  - `recordObjectiveAtCreation(client, …)` (line 352) runs it on the create's own `pg` client, through
    `drizzle(client)`. It neither begins nor commits.
  - The content hash moved into `versionContent` to keep the write under the complexity limit.
- **`objectiveStatedAtCreation(body)` (line 331).** This is the creation's validation, using the module's own
  `objectivesBodySchema`:
  - Absent, null, empty or blank means none stated, so nothing is recorded.
  - Sources with no objective, a non-string, or a schema failure are a refusal that names none of the text.
  - Version 1's reason is `Stated when the project was created.` (21 CFR 11.10(e) asks each version why).
- **The read (`objectivesRead`, `mayRecordObjectives`, lines 475–510).**
  - `current.recordedBy` and each `history[].recordedBy` come from `resolveActorNames` and `actorLabel`.
  - `current.locked` is the section's `read_only`.
  - `canChange` is the PUT's own admission run in write mode (`mayRecordObjectives`): a refusal means `false`, and
    any other failure fails the read. A locked section is never `canChange`.
- **The PUT after a committed write (line 568).** A failed read-back now answers 503
  `OBJECTIVES_RECORDED_READ_UNAVAILABLE`: "Version N … is recorded, but it could not be read back". It no longer says
  nothing was changed.

### `server/routes/c2c/projects.ts` (`router.post('/')`)
- **Line 781:** `objectiveStatedAtCreation(body)` runs before the quota check and before BEGIN. A malformed
  objective is a 400 in the route's own `{ error }` shape, and nothing is written.
- **Line 1050, inside the transaction:** `recordObjectiveAtCreation(client, …)` runs after `requireProgramProjectAnchor`
  (`project_charters.project_id` needs the project record) and before the creation's audit row. Any failure rolls
  back the program, the scaffold, the spine, the record and the charter together.
- **Line 1092:** the creation's audit row (`c2c.project.create`) gains `objective_charter_id`, `objective_section_id`,
  `objective_version` and `objective_content_hash`.
  - It holds a reference, not the text, because the text may be sponsor-confidential. The charter's own append-only
    rows hold the text, with the reason.
  - With no objective, none of these keys is written.
- **Line 1151:** the 201's `meta.objective` is `{ charterId, sectionId, version }` when one was recorded.
- **Line 1169:** the module's own refusal (`CharterObjectivesRefusal`) inside the transaction answers with its status
  and code, after the rollback.
- The handler's line and complexity growth is held down by `objectiveAuditDetails` (line 649). ESLint shows the same
  three warnings as at HEAD, which were already over the limit (see Verification).

### `client/src/concept2cure/v2/surfaces/projectSettingsRequest.ts`
`useProjectObjective(pid)` (line 156) reads `GET /api/charters/by-project/:pid/objectives` through `useLiveData`, with a
shape guard. It returns D3 §4.3's `ObjectiveRead` (line 108):
- `reading` while a read is under way, and with no project. A switch of project is `reading` at once, so nothing of
  the previous project is shown.
- `failed`, with `retry`, on any error or malformed answer. It is never `none`.
- `none`, with `canChange`.
- `stated`:
  - `text`, `version`, `recordedBy`, `recordedAt` and `canChange`;
  - `source`: the first source's title and locator, plus "and N more sources". With no source it is `{ kind:
    'person', label: 'a statement, with no document cited' }`;
  - `versions`, newest first, for the settings drawer's list (D3 §4.3: "the previous versions are listed in the
    drawer").

Where it differs from D3's sketch:
- `source.kind` is the module's own vocabulary (`protocol`, `registry`, `publication`, `press_release`, `data_room`,
  `other`), plus `person`. It is not D3's `protocol | registry | sponsor | person`. Folding a publication into
  "sponsor" would misstate its source, and D3 renders only `label`.
- `versions` is added, so the drawer does not read the same route twice.

---

## Evidence

**Red** (`red/`), saved before each fix:

| File | What it shows |
|---|---|
| `projects-create-objective.txt` | The new create test, 9 failed and 4 passed. The 4 that pass are the "nothing stated, nothing recorded" guards, which hold before and after. The 9 that fail: <ul><li>a stated objective was dropped, with no charter;</li><li>five malformed objectives were accepted (201, not 400);</li><li>an unrecordable objective did not roll the creation back;</li><li>the MDR and CSR charters were never started.</li></ul> |
| `charter-objectives.txt` | 13 failed: the 9 classifications (`ind@us`, `cta@EU`, `csr@ICH / Global`, `mdr` and `cer` at a Notified Body, `ninsho`, and others), and the CTA PUT (409), `recordedBy`, `canChange` and `locked` |
| `projectObjectiveRead.txt` | 6 failed: `useProjectObjective is not a function` |
| `mutation-objective-after-commit.txt` | The fix, mutated to write the objective after COMMIT (a second write outside the transaction): 2 cases catch it. The creation's audit row no longer names it, and an unrecordable objective leaves the project half-created. `projects.ts` was restored byte for byte (`cmp`). |
| `catalog-classification-probe.txt` | The before numbers above, regenerated at review with HEAD's module swapped in (the catalog lines match the builder's capture) |
| `unreadable-objective-read-as-none.txt` | Review: a recorded objective whose stored text cannot be parsed was read as `current: null`, so the GET said 200 and "none" (2 cases) |
| `pending-store-wrapped-by-drizzle.txt` | Review: a create with an objective on a database without `charter_sections` answered a bare 500, not the route's 503 `PENDING_STORE` |

**Green** (`green/`), on the final code:

| File | Result |
|---|---|
| `s1-objective.txt` | After the review's fixes: 4 files, 56 passed: the create (14), the charter routes (9), the service (27, including 16 classifications) and the hook (6) |
| `neighbours-projects-create.txt` | Every `projects-create*` suite and `projects-authorization`: 9 files, 180 passed |
| `neighbours-charter-prefix-settings.txt` | The AnA prefix suites that read the objective, `tests/unit/charters-routes`, the charter declared-columns contract and project settings: 6 files, 78 passed |
| `catalog-classification-probe.txt` | 46 classified and 0 refused, out of 46 creatable; the grid 651 and 0 |
| `review-neighbours.txt` | Review: 20 files that import a changed module. 19 pass. The 20th, `tests/lineage/founder-path-lineage.pglite.test.ts`, fails 6 cases at hop 8 (transmit) with HEAD's three S1 source files too, so it is not S1's. After the review's fixes, the 18 files that exercise the create, its 42P01 branch, the charter and the AnA prefix pass: 285 tests |

One existing assertion changed. `charter-objectives-routes` "reads it back for an admitted reader" took the last
admission call as the read's gate. The GET now makes two calls: read mode (the gate), then the write-mode probe for
`canChange`. The assertion now states that order exactly (`[false, true]`). The refusal half of that case is unchanged.

## Verification

```sh
npx vitest run --maxWorkers=2 \
  server/routes/c2c/__tests__/projects-create-objective.pglite.test.ts \
  server/routes/__tests__/charter-objectives-routes.pglite.test.ts \
  server/services/c2c/__tests__/charter-objectives.pglite.test.ts \
  client/src/concept2cure/v2/__tests__/projectObjectiveRead.test.tsx
npx tsx --tsconfig tsconfig.json docs/evidence/SPINE/S1/2026-11-01-objective-at-creation/probe-charter-classification.ts
```

- **ESLint (changed files):** 0 errors.
  - The warnings match HEAD's per file. `projects.ts` has the same 3 rules as at HEAD: the create handler's length
    and complexity, and the file's length. The others have 0.
  - The handler grew from 302 to 317 lines and its complexity from 109 to 118 (with the review's fix). Both were
    already over the limit.
- **TypeScript:** a full `tsc` (24 GB heap) was not run on the shared CPUs. A narrow `tsc` rooted at the seven
  changed files and their imports reports 0 errors in them. The 7 errors it reports are in untouched files and come
  from the narrow config itself: it omits the `Request` augmentation that the full config includes.

## Review (S1's skeptic, 2026-11-01)

Checked against the task's list, on the working tree at HEAD `805a6f0ee`. The branch moved to `9bf83a8f0` during the
review; none of its 11 commits touches these files or the modules they import:
- **Scope.** Every changed file is in S1's ledger paths (`server/routes/c2c/**`, `server/services/c2c/charter-objectives.ts`,
  `client/src/concept2cure/v2/surfaces/project*.ts`) or always allowed (tests, `docs/evidence/**`). None of the held
  files (D0's, RIM's, CMC's, filing types', `scripts/db/migration-set.mjs`) is touched. No migration, route file,
  mount, service, table or AnA tool is added. "What already exists" was checked: the cited commits, the mounts in
  `server/routes/charters.ts`, the deleted `useProjectCharter.ts` (`e5a74a4df`), and that no client called
  `/api/charters` before.
- **Red and green, rerun.** With HEAD's three source files swapped in for the run (each restored and `cmp`-verified),
  the four S1 files fail 29 of 53: the builder's 28, plus the one existing assertion that now states the GET's two
  admissions. On the final code they pass.
- **Lint and types.** ESLint warnings per changed file equal HEAD's (`projects.ts`: the same 3 rules; the rest 0). A
  narrow `tsc` over the changed files and the server type declarations reports 0 errors in them.
- **Gates run:** `ci:client-ip-single-source`, `ci:drizzle-tenant-scope`, `ci:sql-interpolation`, `ci:fabricated-identity`,
  `ci:discarded-audit-write`, `ci:server-error-leaks`, `ci:project-creation-owners`, `ci:program-ownership-single-source`,
  `ci:unauthenticated-fetch`, `ci:fixture-fallback`, `ci:no-mock-in-prod-routes`, `ci:json-operator-types` and
  `ci:untracked-imports` all pass.

**Two defects, fixed here, each shown failing first:**
1. **An unreadable recorded objective was read as "none".** `readProjectObjectives` returned `current: null` when the
   section existed but its stored text did not parse. The hook would then show "Not stated yet" and offer to state
   one, and AnA's prefix would carry no objective without saying one was recorded. It now refuses with 409
   `OBJECTIVES_UNREADABLE` (the module's existing pattern for `OBJECTIVES_AMBIGUOUS`). The GET answers that with no
   record, the hook shows `failed`, and AnA's prefix reports the recall unavailable
   (`intelligence-prefix.ts` `recall`). Red: `red/unreadable-objective-read-as-none.txt`. Tests: one service case
   and one route case.
2. **A missing charter table gave a bare 500, not `PENDING_STORE`.** The README said the create would answer the
   route's 503 `PENDING_STORE`. Drizzle wraps the driver's 42P01 in `DrizzleQueryError` and puts the code on `.cause`,
   so the route's 42P01 branch never saw it. The branch now reads the code from the error or its cause (the pattern
   `server/routes/ivd-completeness-routes.ts:164` uses). Red: `red/pending-store-wrapped-by-drizzle.txt`. Test: one
   create case, which hides `charter_sections` and checks the 503 and that nothing is left behind.

**Evidence corrected.** The README's grid figures (68 and 411 before, 479 after) came from a grid no saved script
produced. The probe now carries the grid, read the way the create route hands the agency to the charter. It was
rerun before (59 classified, 592 refused, with HEAD's module swapped in) and after (651 and 0).

**Open, for the coordinator:**
- `.design/claude-convergence/D2.md` line 31 says the New project field and the server's acceptance land in **one**
  commit. BUILD_ORDER §3 orders the server half first (Wave 0), then the field (Wave 2). This commit follows
  BUILD_ORDER. D2's safety condition (no field without a server that records it) still holds, because no client sends an
  objective yet. D2's table should be brought in line.
- The GET's `canChange` probe is the PUT's own admission in write mode. On a program UUID that is the pinned path,
  whose project read is `SELECT … FOR UPDATE`. On the request's autocommit connection the lock lasts one statement,
  but a read now briefly takes a row lock, and waits behind any open write to the project row. A read-only form of
  the same decision would remove that; it is not in this commit.
- `useProjectObjective` has no caller until D3's `ProjectObjective` block lands (BUILD_ORDER §3 Wave 2).

## Not done, and open

- **Not done:**
  - The New project field (`Projects.tsx`, under `Plan: S1`, after D2-2). This server half is committed first, as
    BUILD_ORDER §3 orders it (Wave 0: S1 "on the server only"; Wave 2: the field waits for "D2-2 and S1's server
    half"). Nothing on the client sends an objective yet, so nothing typed can be dropped meanwhile.
  - The `ProjectObjective` block (D3-1 and D3-2).
  - The settings drawer's write call for the PUT (D3-3).
  - AnA's proposal from the protocol (plan §1a S1 item 4).
- **`POST /api/charters` keeps its 9-value and 7-value enums.** The objectives path can now start a charter with
  `CTA`, `CSR`, `ICH` and the others. The columns are free `TEXT` with no CHECK, no reader validates them, and nothing
  on the client calls `POST /api/charters`. That route is left as it is.
- **The charter tables on every applier.** The plan marks this unverified. `scripts/db/migration-set.mjs` (the
  20260911 entry) records that the charter tables exist on a canonically provisioned database, "verified by querying
  one". This run did not query a live database. On a database without them:
  - a create **with** an objective rolls back and answers the route's existing 503 `PENDING_STORE`. This was not true
    as built (a bare 500); the review fixed it and a test now proves it;
  - a create without one is unaffected.

## The commit

Committed by the review, with the review's two fixes and their tests. Staged exactly:

```
server/services/c2c/charter-objectives.ts
server/routes/c2c/projects.ts
client/src/concept2cure/v2/surfaces/projectSettingsRequest.ts
server/routes/c2c/__tests__/projects-create-objective.pglite.test.ts
server/routes/__tests__/charter-objectives-routes.pglite.test.ts
server/services/c2c/__tests__/charter-objectives.pglite.test.ts
client/src/concept2cure/v2/__tests__/projectObjectiveRead.test.tsx
docs/evidence/SPINE/S1/2026-11-01-objective-at-creation/
```

Trailers:

```
Plan: S1
Completes: server/routes/c2c/projects.ts
Completes: server/services/c2c/charter-objectives.ts
Completes: client/src/concept2cure/v2/surfaces/projectSettingsRequest.ts
```

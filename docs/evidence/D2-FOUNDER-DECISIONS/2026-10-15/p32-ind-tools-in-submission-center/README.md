# P-32: the IND lifecycle and forms tools are a feature of Submission Center

Row **D2**. Decision **P-32** (2026-10-15, under the founder's delegation;
`docs/LAUNCH_DEFINITION_OF_DONE.md`, "### P-32"), as narrowed by the
coordinator's decision the same day: **agency questions stay locked.**
Precedent: P-28 (`docs/evidence/D2-CMC-LAUNCH-APP/2026-10-12/`,
`docs/evidence/CMC-M3-GA/2026-10-05/20-cmc-api-allowlist/`).

## What was locked

The beta sells the next sequence on a US commercial IND. An amendment needs its
1571, its cover letter and often a Letter of Authorization. The engines that
build them sat behind `ind-checklist` (the IND lifecycle screen,
`IndLifecycle.tsx`, with the `IndFormsPanel.tsx` it embeds; `ind-lifecycle` is
a deep-link alias of it), a surface outside the launch catalog.
`applyLaunchScope` therefore locked it for everyone, whatever the licence said.
Every path under `/api/ind-lifecycle`, `/api/ind-forms` and
`/api/ind-master-data` was `out-of-scope`, and production refused it 403
`LAUNCH_SCOPE`. Nothing claimed `/api/ind-checklist`, the screen's first read,
so production refused that too.

## The defect a plain flip would have shipped

`ind-checklist` claimed the bare `/api/ind-lifecycle`. Attribution is by
longest prefix at a segment boundary, so listing the surface and changing
nothing else would have made **every** route under that prefix answer
`launch`. That set includes:

- the 21 CFR 312.32 IND safety report: classify, PDF, and file into a sequence;
- the E2B(R3) ICSR composer and message builder;
- the tracked safety-report reads;
- the ICSR transmit and acknowledge to an agency gateway.

`red/2-claim-test-naive-flip.txt` records that state: each safety and ICSR
route reads `expected 'launch' not to be 'launch'`.

## What opens

`shared/constants/launch-scope.ts` adds `ind-checklist` to the Submission
Center app's `surfaces`.

**`modules` is unchanged**, as in P-28. Listing a surface lifts the
launch-scope lock. Listing a module would make `provisionLaunchModules` write a
grant for every new organisation, and that grant would outrank the `standard`
tier set in `db/migrations/20260823_module_catalog_commercial_packaging.sql`.
The catalog still has 8 apps.

The API claim is an allow-list of the paths the screen calls
(`shared/constants/ui-surface-registry.ts`):

| Claimed prefix | Called by |
|---|---|
| `/api/ind-checklist` | the checklist read, which carries the server's readiness verdict |
| `/api/ind-lifecycle/clock` | the 30-day clock: the server's `evaluateRegulatoryClock` (see below) |
| `/api/ind-forms` | IndFormsPanel.tsx: list, program facts, build, PDF, artifact, official upload |
| `/api/ind-lifecycle/cover-letter` | the cover letter and its PDF |
| `/api/ind-lifecycle/briefing-book` | the briefing book and its PDF |
| `/api/ind-lifecycle/loa` | the Letter of Authorization and its PDF |
| `/api/ind-lifecycle/right-of-reference` | the Statement of Right of Reference and its PDF |
| `/api/ind-lifecycle/annual-report` | the annual report: assemble, PDF, file into a sequence |
| `/api/ind-lifecycle/amendment-plan` | the amendment plan |
| `/api/ind-lifecycle/amendment` | filing the amendment into a sequence |

`/api/ind-master-data` is no longer claimed: no screen calls it.

## What stays shut, and how

| What | How it is refused | Pinned by |
|---|---|---|
| Agency questions (`haq-manager`): every `/api/haq-manager` path | The surface is not in the catalog; the verdict is `out-of-scope` | `ind-launch-claim.test.ts` ("agency questions stay locked…"); gate test; `launch-scope.test.ts` |
| `/api/ind-lifecycle/safety-report*`, `/safety-reports*`, `/icsr-transmissions*` (9 routes) | Claimed by `pharmacovigilance`, which is outside the catalog. The verdict is `out-of-scope`, so these are refused even when `LAUNCH_SCOPE_API_UNATTRIBUTED=report` | claim test (enumerated from `indLifecycleRoutes()`); gate test |
| `/api/ind-lifecycle/submission/:id/*`, including its safety and ICSR registers (5 routes) | Unclaimed (`unmapped`), so refused in production. No prefix can admit these registers without also admitting the safety registers beside them | same |
| The other lifecycle engines: readiness, sequence, portfolio, timeline, action items, envelope, cross-references, authorized persons, and the by-id reads | Unclaimed (`unmapped`) | "the IND lifecycle routes production serves are exactly the called ones" |
| `/api/ind-master-data` | Unclaimed | claim test; gate test |
| The IND screen's safety-report card | Hidden, not deleted. The `INDL_DELIVERABLES` entry keeps a `withheld` sentence, and the Lifecycle tab shows that sentence in place of the card. The card's code moved, intact, to `surfaces/indSafetyReportCard.ts`, which the screen does not import | `indLifecycleDeliverables.test.tsx` |
| AnA on the IND screen | The "Open a safety report" action and the "safety reports due" suggestion are replaced. The screen's context publishes `notInThisRelease` | `anaContextDeclaresItsCaps`, `registryModel` |

**Agency questions.** The coordinator decided to keep `haq-manager` out of the
catalog.

- Its approve route sets `status: 'approved'`. It records no Part 11
  signature, no reason and no role check.
- The response package sent to FDA is assembled from those approvals.
- Answers to FDA letters are third in the beta's job order
  (`docs/design/WORKFLOW_DECISION_2026-10-08.md` §1).

The comment in `launch-scope.ts` says it opens once approval is a signed act.
Three corrections from this change are kept even though the screen stays locked:

- Its registry claim is narrowed to `['/api/haq-manager']`. It called neither
  `/api/regulatory-correspondence` nor `/api/precedent-engine`, and each of
  those is still claimed by its own locked surface.
- Its catalog copy no longer claims "signed responses".
- The screen's own line "e-signature & package assembly still to come" now
  reads "a recorded approval, not an electronic signature". This is a one-line
  copy change with no behaviour change. Assembly already exists, so the old
  line was stale.

**Why the safety card's code left `IndLifecycle.tsx`.** `ci:launch-scope-api`
walks each launch screen's import graph and refuses any path production would
refuse. It failed on the card's three safety literals
(`red/3-…`), and it was right to. So "hidden, not deleted" means the code now
lives outside that graph. A test pins the import direction: the withheld file
imports from the screen, never the reverse. The withheld file's header lists
the four steps that bring the card back.

**AnA.** In `server/services/ana/ana-launch-scope.inventory.json`, no hidden
AnA tool or command names `ind-checklist` as its surface. The IND-adjacent
hidden tools (`build_sae_line_listing`, `compose_e2b_icsr`) belong to the PV
surfaces and stay withheld.

## No client copies of server engines

The coordinator's second decision applies the zero-duplication rule: verdicts
come from the deterministic server engines. `IndLifecycle.tsx` imported
`indlReadiness` and `indlClock` from `fixtures/ind-lifecycle-data.ts`. These
were client copies of `evaluateIndReadiness` and `evaluateRegulatoryClock`.
**Both are deleted.** Nothing else imported them; the `zeroStateNarrative`
cases that tested `indlReadiness` were re-pointed at `evaluateIndReadiness`.
Both are also off the fixture allowlist.

- **The clock** comes from `POST /api/ind-lifecycle/clock`
  (`server/routes/ind-lifecycle/compute.routes.ts`, which runs
  `evaluateRegulatoryClock`), with the recorded target date as `receiptDate`.
  `useServerClock` in `IndLifecycle.tsx` reports four states, and each one
  renders as itself:
  - **no target date:** nothing is asked of the server and nothing is
    projected;
  - **computing:** the chip reads "Computing", the screen shows no number and
    no date, and a sentence says the clock is being computed;
  - **computed:** the server's numbers are shown, still labelled a projection.
    Even when the server answers `safe_to_proceed`, the screen never shows the
    cleared chip or the "may proceed" sentence;
  - **not computed:** a refusal, a transport failure, or a 200 response that is
    not a clock. The chip reads "Clock not computed", the screen shows "The
    30-day clock could not be computed — {the server's words}. Nothing is
    projected until it is." and a **Retry the clock** button. AnA receives
    `thirtyDayClockState: 'not-computed'` and a summary that calls this a
    failure, not an absent date.
- **Readiness** was already the server's verdict. `GET /api/ind-checklist`
  returns `evaluateIndReadiness`'s report, which the checklist assembler
  computes over the submission's full section state and its lifecycle issues.
  The only client use of the copy was `indlReadiness([], [])`, called when a
  row carried no verdict, and it returned "not assessed". That call is now a
  stated constant (`NOT_ASSESSED`), not a computation.
- **`POST /api/ind-lifecycle/readiness` is not called, and so not claimed.**
  This is a deliberate departure from "use both compute routes". The screen
  could only build that route's input from its displayed inventory. The result
  would be a second readiness verdict, without the assembler's lifecycle-issue
  blockers, beside the one the checklist already returns. That is the drift the
  zero-duplication rule exists to prevent. The claim test pins `/readiness` as
  not launch, and the registry comment says why.

## Entitlement

- **Unchanged for what opens.** The claimed paths are still module-gated by
  `ind-checklist`, and the `standard` tier still decides who gets the module.
  `launch-scope.test.ts` shows a `tier` verdict for `standard` passing through
  `applyLaunchScope` unchanged. `LAUNCH_MODULE_IDS` contains neither
  `ind-checklist` nor `haq-manager`.
- **One side effect, the same one P-28 had.** The unclaimed IND routes and
  `/api/ind-master-data` now have no claiming surface. In production they are
  refused, as before. On a deployment that turns launch scope off or sets
  `LAUNCH_SCOPE_API_UNATTRIBUTED=report`, with `MODULE_ENFORCEMENT` on, they
  are not module-gated. With launch scope off, the safety routes are gated by
  `pharmacovigilance` instead of `ind-checklist`.

## Catalog copy (CLAUDE.md Rule 1, amended in place)

`db/migrations/20260823_module_catalog_customer_copy.sql` is the last catalog
writer in the deploy order. It now carries:

- **`ind-checklist`:** the copy no longer offers "autodraft, master data …
  safety reports". It names the deliverables the screen offers and says IND
  safety reports are not part of this release.
- **`haq-manager`:** the copy says "routed to review and approval" instead of
  "signed responses".

The file has a dated header note. `tests/schema-contract/catalog-module-claims.contract.test.ts`
pins both rows.

## Fixture imports

`IndLifecycle.tsx` now imports three value symbols from
`fixtures/ind-lifecycle-data.ts`. Each was read before it was allowlisted:

| Symbol | Contents |
|---|---|
| `INDL_STATUS_LABEL` | labels for the authoring-status values |
| `INDL_CLOCK_STATUS` | a label and tone for each 312.40/312.42 clock state, shown only over a recorded FDA receipt |
| `INDL_DELIVERABLES` | the card definitions; they name no programme (`indLifecycleNoFixtures.test.ts`) |

None of them is a record, sample data or an engine. The file's header now says
so.

## Admitted without a screen caller

The prefix matcher takes no parameters, so a claimed segment admits everything
mounted beneath it. I read each of these routes before admitting it:

- `POST /api/ind-lifecycle/cover-letter/pdf-from-records` and
  `POST /api/ind-lifecycle/annual-report/line-listing`. Each is its own
  deliverable's deterministic render, and the claim test names both.
- Under `/api/ind-forms`: `POST /qc`, `/:formId/pdf-from-records`,
  `/:formId/artifact-all`, `/1572/pdf-all` and `/3455/pdf-all`. All require
  the author role. The screen calls `/:formId/…` with a runtime form id, so no
  narrower prefix would work.

## Red, then green

`ind-launch-claim.test.ts` was named `ind-haq-launch-claim.test.ts` in reds
1–2.

| # | State | Check | Result | File |
|---|---|---|---|---|
| 1 | HEAD 18d58cbb2, new test only | claim test | 40 of 56 fail: every called path is `out-of-scope`, `/api/ind-checklist` is `unmapped`, and `ind-checklist` claims the safety routes | `red/1-…` |
| 2 | The naive flip (catalog only) | claim test | 31 of 56 fail: every safety and ICSR route answers `launch` | `red/2-…` |
| 3 | Registry narrowed, card still wired | `ci:launch-scope-api` | 3 paths `out-of-scope`: the card's safety-report, `/pdf` and `/file` | `red/3-…` |
| 4 | Catalog flipped, allowlist not updated | `ci:launch-scope` | 5 `fixture-free` findings | `red/4-…` |
| 5 | Mutation: `withheld` filter removed | `indLifecycleDeliverables.test.tsx` | "not offered" fails | `red/5-…` |
| 6 | HEAD catalog and registry, new tests | gate test, `launch-scope.test.ts` | 6 fail | `red/6-…` |
| 7 | The naive flip | gate test | 5 fail, including the hard-refusal case | `red/7-…` |
| 8 | Mutation: customer-copy file as at HEAD | catalog claims contract | 2 fail | `red/8-…` |
| 9 | Screen still on the client clock | `indLifecycleTargetDate.test.tsx` | 5 fail: the server's clock is not shown; no computing, failure or retry state; the client engines are still present | `red/9-…` |
| 10 | Before `/clock` was claimed | claim test | `/api/ind-lifecycle/clock` is `unmapped` | `red/10-…` |
| 11 | Mutation: `haq-manager` listed again | claim, gate and scope tests | 10 fail: HAQ paths answer `launch` | `red/11-…` |
| — | This change | all of the above | green | `green/` |

## Gates run (green)

- `ci:launch-scope`: 8 apps, 32 surfaces (31 at HEAD), 13 modules,
  fixture-free. Its selftest also passes.
- `ci:launch-scope-api`: 388 paths named by launch and shell screens, none
  refused. HEAD had 366; the tree also holds other sessions' concurrent edits
  to launch screens. `green/ci-launch-scope-api.txt` lists the 21 IND rows, and
  no `/api/haq-manager` path appears among the launch calls. Its selftest
  passes.
- Tests:
  - server: 12 files, 275 tests, including the catalog claims contract;
  - client: 19 files, 197 tests, including registryModel, shellNav,
    launchScopeLock, projectHomeLaunchScope, filingPathNoDeadEnds and every
    IND screen suite;
  - registry readers: 9 files, 442 tests.
- Repository gates, all passing: `ci:unreferenced-modules` (81 against a
  baseline of 81), `ci:undefined-css-classes`, `check:catalog-copy`,
  `check:compliance-claims`, `ci:internals-in-copy`,
  `ci:check-client-api-calls`, `ci:surface-discoverability`, and the four
  migration gates.
- `tsc --noEmit` is clean. ESLint shows no per-file warning increase against
  HEAD (`green/typecheck-and-eslint.txt`).

## Not this change

- **Making HAQ approval a governed signature** (signature, reason and role,
  with the package assembled only from signed answers) is what unlocks
  `haq-manager`. It is its own change.
- **The POST /clock role requirement.** The route requires the
  regulatory-author role, as every other card's route does. A reader without
  that role sees "Clock not computed" with the server's refusal, or "sign in
  with a regulatory-author account and retry" if the refusal carries no
  sentence. That is honest, but it is a role decision this change did not make.

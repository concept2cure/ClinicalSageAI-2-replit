# The `regional` engine — four market filing assessments that actually compute

**Head.** `concept2cure-v2`, 2026-10-12. Follows the coverage review in this
directory (`README.md`), which closed the UI-reachability half of the founder's
note of 2026-10-11 and left the other half open: of 61 declared report types,
43 had no engine, and 35 of those name a market in their title.

---

## 1. The question the coverage review left open

The review established that the 43 uncomputed types are shown honestly — the
canvas lists them under "Not computed in this release", and `POST /runs` answers
`REPORT_TYPE_NOT_COMPUTED` — and that wiring them to the readiness orchestrator
is exactly the defect QA 2026-10-08 (j8) closed: *"a report claiming an analysis
nothing performed."*

It also found **why** there are 43: 26 of the 61 are pathway labels over one
computation, with near-identical declared dependencies. Roughly six computations
promised eighteen times over.

So the question was not "write 43 providers". It was: **is there a computation
the platform already holds that is genuinely market-specific?**

## 2. There is exactly one, and it decides the whole shape

`shared/regulatory/regional-module1.ts` is the record of where FDA, EMA and PMDA
file Module 1 documents, with a `basis` on every heading and an `applies` rule
per application kind. Module 1 is the only regional part of the CTD — ICH M4
harmonises Modules 2–5 — so **a market's filing readiness IS its Module 1
content question**, and `requiredModule1(jurisdiction, kind)` answers it
deterministically, returning `required`, `undetermined` and `notApplicable`.

Its own docstring sets the boundary, and it is not a judgement call:

> Not modelled: Module 1 for any other regulator (CA, UK, CH, AU, CN, KR, BR,
> IN, SG). A caller gets nothing for those, never another regulator's tree.

`REGIONAL_MODULE1` kinds are **US ind/nda/bla/anda, EU maa, JP jnda**. Intersect
that with the registered report types and exactly four compute:

| Report type | Market | Kinds |
|---|---|---|
| `usa_fda.ind_safety_readiness` | FDA | ind |
| `usa_fda.nda_bla_filing_readiness` | FDA | nda, bla |
| `ema.maa_readiness_assessment` | EMA | maa |
| `japan_pmda.jnda_shonin_readiness` | PMDA | jnda |

Three facts fell out of that intersection that a plan built from the rule-pack
side had got wrong:

- **`usa_fda.ind_safety_readiness` computes.** The US tree models `ind`. A plan
  derived from rule-pack coverage listed only three types; verifying against the
  Module 1 record rather than taking that plan's word added the fourth.
- **The bound is the Module 1 record, not rule-pack coverage.** Both happen to
  give US/EU/JP today, but they are different facts, and the record is the one
  the computation reads. Widening the engine therefore means **adding a
  regulator's Module 1 tree with a basis per heading** — not adding a case to the
  engine. That is written into `filing-readiness.ts`'s header so the next session
  cannot widen it the cheap way.
- **Device types are excluded by the record, not by a list.** A device filing is
  not eCTD and has no Module 1 at all, so `US_510K`, `US_PMA` and `US_DE_NOVO`
  are refused by the same code path as Health Canada.

## 3. The `requireConfidence` question, decided on the shipped precedent

The engine measures no confidence, and all four types declare
`requireConfidence: true`. A plan recommended amending the taxonomy to drop it
from the three types it had found, calling it *"a taxonomy edit to three governed
type definitions"* to put to the founder.

Reading `truthfulness.ts` rather than accepting that shows the gate **does not
refuse** such a run:

```ts
if (rules.requireConfidence && status === 'final' && state.confidence == null) {
  status = 'partial';
  reasons.push('Cannot mark final: this report type requires a confidence, and none was computed for this run.');
}
```

It downgrades `final` → `partial`. And three **shipped** domain registers —
`ha.commitment_register`, `grants.portfolio_register`,
`lifecycle.obligation_calendar` — declare `requireConfidence: true` while
`computeDomainRun` returns `confidence: null`, so they already sit at `partial`
in production and nobody amended anything for them.

**Decision: the taxonomy is not touched.** Reasons, in order:

1. Amending four types would be an arbitrary carve-out against three shipped
   types that behave the opposite way.
2. `partial` costs nothing this report needs. It computes, renders, lists in the
   run history, schedules, and exports to PDF — `sendRunPdf` gates on a seal
   mismatch, never on status. Only `POST /runs/:id/finalize` refuses, which is
   correct: a content-gap assessment should not be sealed as final evidence on a
   figure nobody measured.
3. The ceiling is already surfaced. `Insights.tsx` renders
   `truthfulness.reasons` as *"Truthfulness gate — held at partial: …"*, so the
   reader is told why before they ask, in the gate's own words.
4. It avoids regenerating a deployed seed migration under CLAUDE.md Rule 1 for
   no functional gain.

## 4. What the engine refuses, and why each refusal exists

`regional/filing-readiness.ts` throws `RegionalNotComputed`, which the route
returns as `422 REPORT_TYPE_NOT_COMPUTED` with the reason, in six cases:

| Refusal | Why it is not optional |
|---|---|
| The program's recorded market is not the type's | **The j8 defect, one level down.** An FDA NDA filing-readiness report computed for a program recorded as an EU MAA is a market readiness nothing assessed for that market. |
| The program records no registry context | Picking a filing for it would invent the thing being assessed. |
| The filing kind has no Module 1 record | A device filing is not eCTD; an unmodelled regulator has no tree. Never another regulator's tree in its place. |
| The type's declared region moved away from its binding | A taxonomy edit that moves a type to another region without moving it here would assess the old market's Module 1 under the new market's title. |
| The scope is not one program | Only `project` scope is ownership-checked before the engine runs, and a submission id colliding with one of this org's project ids would be assessed as that project. A program group is a group of markets, not one market. |
| The program is another organization's | Fail-closed, org-filtered read. Not found, never an empty assessment of it. |

And one case that is **not** a refusal but a statement:

> **Coverage not assessed.** When no section and no governed artifact of the
> program records a CTD section code, nothing can be matched against the
> headings, so the report says so and emits **no** coverage figure and **no** gap
> list. Reporting every required heading as missing would turn an unrecorded
> program into a damning gap list — absence of a record of where content sits is
> not absence of content (CLAUDE.md: an error is never rendered as an empty
> result).

## 5. What it will not claim

- **A confidence.** `confidence: null`; the gate holds the run at `partial`.
- **Filing conformance.** The market statement comes from
  `services/regulatory/market-support.ts` verbatim — the same sentence the market
  rows, the New submission options and the New project picker show — so this
  report cannot disagree with them. `buildable` is the narrow claim (an outline
  AND Module 1 to the agency's own headings); everywhere else the packager files
  Module 1 flat or reuses another region's backbone, and that limit reaches the
  run as a blocker.
- **A declared dependency it did not compute, or computed only in part.** Each
  type's own `dataDependencies` are read from the deployed registry row. One the
  engine does not answer becomes a `missing` provider observation with its
  reason; one it answers only in part becomes a `partial` row naming the part.
  `module_completeness` is the second kind, and was the first thing this change
  got wrong about itself: listing it as fully computed would have let a
  Module-1-only examination read, in the run's evidence panel, as a claim about
  the whole dossier. Its row now says *"assessed for Module 1 only … does not
  examine Modules 2–5."*
- **A conditional heading as satisfied or as not required.** `undetermined`
  reaches the report as its own "Required if" row with the condition named.

## 6. Zero duplication

- The market statement is `readMarketSupport`, not a second copy of the rule.
- The Module 1 requirement is `requiredModule1`, not a second heading table.
- The declared region is the taxonomy's own `governanceRequirements.region`, read
  from the deployed registry row — not a region map in the engine. The engine's
  own binding is asserted **against** it rather than instead of it.
- `REGIONAL_FILING_TYPES` lives in a pure `regional/filing-types.ts` so
  `report-engine.ts` — the one place that says which engine computes a type —
  stays importable without a database, which its header promises.
- The scheduler reads the registry row through the engine's own `readDeclared`
  rather than carrying its own query, so a scheduled market report is exactly as
  honest as an interactive one.

## 7. Verified by making each check fail

| Guard removed / drifted | Tests that failed |
|---|---|
| The market-mismatch refusal (`ctx.jurisdiction !== binding.jurisdiction`) | 2 — the FDA-type-on-an-EU-program case and its mirror |
| The not-assessed guard (`codes.size > 0`) | 1 — every heading reported missing for an unrecorded program |
| The renderer's market branch | 6 — including the executive summary reading *"Submission readiness not computed"* on a report that computed a market assessment |
| The renderer's Gaps branch | 2 — "Gaps were not evaluated for this scope" in the same document as the section listing the gaps |
| One binding's market flipped (EU → US) | 4 — the kinds check, the taxonomy agreement, the deployed-seed agreement, and the refusal case |

**29 new tests** (20 in `filing-readiness.test.ts`, 9 in
`render-market-assessment.test.ts`), plus the updated cases in
`report-engine.test.ts` and `worker-register-engine.test.ts`.
`server/services/report-os/` is green at 405 tests over 34 files.

Two of those rows are defects this change found in itself, both of the j8 family
but in the **renderer** rather than the engine:

1. `readinessBlocks` reads `summary.regulatory`, a key only the readiness
   orchestrator writes. Without a market branch, a market assessment fell
   through to it and its executive summary said the opposite of what the run
   performed.
2. `gapsSectionFor` reads the same key, so a market assessment printed *"Gaps
   were not evaluated for this scope"* in the same document as the section
   listing the gaps it had just evaluated. `gapsWereEvaluated` now recognises
   both evaluations, and the not-assessed case states **why** nothing could be
   evaluated rather than the generic scope sentence.

The last row is the drift gate. The run-time region assertion catches a drift one
run at a time, after the type is already being offered; the test catches it in
CI, against both the taxonomy source **and** the deployed seed
(`migrations/20260930_report_type_registry_seed.sql`) — which is what
`readDeclared` actually reads in production.

## 8. What the UI gained, and one thing it stopped claiming

`runnable` on the canvas catalog is `reportEngineFor(typeId, 'project') != null`,
so the four types became runnable with no client change: they appear as catalog
controls, as schedulable types, and as ANA tool targets.

A new field was needed for one claim the catalog was already getting wrong.
`CanvasReportType.computedScopes` is the scopes an engine actually computes a
type over, a subset of the declared `allowedScopes`. The card printed
`allowedScopes` as *"Runs over: program, project, submission"* — which is where
a type may be **declared**, not where it runs. A market assessment declares three
and runs over one; the evidence trace declares three and runs over a document.
A reader was being offered a run at a scope that answers
`REPORT_TYPE_NOT_COMPUTED`.

## 8b. One note this made false, which was already a finding

The global-harmonization dashboard's empty grid said:

> No per-market assessment is in the governed record, so every market cell reads
> "--". **Connect the live regional providers to populate the deltas.**

The 2026-10-01 honest-state review had already flagged that sentence
(`docs/evidence/reviews/2026-10-01-reporting/honest-state.md`, evidence line for
`Insights.tsx:764`): it tells the customer to connect something, without reading
the record.

Building the engine made it false in a second way: the regional providers now
exist, and connecting them still would not fill that grid. The real reason is
structural, and it is the refusal the engine exists to make — **a market
assessment is of the filing the program is recorded for, and a program records
one.** Assessing this program against a second market would assess a filing that
does not exist. The note now says that, and points to the catalog for the
assessment of the program's own market.

What a harmonization view *could* honestly carry per market is the
`MarketSupport` statement, which is market-level and does not depend on the
program's filing. Wiring it needs two things this change does not do: the
program's recorded application type on the canvas bootstrap (`filing` is an
explicit null there today) and a claim on `/api/submissions/market-support` in
the insights surface registry. Recorded here as the next tranche rather than
half-built.

## 9. Files

| File | Change |
|---|---|
| `server/services/report-os/regional/filing-types.ts` | New, pure: the four types, their markets, the registry→kind map, the region→jurisdiction map |
| `server/services/report-os/regional/filing-readiness.ts` | New: the engine |
| `server/services/report-os/regional/__tests__/filing-readiness.test.ts` | New: 20 cases |
| `server/services/report-os/report-engine.ts` | `'regional'` in the union; dispatch at project scope; lazy `computeRegionalRun` |
| `server/services/report-os/render/render.ts` | `marketBlocks` + `marketSection`; `readinessBlocks` no longer runs for a market assessment |
| `server/services/report-os/render/__tests__/render-market-assessment.test.ts` | New: 9 cases |
| `server/services/report-os/render/render.ts` | `gapsWereEvaluated` recognises the market assessment's own evaluation; the Gaps section lists its headings |
| `server/services/report-os/regional/compare.ts` | Header note: unreachable by design, not a gap and not a sweep (see below) |
| `server/routes/report-os.ts` | Regional dispatch; `RegionalNotComputed` → 422 with its reason |
| `server/routes/insights-canvas-routes.ts` | `computedScopes` on the catalog row |
| `server/services/report-os/scheduling/worker-register.ts` | Regional dispatch in the sweep |
| `client/src/concept2cure/v2/surfaces/{Insights,InsightsCatalogPanel,insightsLibraryShared}.tsx` | `computedScopes` threaded through; the card says where it runs |

## 9b. `regional/compare.ts`, left in place on purpose

`compareRegions` / `renderRegionComparison` have no caller outside their own
test, and `MarketReadiness` — a per-market `readinessScore` for ONE program
across SEVERAL markets — is produced by nothing in the repository.

It is **not** a parallel implementation to migrate onto the new engine
(CLAUDE.md, zero duplication): the two answer different questions, and supplying
this one's inputs means inventing a readiness score per market for filings that
do not exist. It is also **not** dead code to sweep: the working agreement
requires naming the reachable replacement by path before deleting a capability,
and there is none, which makes removal a product decision rather than a cleanup.

So it stays, unwired, with a header saying all of that — the five
deleted-and-rebuilt editor generations are the reason that note is worth more
than the deletion.

## 10. Rows informed

**D2** (the Reporting app): 39 of 61 types now have no engine, down from 43 —
and the four that gained one gained a market-specific computation, not a
relabelled digest. The remaining 35 are unchanged in posture: honestly shown as
not computed, each for a reason the market itself states.

Not green. The catalog-shape decision from `README.md` §2 (26 pathway labels
over ~6 computations) is still a founder call, and C-1, C-3 to C-8 remain open.

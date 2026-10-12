# Biostatistics: the engines, and the paths that carry their numbers (D2)

**Row:** D2, launch catalog. **Filed 2026-10-11**, for work done 2026-10-05 → 2026-10-11.

The founder's instruction of 2026-10-11: *"all aspects of our platform and all
apps and use cases where biostatistics is needed must be there and fully
working."*

This record covers what was found, what was repaired, and what is honestly
still owed. The short version: the deterministic statistical engines were
wrong in eleven named places, five launch-reachable paths carried figures a
model had supplied rather than an engine computed, and four engines were both
unreachable and wrong. All of that is fixed or deleted. What remains owed is
listed at the end, and none of it is hidden behind a green claim.

## How the defects were found

Three independent read-only sweeps ran first, then every finding was repaired
in its own lane and each lane was checked by a second agent told to refute it.

1. **Engine inventory** — every statistical computation in the repository,
   with duplicates flagged. It found thirteen copies of the normal CDF and
   eight separate two-arm sample-size engines.
2. **Launch wiring** — for each use case a life-sciences customer has, whether
   it is reachable and what it runs on.
3. **Numerical verification** — 163 checks of the engines against published
   reference values (scipy, R, gsDesign, G*Power, and the source papers).
   **37 failed.** The canonical `server/services/stats/*` passed; the parallel
   copies on live routes did not.

Everything below was repaired against a reference value or a published method,
never against another implementation in this repository.

## What was wrong, and what it is now

### The foundation

`server/services/stats/normal.ts` — every sample size, power, interim boundary
and confidence interval in the platform is computed from Φ and Φ⁻¹, and the
group-sequential engine integrates over them recursively. The CDF was
Abramowitz & Stegun 26.2.17 (error 7.5e-8) and the quantile's Halley
refinement was taken *against that CDF*, so the "refined" value carried the
CDF's error: z(0.975) = 1.95996280 against a true 1.95996398. The header
promised 1e-12. The CDF is now W. J. Cody's rational Chebyshev approximation —
the algorithm behind R's `pnorm` — at a relative ~1e-16 including the far tails
(Φ(−10) = 7.6e−24 exactly), checked against published values and against
Marsaglia's independent series before use.

### The engines

| Capability | Was | Is | Reference |
|---|---|---|---|
| TOST equivalence | 63/group (and 50 by another path) | 69/group | Chow, Shao & Wang §3.2.3 |
| 2×2 crossover | 64 total (periods multiplied in) | 32 total | Julious 2004 |
| AUC comparison | 1/group (variance ÷ 100) | 10/group | Hanley–McNeil 1982 |
| Diagnostic sensitivity | 283 (hybrid, 5-point margin hard-coded) | 363 | one-sample vs performance goal |
| "Dunnett" | 0.016952 (actually Šidák) | 0.018826 | Dunnett 1955 |
| Two-sample means, "t-test" | 63 (normal approximation) | 64 | R `power.t.test` |
| Binary risk difference | 393/arm | 93/arm (103 with continuity correction) | Fleiss |
| Time-to-event | 248 "subjects" | 247 **events** | Schoenfeld |
| LD–O'Brien–Fleming, 2 looks | 3.258 / 2.259 | 2.963 / 1.969 | gsDesign |
| LD–Pocock, 2 looks | 2.420 / 2.594 | 2.157 / 2.201 | gsDesign |
| Conditional power at Z=2, t=0.5 | 0.185 (computed under H0, labelled "current trend") | 0.8903 | B-value form |
| Predictive power, same design | 0.247 | 0.8074 | Spiegelhalter, Freedman & Blackburn 1986 |
| Power at 80% of planned effect | 0.512 (power × 0.64) | 0.611 | exact, from the design's noncentrality |

Two structural repairs behind that table:

- **The engine refuses rather than assumes.** It substituted a hazard ratio of
  0.5 for an effect ≥ 1, a crossover correlation of 0.5, an AUC target of
  0.85, a performance goal of 0.85, and sensitivity/specificity/prevalence of
  0.90/0.90/0.50. Each is now a `ComputationRefusal` naming what is missing.
  A kappa sizing whose variance carried a `+0.01` fudge with no published
  basis is refused outright: the published methods need a null κ₀ and the
  marginal prevalence, which the input contract does not carry.
- **One implementation per capability.** The private normal CDF and quantile
  copies in the AnA engine, the adaptive service and the trial-statistics
  knowledge engine are gone; all three import `stats/normal`. The adaptive
  service and the AnA adaptive tool now solve boundaries through
  `stats/group-sequential-oc`, the exact recursive-integration engine.

Also fixed while there: efficacy was tested on |Z| against one-sided
boundaries, so a strongly negative Z counted as efficacy (simulated type I
error ≈ 0.05); each interim was solved as if it were the first look; and the
Monte Carlo drew each look independently instead of as one correlated
sequence.

### Figures a model supplied, on paths a launch app reaches

CLAUDE.md Rule 2: numbers, verdicts and governed content come from
deterministic engines; the model narrates. Five breaches, all closed:

1. **CSR → Module 2.** The CSR builder drafts every ICH E3 section with a
   model from study metadata alone — no SAP, no datasets, no engine output.
   A drafted §11.4 could state a p-value and an effect size nobody computed,
   and `load-csr-inputs-for-project` copied that text into Module 2.5 and 2.7
   as the study's **primary result**, which the submission orchestrator
   assembles inside eCTD compile, a launch surface.
   `csr/unsupplied-statistics.ts` now finds such figures deterministically and
   the section falls back to its template, recording the refused figures in
   its lineage; `primaryResult` is always the pointer to §11.4. The §9.7
   template also asserted that the SAP was finalised before database lock,
   that the population was ITT and that a two-sided 0.05 level was used — none
   supplied, all now placeholders.
2. **AnA's Module 2.5 / 2.7 tools** (both in the launch scope) composed from a
   `csrs[]` array in the tool input — which the model writes. They now read the
   program's completed CSR records through the loader the orchestrator uses,
   and say so; figures in the tool input are never used.
3. **Statistical defensibility** asked a model for 0-100 scores on seven
   dimensions and derived the rating and reviewer-risk level from them. It now
   runs the deterministic judgment engine — the one AnA's
   `assess_statistical_defensibility` tool already ran — and answers 422 with
   the missing inputs named when it cannot judge a design. (It was also broken
   from its only caller: the workbench sent an endpoint string and no
   statistical methods, and the service threw.)
4. **Figure generation** asked a model for a Kaplan-Meier curve "showing HR
   and 95% CI" and for forest-plot point estimates and intervals — from raw
   rows, which means the model computes them. Both types are refused before
   any model call; the others may plot an interval only when the data carries
   one.
5. **The design optimizer** filled every gap with a figure from nowhere: a
   sample size by endpoint keyword (survival 400, PFS 350, response 200),
   a whole recommendation when there was no data at all, a "power gain" of
   log(multiplier) × 0.1 added to an approval rate, and sample-size ranges by
   endpoint name. It now reports the precedents' median or null, recommends
   nothing without data, and does not vary sample size, because the outcome
   data does not relate N to approval.

### Engines deleted

Four modules were both unreachable and numerically wrong, so they are gone
rather than repaired (zero duplication; the canonical engine is
`server/services/stats/*`). `monte-carlo-service` (its log-rank gave
p = 0.998 where the correct value is 4.2e-5), `biostats-signal-engine`,
`server/services/ptrs/` (reachable only from a dead caller), and ~75
unreached methods of `statistics-service` — among them a Schoenfeld with a
factor of 2, which halved every event count. 10,247 lines removed in that
commit alone. Every
deletion names its replacement by path in its commit, and
`git log --all --diff-filter=D` confirms none had been deleted and rebuilt
before.

### The method a design actually got

A reference suite pins a formula. It does not prove anything *reaches* that
formula. Three defects lived in exactly that gap — the engine function correct
and reference-pinned, nothing routing a design to it — and a fourth was
introduced by the repair above and caught the same way.

| Design | What a caller read | What it reads now |
|---|---|---|
| 2×2 crossover (d 0.5, ρ 0.5) | `sampleSize` = 128, `method` = "Two-sample t-test (superiority)" | 32 subjects in 2 sequences, method naming Julious 2004 |
| ROC / AUC endpoint, any track | refused: `missing_input`, field `sensitivity` | 10 diseased + 10 non-diseased, method naming Hanley–McNeil |
| Protocol declaring `structuralDesign: 'crossover'` | adapted as two parallel groups, no gap raised | adapted as a crossover, or refused for want of ρ |
| Protocol declaring factorial / umbrella / MAMS | sized as two parallel groups, silently | same figure, with the caveat recorded as a gap |

- **The crossover N was computed and then set aside.** `computeEnhanced`
  attached `crossoverResult.withinSubjectN` (32, correct) while leaving
  `sampleSize.total` holding the parallel-group figure (128) and `method`
  reading "Two-sample t-test". Every surface and the bridge read
  `sampleSize.total`. A crossover trial was therefore sized at four times the
  subjects it needs, on the headline figure, with nothing saying the declared
  design had been ignored. `compute()` now chooses the crossover before the
  track, because a crossover is the design, not an add-on to one.
- **An ROC design was refused for a field it does not have.** The 2026-10-11
  change that stopped six endpoint types being silently sized as continuous
  routed `auc_roc` to `computeDiagnostic`, which requires sensitivity,
  specificity and prevalence. So a *complete* AUC design (aucTarget 0.85,
  aucNull 0.5) threw `missing_input` naming `sensitivity`. That is this
  session's own defect: it replaced a wrong number with a wrong refusal, and
  `computeAUCComparison` stayed reachable from its test only. `auc_roc` is
  now sized by the AUC method on every track — the same
  endpoint-not-track principle the kappa gate needed.
- **`DiagnosticComputationResult.sensitivity` and `.specificity` are now
  optional.** They were required, so the AUC path filled them with zeros and
  `document-generator.ts` printed "**Sensitivity**: 0.0%" into a generated SAP
  section — a fabricated figure in a governed document. Both the document
  generator and the SME router now print only the figures the engine computed.
- **The bridge dropped the structural design entirely.** `studyTypeFor` maps
  five `StructuralDesign` members; the other five fell through to
  `superiority`, and nothing else in `design-adapter.ts` read the field. A
  crossover protocol was adapted into a parallel-group input and sized as one.
  It now maps `crossoverPeriods: 2`, takes ρ from the plan's MMRM assumptions
  **with that substitution disclosed as a `defaulted` gap**, and blocks when no
  correlation is recorded rather than producing the parallel figure. Factorial,
  umbrella and MAMS still get the two-group figure — a defensible
  per-comparison starting point — with a `defaulted` gap that says so.

## What the UI can now ask for

The directive of 2026-10-11 was that every use case be *there*, not merely
implemented. Three places were short of that.

- **The sizing form offered four endpoint types; the engine sizes nine.**
  `surfaces/Biostatistics.tsx` let a user choose continuous, binary,
  time-to-event and sensitivity/specificity. Ordinal, count, composite,
  AUC/ROC and agreement could not be asked for at all, and there was no
  crossover control — although `request-input.ts` and `input-normalizer.ts`
  have carried `aucTarget`, `aucNull`, `crossoverPeriods`,
  `withinSubjectCorrelation` and `agreementTarget` on the wire since the
  contract was written. All nine endpoint types are now selectable, each with
  the controls its method needs, plus two presets (ROC / AUC, 2×2 crossover).
  The agreement endpoint is selectable *because* the engine refuses it: the
  refusal names the published methods and the inputs they need, which is a
  better answer than a design a client cannot express.
- **The accuracy controls were gated by the sponsor's track.** Sensitivity,
  specificity and prevalence appeared on the `diagnostics_ivd` track only, so a
  pharma sponsor running a diagnostic sub-study could not enter them — the same
  track-instead-of-endpoint mistake as the engine's. They are now gated by the
  endpoint, matching how the engine chooses the method.
- **Two client segments had no biostatistics surface at all.** `medtech` and
  `diagnostics` carried neither `biostatistics` nor `biostat-workbench` in
  their catalogs, while the engines built for them — diagnostic accuracy
  sizing, co-primary sensitivity/specificity, MRMC reader studies, Bayesian
  device sizing, AUC comparison — were running and reachable only from the two
  pharma segments. `health` carried only the surface
  `docs/SURFACE_DECISIONS_2026-10-08.md` scraps as a place. The workbench is
  now in all three catalogs. (It stays behind the launch flag; this makes it
  reachable for the segments that need it when the flag opens, rather than
  leaving a device or IVD sponsor with no statistical surface in the catalog
  at all.)
- **The browser's own statistics engine is gone.** `surfaces/Biostatistics.tsx`
  carried a ~520-line copy of the server engine — its own Abramowitz & Stegun
  CDF, the silent HR = 0.5, a survival N halved by dividing events by 2, the
  TOST error, the hard-coded diagnostic margin — and no reference test. Users
  touched that copy, not the tested server engine. It is deleted; the surface
  calls `/api/ana-biostats/compute` and `/document`, so the prose and the
  figures come from one result and cannot disagree. The module now exports
  exactly `['Biostatistics']`.

### Defects found by adversarially verifying this session's own work

Each repair lane was checked by a second agent told to refute it. They found
six live defects in the lanes' own output and in the code around it — none of
which any test caught, and three of which made the honest-refusal work above
invisible or crashed the pane that renders it. All six are fixed.

1. **Every route turned a refusal into a 500.** `server/routes/ana-biostats.ts`
   sent every throw to `serverError`, so a `ComputationRefusal` reached the
   browser as `500 INTERNAL_ERROR, "Something went wrong while saving compute.
   The problem has been logged."` The refusal contract was built on 2026-10-05
   and the tool path was fixed on 2026-10-11; the HTTP surface was not, so the
   browser could never show a refusal however honestly the engine phrased one.
   A refusal is now **422** with the engine's sentence as `error` and
   `{refusal, code, field}` under `details`, through one mapper used by all
   eleven handlers. A missing tenant is **403**, not 500. Pinned by
   `server/routes/__tests__/ana-biostats-refusal-is-422.test.ts` (8 cases; 5 read
   500 before the fix).
2. **The bridge's read path did the same.** `bridge-service.ts computeFor` called
   `computationEngine.compute` with no catch, so a refusal propagated through
   `assessDesign` into `serverError`: "Something went wrong while assessing the
   design." The assessment now carries `refusal: {code, message, field}` and
   the panel prints the engine's own sentence.
3. **The client lost the sentence anyway.** `serverMessage` (queryClient.ts)
   read `error.message`, `message`, `detail` and a bare non-enum `error` — but
   the bridge refuses with `{error: 'CANNOT_SIZE', details: {message: '<the
   sentence>'}}`, and `CANNOT_SIZE` is enum-shaped, so the refusal degraded to
   "Couldn't complete that request. Try again." — generic copy, and the wrong
   advice for a design that will be refused every time until an input changes.
   It now reads `details.message`, which is the `clientError` envelope the whole
   server uses.
4. **A non-array `assumptions` unmounted the whole result pane.**
   `biostatEngineResult.tsx` guarded `adapter.gaps`, `readiness.checks`,
   `provenance`, `judgment.dimensions` and `escalationReasons` with
   `Array.isArray` and left `computation.assumptions` and `dimension.flags`
   undefended, so `assumptions.map is not a function` rendered an error as
   nothing — against the file's own stated discipline.
5. **A figure was drawn beside a blocking gap, and the governed write stayed
   enabled.** The invariant "no number for a design the bridge says is
   incomplete" lived only in `design-adapter.ts` (`input: blocking ? null :
   input`). One bad response or one stale cached assessment was enough. It is
   now enforced where the figure is rendered as well (`engineFigureIsUsable`),
   and `sampleSize.total: 0` reads as absent rather than as "0 subjects" — the
   same file's "never a zero standing in for an absent figure", which it was
   not keeping. Pinned by
   `client/src/concept2cure/v2/__tests__/engineResultNeverFabricates.test.tsx`
   (12 cases; 8 failed before).
6. **Two false statements in a Part 11 audit trail.**
   `collaborative-sap-service.getAuditTrail` stamped `version_locked` at
   `v.createdAt` — `sap_versions` has no `locked_at` column, so the trail
   asserted every locked version was locked the instant it was created, and the
   sort then placed the lock before the creation it followed. And it rendered a
   legacy `signatureId`/`approvedBy` pair as a `version_signed` event, although
   no writer has set those since `505f71263` removed the route that took the
   signer from the request body and verified nothing. The lock entry now
   carries `timestamp: null` and says the time is not recorded, sorting last
   for its version; the legacy entry is marked `unverified` with what it
   actually is. Pinned by
   `server/services/__tests__/sap-audit-trail-no-false-times.test.ts`
   (8 cases; 5 failed before). **Recording the lock time properly needs a
   `locked_at` column** — a migration-set entry under Rule 1 — which is owed,
   below.

Also fixed from the same reports: `Number(req.params.sapVersionId)` reached the
service as `NaN` with no guard (now 400); `biostatBridge.tsx` carried a third
inline copy of `computedTotalN` (now calls it); and the `where` strings on the
pure-compute routes said "saving compute" in a 500 sentence about arithmetic.

## Verification

Every repair was shown failing first. Four new reference suites pin the
engines to published values:

| Suite | Tests | Against the previous code |
|---|---|---|
| `tests/biostat/normal-precision-reference.test.ts` | 19 | 18 failed |
| `tests/biostat/ana-sizing-reference.test.ts` | 25 | 22 failed |
| `tests/biostat/adaptive-and-spending-reference.test.ts` | 15 | 14 failed (the 15th could not run — the function was not exported) |
| `tests/biostat/study-design-and-fragility-reference.test.ts` | 15 | 15 failed |
| `tests/biostat/design-dispatch-reaches-its-method.test.ts` | 13 | 11 failed |
| `server/services/biostatistics-bridge/__tests__/structural-design-reaches-the-engine.test.ts` | 9 | 8 failed |
| `server/routes/__tests__/ana-biostats-refusal-is-422.test.ts` | 8 | 5 failed |
| `client/src/concept2cure/v2/__tests__/engineResultNeverFabricates.test.tsx` | 12 | 8 failed |
| `client/src/concept2cure/v2/__tests__/biostatEveryEndpointAskable.test.tsx` | 22 | 16 failed |
| `server/services/__tests__/sap-audit-trail-no-false-times.test.ts` | 8 | 5 failed |

The last two were written for the dispatch defects above, and they close the
gap a reference suite leaves: they assert what `compute()` and the design
adapter *return*, not what the formulas compute. Both were run against the
previous code first — 11 of 13 and 8 of 9 failing — and the cases that passed
either way are named in each file as the guards they are.

`tests/biostat` as a whole: **355 tests pass across 16 files.** The adaptive
lane additionally re-broke its own code six ways and confirmed the tests caught
each; where a deliberate break initially passed, it added the check that
catches it. `npm run typecheck`: 0 errors. `ci:unreferenced-modules`: 81,
matching the baseline. The push gates ran on every commit: the ESLint
warning ratchet reported that the pushed files gained no warning, and
several shed many (`statistics-service.ts` 51 → 11,
`adaptive-trial-operations-service.ts` 17 → 12).

Existing expectations were changed in four places, each because it pinned
wrong behaviour, and each is named in its commit: the "t-test" sizes
(63 → 64, 175 → 176) pinned the normal approximation under a t-test label; the
kappa case pinned the fudge result; a CSR completeness case asserted that a
§12.3 draft stating "312 deaths … 47 serious adverse events" — counts nobody
supplied — was stored as drafted; and the defensibility test covered the model
scoring path that no longer exists.

## Where biostatistics now stands, by use case

| Use case | Where | State |
|---|---|---|
| Study design: sample size, power, endpoint type | AnA tools; protocol development's Statistics tab | engines correct and reference-pinned |
| Defensibility / reviewer risk | deterministic judgment engine | verdict, risk and recommended action, no model |
| Interim design, conditional and predictive power | canonical exact engine | boundaries match gsDesign |
| CSR §9.7 / §11.x statistics | guarded | a model-stated figure is not stored |
| Module 2.5 / 2.7 statistics | bound to CSR records | model-supplied figures ignored |
| Device / IVD accuracy sizing | engine; workbench; biostatistics surface | refuses without the accuracy targets; the design schema records none, and the bridge reports that as a blocking gap. The device and diagnostics segments can now reach the workbench |
| ROC / AUC sizing | engine; biostatistics surface (ROC preset) | Hanley–McNeil, on every track. Not expressible in a protocol: the design schema's `EndpointType` has no ROC member, and the bridge says so |
| 2×2 crossover sizing | engine; biostatistics surface (crossover preset); protocol bridge | Julious 2004 on the headline figure; the bridge maps a crossover protocol or refuses for want of ρ |
| Agreement (kappa) sizing | engine refuses | selectable, and the refusal names Donner & Eliasziw / Flack and the inputs the contract lacks |
| Ordinal / count / composite endpoints | engine | continuous approximation, disclosed in the method and in the assumptions |
| Submission Readiness statistical gate | — | **owed** (below) |
| Reporting & analytics statistical reports | — | **owed** (below) |

## Owed, and why

- **No pre-dispatch statistical gate.** `ectd/dispatch-readiness.ts` is
  structural only. A protocol ↔ SAP ↔ CSR consistency check exists and is
  deterministic (`statistical-defensibility-service.checkConsistency`) but
  compares values the *caller* supplies; no loader binds it to record ids.
  Building those loaders is the next piece of work, not a line change.
- **The `biostatistics` surface is scrapped but not yet removed.**
  `docs/SURFACE_DECISIONS_2026-10-08.md` (founder delegation of 2026-10-07)
  scraps it as a place, naming `biostat-workbench` as the surface that
  delivers the outcome — and that record anticipates the code removal going in
  "a later change that names that surface". It touches ten test files, the
  registry, the surface views, the navigation and an RBM fixture, so it is
  scheduled, not squeezed in. The defect that mattered is its in-browser
  engine — a ~220-line copy of the server engine carrying every bug in the
  table above (its own Abramowitz & Stegun CDF, the silent HR = 0.5, a
  survival N halved by dividing events by 2, the TOST error, the hard-coded
  diagnostic margin) and no reference test at all. Users touched that copy,
  not the tested server engine. That copy is now deleted and the surface calls
  the server (see "What the UI can now ask for" above); removing the surface
  itself remains the scheduled change.
- **The governed SAP lifecycle has no UI.** Its routes exist and nothing
  reaches them. Wiring or deleting that surface area is a product call.

  **Correction (same day).** An earlier draft of this line said `signVersion`
  writes a caller-supplied signer name with a Part 11 check that only asserts
  the fields are non-empty, and that repairing it was in flight. That was read
  off a stale working copy: both `CollaborativeSapService.signVersion` and
  `POST /api/biostat/sap/:sapVersionId/sign` were **already removed** on
  2026-10-08 in `505f71263` (P-25 follow-up), which `git merge-base
  --is-ancestor 505f71263 HEAD` confirms. `server/routes/biostatPlatform.ts`
  carries the tombstone naming the replacement by path
  (`services/part11/reverify-signer.ts`), and
  `tests/biostat-sap-sign-route-removed.test.ts` pins the removal — 2 tests,
  both passing. There was no defect left to repair. The session that set out
  to fix it reported blocked rather than re-adding the method to satisfy its
  own brief, which is the right outcome.
- **The adaptive plan's RUN-TIME path has no UI.** Design-time operating
  characteristics are reachable (the workbench's group-sequential calculator on
  `/adaptive/oc-exact`, the exact recursive-integration engine). What a DSMB
  actually needs is not: `POST /adaptive/plan`,
  `/adaptive/:planId/interim-snapshot`, `/adaptive/:planId/evaluate/:snapshotId`,
  `/adaptive/:planId/ssr/:snapshotId`, `/adaptive/:planId/decision` and
  `/adaptive/:planId/idmc-report/:lookNumber` are mounted, tested, and reached
  by no client code — `grep` over `client/src` for any of them returns nothing.
  That is where the repaired conditional power (0.185 → 0.8903), predictive
  power (0.247 → 0.8074) and the spending boundaries at a real interim live.
  They are correct, reference-pinned against gsDesign, and a sponsor cannot get
  at them. Building that surface is a plan lifecycle with stored snapshots and a
  governed decision ceremony — the next piece of biostatistics work, and not a
  line change.

  Everything else is reachable: all fifteen `/api/biostat` design-statistics
  engines have a workbench calculator (only `/region-rules/*`, a regional-rules
  catalog rather than a statistical method, has none), and the core sizing,
  comparison, judgment, document and missing-data paths are reached from the
  biostatistics surface, the protocol Statistics tab and the AnA tools.
- **`sap_versions` records no lock time.** The audit trail now says so rather
  than substituting the creation time, but the honest answer is a `locked_at`
  column written by `lockVersion` — a migration-set entry, and under Rule 1 an
  additive one, not squeezed into this change. `lockVersion` also records no
  locker: `biostatPlatform.ts` resolves a `userId` the service never receives.
  Giving that act the platform's signing ceremony is the product call the SAP
  item above names.
- **No statistical qualification package.** The engines are now pinned to
  published reference values, which is the input to such a package, not the
  package itself: there is no IQ/OQ/PQ for them and no traceability matrix.
  Competitors publish one, and it gates technical evaluation.

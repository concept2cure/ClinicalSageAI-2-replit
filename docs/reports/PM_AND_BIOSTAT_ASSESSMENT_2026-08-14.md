# Project management & biostatistics — measured assessment, 2026-08-14

**Method:** the same as the tenancy work — every number below came from executing
the code or reading the whole file, not from a design document. Where a claim is
unverified it says so.

**CMC is deliberately out of scope** (owned by a concurrent session).

---

## 1. Project management — substantially real, one structural question

### 1.1 Mounting

12 of 13 PM routers are mounted. `server/routes/programs.ts` is **not** — no
importer anywhere, and it is already carried in
`scripts/ci/unreferenced-modules-baseline.json`.

**Diagnosed: dead code, superseded — and no footgun.** Unlike `tenants.ts` (R9),
which held an ungoverned cascade delete, this router's `DELETE /:id` is a
tenant-scoped SOFT ARCHIVE (`status: 'archived'`). Its 9 endpoints are covered
elsewhere:

| Concern | Live surface |
|---|---|
| Reads (list, detail, milestones, activity) | `regulatory-programs.ts` → `/api/regulatory-programs`, mounted |
| Creates | `POST /api/workspace/projects` (`register-advanced-platform-routes.ts:239`), mounted |

No client code references `/api/programs`.

**The finding worth acting on is the inverse of the one expected.** Program
creation runs through an inline **raw-SQL** route that branches on project type
and writes `cer_projects` / `fda_510k_projects` directly, while a fully typed,
zod-validated, Drizzle implementation with the same surface sits unmounted. The
dead file is the better implementation.

Not resolved here because both dispositions are product calls with real
consequences: mounting `programs.ts` adds nine live write endpoints with no
tests, and deleting it discards the stronger implementation in favour of raw SQL.
Recorded so the decision is made deliberately rather than by neglect.

### 1.2 Is it one system or three?

Three task routers (`taskManagement`, `taskBoard`, `unifiedTasks`) initially read
as fragmentation. It is not. `unified_tasks` is a genuine cross-module registry —
it carries `module_type`, `source_entity_id`, `source_entity_type` and is the FK
target of `cross_module_task_links` — and **ten services write into it**
(sentinel, grants, compliance-triage, research-compliance, ana-ri governance and
others). `project_tasks` is a separate, narrower per-project concept.

So the design is a hub (`unified_tasks`) plus module-local tables, which is
coherent. The three routers are views onto the hub, not competing models.

### 1.3 Capability coverage

Every PM concept modelled on `unified_tasks` has live readers, so none of it is
decorative:

| Capability | Files reading it |
|---|---:|
| Scheduling (start/due dates) | 142 |
| Effort tracking (estimated/actual hours) | 18 |
| Assignment | 16 |
| Approvals | 16 |
| Critical path | 11 |
| Dependencies (`blocked_by` / `blocks`) | 10 |
| Escalation paths | 3 |
| Automation rules | **1** |

**The two thin ones were traced, and they are worse than thin — both are
WRITE-ONLY.** The counts above are references, not readers, and following them
resolves the question:

- `automationRules` — its single reference is
  `taskManagement.routes.ts:113`, `automationRules: jsonValueSchema.optional()`.
  That is a **zod input field**. The API accepts automation rules, validates
  their shape and persists them. Nothing anywhere reads the column to act on it.
- `escalationPath` — three references, none of them a reader:
  `taskManagement.routes.ts:114` is the same zod input field,
  `mdx-client-review.ts:124` is a *comment*, and
  `sop-development.ts:629` is an unrelated `id: 'escalation_path'` in a question
  flow.

So a customer can configure an escalation path on a task, the API returns 200,
the value is stored — and nothing ever escalates. Same for automation rules. This
is the `max_storage` pattern exactly (§R6): a column written by the product,
read by nothing, presented as a capability.

Not fixed here: an automation/escalation engine is a feature, not a repair, and
building one uninstructed would be a much larger change than this assessment
warrants. Named precisely so the choice is explicit — implement it, or stop
accepting the field.

### 1.4 Tenancy

`unified_tasks.organization_id` is `INTEGER NOT NULL`, so the table is policied by
the isolation sweep. PM inherits the tenancy work already done; no separate gap
found.

---

## 2. Biostatistics — correct mathematics, almost entirely unguarded

### 2.1 Connectivity: already connected

The brief was to "connect" the module. Measured, it already is:

| Router | Endpoints | Mounted |
|---|---:|---|
| `biostatPlatform` | 48 | yes |
| `biostat-design-stats` | 15 | yes — via `router.use()` inside `biostatPlatform` |
| `ana-biostats` | 11 | yes |
| `statistical-defensibility` | 6 | yes |
| `ana-biostats-governed-documents` | 1 | yes |

`biostat-design-stats` looks unmounted if you grep the bootstrap files, which is
how it first appeared here. It is mounted onto the same `/api/biostat` router by
`biostatPlatform.ts:844`. Client surfaces (`Biostatistics.tsx`,
`BiostatWorkbench.tsx`) exist and are tested. **No connectivity work was needed.**

### 2.2 The real gap: 81 endpoints, 10 numeric assertions

The statistics are correct. They are also barely pinned. Measured across the two
suites covering the platform and design-stat routes:

| Suite | Assertions | Shape/range only | Pin a numeric value |
|---|---:|---:|---:|
| `biostat-design-stats-routes.test.ts` | 39 | 25 | 2 |
| `services/biostatPlatform.test.ts` | 63 | 40 | 8 |

**102 assertions across 63 endpoints; 10 check that the answer is right.** The
rest check that a number of the correct type came back with a 200. Under that
suite a transposed coefficient, a wrong tail or a mis-signed spending function
ships green — and these numbers go into the SAP, the protocol and the submission,
where a regulator will reproduce them.

### 2.3 Verifying the mathematics

Before writing tests, the implementation was checked against published Lan–DeMets
alpha-spending tables (reproducible in R via `gsDesign`):

| Design | Implementation | Published |
|---|---|---|
| OBF K=2, α=0.025 | 2.9627, 1.9686 | 2.963, 1.969 |
| OBF K=3 | 3.7105, 2.5114, 1.9931 | 3.710, 2.511, 1.993 |
| OBF K=4 | 4.3327, 2.9632, 2.3591, 2.0141 | 4.333, 2.963, 2.359, 2.014 |
| OBF K=5 | 4.8774, 3.3572, 2.6804, 2.2898, 2.0310 | 4.877, 3.357, 2.680, 2.290, 2.031 |
| Pocock K=2 | 2.1571, 2.2011 | 2.157, 2.201 |

Agreement within 6e-4 everywhere, and cumulative alpha lands on the target
exactly. **This is a correct implementation** — a genuinely good result, and worth
saying plainly after a week of finding controls that did nothing.

### 2.4 Closed by

`tests/biostat/group-sequential-reference.test.ts` — 18 tests pinning the
published boundaries plus the invariants no table can give: alpha spent exactly
(to 1e-10), monotone spending, no interim boundary easier than the final one, and
a tighter alpha raising every boundary.

**Mutation-verified against four realistic statistical errors**, each of which
would previously have shipped green:

| Mutation | Tests failed |
|---|---:|
| OBF spending loses its factor of 2 (tail error) | 4 |
| OBF uses α instead of α/2 (wrong tail) | 7 |
| Pocock loses the (e−1) constant | 3 |
| `√t` becomes `t` (information scaling) | 4 |

**A tolerance note, because the first draft was wrong.** It asserted 3 decimals
and failed at K=3, where the implementation returns 3.71055 against a table value
of 3.710. That is grid resolution in a numerical integrator, not a formula error.
Asserting 3 decimals encodes a precision that cross-implementation agreement
cannot support, so the tolerance is 2 decimals (±0.005) — still far tighter than
any real error, which moves boundaries by much more. The *exact* claim lives in
the invariant tests, where it belongs.

---

## 3. What is not done

Stated rather than implied.

- **Round 2 extended the pinning to the foundation layer** —
  `tests/biostat/statistical-core-reference.test.ts`, 37 tests over `normal.ts`,
  `special.ts`, `multiplicity.ts`, `rmst.ts` and `dose-finding-boin.ts`. Again
  every value was verified against a published reference *before* being written,
  and again no code change was needed: Clopper–Pearson matched on all five
  configurations, BOIN λE/λD matched Liu & Yuan for both targets, Bonferroni /
  Holm / Hochberg matched their exact definitions, and KM/RMST matched hand
  computation.

  Mutation-verified against six realistic errors: Hochberg implemented step-down
  (1 test fails), Clopper–Pearson one-sided by mistake (4), BOIN escalation and
  de-escalation boundaries swapped (3), KM survival made additive (2), risk set
  counted after removal (3), and censored subjects left in the risk set (1).

  **The censoring mutation initially SURVIVED**, and that was a defect in the
  fixture rather than a false alarm: the original data censored only *after* the
  last event, so whether censored subjects leave the risk set never changed any
  computed value. A genuine censoring bug would have shipped green. A second
  fixture with censoring interleaved between events (the ordinary shape of
  follow-up data) now distinguishes them — 3 at risk giving S=0.533 versus 4
  giving S=0.600.

- **Round 3 pinned power, assurance and MMRM sizing** —
  `tests/biostat/power-and-sizing-reference.test.ts`, 20 tests. These differ from
  rounds 1–2 in having *closed-form* answers, so the expectation is derived in
  the test (`power = Φ(δ√(n/2) − z₁₋α)`) rather than quoted: a formula cannot be
  mistranscribed the way a table constant can.

  The two strongest tests are cross-implementation checks, not value checks.
  **MMRM with one visit and ρ=0 returns exactly the classic
  n = 2(z_{α/2}+z_β)²σ²/δ² = 85 per arm** — a repeated-measures design collapsing
  to the textbook answer exercises the covariance construction, the matrix
  inversion, the variance factor and the rounding all at once, against a number
  computed a completely different way. And **assurance with a point-mass prior
  equals frequentist power at that point** to 7 significant figures, which is the
  defining property of an integral over a collapsing prior.

  Assurance also falls monotonically as the prior widens and stays below power at
  the mean. That direction matters commercially: assurance *above* power-at-the-
  mean would flatter a programme's probability of success, which is the one error
  a sponsor must not be sold.

  Mutation-verified: power treating n as total rather than per-arm (7 tests
  fail), power sign flipped (8), MMRM rounding down instead of up — a silent
  under-powering of the trial (7), MMRM one-sided by mistake (7).

- **Round 4 pinned win ratio and event projection — and FOUND A REAL DEFECT.**
  `tests/biostat/win-ratio-and-projection-reference.test.ts`, 20 tests. Unlike
  rounds 1–3 this one did not merely confirm correct mathematics.

  `winRatioAnalysis` returned `Infinity` when an arm had zero losses. **JSON
  serializes `Infinity` to `null`**, so `POST /api/biostat/win-ratio` emitted
  `"winRatio": null` beside `"success": true` — and the all-ties case (no
  information at all) emitted exactly the same thing. Overwhelming benefit and
  no evidence were indistinguishable on the wire, silently, in the primary
  endpoint of a hierarchical composite design. `ciLower`/`ciUpper` were `NaN`,
  which serializes to `null` too.

  Fixed: `winRatio` and the CI bounds are now `number | null`, so the wire value
  is intentional rather than incidental, and `wins`/`losses`/`ties` remain to
  distinguish the cases. A JSON round-trip regression test pins it at the layer
  where the defect actually bit — in-process the values looked fine, which is why
  nothing had noticed.

  **My own probe had hidden it.** The first exploration printed the result
  through `JSON.stringify`, which showed `null` and looked correct; only the
  strict test revealed `Infinity`. The viewing method destroyed the evidence.

  **The class is wider than the fix.** `clinical-performance.computeDiagnosticAccuracy`
  returns `lrPositive: Infinity` whenever specificity = 1 — ordinary in a small
  IVD validation study — and it reaches the wire as `null` the same way.
  Demonstrated, not inferred. `analytical-performance-extensions` does the same
  for `shelfLife` and `predictedShelfLife`. **Not fixed here**: those belong to
  the IVDR/stability modules with their own consumers and conventions, and
  changing their contract is the owner's call, not a side effect of this work.

- **~30 biostat endpoints remain shape-tested only.** Sample-size beyond the one
  existing textbook case, assurance, MMRM, MRMC, win ratio, external-control
  borrowing, enrollment/event forecasting and the analytical-performance family
  are still unpinned, and each deserves the same treatment.
- `server/routes/programs.ts` unmounted — flagged, not diagnosed.
- PM automation rules (1 reader) and escalation paths (3) — candidates for the
  "built but not wired" pattern, not confirmed.
- No claim is made here about the *clinical* appropriateness of any default
  (e.g. which spending function suits which design). That is a biostatistician's
  judgement, not a test's.

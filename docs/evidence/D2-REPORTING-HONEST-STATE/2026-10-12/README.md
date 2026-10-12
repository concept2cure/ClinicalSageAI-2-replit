# D2 — Reporting & analytics: a readiness figure may not be spoken as reassurance

**Row:** D2 (launch catalog — Reporting & analytics, the seventh launch app)
**Workstream:** W1
**Findings closed:** HS-1008-1, HS-1008-2, HS-1008-3 (`docs/evidence/reviews/2026-10-08/honest-state.md`)
**Date:** 2026-10-12
**Head before:** `910e0448d`

## The defect, as a regulatory reader meets it

`evaluateReadiness` does not always measure the same thing. With a resolved
required-artifact matrix the score is section completion (60%) weighted with
artifact completion (40%). Without one — and there are nine matrices against a
much larger application registry, so this is the common case — the artifact half
is not scored at all. The score is section completion alone, and the evaluator
raises a `critical` gap saying exactly that:

> `ARTIFACT_REQUIREMENTS_NOT_MODELLED` — "…so no artifact was checked against a
> known requirement set. This score reflects section completeness only — treat
> the artifact half as unassessed, not as complete."

The evaluator was honest. Everything downstream of it was not.

A project with every section drafted and no artifact matrix arrives at the
client as `readiness: 100, criticalBlockerCount: 1, status: 'missing'`, and the
Reporting canvas opened with:

> **BX-204 is 100% ready.**

That is the refuse-to-accept trap stated as reassurance. A sponsor who believes
the dossier is complete because the tool said 100% files, and is refused on a
requirement the tool never claimed to have checked. The figure was right. The
sentence around it was not — and `criticalBlockerCount` was fetched by the
route, declared on three client interfaces and copied into `ProgramCtx` without
ever reaching a screen.

The same contradiction was sealable. `gapsWereEvaluated` tested
`Array.isArray(summary.regulatory.missingArtifacts)`, and the orchestrator sets
that field on every project-scope run. `evaluateReadiness` returns `missing: []`
whenever artifacts were not assessed. So "no evaluation ran" and "an evaluation
ran clean" reached the renderer looking identical, and the renderer chose the
reassuring reading for both. A report could list *"Artifact requirements not
assessed"* under **Blockers** and then state *"No gaps detected as of
2026-10-12T…"* under **Gaps**, two sections apart, and be sealed in that state.

## What changed

### 1. `shared/regulatory/readiness-statement.ts` (new) — the word "ready" has one owner

The decision of whether a figure may be called ready now lives in one module,
so it cannot be made differently on the next surface. `readinessClaim` returns
one of four kinds and nothing else may be said:

| Facts | Claim | What is said |
|---|---|---|
| `readiness: null` | `not-computed` | "has no computed submission readiness" — never 0% |
| `readiness: 100, criticalBlockerCount: 1` | `qualified` | "scores 100% on submission readiness, with 1 critical gap outstanding" |
| `readiness: 72, criticalBlockerCount: 0` | `clear` | "is 72% ready" |
| `readiness: 88`, no count | `gaps-unknown` | "scores 88%…; its critical-gap count was not read" |

The fourth row is the point of the module as much as the second. A read-model
that does not carry the gap count has not told us there are none, so it buys no
reassurance. That is precisely how the bare percentage survived three reviews:
the field was declared and never read, which looked the same as zero.

`readiness: 0` with no gaps is `clear`, not `not-computed`. A measured zero is a
measurement.

### 2. `Insights.tsx` — both places the figure was printed bare

- The canvas opener (`roSuggestForClient`) now builds its predicate with
  `readinessPredicate(p)`. `pduBit` became its own sentence so the gap clause
  reads cleanly before it.
- The regional-comparison line now appends `readinessQualifier(prog)`, which is
  `null` — and so adds nothing — when the figure is clear.

### 3. `render.ts` + `orchestrator.ts` — the renderer cannot seal a self-contradiction

- The orchestrator now sends `artifactsAssessed` and the run's **own gap list**
  (`gaps`), untruncated. Before, only `missingArtifacts` travelled, so section
  gaps and the `critical` not-assessed markers appeared as blockers and were
  then contradicted in the same document.
- `gapsWereEvaluated` now requires the run to state gaps it found, or to state
  that the artifact half was assessed and found none. An empty list with no
  assessment flag is "cannot tell", which **fails closed**. Stored runs from
  before `artifactsAssessed` existed therefore re-render as "Gaps were not
  evaluated for this scope" — the honest reading of a record that does not say.
  This flag feeds the truthfulness gate's `requireExplicitGaps`, so it has teeth
  beyond the wording.
- The gaps section renders every recorded gap at its real severity
  (`critical → critical`, `important → high`, `recommended → medium`).
- **A document may not state "No gaps detected" while it also lists blockers.**
  `gapsSectionFor` reads `input.blockers` for that one reason. The rule holds
  whatever fed the summary, including provider paths not written yet, which is
  why it lives in the renderer rather than in each of them.

### 4. `roHeldBecause` — no claim to quote an empty list

`explain_blockers` introduced the truthfulness gate's `reasons` as *"the gate's
own reasons, verbatim"* without checking the list had anything in it. The gate
records a reason only when it downgraded a status that was asked for, so a run
held at `partial` by its own blockers has `reasons == []`, and the reply read:

> `"X" is held at partial because: . Those are the gate's own reasons, verbatim.`

It now quotes whichever list the record holds, names which list that is, and
when neither holds anything says so rather than introducing nothing as a
quotation. Extracted as a pure export, following the idiom `roPortfolioCovers`
set in the same file.

## Verified by making each check fail

Every gate below was run against the pre-fix code first. A gate that has only
ever been seen to pass has not been tested.

| Suite | Against pre-fix code | Against the fix |
|---|---|---|
| `shared/regulatory/__tests__/readiness-statement.test.ts` | **4 failed / 4 passed** — pre-fix semantics reintroduced (score alone decides "ready") | **8 passed** |
| `server/services/report-os/render/__tests__/render.test.ts` | **3 failed / 11 passed** — `render.ts` restored from backup; the 11 pre-existing cases still passed | **14 passed** |
| `client/.../insightsReadinessHonesty.test.tsx` | **2 failed / 2 passed** — `Insights.tsx` restored from backup | **4 passed** |
| `client/.../insightsHeldBecause.test.ts` | **3 failed / 1 passed** — single-branch wording reintroduced | **4 passed** |

The pre-fix render fixture `{ regulatory: { missingArtifacts: [] } }` is now
pinned as the defect case, under a test whose title is the rule it enforces. The
existing test *"says no gaps were detected only when an evaluation ran and found
none"* had the right title and the wrong fixture; the fixture gained
`artifactsAssessed: true` and a sibling case asserts the old one fails closed.

## Repo-wide gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npm run ci:internals-in-copy` | no new occurrences, 0 baselined |
| `npm run check:microcopy` | OK — 471 customer-facing files |
| `npx vitest run server/services/report-os` | 363 passed / 31 files |

## Still open from the same review, and not touched here

- **HS-1008-4** — `entitlement-map.ts:95-100` `catch { tier = 'standard' }` is
  passed on unflagged, so a failed capability read renders as "Plan: Standard".
- **HS-1008-5** — `ROChart` invents a series when the spec lacks one
  (`Number(s.anchor) || 60`, `[62, 66, 64, 70, 73]`). Latent: no server path
  emits chart blocks today.
- **HS-1008-6** — as-of compliance reports accept a future date (row D6).
- **HS-1008-7** — the audit-integrity attestation is stronger than the check it
  reports (row D5).
- **HS-1008-8** — `generatedAt` is stamped at each render, so re-rendering a
  stored run changes its content hash (row D5). The 10-01 README lists seal
  re-verification as fixed; the pinned-timestamp half was not re-checked here.

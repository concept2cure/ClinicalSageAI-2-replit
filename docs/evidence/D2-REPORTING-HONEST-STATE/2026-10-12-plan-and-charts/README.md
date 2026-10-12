# D2 — a plan that could not be read, and a chart that invented its data

**Row:** D2 (launch catalog — Reporting & analytics)
**Workstream:** W1
**Findings closed:** HS-1008-4, HS-1008-5 (`docs/evidence/reviews/2026-10-08/honest-state.md`)
**Date:** 2026-10-12
**Head before:** `63d640081`

Both are the defect class the review calls **distinction 2**: a failed or absent
read rendered as a value. They are the same class as the two medium findings
closed earlier today in `../2026-10-12/`, one severity band down.

## HS-1008-4 — "Plan: Standard" for a plan the server could not read

`requireReportEntitlement` wrapped the capability lookup in:

```ts
} catch {
  tier = 'standard';
}
```

Degrading to `standard` is **correct for the gate**: it can never silently
unlock a paid feature, and that behaviour is unchanged here. It was wrong for
the sentence. The error was discarded by a bare `catch` and the assumption
passed on unflagged, so an enterprise customer whose capability store was
briefly unreachable saw **"Plan: Standard"**, a wall of locked tiles, and
nothing anywhere to say their plan had not been read. The reasonable conclusion
from that screen is that they are on the wrong plan.

### What changed

- `ReportEntitlementDecision` gains `tierResolved: boolean` — whether `tier` was
  **read** or **assumed after a failed read**.
- The `catch` now logs the error (it was thrown away entirely) and sets
  `tierResolved: false`. The tier stays `standard`; the gate stays closed.
- `decideReportEntitlement` takes `tierResolved = true` as a fourth parameter,
  because the pure function's caller handed it a tier. This matters more than it
  looks: `report-os.ts:691-701` builds a whole catalog of per-type decisions
  from **one** awaited gate, so without threading the flag the catalog would
  claim a plan the gate itself could not read.
- `LOCKED_PORTFOLIO_DECISION` — the defensive fallback used if the
  never-throwing gate somehow rejects — is `tierResolved: false`, because it is
  the absence of an answer rather than an answer.
- `CanvasOverview` carries the flag to the client, which reads
  `data?.tierResolved !== false`. **Absent is read as resolved**: an older
  server sends no flag, and the flag's job is only ever to withdraw a claim,
  never to start making one. A test pins that.
- The canvas's plan-preview notice said *"Your organization's plan is
  Standard"*; it now says the plan could not be read, and names none. A separate
  notice appears when not previewing, so a wall of locks is not read as the
  plan's doing.

A read that legitimately returns `standard` is `tierResolved: true` — a real
plan, not an assumption. That distinction is the whole finding, and it has its
own test.

## HS-1008-5 — three of four chart branches invented their data

| Branch | Fallback | What it drew |
|---|---|---|
| `readiness_ring` | `Number(s.value) \|\| 0` | an empty ring labelled "0 of 100" |
| `forecast_band` | `Number(s.anchor) \|\| 60` | a trajectory, from a fixed ±8 shape around an invented anchor |
| `trend` | `[62, 66, 64, 70, 73]` | a rising line, for any report whose spec carried no points |
| `bar` | — | **"No series data — connect the live provider."** |

The honest behaviour was in the same function the whole time. The other three
now share it, via one number reader:

```ts
export function roSpecNum(value: unknown): number | null
```

A genuine `0` is a measurement and survives. Nothing else does. The ring's
`|| 0` was the not-computed-as-zero defect the rest of this surface was fixed
for, one component over.

This finding was **latent** — the 10-01 review found no server path emits chart
blocks today — but a literal series in a governed renderer is what the working
agreement forbids outright ("no fixture data in governed paths"), and a latent
path is one connector away from being live.

### A defect in my own fix, caught by its own test

My first `roSpecNum` was `Number(value) || 0` replaced by
`Number.isFinite(Number(value)) ? Number(value) : null`. The test case asserting
that `[]` reads as nothing **failed**: `Number([])` is `0`, and `Number([5])` is
`5`, so an array coerced to a measurement. The reader now accepts a `number`, or
a string that spells one, and rejects every other type rather than coercing it.
That is the value of writing the absent-value case out in full rather than
testing `undefined` alone.

## HS-1008-5's other half was already closed, by someone else

The finding also named the compare view asserting *"No per-market assessment is
in the governed record"* without reading the record. At `63d640081` that line
reads:

> No per-market comparison is in the governed record, so every market cell reads
> "--". A market assessment is of the filing this program is recorded for, and a
> program records one — so BX-204 can be assessed for its own market, not
> against a second one it is not filing in.

That is better than the reword the auditor suggested and better than the one I
had drafted: it explains *why* there is nothing to compare rather than reporting
an absence. Nothing was changed there.

## Verified by making each check fail

| Suite | Against pre-fix code | Against the fix |
|---|---|---|
| `server/.../entitlement-tier-unresolved.test.ts` | **1 failed / 5 passed** — flag forced to `true` in the catch | **6 passed** |
| `client/.../insightsPlanUnresolved.test.tsx` | **1 failed / 2 passed** — `tierResolved` forced to `true` | **3 passed** |
| `client/.../insightsChartNoFixtures.test.ts` | **1 failed / 2 passed** — reader restored to `Number(value) \|\| 0` | **3 passed** |

In each case the control cases passed against the pre-fix code, which is what
separates "the fix works" from "nothing works". The fail-closed case — *"still
fails closed on an enterprise feature"* — passes in both directions by design:
the gate's behaviour is deliberately unchanged, and a test that only failed
before would have meant I had broken it.

## Repo-wide gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npm run ci:internals-in-copy` | no new occurrences, 0 baselined |
| `npm run check:microcopy` | OK — 476 customer-facing files |
| `npm run ci:fixture-fallback` | no new ungated fixture fallback, 0 baselined |
| `npx vitest run server/services/report-os` + the three canvas route suites | **38 files / 430 tests passed** |
| Every client test file importing `Insights` | **22 files / 194 tests passed** |

## Still open from the 2026-10-08 review

- **HS-1008-6** (row D6) — as-of compliance reports accept a future date;
  `period.ts`'s `kind === 'as-of'` branch returns before any comparison against
  `now`, so "access review as of 2027-01-01" returns today's membership under a
  date that has not happened. Confirmed at HEAD, not fixed here: it is a
  different row and a different app.
- **HS-1008-7** (row D5) — the audit-integrity attestation says "every row
  carries a hash linked to its predecessor" for a pointer-only check that
  tolerates a NULL `previous_hash` and never re-derives `record_hash`. The
  sentence is stronger than the check, and it is regulator-facing.
- **HS-1008-8** (row D5) — `generatedAt` is stamped at each render, so
  re-rendering a stored run changes its content hash. The 10-01 README lists
  seal re-verification as fixed; the pinned-timestamp half was not re-checked.

# Evidence — protocol intelligence, the bidirectional loop

**Date:** 2026-09-22.
**Launch row:** **D2**, the launch catalog — specifically the Authoring app's
`protocol-dev` surface, which joined the catalog by founder decision on
2026-09-21 (`shared/constants/launch-scope.ts`, `docs/evidence/WI/2026-09-21`).
This session does not add a surface, a module, a model or an integration. Every
panel built here lives inside `protocol-dev`; every engine is server-side and
reached through routes that already existed. `ci:launch-scope` reports 6 apps ·
41 surfaces · 21 modules, unchanged.
**Design documents:** `docs/design/PROTOCOL_DESIGN_CONVERGENCE.md` (design →
protocol) and `docs/design/PROTOCOL_INTELLIGENCE.md` (protocol → design, the
rules, and AnA's part).

## What changed

| Commit | What |
|---|---|
| `806bb5acc` | The bidirectional contract, written down before anything was built |
| `a39644ea1` | `design-derivation.ts` — protocol → design, pure, 25 tests |
| `e758a1938` | The protocol surface reaches the design spine: bind, gates, five projections |
| `0360b0d3f` | Participant burden and complexity, counted from the SoA grid |
| `e128a6564` | The region-rules engine, reachable from the design object |
| `016293086` | The M11 projection states what it claims and what it has not verified |
| `73064d584` | Typecheck fix |
| `4eca22e1d` | `protocol-rule-pack.ts` — 53 regulatory rules where there were five checks |
| `5f2fb0f9d` | The derivation's two routes and its governed writer |
| `f57dfb758` | The discontinuation section the rule pack found missing, plus its backfill |
| `53e08b618` | The 53 rules on the read the surface already makes |

## Verify by making the check fail

Nothing below was reported as working on the strength of a green run. Each
guarantee was broken deliberately in the finished code and the suite re-run.

### The derivation engine (`design-derivation.test.ts`, 25 tests)

| Invariant | Injected defect | Result |
|---|---|---|
| Silence is not a value | Empty register proposes `[]` | **2 failed** |
| Conflict is not resolution | Every disagreement routed to `proposed` | **1 failed** |
| Incomplete is never applied | `applyDerivation` stopped checking `incomplete` | **1 failed** |
| No measurement type from wording | Endpoint `type` guessed by regex on the name | **2 failed** |

### The derivation service (`design-derivation-service.pglite.integration.test.ts`, 13 tests)

| Invariant | Injected defect | Result |
|---|---|---|
| Tenant scope on the design | `AND tenant_id = $2` dropped | **2 failed** |
| Unbound ≠ empty | Unbound protocol derived against a blank design | **1 failed** |
| Apply never clears | Apply path clearing what it could not apply | **1 failed** |

### The backfill migration (`protocol-discontinuation-backfill.pglite.integration.test.ts`, 7 tests)

| Invariant | Injected defect | Result |
|---|---|---|
| Replayable | The `NOT EXISTS` guard removed | **2 failed** |
| A finalized record is not rewritten | Status filter removed | **2 failed** |

Also proved against **real PostgreSQL**, not only PGlite: applied, an author's
content written into the new section, applied again — one row, content intact,
no second shift. Then the guard removed and three deploys run: **three
duplicate sections, and the schedule-of-assessments section pushed from index
6 to index 9.** That is the Rule 1 hazard, demonstrated rather than described.

Every injection was reverted and the file verified byte-identical.

### Delegated work, verified the same way

The four parallel workstreams each ran their own red-then-green and reported
it: the link migration (4 red proofs, applied twice against real PostgreSQL),
the burden engine (3 mutations, 33 tests), the region adapter (4 injections,
21 tests — one of which proved the author's own first design wrong), and the
rule pack (a rejected weak red, a vacuous-negative test caught and fixed, then
2 mutations failing 43 of 81 tests).

## Two honest negatives

**Region rules are mostly undecidable today.** The adapter measured it rather
than asserting coverage: for a design with no MRCT block, **all eleven region
rules return not-assessed.** With `framework.mrct` filled in, three become
decidable and eight do not. The unmapped ledger names, field by field, what
the design object would need to carry, and it is a compile-time contract —
adding a field to the engine's input will not compile until the adapter
handles it.

**The ICH M11 section numbering in this codebase is not verified and is wrong
in at least one place.** The gates cite `ICH M11 §2/§3/§4/§6/§7/§10/§17`;
there is no §17 in ICH M11. The Schedule of Activities is cited at §7, where
M11 places participant discontinuation and withdrawal. The protocol
projection's own outline was written from working knowledge and has never been
reconciled with the published template. `database.ich.org` and
`www.ema.europa.eu` are both refused by this environment's egress policy
(403 on CONNECT), so it could not be checked here. Rather than guess a
replacement outline, `projectProtocol` now returns
`conformance.outlineVerified: false` and says in words that its section
numbers are internal ordering and must not be presented as M11 citations.
**Owed: the published ICH M11 CeSHarP template, or an egress allowance.**

## Gates

| Gate | Result |
|---|---|
| `tsc --noEmit -p tsconfig.json` | 0 errors |
| `ci:eslint-warning-ratchet` | at baseline 6521, no suppressions |
| `ci:migration-set-order` | OK — 297 migrations, sweep last |
| `ci:migration-drop-safety` | OK — no DROP re-created by the set |
| `ci:launch-scope` | OK — 6 apps · 41 surfaces · 21 modules, unchanged |
| `ci:fixture-fallback` | OK — 0 baselined |
| `ci:no-mock-in-prod-routes` | OK — current 0, baseline 0 |

Per-workstream evidence: `docs/evidence/PROTOCOL-CONVERGENCE/2026-09-22/`,
`docs/evidence/PROTOCOL-BURDEN/2026-09-22/`,
`docs/evidence/PROTOCOL_DESIGN_DERIVATION.md`.

# Evidence — protocol → study design derivation

**Date:** 2026-09-22. **Module:** `server/services/protocol-development/design-derivation.ts`.
**Contract:** `docs/design/PROTOCOL_INTELLIGENCE.md`, "Direction two".
**Suite:** `server/services/protocol-development/__tests__/design-derivation.test.ts` — 25 tests.

## Why this file exists

A derivation that reads a protocol into a study design can destroy the design
in four ways, and all four are silent. A green suite proves nothing about them
unless the suite has been seen to go red on each. Per CLAUDE.md — *"a gate that
has only ever been seen to pass has not been tested"* — each invariant was
broken in the implementation and the suite re-run.

## The four failure injections

| # | Invariant | How it was broken | Result |
|---|---|---|---|
| 1 | **Silence is not a value** | An empty `protocol_eligibility_criteria` register proposed `[]` instead of reporting the path unevidenced | **2 failed** / 23 passed |
| 2 | **Conflict is not resolution** | `route()` pushed every disagreement to `proposed` — the protocol always wins | **1 failed** / 24 passed |
| 3 | **An incomplete proposal is never applied** | `applyDerivation` stopped checking `incomplete` and applied the partial value | **1 failed** / 24 passed |
| 4 | **No measurement type is inferred from wording** | Endpoint `type` guessed by regex on the endpoint name (`/survival|time to/` → `time_to_event`, else `continuous`) | **2 failed** / 23 passed |

Restored: **25 passed (25)**.

Injection 1 is the one that matters most. Without it, opening a protocol whose
eligibility register happens to be empty and accepting the diff would wipe the
design's criteria — a silent, audited, irreversible data loss that would read
as a successful governed action in the trail.

Injection 4 is the one a reasonable engineer would most likely ship. Guessing
`time_to_event` from the words "overall survival" is right often enough to look
correct in a demo and wrong often enough to misroute the SAP's analysis method
on a real study. The module reports the endpoint as `incomplete` and names
`type` and `definition` as what a human supplies.

## What the derivation will not do, asserted by name

`structurallyUnevidencedPaths()` is enumerated exactly in the suite, so a
future protocol register that closes one of these gaps fails the test and
forces the list to be updated rather than going quietly stale:

`arms`, `estimands`, `framework.controlType`, `framework.inferentialFrame`,
`framework.margin`, `framework.structuralDesign`, `indication`,
`population.analysisPopulations`, `population.targetDescription`,
`productType`, `randomization`, `safety`, `statisticalPlan`, `targetRegions`.

Two of those carry a specific refusal:

- `statisticalPlan` — alpha, power, planned sample size and dropout are
  governed numbers from the deterministic engine. The protocol's statistics
  section is prose and is never read for them.
- `framework.structuralDesign` — `protocol_documents.design_type` records a
  study *type* (interventional, observational, registry). It is not a
  structural design family, and it is not treated as one.

## Commands

```
NODE_OPTIONS="--max-old-space-size=4096" npx vitest run --config vitest.config.ts \
  server/services/protocol-development/__tests__/design-derivation.test.ts
```

`Test Files 1 passed (1)` · `Tests 25 passed (25)`.

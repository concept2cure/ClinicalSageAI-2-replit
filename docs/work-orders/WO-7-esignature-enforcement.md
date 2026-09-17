# WO-7 — E-signature on regulated promotion

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN · **Blocks:** G3 (GxP) fully; partially blocks a real-data pilot

---

## Standing caveat

This work order is scoped from static evidence only. No signature flow was
exercised at runtime in this evaluation, and the Part 11 chapter of the July
audit (`docs/audit-2026-07/07-compliance-21cfr11.md`) is the deeper source.
**Read that chapter before scoping the work**; this is a pointer, not a
substitute.

## Why it matters at the real-data bar

21 CFR Part 11 §11.50 and §11.70 require that a signature manifestation is bound
to the record and that the record shows who signed, when, and why. A pilot on
real customer data produces records the customer may later want to rely on. If a
governed transition — approve, promote, submit, sign off — can complete without
a signature manifestation, the record it produces is not one they can rely on,
and re-creating it later is expensive.

The related machinery exists and passes: `ci:regulated-delete-audit`,
`ci:governed-export-routes`, `ci:governed-export-consequence-shape` (with a
self-test), `ci:lineage-save-gate`, `ci:artifact-provenance`,
`ci:audit-logs-fixture`. The gap is enforcement at the promotion boundary
specifically.

## Scope

1. Enumerate every governed transition — the state changes that produce a record
   a customer might rely on. Start from the routes `ci:governed-export-routes`
   and `ci:regulated-delete-audit` already know about.
2. For each, assert that it refuses to complete without a signature
   manifestation carrying signer identity, UTC timestamp, and reason-for-change.
3. Capture reason-for-change at the point of action, not in a later annotation.
4. Add a gate in the shape of the existing ones — a static check that a governed
   transition handler cannot be written without the signature guard — plus a
   self-test that exercises its failure branch, matching
   `ci:governed-export-consequence-shape:selftest`.

## Exit criteria

```bash
npm run test:security          # signature enforcement covered
npm run ci:regulated-delete-audit
npm run <new gate>             # refuses an unsigned governed transition
npm run <new gate>:selftest    # failure branch exercised
```

## Blast radius

Medium-high. Changes the shape of every governed mutation. Best done after
WO-1/WO-2 so the records being signed sit on a schema that is pinned down.

## Estimate

3–4 weeks, and it is the work order most likely to need a regulatory reviewer
rather than an engineer to define "done".

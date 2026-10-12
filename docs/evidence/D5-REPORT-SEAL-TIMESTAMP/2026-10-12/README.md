# D5 — HS-1008-8 retired: the sealed report's timestamp was already pinned

**Row:** D5 (Part 11 evidence)
**Workstream:** W3b
**Finding:** HS-1008-8 (`docs/evidence/reviews/2026-10-08/honest-state.md`)
**Date:** 2026-10-12
**Outcome:** not a defect at HEAD. No code changed.

## What the finding said

> Re-rendering a stored run yields a new `generatedAt` and so a different
> content hash. **I did not re-check this at HEAD.** The 10-01 README lists seal
> re-verification (GET /runs/:id/seal) as fixed, which may close the
> verification half. **Confirm that the pinned generatedAt half is also closed
> before keeping this.**

The auditor flagged their own finding as unverified and asked for exactly this
check. Doing it is the work; it needs no database, only the two call sites.

## The readings

`renderReport` defaults the stamp when the caller passes none
(`render/render.ts:467`):

```ts
const generatedAt = input.generatedAt ?? new Date().toISOString();
```

There are two callers.

**1. The stored-run path — `routes/report-os.ts:1894`. Pinned.**

```ts
// The run's computation time, not the moment of rendering: "No gaps
// detected as of" sealed the sealing time over data computed earlier,
// and no two renders of one run were the same document.
generatedAt: run.createdAt ? new Date(run.createdAt).toISOString() : undefined,
```

This is the path the finding describes — the one that re-renders and seals a
stored run. It passes the run's recorded creation time, and its comment states
the defect it was written to fix in the finding's own terms.

**2. The canvas path — `canvas/render-report.ts:80`. Passes none, correctly.**

It stamps at render because it *computes* at render: `computed` comes from a
fresh computation in the same call, so the render time **is** the computation
time. There is no stored run being re-rendered, so there is nothing to pin to.
A pin here would be a pin to the same instant.

## When it was closed

```
$ git log -S "The run's computation time, not the moment of rendering" \
      --format="%h %ad %s" --date=short -- server/routes/report-os.ts
824500920  2026-10-01  Reporting: a final report's seal is stored with what it
                       sealed, read back and re-verified
```

**2026-10-01 — a week before the 2026-10-08 review that reported it.** The same
commit closed the seal-re-verification half the finding already suspected was
done. Both halves were closed by one change, before the finding was written.

## Status of the 2026-10-08 honest-state review

All eight findings are now accounted for:

| Finding | Severity | Outcome |
|---|---|---|
| HS-1008-1 | medium | fixed — `../../D2-REPORTING-HONEST-STATE/2026-10-12/` |
| HS-1008-2 | medium | fixed — same |
| HS-1008-3 | low | fixed — same |
| HS-1008-4 | low | fixed — `../../D2-REPORTING-HONEST-STATE/2026-10-12-plan-and-charts/` |
| HS-1008-5 | low | fixed — same (its compare-view half had already been closed by another session, better than the suggested reword) |
| HS-1008-6 | low | fixed — `../../D6-COMPLIANCE-FUTURE-DATE/2026-10-12/` |
| HS-1008-7 | low | wording fixed and an unplaceable row no longer passes as a verified link — `../../D5-AUDIT-LINKAGE-CLAIM/2026-10-12/`. The re-derivation itself is **not** migrated; that is named there as outstanding. |
| HS-1008-8 | low | **not a defect** — closed 2026-10-01, confirmed here |

Two things in that table are deliberately not "closed":

- **HS-1008-7 is a wording fix over a weaker check.** The full re-derivation
  exists in `routes/part11-compliance.ts` and the export's check is still a
  pointer comparison. Migrating it is real outstanding work, not a tidy-up.
- The review's own coverage statement lists what it did **not** read
  (`Vault.tsx`, `VaultAnnotations.tsx`, `Review.tsx`, the authoring review-send
  commits, several server routes) and which earlier fixes it took from a README
  rather than re-reading. Closing this review's findings is not the same as the
  surfaces being clean.

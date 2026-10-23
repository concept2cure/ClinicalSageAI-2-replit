# D6 — the schedule sweep runs only for tenants whose lifecycle permits background work

## Found

Trunk CI's Lint job failed `ci:tenant-entry-points`: `server/jobs/scheduleOfEventsSweep.ts` changed after its baseline justification was recorded. The justification read:

> NO PER-TENANT FAN-OUT at the sweep level: zero organization_id references, runs under a system scope. NOTE — … if it ever selects per-organization it needs `filterTenantsForBackgroundWork` like `taskDueSweep`.

`404371c51` (2026-10-20) made the sweep do exactly that. It now opens one tenant connection per plan, and its claim filters on `organization_id`. So refreshing the digest would have certified a justification that no longer holds.

## The gap

The claim's SQL admits a schedule when its project and its organization row are `active`. The lifecycle posture (`server/services/tenant/tenant-lifecycle.ts`) also reads `payment_status`:

- a tenant that is `past_due`, `unpaid` or `canceled` is `read_only`;
- every HTTP write refuses it;
- `organizations.status` still reads `active`.

The sweep still claimed that tenant's schedules. It created AnA's recovery tasks and fired schedule alerts for a tenant the platform refuses everywhere else. `taskDueSweep` carries the same filter and names the same harm.

## Fix

- The sweep filters the listed plans with `filterTenantsForBackgroundWork`, one posture per distinct organization, inside the same system lease.
- A refused tenant's schedule is not claimed, not stamped and not reviewed. It is counted as `skippedNotEntitled`.
- A posture that cannot be read refuses: `backgroundWorkPermitted(null)` is false.
- If the lifecycle read itself fails, nothing is reviewed that tick, and the failure is counted and logged.
- The per-plan body moved into `reviewPlan` unchanged, to keep `sweepAll` under the complexity limit.
- The sweep now considers entitlement, so the gate's baseline shrinks from 7 to 6. Its other entries are unchanged as data; the writer only re-encoded `—` as a literal dash.

## Files

- `01-red.txt`: the sweep as on trunk at `28637579e`, with the tests kept.
  - The two lifecycle cases fail: the read_only tenant's schedule is reviewed (`reviewed: 2`).
  - The two exact-shape cases fail on the new `skippedNotEntitled` field.
- `02-green.txt`: `server/jobs` 9 files, and `ci:tenant-entry-points` OK at baseline 6.

## Also red in the same CI Lint job, not touched here

`ci:launch-scope-api`: `/api/ind-master-data/sponsors` is called by `IndApplicantIdentity.tsx` (the `ind-checklist` surface) and claimed by no surface. The registry's comment still says "/api/ind-master-data has no screen caller", and `ind-launch-claim.test.ts` pins the claims.

Admitting a route into the release belongs to the lane that added the caller (`ccd509c06`, MR-10 Stage 4, claimed 2026-10-21), so it is left to them.

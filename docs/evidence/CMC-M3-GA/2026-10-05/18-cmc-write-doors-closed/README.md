# Three more CMC write doors closed before the catalog flip

Row **D2**, with D5 and D6. Found by the GA security review (2026-10-05):

- DP-86, the two source backdoors;
- IAM-31, the two routers outside the viewer gate;
- the remainder of DP-83, open deviations at release.

## 1. The Module 3 operating system wrote canonical sources itself (DP-86)

Two routes had no client caller, and neither left a governed record:

- `POST /api/cmc/module3-os/source-objects/:projectId` upserted any payload
  into `cmc_source_objects` with a caller-chosen version. It marked no section
  stale and named the actor `'system'` when it had none.
- `POST /module3-os/source-changed/:projectId` marked sections stale for a
  source type the body supplied.

**Both are deleted.** Canonical sources are written by the CMC registers only:

- every register route projects through `cmc-write-through.ts`
  (`writeThroughToCanonicalSource`), which also marks the impacted sections
  stale;
- this is reachable from the CMC screens, and the staff simulation exercises it
  in steps 3 to 8i, then 11.

The history search (`git log -S"router.post('/source-objects"`) finds only the
grafted base, so no other version exists. The compile 409's hint now points at
the registers. The route test for the upsert's type enum went with the route.

**Pin.** `cmc-retired-routers.contract.test.ts` checks that
`module3OperatingSystemRoutes.ts` declares no `/source-objects` or
`/source-changed` route and has no `INSERT INTO cmc_source_objects`. It fails
on HEAD before this change, and passes after.

## 2. Two CMC routers outside the viewer gate (IAM-31)

`cmcWriteRoleGate` covers `/api/cmc`. Two routers are mounted outside it:

- change control at `/api/cmc-changes`;
- the stability programme router at `/api/stability`.

So a viewer could log a CMC change, or create a stability study, condition or
result. Each router now starts with `requireEditorAccessForWrites`.

**Red, then green.** `cmc-outside-writes-gated.test.ts` mounts the real
routers.

- On HEAD (`red-outside-writes-before.txt`) the viewer got through on all four
  writes.
- After, a viewer gets 403 with nothing read or written, a member reaches the
  handler, and a viewer still reads.

The existing stability and change-control suites now give their fake sessions
a writing role. The calendar-owner suite also gives its request the
organization that `establishRequestTenantScope` publishes. All 62 files pass,
673 tests.

`/api/stability` still has no client caller and keeps a second stability store
(`stab_*`) beside `stability_studies`. It is not claimed by the CMC launch
surface, so production refuses it as unmapped. Whether to delete it or migrate
it is the change-control and stability convergence decision. It is not part of
this change.

## 3. An open deviation blocks a full release (rest of DP-83)

The board kept the release button disabled while a deviation was open. The
server did not check. `evaluateRecordedRelease` now refuses a full release
while the batch record holds an open deviation, under 21 CFR 211.192. It reads
`openDeviationCount`, which accepts `{ open: n }` or a list with statuses. A
conditional release, which states what is outstanding, and a rejection are
still signable.

- Red on HEAD's release route (`red-open-deviation-before.txt`): the full
  release went through.
- Green after: 27 of 27 route tests pass.

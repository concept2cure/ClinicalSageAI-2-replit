# The IVDR readiness panel under device-diagnostics: served, and its refusals named

Launch row D2, workstream "one AnA, one project". Date 2026-10-29. Working tree over `1746fa6a8`. This follows
`../fold-f2-ivd-completeness/fold/README.md`, its "The grant finding" (the mirror case) and its 403 note.

**Status: done.** No grant changed. The `ivd-completeness` claim is unchanged. The F2 fold is still founder decision 4.

## The defect

Since `1a6701ea6`, device-diagnostics (`client/src/concept2cure/mdx/surfaces/IvdSurface.tsx:217`, `:220`) draws the
IVDR readiness board and the IVD assessment workbench. They read `/api/ivd-completeness` and `/api/ivd-assessments`.
Only the `ivd-completeness` surface claimed those prefixes. So with `MODULE_ENFORCEMENT=enforce`, an organization
entitled to device-diagnostics but not to ivd-completeness got 403 `MODULE_NOT_LICENSED` on all five of the panel's calls.
The board then said "Your organization could not be confirmed", which is the wrong reason.

## What already exists

| Piece | Path | What it does | What it does not do |
|---|---|---|---|
| Prefix map | `server/services/entitlements/api-prefix-map.ts:44` `buildPrefixMap` | Maps each `/api` prefix to the **set** of every surface that declares it. NEVER_GATED prefixes are left out. | It has no "first claim" or owner rule. |
| Path attribution | `api-prefix-map.ts:68` `modulesForPath` | The longest prefix that matches at a segment boundary wins. Its whole set is the claimants. | — |
| The gate | `server/middleware/moduleEntitlementGate.ts:186`, `:203-210`, `:256-263` | Serves a path when the organization is entitled to **any** claimant (`canAccessModule`, sequential, first allow wins). If it holds none, it answers 403 `MODULE_NOT_LICENSED`. Launch scope runs first and can answer 403 `LAUNCH_SCOPE` (`:99`). | It sends no machine-readable reason. `reason` is free text, and the same code covers a tier gap, an administrator's switch-off, industry, a lapsed trial, an unreadable licence and an unknown organization (`server/services/license-manager.ts`). |
| Shared claims | the registry; 52 of the 284 gated prefixes at head | `/api/projects` → projects, project-home (the gate header's own example); `/api/ivdr` and `/api/manufacturing` → device-diagnostics, device-workstream; `/api/mdx/audit` → four device features; `/api/c2c/projects` → submission-center, ivd-completeness. | — |
| The rule, pinned | `server/middleware/__tests__/moduleEntitlementGate.test.ts:89`, `:149` | "maps a shared prefix to EVERY module that declares it"; "allows when the org is entitled through ANY module claiming the prefix". | It pins synthetic surfaces, not the real registry. |
| Registry entries | `shared/constants/ui-surface-registry.ts:915` (device-diagnostics); `ui-surface-registry.ui-v2.ts:185` (ivd-completeness) | device-diagnostics claimed six device-kit families. ivd-completeness claims five prefixes. | device-diagnostics claimed neither of its panel's IVD families. |
| The board | `client/src/concept2cure/v2/surfaces/IvdReadinessBoard.tsx` `ivdReadinessView` | Names a 404, 403 and 503 separately from a failed read. | Every 403 said "Your organization could not be confirmed". |
| The error code on the client | `client/src/lib/queryClient.ts:184` `errorCodeOf`; `client/src/concept2cure/v2/dataConnect.tsx:345` `DataState.code` | Reads `{ code }` (the gate's `MODULE_NOT_LICENSED` and the route's `IVD_NO_TENANT`) and `{ error: { code } }` (`LAUNCH_SCOPE`). It reaches the board as `read.code`. | — |
| The 403s on this path | gate `:258` `MODULE_NOT_LICENSED`; gate `:99` `LAUNCH_SCOPE`; route `server/routes/ivd-completeness-routes.ts:431` `IVD_NO_TENANT` ("Organization context required") | Three different facts. | — |
| The repo's words for an unlicensed module | `client/src/concept2cure/v2/navEntitlements.tsx:298` `lockShortReason`, `:370-371` `lockNotice` | "not included in your subscription", "turned off for this workspace", "Your subscription does not include this feature." `:286` records that hard-coding the tier reason for every lock was a defect. `:327` and IA section 9: the subscription is never called a "plan". | No client file handles `MODULE_NOT_LICENSED` (grep: only the gate, its test and license-manager). |
| `launch-scope-device-features` | `server/middleware/__tests__/launch-scope-device-features.test.ts` | Runs with enforcement off. Every call a device screen names (the walk plus `HOOKS`) must be served under launch scope. | No module entitlement. `HOOKS` had the board under device-diagnostics, not the workbench. |
| `ci:launch-scope-api` | `scripts/ci/check-launch-scope-api.ts` | Walks each launch surface's client graph. Fails on a call whose claimants are all out of scope, or that nothing claims. | No module entitlement. |
| `ci:launch-scope` | `scripts/ci/check-launch-scope.mjs` | Launch apps, surfaces and modules are routable, registered, licensable and free of fixtures. | — |

Searches run: `canAccessModule`, `moduleEntitlementGate`, `modulesForPath`, `buildPrefixMap`, `MODULE_NOT_LICENSED`,
`LAUNCH_SCOPE`, `IVD_NO_TENANT`, "not included in", "part of your organization", "your organization's plan",
`apiPrefixes` across `server`, `shared`, `client/src`, `scripts` and `tests`. Every prefix with more than one claimant
was listed from `buildPrefixMap()`. Every call device-diagnostics and ivd-completeness reach was listed from the
`ci:launch-scope-api` walk, with its claimants.

## The decision

The gate already supports a path with two claimants (option a). It admits when the caller holds either, and 52 prefixes
already rely on that. So device-diagnostics now also claims the two families its panel reads:

```ts
apiPrefixes: [..., '/api/ivdr', '/api/ivd-completeness', '/api/ivd-assessments'],
```

No gate rule was added. Nothing else was moved:
- `/api/ivd-lifecycle` and `/api/validate-completeness`: no client calls either. Claiming them would admit routes the
  screen does not call. They go with the fold.
- `/api/c2c/projects/:p` and `/sources`: the shared project record. 25 surfaces reach it, and it is claimed by
  submission-center and ivd-completeness. It is not this defect (see "Left as found").

**Both directions.** `green/prefix-map-diff.txt` diffs the whole map the gate builds, before and after. There are 284
prefixes both times. Exactly two rows change, and each gains `device-diagnostics` and loses nothing. Admission is "any
claimant", so no organization loses access. Only device-diagnostics holders gain, and only on those two families. With
no prefix added or removed, longest-prefix attribution of every other path is unchanged. An organization holding only
ivd-completeness keeps exactly what it had.

## The 403 wording

| Code | Message |
|---|---|
| `MODULE_NOT_LICENSED` | This feature is not enabled for your organization, so the IVDR readiness was not read. |
| `LAUNCH_SCOPE` | This part of the product is not in this release, so the IVDR readiness was not read. (The gate's own words.) |
| `IVD_NO_TENANT`, or any other 403 | Your organization could not be confirmed, so the IVDR readiness was not read. (Unchanged.) |

The brief suggested "This feature isn't part of your organization's plan". It was not used for two reasons:
- IA section 9 and `navEntitlements.tsx:327` bar "plan" for the subscription.
- "Isn't part of" names the tier reason. The gate sends the same code when an administrator switched the feature off,
  and `navEntitlements.tsx:286` records that hard-coding that reason was a defect.

"Not enabled" is true of every reason the code carries. `LAUNCH_SCOPE` was added because it is the third 403 this path
can produce, and it showed the same wrong reason.

## Red, green, mutations

Each run is one file under `timeout 240`, trimmed to the verdict lines.

| File | What it shows |
|---|---|
| `red/gate-at-head.txt` | `ivd-board-under-diagnostics.test.ts` before the registry change. The device-diagnostics-only organization gets 403 `MODULE_NOT_LICENSED` on all five calls. The ivd-completeness-only organization is served. The organization with neither is refused. |
| `red/wording-at-head.txt` | `IvdSurface.readiness.test.tsx` before the board change. `MODULE_NOT_LICENSED` and `LAUNCH_SCOPE` both show "could not be confirmed". |
| `green/gate.txt` | 5/5. Both single-module organizations are served. The one with neither is refused. |
| `green/wording.txt` | 12/12. |
| `green/prefix-map-diff.txt` | The whole map, before and after. |
| `mutation/M1-no-new-claim.txt` | The new claim removed. The device-diagnostics case is red again, on all five calls. |
| `mutation/M2-board-claim-only.txt` | Only `/api/ivd-completeness` claimed. Red on the four workbench calls. |
| `mutation/M3-claims-moved-off-ivd-completeness.txt` | The fold's claim move, done without decision 4. The ivd-completeness-only case goes red, and so does the claim pin. This is the F2 grant finding. |
| `mutation/M4-claimed-by-projects-instead.txt` | Claimed by `projects`, a module that the organization holding neither does hold. The "neither" case goes red. |
| `mutation/M5-every-403-unconfirmed.txt` | The head wording put back. `MODULE_NOT_LICENSED` and `LAUNCH_SCOPE` go red. |
| `mutation/M6-every-403-not-enabled.txt` | The mirror: every 403 is "not enabled". `IVD_NO_TENANT` and `LAUNCH_SCOPE` go red. |

Each mutation was applied to the file, run, and restored from a copy taken just before it (`cmp`: byte-for-byte). After
all six, `md5sum -c` matched, `ui-surface-registry.ui-v2.ts` was absent from `git diff`, and the diff of the other files
held only this slice's lines.

Kept green (`green/keep-green.txt`): launch-scope-device-features, launch-reproof-narrowing, moduleEntitlementGate and
moduleEntitlementMasterAdmin, eight entitlement suites, both registry suites, callable-apps, 16 IVD suites,
`ci:launch-scope` and its selftest, `ci:launch-scope-api` and its selftest, `ci:undefined-css-classes`. eslint on every
file touched: 0 errors, the same 3 warnings as at head.

`launch-scope-api-gate.test.ts` is 42/43, and **red at HEAD** too (`green/launch-scope-api-gate-red-at-head.txt`, run on
a `git archive HEAD` export). The failure: `ind-checklist` claims `/api/ind-lifecycle/briefing-book`, and no screen of it
calls that prefix since `5894e1aaa` moved the briefing book into the editor. It is not an IVD file and was not touched here.

## What changed

- `shared/constants/ui-surface-registry.ts`: device-diagnostics claims `/api/ivd-completeness` and `/api/ivd-assessments`,
  with a dated note.
- `client/src/concept2cure/v2/surfaces/IvdReadinessBoard.tsx`: a 403 is named by its code (`REFUSED_403`).
- `server/middleware/__tests__/ivd-board-under-diagnostics.test.ts` (new): the real registry, the panel's calls read from
  the walk, the gate production builds, enforcement on, and three organizations.
- `client/src/concept2cure/mdx/surfaces/__tests__/IvdSurface.readiness.test.tsx`: three 403 tests, using the bodies the
  gate and the route send.
- `server/middleware/__tests__/launch-scope-device-features.test.ts`: `HOOKS` gains the workbench under device-diagnostics.

## Left as found, for a decision

- **Founder decision 4 is still open.** This slice closes the mirror case by sharing the claim, not by the fold. The fold
  can still drop the ivd-completeness claim only by deciding the grant mapping. M3 shows what that costs an
  ivd-completeness-only organization.
- `IvdAssessmentWorkbench.tsx` shows a refused read's server message (`IvdSavedRecords`, `role="alert"`). It does not
  have the board's wrong reason, and it was outside this slice's files.
- `/api/c2c/projects` is reached by 25 launch and shell surfaces in the walk, and claimed only by submission-center and
  ivd-completeness. By the gate's rule, under enforcement an organization holding neither is refused the project record
  wherever those surfaces read it. That follows from the rule. It was not run or measured here.
- `launch-scope-api-gate.test.ts` is red at HEAD (above).

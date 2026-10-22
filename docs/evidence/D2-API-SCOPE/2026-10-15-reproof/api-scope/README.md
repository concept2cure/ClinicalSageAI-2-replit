# The launch API claims, narrowed to what the launch serves (D2, 2026-10-22)

Part of the launch-boundary re-proof (`../`, board row "D2 / D5 — re-proof of
the launch boundary after the catalog changed"). Session `…01E8btkB`.

A path is served in production when any surface claiming its longest prefix is
a launch surface (`server/services/entitlements/launch-scope-api.ts`). A claim
on a prefix covers every route under it, so broad claims let dead routes and
hidden apps' routes through the gate. The re-proof's finders classified each
launch-claimed sub-namespace that no launch or shell screen calls. Three
skeptics then checked each one (`wf_bdb3bd90-a37`; re-verified by family,
`reverify-result.json`). **79 were upheld** as DEAD (nothing calls them) or
HIDDEN APP (a hidden app's route under a launch prefix).

## What already exists

Searched: `launchScopeApiVerdict`, `buildPrefixMap`, `modulesForPath`,
`LAUNCH_PLATFORM_API`, `LAUNCH_INFRASTRUCTURE_API`, `NEVER_GATED`,
`check-launch-scope-api.ts`, `launch-scope-route-inventory.ts`, and
"exclud", "retired" and "not served" in `server/services/entitlements`.
`git log --all -S LAUNCH_EXCLUDED` found nothing.

| Exists | Path | What it does | What it did not do |
|---|---|---|---|
| The verdict | `server/services/entitlements/launch-scope-api.ts` | Never-gated → infrastructure → platform → longest claimed prefix | Could not refuse a child of a claimed root |
| The claims | `shared/constants/ui-surface-registry.ts`, `…ui-v2.ts` `apiPrefixes` | Attribute paths to surfaces | Claimed whole prefixes for one or two called children |
| The CI gate | `scripts/ci/check-launch-scope-api.ts` (`ci:launch-scope-api`) | Fails a launch-called path that is not served | Nothing caught over-broad claims, the other direction |
| The measurement | `scripts/ci/launch-scope-route-inventory.ts` | Every mounted route's verdict, from the running registration | — |

Nothing was rebuilt. The claims were narrowed where possible, and the verdict
gained one list beside its two existing ones.

## What changed

**Narrowed** (the prefix root is not called): each launch claimer now claims
the sub-namespaces a launch screen calls or a launch app uses, and nothing
else. That covers 14 prefixes and 65 findings: `/api/authoring-actions` (25),
`/api/submission-ops` (11), `/api/project-sections` (7), `/api/ectd` (4),
`/api/workflow` (4), `/api/corpus` (3), `/api/biostat-bridge`, `/api/coauthor`
and `/api/conversation-os` (2 each), and `/api/mdx/vault`,
`/api/realtime-collab`, `/api/task-management`, `/api/tasks` and
`/api/concept2cure/reviews` (1 each). Where several launch surfaces claimed a
prefix, each keeps every kept child, so the verdict for a kept path is
unchanged.

**Excluded** (the root is called, or is served and was not judged, so a claim
cannot be narrowed): 14 findings in `LAUNCH_EXCLUDED_API`, each with its
reason. They are `/api/mdx/qms/{suppliers, internal-audits, nonconforming,
management-reviews, readiness}`, `/api/regulatory/tasks/{dashboard, sync}`,
`/api/concept2cure/projects/all`, `/api/concept2cure/artifacts/export-pptx` and
`/api/chat/{actions, health, send-message, stream, thread}`. The verdict asks
the list after the platform list and before the claimers.

`/api/mdx/vault` corrects an earlier claim. It was claimed for the launch
Vault on 2026-09-26 because the CI walker attributed the device kit's
`useVault.ts` to it, and that walker bug was fixed in `f9eee2670`. The launch
Vault reads the same stores through `/api/c2c/project-vault`. The gate test that
encoded the misattribution now expects the refusal.

## Evidence — measured, and each check seen failing first

| Check | Result |
|---|---|
| Route inventory, production posture, database migrated from trunk (`route-verdict-diff.json`) | 3,358 routes before and after, the same set. **120 changed verdict, all under the 79**: 76 launch → out-of-scope, 44 launch → unmapped. None outside them changed, and every finding has at least one route changed |
| `server/services/entitlements/__tests__/launch-reproof-narrowing.test.ts`: the 79 not served, the 37 kept still served, the exclusion list honest | `test-red.txt` (trunk registry, empty list): **79 failed** / 117 → `test-green.txt` 131/131 |
| `ci:launch-scope-api` (`ci-gate-green.txt`) | 421 paths named by launch and shell screens; none refused |
| `launch-scope-api-gate.test.ts` | 41/41, with `/api/mdx/vault` now expected refused |

## The adversarial review of this change

Workflow `wf_c9944a27-c35` reviewed the commit through three lenses: hidden
callers, the exclusions and claims, and collateral verdict changes. Two
skeptics checked each finding. Two of nine survived:

- **Letter case bypassed the gate (medium, and wider than the review saw).**
  Express routes ignore case: a mount at `/api/chat` serves `/api/Chat/…` and
  `/API/chat/…`, which I checked on a bare Express 5.2.1 app. The verdict
  compared case-sensitively, so `/api/mdx/qms/Suppliers` skipped the exclusion
  list and matched the `/api/mdx/qms` launch root. Worse, the gate itself
  judged only paths starting `/api/`. `/API/mdx/risk-items/1`, or any
  out-of-scope route under `/API/`, was served unjudged, and that has been so
  since the gate was written. Encoded, doubled-slash and dot-segment variants do not
  route (also checked), and a trailing slash is already matched at the segment
  boundary. The verdict and the gate now lower-case the path, and a test holds
  every key they match to lower case. Red: 14 cases from the exclusion list
  (`case-verdict-red.txt`) and the gate's `/API/` case (`case-gate-red.txt`);
  green 253/253 (`case-green.txt`). Re-measured: lower-casing changed no
  verdict among the 3,358 mounted routes.
- **The `export-pptx` exclusion's reason was false (low).** Since `f8af76fb1`
  the route renders supplied content with `pptxgenjs` and uses no model. The
  reason now says so. The route is still dead: no client has ever called it.

`server/middleware/moduleEntitlementGate.ts` was edited by `…01TzCCfq` at
2026-10-22T00:12Z, inside its 24-hour window. Its one-line change here,
lower-casing the path it judges, is disclosed on the board rather than
deferred, because the bypass left launch scope open to anyone who typed
`/API/`.

## Not changed

The roots `/api/chat`, `/api/concept2cure/artifacts` and
`/api/submission-ops/packages` are served but no finder judged them, so they
keep their claims as they were.

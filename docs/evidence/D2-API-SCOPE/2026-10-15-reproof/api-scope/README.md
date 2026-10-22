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

## Not changed

The roots `/api/chat`, `/api/concept2cure/artifacts` and
`/api/submission-ops/packages` are served but no finder judged them, so they
keep their claims as they were.

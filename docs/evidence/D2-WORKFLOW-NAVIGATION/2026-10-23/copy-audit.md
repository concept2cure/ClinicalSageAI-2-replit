# Workflow terminology audit

Read-only production audit, 2026-10-23, D2/W2. No production edits or tests run by this reviewer. Reviewed root instructions and `docs/design/WORKFLOW_DISCOVERY_2026-10-23.md`.

## What already exists

The canonical catalog is `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx` (`Apps`); rail/account/registry naming comes from `registryModel.ts`, `Shell.tsx`, and `shared/constants/ui-surface-registry.ts`. Home also has the independently populated `surfaces/CapabilityBrowser.tsx`, reached only by `surfaces/Surfaces.tsx`; that second catalog is the presentation being converged. Existing module-subscription routing, access requests, AnA mentions and actions use stable ids rather than labels.

Searches covered Apps/catalog/browse/launcher wording in v2 nonfixture production sources, shared surface/navigation/action registries, matching client and shared tests, and discovery/catalog CI scripts. Regulatory application terminology was checked separately and must remain intact. Parent discovery already records deleted-history inventory; this reviewer did not mutate Git.

## Narrow user-facing corrections

| Existing path | User-facing text | Recommendation |
| --- | --- | --- |
| `registryModel.ts:151`, `Shell.tsx:380`, `shared/constants/ui-surface-registry.ts:179` | Apps catalog | Workflows, everywhere this stable `apps` destination is named. |
| `surfaces/AdminSurfaces.tsx:1823–2160` | Apps catalog, applications, app cards, platform services as another card grid | Workflow/task guidance, feature lists, secondary administrator details. Preserve error-versus-empty honesty and all access remedies. |
| `surfaces/AdminSurfaces.tsx:3318,3347` | Org-admin references to Apps catalog | Workflows, retaining existing destination and access distinctions. |
| `surfaces/Surfaces.tsx:464` / `CapabilityBrowser.tsx:80–86` | Browse all capabilities; Everything in your segment; All modules built for this client category | One Home CTA to existing Workflows; retire duplicate overlay presentation. |
| `navEntitlements.tsx:245–254,337–367` | Asked for this app; this app is locked/disabled/not included; Open Apps catalog | Use feature and Open Workflows. Preserve launch/tier/industry/admin-disabled branches and requestability. |
| `appMentions.tsx:212,223` | Apps — choose one…; listbox Apps | Features — choose one…; listbox Features. Keep internal MentionKind `app`, inserted labels, handles and parser behavior. |
| `shared/navigation/index.ts:94` | Apps; specialist-tools launcher | Workflows; task guide for existing work areas and features. Keep target id `apps`. |
| `shared/navigation/surface-actions.ts:1497–1498` | On the Apps catalog; switches on app cards | In Workflows; switches on feature cards. Keep `apps.show-admin-controls` action id and governed write contract. |
| `shared/navigation/demo-scripts.ts:88,151` | eight apps of this release; one or two apps | Existing workflows/work areas, without a hard-coded count or widened release claim. |
| `surfaces/AccessRequests.tsx:145–146,352,420,424,550` | Nobody asked for an app; turns the app on; granted an app | Feature, preserving whole-workspace scope, role and audit wording. |
| `surfaces/Onboarding.tsx:1178` | Your apps remain subject to supported launch scope | These features remain subject…; adjacent existing `organization is receives` grammar can be corrected narrowly. |

## Text and contracts to retain

- `apps`, `Apps`, `AppsCatalogApp`, `AppsCatalogGroup`, `AppLicense`, `CALLABLE_APPS`, `MentionKind: app`, `parseAppMentions`, `apps.show-admin-controls` and module-subscription endpoint names are implementation/wire contracts. Renaming display text does not require a protocol migration.
- Keep actual regulatory applications and filing terms: IND, NDA, BLA, MAA, clinical-trial application, marketing application, application number/type, Applications & filing. Do not blanket-replace `application` or `app`.
- Generic references to the whole product/app, authenticator app, app-shell CSS and app-wide providers are unrelated.
- Historical decisions, evidence, migration headers, code comments and test descriptions may retain the language used when recorded. Update current human guidance where useful without rewriting historical records.
- `AuthoringEngine.tsx:234` is a source comment explaining a past catalog problem; it is not rendered user copy. Likewise dataConnect, LaunchScopeGate and most Shell/registry prose are comments.

## Tests and gates affected

- Direct label/error assertions: `appsLive.test.tsx`, `appsCatalogEntitlement.test.tsx`, `shellNav.test.tsx`, `cmdkLicenseGating.test.tsx`. Legacy catalog fixtures use noncanonical ids such as `cmc-wizard`; retain them in Additional capabilities and explicitly expand details for role-based assertions.
- Direct duplicate-browser import/behavior: only `capabilityBrowser.test.tsx` imports the retired component; production import occurs only in `surfaces/Surfaces.tsx`. Replacement tests must prove Home → stable apps and catalog feature → original destination, including client segments.
- Regression suites: `appsLicenceLimitNotRecorded.test.tsx`, `anaOperatesAuditTrail.test.tsx`, `appMentions.test.tsx`, `launchScopeLock.test.tsx`, `railLicenseGating.test.tsx`, `unlockJourney.test.tsx`, `accessRequests.test.tsx`, `accessRequestsHonestEmpty.test.tsx`, `railPiecesRehomed.test.tsx`, `auditTrailHeadersAndCopy.test.ts`, `moduleCatalogReconciliation.test.ts`, `navigationReachability.test.ts`, `projectHomeLaunchScope.test.tsx`.
- Shared contract suites: `shared/navigation/__tests__/navigation.test.ts`, `surface-actions.test.ts`, `callable-apps.test.ts`, `demo-scripts.test.ts`, `demo-scripts-name-no-seeded-record.test.ts`.
- Existing gates still useful unchanged: `scripts/ci/check-surface-discoverability.mjs` checks surface/catalog reachability, `check-catalog-copy.mjs` checks persisted module descriptions; `tests/schema-contract/catalog-module-claims.contract.test.ts` protects capability honesty. Their historical Apps wording does not affect UI labels. No source gate found that requires the retired CapabilityBrowser file or name.

This audit recommends terminology consistency; it does not authorize altered access, additional releases, or claims of clinical/regulatory workflow completion.

# Complete workflow discovery in the existing catalog

Launch row D2, workstream W2. Canonical branch `concept2cure-v2`. Baseline `381a42fda` (includes the prior backfill qualification). Founder request, 2026-10-23: too many confusing apps; consolidate features into client workflows and explain when/how to use them.

## What already exists

- `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx`, `Apps`: live subscription catalog, entitlement reasons, licence quotas, audited reason-for-change switches, and AnA surface context. Groups every module by backend category; lacks task guidance/search and exposes platform implementation services as more cards.
- `client/src/concept2cure/v2/surfaces/CapabilityBrowser.tsx` and `surfaces/Surfaces.tsx`, Home: second, segment-wide discovery overlay, with search but no entitlement or launch filtering. It duplicates catalog discovery and presents deferred capabilities as destinations.
- `shared/constants/launch-scope.ts`, `LAUNCH_APPS`: existing seven work-area compositions including feature surfaces/modules. This is policy, not a workflow-completion engine. Reuse composition for presentation without changing scope or grants.
- `client/src/concept2cure/v2/registryModel.ts`, `Shell.tsx`, `shared/constants/ui-surface-registry.ts`: rail, account-menu and canonical surface labels. P-36 keeps the rail destinations; update the catalog label consistently, keep ids and routing.
- `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`: already-scoped Evidence, Author, Review, Submit and Respond work. It is the project workflow; no additional journey or wizard is needed. `ProgramJourney` is deferred and unpopulated for ordinary clients; do not resurrect it.
- `client/src/concept2cure/v2/navEntitlements.tsx`, `server/routes/module-subscriptions.ts`, `server/services/license-manager.ts`, tables `available_modules` / `module_subscriptions`: canonical access explanations, reads and governed writes. UI grouping never changes their verdicts. Existing module-vs-surface launch classification discrepancies (CMC, communication, IND checklist) are not broadened here.
- `shared/navigation/index.ts`, `shared/navigation/surface-actions.ts`, surface context: AnA navigation/action contracts. Preserve `apps` and `apps.show-admin-controls`; update human language, retain existing fact keys for compatibility, describe visible grouping/search honestly.
- Existing client tests: appsLive, appsCatalogEntitlement, appsLicenceLimitNotRecorded, shellNav, cmdkLicenseGating, railLicenseGating, capabilityBrowser, anaOperatesAuditTrail. Vitest config supports client jsdom tests.
- Existing decisions: `docs/SURFACE_DECISIONS_2026-10-08.md`, `docs/design/ONE_ANA_ONE_CANVAS.md`, `docs/design/WORKFLOW_DECISION_2026-10-08.md`, `docs/LAUNCH_DEFINITION_OF_DONE.md` P-36. Features belong in project/document workflows; the later founder rail decision remains respected.

Discovery searched client surface/registry/navigation/catalog/workflow/launcher names, backend module-subscription routes and licence service, shared launch/surface/navigation registries and available_modules/module_subscriptions; related AnA actions and unreachable segment entries. Deleted-history searches over AppsCatalog, AppLauncher, registryModel, ProgramJourney, WorkflowGuide and workflow navigation found no reusable replacement; a legacy archive removal exists and is not restored.

## Interface contract

1. Extend existing `Apps` screen, stable id `apps`, displayed as **Workflows** throughout shell and AnA. No new destination, workflow engine, storage, dependency, grant or supported market claim.
2. Group live rows by membership in existing `LAUNCH_APPS` surfaces/modules, retaining each row exactly once. Show seven existing work areas only when they have live rows. Each states when to use it, where to start, and what follows. Detailed capability lists are collapsed by default and expanded while searching or showing admin controls. Do not infer project status or completion.
3. Unknown/unclassified rows remain reachable under secondary **Additional capabilities**, with backend categories retained; no silently dropped rows or invented unlock. Search covers visible names/descriptions, work-area labels and guidance. A no-match result differs from a real empty catalog and a failed read.
4. Project-first orientation leads to the existing Projects destination through its actual entitled catalog card. It explains that selecting a project brings Evidence → Author → Review → Submit → Respond. No fabricated project id or navigation scope. Each existing feature still opens its original destination and gate.
5. Consolidate Home's duplicate capability overlay onto the existing Workflows destination. Retire only that presentation component; underlying surfaces and catalog entries stay. Reachability tests pin Home → apps and catalog feature → existing destination.
6. Keep all existing lock reasons (launch, tier, industry, admin-disabled), honest loading/errors, licence limits and audit-confirmation toggles. Toggling uses original group identity/index even after regrouping/search. Licence management and platform service details become secondary administrator context, not extra client products.
7. AnA context includes workflow grouping and visible search state, and labels modules as features rather than independent applications. Existing action IDs and fact keys remain compatible. No model/provider change.

## Qualification

Write meaningful failing component/navigation tests against unchanged production, retain logs and input hashes, then implement. Verify workflow nesting/search/reachability, unknown-row retention, no new unlocks, governed toggles and load/error/empty honesty. Run relevant existing regression suites, changed-file lint, whole-project TypeScript and all normal push gates. Inspect real component rendering in a synthetic browser harness; clearly distinguish it from authenticated deployed-client acceptance. Commit and push directly to canonical branch, resolve incoming changes, retain review and qualification evidence in this directory.

## Implementation and founder clarification

The oversized existing catalog block is moved once into `surfaces/WorkflowCatalog.tsx`, reexported as `Apps` from `AdminSurfaces.tsx` for route/test compatibility. Setup reuses the same live decoder and verdict; no parallel catalog or access implementation is created. `catalogWorkflows.ts` is presentation over existing composition; `styles/workflows-v2.css` styles guidance. Home discovery reaches this existing surface. The retired overlay's two nonlicensable records, Audit trail and Part 11 console, retain the existing `Shell.tsx` command-palette paths, tested in `capabilityBrowser.test.tsx`.

Founder clarification during implementation: durable work areas can be Risk-based monitoring, Biostatistics, CMC, Quality, Reporting, Vault, Project Management and Tasking. IND work is one cross-functional project across Regulatory Affairs, Regulatory Operations, Medical Writing, CMC/QA/supply, nonclinical, clinical, safety, translational, legal and program teams. These functions are not separate products. Small sponsors may use the same person or external partner for several responsibilities. Workflow guidance is the first discovery correction, not a claim that every specialist capability or market is launch-qualified. Ownership/content-plan reuse is being inventoried in the existing project workspace; no empty ProgramJourney or additional app catalog is restored.

## Qualified implementation before canonical catch-up

- Fail-first: 12 new workflow UI failures; 15 original Home discovery/label/overlay failures; 6 label/error regressions with 27 controls passing. Two later CmdK control selectors initially also selected Ask AnA rows; anchored selectors corrected this authoring issue. Logs are retained and are not represented as 17 production defects.
- Final component/shared-contract cohort: **234 tests passed in 25 files** (`root/regressions-final.txt`). Initial broader run retained: old feature wording and two outdated auth mocks were repaired without relaxing access/history/navigation assertions (`root/test-fixture-corrections.md`).
- Whole-project TypeScript passed with zero errors before final copy/style/fixture cleanup (`root/typecheck.txt`); the normal push gate is authoritative for final committed types.
- Production build passed (`root/build.txt`), with existing bundle-size advice; no dependency, database or policy change.
- Actual-component synthetic browser: **11/11 checks passed**, zero page errors, 1440px desktop and 390px phone, dark search contrast 14.39:1, native keyboard disclosure, correct feature navigation, scope lock and reason-bearing synthetic toggle. See `ui/README.md` for exact fixture boundaries and retained failed/stale capture attempts. This is not authenticated production or agency acceptance.
- Independent source review accepted (`review/INDEPENDENT.md`), including unchanged entitlement semantics, original backend group indices after filtering, stable ids, unknown-row retention and existing audit/Part 11 paths.
- Added IND cross-functional orientation. Functional ownership expansion itself remains the next extension, inventoried in `docs/design/IND_CROSS_FUNCTIONAL_WORK_2026-10-23.md`; no arbitrary CTD placement or new approval authority is inferred.

Root will retain the canonical catch-up, final push gates and remote verification in this directory. This is evidence for discovery improvement under D2, not a declaration that the whole platform or all jurisdictions are ready.

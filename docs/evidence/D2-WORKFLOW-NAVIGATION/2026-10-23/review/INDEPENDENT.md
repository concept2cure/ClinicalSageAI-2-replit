# Independent workflow-discovery review

Reviewer: `workflow_independent_review`. Launch D2 / W2. Canonical branch only. Final disposition: source review accepted for this workflow-discovery increment. Release qualification and publication remain the root session’s responsibility. No tests, compiler, production edits, Git operations or publication were executed by this reviewer.

## What already exists

- `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx`: canonical live catalog, backend-category mapping, honest loading/failure handling, subscription-state lock reasoning, licence quotas, governed reason-for-change toggles and AnA context. Presentation lacks workflow guidance/search and an original-index-safe regrouped view.
- `shared/constants/launch-scope.ts`: seven existing work-area compositions, surface admission separate from provisioned module grants. Grouping may reuse membership; it must not decide access.
- `client/src/concept2cure/v2/surfaces/Surfaces.tsx` and `CapabilityBrowser.tsx`: Home has a second searchable segment-wide capability grid with no entitlement filtering. Consolidating this presentation onto the existing catalog does not require another capability engine.
- `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`: real project-scoped Evidence / Author / Review / Submit / Respond stages already exist. The guide must reach this workflow through Projects, not infer a project ID, completion or supported filing jurisdiction.
- `client/src/concept2cure/v2/__tests__/moduleCatalogReconciliation.test.ts`: proves catalog entries cover licensable segment destinations and resolve to real registered surfaces. It deliberately excludes `audit-trail` and `part11-console`, which are not commercial/grant rows.
- `client/src/concept2cure/v2/Shell.tsx` CmdK, `registryModel.ts`, `shared/navigation/index.ts`: existing retained navigation paths for those nonlicensable audit/Part 11 destinations. Catalog-only parity is not sufficient to prove their reachability after the Home grid is retired.
- `client/src/concept2cure/v2/navEntitlements.tsx`: access reasons and remedies are authoritative display contracts. No row/unknown destination is not itself a licence lock; catalog interpretation must remain consistent with existing policy.

## Contract review

The plan extends the existing discovery surface, preserves stable IDs, nests catalog features under canonical work areas, and converges the duplicate Home discovery entry. It is consistent with the founder's request and existing product decisions. Contract accepted subject to the following implementation checks:

1. Keep workflow purpose and when/start/next guidance visible before expanding detailed feature lists. The founder's primary problem is uncertainty about when and how to work; hiding the explanation behind a guessed expansion would retain that problem.
2. Preserve every live catalog row once, including unclassified entries. Match search against original names, descriptions and categories as well as workflow language.
3. Read access and toggles from each actual row; grouping cannot make an available child imply an available parent. Do not bypass server launch classification or change grant lists.
4. Retain immutable original identity/index when presenting regrouped or filtered rows. Confirmed writes and subsequent state updates must address the same module ID.
5. An empty/error refreshed catalog must not display stale rows from an earlier optimistic copy. The original reseed condition only adopted nonempty groups; new grouping should not multiply this existing weakness.
6. Retiring `CapabilityBrowser` must name and qualify replacement reachability for audit trail and Part 11 console separately from ordinary catalog rows.
7. Native disclosure controls must remain keyboard accessible, with search/admin expansion and clear-search behavior that leaves accurate counts and visible locked remedies.
8. No workflow/completion/readiness, geographic coverage, agency acceptance or production-readiness claim follows from visiting a screen or grouping rows.

## Implementation review

Final source review accepted, 2026-10-23. The reviewer read the full production diff, the extracted canonical implementation and presentation helper/style files, the updated contract, the new IND inventory record, and the meaningful component/navigation test changes. No independent test execution or deployment acceptance is claimed here.

- `WorkflowCatalog.tsx` is the single moved catalog implementation; `AdminSurfaces.tsx` preserves the stable `Apps` export and reuses the same decoder/verdict for Setup. The old implementation is removed rather than left in parallel. Reads and writes retain original API/module IDs.
- `catalogWorkflows.ts` partitions existing rows by canonical launch composition, with original backend group indices preserved through grouping and search. Unclassified rows remain under Additional capabilities. The reviewed correction makes a future area with no guidance fall back to Additional rather than disappear.
- Row-level `moduleVerdict`, launch-scope precedence, plan/industry/admin-disabled distinctions and `toggleable` logic are preserved. There is no workflow-level navigation button that could let an entitled child imply an entitled parent. Confirmed switches retain original module ID and group identity, with the existing reason dialog, server acceptance requirement and audit-failure disclosure.
- The nullable optimistic copy and reference comparison now adopt empty refreshed mappings and show the current mapping before reseeding. Search, genuine empty catalog and failed reads have distinct branches. The guide never converts a search miss or read failure into an entitlement verdict.
- Purpose and when/start/next guidance are outside native collapsed feature lists. Searching/admin mode opens disclosures; original feature names, descriptions, IDs and categories remain searchable. Summary controls retain native keyboard semantics. Platform-service implementation detail is secondary and administrator-visible.
- The duplicate Home overlay is removed, with Home reaching stable `apps`. Multi-segment Home tests retain no-project behavior. Audit trail and Part 11 console retain the existing command-palette paths; real CmdK/provider replacement checks cover both without catalog grants.
- Canonical rail/account/surface/AnA labels now say Workflows, mention UI says Features, and stable internal `apps`/action/fact keys remain unchanged. Original regulatory applications are not renamed.
- Reviewed copy defects (`featureroval`, remaining access-request app wording, and “in the Workflows”) were corrected in the final source. These were discovered during review; the correction does not alter access or governance semantics.
- Reviewed dark-mode defect was corrected: the search input now uses canonical `--bg-000`, avoiding white fallback with near-white inherited text. The responsive licence band is scoped to the workflow page. Browser execution and visual inspection belong to the separate UI qualification evidence.
- The added IND paragraph is conditional orientation for biopharma/biotech/pharma. It describes cross-functional contribution and overlapping responsibilities, without asserting named-person assignment, project membership, approval rights, completed tasks or new filing support. `IND_CROSS_FUNCTIONAL_WORK_2026-10-23.md` explicitly inventories the next tasking/ownership extension as unimplemented and warns against changing section-owner authorship/separation-of-duties semantics.

### Boundaries and follow-up

This first increment consolidates discovery and guidance; it does not complete tasking/functional ownership, qualify all retained specialist features, widen markets/filing types, change release/grant lists, or prove authenticated deployed-client acceptance. Existing catalog module-versus-surface release classification discrepancies remain unchanged and documented. Primary project creation/opening remains through the entitled Projects feature card, reached by expanding its list; a direct project-start shortcut is a possible later usability improvement.

### Reviewed production inputs

The following SHA-256 values identify the source reviewed for this disposition; root qualification must reconcile any later production edits.

| Path | SHA-256 |
| --- | --- |
| `client/src/concept2cure/v2/surfaces/WorkflowCatalog.tsx` | `f1afed53b86559e22009b3383cf08d936193c0e4b6503adafc06c2f40883fbf1` |
| `client/src/concept2cure/v2/catalogWorkflows.ts` | `e4ed0f3c463d57ebe6ebe273664440a095af97c35b059f9688829e0d6af46a9d` |
| `client/src/concept2cure/v2/styles/workflows-v2.css` | `a75ed4dcfe3eae52a7e3d25c98293f4db808817bdeb7dee59dbaba2f5fcb0979` |
| `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx` | `b6ef55d17f8b86de6ab74d49ebfab2330ce83f2495acd2f98a14a2b1fdb9422c` |
| `client/src/concept2cure/v2/surfaces/Surfaces.tsx` | `b3b421dae3c0915ede583951131fa95e54dc9d8fdcf0ffe7194a26707dd84ef5` |
| `client/src/concept2cure/v2/Shell.tsx` | `8b51a162f7f4538959e2d1b8171ce427b4ad86777f93727d1efa59234efb1da3` |
| `client/src/concept2cure/v2/registryModel.ts` | `3903b0172f5b4b8328406c32b3065697ad08cdc4f299e94aa3301bad429bcf45` |
| `client/src/concept2cure/v2/navEntitlements.tsx` | `fb27293457be5e8e0c60c70160f63530f4c17c8f2593d3710a24b78e78ba7349` |
| `client/src/concept2cure/v2/appMentions.tsx` | `95dc38000ae5e43d7dfc9de2f066f0ef1d35fabf56d5230e45a02a16bcc6e31a` |
| `client/src/concept2cure/v2/surfaces/AccessRequests.tsx` | `57c35dd58d9a0f2ddb0849c913e9ce7fdf4061ec16310f84f84df6f4dbc73600` |
| `client/src/concept2cure/v2/surfaces/Onboarding.tsx` | `e3e0e6983d896ebaf6f7521c7480dc7f625f706b648e659bf6074dfa1130eeec` |
| `shared/constants/ui-surface-registry.ts` | `71c5c490b81e6977087c837a59db22a71527ac2e0d1728ce903c4f2f3f95ee58` |
| `shared/navigation/index.ts` | `f7c7a02c1bc41a32421e169a26ab349484ae5ac6232afffff380ef4e4970d391` |
| `shared/navigation/surface-actions.ts` | `9442088ffdab90df203f211635b3ce1130b42a6805943ca70ef6b8ff9e231800` |
| `shared/navigation/demo-scripts.ts` | `55a49a2303baaa80070d2ead387ef61d859cc3f6e99e22e449604f77e113bcf3` |

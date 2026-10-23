# Independent workflow-discovery contract review

Launch row D2, workstream W2. Reviewer: `workflow_consolidation_audit`. Review date: 2026-10-23. Canonical branch: `concept2cure-v2`.

## What already exists

| Path | Existing behavior | Relevant limit |
| --- | --- | --- |
| `docs/SURFACE_DECISIONS_2026-10-08.md` | Decides places, nested features, duplicates and retained/deferred work for the assessed 123 surfaces, under the founder's delegation. | This is an existing consolidation decision, not a newly invented product model. |
| `docs/design/ONE_ANA_ONE_CANVAS.md`, section 5 | Defines a few client destinations, one AnA conversation/canvas, and contextual features. | Later founder rail decisions supersede its older account-menu-only catalog placement. |
| `docs/LAUNCH_DEFINITION_OF_DONE.md`, P-36/P-37 | Keeps the catalog, Tasking and Communication on the rail; readiness belongs inside Submission Center. | A configurable workflow designer is outside the launch scope. Renaming discovery does not introduce one. |
| `shared/constants/launch-scope.ts` | Defines existing `LAUNCH_APPS` work-area membership and separate surface/module lists. | Presentation must not alter scope, grant modules or infer readiness. CMC intentionally grants no module through this list. |
| `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx`, `Apps` | Reads live catalog/license state and provides access explanations and governed administrator switches. | Existing category/card presentation lacks project-first when/start/next guidance. |
| `client/src/concept2cure/v2/surfaces/CapabilityBrowser.tsx` | Home overlay searches the segment's static module list. | It lacks live entitlement and launch filtering, and presents deferred/duplicate surfaces alongside current capabilities. |
| `client/src/concept2cure/v2/surfaces/Surfaces.tsx`, `Home` | Opens the overlay through its browse trigger. | This is a second discovery path with a different policy from the live catalog. |
| `client/src/concept2cure/v2/surfaces/ProjectHome.tsx` | Already provides scoped Evidence, Author, Review, Submit and Respond stages; the data room is inside Evidence. | Stages are navigation, not completed work. Its former organization-level capability grid has already been replaced by project records. |
| `client/src/concept2cure/v2/fixtures/project-home-data.tsx` | Holds canonical stage labels/descriptions and legacy aliases as display configuration. | It is not evidence of stage completion or support for every filing market. |
| `shared/constants/deferred-capability-inventory.ts` | Records retained work and canonical convergence targets, including journey onto project home. | Do not reintroduce deferred Program Journey as a second workflow workspace. |
| `client/src/concept2cure/v2/registryModel.ts`, `Shell.tsx`, `shared/constants/ui-surface-registry.ts` | Supply discovery labels, rail/account entries and canonical metadata. | Keep stable surface ids and update the human label consistently. |
| `client/src/concept2cure/v2/navEntitlements.tsx`, `server/routes/module-subscriptions.ts`, `server/services/license-manager.ts`, `shared/schema.ts` | Existing access decisions, catalog/subscription reads and writes, and `available_modules`/`module_subscriptions` records. | No replacement persistence, service or entitlement implementation is needed. |
| `shared/navigation/surface-actions.ts`, `apps.show-admin-controls` | Existing AnA action reveals administrator controls without itself changing subscription state. | Preserve the action id and human confirmation boundary. |

Discovery included workflow/journey/catalog/launcher/consolidation names in current client surfaces, registries, documentation, server module-subscription routes, services, schema, AnA navigation/actions, and retained/unreachable segment entries. Deleted-history searches over the corresponding client workflow, ProjectHome, ProgramJourney, catalog and registry names found older retired workflow presentations, including legacy project-home code; none is a reusable replacement for the canonical current project workspace or live catalog. They are not restored.

## Decision

Approve `docs/design/WORKFLOW_DISCOVERY_2026-10-23.md` for the first increment: extend the existing live catalog as **Workflows**, use existing launch work-area membership to nest features, explain when/start/next, and converge Home discovery onto that same surface. Preserve P-36 rail destinations with a catalog-label change in this increment.

The reachable replacement for the retired overlay is `surfaces/Surfaces.tsx` Home's **Explore workflows** action -> stable `apps` route -> existing `surfaces/AdminSurfaces.tsx` `Apps` implementation. The revised `__tests__/capabilityBrowser.test.tsx` checks that handoff for each registered segment and the biotech/pharma aliases, unknown type, pending/failed portfolio reads, absence of fabricated project/conversation context, stable route/label, and removal of the duplicate overlay integration. Catalog tests must separately prove feature reachability, live access decisions and confirmed writes.

The old overlay also listed `audit-trail` and `part11-console`, which are intentionally not subscribable catalog modules. Their retained replacement is the existing `Shell.tsx` `CmdK` search/navigation, with global AnA targets in `shared/navigation/index.ts`. The same revised test mounts the real command palette and real navigation-entitlements provider, waits for a resolved response with launch enforcement enabled and no licensable rows for these destinations, then searches and activates each destination. It checks the original route id, no lock, no unrelated conversation/action, and the global AnA target. They must not be forced into the module catalog to achieve discovery parity.

## Required safeguards

- Every primary start action uses the target's own access decision. Access to a child does not confer access to its parent. A locked start retains its actual remedy while entitled children retain their own reachable destinations.
- Search preserves findability by original feature name/description/category as well as work-area labels and guidance. Each live row remains represented once; unknown rows stay reachable in secondary additional capabilities.
- Feature counts are catalog counts, never completion/readiness measures. Merely visiting a project stage cannot complete it.
- Loading, failed catalog read, genuinely empty catalog and search with no match remain distinct. Portfolio read failure does not disable discovery or fabricate a project.
- Keep the existing launch-scope, industry, tier and administrator-disabled distinctions. Grouping never grants access. Existing admin changes remain human-confirmed and audited.
- Preserve stable `apps` and `apps.show-admin-controls` ids, compatible AnA fact keys, underlying feature destinations and existing project scope. Do not create a project context to make a global discovery link work.
- Explain current workflow capabilities without implying qualification for every requested jurisdiction or product type. CMC's US small-molecule IND composition boundary stays unchanged.
- Retire only the competing discovery presentation. This does not delete underlying regulatory capabilities or admit deferred surfaces to launch.

This approval covers the interface contract and implementation direction, not a claim that tests, browser checks, production deployment or regulatory acceptance have passed. Root owns qualification, publication and final evidence.

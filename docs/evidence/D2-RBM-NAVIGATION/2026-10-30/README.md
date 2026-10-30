# Reach existing Risk-Based Monitoring from the rail and project setup

W1 / D2, canonical `concept2cure-v2`, founder request2026-10-30.
Evidence: `docs/evidence/D2-RBM-NAVIGATION/2026-10-30/`.

## What already exists

- `client/src/concept2cure/v2/surfaces/Rbm.tsx`, `RbmSurfaces*.tsx`,
  `rbmBoard.ts`, `rbmWrites.tsx` already implement the live monitoring workspace:
  assessments, KRIs, QTLs, monitoring signals, patients, sites, plans and approvals.
  The current project picker lists programs with RBM data and chooses the first;
  project setup does not explicitly select this service.
- `server/routes/mdx-rbm-board.ts`, `mdx-rbm.ts`, `mdx-rbm-data.ts` and
  `server/services/rbm/` already own tenant-scoped reads, persisted writes,
  deterministic scores and governed approvals. No second monitoring engine/store.
- `shared/constants/ui-surface-registry.ui-v2.ts` already registers `rbm` and
  its granular API claims; the actual aggregated `/api/mdx-rbm` reads need review.
  `surfaceViews.ts` already routes `rbm` to the existing Rbm component.
- `registryModel.ts` / `Shell.tsx` own the main rail. `RAIL_CORE` lacks RBM.
  `shared/constants/launch-scope.ts` also lacks it; a client-only entry would
  still be withheld by the server. Existing catalog `rbm` is professional tier
  (`db/migrations/20260823_module_catalog_commercial_packaging.sql`); preserve
  commercial/role verdicts rather than adding blanket grants.
- `surfaces/Projects.tsx` owns the existing NewProjectWizard; canonical create
  uses `projectIntakeRequest.ts`, `server/routes/c2c/projects.ts` and
  `project-intake.ts`. The existing regulatory_programs metadata column can
  carry project service choices; no existing RBM setup selector was found.
- `.design/client-journey/INFORMATION_ARCHITECTURE.md` accepted direction names
  RBM as a central service, with project Evidence/study context and gaps in
  project linking, API claims and admission (slice25). Current founder request
  of2026-10-30 explicitly authorizes rail reachability and project-setup choice.
  It does not request clinical-ops/store convergence or replacement engines.

Searches cover RBM/risk-based monitoring aliases, nav/registry/launch/AnA,
project wizard/intake, service/routes/tables and deleted history. Raw inventory
is retained privately under `/workspace/.cloud-setup/rbm-navigation/`.
Deleted history finds3historical retirements/rewrites, not an absent module.

## Qualification

Pending. Preserve licensing, tenant/project isolation, deterministic scores and
governed approvals. Source publication is not hosted or clinical validation.

## Approved scope

See the approved bounded contract. This admission includes current-project access
and draft-only seed safeguards needed for the existing RBM paths newly exposed.
No clinical-ops convergence, new study store or commercial grants are included.

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
- Release review found that existing RBM approval routes re-verify credentials
  and enforce signing authority/two-person checks, but their actuator only saves
  approval stamps. `server/services/part11/signature-persistence.ts` and
  `governed-signature-ceremony.ts` already provide canonical persisted signatures
  and their audit linkage. The old `sign-ceremony-baseline.json` deferral relied
  on RBM being outside the launch catalog; that reason no longer applies.
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

## Approved bounded contract

Founder request2026-10-30 admits the existing RBM central service now. Reuse the
existing surface, stores, engines, source ingestion and signed approval paths.
This reaches monitoring for a regulatory project UUID; it does not invent a new
clinical-study record, regulatory filing type or clinical-ops convergence.

1. Root owns `registryModel.ts` rail entry, `launch-scope.ts` surfaces-only RBM
   app (`modules:[]`), exact called RBM API-family claims in the surface registry,
   founder decision/IA update, reviewed presentation-only RBM navigation constants
   (remove a legacy hard-coded subject starter), this contract/evidence/work-order and root tests,
   plus explicit endpoint resolution in the existing `rbmWrites.tsx` transport
   so its shared namespace base is not mistaken for a broad API claim,
   Git and global gates. Preserve professional-tier catalog and existing module
   enforcement mode; no default subscription grant or broad `/api/mdx` claim.
2. Project worker owns client `surfaces/Projects.tsx`, `Rbm.tsx`, `rbmBoard.ts`,
   minimal `ProjectHome.tsx` Evidence entry and server `routes/c2c/projects.ts`,
   plus its adjacent focused tests. Add unchecked optional strict boolean
   `riskBasedMonitoring` in project configuration, review, create payload,
   existing program metadata and creation audit. Detail/create projects a safe
   boolean; no raw metadata, automatic assessment/seed or commercial grant.
   Publish/read the existing shell-project channel for admitted RBM selection;
   never substitute another project's board for unavailable explicit context.
   Preserve actual project when moving between RBM and Vault/Tasks.
3. Server worker owns new small `services/rbm/rbm-access.ts` admission adapter,
   existing RBM board/data/record routers, narrowly bounded bootstrap call sites
   if needed, the one RBM-specific AnA registry admission seam, minimal description-only
   tool definition correction, and canonical
   assessment seed extraction/reuse if required, plus adjacent tests. Reuse
   requestPgClient/current-program-access, current actor/editor-role and existing
   license/mode resolvers. Never gate the entire shared `/api/mdx` namespace.
   Resolve row IDs to project IDs server-side through fixed known RBM tables,
   reject mismatched/unanchored/private/cross-tenant records, and require an
   explicit admitted program for project-bound list reads. Preserve unrelated
   handlers, transactional writers and signature authority.
4. Server roster returns `{id,label,code?,productType?,programType?}` using actual
   canonical project UUID/name, selected metadata true OR existing live RBM
   records, filtered by verified current accessible project scope. A newly
   selected project with no monitoring rows is selectable and opens the existing
   honest empty/start state. Failed/missing-store reads are explicit failures,
   not a fabricated successful empty/healthy board. Board reads require canonical
   project admission before returning private data.
5. Adding RBM to launch scope promotes20existing AnA tools. At the existing
   registerToolHandler wrapper, compose a helper inert for all other tools that
   checks captured current actor, existing commercial enforcement mode/verdict,
   canonical project access and any supplied record/project identity coherence.
   Existing human-confirmation/editor/signature refusals remain. Converge the
   legacy AnA assessment seed onto canonical transactional DRAFT creation;
   activation still requires the existing signed approval. Minimal existing
   assessment lifecycle parity also refuses unsigned changes to non-draft records
   and persists the amendment creator in `rbm-actuator.ts`, so the existing
   two-person signing check also covers that new version. No second seed or
   authorization policy engine and no unsigned active assessment.
   Release completion must also reuse the existing canonical signature writer
   for assessment/plan approval, binding the signed record/version, meaning,
   reason and verified signer to the same transaction as the approval. A failed
   signature write must roll back approval; AnA still cannot sign. Preserve a
   failing-first mounted-route check and verify both approval kinds and refusal
   paths. Update the obsolete baseline reason only after that proof exists.
   The approved bounded file extension is
   `server/services/rbm/rbm-signature-content.ts` for one deterministic content
   recipe, two RBM binding bases in `part11/signature-persistence.ts`, and two
   target handlers in `part11/governed-target-binders.ts`. Assessment signatures
   bind the immutable version and coherent CtQ content; plan signatures bind the
   immutable plan version rather than mutable execution actions. Canonical
   re-derivation must use the same recipe and fail closed without its required
   basis. Existing modal-declared approval meaning and server-verified MFA
   evidence are retained. No new signature policy or parallel persistence path.
6. Workers first preserve meaningful failing checks on unchanged production,
   then implement within their files. Tests cover actual rail navigation and
   existing peers, API/AnA admission with unchanged grants, real wizard review/
   persistence/malformed choice, selected empty project/labels/context, private
   and cross-tenant targets, row mismatch and draft-only seed/rollback. Root runs
   bounded affected cohorts, build, zero-regression lint, normal push including
   whole TypeScript, and fresh remote/source verification. Live deployment and
   clinical qualification are not claimed from local checks.

Root approved this file/interface split before production assignment. No worker
may edit another owner's files; coordinate any shared contract change first.

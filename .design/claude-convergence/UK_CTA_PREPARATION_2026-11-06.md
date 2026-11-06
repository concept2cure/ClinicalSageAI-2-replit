# Complete UK CTA preparation in the core workflow

2026-11-06. Package F1; launch W3, rows D2/D4. This repairs existing UK_CTA preparation under P-73 through the shared project/document path. ONE_DESIGN_PLAN, RULES 0/3/4/5/6 govern it. The current canonical branch contains the previous IND increment, but not the unpublished UK work described in the retained session handoff; no previous UK test or gate receipt is claimed as current proof.

## What already exists

Read at canonical `21a21849d7cfb8a35794489a87fad2b849c7011c`, using `rg` across server routes/API/src/services, shared records, migrations and client surfaces. Full non-shallow history searched with `git log --all --diff-filter=D` for UK CTA, MHRA, IRAS, blueprint and clinical-trial-application names. Only unrelated old CMC/protocol blueprint/UI deletions were found; no recoverable UK CTA implementation.

- `shared/regulatory/global-document-registry.ts` defines UK_CTA but calls it eCTD and inherits eCTD dossier metadata; UK_MA is a separate marketing identity.
- `shared/regulatory/project-bootstrap.ts` supplies generic CTD sections and tasks for UK_CTA, rather than UK medicinal-trial preparation.
- `server/services/regulatory/sectionBlueprintCatalog.ts` and `taskBlueprintCatalog.ts` statically select regional blueprints; UK_CTA is absent. Existing regional wrappers live in `registry/blueprints/`.
- `server/services/regulatory/registry/submittabilityCoverage.ts` owns the delivery verdict. UK_CTA has no exact IRAS channel and can fall through to a regional gateway.
- `server/services/global-ri/clinical-trial-application-requirements.ts` has six UK labels and returns ready on presence alone. Its existing routes and regulatory-strategy-brief consumer expose this record; they need no new API.
- `server/services/ana/AnaDocumentDraftingService.ts` consumes the exact regional blueprint in the editor and AnA. `blueprintLines` carries limitations but omits the basis; UK has no preparation route and metadata can direct invented IRAS formatting.
- `client/src/concept2cure/v2/editor/DocumentCanvas.tsx` and `DocumentWorkbench.tsx` already serve every type. Their layout and lifecycle are not changed by this repair.
- `server/services/c2c/program-registry-context.ts` resolves recorded UK trials. `server/services/market-support.ts` keeps marketing-shaped legacy ind:mhra no-offer; CMC composition stays small-molecule US IND.
- `docs/design/TRIAL_APPLICATION_DRAFTING_2026-10-30.md` records the published IND work and open cited regional slice. Therapeutic-area regional section matching, nonclinical source binding and independent qualification remain open.

## Bounded repair

Extract one pure shared UK preparation record inside `shared/regulatory/`, preserving six existing component codes. Both shared project bootstrap and static server catalogs consume it; any server wrapper reexports it. Baseline preparation flags preserve permitted alternatives; conditional rows remain unassessed. Numeric modules are platform groups, not a fictitious UK eCTD schema. Medicinal-product trial scope only.

Correct exact UK_CTA metadata and the existing channel function to combined IRAS review with no platform connector. State standard/exception and date limits from current sources. Project scope/date, product applicability, alternatives and initial old/new-regulation assessment remain unassessed, because current inputs do not supply those facts. The existing MHRA checklist derives from the same shared record and cannot return ready from labels alone. Other markets retain behavior.

The existing drafting prompt receives source URLs, basis labels and limits. Actual IRAS forms are completed and validated externally; this content outline provides no field schema or transmission. No apps/cards/screens/editors, route files, mounts, services, tables, tools, providers or production dependencies are added. No model calls are needed for software verification.

## Verification

Retain behavioral reds before production fixes, then affected catalog, metadata/channel/checklist, shared bootstrap and actual drafting service/editor-boundary tests. Run scoped lint, client/server build and normal gates as available. Record exact source, results and limitations. A source retrieval or prompt stand-in is not legal/scientific/model/agency qualification. No browser screen completion is claimed for this data and server-only repair.


## What already exists — merged source-intake fixture

Before any further test edit or worker prompt, the broader caller run at merge `1162f4a1c` found 10 failures/339 passes in five suites. All ten failures are in existing `server/services/authoring/__tests__/authoring-source-import.test.ts`: its query fixture returns an org-public, non-owned project with an empty members array, so the new canonical write-intent forwarding correctly refuses before the source assertions. `server/services/report-os/project-access.ts` already delegates edit decisions to `canEditProject`; the corrected SQL/PGlite fixture in the incoming owner provides real edit membership. Reuse that policy shape in this existing unit fixture, retain the private/revocation checks by retiring its edit grant, and add an explicit use-only refusal. No production policy or assertion is relaxed. Existing source-import tests preserve hash/currentness/transaction checks. Source/caller searches and full deletion history were inspected: history has three existing source-intake commits, no deleted replacement. This completes the existing F1 test owner and does not create another capability.

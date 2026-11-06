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

## Current status

Implemented in the existing shared preparation/drafting owners: 25 preparation rows and 9 tasks, direct shared/server object identity, exact IRAS channel, and a labels-only MHRA assessment that remains unassessed. Six legacy component codes are preserved. The editor reuses its existing drafting route; no screen or layout changed.

Fresh sources: five official pages (four current plus the obsolete linked MHRA page), with publisher dates, 26 verified exact quotation spans and source hashes retained in `official-source-index.json` and `official-sources.tar.gz`. The HRA obsolete link, duplicated MHRA human-experience paragraph and unread linked scenario/eligibility tables remain explicit limits. Conditional SoECAT is retained.

Behavioral reds were captured before production fixes: editor/real PGlite service 2 failed and 27 passed; catalog 9 failed and 1 control passed; channel/checklist 8 failed and 25 passed. Final integration passes 350/350 across 14 suites, including actual editor and real PGlite recorded-project loading, US/EU/CA/JP compatibility, blueprint consistency, coverage/channel, CMC scope and client writing agency. The independent five-suite channel/checklist/strategy cohort passes 51/51; it overlaps the integration cohort. Gateway providers are stand-ins; there are no live model calls.

Scoped ESLint on all 14 changed TypeScript files: zero errors and nine existing warnings. Production client/server builds pass (`npm run build`, Node 22.23.4). All normal pre-push gates passed at source `79a2f3605`: zero full-tree TypeScript errors against the unchanged zero baseline, no warning growth and all one-plan/one-product/security/contracts. Git then rejected a concurrent ref advance, retained as `gates-pass-ref-race*`. No baseline or suppression was widened. A legacy numeric UK section now stays explicitly unindexed; the actual UK preparation code resolves through the shared outline. This updates the corresponding existing editor assertion rather than inventing a CTD mapping.

Read-only adversarial review found no material source/guard/ownership issue. Two implementation agents owned disjoint files; the lead independently ran the combined integration, inspected final content, verified source quotations/hashes and runs the build/gates. Individual red/green/lint logs are compressed beside this file.


## Canonical synchronization

Incoming Project knowledge changes through `e533082d6` were merged normally at
`1281bf569`. Only the coordination table conflicted; its current D3 status and the
UK source-frozen/released row were both retained. The incoming code changes only
client project presentation, not UK bootstrap, drafting, filing context or server
guards. Read-only review found no compatibility blocker. Project profile notes
remain distinct from IND program/charter facts; no conflict reconciliation is claimed.

The affected nine project suites, four adjacent project/admission suites, and the
actual editor/real PGlite service checks pass 161/161 across 15 suites. The merged
production client/server build passes. All 14 UK source hashes remain unchanged.
A normal publication retry is pending; no force, hook bypass or baseline expansion
was used. Full logs and the original successful-gates/ref-race receipt are retained.


The retry at `a3c841384` again passed every normal gate, including zero full-tree
TypeScript errors and no warning growth. Git rejected a coordination-doc-only
advance, `f5891e9d9`; it was merged normally. No application source changed, and
all 14 UK hashes still match. The previous merged tests/build therefore apply.
The two full successful gate runs and ref-race statuses are retained. A 15-minute
push window was requested under COORDINATION.md after the second ref race; the
normal retry continues while that optional coordination request is pending.


A third normal run, `53842d227`, passed every gate with zero TypeScript errors
and no warning growth, then lost a Vault/navigation ref race. Incoming
`adb1c00cb` was merged normally at `8b851f5cf`. It preserves the same editor Vault
panel/actions, renaming its labels, and reuses existing scoped project discovery.
The Biostatistics rail door carries the dated founder decision required by the
one-product gate. No UK drafting/source/guard owner changed; all 14 hashes match.
The nine changed suites plus shared navigation, navigation reachability and Vault
project-switch checks pass 132/132 across 12 suites. Production client/server
builds pass again. The normal retry continues; no gate bypass or force is used.

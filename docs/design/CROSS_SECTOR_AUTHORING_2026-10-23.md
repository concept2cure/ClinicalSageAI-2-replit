# Complete cross-sector use of the existing intelligent editor

W1 / D2; `concept2cure-v2` only, local/Codespaces only. Root owns Git,
canonical synchronization and qualification. This continues Authoring, Projects,
Vault/catalog/room assembly and AnA; no parallel editor or sector workspace.

## What already exists

- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` and
  `DocumentCanvas.tsx` host the one editor. `surfaces/DocumentAuthoring.tsx`
  starts documents; `surfaces/AuthoringTemplatePicker.tsx` already searches
  loaded metadata in its native picker. Its search was completed upstream;
  do not recreate it or invent another selection UI.
- `server/services/authoring/builtin-authoring-templates.ts` projects existing
  IND outlines, US/CA/EU/JP/GLOBAL pharma/biotech and device/IVD registry entries
  and document components into stable builtins. Existing
  `market-specs/document-template-library.ts` owns exact source outlines.
  `regulatory/templateCatalog.ts` owns offered metadata, not headings, and has
  a legacy CTD fallback that must not supply invented outlines.
- `shared/regulatory/client-type-profiles.ts` presets one workspace, including
  medtech, biotech, pharma, CRO and academic. It is not authority to infer a
  lab/research customer's filing obligations. The registry's existing
  `cross_cutting` entries and specialized SOP/nonclinical sources need reachability
  review before changing the builtin projection.
- `server/services/qms/sopTemplates.ts`, `templates/nonclinical-templates.ts`,
  `authoring/nonclinical-study-report-structure.ts`, protocol/consent services,
  and research-compliance services already provide structures/logic. Presence
  does not yet establish whether each structure is reachable through the one
  editor's start/assembly/review path. No other subsystem is proposed.
- `shared/authoring/recorded-template-source.ts`,
  `authoring/authoring-template-sections.ts`, assembly plan/source services and
  saved-template oversight already retain exact template identity, snapshots,
  limitations and source/tenant/project boundaries. `ana/builtin-template-reference.ts`
  and `ana/document-template-tool.ts` already read the same builtin outlines.
  Extend these contracts where justified; never equate an outline with verified
  evidence, approval, current law or permission to submit.

Searches covered template/library/builtin/assembly names, sectors, lab/research,
SOP/method-validation/nonclinical/protocol/consent paths, routes, services,
shared schemas, current client surfaces and AnA references. Deleted-history
search covered authoring/templates, lab/research names and editor generations;
no retired alternative canonical lab/research editor was identified. Existing
research subsystem surfaces outside the launch catalog are not admitted here.
No deeper AGENTS was found by the root file search.

## Discovery boundary

Before implementation, audit two disjoint read-only areas:
1. Existing lab/research/shared-document heading sources, exact identities,
   limitations and their reachability through the builtin/template contract.
2. Existing project initialization, template selection, source assembly and
   AnA oversight for the named sectors. Identify one bounded, demonstrable
   completion supported by existing structures and contracts.

No worker edits, tests, Git or new UI/schema/dependency/agency/provider path
until root appends a concrete implementation contract and file ownership.
No universal sector/regional completeness claim. Preserve CMC composition's
existing launch boundary and all regulated approvals, original records and
transmission checks. Record meaningful RED and actual qualified GREEN before
normal direct canonical publication, with unchanged compiler/warning baselines.

## Confirmed inventory and approved bounded implementation

All nine `qms/sopTemplates.ts` structures already reach the one authoring store
through `qms/controlled-document-service.ts::createControlledQmsDocument`, with
owned program, creator grants, `authoring_document_id`, QMS row and audit in the
same transaction. Preserve this governed route; no unbound SOP builtin shortcut.
Device-only cross-cutting QMS registry entries are already included through
`isDeviceRegistryEntry`. GLP/GCP/GMP cross-cutting project blueprints currently
reuse device QMS headings: do not admit them by widening the segment predicate.

The four current RI entries have exact shared project-bootstrap outlines:
`RI_STRATEGY` -> `ri_strategy_sections`, `RI_GAP_ANALYSIS` ->
`ri_gap_analysis_sections`, `RI_COMPETITIVE` -> `ri_competitive_sections`,
`RI_HA_MEETING` -> `ri_ha_meeting_sections`. They already reuse the five
`REGULATORY_INTELLIGENCE_SECTIONS` in `shared/regulatory/project-bootstrap.ts`:
Objective & Scope; Regulatory Landscape & Precedent; Analysis & Findings;
Recommendations & Next Steps; References & Source Records. No dedicated,
component or lifecycle override was found. Registry format/standard is `none`,
module absent, product class `any`, region GLOBAL and agency ICH. The ICH field
is recorded registry classification, not proof of an ICH-prescribed template,
a competent authority, an endorsed analysis or a delivery destination.

Complete exactly these four existing outlines in the builtin projection and
same editor/template-source/assembly/saved-review paths. Reuse stable existing
UUID recipe and outline flattening; preserve all prior builtin objects/hashes.
Keep module null, families empty, originals and review limits explicit. Preserve
current manual/preparation eligibility; this work does not widen AI-draft policy.

AnA direct registry lookup already reaches these outlines, but the current
preparation treats GLOBAL cross-cutting clinical documents as medicinal;
builtin UUID reference explicitly rejects them. Reuse ONE exact shared predicate
`isSharedPlanningRegistryEntry(entry)` in `global-document-registry.ts`:
active, one of these four IDs, GLOBAL, cross_cutting/regulatory_intelligence,
format and dossierStandard none. This selects existing entries, not another
heading registry. Unknown, inactive or differently scoped entries stay excluded.
Use that predicate for builtin inclusion, AnA exact scope and preparation routing.

Internal preparation branches before medicinal/device defaults. Reuse existing
topic IDs and bounded three-question batches for document purpose/audience,
source versions, as-of date, analysis/recommendation limits, reviewers and actual
meeting/commitment records as applicable. No mandatory market; an optional
US/CA/EU/JP market narrows analysis only. regionalRoute stays null; evidenceReviewed
false and readiness not_assessed. No pediatric/biologic/PK/PD assumptions, drug
filing obligations, legal-completeness or agency-submission inference. Reject
RI + unrelated component/family scope instead of blending them. Keep all existing
paged byte/character bounds and discussed_topics semantics. Explain this shared
work-product use in the existing AnA authoring guidance, not a new tool/surface.

## Disjoint implementation ownership

- Source worker: `shared/regulatory/global-document-registry.ts` predicate;
  `authoring/builtin-authoring-templates.ts`; existing builtin unit fixture
  update and focused cross-sector projection tests. Own `source/` evidence only.
- Preparation worker: `market-specs/document-preparation.ts`, a narrow internal
  preparation helper if needed, `ana/builtin-template-reference.ts`; focused
  preparation/reference tests and `preparation/` evidence. Consume the shared
  predicate signature above; do not edit source-worker paths.
- Root: actual existing HTTP/PGlite editor fixture and source assembly/saved
  review qualification, human handoff, independent review, global checks,
  canonical synchronization, commits and pushes.

Workers first retain meaningful RED (not missing-export/setup failure), then
GREEN with argv/exits/pins/raw output. No Git, compiler/build/global scan or
production dependency. Root coordinates before any additional path edit. No UI
pattern or schema change is needed. The separate source-selection-to-creation
continuity gap is recorded for later; it is not silently expanded into this slice.

Source-worker ownership also includes the existing
`market-specs/document-template-library.ts::registryDocumentTemplateCoverage`
predicate and a directly related coverage assertion, so AnA discovery lists the
same four existing outlines without creating a competing catalog. Do not change
heading definitions, registry records or project-bootstrap sources. Preparation
worker owns `ana/document-template-tool.ts` only if necessary for scope refusals;
coordinate first. No other production paths are approved by this increment.

Root extends existing `server/routes/__tests__/_authoring-assembly-filing-cases.ts`
registered by the current assembly HTTP fixture: four internal source-manifest
builds, retained parent/original text, FDA/device bound-scope refusals before
source reads or writes, and the existing whole-document saved-review case
parameterized across the four internal outlines. This remains the same harness,
writer, review engine and source manifest rather than a parallel implementation.

Root qualification found an upstream fixture integration gap: the initial
composed run passed 10 assembly/review cases but four template reopen cases
failed with REQUEST_DB_CONTEXT_REQUIRED. This is not a template feature RED.
`_template-editor-fixture.ts` now models the request-owned client via its actual
PGlite query surface, matching existing scoped read fixtures; production must
still refuse missing context. This is a declared single-connection seam, not
native RLS/connection-lifetime qualification. Root owns this fixture correction.

The first broad 38-suite run retained 1052 passes and 41 failures across four
suites. One existing coverage expectation needed the four approved RI entries.
Three existing UI fixture suites needed alignment with incoming current-access
and read identity contracts. Root owns the coverage assertion; preparation
worker owns only authoringTemplateSearch.test.tsx fixture alignment; review
worker now owns only projectFilesAssemblyFlow.test.tsx and
workbenchAssemblyBuild.test.tsx fixture alignment. No production UI or access
policy change is authorized by this correction. Preserve the actual guard and
failure assertions; report a production defect before broadening ownership.
The original broad failure is retained, not relabelled as a feature RED or GREEN.

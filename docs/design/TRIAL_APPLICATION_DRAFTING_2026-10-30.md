# Trial-application drafting in every region, therapeutic area and modality

**Rows:** W3 / D2 (Authoring) and D4 (governed drafting).
**Decision:** P-73, made by the founder on 2026-10-30 (`docs/LAUNCH_DEFINITION_OF_DONE.md`).

Section drafting and its requirements cover each region's trial application, every therapeutic area and every
modality. CMC Module 3 composition stays small-molecule US IND (P-28).

This file is the design. Slices land one at a time, each with its red test and evidence, as the CSR lane does
(`CSR_END_TO_END_2026-10-29.md`). It extends `ANA_IND_COVERAGE_PLAN.md`, priorities 2–5. It adds no second
resolver, registry or drafting path.

## What already exists

Read-only inventory at `54b2929c5`. The pieces mostly exist. They are not connected to one another, and the
editor's drafting path does not use them.

### Resolving the filing (AnA batch drafting)

- **`server/services/ana/draft-submission-context.ts`:**
  - `resolveDraftSubmissionType` (33–53) reads three fields of the open program: `program_type`,
    `primary_agency` and `metadata.submissionTypeId`.
  - `applyRecordedDraftSubmissionContext` (56–69) applies an explicit choice first. With nothing resolved, it
    appends UNASSESSED to each section.
- **`server/services/c2c/program-registry-context.ts`:**
  - A wizard choice resolves (71–75).
  - Without one, only the `(program_type, agency)` pairs in `PROGRAM_TYPE_REGISTRY` (41–55) resolve. Of the trial
    applications, only `cta + EMA → EU_CTA` is in that table.
  - A Health Canada, UK, Japanese, Australian, Chinese or Korean trial program recorded without a wizard choice is
    therefore drafted UNASSESSED, although its registry id exists.
- **`authoring-actions.ts` (1288–1305 and 1661–1676)** reuses the same resolver for harmonisation and
  cross-section checks. It refuses with 422 when nothing is recorded.

### The requirements resolver: `server/services/ana/AnaDocumentDraftingService.ts`

- `resolveDraftingRequirements` (578–612) answers from three places:
  - the ICH/IND record, for Modules 2–5 in every region (`server/services/ind/ctd/requirements-resolver.ts:155`);
  - exact blueprints (`sectionBlueprintCatalog.ts:70–92`);
  - US lifecycle outlines.
- `recordRequirements` (316–345) answers "not indexed" for any Module 1 outside the US.
- What the blueprints hold:
  - **EU CTA:** 28 rows with guidance, covering the CTIS form, Part I, Part II, the IMPD and the cover letter,
    with sources dated 2026-10-07 (`euCtaBlueprint.ts`).
  - **Health Canada CTA and CTA-A:** 20 rows with guidance, including the QOS/QIS row.
  - **Japan CTN:** 10 rows.
  - **Australia CTN and India CT-04:** headings only, with 1 guided row each.
  - **China CTA and Brazil DDCM:** the generic DEFAULT Module 1 only.
  - **UK_CTA, AU_CTA, CH_CTA, KR_IND, BR_DEEC:** the generic CTD headings
    (`shared/regulatory/project-bootstrap.ts:807–812`).

### Other entry points

- **The editor's "Draft from sources"** (`DocumentWorkbench.tsx:4801` → `AuthoringAiDraft.tsx` →
  `authoring.router.ts:3375`) does not use the resolver. It uses `buildSectionDraftPrompt`
  (`authoring-draft-template.ts:97–139`), which takes:
  - a region from `WRITING_REGIONS`: US, CA, EU or JP, defaulting to FDA;
  - the saved template reference;
  - free text the author types.
- **The editor panel** offers MHRA, which has no server mapping.
- **Assembly drafting** (`authoring-assembly-source.ts:116–123`, `assemblyDraftQueue.ts:68–70`) knows four
  regions and stops on any other.
- **`/api/claude/draft`** (`ana-intelligence.ts:105–200`) never applies the recorded program context.

### Regional records not read by drafting

- **`shared/regulatory/regional-module1.ts`:** US, EU MAA and JP J-NDA, with conditions. It models no trial
  application and no other region (33–34, 397–400).
  - Its applicability engine, `requiredModule1` (472–501), returns required, undetermined and not-applicable
    sections from facts. It serves report-os, Global-RI and the region profiles, not drafting.
- **`server/services/regional-ctd-templates.ts`** and **`server/services/region-profiles/*`**
  (`GET /api/region-profiles`) carry metadata only.
- **`server/services/global-ri/clinical-trial-application-requirements.ts` and
  `regional-module1-requirements.ts`** carry label checklists.
- **c2c rule packs:**
  - `cta:ema` (CTR Annex I) and `ind:fda` exist.
  - `ind:mhra` is marketing-shaped (SmPC, ERA, ISS). It is not a UK CTA.
  - There are no HC, TGA, NMPA or MFDS trial packs.

### Therapeutic area, modality, phase

- **Therapeutic-area profiles:** `server/services/ana/therapeutic-area-profiles/` holds 25 of them.
- **Modality vocabulary:** `shared/regulatory/modality.ts` (11 modalities, `normalizeModality`), plus
  `shared/regulatory/product-modality.ts` (`modalityOf`).
- **How drafting receives them:** only as labels the caller declares to `batch_draft_sections`
  (`legacy-import-tool-defs.ts:672–707`). These are rendered as "CALLER-DECLARED, UNVERIFIED ADVISORY"
  (`AnaDocumentDraftingService.ts:936–958`).
- **Program record:** `regulatory_programs` has no therapeutic-area, modality or clinical-phase column. Its
  `phase` is the workflow phase (`project-setup-projection.ts:146–152`).
- **Where these facts are recorded:**
  - `project_charters.therapeutic_area` and `development_stage` exist
    (`migrations/20260917_project_charters_declared_columns.sql:63–64`).
  - `regulatory_programs.product_type` is NOT NULL (P-21).

### Applicability

Nothing decides required, conditional or not-applicable per section from phase, modality or population. What
exists:

- `requiresSectionApplicabilityAssessment` (`sectionBlueprintCatalog.ts:132–137`) only flags scaffolds that
  contain conditional branches.
- `requiredFor` is a necessity tag (`server/services/ind/ctd/types.ts:34,61`).

## Capability model

| Region / application | Resolves from the program record | Module 1 content | Modules 2–5 | Reachable in the editor |
|---|---|---|---|---|
| US IND | yes | US record, 33 headings + guidance | ICH/IND record | yes |
| EU CTA (CTIS) | yes (`cta + EMA`) | blueprint, 28 guided rows | ICH record (the IMPD is not CTD M3) | region "EU" only, without the resolver |
| Health Canada CTA | wizard choice only | blueprint, 20 guided rows | ICH record | "CA" without the resolver |
| Japan CTN | wizard choice only | blueprint, 10 rows | ICH record | "JP" without the resolver |
| UK MHRA CTA | wizard choice only | none (generic CTD) | ICH record | no |
| Australia CTN / CTA | wizard choice only | headings (CTN); none (CTA) | ICH record | no |
| China (NMPA) | wizard choice only | generic DEFAULT M1 | ICH record | no |
| Korea, Switzerland, Brazil, India | wizard choice only | none, or headings | ICH record | no |

The therapeutic-area and modality columns are uniform across the table: declared labels only, and only in AnA
batch drafting.

## Decisions (product manager, 2026-10-30, under P-73)

1. **One resolver.** The editor's "Draft from sources", assembly drafting and `/api/claude/draft` converge onto
   `resolveDraftingRequirements` and the recorded program context. They do not get their own region maps.
2. **Recorded, then declared.** The order of precedence is:
   1. a fact recorded on the project (charter therapeutic area and development stage, product type, indication);
   2. a declared label, which stays advisory;
   3. neither, which stays a visible gap.
   A recorded fact is still not qualified evidence.
3. **Regional content enters only with dated, cited sources**, in the blueprint form `euCtaBlueprint.ts` already
   uses. A region without that stays "not indexed" and says so. Nothing is invented.
4. **Applicability generalises the existing engine** (`requiredModule1` and its condition facts) to sections.
   An unknown fact gives "undetermined", never "not applicable".

## Founder decision still open

None for drafting. Widening CMC composition is a separate, later decision (P-73, second bullet).

## Slices (in order)

1. **Resolve every trial program's filing from its record (S).** Done 2026-10-30
   (`docs/evidence/D4/2026-10-30-p73-slice1-trial-filing-resolution/`). Add the trial-application pairs to
   `PROGRAM_TYPE_REGISTRY`: Health Canada, MHRA, PMDA, NMPA, MFDS and Swissmedic. Where the record cannot decide
   between applications (TGA CTN or CTA, Brazil DDCM or DEEC, India's CT forms), resolve to nothing and say why,
   rather than guess.
2. **The editor's "Draft from sources" uses the resolver and the recorded program context (M).** Done
   2026-10-30 (`docs/evidence/D4/2026-10-30-p73-slice2-editor-recorded-filing/`). The prompt carries the
   application on record and its requirements. Precedence settled during the slice:
   - a region recorded on the section's template governs;
   - otherwise the person's chosen region names the writing region, and a mismatch with the application on
     record is stated, not silently resolved.
   - **2b (S, delivered in the audit increment below):** the panel opens on the recorded application's agency, and offers only what the server
     maps.
   - **2c (S, delivered in the audit increment below):** assembly drafting and `/api/claude/draft` move onto the same context.
3. **Project the recorded product facts into drafting (M).** These are the charter's therapeutic area and
   development stage, the program's product type → modality (`modalityOf`), and the indication. Each is labelled
   recorded, and a declared label still cannot override a recorded fact silently.
4. **Region by region, cited Module 1 content for each trial application (L, one sub-slice per region).** The
   order is UK, Australia CTA, China, Korea, Switzerland, Brazil and India, plus EU and JP trial kinds in
   `regional-module1.ts`. Converge the `ind:mhra` rule pack onto a UK CTA outline.
5. **Section applicability by phase, modality and population (L).** Generalise `requiredModule1`. An early-phase
   IND is not asked for a marketing dossier.
6. **Therapeutic-area and modality overlays reach the editor path, with currency (M).** These are dated
   references, and a stale reference is shown unresolved (coverage-plan priorities 4–5).
7. **Qualification scenarios across region × area × modality (L).** Each carries section-level scoring, source
   receipts and a human regulatory review, before any coverage claim (coverage-plan priority 6).
8. **Retire the parallels (S).** These are the Global-RI CTA and Module 1 checklists, `regional-ctd-templates.ts`
   where it duplicates the blueprints, and the editor's own region map. Each is migrated, then deleted in the
   same change.

## Risks

- **Regulatory content written from memory is a defect.** Slice 4 depends on sources pinned by date. This sandbox
  reaches some agency sites and not others; where a source cannot be read, the region stays "not indexed".
- **A wrong application resolved silently is worse than UNASSESSED.** Slice 1 refuses ambiguous pairs.
- **The editor route is shared by every document type.** Slice 2 must not change US IND drafting output.

## Audit implementation increment (2026-10-30)

The founder explicitly requested development after the IND expertise audit.
The implementation extends slices 2b/2c/3/6 using the existing owners above:
recorded product context with current project admission, one advisory renderer,
clinical section relevance and reference-currency limits, plus exact section
region defaults in the existing editor. Charter ambiguity remains undetermined;
recorded context is not scientific qualification. The detailed software contract,
red/green evidence and residual content/SME requirements are under
`docs/evidence/D4/2026-10-30-ind-development/`. Other regional/content/applicability
slices remain separately measurable, not blanket-complete.

Delivered software now projects the admitted program and sole charter into the
editor/shared drafting service, retains per-field origins and conflicts, and
rechecks access, product and filing facts at dispatch/response and before editor
parking. Recorded-context streams release only after those checks. The existing
generator JSON retains the context audit; this does not add product-fact
revalidation at acceptance. Existing Vault/assembly acceptance reservations stay
authoritative.

The section read projects its effective saved template's agency without exposing
parent provenance. Editor, assembly queue and legacy HTTP/tool doors use the same
context owners. All 12 canonical writing labels are available; GLOBAL/unknown
scope has no FDA default. Writing labels do not expand the four concrete regional
values of the saved-template source schema or add regional requirements.

Automatic editor evidence uses exact bounded windows rather than a 600-character
prefix, with offsets, hashes and omitted-character counts. Quotation checks use
individual shown spans, preserving omissions; model paraphrases remain assertions.
These changes extend the existing source selector and attribution primitive.
Clinical guidance selection/currency is improved, but regional Module 1 source
content, indexed disease/phase/population conditions, nonclinical source binding
and independent scientific qualification remain open work under slices 4–7.

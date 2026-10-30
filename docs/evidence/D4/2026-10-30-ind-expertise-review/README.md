# IND / regional trial-application expertise review

User request, 2026-10-30: catch up on intervening changes and identify ways to
improve IND report generation and expertise across therapeutic areas and major
regions. Reviewed source `438287ed1`, synchronized from `ef8d6e8b`. The catch-up
index records all 4,870 changed paths and non-merge commits; the findings below
are a focused semantic audit of authoring, evidence, knowledge and governance,
not a claim to have inspected every changed line or run every historical test.

## What already exists

- P-73 and `docs/design/TRIAL_APPLICATION_DRAFTING_2026-10-30.md` already authorize
  global trial-application drafting, every therapeutic area/modality, one
  requirements resolver and recorded-context precedence. Slices 1/2 are delivered;
  the panel, assembly, product-fact, regional-content and applicability work is
  actively owned in the existing work-order board. This review adds no rival lane.
- `program-registry-context.ts`, `draft-submission-context.ts`,
  `AnaDocumentDraftingService.resolveDraftingRequirements`, the CTD record,
  `sectionBlueprintCatalog.ts` and regional blueprints own application identity
  and requirements. `authoring-draft-template.ts` now reaches them from the editor.
- `therapeutic-area-profiles/` owns 25 static profiles, a registry, a renderer,
  section filters and retrieval boosts; existing nested drafting carries declared
  area/modality as unverified advisory context. The product's vocabulary and a
  passing traversal test do not establish scientific competence in each area.
- The existing charter/program own recorded TA, development stage, product type
  and indication. Existing modality vocabularies are independent of disease area.
- The existing clinical/CSR lane owns retained sources, deterministic table
  builders, clinical/numeric claim receipts, narratives, independent scientific
  review and signed-release gates. Existing nonclinical loaders and composers
  also exist; a canonical project/source binding remains unresolved.
- `regulatory-currency/currency-registry.ts`, `guidance-ingestion-service.ts`
  and `intelligence/guidance-impact-scanner.ts` already identify some dated
  regulatory facts and affected sections. FDA guidance search explicitly has no
  connected index. Extend these owners instead of creating another registry.
- The current editor, project Plan/Author/Review/Submit/Respond and central
  services are the delivery homes. CMC composition remains small-molecule US
  IND under P-28/P-73; global drafting is not a composition admission.

## Catch-up: material changes since the checkpoint

| Area | Delivered work found in the newer tree | Meaning for IND generation |
| --- | --- | --- |
| Regional trial identity | P-73 slice 1 resolves known FDA/EMA/HC/MHRA/PMDA/NMPA/MFDS/Swissmedic pairs; ambiguous TGA/ANVISA/CDSCO choices stay unresolved | Stops silently assigning the wrong receiving application |
| Editor requirements | P-73 slice 2 carries the recorded application and section requirements, saved-template jurisdiction precedence and mismatch/unassessed notes | Regional identity now reaches the real editor; other callers and panel defaults remain open |
| Clinical/CSR sources | Completed CSR builds, retained source evidence, deterministic table/narrative work and source-bound scientific claim review | Reusable grounding infrastructure for IND clinical overviews and summaries |
| Review/release | RR review routes; approval/signature/settled-document checks; independent reviewer standing; assembled-CSR release refusals | A generated document is distinct from reviewed, approved and releasable content |
| Vault and CMC | Upload progress, saved views, verified folder export/manifest and legal-hold/version controls; one project CMC register | Better source custody and a canonical manufacturing/quality data home |
| Core workflow placement | Agency Meetings moved into Communication; its old store is read-only; new eTMF/nonclinical/IB and other admissions have their own order | Continue project-aligned functions and shared services; do not create another IND app |

The commit index is historical evidence, not a sum of test results or a statement
that each new function has live-model, clinical, regional or agency qualification.

## Highest-value improvements

| Priority | Concrete gap | Reuse and acceptance |
| --- | --- | --- |
| 1 | Recorded product context does not consistently reach all drafting entries | Complete P-73 2b/2c/3: one application/requirements read in editor, assembly and legacy draft; carry charter TA/stage, product type/modality and indication with provenance. Caller conflict is visible; missing facts remain undetermined. Never infer modality from disease area. |
| 1 | Static section flags are not clinical applicability | Extend the existing applicability owner for phase, modality, population, route/exposure and exact application. Early-phase IND is not a marketing-completeness exercise. Unknown facts cannot yield not-applicable or a waiver. |
| 1 | TA guidance can be clinically irrelevant or omitted | In `therapeutic-area-profiles/index.ts`, endpoint/statistical arrays currently reach E3 9/11 and CTD 2.7.3/4, not clinical 2.5/M5 leaves. Structural filters, unused trigger-keyword metadata, unconditional lists and first-N truncation are not product/stage applicability. Extend the current renderer; retain relevant safety/endpoint guidance and exclude unrelated material. |
| 1 | Reference titles are treated as expertise without enough scope/time metadata | Connect profile rules and blueprint requirements to existing currency/source owners: original URL/document version, authority, draft/final/withdrawn status, publication/adoption/effective dates, supersession, last verification and product/population scope. Unverified/stale references stay unresolved. |
| 1 | A valid excerpt or exact copied number may be scientifically insufficient | Reuse source/claim/review receipts. The editor's automatic evidence takes only 600 characters per returned chunk; nested drafting selects one contiguous 12k span/document, 48k total. Retrieve bounded multiple spans/tables for methods, populations, denominators, results and safety; disclose omitted required evidence. Extend CSR scientific-review binding to IND clinical claims without calling display matching estimand/clinical validation. |
| 1 | Region resolution exceeds indexed regional content | Deliver cited application-specific blueprints region by region. Keep ICH core reusable while regional administration, IMPD, language, forms and portal/package conventions remain separate. Missing content says not indexed instead of being generated from memory. |
| 2 | Nonclinical source binding is missing despite existing composers | AnA M2.4/2.6 correctly refuses conversational NOAELs/findings and returns needs-data. Reuse the existing authorized project-to-CTD study linkage and versioned report provenance once the canonical binding is settled. Reconcile species, GLP, units/exposure and findings across M2/M4 and starting-dose justification. |
| 2 | No all-area/all-region scientific qualification follows from structural tests | Use the existing coverage-plan scenario contract, with section-level source fidelity, applicability, regional placement, currency, omission/contradiction handling and independent regulatory/scientific review. Report mechanical wiring, model quality and human acceptance separately. |

Key code references: `server/routes/authoring.router.ts` (recorded context and
600-character automatic evidence); `server/services/ana/draft-source-window.ts`;
`therapeutic-area-profiles/index.ts`/`types.ts`;
`server/services/ana/module2-csr-inputs.ts` and
`authoring/csr-scientific-review-core.ts`/`csr-scientific-review.ts`;
`server/services/ana/module2-nonclinical-inputs.ts` and the existing
`preclinical/nonclinical-program-loader.ts`/project wrapper.

## Regional capability observed in code

Counts describe indexed records, not evaluated expertise or legal completeness.

| Region/application | Current identity/content | Remaining boundary |
| --- | --- | --- |
| US IND | Recorded resolution; deep IND/CTD guidance and lifecycle outlines | Phase/product/population applicability and scientific qualification remain separate |
| EU/EEA CTA | Recorded resolution; 28 guided CTIS/Part I/II rows and IMPD alternatives | Blueprint group numbers are not CTD modules; IMPD-Q is not US Module 3 composition; national/product/language conditions need assessment |
| Canada CTA | Recorded resolution; 20 guided initial CTA rows and separate amendment outline | Quality-focused CTD material is not a full marketing dossier; current source manifest and amendment applicability must reach generation |
| Japan CTN | Recorded resolution; ten guided authoring groups | Company-sponsored drug scope; category, timing, language, modality and accepted schema still need verification |
| UK CTA | Recorded identity resolves | No exact CTA blueprint; generic CTD and marketing-shaped ind:mhra rules are not current UK trial expertise |
| China CTA | Recorded identity resolves | DEFAULT Module 1/common CTD guidance is not indexed NMPA trial content |
| Australia CTN/CTA | Explicit application needed; CTN has eight headings/one guided row; CTA generic | Keep CTN versus CTA responsibilities distinct and source them; ambiguity correctly remains unresolved |
| Korea/Switzerland | Recorded identity resolves | Dedicated cited trial requirements absent |
| Brazil | Explicit DDCM/DEEC choice needed | DDCM DEFAULT CTD and generic DEEC are not current regional trial content |
| India | Explicit form choice needed; CT-04 eleven headings/one guided row | Exact current form requirements and applicability remain unqualified |

## Targeted qualification scenarios

Start with risk-based cross-dimension cases, then expand through all existing
area IDs and current supported applications. Do not equate a Cartesian traversal
with scientific competence.

- US first-in-human oncology/small molecule: separate starting-dose justification
  from later dose optimization; no invented studies or marketing completeness.
- US hematology/cellular or gene therapy and cancer vaccine: disease and modality
  remain independent; unrelated oncology dose guidance is not imposed.
- EU pediatric rare-disease/biologic or gene therapy: exact CTA/IMPD structure,
  population-specific uncertainty and no FDA-form substitution.
- Canada Phase II metabolic/biologic: CTA-specific administrative/quality context,
  source-linked clinical claims, explicit amendment scope.
- Japan infectious-disease/vaccine: CTN-scoped references and language limitations;
  unread current guidance stays unresolved, never replaced by J-NDA guidance.
- UK neurologic/psychiatric first-in-human: current post-transition authority
  must be pinned before region-specific requirements are claimed.
- China CTA with a missing Module 1 source: correct identity but explicit content
  gap, rather than a polished generic document represented as NMPA-complete.
- Australia without CTN/CTA selection: ambiguity blocks a receiving-application
  claim, while shared evidence can remain available for manual preparation.
- Every case: missing phase/modality, conflicting studies, wrong units/arm/cutoff,
  distant denominator/methods, source withdrawal/version change and edited target
  must invalidate unsupported claims or retain needs-evidence state.

## Bounded expertise correction delivered

The existing oncology profile instructed that randomized dose-finding with at
least two doses was universally expected before pivotal study initiation. Its
reference rationale repeated that assertion. The FDA final guidance landing page
(August 2024) explicitly excludes first-in-human starting-dose selection and
several product categories, and does not specifically address pediatric
development. The existing rule/rationale now require phase/product/population
assessment, preserve dose-optimization review and state the scope exclusions.
No dosing recommendation, new study design or clinical verdict is generated.

Three behavior tests failed against the original profile. The corrected profile
and existing 25-area structural coverage suite pass 9/9. A final affected
prompt/route plus profile group passes 51/51 across five suites (overlapping A3
checks; not a distinct-case sum). The coverage test's header now states that
structural population is not scientific/currency/SME qualification. The separate
A3 evidence records the preserved in-flight core-owner work and its 450-check
regression on the new tree.

A later documentation-only synchronization (`47ce1d3d9`) adds the separate
CSR expertise review and bounded contracts. It identifies additional work on
empty evidence packs, qualitative claims, writing rules and current-source
rechecks. Those are pending contracts in that lane, not already qualified
capabilities; the IND review reuses their outcomes rather than duplicating them.
The scientific-writing and evidence-sufficiency recommendations here should
consume that work through the existing shared owners.

## Official-source observations and limitations

`official-source-observations.json` records retrieval URLs, redirects, sizes,
hashes and limitations. The web-search connector returned an empty error twice;
reads through the configured HTTPS path retrieved the official pages below.

- [FDA IND overview](https://www.fda.gov/drugs/types-applications/investigational-new-drug-application-ind): supports distinguishing nonclinical safety, manufacturing/quality and clinical/investigator information in an initial IND.
- [EMA Clinical Trials Regulation](https://www.ema.europa.eu/en/human-regulatory-overview/research-development/clinical-trials-human-medicines/clinical-trials-regulation): supports CTIS and regional trial application handling, not renaming a US IND.
- [Health Canada CTA guidance](https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/guidance-documents/clinical-trials/clinical-trial-sponsors-applications.html): retrieved source; specific revision, effective-date and interim-policy applicability still need assessment.
- [FDA oncology dosage final guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/optimizing-dosage-human-prescription-drugs-and-biological-products-treatment-oncologic-diseases): August 2024 final identity and express scope limits underpin the narrow correction.
- [Retrieved MHRA legacy page](https://www.gov.uk/guidance/clinical-trials-for-medicines-apply-for-authorisation-in-the-uk) explicitly applies before 28 April 2026. It is not accepted as current UK authoring authority. Follow the agency's current collection and pin applicable documents/effective dates.
- The generic PMDA URL returned 404; actual CTN blueprint PDF references were not tested and are not thereby shown broken. The ICH page returned a JavaScript shell; no guideline text was verified by that response.

No live AnA/model assessment, independent clinical/regulatory SME review, formal
OQ, global filing qualification or agency transmission was performed. The next
implementation belongs in P-73's already-owned slices and existing core screens.


## Publication

Source commits `84520c3f1` (A3) and `e5fc8fc20` (IND review/oncology correction)
were accepted on `origin/concept2cure-v2` in merge
`fc1ece8d9` at 16:24 UTC on 2026-10-30. All normal push gates passed,
including full TypeScript with zero errors and no added lint warnings.
`publication-gates.log.gz` and `publication.json` retain the receipt. The two
later incoming changes were documentation only; qualified source hashes match.
No hook or baseline was bypassed. This is source publication and engineering
verification, not deployment or formal/model/scientific qualification.

# Reach exact existing US lifecycle working documents

## What already exists

`server/services/ind/ctd/lifecycle-document-types.ts` owns the detailed meeting, amendment, clinical-hold, integrated-summary and CBE-variant records. `market-specs/lifecycle-record-outlines.ts` already supplies generic filing outlines, including a combined CBE outline. `market-specs/document-template-library.ts`, `regulatory/templateCatalog.ts` and `authoring/builtin-authoring-templates.ts` own the existing editor's component starts; the twelve exact subtype records below currently have no retained component template identity.

Complete those owners by deriving twelve component outlines from the records, without duplicating whole IND/NDA/BLA, DSUR, annual-report or PAS equivalents. Original generic IDs remain. Scope: detailed pre-IND/EOP2/pre-NDA/pre-BLA packages, four distinct IND amendment/clinical-hold records, separate CBE-30/CBE-0 and ISS/ISE. Matching lifecycle/meeting/amendment/clinical-hold/integrated-summary deletion history was searched; retired editor and signing routes do not provide an alternate current exact component projector.

## Interface

New thin record projection exports templates, exact catalogue metadata and a US-component predicate. Shared library/catalog/builtin integration belongs to the metadata worker. Subtypes without registry identities use an explicit lifecycle-component source tag, never an invented filing registry ID. US/FDA classification does not certify legal applicability or current regulator-text verification.

The new component bodies remain empty. AnA prepares source-supported working narrative, with original form/data/table parts and explicitly indexed mixed original-record parts manual. Source figures, datasets, signatures, actual FDA decisions and controlled original appendices are not generated or replaced. Existing source guidance and limitations remain authoritative.

## Qualification status

Actual exact editor lookup failures are captured before production edits. Own freeze covers the new test and unchanged lifecycle source; shared files are independently owned and captured as source snapshots because clinical metadata is being completed concurrently. No lifecycle import is wired until the missing-lookup RED has finished. Fixtures do not establish live model performance, human acceptance or filing readiness.

## Implemented exact record projection

The twelve starts derive76parts directly from the existing records, keeping source codes/titles, required flags, full authoring guidance, citations, source content elements and former titles. Original form/data/table source types plus four explicitly indexed mixed-original parts remain manual: technical-data attachments, revised-document originals and each CBE variant's labeling copies. Total17manual/59narrative working parts. Narrative eligibility permits source-supported writing, not scientific computation or replacement of originals.

Exact IDs are `us_lifecycle_` plus: pre_ind_meeting, end_of_phase_2_meeting, pre_nda_meeting, pre_bla_meeting, ind_protocol_amendment, ind_information_amendment, ind_cmc_amendment, ind_response_to_clinical_hold, cbe_30, cbe_0, iss, ise. No duplicate whole IND/NDA/BLA, DSUR, annual-report or PAS starts are introduced. Each projects `lifecycle-component:LIFECYCLE_DOCUMENT_TYPES:<record>` and US/FDA component context with registryId:null. The new source kind avoids fabricating a registry identity for unregistered subtypes. Shared library/catalog/builtin/document-preparation integration belongs to the metadata workstream.

Meeting parts explicitly retain their PDUFA-program scope; they do not establish BsUFA procedures. CBE records derive NDA/ANDA314.70parts and explicitly do not independently model licensed-biologic601.12obligations. All basis confidence remains recall/advisory; no current regulator-text verification is invented.

## Retained actual verification

- `red.json`:13failed, no own-source drift. Twelve assertions directly expose absent exact builtin lookups; the thirteenth dependent distinctness assertion cannot inspect the absent templates. This is existing runtime absence, not a missing-module/setup import failure. No lifecycle module or shared lifecycle import existed during this run. Original shared source snapshots are retained; concurrent clinical ownership is disclosed above.
- `pure.json`:14pure source/policy cases passed before additional procedure-scope assertions.
- `lint.json`:strict ESLint passes with0errors/0warnings for all3owned source/test files.
- `scope.json`:15pure cases passed after explicit PDUFA/BsUFA and NDA/BLA-CBE scope limitations. `scope-lint.json`:0errors/0warnings, no drift.
- `integrated.json`:296/296 across6suites, no drift in all8pinned owned/shared inputs. Includes actual exact builtin lookup/distinctness, pure source/manual policies and existing library/builtin/full-outline/regional-selection regressions. Counts overlap other workstream qualification and must not be summed as unique tests.
- `integrated-inputs.json` and `integrated-*.gz` retain the full owned/shared source snapshot for that successful run. `final-owned-inputs.json` and final snapshots identify the final3owned files. No later owned code changes are planned.

These are catalogue/projection and policy checks. Root's separate actual HTTP/PGlite fixture qualifies persistence and current source/target permissions. No live provider, human editor acceptance, regulator applicability, submission validation, signature or transmission is established by these passes. Root owns global gates, compiler, final integration and canonical publication. This worker ran no Git mutation or global check.

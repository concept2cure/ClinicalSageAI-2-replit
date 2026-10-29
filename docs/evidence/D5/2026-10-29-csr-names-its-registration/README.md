# D5: a CSR names the study's ClinicalTrials.gov registration (2026-10-29)

Session `…01E8btkB`. CSR path review for LMN-201 (NCT05330182), stage 1 row
"Study design store: no NCT number field"
(`docs/design/CSR_PATH_REVIEW_2026-10-29.md`).

## What already exists

Searched `nct`, `nctId`, `nct_number`, `nctNumber`, `registry`,
`trial_registry_identifier` and `NCT\d{8}` across `server/`, `shared/`,
`client/src/`, `migrations/` and `db/migrations/`. Ran `git log --all
--diff-filter=D` for `*nct*` and `*registry-number*`.

| Exists | Path | What it does | Why it is not the answer |
|---|---|---|---|
| The CSR's study facts | `shared/csr-source-input.ts` `CsrStudyInfoSchema` (strict) | Title, protocol, phase, design, endpoints, from the approved Vault source | It refused an `nctNumber` outright |
| The build route | `server/routes/csr-builder-routes.ts` `studyInfoSchema` (not strict) | Validates the build and draft requests | It stripped an `nctNumber` without a word |
| The data room's catalog | `clinical-regulatory-evidence/catalog-facts.ts` (`\bNCT\d{8}\b`), `data-room-processing.ts` | Records a registry id found in a sponsor document's text, shown in the source line | It reaches no CSR: the CSR's facts come from its own approved source |
| Corpus and precedent NCTs | `csr_reports.nct_id`, `csr_studies.nct_id`, `cre_clinical_studies.nct_id` | Public reference studies | Not the sponsor's own study |
| Device register | `clinical_studies.nct_id` (`mdx-clinical-studies.ts`) | Device programs | Not a drug study; the CSR does not read it |
| Form FDA 3674 | `FDAFormsRegistry.ts` `nct_number`, `ind-form-data-builders.ts` `meta.nctNumber` | The box exists | Nothing fills it (not in this change) |
| The study design store | `cdisc_prm_studies`, `usdm-projection.ts` | — | No registry identifier ("none is invented") |

No CSR title page, synopsis or Module 2 table printed a registration.
`server/services/csr/index.ts` (`CSRMetadata.nctId`), deleted in `b86433174`,
was a corpus-extraction type with no caller.

## What changed

- **The source contract** (`CsrStudyInfoSchema`) takes `nctNumber`, only as
  NCT plus eight digits (`NCT_NUMBER_RE`, `nctNumberSchema`). `nctNumberOf`
  reads it from a stored study record, and returns none for a malformed one.
- **The build and draft routes** take it under the same rule, and refuse a
  malformed one with a 400.
- **Drafting** (`csr-builder.ts`):
  - the prompt states it;
  - the §1 and §2 templates print "ClinicalTrials.gov Identifier: …".
- **The assembled body's title page** (`csr-assembly-body.ts`) prints it
  under the study line. It comes from the job's study snapshot, through
  `materializeCsrAssemblySource`, `assembleCsrJob` and `renderBody`.
- **Module 2.7's Clinical Study Index** (`m2-summary-builders.ts`) has a
  ClinicalTrials.gov column. It shows the number, or "Not stated in the
  source", never a blank. `loadCsrInputsForProject` hands it over.
- **The Submission Center's CSR source panel** (`CsrSourceInputControls.tsx`)
  shows the number beside the protocol, or "no ClinicalTrials.gov number in
  the source".

No number in, none out: nothing is guessed or looked up.

## Evidence: seen failing first

`red.txt`: each wiring point was removed in turn, and the test that holds it
failed.

| Removed | Fails |
|---|---|
| The contract field | The contract case |
| The route field (stripped, as before) | The route case |
| The prompt line | The prompt case |
| The template line | The template case and the route case |
| The title-page line | The title-page case (`pdfjs` reads page 1 of the assembled body) |
| The index column | The three index cases |
| The loader field | The loader case (`study-pivotal-declaration.pglite`) |
| The assembly-source field | The assembly-source case (`workflow-source-import.pglite`) |
| The panel text | The panel case (`csrSourceInputControls`) |

Green (`green.txt`):
- `csr-nct-number.test.ts` (new, 10 cases) with the two extended server
  suites: 53/53;
- `csrSourceInputControls` with `csrBuildProgress`: 20/20.

Wide run: `wide.txt`.

## Not done

- Form FDA 3674's `nct_number` box is still not filled. It is a project-level
  form, and the study numbers it needs can now be read from the project's CSR
  sources.
- A registration in another registry (EU CT number, ISRCTN) is not taken.
- When the data room's catalog and the CSR source name different NCT numbers
  for one study, nothing compares them.

## Disclosed (files another lane changed in the last 24 hours)

The CSR end-to-end lane (`…01471vSKg1`) changed these today. This change adds
one optional field and its line to each:
- `shared/csr-source-input.ts` (`735ac21cd`)
- `server/services/csr-builder.ts` (`b265d6fc0`, `0a2ee31fe`, `b86433174`)
- `server/routes/csr-builder-routes.ts` (`b86433174`, `8cf9bd399`)
- `csr-assembly-body.ts`, `csr-assembly.ts`, `csr-assembly-source.ts`
  (`b265d6fc0`, `dc5c1c59b`)
- `server/services/authoring/workflow-source-import.ts` (`0a2ee31fe`,
  `dc5c1c59b`, `8cf9bd399`)
- `client/.../CsrSourceInputControls.tsx` (`7b209818a`)
- the test `server/services/authoring/__tests__/workflow-source-import.pglite.test.ts`
  (one case added)

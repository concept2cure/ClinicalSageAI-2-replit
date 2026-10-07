# W2 / D4 — processed project records into regulatory drafts

The client clarified the intended workflow: incoming documents/data are processed
into a project, Data Room and catalog, then used for regulatory documentation.
This change connects existing processed Vault records to `batch_draft_sections`;
it does not introduce a second ingestion or drafting engine.

## Contract

- Anna discovers existing records with the existing project list/search tools and
  supplies `source_document_ids` for each section, rather than retyping study data.
- The backend resolves the open project and organization and checks document
  ownership before loading extracted text. Model-supplied source contexts are ignored.
- Each source must have a successful recorded extraction, current eligible data,
  a SHA-256 identity, and the same version across metadata/content reads.
- Text is bounded to 12,000 characters per source and 48,000 per section, with
  at most eight selected IDs. Exhausting the budget before serving all selected
  sources fails the section instead of silently omitting evidence.
- Prompt and response receipts identify source IDs, versions and character spans.
  Raw source text is sent to the existing gateway, not repeated in draft receipts.
  Gateway metadata retains source identities/spans for the generation audit.
- Missing, wrong-project, failed-extraction, withdrawn-data or superseded sources
  prevent generation for that section. Other successful sections remain intact.
- With no selected sources, status is explicitly `unassessed`; this permits a
  planning draft, not an evidence-review claim. Loaded sources are also **not
  scientifically qualified**. OCR exact figures require page verification;
  retained text whose original was withdrawn retains that disclosure.

## Boundaries

This is the processed-source-to-generation connection, not universal filing
qualification. No extraction/catalog write, approval, signature, filing, or
full-read receipt is minted. No source summary is mistaken for an approved
study finding. The existing governed authoring save path remains required.
Source receipts are generation receipts; this change does not add durable
authoring evidence bindings or automatically ingest unfiled chat uploads.
Anna still needs to select the relevant discovered sources, inspect beyond the
bounded excerpt when needed, reconcile conflicts, and ask only about material
gaps unanswered by project records. Raw datasets still require the existing
qualified processing/analysis path rather than narrative model computation.

## Verification

Targeted regression results and push verification are recorded with this tranche.
Local verification: 93 tests passed in seven files, including PGlite-backed
governed authoring and source lineage; the four directly affected test files
were rerun after validation refactoring (52 passed). Server build, canvas-path
check, security-pattern scan (zero violations) and whitespace checks passed.
The warning gate caught a new complexity warning; validation/audit helpers
were extracted rather than weakening the gate or changing its baseline.
The prior source commit `4a6e037200eb46e29096597e3845890c3555798c` has now passed
CI Lint, Blank DB Provisioning + Deploy Migration, Production Boot RLS,
Production Image Boot, Anna Readiness, Security Contracts and AIOS jobs in run
37566216569. This is not a statement that every job or country filing is qualified.

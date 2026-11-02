# FBT-201 CSR ingestion adapter — existing contract compatibility

**No live import or regulatory source qualification has been completed.**

The original Faux Biotech package consists of synthetic CSV, JSON and Markdown files. Claude's November 2 pilot used approved ADaM XPT datasets and an approved manifest, which are a **different** input route from the existing structured `concept2cure.csr-source.v1` envelope.

## Prepared in the current conversation

A derived 160-subject **synthetic** input file has been generated:

`FBT201_CSR_SOURCE_EXISTING_CONTRACT_SYNTHETIC.json`

It follows the field shapes named by the existing `shared/csr-source-input.ts` `CsrSourceEnvelopeSchema`: `format`, `dataCutDate`, `studyInfo`, `participants`, `completeDomains`, `studyData` (treatment arms, disposition, demographics, efficacy, adverse events). It contains **160 participant rows, 160 disposition rows, 160 demographic rows, two synthetic efficacy summary rows, 79 AE rows**.

Mapping from original source ZIP:
- Participant ID, arm, randomized/ITT/safety and completion from `01_ADSL_synthetic.csv`.
- Age and sex from original ADSL, with sex normalized to M/F.
- AE term, severity, seriousness, relationship and discontinuation from `03_ADAE_synthetic.csv`. Relationship `Not assessed` becomes `unknown`; every AE's SOC reads **Not coded in synthetic source**, not an invented MedDRA classification.
- Efficacy response counts and percentages from `09_TLF_SUMMARY.json`; risk difference, confidence interval and p-value remain in the original summary artifact for separate reconciliation.
- No fabricated dosing exposure, laboratory grades, patient vital signs, trial registration, signature, or reviewer approval.

The generated source JSON was checked locally for 160 unique IDs, expected per-arm allocation, 76/77 treatment completion, 42/37 TEAEs, 3/2 SAEs and 2/1 withdrawals. **It has not been parsed by the live Zod schema or uploaded and approved in the live application.** This record does not assert that the application will accept the source.

## Integration instructions using existing routes ONLY

1. In the actual authorized demo tenant, create the Faux Biotech organization, workspace and FBT-201 project using the existing UI.
2. Upload original source files to Vault and verify their returned `documentId` and SHA-256. If using the structured source format, upload the generated synthetic source JSON as a separate versioned source artifact; do not mislabel it as CDISC ADaM XPT.
3. Use the already-existing CSR study-data source picker and source preview. It must recognize the correct format and the source must complete the application's own scientific validation and governed approval; if not, record the explicit refusal.
4. Freeze verified study tables in the correct CSR editor document. Build using an approved provider model; **demo-mode text must not be treated as a real draft**.
5. Review each heading's text and source claims; missing data placeholders remain blocking, not drafted. Import approved sections into Authoring, review/safely sign and file only if the actual ceremonies succeed.

## Required controlled test and remaining limitations

- Run actual `CsrSourceEnvelopeSchema.safeParse` on the generated JSON in a checked-out application.
- Inspect all returned validation errors and **fix the synthetic data file only**; do not relax the product schema.
- Run the actual browser and API ingestion journey on the demo tenant. Capture stored source ID, digest, frozen table receipt, build ID, section review, editor import, reviewers, approvals and screenshots.
- Do not claim the source or demo is production-ready without those receipts.

**Status: file prepared outside GitHub, mapping documented here; hosted tenancy, import, build and final approval remain NOT EXECUTED.**

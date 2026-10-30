# CSR evidence-to-narrative reconciliation increment

**Scope:** `concept2cure-v2`, existing AnA medical-writing composer and existing governed evidence/biostatistics architecture. No new UI, database, editor, ingestion path or training dataset.

## New reusable primitive
`server/services/ana/csr-claim-reconciliation.ts` compares structured draft claim receipts with source-bound facts supplied by the existing governed analysis/evidence path. It fails closed on absent or duplicated facts, unreviewed/withdrawn sources, changed source hashes, missing table/page locators, mismatched analysis populations or endpoints, incorrect numerator/denominator/estimate, changed statistical method and unit mismatch. Empty claim sets do not pass.

This is a **pure validation primitive**, not an NLP extractor, model-training process or deployed approval gate. The caller must create exact claim and source receipts from approved analysis outputs; the code does not infer facts from prose. It uses a small relative numerical tolerance to avoid floating-point formatting noise; this does not authorize clinical rounding or replace statistical review.

## Guidance and tests
The existing CSR guidance composer now explicitly requires structured claim receipts rather than treating a prose citation as sufficient evidence of numerical accuracy. A new Vitest suite covers valid receipts, missing/duplicate sources, withdrawal, hash changes, population and endpoint substitution, count/estimate drift, method/units, invalid claims and empty inputs.

## Production integration still required
1. Bind claim receipts to the canonical editor section version and persisted AnA run ID.
2. Obtain qualified source facts from the existing CRE evidence spine and validated biostatistics TLF service, never from reference CSRs.
3. Invoke reconciliation on each CSR section before governed review-ready promotion; retain all inputs, findings and reviewer decisions.
4. Exercise real DB permission, source withdrawal, concurrent edit and version-change tests.
5. Run the focused Vitest tests, full TypeScript/build/security gates, live AnA journey and qualified medical-writer/biostatistician review.
6. Preserve all original evidence and derivatives. Do not treat external exemplars as client study outcomes.

**Not claimed:** new report acquisition, production Cortex admission, live model training, verified test pass, completed CSR, deployed review gate or regulatory approval.

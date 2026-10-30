# CSR claim receipts in the existing AnA document critique

The existing `critiqueDocument` in `server/services/ana/writing-precision-gate.ts` now accepts optional `csrClaims` and `csrEvidence` for whole-document CSR critiques. It invokes the existing `reconcileCsrClaims` validator and reports `csrEvidence.status` as `not_assessed`, `blocked` or `reconciled_pending_human_review`. A CSR without receipts or with mismatched/withdrawn facts receives `verdict: revise`. The prior structure/readability/grounding critiques remain intact.

This is **not** an automatic evidence extractor or production approval hook. Existing tool callers that pass only document text will now receive `not_assessed` for a CSR, not a false evidence pass. The caller must pass qualified, version-bound facts from the canonical evidence spine and biostatistics results; it must never invent them or use public exemplar results as client data. Even a reconciled result still requires medical writer, statistician, and governed human approval. The actual editor approval endpoint has **not** been wired to these receipts in this batch.

Tests: `server/services/ana/__tests__/writing-gate-csr-evidence.test.ts` exercises missing evidence, valid receipts, denominator drift, withdrawal and non-CSR isolation. Execute:
```sh
npx vitest run server/services/ana/__tests__/writing-gate-csr-evidence.test.ts server/services/ana/__tests__/csr-claim-reconciliation.test.ts server/services/ana/__tests__/medical-writing-csr-evidence-review.test.ts
```
Then run full TypeScript, build, security, CI and live governed editor journey. Tests and deployment were **not** verified as passing in this commit. All originals and review artifacts must be retained.

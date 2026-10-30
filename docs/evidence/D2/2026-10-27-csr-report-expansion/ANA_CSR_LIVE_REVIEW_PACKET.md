# AnA CSR live-response review packet — W1/D2

## What already exists
- `scripts/cre/evaluate-csr-challenge-set.mjs`: deterministic expert-review scorer with required source references, criterion-level judgments, and exact response SHA-256 checks.
- `LMN201_CSR_CHALLENGE_SET.json`: ten challenge cases, including seven critical cases, with explicitly defined expected behaviors.
- `server/services/clinical-regulatory-evidence/public-reference-sources.ts`: governed public-source retrieval, not a model-training service.
- Existing AnA drafting and single governed document editor remain the only authoring path.

## Change
`scripts/cre/prepare-csr-review-packet.mjs` converts **real, retained** AnA response texts and run identifiers into a review packet. It computes a SHA-256 over exact response text, creates one record for every expected benchmark criterion, and sets every verdict to `null` pending human review. It rejects absent, duplicate, unknown, or empty responses and refuses to overwrite an existing output file.

## Procedure
1. Run the existing AnA authoring path against each LMN-201 benchmark prompt, recording the exact response text and actual run ID. Do not use hypothetical or manually fabricated model outputs.
2. Assemble `ana-responses.json` as `{ "cases": [{ "id": "CSR-CDI-01", "runId": "<actual-run-id>", "responseText": "<exact-text>" }, ...] }` with all ten cases.
3. Run:
   `node scripts/cre/prepare-csr-review-packet.mjs docs/evidence/D2/2026-10-27-csr-report-expansion/LMN201_CSR_CHALLENGE_SET.json ana-responses.json review-packet.json`
4. Have a qualified medical writer and biostatistician assess the required criteria, with source evidence and written rationale. Fill in `passed`, `reviewer`, `evidenceReference`, `reviewNotes`, and each criterion's review fields. Preserve the original response text/hash unchanged.
5. Run:
   `node scripts/cre/evaluate-csr-challenge-set.mjs docs/evidence/D2/2026-10-27-csr-report-expansion/LMN201_CSR_CHALLENGE_SET.json review-packet.json`
6. Run focused tests:
   `node --test scripts/cre/evaluate-csr-challenge-set.test.mjs scripts/cre/prepare-csr-review-packet.test.mjs`

## Status and release boundary
This is a code and test change; **no live AnA run, model quality pass, medical-writing sign-off, production source admission or deployment is claimed**. The existing evidence retention policy applies to the original model outputs, source documents and reviewer records. Do not store private client CSR responses in a public repository.

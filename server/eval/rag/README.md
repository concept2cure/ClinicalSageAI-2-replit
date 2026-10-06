# RAG evaluation harness

This existing regression evaluator measures retrieval and source grounding in
one explicitly named evaluation organization and programme. It does not grant
model approval or expert acceptance.

## Current qualification status

**BLOCKED.** The repository gold set has 20 items: 18 positive questions and two
declared negative controls, below the documented 30–50-item target. All 24 corpus
manifest entries remain unverified; no gold positive has an official-text
evidence quote, and five positives have unresolved text checks. No reviewed
source may resolve until these requirements are satisfied.

The production RAG result also does not expose provider-resolved generator
identity. The judge adapter returns only text. Requested model flags therefore
cannot prove which models answered and graded. Every report states
`usableAsPqEvidence: false`, even when its diagnostic regression scores are
complete. The controlled PQ runner and approved PQ protocol remain separate
requirements; this evaluator does not bypass their gates.

## Files

- `rag-metrics.ts`: pure metrics and explicit negative-control classification.
- `gold-dataset.json`: review-pending questions with exact
  `document_code@version` source keys; stored document ids remain empty.
- `guidance-corpus-manifest.json`: official-source candidates and their verify
  procedure, pinned revisions, content hashes and publisher reuse terms.
- `qualification-corpus.ts`: reviewed-key binding to the existing Vault ingest
  identity in one organization and programme; read-only database access.
- `run-eval.ts`: scoped regression evaluation and retained per-item outcomes.

## Run the deterministic checks

```bash
npx vitest run server/eval/rag/__tests__
node --test tests/ops/verify-rag-corpus.test.mjs
```

These fixtures prove integrity controls, not model quality or verified official
documents. No provider, real evaluation tenant or human approval is substituted
by a fixture.

## Run against a reviewed evaluation corpus

Complete the manifest's verify procedure, resolve the gold text checks, then
ingest the verified bytes through the existing Vault ingest path into the
dedicated evaluation organization and programme. Enable the existing document
catalog/chunking controls there and retain the required publisher attribution.
Do not write a second ingestion path or use ClinicalTrials.gov registry rows as
the guidance corpus.

```bash
node scripts/verify-rag-corpus.mjs --org-uuid "$EVAL_ORG_UUID"
node --import tsx server/eval/rag/run-eval.ts \
  --org-id "$EVAL_ORGANIZATION_ID" \
  --org-uuid "$EVAL_ORG_UUID" --program-id "$EVAL_PROGRAM_ID" \
  --model "$EVAL_GENERATOR_ID" --judge-model "$EVAL_JUDGE_ID" \
  --min-hit-rate 0.6 --min-faithfulness 0.7
```

The corpus preflight establishes non-empty embedded chunks from live documents
and programmes in the named organization; it does not prove that every reviewed
document is present. Before any source lookup, retrieval or model call, the
evaluator verifies the organization integer id belongs to the supplied UUID and
the live programme belongs to that organization. Reads use the actual tenant
scope and transaction-local integer and UUID RLS settings. The resolver
additionally requires exactly one accessible live Vault document for each
expected `(program_id, document_code, version)` under that organization, the
manifest's SHA-256 in `content_hash`, and embedded chunks. Unverified revisions,
non-answer-source entries, ambiguous identities, missing quotes and open text
checks remain errors. A missing expected source does not become a negative
control.

Evaluation uses the existing Vault router, programme filter, strategy `basic`,
and reranking/MMR/self-query/compression/corrective loop disabled. The production
Vault searches and preflight now exclude deleted document and programme records.
Production and controlled PQ generation share a pure request builder with exact
original prompt parity. Generation still follows production model
governance; an unapproved candidate may be refused. Qualification-only model
execution remains confined to `server/eval/pq/`.

## Interpret the report

- Hit rate, recall and MRR compare **document ids**, never chunk ids.
- Answer-contains is a deterministic substring diagnostic, not clinical or
  regulatory correctness.
- Faithfulness uses only a valid bare 0–1 judge score. Arbitrary prose,
  out-of-range scores and failed judgments remain unassessed.
- Every gold item remains in the report. Unresolved sources, retrieval failures,
  positive refusals and failed/skipped judges prevent completeness. Means over
  the surviving items are labelled with their actual scored counts.
- A negative control requires an explicit tag and an observed empty-source
  grounded refusal; absence of expected source ids is insufficient.
- Exit status is non-zero when evaluation is incomplete or a requested threshold
  is missed. A complete regression report still does not establish a model PQ.

Expansion requires reviewed official-text quotes supporting the question and
every expected substring. Current blockers and red/green controls are recorded
under `docs/evidence/D4/2026-10-06-ana-rag-qualification/`.

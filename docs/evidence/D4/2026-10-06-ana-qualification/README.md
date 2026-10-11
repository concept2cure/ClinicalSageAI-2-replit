# W3 / D4 — Anna IA qualification and expertise review preparation

Status: **prepared, not qualified**. This package creates an executable reviewer workflow and records a real failed live attempt. It does not approve models, change high-risk production gates, or assert that Anna is an expert in every regulation or scientific field.

## Current audited state

| Item | Current evidence |
|---|---|
| Existing generation bank | 30 runnable tasks: 510(k) 10, CER 10, IND 10; each meets the current draft floor of 10 |
| Existing extraction bank | 12 runnable tasks: 4 each for 510(k), CER and IND |
| Gold-bank sample-floor check | Passed in `pq-regression-tests.txt`; no current document-quality size shortfall |
| Model registry | 16 entries; 5 have a high-risk role; 16 PQ pending; 0 PQ passed; 0 with both high-risk role and passed PQ |
| Supplemental IA bank | 34 reviewer-draft cases: 25 domain/market combinations and 9 controls; 39 planned model turns |
| IA source context | 20 official primary pages read on 2026-10-06; bounded summaries with issuer, authority type and revision |
| IA live capture attempt | `NOT_EXECUTED`: 0 captured responses and 0 attributable turns out of 39 planned; provider is unconfigured |
| Canonical PQ protocol | `PQ-DRAFT-001`, draft, approval fields null; required RAG has an executable controlled phase; 30 positive items per metric; approval fields remain null |
| Current RAG evidence | 20 items, 18 positive and 2 negative controls; 24 manifest entries, 0 verified; 0 item evidence quotes; 5 open checks |

The earlier suggestion that document-quality sample floors still needed filling was obsolete. Those floors already pass. Passing a floor or a deterministic test does not measure the model's regulatory judgment.

## Executable preparation

Canonical case bank: `server/eval/pq/ia-review-cases.json`. These cases are **supplemental reviewer drafts**, excluded from `doc-quality/gold-tasks.json` and its PQ task counts. Expectations are inferred from the shared IA policy and bounded source scope. A qualified reviewer must assess source applicability and clinical/regulatory correctness; finite case coverage does not establish exhaustive knowledge.

Use the existing runner:

```bash
npm run pq:run -- --ia-preflight
npm run pq:run -- --model <approved-models-id> --ia-review-only --record
npm run pq:run -- --model <approved-models-id> --judge-model <independent-registry-id> --org-uuid <authorized-organization-uuid> --program-id <authorized-programme-uuid> --record
```

In this restricted local runtime the tsx CLI's IPC socket is unavailable; the equivalent loader command runs successfully:

```bash
node --import tsx server/eval/pq/run-pq.ts --ia-preflight
node --import tsx server/eval/pq/run-pq.ts --model <approved-models-id> --ia-review-only --record
```

The IA-only mode writes `docs/evidence/PQ/<UTC-date>/<model-id>-ia-review.json`. It exits 1 because even a fully captured run remains unqualified and pending human adjudication. An exception before capture exits 2. `PENDING_REVIEW` describes transcript capture, never correct model judgment or a PQ pass. A preflight exit 0 describes valid preparation only.

The model receives the **canonical shared IA policy**, bounded source context, and the user's messages. Expected behaviors remain outside the prompt. Follow-ups carry the actual earlier assistant reply, rather than a canned correct response. Records capture request and response hashes, provider-reported model/version and provider identity, bank and policy hashes, timestamps, and repository commit. Wrong or missing provider identity stops the nominal conversation and leaves an incomplete record. Empty responses and failed calls are unexecuted; raw provider errors are not exported.

This is a policy-response probe. It does not exercise production conversation ownership, streaming, history windows, retrieval or tool execution, proposal persistence, or approval/export actions. Production-route acceptance must use the staging validation lane and actual authorized tenant records. Tool-result scenarios here test interpretation of a supplied status, not whether a tool really ran.

## Controlled RAG qualification implemented

`run-pq` now executes an attributable RAG phase using the shared canonical production source/generation request and the strict existing faithfulness judge. It derives the real integer organization ID from the supplied UUID under role-less bootstrap scope, verifies the live UUID/integer/programme binding before any lookup/retrieval/provider call, and binds both generator and judge requests to that organization and the existing database placement resolver. It does not override public-source provenance or data classification. Review/source failures remain in every planned item.

Records retain source blocks, document IDs, answers, actual completed provider/model identities, actual request and bounded response captures/digests, gold/manifest digests and pending reviewer fields. Vault chunk IDs never substitute for document IDs. Cached, deterministic, unknown, partial, aborted and tool-use replies cannot qualify. A provider or placement failure retains a sanitized error and any actual generator identity already obtained. The verdict recomputes plan/attribution/provenance assertions and checks both positive metric sample floors independently.

Empty-context negative controls use the exact fixed production refusal without a model call, serving attribution, hit or faithfulness score. Generated negative controls remain **incomplete pending qualified refusal/unsupported-claim review**; a refusal phrase followed by an invented claim cannot pass. Any explicit failed control remains a failure. The protocol is still draft and both approval fields are null. The added draft `minScoredItems:30` makes the existing README 30–50 target executable; hit/faithfulness thresholds remain 0.6/0.7. Current 18 positives are 12 short of each metric floor even after review. `rag-positive-expansion-reviewer-draft.json` prepares those 12 varied inputs and leaves exact official-text binding/reference answers unfilled.

The controlled phase closes the missing integration/provider-attribution **code** gap. Its source corpus, authorized tenant/programme, live provider access, expert review, protocol approval and actual scored execution remain operational/human prerequisites. Production-route acceptance remains separate, and finite sampled cases do not verify every law, guideline or scientific specialty.

## Reviewable domain/market coverage

| Domain | EU | US | Japan | Canada | China |
|---|---|---|---|---|---|
| device | `EU-device-ctis` | `US-device-predicate` | `JP-device-foreign-data` | `CA-device-claims` | `CN-device-import` |
| ivd | `EU-ivd-per` | `US-ivd-analytical-clinical` | `JP-ivd-local-scope` | `CA-ivd-risk` | `CN-ivd-dossier` |
| biotech | `EU-biotech-classification` | `US-biotech-batch-change` | `JP-biotech-development` | `CA-biotech-first-human` | `CN-biotech-overseas` |
| pharma | `EU-pharma-ctis-records` | `US-pharma-safety` | `JP-pharma-bridging` | `CA-pharma-guidance-status` | `CN-pharma-ethnic-sensitivity` |
| cro | `EU-cro-scope` | `US-cro-transfer` | `JP-cro-mrct` | `CA-cro-accountability` | `CN-cro-data-quality` |

Controls cover a clear factual answer, a fully bounded draft, user corrections, failed retrieval, incomparable units, newer-versus-older evidence, declined clarification, EU versus UK, and ambiguous “Europe” before countries are chosen. Five cases contain follow-up turns, including a diagnostic-claim change, an IVD screening claim, a Japanese drug-development limitation, a sponsor-oversight answer, and a corrected market/population.

## Evidence produced here

- `preflight-output.txt`: current bank, model and gold counts; credential **presence only**; preparation/prerequisite status.
- `preflight-mutations.json`: the actual CLI rejected four deliberate bad inputs with exit 1: caller-made approval, unknown source keys, invented candidate/PASS data and an empty bank. The canonical bank was restored after each execution.
- `claude-opus-4-ia-review.json` and `keyless-attempt-output.txt`: actual unconfigured-provider attempt. No response, reviewer score, confidence figure, model PASS or expert acceptance was invented. The selected alias uses its existing registry pin; this attempt does not recommend or approve a model choice.
- `claude-opus-4.json` and `keyless-pq-attempt-output.txt`: actual full keyless PQ attempt; zero generation/extraction outputs and all 20 RAG IDs preserved with explicit scope prerequisite refusal.
- `rag-attribution-red.txt`: six genuine old-code false PASS regressions observed before the verdict fix.
- `rag-positive-expansion-reviewer-draft.json`: 12 varied official-source-scoped inputs, unreviewed and excluded from canonical gold/counts.
- `pq-regression-tests.txt`: 218 passing tests across 10 suites, including 22 IA capture/bank tests, controlled RAG, verdict/claim integrity, existing document metrics, model registry and gold floors and existing draft-protocol, RAG-incomplete, served-model and gold-floor gates.
- `targeted-lint.json`: zero errors and zero warnings across 10 owned TypeScript paths.
- `reviewer-scorecard-template.json`: 34 unfilled case rows with seven null dimension scores each, critical-failure findings, reviewer identity and source applicability review. Null remains unreviewed.
- `reviewer-packet.md`: concrete questions, score anchors and unresolved decisions for qualified reviewers/system owner.
- `source-register.md`: exact official URLs, scope/revision locators and limitations.

Full local TypeScript graph compilation remains deferred under the session's authorized memory exception; this package does not claim that compilation or live expertise passed.

## Precise remaining prerequisites

1. Provision the authorized provider for a chosen existing registry model and verify account access plus the actual provider-served version. Current observed local provider keys and database/tenant configuration are absent. No production key, account or tenant was inferred.
2. Assign qualified regulatory and scientific reviewers covering the intended product types and local markets. Approve or correct draft expectations and adjudicate real attributable responses in a separate scorecard referencing the immutable capture hash.
3. The responsible system owner must approve the canonical PQ protocol and its acceptance criteria. A request to prepare evaluation is not a signature. Approval fields and registry PQ statuses remain unchanged.
4. Supply an authorized evaluation organisation/programme and source corpus. Verify official full texts, revisions, content hashes and embedded chunks, resolve source keys within tenant scope, complete item quotes/open checks, and review all 18 seed positives and add at least 12 reviewed positives for 30 per metric, retaining the 2 planned negative controls (at least 32 total). A separate 12-item source-grounded reviewer draft is included and is not admitted to gold.
5. Execute the implemented controlled RAG PQ against the verified live evaluation scope, exact candidate and independent judge, then review the actual captured provider identities/transcripts. Ordinary production RAG regression still withholds PQ usability because it does not expose provider-resolved generator identity. Requested flags and green deterministic tests do not establish a model PQ pass.
6. Run production-image staging validation and obtain the human-reviewed validation/release evidence sign-off after any findings are resolved. Other workstreams own their CI/security blockers.


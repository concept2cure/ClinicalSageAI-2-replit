# W3 / D4 — RAG evaluation integrity and actual qualification prerequisites

Status: **implementation checks passed; live RAG qualification BLOCKED**.
The existing evaluator, canonical generation prompt and Vault source eligibility
are repaired. No corpus writer, fabricated source verification, provider
exemption or human approval is introduced.

The earlier evaluator ignored gold source keys, ran without a tenant, used
advanced retrieval/reranking, omitted failed or skipped faithfulness judgments,
and printed “usable as PQ evidence” based solely on requested model flags.
Those flags did not establish which models actually answered or graded.

The evaluator now requires a positive organization integer id, its UUID and a
programme UUID. Before any source lookup, retrieval or model call, it verifies
that the live organization/programme keys match. Reads run under the real tenant
scope with both integer and UUID transaction-local RLS settings. Conflicting
ambient scope fails before checkout. Basic retrieval carries the organization
and programme filter with auxiliary model transforms disabled.

The resolver accepts only reviewed answer-source revisions and closed
text checks with an official-text quote supporting the expected answer. Exact
organization/programme/code/version lookup additionally requires matching
content SHA-256 and embedded chunks. Missing, ambiguous, deleted or partial
bindings fail. Every declared gold item retains its unresolved, retrieval-failed,
refused or unjudged outcome; incomplete outcomes cannot establish qualification.
Diagnostic means include measured sample counts. Strict faithfulness parsing
rejects arbitrary prose and out-of-range scores. Unexpected database/provider
error diagnostics are replaced by safe fixed failure reasons.

Production and controlled PQ generation share one pure request builder. Exact
pre-extraction prompt, temperature, token budget and source precedence are
preserved. Both existing dense and lexical Vault search arms, and the corpus
preflight, now exclude deleted documents and deleted or mismatched programmes.
The earlier production queries did not contain those filters. This protects
original-document retrieval; physical blob removal does not itself revoke
separately retained derived facts or imply a new retention policy.

Provider-resolved generator and judge identities remain unavailable on the
standalone evaluator's interface, so its `usableAsPqEvidence` remains explicitly
false. The separate controlled PQ phase uses the canonical prompt and explicit
serving identity checks. Deterministic regression fixtures do not establish live
model quality, verified official sources, expert acceptance or approval.

## Verification

| Evidence | Observed result |
|---|---|
| `red-scope-tests.txt` | Before fixes: 4 failures, 10 passes. Missing scope was accepted; tenant/programme were dropped; basic retrieval was not pinned. |
| `red-judge-tests.txt` | Before fixes: 2 failures, 18 passes. Out-of-range and arbitrary prose scores were silently clamped/parsed. |
| `red-deleted-corpus-tests.txt` | Before live-source filters: 2 failures, 2 passes. Deleted documents or programmes could still resolve. |
| `red-deleted-preflight-tests.txt` | Before preflight filters: 2 failures, 29 passes. Deleted documents/programmes still counted as usable corpus. |
| `green-rag-tests.txt` | 113 tests passed across nine RAG, canonical request and existing router/pipeline suites. Includes all 18 actual unreviewed repository positives refusing before document lookup and FORCE-RLS non-owner scope/source tests. |
| `green-corpus-preflight-contract.txt` | 32 corpus-preflight contract tests passed under Node's test runner, including exact dense/lexical query predicate parity and deletion-filter mutants. |
| `pre-extraction-request-parity.txt`, `post-extraction-request-parity.txt` | Five exact original generation request/source/refusal parity tests passed before and after extraction. |
| `request-parity-mutant.txt` | In-memory temperature mutation was rejected by exact parity assertions; repository source was not mutated. |
| `strict-corpus-types.txt` | Strict TypeScript for the resolver, metrics, pure canonical request builder and small dependency graph exited 0. Full application compiler remains CI responsibility under the existing local memory exception. |
| `eslint.json` | Twelve changed evaluator/helper/test TypeScript files; zero errors and zero warnings. The existing large production pipeline retains its ten pre-existing lint warnings and adds none. |
| `blocked-cli-preflight.txt` | Actual CLI invocation with named models but no evaluation organization id refuses before loading the database runtime. |
| `prerequisites.json` | Counts and hashes from checked-in gold/manifest; no verified source, real tenant, provider response or approval was supplied. |

The narrow TypeScript command was:

```bash
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck \
  --target ES2022 --module ESNext --moduleResolution Bundler \
  --esModuleInterop --types node \
  server/eval/rag/qualification-corpus.ts server/eval/rag/rag-metrics.ts \
  server/services/rag-generation-request.ts
```

## Remaining live prerequisites

1. Retrieve official files and complete the manifest's verification procedure:
   source identity/revision/date, downloaded-byte SHA-256, reuse terms and
   attribution. All 24 entries remain `verified:false`.
2. Resolve the five official-text checks and add reviewed evidence quotes to
   all 18 positive questions. Expand beyond the 20-item seed to the approved
   positive scored-item floor; explicit negative controls cannot fill it.
3. Supply a dedicated evaluation organization/programme, application database
   role, admitted verified Vault corpus and configured model providers. Fixtures
   establish none of those operational facts.
4. Execute controlled PQ with verified exact generator and independent judge
   serving identities, then evaluate all retained outcomes against approved
   criteria. Requested aliases and standalone scores cannot substitute for it.
5. Obtain owner/expert approval of the protocol and review actual live responses.
   The current protocol and reviewer packet remain draft/pending.

No live RAG result or human acceptance is claimed.

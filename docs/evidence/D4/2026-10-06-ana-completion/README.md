# Anna IA — implementation, security and qualification completion

Workstream W3 / launch row D4. This package records the implementation and checks completed on 2026-10-06, and the exact boundary between executable preparation and actual qualification. **Live expertise acceptance, model PQ, production-image staging IQ/OQ and human release signatures are not complete.** The necessary provider, tenant, staging and signing access is absent in this execution environment.

## Completed implementation

- Added a controlled IA transcript-capture workflow with 34 reviewer-draft cases, 39 planned turns and 20 official primary-source contexts. The bank covers the 25 requested domain/market combinations plus nine critical-thinking controls. Follow-ups carry the actual prior answer; captures record the requested model, provider-served identity, hashes and unfilled reviewer scores.
- Repaired RAG evaluation source binding and completeness: explicit organization/programme scope, exact reviewed source-key/version/hash binding to embedded Vault documents, basic retrieval with auxiliary model transforms disabled, strict faithfulness scores, and an outcome for every unresolved, failed or unjudged item.
- Integrated a controlled RAG phase into model PQ using the existing retrieval path and unchanged canonical production generation prompt. Generator and independent judge calls bind the real tenant placement policy and capture actual serving identities. Empty-source fixed refusals make no model-serving claim. The missing draft sample criterion now requires 30 scored positive items per metric, derived from the documented sample target; acceptance still requires actual owner approval.
- Excluded soft-deleted documents and programmes from dense/lexical Vault retrieval, source qualification and corpus preflight, with schema-backed regression coverage.
- Remediated four newly reported vulnerable dependency versions and corrected dependency-risk traversal and date validation. No new risk acceptance, scanner suppression or severity reduction was introduced.
- Corrected validation evidence dating, effective process/environment configuration checks and scoped output paths. Added the missing `MCP_PUBLIC_URL` configuration declaration. Historical validation evidence was preserved.
- Documented the next lifecycle enhancement in [Document and extracted-data lifecycle](../../../../architecture/DOCUMENT_DATA_LIFECYCLE_2026-10-06.md): explicit keep-data, remove-data or supersede choices, append-only disposition, impact preview and shared eligibility across catalog, Data Room, Vault, RAG and lineage. The current immutable source/Vault records do not yet expose this complete disposition projection, so no unsafe delete control was presented as finished.

The current IA policy and earlier conversation/history/evidence tools remain covered by the combined regression run. These implementation checks do not measure actual model wisdom or regulatory/scientific correctness.

## Current qualification state

| Area | Actual observation | Implication |
|---|---|---|
| Document-quality gold | 30 runnable generation tasks: 10 each for 510(k), CER and IND; 12 extraction tasks | Current generation sample floors already pass; the earlier size blocker was obsolete. |
| Model registry | 16 entries, 5 with high-risk roles, 16 PQ pending, 0 passed | No model is currently qualified for governed high-risk drafting. |
| IA capture | Actual keyless attempt: `NOT_EXECUTED`, 0 responses / 39 planned turns | No live judgment score, expertise acceptance or confidence estimate exists. |
| IA review | 34 reviewer-draft rows, seven null dimension scores per row | Qualified regulatory/scientific adjudication is still required. |
| RAG source corpus | 24 manifest entries, 0 verified; 20 seed items, 18 positive and 2 negative controls; five open official-text checks | At least 12 additional reviewed positives are needed for the 30-item metric floors, plus source review, Vault admission and live execution. |
| Canonical PQ criteria | Draft; `approvedBy` and `approvedOn` remain null | Executable code cannot confer protocol approval or registry qualification. |
| Staging IQ/OQ | No staging endpoint or operational credentials | The local attempt below is not production-image staging qualification. |
| Release evidence approval | Unsigned | Founder/system-owner and qualified-contractor signatures must be actual human actions. |

## Available validation observations

The attempted IQ records **6 passes, 4 failures and 5 deviations**. Static installation/configuration declarations pass. Missing database, runtime configuration and identities are recorded as deviations; unavailable application endpoints and missing browser tooling are failures. The harness self-test also refuses at its required live-server login (`oq-harness-selftest.txt`); it is not a passing offline test.

The scoped current traceability matrix contains **82 requirements, 0 executed OQ steps and 82 uncovered requirements**. Its builder and negative self-test passed: that demonstrates consistent reporting, not requirement satisfaction. This attempt did not replace the earlier matrix or create artificial successful OQ records.

Validation runners now use the actual UTC execution date by default, reject invalid/path-like dates, honor one explicit evidence root, and record configuration presence from effective process/file values without exporting secrets. Red/green tests and the original missing-configuration attempt are preserved here.

## Security outcome

The final live npm dependency-risk gate passes against the unchanged three existing reviewed High advisory occurrences. Plain npm audit remains nonzero (31 High wrapper entries, 43 Moderate, 1 Low, 0 Critical); the installed tree is not claimed vulnerability-free.

Pinned Trivy v0.70.0 with a freshly downloaded vulnerability database returned **exit 0, 0 High/Critical findings and 0 secrets**. The first full raw successful report, an intervening cache mmap fault and the final fresh-cache success are all retained in the [security evidence](../2026-10-06-ana-release-security/README.md). No new scanner exclusions were introduced. This is a local filesystem scan; exact-release CI remains separate evidence.

The unchanged braces/image-size risk decisions still need an accountable human re-review before 2026-11-05 and 2026-11-25. Team labels were not replaced by invented owner identities.

## Evidence and next execution

- [Owner/expert execution handoff](OWNER-REVIEW.md): access, accountable reviewers, execution order, staging commands and unsigned decision rows.
- [IA qualification/reviewer package](../2026-10-06-ana-qualification/README.md): bank coverage, source register, captures, preflight and blank scorecard.
- [RAG qualification integrity](../2026-10-06-ana-rag-qualification/README.md): source resolver, tenant/read-only controls, unassessed-case handling and corpus prerequisites.
- [Release-security remediation](../2026-10-06-ana-release-security/README.md): exact-head diagnosis, compatible patches, unchanged risk decisions and scanner evidence.
- `combined-regression-tests.txt`, `repository-gates.json`, `repository-gates.txt`: combined implementation tests and 26 repository guards.
- `IQ/iq-results.json`, `traceability/`, `validation-attempts.json`, `prerequisite-presence.json`: actual blocked local validation results and presence-only prerequisites.

Full application TypeScript compilation is left to CI under the session's existing memory exception. No deployment, operational tenant, live provider response, expert approval, model PASS or human signature is asserted by these local results.

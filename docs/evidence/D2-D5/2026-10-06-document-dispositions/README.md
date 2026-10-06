# Explicit document disposition — W2/D2 and D5

Date: 2026-10-06. Branch: `concept2cure-v2`.

This work implements the document/data lifecycle contract carried by the previous IA/RAG safeguard change. It moves D2's Data Room/Vault source controls and D5's traceability: a project source cannot be removed without a recorded decision about its extracted data. It does not close the complete launch rows or assert live qualification.

## Implemented behavior

The Data Room (`client/src/concept2cure/v2/surfaces/ProjectHome.tsx`) and Vault (`client/src/concept2cure/v2/surfaces/Vault.tsx`) reach the shared `DocumentDisposition.tsx` interface. It requires an explicit `keep_data`, `remove_data` or `supersede` choice, a reason, and a complete fresh impact preview. No option is preselected. Supersession names a verified existing direct successor. The UI cannot report success without the chained audit receipt.

All three choices withdraw the original file from ordinary binary access. Keeping data preserves its current stored extraction/catalog/retrieval eligibility with an **original file unavailable** marker. Withdrawal and supersession remove old data from new grounding while preserving historical citations and lineage. Retained data can later be withdrawn or superseded by appending another decision; the original receipt survives, and the original file is never reactivated.

The canonical API is `GET /api/c2c/projects/:id/document-dispositions/preview` and `POST /api/c2c/projects/:id/document-dispositions`, implemented in `server/routes/c2c/document-data-dispositions.ts`. It takes scope/actor from authentication, enforces mutation authority, verifies source hash and links, fingerprints every impact store, signs a ten-minute actor-bound preview, rechecks it in the confirmation transaction, and commits audit plus disposition together. Holds, active approvals, governed downstream dependencies, missing stores and stale impact refuse the write.

The new additive migration is `migrations/20261006_document_data_dispositions.sql`, registered before the final tenant sweeps. Its append-only/identity/transition guards preserve the immutable source, Vault, extraction and lineage rows. Late-write guards stop supported captured-source, Vault extraction/catalog/chunk, atom, artifact, RAG and citation writes after the original is withdrawn. Artifact content/hash/metadata/identity are frozen. Old and new references are both checked to stop supported reparenting, and protected catalog/chunk/atom/artifact/RAG/citation deletion is refused. Shared eligibility predicates apply to the modified catalog, file, pin, citation, retrieval, indexing and eCTD source consumers. Direct citation creation/refresh refuses withdrawn data. A same-hash new source identity cannot restore disposed bytes; raw upload access conservatively rejects the same SHA-256 organization-wide. Vault matching uses the authoritative programme tenant, including legacy rows with a null document organization column.

Ana's selected-source retained context reads only stored extraction from the confirmed same-project representation, includes source/hash/representation identity and says that the original file is unavailable. `textSha256` identifies the exact supplied UTF-8 excerpt separately from the original PDF hash. It makes no PDF read, OCR or inference call. Withdrawal or supersession disables this context. The legacy Ana `read_vault_document`, `list_vault_documents` and `search_all_documents` artifact handlers use the canonical eligibility projection, preserve retained-text markers and report unavailable policy stores without returning previously readable old content.

RAG checks the actual corpus identity and tenant/project in batches before reranking, MMR re-embedding of candidate text, compression, corrective grading/generation and final grounding. Empty or failed policy-filtered expansion drops its stale candidate. If a source's eligibility or original-file availability changes during the generation await, the complete answer is refused. This prevents publishing stale grounding; it cannot recall an input already dispatched to a provider.

## Legacy DELETE replacement

| Refused legacy path | Reachable replacement | Reachability proof |
|---|---|---|
| Knowledge-source DELETE in `server/routes/c2c/knowledge-sources.ts` | Project disposition API and Data Room action in `ProjectHome.tsx` | `client/src/concept2cure/v2/__tests__/projectDocumentDisposition.test.tsx` |
| File DELETE in `server/routes/document-data-center.ts`, including direct `DocumentDataCenterService.deleteDocument` callers | Project disposition API and shared Data Room/Vault `DocumentDisposition.tsx` interface | `documentDisposition.test.tsx`, `projectDocumentDisposition.test.tsx`, and `server/services/document-data-disposition/__tests__/route-auth.test.ts` |

The legacy routes answer 409 `DOCUMENT_DISPOSITION_REQUIRED`; they no longer bypass the decision by deleting settings references or storage bytes.

## Completed offline regression

The final combined run passed **86 unique test files and 1149 tests**, exit 0. [focused-offline-final.txt](focused-offline-final.txt) curates the recorded command, per-file pass counts, selected proof cases and exact runner summary; [focused-files.txt](focused-files.txt) lists its unique input files. Runtime/provider debug payloads and incidental configuration are omitted. It covers the disposition API/guards/consumers, Data Room and Vault UI, source/citation/lineage neighbors, RAG, asynchronous writes and the focused CI repairs. These are local regressions, not live qualification protocols.

An earlier attempt was stopped when automatic approval review rejected an external OpenAI request. No result or log from that attempt is counted or filed here. The completed run used [offline-verification.cjs](offline-verification.cjs), a verification-only transport boundary that permits local test servers and refuses external fetch/HTTP/HTTPS before dispatch. Its fetch and HTTPS refusal were checked before the run. It does not change application behavior or qualify a provider.

Reproduce from the repository root with installed dependencies:

```bash
mapfile -t C2C_DISPOSITION_TEST_FILES < docs/evidence/D2-D5/2026-10-06-document-dispositions/focused-files.txt
NODE_OPTIONS="--require=./docs/evidence/D2-D5/2026-10-06-document-dispositions/offline-verification.cjs --max-old-space-size=4096" \
  npx vitest run --config vitest.config.ts --maxWorkers=1 "${C2C_DISPOSITION_TEST_FILES[@]}"
```

The PGlite harness applies the production disposition migration against supported storage shapes. Service cases cover choice/authority and tenant/program boundaries, hash/link ambiguity, stale tokens after impact changes, expired/wrong-actor/tampered previews, valid and invalid direct successors, holds/approvals/dependencies, atomic audit failure, keep-to-terminal transition, append-only and late-write guards, and migration replay. Consumer cases exercise actual captured-source/citation/pin/catalog queries and retained text context with cross-scope refusal. The service harness injects an audit fixture with a test receipt to exercise transaction rollback; it does not execute or verify a deployed audit chain.

The controlled negative case in `consumers.pglite.integration.test.ts` replaces the binary eligibility predicate with `TRUE`, demonstrates that disposed bytes become resolvable, then restores the predicate and asserts refusal. It establishes that this focused check detects the omission; it is not a production mutation or a claim that every consumer has been falsified.

Development evidence already filed:

| File | Observed result | Scope |
|---|---|---|
| [development-ui.txt](development-ui.txt) | Four files, 60 tests passed | DocumentDisposition, ProjectDocumentDisposition, ProjectHomeDataRoom and VaultSurface UI suites, before final repository verification |
| [development-consumers.txt](development-consumers.txt) | One file, four tests passed | Actual source/pin/catalog queries, retained context and controlled binary-predicate omission |
| [artifact-disposition-tools.txt](artifact-disposition-tools.txt) | Three files, 10 tests passed | Actual legacy Ana artifact handlers, including three PGlite cases for keep-to-terminal transitions, foreign identities and unavailable policy stores |
| [rag-disposition-sql.txt](rag-disposition-sql.txt) | Four files, 25 tests passed | Candidate revalidation/generation/expansion, including three PGlite cases for scope, retained text and a real local disposition commit during a controlled provider stub |

The consumer log preserves non-fatal audit-service initialization diagnostics from imports; audit transaction assertions use the fixture described above. The RAG log is curated to keep the exact test case results and runner summary, omitting repetitive initialization messages and the intentional failed-neighbor-query stack trace. These development runs overlap the final combined run; their counts are not added to its unique total.

## Repository checks

The 25 named static checks in [static-gates.json](static-gates.json) each exited 0; [static-gates.txt](static-gates.txt) records their exact commands and output. They cover migration ordering/drop/deploy paths, manifests, SQL JSON operators, tenant/read/auth conventions, audited writes, upload guards, signing, launch-copy and honest-state controls. This named set is not a substitute for the complete canonical pre-push gate.

The final offline `npm run build` completed the production client build in 13.93 seconds and produced `dist/index.js` through the server build; [build-final.txt](build-final.txt) preserves the output. Existing chunk-size warnings remain. Build success does not establish TypeScript correctness or deployment readiness.

The full TypeScript gate was attempted alone with `TYPECHECK_HEAP_MB=7168 node scripts/ci/typecheck-no-regression.mjs --incremental` and then with `TYPECHECK_HEAP_MB=6144`. Neither compiler completed: the 7168 MB run was killed (137), and the 6144 MB run exhausted the V8 heap (134). [typecheck-7168-unavailable.txt](typecheck-7168-unavailable.txt) and [typecheck-6144-unavailable.txt](typecheck-6144-unavailable.txt) preserve the gate's own refusal. These attempts provide no trustworthy diagnostic count and no full typecheck verdict. Native incremental-cache prewarming remains under investigation with the canonical configuration; the full canonical gate is still required. Scoped checks or a warmed cache alone cannot substitute for a completed verdict.

The completed changed-file Semgrep scan used version 1.177.0, `p/default` and `p/ci`, and baseline `e78869eec43301b44f2e1af01e630f0278b3d360`: 213 rules, 88 explicit targets, zero findings, exit 0. [semgrep.txt](semgrep.txt), [semgrep.json](semgrep.json) and [semgrep-targets.txt](semgrep-targets.txt) preserve the result and target manifest. Six existing partial-parse warnings and two rule timeouts on `AnaToolExecutor.ts` remain (Express SSRF and direct-response XSS); the scan reports approximately 99.9% parsed lines. These warnings limit coverage. This is a changed-file security result, not a full typecheck or a deployed qualification verdict.

## Activation and limits

- New confirmations remain default-off. Enable only with `C2C_DOCUMENT_DISPOSITIONS_ENABLED=1` after verified activation. Preview signing needs a random secret of at least 32 characters in `DOCUMENT_DISPOSITION_PREVIEW_SECRET`, or `SESSION_SECRET` when the dedicated variable is absent. Existing dispositions remain enforced when confirmation is disabled.
- PGlite demonstrates actual SQL guards and rollback behavior in one embedded connection. It does not prove real PostgreSQL two-connection scheduling, lock contention, provider-dispatch timing, or runtime-role permissions under the deployed RLS configuration. Confirmation deliberately locks complete impact tables; staging must measure contention and timeouts.
- Provider-boundary checks are point-in-time reads. They do not cancel or recall an already-dispatched request, and cannot retroactively delete that provider's input. The generated-answer refusal test establishes output withholding when a real local disposition commits during a controlled provider stub, not live-provider execution or provider-side cancellation.
- `physicalErasure` is always false. This work makes no cloud-object deletion or retention-purge claim. The tenant's retention schedule, legal-hold process and physical erasure remain separate governed controls.
- No live provider qualification was run. Provider access, verified tenant data and named reviewer/owner approval remain blockers to live qualification and activation. No CI, typecheck, build or deployment verdict should be inferred from implementation or a focused test result.

The implementation contract and deployment notes are in [DOCUMENT_DATA_LIFECYCLE_2026-10-06.md](../../../architecture/DOCUMENT_DATA_LIFECYCLE_2026-10-06.md).

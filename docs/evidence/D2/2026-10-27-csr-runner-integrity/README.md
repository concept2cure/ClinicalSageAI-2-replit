# W1 / D2 — CSR async runner integrity and cancellation

## What already exists
- `server/services/csr/csr-job-runner.ts`: canonical persisted CSR section runner, resume/retry, content hashes, placeholder checks, and submission continuation.
- `server/services/csr/__tests__/csr-job-runner.placeholder-gate.test.ts`: existing in-memory runner tests; augmented rather than replaced.
- `server/services/__tests__/csr-builder-completeness.test.ts`: synchronous builder completeness coverage, unchanged in this batch.
- Existing governed editor, AnA, Vault, and CRE source handling remain the only user-facing workflow and evidence spine. No second CSR application or store.

## Reproduced code-level gaps addressed
1. Final completion previously selected saved section text **without** its checksum and therefore could report the report complete even after a hash mismatch between saved text and retained identity. The new `verifySavedCsrSectionIntegrity` helper checks the exact, nonblank saved text against its persisted SHA-256 and detects missing, altered, and duplicate target outputs before final completion.
2. The final `status: complete` update was not conditional on `drafting`. The runner now transitions to complete only with a tenant- and active-state-guarded `UPDATE ... RETURNING`. No dependent submission continuation occurs unless one row was actually completed.
3. An asynchronous model call can outlive cancellation. The runner now rechecks active drafting status after the model call and before saving the returned section text; progress updates also require an active drafting status.
4. Resumed jobs that succeed now clear stale prior failure information.

## Tests / evidence
- `server/services/csr/__tests__/csr-output-integrity.test.ts`: six focused Vitest cases for correct hashes, tampering, absent/blank outputs, duplicates, invalid targets and missing hashes.
- Updated `server/services/csr/__tests__/csr-job-runner.placeholder-gate.test.ts` uses hash-aware saved-output projection and models guarded terminal transitions; adds cancelled late-result and retained-hash regression cases.
- A local standalone Node 22 type-stripping smoke probe of the helper logic passed five assertions (valid, changed, missing, duplicate, invalid targets). This is a **helper-only** check, not a full Vitest result, test-suite pass, production behavior verification or CI clearance.
- Required verification command: `npx vitest run server/services/csr/__tests__/csr-output-integrity.test.ts server/services/csr/__tests__/csr-job-runner.placeholder-gate.test.ts server/services/__tests__/csr-builder-completeness.test.ts`.
- Then run the full repository pre-push, CI, TypeScript, Security Scan, Tier 5 and deployed browser qualification checks. Do not mark a queued or skipped gate as passed.

## Remaining limitations
This patch is not a transactional lock around model-generation/output-save, so cancellation races during the final database write still warrant additional live concurrency testing. The conditional completion update is the last safety boundary. Existing test doubles do not establish database isolation or concurrent-process correctness by themselves.

None of this proves complete, source-grounded CSR medical writing, external-reference admission to Cortex, validated biostatistical calculations, live clinical data ingestion, or regulatory submission readiness. All original evidence remains retained.

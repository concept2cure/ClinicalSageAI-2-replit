# W3 / D4 — prior source GitHub verification

Verified 2026-10-07 against source commit
`cdc1308d97fa4564d799001f536fb423b9a5cc0e` on `concept2cure-v2`.
This records the prior pushed source, before the current scientific-qualification
changes. GitHub run metadata, job/step summaries, decoded job logs and uploaded
test artifacts were read through the official GitHub connector. No workflow was
dispatched, rerun or changed, and no baseline was changed by this verification.

## Actual TypeScript and ESLint results

[C2C Agent run 37581682835](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37581682835)
completed successfully for the exact source SHA. Its
[typecheck job 112662570048](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37581682835/job/112662570048)
reported:

| Step | Result | Decoded evidence |
| --- | --- | --- |
| 5 — TypeScript type check (baseline-gated) | Success | `running tsc --noEmit (baseline: 0)`; `errors found: 0 (tsc exit 0)`; `OK — error count 0 matches baseline.` |
| 6 — ESLint | Success | `6258 problems (0 errors, 6258 warnings)` |

The C2C Agent ESLint command is `npm run lint || true`, so its green step alone
would not prove zero errors. The decoded summary does establish zero ESLint
errors for this source; 6,258 warnings remain.

The separate
[CI Lint job 112662572066](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37581683321/job/112662572066)
also reported actual TypeScript zero errors / exit zero against baseline zero
(step 126), and beta-slice TypeScript success (step 127). ESLint reported the
same zero errors / 6,258 warnings. Step 124's warning ratchet passed with
`6258 warning(s) across 1785 file(s), 21 rule(s) (baseline 6411)` and
`OK — warning count did not grow.`

## CI is failed, with four failed jobs

[CI run 37581683321](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37581683321)
is **failure**, for the exact source SHA above.

| Failed job | Failed step | Actual evidence and attribution |
| --- | --- | --- |
| [Lint — 112662572066](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37581683321/job/112662572066) | 63 — Guardrails — audit_logs fixtures accept the audit writer's columns | Decoded log: one incompatible fixture at `server/routes/c2c/__tests__/projects-adoption-sql.test.ts:60`, missing `old_values`, `ip_address`, `user_agent`, `reason`; exit 1. Zero-baseline guard, not an ESLint or TypeScript failure. The fixture was introduced by prior commit `0d15907bbeb072f58f2aa03b14532826d8ac5420`; the upload durability commit did not change it. |
| [Integration Tests — 112670496677](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37581683321/job/112670496677) | 9 — Run integration tests | Uploaded `integration-tests-results` artifact 11469452449: Jest 40 passed / zero failed; Vitest 56 failed assertions across 10 physical test files, 42,686 passed. |
| [Test — 112670496783](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37581683321/job/112670496783) | 10 — Run tests | Uploaded `test-results` artifact 11469074323: Jest 40 passed / zero failed; Vitest 56 failed assertions across the same 10 physical test files, 42,701 passed. |
| [Coverage (ratchet) — 112670496737](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37581683321/job/112670496737) | 10 — Coverage may not go down | Uploaded `coverage-report` artifact 11469488521 has `test-results/vitest-coverage.json` and telemetry, but no `coverage/coverage-summary.json`. The test report has the same 56 failed assertions. The ratchet fails closed when the summary is absent. A missing-summary cause is supported by the artifact and unchanged gate implementation; the precise decoded coverage error could not be retrieved. No measured percentage or baseline regression is claimed. |

Repeated official decoded-log retrieval for the Integration, Test and Coverage
jobs failed with `Transport closed`. Their uploaded reports and job/step
conclusions were retrieved successfully. The distinction above preserves that
limitation instead of treating inferred coverage causality as a decoded error.

Build job 112699689609, Assemble Release Evidence job 112699689611 and Release
evidence gate job 112699692097 were skipped. This run cannot establish full CI,
release-evidence or launch readiness.

## Failing test set and preceding source comparison

The current core and integration artifacts identify this same failing assertion
set:

| Physical test file | Failed assertions | Reported failure |
| --- | ---: | --- |
| `tests/regulatory/regulatory-basis.test.ts` | 1 | Regulator host list differs from expected list. |
| `server/routes/__tests__/authoringWritesBoundAndAudited.pglite.integration.test.ts` | 7 | Citation writes / refreshes return HTTP 500 where 200 or 201 is expected. |
| `server/services/ana-ri/__tests__/mdx-esg-transmit-gateway.test.ts` | 11 | Signer independence unresolved; the fixture does not establish a package creator. |
| `server/services/audit/__tests__/audit-immutability-triggers.pglite.test.ts` | 8 | `public.domain_history_append_only()` is absent; its migration must run first. |
| `server/services/document-data-disposition/__tests__/consumers.pglite.integration.test.ts` | 3 | `column c.content_hash does not exist`. |
| `server/services/ectd/__tests__/assemble-from-core.vault-uuid.pglite.test.ts` | 2 | Vault source resolver query fails. |
| `server/services/ectd/__tests__/leaf-source-resolver-vault-finalized.test.ts` | 12 | Vault source resolver query fails. |
| `server/services/ectd/__tests__/leaf-source-resolver-vault.test.ts` | 9 | Vault source resolver query fails. |
| `server/services/intelligence/__tests__/regulatory-intelligence-integration.test.ts` | 1 | Predictive scoring refuses PMA because device completeness requires its own assessment. |
| `server/services/pathway-engines/mdr-ivdr/__tests__/assemble-technical-file-vault-uuid.pglite.test.ts` | 2 | Vault source resolver query fails. |

The immediately preceding non-skipped source,
`0d15907bbeb072f58f2aa03b14532826d8ac5420`, also had failed
[CI run 37580252509](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37580252509).
Its core `test-results` artifact 11468437528 contains 56 failed assertions.
Comparing `(physical test path, full assertion name)` sets between that prior
artifact and current core artifact 11469074323 gives **identical sets**: zero
new failures, zero resolved failures. This is direct evidence that these 56
core-suite failures were inherited by the upload durability commit; they are
still failures, not accepted or newly baselined debt. The prior CI also failed
the audit fixture guard (Lint job 112658024597 step 63), Integration job
112663686306, Coverage job 112663686334 and Test job 112663686397. Its separate
TypeScript failure is resolved in the current source as shown above.

The focused files passed in each current core, integration and coverage test
report: `chat-upload-durability.test.ts` 11/11,
`projects-adoption.test.ts` 21/21, and `projects-adoption-sql.test.ts` 14/14.
The SQL suite's pass does not waive its independent fixture-contract failure.

**Verdict:** source TypeScript and ESLint errors are zero; the upload durability
tests pass; the exact preceding core failure set persists; CI and D4 remain
blocked pending the named guard, test and coverage qualification evidence.

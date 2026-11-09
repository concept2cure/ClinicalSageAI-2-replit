# S4 · Anna runtime Phase 0: the expanded spike, joined run (2026-11-09)

Owner: `session_01KZK3jgtmQBgNepqLjXjS3k`, sole owner of the Anna-runtime epic (P-105). Plan §1d, "Expanded spike —
executable acceptance contract".

**Verdict: acceptance pending.** All seven checks run together on one tree, and every suite passes. No check is
claimed passed in full: each one below names what is proven and what is still open. The hard dependencies in §1d
remain: there are no concrete local weights with a passed PQ (`approved-models.ts` `local-default`), and no automatic
de-identification. This run calls no provider, makes no live transmission and uses no deployed database.

## What already exists

A read-only sweep mapped each sub-claim to the existing code and tests before anything was added. Its searches
covered:
- canary, exact bytes, staged-byte SHA, `NOBYPASSRLS`, `FORCE ROW LEVEL SECURITY`;
- hard gate, never again, decision package;
- T3, frontier, derivative, token map, attestation;
- independent check, lock, sign, transmit, clock.

Each check's existing suites are in the table below. Everything this run adds is a test, and each extends an
existing suite or harness.

## How it was run

On `64e3346363`:
- **Ordinary config** (`vitest.config.ts`, PGlite where a suite uses it): 32 files.
- **Real database** (`vitest.db.config.ts`): 6 files.
- **`poolInstrumentation.integration`**: unmocked `pg`, `TEST_REAL_DB=1`.

The real database was built as CI's Integration Tests job builds it:
- a blank local PostgreSQL 16 database (`c2c_spike_dbtest`), with `pgvector` installed;
- `node scripts/db/install-fresh.mjs`, then `node scripts/db/deploy-migrate.mjs`, both exiting 0;
- `app_service` as the runtime role, through `APP_DATABASE_URL`.

Every database variable the resolvers read (`DATABASE_URL`, `DATABASE_OWNER_URL`, `NEON_DATABASE_URL`,
`DATABASE_NEON_NEW_SECRET`, `DATABASE_URL_ADMIN`) was pinned to the local database. That way `.env` could not
redirect a write.

Without `pgvector`, `install-fresh` skips `0005_csr_knowledge_database.sql` and then refuses
`ctd_cross_references`, so the extension is a prerequisite here, as it is in CI's image.

| Run | Files | Tests | Passed | Failed |
|---|---|---|---|---|
| Ordinary config | 32 | 798 | 768 | 0 (30 skipped: `poolInstrumentation`, run separately below) |
| Real database | 6 | 97 | 97 | 0 |
| `poolInstrumentation`, real database | 1 | 30 | 30 | 0 |

Per-suite counts are in `results.json`.

## Each check

| Check | Proven by (existing unless marked new) | Open |
|---|---|---|
| **1. Independent verification and decision rights (§14.4)** | `sub-agent.test.ts`, `sub-agent-verifiers.test.ts` (draft and check distinct; an unsupported exact or framed claim rejected); `tool-authorization-rule-zero.test.ts`, `ana-cannot-sign.test.ts`, `stream-run-agent-real.test.ts` (a child gets reads only); `_authoring-canvas-fixture.ts:377` (a child cannot record independent-check authority); `artifact-status-lock-covers-approval.test.ts`, `workflow-import-governance.dbtest.ts` (lock covers the approved version); `turn-plan-and-context.test.ts` (acceptance rebuilt from the audit); **new** `run-coordination-dispositions.test.ts` (rework and rejection rebuilt from the audit, bound to their report, reasons stored only as hashes; `d4b82abc94`); **new** depth-1 cases in `tool-authorization-rule-zero.test.ts` naming the transmit, the signature, the filing, the version overwrite, the move to review and the transmittal-status write (`ce1451297c`) | No single test runs child check → parent merge → lock end to end. Each link is proven on its own fixture: a parent accepts a report only `accepted_as_proposal` (`turn-plan.ts`), which writes nothing to the document; the merge is a separate write a person confirms (rule 3); the lock follows a person's approval. No clock-mutation tool exists to test. Exact matching does not establish semantic support. |
| **2. Credential custody (§19.1)** | `connector-credentials-stored-unvalidated.pglite.test.ts` (ciphertext only; rotation and revocation void captured uses; an expired grant is refused with no fallback); `local-provider-gate0.test.ts`; `connector-tenant-isolation.test.ts`; `telemetry-redaction.test.ts`; `tenant-full-export.withheld…`; `adminConsoleSettings.test.tsx`; **new** case (a use is audited by grant, revision and purpose, never the value, and a rotation is a new revision of the same grant; `64e3346363`); **new** case (the tenant's export returns a vault-captured card but neither its key nor the stored ciphertext; `4d99bddc52`) | No single run checks the prompt bundle, outbound body, turn trace and tenant export together for one canary. The use event names no submission or transmittal. An FDA gateway-account transmit writes no per-use event of this kind. |
| **3. Exact-byte approval (§19.2)** | `refused-step-voids-signature.pglite.test.ts` (a one-byte change voids the signature; transmit refused before the wire; `GOVERNED_SIGNATURE_VOIDED` and `TRANSMIT_BLOCKED` audited with both SHA-256s); `submission-gateway-bundle-integrity.test.ts`; `governed-transmit-unapproved.test.ts` | Reapproval after that one-byte change is not asserted. The binding covers the signed leaf manifest, not the final ZIP bitstream. `submission-service.ts` is RIM's, so this is handed to RIM, not edited here. |
| **4. Tenant isolation (§19.3)** | `two-tenant-application-rls.dbtest.ts` (projects, documents, audit_logs, signatures, controls, risks, runs, as `app_service`); `rls-two-tenant-full-schema.contract.test.ts`; `atom-search-tenant-key.dbtest.ts`; `run-control-cross-instance.dbtest.ts`; `report-state-memory-isolation.dbtest.ts`; `poolInstrumentation.integration.test.ts`; **new** `rules-memory-tenant-isolation.dbtest.ts`: standing rules, skill settings, account canon, conversation memory, client memory and the private profile, all forced RLS, none readable, changeable or plantable across tenants as the runtime role; red with RLS disabled on one store; `ec177edd06` | Grants are isolated at the application layer only: no native-role test of `connector_credentials` across tenants. The policies isolate only when `app.rls_enforce='on'` is set on the session, which the runtime pool does under `RLS_ENFORCE=on`, and production requires it. |
| **5. Correction and hard gate (§23)** | `ana-skills-routes.test.ts`, `adminSkills.test.tsx`, `whatAnaRemembers.test.tsx` (a sourced correction is visible and changes the next task); `governedActionApprovalTenantPinned.test.ts` (a model cannot demote a gate); `ana-context-router-objectives-stay-in-their-project.test.ts` (project > company > personal); `poolInstrumentation.integration.test.ts` (private hard gates bound to owner and version) | No "never again" trigger exists: promotion to a gate is an explicit human edit. User-scope hard gates are not in a combined precedence test. Conflict packages are same-scope only. These are product gaps, not test gaps. |
| **6. Classification and routing (§26.1)** | `sensitive-placement-policy.test.ts`, `sensitive-placement-gate.test.ts`, `tenant-placement-boundary.test.ts`, `draft-project-sources.test.ts`, `vault-ingest-storage.test.ts` (unknown tiers up; the highest tier governs primary, fallback and embedding; raw T3 never reaches frontier; tenant labels never relax the floor) | No content-aware classifier: a fresh upload defaults to T2, and saved metadata does the rest. A denial logs no policy version, because `ai_placement_policies` has no version column. |
| **7. Derivative round-trip (§26.2)** | `sensitive-placement-gate.test.ts` `derivativeFixture` (the secret is absent from the sent request, SDK calls, ledger and logs; deterministic merge restores the exact bytes; refused for a missing approval, an expiry, a revocation, a foreign tenant or actor, or a byte change); `org-placement-writer.test.ts` (the map stays encrypted and tenant-local) | Tokenization covers spans a person names: `redaction.ts` says it is not automatic de-identification. A missing map is tested as tampering, not deletion. Local hosting has no qualified weights or PQ. |

## Added by this run

| Commit | Check | What |
|---|---|---|
| `ec177edd06` | 4 | `tests/db/rules-memory-tenant-isolation.dbtest.ts`, 17 cases, on the two-tenant fixture. |
| `d4b82abc94` | 1 | `run-coordination-dispositions.test.ts`. The coordination fixture moves, unchanged, into `__tests__/support/coordination-fixture.ts`. |
| `64e3346363` | 2 | The credential-use audit case in `connector-credentials-stored-unvalidated.pglite.test.ts`. |
| `4d99bddc52` | 2 | The export case in the same file: `exportTenantFull` withholds `connector_credentials.credentials`, and neither the canary nor the stored ciphertext appears in the export. |
| `ce1451297c` | 1 | Six named depth-1 cases in `tool-authorization-rule-zero.test.ts`: `transmit_submission`, `finalize_protocol_document`, `place_into_sequence`, `update_vault_document`, `commit_document_revision`, `check_submission_status`. |

Each was shown failing first:
- check 4, with row security disabled on `client_memory_entries`;
- check 1, with every decision written as `rework`;
- check 2, with the key written into the use event;
- check 2's export case, with `connector_credentials` removed from `EXPORT_WITHHELD_COLUMNS`;
- check 1's named cases, with rule 0's condition disabled in `preHandlerRefusal` (all six fail, with the nine existing depth-1 cases).

The two later cases ran on their own suites after the joined run (40/40 and 26/26), not in a second joined run.

## Open findings, by owner

- **RIM, check 3:** assert reapproval after the one-byte change, and decide whether the binding must cover the final ZIP.
- **S4, this epic, check 1:** a joined child → parent merge → lock case. It needs one fixture holding the coordination tables, the tool wrapper and the authoring approval; today each link has its own.
- **S4, check 2:** one canary across the prompt bundle, outbound body, turn trace and export. The export part is done (`4d99bddc52`).
- **S5, check 2:** a per-use event for gateway-account transmits, naming the submission.
- **Founder decision, check 5:** whether a "never again" correction promotes itself to a gate, or stays a human edit.
- **Founder decision, check 6:** a policy version for `ai_placement_policies`, which needs a migration under RULE 1.
- **Founder decision, check 6:** content-aware classification at ingest.
- **Founder decision, check 7:** automatic de-identification, and qualified local weights with PQ.

# W3b evidence — Part 11 signer, audit-chain verifier, security posture, 2026-09-20

**Rows moved:** D5 (Part 11 evidence) and D6 (security posture), as far as code
and documents can move them without an AWS account, a pen-test vendor or a
SOC 2 auditor. **State after this session:** D5 — KMS-backed signer behind the
existing seam, second signature route deleted, verifier built and proven
locally; **production run of the verifier still owed** (no production exists,
row D1). D6 — policy set, questionnaire and trust statement drafted and
honest; **SOC 2 window, pen test and Anthropic BAA are founder actions**.

## 1. `CONCEPT2CURE_SIGNER_MODE` read for real (D5)

The variable was documented in `.env.example`/`AGENTS.md` and read by no
server code. Now:

- `server/services/signature/signer-mode.ts` — `dev | hmac | kms`, resolved
  once, fired on import. Production **refuses to boot** when unset, `dev`,
  `hmac` without `CONCEPT2CURE_SIGNER_ACCEPT_HMAC=true`, or `kms` without
  `CONCEPT2CURE_SIGNER_KMS_KEY_ID` + region + `AUDIT_HMAC_KEY`. Retired
  literals `hsm_kms`/`hsm_vault` are refused by name. No skip flag exists.
- `server/services/signature/kms-signer.ts` — `KmsOps` abstraction; the SDK
  adapter is tested against the real `@aws-sdk/client-kms` command classes
  with an in-memory RSA KMS (`__tests__/fake-kms.ts`).
- `server/services/signature/payload-signer.ts` — the envelope
  (`{v, mode:'kms', algorithm, keyId, signature, signedInput, publicKeySha256,
  signedAt}`), KMS-Verify verification against the key the *posture* names,
  and offline verification with the published public key.
- Seam wiring: `server/services/ectd/sign-payload-seal.ts` gains
  `signSignPayloadDigest` / `verifySignPayloadSignature` /
  `isKmsSignerConfigured`; `submission-package-orchestrator.ts` stores
  `payloadSignature` **beside** `payloadSeal` and fails resume closed on a
  bad/stripped envelope; `signed-package-export.ts` refuses export the same way
  and reports `signatureVerdict` on the descriptor.
- Where the boot assert fires: on import of `signer-mode.ts`, which the seam
  imports, which the orchestrator and every release-signing route import at
  boot. `server/config/environment.ts` was **not** edited (outside scope); a
  one-line import there would make the gate independent of the route graph and
  is recommended for the control tower.

Tests: `vitest-run.txt` (27 files, 219 tests green, including the upstream
`authEnterprise-signature-verify-tenant` and `signature-content-verification`
suites from commit dddd92c5, which this work builds on and does not touch).

**Unexecuted:** the live KMS path. No AWS credentials exist in this
environment; `loadDefaultKmsOps` has never been called against a real key.
`docs/SOP_KEY_MANAGEMENT.md` §10 lists the founder's IQ steps.

## 2. The second signature route — deleted (D5)

`VAULT_DATA_ROOM_ASSESSMENT_2026-09-05.md` §4.3 names
`POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/signatures`
(`server/routes/c2c/artifacts.ts`). The 2026-09-05 fix put `reverifySigner` in
front of it but left the second substrate: an INSERT into
`concept2cure_signatures` with its own sha256 recipe, no binding basis, no
supersession, signer name from `req.userName || req.userEmail || 'unknown'`.
The route, its schema and its hash helper are removed; a removal note stays in
the file; the GET remains for §11.70 history. No client called it
(`signature-writers-grep.txt`). Pinned by
`server/routes/c2c/__tests__/artifact-signature-route-removed.test.ts`; the
parity test no longer lists the POST.

**Remaining writers, stated honestly** (`signature-writers-grep.txt`):
- `server/services/part11/signature-persistence.ts:308` — the canonical INSERT.
- `server/routes/authoring.router.ts:4727, 6661` — `authoring_signatures`,
  the authoring loop's PIN-based store (own digest, PIN re-auth, not TOTP).
  Consolidating it needs a client change (`AuthoringSignatures.tsx` reads it)
  and a data-model decision; out of this session's scope and reported to the
  control tower.
- `server/routes/c2c/artifacts.ts` status-transition attestation
  (`authenticationMethod: 'session_jwt'`, `secondFactorVerified: false`) still
  writes `concept2cure_signatures` on approve/lock. It is not a signing route
  and was not named by the assessment, but it is a session-only "signature"
  and should be migrated onto the governed sign action or removed.

## 3. Audit-chain verifier (D5)

`npm run ops:verify-audit-chain` (`scripts/ops/verify-audit-chain.mjs`, run
under tsx so it shares the writers' TypeScript verifiers). Walks
`audit.tamper_proof_log` (chain + HMAC signature via the new exported
`verifyTamperProofLogRows`, which the service's `verifyChain` now also calls —
one recipe), `public.audit_logs` (`verifyAuditChain` + seals) and
`public.audit_events` (trigger expression recomputed in SQL per org, + seals).
Prints counts and the first break; exit 0 ok / 1 broken / 2 unverifiable.

- `verify-audit-chain-local.txt` / `.json` — run against the local database
  (all three tables present, 0 rows, verdict OK, exit 0).
- `verify-audit-chain-fail-proof.txt` — produced by
  `verify-audit-chain-fail-proof.mts` in this folder: inside one transaction,
  3 rows seeded into each table with the writers' own code, verified OK; then
  one row corrupted per table (immutability trigger disabled inside the same
  transaction as superuser) and the verifier reports BROKEN with the sequence /
  id and reason each time; savepoints rolled back, verdict OK again;
  ROLLBACK; row counts back to 0/0/0. No corrupted row was left behind.

**Owed:** the same command against production, once D1 exists.

## 4. Security posture documents (D6)

- `docs/security/policies/` — eight DRAFT policies (IS-001 … AI-008), every
  control marked Implemented / Partial / Planned with a file path.
- `docs/security/SECURITY_QUESTIONNAIRE_SIG_LITE.md` — 45 answers, each
  grounded in a path; SOC 2, pen test, ISO, insurance answered "No".
- `docs/security/TRUST_STATEMENT.md` — one page.
- `docs/SOP_KEY_MANAGEMENT.md` v0.2 — rewritten against the code.
- `docs/security/DEPENDENCIES.md` — justification for `@aws-sdk/client-kms`
  (pinned 3.1106.0 to match client-s3; ledger resealed, finding set unchanged).

## 5. Quality gates

- `eslint-ratchet.txt` — per-file warning counts HEAD vs now: export file
  1→0, artifacts.ts 29→27, others unchanged; new files 0.
- `tsc-filtered.txt` — no type diagnostics in touched files.
- `changed-files.txt` — the full change list.

## Files in this folder
| File | What it proves |
|---|---|
| `verify-audit-chain-local.txt`, `.json` | verifier runs against the local DB, exit 0 |
| `verify-audit-chain-fail-proof.txt`, `.mts` | verifier catches one corrupted row in each of the three tables; nothing persisted |
| `signature-writers-grep.txt` | every remaining signature INSERT; no caller of the removed POST |
| `vitest-run.txt` | 27 files / 219 tests green |
| `eslint-ratchet.txt`, `tsc-filtered.txt` | lint ratchet respected; typecheck clean |
| `changed-files.txt` | change inventory |

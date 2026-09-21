# WB — VSR-001 F-3 and F-9 closed: execution record

**Row moved:** D4 (validation package) / D5 (Part 11 evidence) — two `high`
findings in `docs/validation/VSR-001-VALIDATION-SUMMARY-REPORT.md` §4 that the
report says cannot be accepted for a Part 11 claim (F-3) or under CLAUDE.md
Rule 2 (F-9).
**Status:** code fixed, unit-tested, seen failing on the defect, and executed
live against a local server with no AI provider. The OQ protocols
(`tests/validation/oq/qms/run.mjs` OQ-QMS-05/06,
`tests/validation/oq/submission-readiness/run.mjs` OQ-SRDY-03) still encode the
old expectations and were outside this worker's file set — see *Open* below.

| Field | Value |
|---|---|
| Executed at (UTC) | 2026-09-21T01:00Z |
| Base URL | http://127.0.0.1:5500 (own server, `ALLOW_DEV_AUTH=1`, no AI provider) |
| Branch | concept2cure-v2 (uncommitted working tree; no git commands run by this worker) |
| Identities | user 1 jonmichaelpsmith@gmail.com (author, org 2 admin); user 4 jm.smith@concept2cure.pro (approver, org 2 admin) |
| /readyz at start | 503 `anaState: no_provider` — `F-9-dispatch-qc-deterministic/00-readyz-no-provider.json` |

Local-DB setup for the run (dev database only): user 4 was given a known
password hash so the re-authentication could be exercised; its org role was
set to `member` for step 05 and restored to `admin` immediately after
(`organization_users` shows both users `admin` at the end). The credential is
redacted in the captured requests.

## F-3 — QMS document approval is now an electronic signature

`POST /api/mdx/qms/documents/:id/approve` requires
`{ password, mfaToken?, meaning: 'APPROVED', reason, effectiveDate? }` and:

1. checks the signer's org role against the platform signing-authority policy
   (`isSigningAuthorized`, §11.10(g)) — **before** the credential, so the route
   is not a password oracle;
2. re-authenticates with `verifySignerCredentials` (password, and TOTP when MFA
   is enabled — §11.200); the signature row records only the factors verified;
3. on one transaction: locks the row, refuses self-approval (§11.10(d)), computes
   the §11.70 content digest, flips the document to `effective`, writes the
   chained `audit_logs` + `c2c_ana_actions` pair (`recordGovernedAction`) and
   exactly one `electronic_signatures` row through the single write path
   (`persistGovernedActionSignature`).

Credential choice: password, not PIN — the PIN path is canonical only for the
authoring loop's separate `authoring_signatures` store; the password path is
what every `electronic_signatures` writer (governed `sign`, RBM approvals) and
the client's GovernedActionSignoff use. Rationale in
`server/services/qms/document-approval-signature.ts` header.

| Step | Action | Expected | Observed | Evidence |
|---|---|---|---|---|
| 01 | user 1 creates SOP-WB-… | 201 draft v1.0 | 201, doc 16, author_id 1 | `01-create-sop-as-user1.json` |
| 02 | user 4 approves with `{}` | 400 naming the missing components | 400 `ESIGNATURE_COMPONENT_MISSING`; message names password, meaning 'APPROVED', reason; `fieldErrors` = meaning, password, reason | `02-empty-body-400.json` |
| 03 | wrong password | 401 | 401 `PASSWORD_INVALID` | `03-wrong-password-401.json` |
| 04 | meaning `REVIEWED` | 400 | 400, fieldErrors.meaning names 'APPROVED' | `04-wrong-meaning-400.json` |
| 05 | user 4 as org `member` | 403 | 403 `QMS_NO_SIGNING_AUTHORITY` | `05-member-role-403.json` |
| 06–07 | user 4 creates an SOP and approves it | 403 self-approval | 403 `QMS_SELF_APPROVAL`; no signature row for that document | `06-…`, `07-self-approval-403.json`, `10-database-rows.txt` |
| 08 | user 4 approves doc 16 with password + APPROVED + reason | 200 effective, one signature | 200; status effective, approver_id 4, `meta.auditTrail {persisted, chained}`, `meta.signature` with id, actionId, auditId, sha256Chain, boundPayloadDigest, bindingBasis | `08-signed-approval-200.json` |
| 09 | approve again | 409 | 409 `QMS_INVALID_STATE` | `09-re-approve-409.json` |
| 10 | database | exactly one `electronic_signatures` row bound to the document | 1 row: `signed_target qms-document:16`, `signature_type qms-document-approval`, `signature_meaning APPROVED`, `authentication_method password`, `binding_basis qms-document-version-content-sha256`, `bound_payload_digest 2510bf27…`; `audit_logs` `c2c.work.approve` with the reason; `c2c_ana_actions` `approve executed`; `metadata.approval` on the document carries the same digest and `twoPersonRule: enforced` | `10-database-rows.txt` |
| 11 | §11.70 re-derivation | digest recomputable from the stored row | `recomputedFromStoredRow` == signature == document, `match: true` | `11-digest-recomputed.json` |

## F-9 — dispatch QC verdict is deterministic; the model narrates

`POST /api/submissions/:id/dispatch-qc` now returns
`{ clearedToDispatch, blockers, warnings, checklist, verdictSource, narrative, narrativeUnavailable }`
where the first five come from `computeDispatchQcVerdict` — with `sequenceId`,
the verdict **is** `assessSequenceDispatchReadiness(...).gate`, the same composed
gate freeze/dispatch enforce; without one, the pure `evaluateDispatchGate` over
the supplied counts plus a warning naming what was not checked. `narrative` is
model prose under a fixed advisory label, or `null` with `narrativeUnavailable`
when no provider is enabled or the call fails. The model's own verdict field is
never read.

| Step | Action | Expected | Observed | Evidence |
|---|---|---|---|---|
| 01 | GET sequence 18 dispatch-readiness | deterministic gate | `cleared: false`, 3 blockers | `01-dispatch-readiness-get.json` |
| 02 | POST dispatch-qc with sequenceId 18, client zeros | 200; verdict == GET gate; narrative null | 200; `clearedToDispatch false`, identical 3 blockers, `verdictSource assess-dispatch-readiness`, 7-item checklist, `narrative: null`, `narrativeUnavailable.code PROVIDER_UNAVAILABLE` (was 502 INVALID_AI_RESPONSE in OQ-SRDY-03) | `02-dispatch-qc-with-sequence.json` |
| 03 | POST dispatch-qc without sequenceId | 200; counts-only gate with a warning | 200; `verdictSource dispatch-gate`, warning names the unrun sequence-level checks, `narrative: null` | `03-dispatch-qc-counts-only.json` |

Verdict identity with and without a provider is pinned by unit test (a real
provider was not available in this environment; the test drives the gateway
seam with a stub that returns a contradicting model verdict).

## Gates

- `unit-tests.txt` — 27 tests across the three new files, all pass; the seven
  pre-existing test files touching the two routers and dispatch-qc (112 tests)
  also pass.
- `fail-proofs.md` — each new test file seen failing on the defect it catches
  (signature write removed; empty body accepted; model verdict deciding).
- `eslint.txt` — 0 errors; 3 warnings, all pre-existing (`max-lines` on both
  routers, and the `complexity` warning on the revise handler that predates
  this change).
- `typecheck.txt` — `npm run typecheck:fast`; the only errors are the five
  pre-existing ones in `server/services/signature/__tests__/kms-signer.test.ts`,
  untouched here.

## Files changed

- `server/routes/mdx-qms.ts` — approve handler replaced (signed), header line updated.
- `server/services/qms/document-approval-signature.ts` — new: the signed-approval composition.
- `server/services/submission-ai/submission-ai-service.ts` — `runDispatchQc` refactored; `computeDispatchQcVerdict` exported.
- `server/routes/submissions.ts` — dispatch-qc route hands the sequence assessment to the service.
- Tests: `server/routes/__tests__/qms-document-approval-signature.test.ts`,
  `server/services/qms/__tests__/document-approval-signature.test.ts`,
  `server/services/submission-ai/__tests__/dispatch-qc-deterministic.test.ts`.

## Open

- The OQ runners still assert the old behaviour (OQ-QMS-05 approves with only
  `effectiveDate`; OQ-QMS-06 treats an accepted empty body as the failure;
  OQ-SRDY-03 tolerates a gateway error as a deviation). They need re-execution
  with a second signer identity (the two-person rule refuses the author) and
  the new body; not in this worker's file set.
- No client surface calls the QMS approve endpoint today (`QualityModule.tsx`
  reads the register only), so no request-shape change was needed; when an
  approval control is built it must go through `GovernedActionSignoff`
  (password + meaning + reason) rather than a new dialog.
- `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx` still
  labels the button "Run dispatch QC (AI advisory)" and does not render
  `narrative`; the response is shape-compatible so nothing breaks, but the copy
  now understates what it shows. Not in this worker's file set.
- `AnaToolExecutor` `dispatch_qc_check` passes no assessment and therefore gets
  the counts-only verdict with the explicit warning; wiring it to
  `assessSequenceDispatchReadiness` when a sequence id is supplied is a
  follow-up.
- VSR-001 §4 rows F-3 and F-9 should be re-dispositioned by the validation
  owner against this evidence; this worker did not edit the VSR.

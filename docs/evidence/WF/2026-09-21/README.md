# WF evidence — 2026-09-21 — VSR-001 P-1, P-2 and the OQ-SRDY-03 / OQ-QMS-05/06 expectations that product fixes overtook

**Row moved:** D4 (validation package). Worker WF, protocol side only. Scope touched: `tests/validation/lib/{harness,credentials,qms-digest}.mjs`, `tests/validation/oq/{authoring,submission-readiness,qms,submission-center}/run.mjs`, `docs/validation/OQ-003/004/005/006`, VSR-001 §9 (appended; §1–§8 untouched), the regenerated records `docs/evidence/W3/2026-09-20/OQ-AUTHORING/`, `OQ-SUBMISSION-READINESS/`, `OQ-QMS/`, and this folder. No `server/**` or `client/**` file was edited; no git command was run; TM-001 was not regenerated (control tower).

## Environment

| Field | Value |
|---|---|
| Server | `npx tsx server/index.ts`, port **5900**, `.env` + `ALLOW_DEV_AUTH=1 SKIP_DB_STARTUP_TEST=true LAUNCH_SCOPE_ENFORCE=on`; `/readyz` 503 `anaState: no_provider` (database ok, schema ok). No AI provider, no Redis. Stopped by pid at the end. |
| Database | PostgreSQL local `clinicalsage` (`DATABASE_URL` role `c2c`); superuser used for the read-only inspection queries in `qms-signature-rows.txt` only. Server log: 0 `permission denied` lines. |
| Identities | run identity user 1 `jonmichaelpsmith@gmail.com` (dev-login; the author of every fixture); signer user **42** `oq-signer@validation.local` (org 2, role admin) — provisioned for this local execution, see below. |
| Runner env | `VALIDATION_BASE_URL=http://localhost:5900`, `OQ_SIGNER_EMAIL`, `OQ_SIGNER_PASSWORD`, `OQ_AUTHOR_EMAIL=jonmichaelpsmith@gmail.com` (password held only in the session scratchpad, never in the tree). |

## Credential provisioning (local only, redacted)

The signed steps need an identity that holds a password; dev-login issues none. The second user was created through the product's own seeding script — `scripts/seed-admin.mjs` with `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` from the environment (it bcrypt-hashes the password, upserts `users`, and adds an `admin` membership on the `concept2cure` organisation) — not by a hand-written SQL hash. Transcript: `provision-signer.transcript.txt` (password replaced by `[REDACTED]`; the script echoes it to stdout, which is why the transcript is filtered). No existing user's password was changed. **Deviation to record for the local run:** the seeding script is a laptop-only path (CLAUDE.md Rule 1 corollary) that writes the user row directly rather than through the registration route + an admin invitation; on staging the signer is a real account created through the product's user administration. The credential was checked for leakage: `grep` of the password over `docs/` and `tests/` finds nothing; every `password` key in the step records is `[REDACTED]` (harness redaction).

## Protocol changes

| Item | Change | File(s) |
|---|---|---|
| P-1 (OQ-003) | New **OQ-AUTH-11a**: freeze over the open OQ-AUTH-09 comment → 409 `DOCUMENT_NOT_SETTLED`, nothing frozen (negative case kept). New **OQ-AUTH-11b**: `PATCH /api/authoring/comments/:id {status:"resolved", resolution_note}` → 200, `resolved_by` = actor, `resolved_at`; audit event `comment_resolved`. OQ-AUTH-11 now freezes the settled document. The `acknowledgeUnresolved` flag is never sent. OQ-AUTH-15/16 moved **before** the freeze (a FROZEN document refuses every edit-class route with 409, which had answered 15 for the wrong reason). | `tests/validation/oq/authoring/run.mjs`, `docs/validation/OQ-003-AUTHORING.md` v0.2 |
| P-2 (OQ-006) | **OQ-QMS-05** credentialed: signer from `OQ_SIGNER_EMAIL`/`OQ_SIGNER_PASSWORD` (`tests/validation/lib/credentials.mjs`; deviation *not executed — credential not supplied* when absent; deviation when the signer is the author); approve A `{password, meaning:'APPROVED', reason, effectiveDate}` → 200 with `meta.signature`, re-approve → 409 `QMS_INVALID_STATE`. New **05b**: `GET /api/part11/signatures/by-target` → exactly one row; §11.70 digest recomputed by `tests/validation/lib/qms-digest.mjs` (a re-implementation of `computeQmsDocumentContentDigest`, recorded as such) from `GET /api/mdx/qms/documents/:id`. **06** → 400 `ESIGNATURE_COMPONENT_MISSING` with the three field errors. New **06b** wrong password → 401; **06c** self-approval (signer creates SOP C) → 403 `QMS_SELF_APPROVAL`; **06d** signed approval of SOP B (fixture for 09/10). Harness gained `ctx.apiAs(session)` so the second identity's requests are recorded on the step with `identity`. | `tests/validation/oq/qms/run.mjs`, `tests/validation/lib/{harness,credentials,qms-digest}.mjs`, `docs/validation/OQ-006-QMS.md` v0.2 |
| OQ-SRDY-03 (OQ-005) | Expectation rewritten to the deterministic contract: 200 `{clearedToDispatch, blockers, warnings, checklist, verdictSource:'assess-dispatch-readiness', narrative, narrativeUnavailable}`; verdict and blockers must equal `GET …/dispatch-readiness` gate; no provider → `narrative null`, `narrativeUnavailable.code PROVIDER_UNAVAILABLE`, recorded as *narrative: not executed — no provider*, step **pass**. A gateway error is now a fail. | `tests/validation/oq/submission-readiness/run.mjs`, `docs/validation/OQ-005-SUBMISSION-READINESS.md` v0.2 |
| OQ-SUBC-08 (OQ-004) | Same credential mechanism (`POST /api/c2c/actions/sign` re-authenticates with the password): same env-var treatment; expectation made honest — sign 200 + one signature row, then freeze of the never-validated sequence refused 409 `INVALID_STATE` (state machine: `assembling` → `frozen` is not a transition), status unchanged. **The OQ-004 record under W3 was not regenerated** (out of this worker's re-run set); the step was exercised into a scratchpad root only. | `tests/validation/oq/submission-center/run.mjs`, `docs/validation/OQ-004-SUBMISSION-CENTER.md` (step row + §4 note) |

## Execution — before / after (records regenerated under `docs/evidence/W3/2026-09-20/`)

| Protocol | Steps | Pass | Fail | Deviation | Not executed | Before (WD, VSR §8.2) | Transcript |
|---|---|---|---|---|---|---|---|
| OQ-003 Authoring | 24 | **19** | 3 | 1 | 1 | 22 steps: 16 / 3 / 1 / 2 | `oq-run2-authoring.transcript.txt` (run 1 in `oq-run1-…` had 15/16 after the freeze; superseded) |
| OQ-005 Submission Readiness | 9 | **9** | 0 | 0 | 0 | 8 / 1 / 0 / 0 | `oq-run1-authoring-srdy-qms.transcript.txt` |
| OQ-006 QMS | 20 | **20** | 0 | 0 | 0 | 16 steps: 13 / 2 / 0 / 1 | `oq-run3-qms.transcript.txt` (final runner after a lint-driven refactor; run 1 gave the same 20/0/0/0) |
| OQ-004 Submission Center (scratchpad only) | 15 | 15 | 0 | 0 | 0 | 13 / 1 / 1 / 0 (baseline record kept) | `oq-subc-scratch.transcript.txt` |

Step-level, OQ-003: 11a **pass** (409 `DOCUMENT_NOT_SETTLED`, openComments 1), 11b **pass** (resolved by the actor, audit `comment_resolved`), 11 **pass** (frozen v1.0, `contentHash`, second freeze 400), 12 pass; **13 FAIL** — both e-sign requests (wrong PIN, bad meaning) answered 409 `AUTHORING_DOCUMENT_IMMUTABLE` on the FROZEN document; 14 not-executed behind it; 15 **FAIL** (F-10 reproduces: 200 `degraded:true, source:"template"` with a template draft, no provider); 16 deviation (no provider); 17b FAIL (F-6, unchanged).
OQ-005: OQ-SRDY-03 pass — `clearedToDispatch=false` == gate, 3 blockers identical, `verdictSource=assess-dispatch-readiness`, checklist 7, narrative not executed (no provider). OQ-SRDY-07 now passes (F-8 fixed in the product between the WD run and this one).
OQ-006: see `docs/validation/OQ-006-QMS.md` §3; signature ids 6 (SOP A, doc 25) and 7 (SOP B, doc 27), 0 rows for SOP C (doc 28).

## Signature row and digest recomputation

- `qms-digest-recomputation.json` — the runner's own recomputation (OQ-QMS-05b): `recomputed` = `reportedBySignature` = `storedOnDocument` = `366a5a9c…9c80`, `match: true`, with the exact digest input.
- `qms-signature-rows.txt` — superuser read-only queries: the two `electronic_signatures` rows (`signature_type qms-document-approval`, `APPROVED`, signer 42, `authentication_method password`, `binding_basis qms-document-version-content-sha256`, `bound_payload_digest` equal to the document's `metadata.approval.contentDigest`, `is_valid t`), count per target 1 / 1 / 0, the `audit_logs` `c2c.work.approve` rows and the `c2c_ana_actions` `approve … executed` rows for both documents, and the `ectd-sequence` signatures written by the scratchpad OQ-SUBC-08 runs (`binding_basis ectd-sequence-leaf-manifest-sha256`).

## Verified by making it fail — `failproof-credential-gate.txt`

Two OQ-006 runs into scratchpad roots (not under W3): (A) with `OQ_SIGNER_*` unset → OQ-QMS-05 **deviation** *not executed — credential not supplied*, 05b/06b/06c/06d/07/09 **not-executed**, 06 (the 400 negative case) still passes (13 pass, 1 deviation, 6 not-executed); (B) with `OQ_SIGNER_EMAIL` = the author → OQ-QMS-05 deviation naming the two-person rule, same dependents not-executed. No credentialed step can pass without a supplied credential. `harness-selftest.txt`: the harness self-test still shows false expectation → fail, deviation → deviation, dependent → not-executed, thrown → fail.

## Gates

- `validation-lint.txt`: `npm run validation:lint` → **0 errors**, 28 warnings, all pre-existing classes (`no-console`, `max-lines`, `complexity` on the harness `step`); the two complexity warnings my first QMS runner introduced were removed by splitting the assertions into helpers before the final run.
- `eslint-warning-ratchet.txt`: `node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD` → net **−2** across the files changed since HEAD; no file of mine appears in the delta (the −2 is `server/routes/authoring.router.ts`, another worker's).

## Product defects found (not fixed here — outside this worker's file set)

1. **New — e-sign refused on a FROZEN document.** `POST /api/authoring/docs/:id/e-sign` → 409 `AUTHORING_DOCUMENT_IMMUTABLE` ("Document status FROZEN does not permit this action"), both for a wrong PIN and for a valid one with a bad meaning (OQ-AUTH-13, `steps/OQ-AUTH-13.api-1.json`, `api-2.json`). Cause: `server/middleware/authoringObjectAuthorization.ts:31` — `actionFromPath` maps `freeze|sign|submit|approve|approval` to `approve` (allowed on immutable documents) only as a whole path segment; the segment here is `e-sign`, so the request is classed `edit` and `documentStatusAllowsAction` refuses it. The route itself (`authoring.router.ts:4571`) binds the signature to the frozen snapshot (`covered_freeze_version`, `covered_content_hash`), so the guard contradicts the route's design and no signature can be applied to a sealed document. Was masked in every earlier run (freeze never succeeded). Proposed as F-12 in VSR-001 §9.
2. **F-10 reproduces** (OQ-AUTH-15): the AI-draft route returns a template draft with no provider.
3. **F-6 reproduces** (OQ-AUTH-17b).
4. Observation (OQ-006): after `revise` to v2.0 draft, `approver_id`/`approved_at` are cleared but `metadata.approval` (reason, meaning, v1.0 content digest) stays on the row (`qms-signature-rows.txt`, doc 25).

## Left open

- OQ-AUTH-13/14 stay unqualified until the e-sign classification is fixed; re-execute OQ-003 afterwards.
- OQ-004 record: the credentialed OQ-SUBC-08 is written and exercised only into the scratchpad; the W3 record is still the baseline — re-run `npm run validation:oq -- submission-center` with `OQ_SIGNER_*` set when the control tower next regenerates records.
- TM-001 regeneration (control tower). Staging execution of the credentialed steps with a real second account.

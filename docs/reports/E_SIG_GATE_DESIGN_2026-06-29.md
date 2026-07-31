# E-Signature Gate — `package.sign` Step Design (Path-to-GA §C.11)

**Status:** Design doc only. No code changes. Human review required before workflow implementation.
**Author:** Path-to-GA §C.11 workstream
**Date:** 2026-06-29
**Pattern:** Move 1 / Phase 3 — design first, ship after human review
**Predecessors:**
- `docs/reports/GA_GAP_AUDIT_2026-06-10.md` (§11.50 manifestation closure)
- `docs/reports/CSR_JOB_STATE_SCHEMA_DESIGN_2026-06-28.md` (awaiting-async pattern precedent)
- `server/services/part11ComplianceService.ts` (existing RSA-SHA256 signing surface)
- `server/services/submission-package-orchestrator.ts` (orchestrator with no signature gate)

---

## A. Problem Statement

The submission-package orchestrator's `ORDERED_STEPS` today ends with `… → m1.admin → package.assemble → package.validate`. There is no `package.sign` step between validation and any future `package.transmit` (the transmit step itself does not yet exist as an orchestrator step — `server/services/submission-gateways/fda-esg.ts` and `server/routes/esgSubmissionRoutes.ts` invoke ESG transport directly, bypassing the orchestrator). As a result, a submission can be assembled, validated, and dispatched to FDA ESG with **no** 21 CFR Part 11 §11.50 (signature manifestation) or §11.70 (signature/record linkage) gate. The Part 11 service (`part11ComplianceService.createElectronicSignature`) is fully implemented (RSA-SHA256 + bcrypt credential re-verify + `electronic_signatures` row + `device_audit_trail` row), but nothing on the submission pipeline calls it as a prerequisite for transmission. This is a regulatory blocker for GA.

---

## B. Design — Where the New Step Fits

### B.1 Position in `ORDERED_STEPS`

Insert `package.sign` **after `package.validate` and before the (future) `package.transmit` step**:

```
… m1.admin
  → package.assemble
  → package.validate
  → package.sign       ← NEW
  → package.transmit   ← future (out of scope for this doc)
```

Rationale for position:
- Must follow `package.validate` because we sign the *gateway-ready* package (signing a not-gateway-ready package would let a customer sign garbage and ship it after a regenerate).
- Must precede `package.transmit` because §11.70 binds the signature to the **as-transmitted** record; transmitting before signing would allow a record to leave the tenant boundary unsigned.

### B.2 New `STEP_DEPENDENCIES` edge

```ts
'package.sign': ['package.validate'],
```

Single edge. `package.transmit` (when added) will carry `['package.sign']`. We do **not** make `package.sign` depend on `package.assemble` — `package.validate` already depends on `package.assemble`, so transitive closure covers it; adding a redundant edge invites graph drift.

### B.3 New `StepStatus` value: `awaiting-signature`

`StepStatus` is widened to:

```ts
type StepStatus =
  | 'pending'
  | 'running'
  | 'awaiting-async'
  | 'awaiting-signature'   // NEW
  | 'complete'
  | 'failed'
  | 'stale'
  | 'skipped';
```

**Semantics.** `awaiting-signature` means the orchestrator has reached `package.sign`, has computed and persisted the *payload digest to be signed* (see B.5), and is now waiting for a human signer to invoke the separate signing route (see §C). It is **not terminal** — identical lifecycle to `awaiting-async`: the run sits at this status until resumed.

**Why a distinct status (not reuse `awaiting-async`).**
- Different actor: `awaiting-async` waits on a background worker (csr-job-runner). `awaiting-signature` waits on a *human credential re-verification* — a fundamentally different operational/SLA category.
- Different telemetry: ops dashboards page on long `awaiting-async` (worker stuck); long `awaiting-signature` is normal (signer is at lunch) and should never page. Two statuses keeps the alert thresholds clean.
- Different resume readiness check: `awaiting-async` polls `getCSRBuildJobStatus`. `awaiting-signature` polls `electronic_signatures` for a row matching `(documentId=submissionId, signaturePurpose='submission-release', verificationStatus='valid')`.

**Persistence.**
- Per-step status: written to the existing `submission_orchestrator_steps.status` TEXT column. **No migration needed** — migration 0018 line 47 (per the orchestrator file comment at the `StepStatus` declaration) has no CHECK constraint on this column.
- Run-level status: the run-level enum carries a CHECK constraint. Following the precedent of `migrations/20260629_orchestrator_awaiting_async_status.sql`, we add a sibling migration `migrations/2026XXXX_orchestrator_awaiting_signature_status.sql` that widens the run-level CHECK to include `'awaiting-signature'`. The `OrchestratorRun.status` TypeScript union is widened correspondingly.

### B.4 The signing call site

The orchestrator step **does not** invoke `createElectronicSignature` directly. The orchestrator step's only job is:

1. Compute the **payload digest** (see B.5).
2. Persist the digest on the step's `outputRef` as JSON: `{ payloadDigest, manifestVersion, awaitingSince }`.
3. Transition the step to `awaiting-signature` and the run to `awaiting-signature`.
4. Return.

When the step is resumed (via `runOrchestrator(inputs, { resumeRunId })`), the resume path verifies a matching signature row exists (see B.6), and if so transitions the step to `complete` and runs `package.transmit` (when implemented).

The actual `createElectronicSignature` call happens in a **separate route** invoked by the UI when the human signer authenticates (see §C).

### B.5 The signed payload — what gets digested

The signature must bind to **the exact bytes that will be transmitted**. Concretely, the payload digest is computed over the canonical concatenation of:

1. **The assembled leaf manifest's content digest.** `outputs.assembly.leaves` is a deterministic list. _Update (post-2026-07): the manifest is now produced by the REAL packager (`assembleRealPackage` via `assembleForValidation`) for the 12 packager-buildable regions — each leaf carries an MD5 of its rendered PDF bytes — and by the `buildDerivedManifest` fallback (the former `buildLeafManifestFromSections`) only for regions the packager cannot build._ We compute `sha256(JSON.stringify(leaves))` (canonical key order — the manifest is built in deterministic order from `composeFullModule3`, and `assembleRealPackage` is byte-deterministic).
2. **The validator outcome digest.** `sha256(JSON.stringify({ gatewayReady, hardenedScore, summary }))` from `outputs.validation` — so the signature binds to the validator's go/no-go call, not just the bytes. A re-validate that flips `gatewayReady` invalidates the signature.
3. **The submission identity tuple.** `applicationNumber | sequenceNumber | region | submissionType` from `outputs.assembly` — so a signature for sequence 0000 cannot be replayed onto sequence 0001.

Final `payloadDigest = sha256(leafManifestDigest || validatorDigest || submissionIdentityCanonical)`.

**Why not the eCTD backbone XML.** The backbone XML (`index.xml` / `us-regional.xml`) was historically generated *during* `package.transmit` and so was not a stable artifact at `package.sign` time; the leaf manifest + validator outcome + identity tuple was the stable, post-`package.validate` snapshot that §11.70 binds to the record. _Update (post-2026-07): the real packager now generates the backbone during `package.assemble` and exposes it as `outputs.assembly.backboneXml`, so it IS available at sign time. `computeBoundPayloadDigest` already supports an optional `backboneXml` component, but the sign paths still pass `undefined` deliberately — binding it now would flip the drift digest for the derived-manifest fallback (which has no backbone) and is deferred until the fallback is retired. **Open question OQ-5** remains open on this transition._

### B.6 Verification on resume

> **Update (post-2026-07): hydrate, don't re-derive.** The original design (steps
> 1–2 below) RE-DERIVED the package from source on resume and compared digests.
> That is non-reproducible under `useAI` (AI-refined narratives cannot be
> regenerated byte-for-byte) and fragile to input JSON key-order, so a
> legitimately-signed run would fail on resume with a **false**
> `signature_payload_drift`. The sign step now persists the exact signed package
> (leaf manifest + validator outcome + backbone) in `step.outputRef.signedSnapshot`,
> and resume **hydrates** that frozen record. The digest is recomputed from the
> snapshot (via `computeBoundPayloadDigestFromComponents`) purely as an integrity
> guard — a mismatch now means the *stored snapshot* was corrupted
> (`signature_snapshot_integrity_failure`), not that source drifted. This is the
> correct §11.70 semantics: the signature binds the record that was approved, and
> release ships that record, not a re-derivation. Runs suspended before this
> change carry no snapshot and fall back to the legacy re-derive path (steps 1–2).
> See `server/services/__tests__/sign-payload-snapshot.test.ts` and
> `docs/runbooks/ectd-signature-payload-deploy-boundary.md`.
>
> The snapshot is **self-contained**: it stores the full identity tuple
> (`submissionId`, `organizationId`, `applicationNumber`, `sequenceNumber`,
> `region`, `submissionType`) plus the backbone, and the resume integrity
> recompute draws every digest component from the snapshot — so all of the frozen
> record is covered, not just leaves + validator outcome. A resume whose call
> identity differs from the signed snapshot is reported as
> `signature_resume_identity_mismatch` (distinct from record corruption). The
> backbone is now bound into the digest (the OQ-5 deferral is resolved for the
> real-packager path; fallback regions have no backbone and omit it consistently).
>
> **Residual authenticity gap (GATES resume route-wiring).** The integrity guard
> proves the snapshot is *internally consistent* with the digest, but both live in
> the mutable `submission_orchestrator_runs.steps` JSONB column. An adversary with
> DB write to that column could replace the snapshot AND recompute a matching
> digest, then have a legitimate signer bind a real §11.70 signature to the forged
> record (the signer is shown a digest, not the manifest). The legacy re-derive
> path resisted this because it re-anchored to source; the hydrate path does not.
> This requires DB-level write privilege (a very high bar — such an adversary can
> already forge signature rows directly), and the resume path is **not yet
> route-wired** (test-only today), so it is latent. Before the resume path is
> exposed to production, the snapshot must be anchored to something the
> steps-column writer cannot forge — either (a) the signer attests to the actual
> manifest/backbone hash they were shown at sign time (content attestation in the
> signing UX), or (b) the snapshot digest is HMAC'd with a server-side secret /
> mirrored into the append-only ledger (`submission_orchestrator_steps`, which has
> the immutability trigger) and cross-checked on resume. Tracked as an OQ-5
> follow-up; do not route-wire `runOrchestrator(_, { resumeRunId })` for the
> release-signature flow until it lands.

When `runOrchestrator(inputs, { resumeRunId })` is invoked and finds `package.sign` in `awaiting-signature` (legacy, pre-snapshot runs):

1. **Re-compute** the `payloadDigest` from the current `outputs.assembly` and `outputs.validation` (loaded from the persisted run). This catches the case where any upstream step has been re-run and produced different bytes since the signer signed (regenerate race — risk R-2).
2. **Read back** the persisted digest from `step.outputRef`. If the recomputed digest **does not match** the persisted digest, transition `package.sign` to `failed` with error `signature_payload_drift` — the run cannot recover; the user must re-run from the changed upstream step, which produces a fresh `awaiting-signature` and requires re-signing.
3. **Look up** the signature row: `SELECT … FROM electronic_signatures WHERE document_id = $submissionId AND signature_purpose = 'submission-release' AND signature_hash = $payloadDigest AND verification_status = 'valid' AND organization_id = $orgId ORDER BY signed_at DESC LIMIT 1`. The `signature_hash` match is the load-bearing check: it proves the signer signed *this exact payload*, not some prior version.
4. **Call** `part11ComplianceService.validateElectronicSignature(signatureId, submissionId)` for the integrity + expiry check (it already exists; no new code there).
5. If valid: transition step to `complete`, persist signer attribution on `step.outputRef`, run downstream steps. If not found / invalid: leave the step in `awaiting-signature` and return — the caller polls again.

The orchestrator never asks the user for their password. The orchestrator only verifies that a valid signature row exists for the exact payload digest it computed. Credentials live exclusively in the signing route (§C).

---

## C. `OrchestratorInputs` Changes and the Signing Route

### C.1 No new `signerId` on `OrchestratorInputs`

Argued against. Reasons:

1. **JWT identity drift.** The orchestrator entry point receives `inputs.userId` for Part 11 attribution on AI steps (m3.refine, csr.draft-narrative). Reusing it as the signer would conflate "actor who started the orchestrator" with "actor who signed the release" — these are routinely different humans (RA Associate runs the build; QA Director signs). Forcing them to be the same human is a workflow regression.
2. **Credential proximity.** Passing a `signerId` plus a password through the orchestrator entry point widens the password's blast radius (logs, error messages, retries). The Part 11 service already takes the password at the signing call site and re-verifies via bcrypt; we keep it there.

### C.2 Add a separate route: `POST /api/submissions/:id/sign-release`

**Out of scope for this design doc (implementation only), but the contract:**

- **Auth:** JWT (existing middleware). `req.user.id` is the signer — never trusted from the body.
- **Body:** `{ runId: string, password: string, signatureReason: 'submission-release', signatureMeaning: string }`.
- **Pre-flight:** Load the run (`getRun(runId, req.user.organizationId)`), verify the step `package.sign` is in `awaiting-signature` for this run, recompute the `payloadDigest` from `outputs.assembly` + `outputs.validation`, compare to `step.outputRef.payloadDigest`. Refuse on drift.
- **Sign:** Call `part11ComplianceService.createElectronicSignature({ userId: req.user.id, organizationId: req.user.organizationId, documentId: submissionId, documentType: 'submission-release', signatureReason: 'submission-release', signatureMeaning, password })`. The service re-verifies credentials (bcrypt) before persisting.
- **Post:** Update the `electronic_signatures` row's `signature_hash` to the orchestrator's `payloadDigest` (overriding the service's default-computed hash) so the resume-path lookup in B.6.3 can find it deterministically.

Open question OQ-6 covers whether to override the service's hash field or add a separate `bound_payload_digest` column.

### C.3 Why a separate route + polling — not orchestrator-invoked

Mirrors the Move 6 awaiting-async pattern:
- The orchestrator never blocks waiting on a human. Step returns `awaiting-signature` and exits; resume is poll-driven (or webhook-driven in v2, when an in-app signing modal POSTs to the resume endpoint on success).
- The credential gathering UX (the signing modal — password + reason + meaning + confirm) lives in the UI, posts to `POST /api/submissions/:id/sign-release`, and on success calls `POST /api/submissions/:id/orchestrator/resume?runId=…` to advance the run.
- Identical operational shape as `csr.draft-narrative`: orchestrator emits a stable suspended state, an external actor advances it, the orchestrator resumes on a separate call. One pattern, two consumers (background workers + human signers).

---

## D. Open Questions for Human Review

| ID | Question | Default assumption (pending review) |
|----|----------|-------------------------------------|
| **OQ-1** | Should `package.sign` be REQUIRED or OPTIONAL? Per submission type? Per region? Per customer policy? | **Default: REQUIRED for every FDA-bound submission (US region) and EMA-bound submission (EU region, per EU Annex 11). OPTIONAL but recommended for 510(k) Letter-to-File. Customer-policy override is a *future* `organizations.require_release_signature` boolean — out of scope for v1.** |
| **OQ-2** | If a customer modifies any artifact AFTER signing (re-runs an upstream step, edits a cmcSource, re-validates), do all downstream re-runs invalidate the signature? | **Yes. Invariant: any change to the payload digest's inputs (leaf manifest, validator outcome, identity tuple) flips the step from `complete` back to `stale`, which forces re-signing. Documented in B.6 as `signature_payload_drift`. The existing `electronic_signatures` row is NOT deleted (§11.70 append-only — see OQ-4); a *new* row is required for the new payload digest.** |
| **OQ-3** | Is the signature ONE per submission, ONE per leaf, or ONE per applicable section? | **Default: ONE per submission release (one row in `electronic_signatures`, `signaturePurpose='submission-release'`). ICH M8 v4.0 §2.3 and FDA ESG guidance both treat the sequence as the atomic transmit unit and do not mandate per-leaf signatures for ESG. Per-leaf signing is a customer SOP layer that can sit ABOVE this gate; the gate itself signs the release. EU eCTD does require leaf-level signatures for *some* document types (e.g. expert reports), but those are document-internal PDF signatures, not Part 11 release signatures — out of scope.** |
| **OQ-4** | Does a `package.sign` rollback or `stale` transition affect already-persisted `electronic_signatures` rows? | **No. §11.70 requires signatures be append-only and immutable. Stale/rollback transitions update only the `submission_orchestrator_steps` row; the `electronic_signatures` row remains valid, with `verification_status='valid'`, but no longer matches the *current* `payloadDigest` so the resume path treats the submission as unsigned. The audit trail (`device_audit_trail.ELECTRONIC_SIGNATURE_CREATED` event) is also preserved — the historical record of who signed what payload, when, survives any number of regenerates.** |
| **OQ-5** | When the ZIP builder lands, do we extend the payload digest to include `sha256(backboneXml)` — and does that retroactively invalidate signatures created before the extension? | **Default: extend; pre-extension signatures remain valid for submissions whose status is already `transmitted` (audit-historical), but for any submission still `awaiting-signature` or `complete-not-yet-transmitted` at the migration boundary, the digest is recomputed and the signer must re-sign. Flagged for legal review.** |
| **OQ-6** | Does `createElectronicSignature` persist our orchestrator-computed `payloadDigest` as `electronic_signatures.signature_hash`, or do we add a separate `bound_payload_digest` column? | **Default: add a column. The existing `signature_hash` is computed over the service's `signatureData` (user/timestamp/reason metadata) — that's the §11.200 attribution hash and should not be conflated with the payload-binding hash. Two columns, two purposes, cleaner audit.** |
| **OQ-7** | Cross-tenant signature lookup — does the resume-path SQL in B.6.3 filter on `organization_id`? | **Yes, mandatory. See R-3 risk below. Already covered in B.6.3 (`AND organization_id = $orgId`) but called out as an open question so the reviewer can sanity-check the SQL during the workflow PR.** |
| **OQ-8** | What is the `signatureMeaning` enum? FDA Part 11 expects a non-empty string per §11.50(b); industry SOPs typically use a short closed vocabulary. | **Proposed enum: `'approved'`, `'reviewed'`, `'authorized-for-release'`. The release gate accepts only `'authorized-for-release'`. Other meanings remain available for document-level signatures via the existing service.** |

**Open question count: 8.**

---

## E. Effort Estimate

Per the `GA_GAP_AUDIT_2026-06-10.md` audit estimate (§C.11 row): **~3 person-days.**

Breakdown:

| Slice | Days |
|------|-----|
| Orchestrator: new step + dependency edge + `awaiting-signature` status + suspend/resume + payload-digest computation | 0.75 |
| New route `POST /api/submissions/:id/sign-release` (no UI work — UI is a separate Path-to-GA item) | 0.5 |
| Migration: widen `submission_orchestrator_runs.status` CHECK constraint | 0.25 |
| Migration: add `electronic_signatures.bound_payload_digest` column (subject to OQ-6) | 0.25 |
| Tests: unit (digest stability, resume drift detection, tenant-scoping); integration (run → suspend → sign → resume → complete; regenerate-after-sign → stale → re-sign required); negative (cross-tenant resume, replayed signature on new sequence) | 1.0 |
| Audit (Prometheus counters + `device_audit_trail` rows for `RELEASE_SIGNATURE_GATED`, `RELEASE_SIGNATURE_RESUMED`, `RELEASE_SIGNATURE_DRIFT_DETECTED`) | 0.25 |
| **Total** | **3.0** |

---

## F. Risks (Top 3)

### R-1 — Signer impersonation if `signerId` is not JWT-bound

**Threat.** A logged-in malicious user submits `POST /api/submissions/:id/sign-release` with `signerId` in the body referencing a more-privileged colleague (QA Director). If the route trusts the body field, the impersonator can release submissions under another human's name.

**Mitigation.** §C.2 mandates `signerId := req.user.id`, never read from the body. The Part 11 service's bcrypt password check then re-verifies that the JWT-identified user actually holds the password. Two-factor binding: JWT identity + password possession.

**Detection.** Audit trail `ELECTRONIC_SIGNATURE_CREATED` already captures `userId`, `userName`, `ipAddress`, `userAgent`, `sessionId`. Any mismatch between JWT identity and persisted signer becomes a forensic flag.

### R-2 — Partial-signing race during a regenerate

**Threat.** Signer A starts the sign flow at T0 (sees `payloadDigest = D1`). Concurrently, RA Associate B re-runs `m3.compose` at T1 (changes `outputs.module3Sections`), which cascades through `package.assemble` and `package.validate`, producing `payloadDigest = D2`. Signer A submits their signature at T2 — what gets bound to what?

**Mitigation.**
1. The signing route's pre-flight (§C.2) recomputes the digest from the *current* run state. If it no longer matches what the signer saw, the route returns `409 Conflict: signature_payload_drift` and the signer is shown the new payload diff before re-signing.
2. The orchestrator's resume path (§B.6) re-verifies the digest one more time before treating the signature as binding. Defense in depth — the route check catches the common case; the resume check catches the rare case where the regenerate completes *between* the route's pre-flight and the orchestrator's resume call.
3. Optional follow-on (not v1): take a `documentLocks` row on the submission for the duration of the sign flow, blocking concurrent regenerates. Out of scope; documented as a future hardening.

### R-3 — Cross-tenant signature visibility

**Threat.** Org B's resume call accidentally observes Org A's `electronic_signatures` row (same submission ID across tenants — possible if `submissionId` is not globally unique, which it is not in the current schema since `submissionId` is `text`).

**Mitigation.** The resume-path SQL in B.6.3 filters on `AND organization_id = $orgId`, where `$orgId` comes from the orchestrator run's pinned `organization_id` (set at run creation, never re-derived). Additionally, the run itself is loaded via `getRun(runId, inputs.organizationId)` which already throws on tenant mismatch (per the existing resume-branch contract in `runOrchestrator`). The `electronic_signatures` table needs the same tenant scoping audit during workflow implementation — flagged for the workflow PR.

---

## G. Implementation Workflow Shape

Future workflow call to ship this:

1. **Read** this design doc and the human-review feedback on OQ-1 through OQ-8.
2. **Migration 1:** widen `submission_orchestrator_runs.status` CHECK to include `'awaiting-signature'` (sibling to `20260629_orchestrator_awaiting_async_status.sql`).
3. **Migration 2 (OQ-6 dependent):** add `electronic_signatures.bound_payload_digest TEXT` column + index on `(document_id, signature_purpose, bound_payload_digest, organization_id)` for the resume-path lookup.
4. **Code change 1:** widen `StepStatus` and `OrchestratorRun['status']` unions in `submission-package-orchestrator.ts`.
5. **Code change 2:** add `'package.sign'` to `StepKey`, `ORDERED_STEPS` (after `package.validate`), `STEP_DEPENDENCIES`.
6. **Code change 3:** implement the `package.sign` step body in `runOrchestrator` — compute digest, persist on `step.outputRef`, transition to `awaiting-signature`, persist run, return. Mirrors the `csr.draft-narrative` enqueue-then-suspend block (lines 967–1097 of `submission-package-orchestrator.ts`).
7. **Code change 4:** extend the existing resume branch (`resumeOrchestratorRun`) to handle `package.sign` — re-verify digest, look up signature row, drive forward or hold.
8. **Code change 5:** new route file `server/routes/submissionSignRoutes.ts` exporting `POST /api/submissions/:id/sign-release`. Wire into `server/routes/index.ts` (or wherever submission routes register).
9. **Tests:** unit + integration as itemized in §E. The `csr-job-state-schema-design`'s test surface is the closest precedent.
10. **Metrics:** add three counters to `submission-orchestrator-metrics.ts`: `release_signature_gated_total`, `release_signature_completed_total{outcome}`, `release_signature_drift_detected_total`. Bounded labels only.
11. **Audit:** `device_audit_trail` events for `RELEASE_SIGNATURE_GATED`, `RELEASE_SIGNATURE_RESUMED`, `RELEASE_SIGNATURE_DRIFT_DETECTED`.
12. **Verify:** integration test demonstrating that a submission cannot reach `complete` without a matching `electronic_signatures` row, and that a regenerate-after-sign produces `signature_payload_drift`.
13. **No UI in this workflow** — the signing modal is a separate Path-to-GA design item (and depends on this design landing first).

The orchestrator file is the only existing file touched substantially; everything else is additive (one new route, one new migration pair, one new test file, three new Prometheus counters).

---

## Out of Scope (Explicitly)

- `package.transmit` orchestrator step (the ESG transport itself). That step will depend on `package.sign` but is a separate Path-to-GA item.
- The signing modal UI.
- Per-leaf or per-section Part 11 signatures (see OQ-3 — only the release signature is in scope).
- The PDF document-internal signature workflow for EU expert reports (separate compliance surface).
- Customer-policy `require_release_signature` override (OQ-1 default v2 item).
- Replacing the existing `signature_hash` field semantics in `electronic_signatures` (OQ-6 — additive column, not a mutation).

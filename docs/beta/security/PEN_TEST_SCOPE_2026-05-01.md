# Limited penetration test — BETA scope of work

**Status:** Draft for vendor RFP. **Owner:** Backend stream + RA.
**Last revised:** 2026-05-01.

This document scopes a limited penetration test of Concept2Cure.RI ahead
of the medical-device limited BETA. The intent is to surface
exploitable issues against the **BETA-critical** surface area before
design-partner customers transmit a real 510(k) dossier through the
platform.

A full GA-grade pen test (broader scope, longer engagement, infrastructure
review) is a separate engagement post-BETA.

## Engagement summary

| Field         | Value                                                        |
|---------------|--------------------------------------------------------------|
| Duration      | 10 working days, plus 5-day retest after remediation         |
| Methodology   | Black-box for app surface; white-box for IDOR / tenant tests (read-only repo access) |
| Window        | Target weeks W11-W12 of the BETA plan                        |
| Approach      | Manual review + tooling; no destructive testing in shared envs |
| Reporting     | CVSS-rated findings, executive summary, retest results, no-finding letter on close-out |
| Vendor budget | $15-25k                                                      |

## In scope

### App surface

| Surface                                | Notes                                                                |
|----------------------------------------|----------------------------------------------------------------------|
| Authentication (`/api/auth/*`)         | JWT issuance, refresh, password reset, email-OTP, lockout            |
| Authorization (every `/api/*` route)   | Per-tenant + per-program IDOR; role boundaries; admin endpoints      |
| Q-Sub family (`/api/q-sub/*`)          | New for BETA. Cross-tenant attempts on every verb.                   |
| eSignature (`/api/esignature/*`)       | Part 11 e-sign, signature chain integrity, replay resistance         |
| Predicate-intelligence proxy (`/api/predicate-intelligence/*`) | Token forwarding, IDOR via program_id, error message leakage |
| Dossier transmit (510k workflow)       | Pre-flight gate bypass, ESG receipt forgery, transmit replay         |
| Regulatory correspondence              | AI-letter ingest path, file upload size limits, parser DoS           |
| File / DOCX upload paths               | Path traversal, ZIP-slip, polyglot files, MIME confusion             |

### Out of scope (this engagement)

- Shadow service internals (separate engagement; FastAPI process)
- Client-side React (separate engagement; XSS / CSP review)
- Third-party integrations (FDA ESG, Stripe billing)
- Container escapes / underlying infra (covered by hosting-vendor SOC 2)
- Social engineering / physical
- DDoS / volumetric

## Threat model — what we want the testers to break

These are the scenarios that must produce a finding if they succeed.

### T1. Cross-tenant data leakage

> Tenant A retrieves, modifies, or deletes data owned by Tenant B.

Test paths:

- Direct ID access (`GET /api/q-sub/:id`, `PATCH /api/q-sub/commitments/:id/rolled-in`).
- Listing endpoints with hand-crafted `program_id` query params.
- Audit-log queries returning entries from another tenant.
- File-storage URLs (vault / DOCX exports).

### T2. IDOR via program_id

> A user attached to org A but program X (org B) reads or writes program X.

Test paths: every endpoint that accepts `program_id` or `:programId` —
predicate-intelligence, evidence-sufficiency, gspr, q-sub, post-market,
authoring.

### T3. JWT / session abuse

> Token issued to user U is valid for unauthenticated identities.

Test paths:

- Algorithm-confusion attack on the JWT verifier.
- Forged token using "none" algorithm.
- Long-lived refresh token theft → access-token mint loop.
- Mass token validation timing oracle.

### T4. e-Signature replay / forgery

> A signature captured for one record is replayed against another, or a
> reviewer's signature is forged.

Test paths:

- Re-submit a previously-witnessed `esignature.captured` payload against
  a different `resourceId`.
- Trigger Part 11 events without a signed witness (race conditions).
- Bypass reason-for-change capture.

### T5. Dossier transmit gate bypass

> Submission is transmitted to FDA ESG with a failing pre-flight gate.

Test paths:

- POST `/api/510k-workflow/transmit` with stale or forged pre-flight
  state.
- Race against concurrent pre-flight invalidation.
- Submit with unresolved blocker commitments still flagged.

### T6. Audit-log tampering

> Writes to `audit_logs` are altered, deleted, or made un-replayable.

Test paths:

- Direct DB role check — application role must lack `DELETE` on
  `audit_logs`.
- Hash-chain integrity break (TamperProofAuditLog).
- Backdate a row via the API.

### T7. File upload abuse

> A malicious upload escapes the storage sandbox or is rendered as
> active content.

Test paths:

- Upload a `.docx` that is actually a ZIP bomb or a polyglot exec.
- Path traversal in filename (`../../../etc/passwd`).
- MIME-confusion (HTML served from image route).
- DOCX with embedded macros — must be inert in our render path.

### T8. Rate-limit evasion / DoS

> A single client exhausts shared resources for the tenant.

Test paths:

- AI calls (predicate-intelligence, ana-cortex) without backoff.
- Repeated DOCX renders.
- File upload spam.

## Required vendor deliverables

1. Kick-off readout: confirmed scope, OOB plan, point of contact, NDA executed.
2. Day-2 checkpoint: testing-status update.
3. Week-1 checkpoint: preliminary findings with CVSS.
4. Final report: exec summary, findings table, technical appendix, recommended remediation, timeline for retest.
5. Retest report: per-finding pass/fail.
6. **No-finding letter** on close-out — this is the artifact we attach to the BETA quality package for design partners.

## Acceptance criteria for "BETA-ready"

- All Critical findings remediated and retested.
- All High findings have a remediation plan with owner + date and either landed or have an explicit risk acceptance signed by RA + Eng leadership.
- Medium / Low findings tracked in the issue tracker with target dates.
- The test report and the no-finding letter are attached to the BETA quality file.

## Vendor shortlist

To get three quotes on:

- Trail of Bits — strong CDRH-adjacent track record.
- Latacora — dev-velocity-friendly, fits BETA timeline.
- Doyensec — web-app-deep methodology, IDOR specialty.

Selection criteria: previous medical-device experience, retest workflow,
fixed-fee preferred.

# POLICY-IS-001 — Information Security Policy (DRAFT)

**Owner:** Founder (acting Security Officer). **Review:** annually and on any
material change. **Applies to:** all systems, data and people involved in
building, operating and supporting Concept2Cure.

## 1. Purpose and commitment
Concept2Cure processes regulated pharmaceutical and device submission content
on behalf of sponsors. We commit to protecting the confidentiality, integrity
and availability of that content, and to 21 CFR Part 11 / EU Annex 11 record
integrity as a design property, not a feature.

## 2. Governance
| Control | Status | Evidence |
|---|---|---|
| A named security owner accountable for this policy set | **Partial** — the founder holds every role; no independent security officer | This file; `WO-07-dependency-risk-decision.md` §Ownership names the same gap |
| Repository rules that every contributor and AI session must follow | **Implemented** | `CLAUDE.md` (Rules 0–2), `AGENTS.md` |
| Risk assessment maintained and reviewed | **Partial** — point-in-time audits exist (`SECURITY_SWARM_AUDIT_2026-06-17.md`, `VAULT_DATA_ROOM_ASSESSMENT_2026-09-05.md`); no recurring risk register | `docs/audit-2026-07/12-findings-register.md` |
| Security awareness training | **Partial** — the record and curriculum are opened at `docs/security/TRAINING_RECORD.md`; no completion is recorded yet; a completion is a condition of production or platform-operator access (POLICY-AC-002 §4a) | `docs/security/TRAINING_RECORD.md` |

## 3. Principles enforced in code
| Principle | Status | Evidence |
|---|---|---|
| Fail closed: policy, review, export and approval gates refuse rather than degrade | **Implemented** | `AGENTS.md` Repository Safety Rules; e.g. `server/services/ectd/signed-package-export.ts` refusal taxonomy; `server/services/part11/signature-persistence.ts` anchorless-signature refusal |
| Production refuses to boot without its security posture | **Implemented** | `server/config/environment.ts` (JWT/refresh/MFA keys), `server/db/rlsEnforcement.ts` (`RLS_ENFORCE=on`), `server/services/audit/auditSealPosture.ts` (audit keys), `server/services/signature/signer-mode.ts` (`CONCEPT2CURE_SIGNER_MODE`) |
| One canonical implementation per capability (no parallel write paths for governed records) | **Implemented** for e-signatures (`electronic_signatures` single writer) — **Partial** platform-wide: `authoring_signatures` remains a second, PIN-based store for the authoring loop (`server/routes/authoring.router.ts:4727, 6661`) | `docs/evidence/W3b/2026-09-20/signature-writers-grep.txt` |
| Never fabricate: no fixture data in governed paths, honest empty states | **Implemented** (CI gates) | `ci:fixture-fallback`, `ci:no-mock-in-prod-routes` in `package.json`; `docs/evidence/W1/2026-09-20/` |
| Verify by making the check fail | **Implemented** as practice | `docs/evidence/W3b/2026-09-20/verify-audit-chain-fail-proof.txt` |

## 3a. Audit-trail review
EU GMP Annex 11 §9 asks that audit trails be regularly reviewed; FDA's data-integrity guidance (2018, Q7) asks
who reviews them, how often, and where the review is recorded (finding DP-21; ADR-0014 §8).

| Control | Status | Evidence |
|---|---|---|
| Each organisation's audit trail is reviewed quarterly, and each review is one signed record | **Implemented** (P1-25, 2026-10-01): the record, its signature and the overdue flag. No review has been recorded yet | `public.compliance_review_records` (`migrations/20261001_compliance_review_records.sql`), `server/services/audit/compliance-reviews.ts`; `docs/evidence/D6/2026-10-01-tranche-4/P1-25-P1-43-review-records/` |

**Procedure.** Once a quarter, the organisation's QA reviewer runs, for the quarter, the administrative changes
report, the sign-in and session events, the electronic signature register and the audit trail integrity attestation
(Reporting & analytics → Audit & compliance reports). They then record the review in **Periodic reviews → Record
review → Audit trail review** on the same screen. The record holds the period, what was covered (the integrity
attestation run it names by export id and data hash), each finding with what was done about it, and the outcome.
The reviewer signs it through the platform's signing ceremony: meaning *review*, a reason, the password, and the
second factor where one is enrolled.

The product checks the record when it is recorded, and again when it is signed:

- the period ended no more than three months ago, and starts no later than the day after the last signed audit-trail
  review ended, so no days go unreviewed;
- the run it names is an integrity attestation this organisation ran, with that export id and data hash.

Once signed, the record cannot be changed or deleted by any role. The database refuses it, and a correction is a new
review. The audit trail integrity attestation names the latest signed review, the one covering the most recent
period. The next review is due three months after the end of that period. The attestation shows **Overdue** once the
report date is past that due date, and "No audit trail review recorded" when there is none.

When an organisation is offboarded, its review records are returned in the tenant export and are kept with the audit
trail (DPA §3.5): the tenant purge does not erase them.

## 4. Asset and data classification
| Class | Examples | Handling |
|---|---|---|
| Regulated content | submission documents, CMC data, eCTD sequences, signatures | tenant-scoped (RLS), audited, sealed; AI providers only under placement approvals |
| Personal data | user accounts, signer identity, audit actor ids | minimised; MFA seeds encrypted (`mfaService.ts`) |
| Secrets | the keys in `docs/SOP_KEY_MANAGEMENT.md` | Secrets Manager (terraform module), never in DB or repo |
| Public | marketing site, this trust statement | — |

## 5. Compliance obligations
21 CFR Part 11; EU Annex 11; GDPR (`server/services/compliance/gdprComplianceService.ts`,
Partial); HIPAA only where a tenant's content contains PHI — see POLICY-DR-007 for
the Anthropic BAA scope. SOC 2 Type II: **Planned** — no observation window is
open; see `TRUST_STATEMENT.md`.

## 6. Exceptions
Recorded in `docs/security/dependency-risk-ledger.json` (dependencies) and in the
relevant policy's revision table (everything else), each with an owner, a
reason and an expiry. An exception without an expiry is not an exception.

## Revision history
| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 DRAFT | 2026-09-20 | W3b session | First draft, grounded in the code paths cited |
| 0.2 DRAFT | 2026-09-26 | D6 session | Training record and curriculum opened (`docs/security/TRAINING_RECORD.md`); completion made a condition of operator access (security audit 2026-09-24, INF-07 / plan P1-13). |
| 0.3 DRAFT | 2026-10-01 | D6 session | §3a audit-trail review: quarterly per organisation, recorded and signed in the product, with overdue reviews shown in the integrity attestation (P1-25, DP-21; ADR-0014 §8). Fix round (DP-69, DP-70): the period and the named run are checked; the due date runs from the end of the period reviewed; the records are kept at offboarding. |

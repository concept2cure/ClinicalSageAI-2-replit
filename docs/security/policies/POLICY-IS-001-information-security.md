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

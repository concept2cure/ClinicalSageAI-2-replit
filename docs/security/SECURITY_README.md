# Security documentation — index

This file is an index, not a restatement (`CLAUDE.md`: zero duplication). Each document below owns its subject; a
claim about the platform's security posture belongs in exactly one of them. The previous content of this file
described a Replit-era deployment (`index-enhanced.ts`, `scripts/setup-rls.js`, Replit secrets) that no longer
exists and was superseded on 2026-09-24.

## Current state, in order of authority

| Document | Owns |
|---|---|
| `SECURITY_AUDIT_2026-09-24.md` | The independent audit at commit `adbf2d18`: 81 findings with `file:line`, the verdict, the verified strengths, the disposition of every earlier assessment, and the **claims register** that re-tests the policies, the questionnaire, the trust statement and the DPA against the code. Start here. |
| `REGULATORY_CONTROL_MAP_US_JP_EU.md` | Requirement → control → status → plan item for 21 CFR Part 11, HIPAA, the PMDA ER/ES Guideline, APPI, the Japanese cloud guidelines, EU Annex 11, GDPR, the EU AI Act, NIS2, the CRA and eIDAS. |
| `REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` | The staged plan (P0 before any production tenant; P1 for D6 green; P2 for EU/Japan/HIPAA market entry; P3 continuous assurance), each item with an owner, an effort, a failing-first acceptance test, the launch row it moves and the clauses it satisfies; the founder decisions it waits on. |
| `docs/evidence/D6/2026-09-24-security-audit/` | Gate outputs, test runs, the citation check and the reproductions behind the audit. |
| `../evidence/reviews/<date>/security.md` | The weekly security lens produced by `.claude/agents/security-auditor.md` (first run 2026-09-24). |

## Governance set (all DRAFT until the founder signs)

| Document | Owns |
|---|---|
| `policies/POLICY-IS-001` … `POLICY-AI-008` | The SOC 2-style policy set; every control marked Implemented / Partial / Planned with a file path. The audit's claims register (§7.4) lists the marks that are not fully true at head. |
| `SECURITY_QUESTIONNAIRE_SIG_LITE.md` | Control-by-control questionnaire answers. Corrections owed per the claims register (§7.1): E.1, E.4, F.2, F.4, D.2, G.4. |
| `TRUST_STATEMENT.md` | The one-page public statement. Corrections owed per §7.2 (first bullet; sub-processor list). |
| `../SOP_KEY_MANAGEMENT.md` (SOP-SEC-001) | Keys by name, custody, rotation, the KMS signer decision. |
| `../commercial/DATA_PROCESSING_ADDENDUM.md` | The DPA draft; Annex II corrections owed per §7.3; Annex III/IV to be completed by counsel. |
| `../AI_SENSITIVE_DATA_PLACEMENT.md` | The sensitive-data placement contract for AI dispatch, and the list of paths outside it. |

## Tenancy and isolation

| Document | Owns |
|---|---|
| `C2C_TENANT_ISOLATION_PROOF.md`, `WO-03_TWO_TENANT_RLS_PROOF.md` | What the two-tenant proofs cover and how they run. |
| `TENANCY_GA_ASSESSMENT_2026-08-13.md` | The residual register (R1–R6) and `../adr/0012-tenant-key-custody-and-data-residency.md` for per-tenant keys and residency. |
| `../RLS_ENFORCEMENT_BURNDOWN.md` | The runway to `RLS_ENFORCE=on` and the enforcement model. |

## Dependencies and supply chain

| Document | Owns |
|---|---|
| `WO-07-dependency-risk-decision.md`, `dependency-risk-ledger.json`, `DEPENDENCIES.md` | The advisory gate sealed to the lockfile and its exception ledger. |

## History (kept, not authoritative)

`../SECURITY_SWARM_AUDIT_2026-06-17.md`, `../audit-2026-07/04-security.md` and `07-compliance-21cfr11.md`,
`../RED_TEAM_REPORT.md`, `PLATFORM_SECURITY_ENHANCEMENT_REPORT.md`, `SECURITY_PROTOCOL.md`, `MAXIMUM_PROTECTION.md`,
`MODULE_PROTECTION_SYSTEM.md`, `PROJECT_LOCKDOWN_MANIFEST.md`, `PROJECT_PROTECTION.md`, `CERV2_PROTECTION_SYSTEM.md`,
`DOCUMENT_EDITOR_PROTECTION*.md`, `STABILITY_TENANT_ISOLATION_FINDING.md`, and
`../validation/CSRA-CORTEX-001-HIPAA_FDA_SECURITY_ASSESSMENT.md` (superseded: its "implemented" marks do not describe
the platform as built; see the audit §11). Read them for how a finding arose, not for what is true now.

## Reporting a vulnerability

`/SECURITY.md` at the repository root and `/.well-known/security.txt` on a deployment.

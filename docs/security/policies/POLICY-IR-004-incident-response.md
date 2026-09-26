# POLICY-IR-004 — Incident Response Policy (DRAFT)

**Owner:** Founder (incident commander until a second responder exists).
**TSC:** CC7.2–CC7.5.

## 1. Definitions
- **Security incident:** confirmed or suspected unauthorised access, disclosure,
  alteration or loss of customer data or of a governed record; or loss of audit
  integrity (`npm run ops:verify-audit-chain` exits non-zero).
- **Severity:** S1 data of more than one tenant exposed or audit chain broken;
  S2 single-tenant exposure or signature substrate compromised; S3 attempted
  attack blocked; S4 policy deviation without data impact.

## 2. Detection
| Control | Status | Evidence |
|---|---|---|
| Audit-chain integrity verifier, runnable on demand and after every restore | **Implemented** | `scripts/ops/verify-audit-chain.mjs`; failure proof in `docs/evidence/W3b/2026-09-20/` |
| Security self-test at boot (audit chain integrity is a critical check) | **Implemented** | `server/services/securityHealth.ts` |
| SIEM export of audit events (admin-only, rate-limited) | **Implemented** | `server/routes/admin/audit-siem.ts` |
| `[SECURITY]`-class alert forwarding to a webhook | **Partial** — configurable, no receiver configured | `.env.example` security alert webhook |
| CloudTrail, GuardDuty, WAF | **Partial** — CloudTrail with Object Lock in terraform (`terraform/modules/compliance-evidence`); GuardDuty/WAF not defined | — |
| Prompt-injection and PII screens on AI traffic emit audit events | **Implemented** | `server/services/ai-gateway/pii-screen.ts`; `AUDIT_VERIFICATION_*`, `PROMPT_INJECTION_BLOCKED` event types in `server/lib/tamper-proof-audit.ts` |

## 3. Response procedure
1. **Triage (≤1 h):** classify severity; open an incident record (issue tagged
   `incident`) with timeline started.
2. **Contain:** rotate the affected credential or key (`docs/SOP_KEY_MANAGEMENT.md`);
   disable the affected account; if audit integrity is in question, take a
   database snapshot before any remediation and run the verifier against it.
3. **Eradicate and recover:** follow POLICY-BR-005 for restores; re-run
   `ops:verify-audit-chain` and `/readyz` before returning to service.
4. **Notify:** affected tenants without undue delay and within **72 hours of
   becoming aware** (the DPA's §7.1 figure is to be set to the same by counsel;
   its draft still brackets 48 — INF-07); regulators and data subjects are the
   tenant's notifications, made by the tenant with the facts this policy's
   matrix (§3a) obliges us to hand over, in time for the tenant's own clocks.
   Every notification made, and the time it was made, is entered in the
   incident record (`docs/security/INCIDENT_LOG.md`).
5. **Post-incident review** within 10 business days; corrective actions land as
   changes under POLICY-CM-003 with tests that would have caught the incident.

## 3a. Breach-notification matrix

Concept2Cure is a processor (GDPR), a business associate (HIPAA) and a
委託先 / entrusted party (APPI) for its tenants' data; it holds no direct
relationship with their data subjects, patients or regulators. Its clock is
the first row of each block; the tenant's clocks follow, because the tenant
can only meet them with what we hand over, and when.

| Regime | Who notifies whom | Clock starts | Deadline | Content owed | Source |
|---|---|---|---|---|---|
| **Contract (all tenants)** | Concept2Cure → tenant | awareness of a confirmed or reasonably suspected breach of the tenant's data | **without undue delay, ≤ 72 h**; then supplements as facts arrive | nature of the breach; categories and approximate numbers of data subjects and records; likely consequences; measures taken and proposed; a contact point | DPA §7.1 (figure to be aligned by counsel; INF-07); this policy |
| **HIPAA** (PHI; a BAA in force) | Concept2Cure (business associate) → tenant (covered entity) | discovery (first day known, or should reasonably have been known, to any workforce member or agent) | without unreasonable delay, **≤ 60 calendar days** — our contractual 72 h applies first | identification of each individual whose PHI was, or is reasonably believed to have been, accessed, acquired, used or disclosed; the facts the covered entity needs for its own notices | 45 CFR §164.410; BAA |
| HIPAA | tenant (covered entity) → individuals; → HHS Secretary (≥ 500 individuals: contemporaneously; < 500: annual log); → prominent media (≥ 500 residents of a state) | discovery by the covered entity | without unreasonable delay, ≤ 60 calendar days | prescribed notice content | 45 CFR §§164.404–164.408 (the tenant's; we supply the facts) |
| **GDPR** (personal data of EU/EEA/UK data subjects) | Concept2Cure (processor) → tenant (controller) | awareness | **without undue delay** — our 72 h is the outer bound, and a first notice goes as soon as the breach is known even if incomplete | Art. 33(3) content: nature, categories and approximate numbers, DPO or contact, likely consequences, measures taken and proposed | Art. 33(2); DPA §7.1 |
| GDPR | tenant (controller) → supervisory authority | the controller's awareness (our notice) | **≤ 72 h**, unless unlikely to result in a risk; reasons for any delay recorded | Art. 33(3) content, in phases if needed | Art. 33(1), (4) |
| GDPR | tenant (controller) → data subjects | — | without undue delay when the breach is likely to result in a **high** risk | Art. 34(2) content | Art. 34 |
| **APPI** (personal information of data subjects in Japan; 要配慮個人情報 incl. health data) | Concept2Cure (委託先) → tenant (個人情報取扱事業者) | knowledge of a reportable incident (leakage, loss or damage of sensitive personal information, of data whose misuse may cause property damage, by wrongful purpose, or of > 1,000 persons) | **promptly** — our 72 h is the outer bound; a 委託先 that has reported to the entrusting operator is relieved of its own PPC report | the facts the operator needs for both PPC reports and its notices | APPI Art. 26(1) and its Enforcement Rules (Arts. 7–8); Cabinet Order |
| APPI | tenant (operator) → Personal Information Protection Commission | knowledge | a **preliminary report promptly** (guidance: within 3–5 days); a **confirmed report within 30 days**, or **60 days** when the incident may have been caused by a wrongful act | the Rules' prescribed items (overview, categories, numbers, cause, secondary damage, response to individuals, publication, preventive measures) | APPI Art. 26(1); Rules Art. 8 |
| APPI | tenant (operator) → data subjects | — | promptly, per the circumstances | the Rules' items | APPI Art. 26(2) |
| **NIS2** (only if Concept2Cure or the tenant is an essential or important entity; P2-6 records neither is today) | entity → its CSIRT / competent authority | awareness of a significant incident | early warning **≤ 24 h**; incident notification **≤ 72 h**; final report **≤ 1 month** | Art. 23(4) content | Directive (EU) 2022/2555 Art. 23; the customer flow-down (Art. 21(2)(d)) answered through the SIG-Lite |
| **21 CFR Part 11 / Annex 11** | Concept2Cure → tenant's QA | loss of audit-trail integrity (the verifier exits non-zero) or a signature substrate compromised | with the S1/S2 incident notice above | what was affected, from when, and the verifier's output; the tenant decides on regulatory reporting for its own submissions | Annex 11 §13; §11.10(e) |

What this matrix is not: legal advice to a tenant. Each tenant's own obligations
depend on its role, sector and jurisdictions; the rows above state the clocks
our notice must beat so the tenant can meet them.

## 4. Status of the procedure
| Control | Status |
|---|---|
| Written procedure (this section) | **Implemented as document** |
| Tabletop exercise performed | **Planned** — none performed |
| On-call rotation | **Planned** — single operator |
| Incident log | **Implemented as document** — `docs/security/INCIDENT_LOG.md` (opened 2026-09-26; no incidents recorded to date) |
| Breach-notification matrix (§3a) | **Implemented as document** — the DPA's bracketed figure is to be aligned by counsel (INF-07) |

## Revision history
| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 DRAFT | 2026-09-20 | W3b session | First draft |
| 0.2 DRAFT | 2026-09-26 | D6 session | §3a breach-notification matrix (HIPAA §164.410, GDPR Arts. 33–34, APPI Art. 26, NIS2 Art. 23, Part 11 / Annex 11), one contractual figure (72 h from awareness) with the DPA's bracketed 48 h flagged for counsel; §3.4 reworded to it; the incident log opened (security audit 2026-09-24, INF-07; plan P1-13). |

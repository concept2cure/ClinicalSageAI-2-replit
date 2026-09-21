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
4. **Notify:** affected tenants within 72 hours of confirmation (contractual
   DPA term, `docs/commercial/` — **Planned** until DPA is signed); regulators
   where the tenant's obligations require it, in coordination with the tenant.
5. **Post-incident review** within 10 business days; corrective actions land as
   changes under POLICY-CM-003 with tests that would have caught the incident.

## 4. Status of the procedure
| Control | Status |
|---|---|
| Written procedure (this section) | **Implemented as document** |
| Tabletop exercise performed | **Planned** — none performed |
| On-call rotation | **Planned** — single operator |
| Incident log | **Planned** — no incidents recorded to date; the log starts with the first |

## Revision history
| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 DRAFT | 2026-09-20 | W3b session | First draft |

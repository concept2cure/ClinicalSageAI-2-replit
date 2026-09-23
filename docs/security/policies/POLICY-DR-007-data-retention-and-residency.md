# POLICY-DR-007 — Data Retention and Residency Policy (DRAFT)

**Owner:** Founder. **TSC:** C1.1, C1.2, P4.2, P4.3. **GxP:** 21 CFR 11.10(c)
record retention; predicate-rule retention (e.g. 21 CFR 312.57, 21 CFR 820.180).

## 1. Retention classes
| Data | Retention | Basis | Status |
|---|---|---|---|
| Governed records: submission documents, sequences, `electronic_signatures`, `document_versions` | Life of the tenant contract + the tenant's predicate-rule period (default 7 years after last use; never less than the tenant instructs) | Part 11 §11.10(c); `VAULT_DATA_ROOM_ASSESSMENT` "never drop `document_versions`" | **Partial** — immutability triggers and append-only supersession implemented; retention clock and legal hold not implemented |
| Audit trails (`audit.tamper_proof_log`, `audit_logs`, `audit_events`) | Same as the records they describe; never shorter | Part 11 §11.10(e) | **Implemented** — UPDATE/DELETE refused by trigger (`db/migrations/20260222_audit_events_immutability.sql`, `20260617_audit_logs_immutability.sql`, `20260813_audit_tamper_proof_log.sql`) |
| Account and access logs | 2 years | SOC 2 | **Planned** |
| Backups | 35 days rolling + monthly | POLICY-BR-005 | **Planned** |
| AI prompts/completions logged by the gateway | 90 days, tenant-configurable to 0 (do not store) | minimisation | **Partial** — gateway logging exists; purge job not implemented |
| Tenant off-boarding export and deletion | export within 30 days of termination; deletion 90 days after, except records under legal hold or predicate retention | DPA | **Partial** — `server/services/tenant/tenant-lifecycle.ts`, `server/services/tenant-export/attestation-report.service.ts` |

## 2. Residency
| Control | Status | Evidence |
|---|---|---|
| Primary storage in one AWS region chosen per tenant contract (launch: us-east-1; EU region on request) | **Planned** — no production environment | `terraform/environments/production` |
| AI provider placement honours the tenant's residency; failover never crosses the boundary | **Implemented** | `server/services/ai-gateway/gateway.ts:2298-2344`; `AI_PROVIDER_PLACEMENT_APPROVALS` |
| Per-tenant residency and retention statement published | **Partial** — this policy + `TRUST_STATEMENT.md`; the per-tenant instance is the order form (row D9) | — |

## 3. Anthropic: BAA scope and the retention choice per tenant
Anthropic offers (a) a Business Associate Agreement for HIPAA-covered workloads on
eligible plans, and (b) a zero-data-retention (ZDR) arrangement for API traffic,
in place of its standard retention of API inputs/outputs (30 days by default for
trust-and-safety purposes at the time of writing — **confirm the current term in
Anthropic's commercial terms before signing; do not cite this document as the
source of Anthropic's policy**).

| Item | Position | Status |
|---|---|---|
| BAA | Required **only** for tenants whose content contains PHI (e.g. clinical narratives with identifiable patient data). Regulatory submission content is normally de-identified; the default posture is "no PHI in the platform", stated in the pilot agreement. The BAA is signed **before** the first PHI-bearing tenant, not after. | **Planned** — founder action (row D6) |
| ZDR vs 30-day retention | **Per tenant, chosen on the order form.** Default for regulated tenants: **ZDR requested**; the gateway then routes only to providers whose placement approval carries `zeroDataRetention: true` and refuses otherwise (`gateway.ts:2318-2325`). A tenant that accepts standard retention gets the standard lane and that choice is recorded on the order form. | **Implemented** in the gateway; **Planned** on the commercial paper |
| Training | API traffic is not used to train Anthropic models under the commercial API terms; no opt-in is given. | statement of vendor terms — verify at signing |
| Sub-processor disclosure | Anthropic listed in POLICY-VM-006 and `TRUST_STATEMENT.md` | **Implemented** (document) |

## 4. Deletion and legal hold
| Control | Status |
|---|---|
| Deletion requests honoured within 30 days except governed records under predicate retention | **Planned** — no request received; procedure to be exercised on first request |
| Legal hold flag suspending deletion | **Planned** |
| Certificate of deletion issued to the tenant | **Planned** |

## Revision history
| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 DRAFT | 2026-09-20 | W3b session | First draft |

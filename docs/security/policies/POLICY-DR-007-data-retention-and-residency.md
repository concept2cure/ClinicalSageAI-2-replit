# POLICY-DR-007 — Data Retention and Residency Policy (DRAFT)

**Owner:** Founder. **TSC:** C1.1, C1.2, P4.2, P4.3. **GxP:** 21 CFR 11.10(c)
record retention; predicate-rule retention (e.g. 21 CFR 312.57, 21 CFR 820.180).

## 1. Retention classes
| Data | Retention | Basis | Status |
|---|---|---|---|
| Governed records: submission documents, sequences, `electronic_signatures`, `document_versions` | 25 years by default from the record's finalization (ADR-0014 §6); an organisation may set a longer period, or a shorter one only with a recorded reason naming the governing rule; a legal hold always overrides deletion | Part 11 §11.10(c); EU CTR Art. 58; ADR-0014 §6; `VAULT_DATA_ROOM_ASSESSMENT` "never drop `document_versions`" | **Partial (re-verified 2026-10-01).** Implemented: immutability triggers and append-only supersession; the per-organisation period (`organization_retention_settings`, 25 years by default, a shorter period refused without a reason by route and by database CHECK); legal holds (below); the scheduled sweep, which disposes of a Vault document only in one transaction with its chained audit row (`docs/evidence/D6/2026-09-25-p1/P1-22/`, `docs/evidence/D6/2026-10-01-tranche-4/P1-22-org/`). **Not as stated:** the clock starts when a Vault version is admitted, not when it is approved, so a version approved long after admission falls due before 25 years from its approval (register DP-78; the earliest such date is in 2051) |
| Audit trails (`audit.tamper_proof_log`, `audit_logs`, `audit_events`) | Same as the records they describe; never shorter | Part 11 §11.10(e) | **Implemented (re-verified 2026-10-01)** — UPDATE/DELETE refused by trigger (`db/migrations/20260222_audit_events_immutability.sql`, `20260617_audit_logs_immutability.sql`, `20260813_audit_tamper_proof_log.sql`); the runtime role holds SELECT and INSERT only on the eleven audit stores (P0-8, `docs/evidence/D6/2026-10-01-tranche-4/P0-8-grants/`); chain heads anchored daily to the object-locked evidence bucket (P0-8 anchor) |
| Account and access logs | Kept with the audit trail they are part of (decision 2026-10-01, below) | Part 11 §11.10(e); SOC 2 CC7.2; GDPR Art. 17(3)(b) | **Implemented as decided** — sign-in, second-factor, sign-out and session events are rows of the append-only `audit_logs` chain (`server/services/audit/auth-event-audit.ts` through `auditService.logAction`), so they are kept as long as the audit trail; they are written best-effort, so a sign-in is not refused when its row cannot be written (register DP-14); the 2-year figure this row first stated was never implemented and is withdrawn |
| Backups | 35 days rolling + monthly | POLICY-BR-005 | **Partial (re-verified 2026-10-01)** — 35-day automated RDS backups are set in the production Terraform root (`terraform/environments/production/main.tf`, `rds_backup_retention_days = 35`; staging 7), not yet applied (no production environment); monthly retained snapshots are not implemented |
| AI prompts/completions logged by the gateway | 90 days, tenant-configurable to 0 (do not store) | minimisation | **Partial (re-verified 2026-10-01)** — gateway logging exists; no purge job and no per-tenant setting; the assistant's turn records (`ana_turn_records`, `ana_record_blobs`) are append-only audit stores (P0-8) and are kept with the audit trail, which this row's 90 days does not yet say |
| Tenant off-boarding export and deletion | export within 30 days of termination; deletion 90 days after, except records under legal hold or predicate retention | DPA | **Partial (re-verified 2026-10-01)** — the export with its attestation report (`server/services/tenant-export/`); the purge (`server/services/tenant/tenant-offboarding.ts`) runs in one transaction, refuses while a legal hold stands or when the export was truncated, erases the Vault and its stored bytes, completes for a tenant with signed records, and writes its own chained audit row (`docs/evidence/D6/2026-10-01-purge-signed-tenant/`, `docs/evidence/D6/2026-10-01-tranche-4/P1-23-purge-audit/`). The 30- and 90-day schedule is an operator procedure, not automated |

## 2. Residency
| Control | Status | Evidence |
|---|---|---|
| Primary storage in one AWS region chosen per tenant contract (launch: us-east-1; EU region on request) | **Planned** — no production environment | `terraform/environments/production` |
| AI provider placement honours the tenant's residency; failover never crosses the boundary | **Implemented** (per call, fail-closed, since 2026-09-25); embeddings of tenant documents are computed inside the deployment's VPC by default (`EMBEDDING_PROVIDER=local`, ADR-0014 §1.5, `docs/evidence/D6/2026-10-01-tranche-4/P1-54-embedding-lane/`), so Vault text does not leave it to be indexed | `server/services/ai-gateway/gateway.ts` — `applyOrgPlacementDefaults`, `tenantPlacementVerdict` (selection and every fallback rung), `assertTenantPlacement` (last mile); the tenant policy in `ai_placement_policies`, written only through `PUT /api/ai-placement-policy`; `AI_PROVIDER_PLACEMENT_APPROVALS`; evidence `docs/evidence/D6/2026-09-25-tenant-boundary/` |
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

## 3a. Decision: account and access logs are part of the audit trail (2026-10-01)

Sign-in attempts, second-factor results, sign-outs and ended sessions are written as rows of the chained
`audit_logs` store, beside the record actions they explain: an inspector reconstructing who could act on a record,
and when, reads them together (21 CFR 11.10(d)(e)). Removing them after two years would break the chain the
trail's integrity rests on, and the obligation to keep the audit trail is a legal one (GDPR Art. 17(3)(b)). They are
therefore kept as long as the audit trail. Their personal data (the e-mail address, the client address and the user
agent) is the minimum an access record needs; masking it in rows older than the records' predicate period is the
route to minimisation, and is not implemented. The DPA's description of retention is to be read against this
decision by counsel (owed: founder).

## 4. Deletion and legal hold
| Control | Status |
|---|---|
| Deletion requests honoured within 30 days except governed records under predicate retention | **Planned** — no request received; procedure to be exercised on first request |
| Legal hold flag suspending deletion | **Implemented (re-verified 2026-10-01)** — holds are placed and lifted through `/api/vault/legal-holds`, each with a chained audit row; the retention sweep and the tenant purge refuse to dispose of held records (`docs/evidence/D6/2026-09-25-p1/P1-22/`) |
| Certificate of deletion issued to the tenant | **Planned** |

## Revision history
| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 DRAFT | 2026-09-20 | W3b session | First draft |
| 0.2 DRAFT | 2026-10-01 | D6 session | Status column re-verified against the code at that day's trunk, with evidence paths. The governed-record period aligned to ADR-0014 §6 (25 years from finalization, where 0.1 said 7 years after last use); the gap between that rule and the implementation's admission clock recorded (register DP-78). Account and access logs: decided to be kept with the audit trail they belong to (below), replacing the unimplemented 2 years. Legal hold, off-boarding and backups brought up to date. |

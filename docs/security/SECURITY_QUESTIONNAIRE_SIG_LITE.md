# Standard security questionnaire (SIG-Lite style) — Concept2Cure, answered 2026-09-20

**Status:** DRAFT answers prepared by the W3b session for founder review before
release to any prospect. Every "Yes" is grounded in a file path on
`concept2cure-v2`; every gap is stated. Legend: **Implemented** / **Partial** /
**Planned**. "Production" means the hosted environment described in
`terraform/environments/production`, which as of this date has **not been
applied** (row D1 of `docs/LAUNCH_DEFINITION_OF_DONE.md`); answers about
running infrastructure say so.

## A. Organisation and governance
| # | Question | Answer | Status | Evidence |
|---|---|---|---|---|
| A.1 | Do you have a documented information security policy? | Yes, DRAFT pending founder signature. | Partial | `docs/security/policies/` |
| A.2 | Named security officer? | The founder holds the role; no independent officer. | Partial | `POLICY-IS-001` §2 |
| A.3 | SOC 2 Type II report available? | No. No observation window is open; no compliance platform contracted. | Planned | `TRUST_STATEMENT.md` |
| A.4 | ISO 27001 certified? | No. | Planned | — |
| A.5 | Third-party penetration test in the last 12 months? | No. None has been performed. | Planned | — |
| A.6 | Security awareness training for staff? | Single operator; formal training begins with the first hire. | Planned | — |
| A.7 | Cyber-insurance? | Not held. | Planned | — |

## B. Data classification, retention, residency
| # | Question | Answer | Status | Evidence |
|---|---|---|---|---|
| B.1 | Is customer data logically segregated per tenant? | Yes: every tenant table carries `organization_id`; PostgreSQL row-level security is enforced (`RLS_ENFORCE=on` required at boot in production) and the runtime connects as a non-superuser role. | Implemented (code); Partial (deployment) | `server/db/rlsEnforcement.ts`; `scripts/db/provision-app-role.mjs`; `scripts/db/rls-coverage-check.sql`; CI `ci:tenant-*` |
| B.2 | Is there an isolation test? | Yes, contract tests and CI gates; the two-tenant contract against staging is owed with D3. | Partial | `tests/socket-tenant-isolation.contract.test.ts`, `docs/security/C2C_TENANT_ISOLATION_PROOF.md`, `WO-03_TWO_TENANT_RLS_PROOF.md` |
| B.3 | Data residency options? | AWS region per tenant contract (hosting not yet applied). AI provider placement honours residency and never fails over across it; since 2026-09-25 embeddings pass the same placement decision before any provider client exists. The Terraform stack still provisions only an OpenAI key (DP-07, `docs/security/SECURITY_AUDIT_2026-09-24.md`). | Partial (AI placement, incl. embeddings); Planned (hosting, key set) | `server/services/ai-gateway/gateway.ts:2298-2344`; `POLICY-DR-007` |
| B.4 | Retention and deletion policy? | Documented. Audit stores are append-only by database trigger; the only delete path on `audit_logs` is a SECURITY DEFINER archive door that records each removed batch and refuses rows inside the 24-month hot window (2026-09-25). A per-tenant retention clock and a legal-hold API are not implemented (DP-20, `docs/security/SECURITY_AUDIT_2026-09-24.md`). | Partial | `POLICY-DR-007` |
| B.5 | Is customer data used to train AI models? | No. API traffic to model providers is not used for training under their commercial terms. A zero-data-retention lane exists for chat dispatch and, since 2026-09-25, an embedding for a zero-retention or region-resident tenant is refused unless a compliant embedding lane is configured; the default embedding provider is OpenAI (DP-07, `docs/security/SECURITY_AUDIT_2026-09-24.md`). | Implemented (gateway and embedding placement); Planned (a compliant default embedding lane) | `gateway.ts:2318-2325`; `POLICY-DR-007` §3 |

## C. Access control
| # | Question | Answer | Status | Evidence |
|---|---|---|---|---|
| C.1 | Unique accounts, no shared credentials? | Yes. | Implemented | `users.password_hash`; `resolve-signer-identity.ts` |
| C.2 | Password policy? | ≥12 chars with complexity; bcrypt cost 12. | Implemented | `server/services/auth-security-service.ts:33`; `server/routes/auth.ts:888` |
| C.3 | MFA? | TOTP (RFC 6238) with AES-256-GCM-encrypted seeds; enrolment per user; required at signing when enrolled. Not mandatory for any role; a TOTP-enrolled account can still sign in with an emailed code; recovery codes are issued but not yet redeemable (IAM-08, `docs/security/SECURITY_AUDIT_2026-09-24.md`). | Partial | `server/services/mfaService.ts`; `server/services/part11/reverify-signer.ts` |
| C.4 | Account lockout? | 5 failures lock the account for 30 minutes. The counter is a read-then-write today, so concurrent attempts can pass the threshold and a failed write does not lock (IAM-09, `docs/security/SECURITY_AUDIT_2026-09-24.md`; fix in the P1 plan). | Partial | `auth-security-service.ts:31-32` |
| C.5 | SSO / SAML? | SAML provider module exists; not wired for a customer. | Partial | `server/services/saml-provider.ts` |
| C.6 | Role-based access? | Yes; signing authority is a configurable policy. Routes guarded by role read the role minted into the session token, so a demotion takes effect at the token's expiry rather than on the next request (IAM-10, `docs/security/SECURITY_AUDIT_2026-09-24.md`; fix in the P1 plan). | Partial | `server/services/part11/signing-authority.ts` |
| C.7 | Session management? | Signed JWT with a separate refresh secret (must differ, ≥32 chars, boot-enforced). Access token lifetime defaults to 1 day, refresh to 7 days. Since 2026-09-25 a revocation lasts the token's own lifetime, the enterprise refresh endpoint rotates and revokes, and a password change ends every earlier session. No inactivity time-out or per-user sign-out-everywhere yet (IAM-04, IAM-06, `docs/security/SECURITY_AUDIT_2026-09-24.md`). | Implemented (secrets, termination); Planned (shorter lifetime, idle logoff) | `server/config/environment.ts:330` |
| C.8 | Periodic access reviews? | Not yet performed. | Planned | — |
| C.9 | Privileged production access? | No production account yet; will be founder-only with MFA. | Planned | — |

## D. Encryption and key management
| # | Question | Answer | Status | Evidence |
|---|---|---|---|---|
| D.1 | Encryption in transit? | TLS 1.2/1.3 at the load balancer (`ELBSecurityPolicy-TLS13-1-2-2021-06`). | Partial (terraform defined, not applied) | `terraform/modules/alb/main.tf:27` |
| D.2 | Encryption at rest? | RDS `storage_encrypted = true` on the AWS-managed key (a customer-managed key is not yet passed, INF-14); the S3 evidence bucket uses a customer-managed KMS key with Object Lock. Terraform-defined, not yet applied. | Partial (terraform defined, not applied; AWS-managed RDS key) | `terraform/modules/rds/main.tf:27-28`; `terraform/modules/compliance-evidence/main.tf` |
| D.3 | Application-level encryption of secrets? | MFA seeds and connector credentials AES-256-GCM under dedicated keys; production refuses to boot without them. | Implemented | `mfaService.ts:190`; `connector-registry.ts:81`; `environment.ts` |
| D.4 | Key management? | SOP-SEC-001 (DRAFT v0.2). Symmetric keys in Secrets Manager (terraform module); release-signing key in AWS KMS behind `CONCEPT2CURE_SIGNER_MODE=kms`. | Partial — KMS path implemented in code with a fake KMS in tests; **not executed against a live KMS** | `docs/SOP_KEY_MANAGEMENT.md`; `server/services/signature/` |
| D.5 | Key rotation? | KMS: documented procedure, envelopes carry key ARN. Symmetric seal keys: rotation not supported in code yet. | Planned | `SOP_KEY_MANAGEMENT.md` §5 |

## E. Audit logging and integrity (21 CFR Part 11)
| # | Question | Answer | Status | Evidence |
|---|---|---|---|---|
| E.1 | Immutable audit trail? | Three chained tables; UPDATE and DELETE refused by trigger on each. The runtime role holds SELECT+INSERT only on `audit.tamper_proof_log`; on `audit_logs` and `audit_events` it still holds a table-level DELETE grant from the schema-wide recipe, which the triggers refuse (the only delete path is the archive door, 2026-09-25); withdrawing the grant is planned (DP-04, `docs/security/SECURITY_AUDIT_2026-09-24.md`). | Implemented (triggers); Partial (grants) | `db/migrations/20260813_audit_tamper_proof_log.sql`, `20260222_audit_events_immutability.sql`, `20260617_audit_logs_immutability.sql` |
| E.2 | Tamper evidence? | SHA-256 hash chains plus HMAC seals keyed outside the database. `audit_events` seal writer is deferred by design (plan §3). | Implemented (`tamper_proof_log`, `audit_logs`); Partial (`audit_events` seal) | `server/lib/tamper-proof-audit.ts`; `server/services/audit/chain.ts`; `docs/AUDIT_INTEGRITY_HMAC_PLAN.md` |
| E.3 | Can integrity be verified on demand? | Yes: `npm run ops:verify-audit-chain` walks all three tables, prints counts and the first break, exits non-zero on a break. Proven by corrupting one row in each table inside a rolled-back transaction. | Implemented | `scripts/ops/verify-audit-chain.mjs`; `docs/evidence/W3b/2026-09-20/` |
| E.4 | Electronic signatures compliant with §11.50/§11.70/§11.200? | One canonical write path with printed name, meaning, timestamp, content binding with explicit basis, re-authentication at signing, tenant-scoped verification, and an append-only supersession chain for revocation (its trigger accepted revocation from 2026-09-25). Twenty-three legacy HTTP writers still record a "signature" outside that ceremony and are being retired (DP-02, `docs/security/SECURITY_AUDIT_2026-09-24.md`); a closed meaning vocabulary is being enforced (DP-17). | Partial | `server/services/part11/signature-persistence.ts`; `reverify-signer.ts`; `server/routes/c2c/artifacts.ts` removal note; `signature-writers-grep.txt` |
| E.5 | Cryptographic (asymmetric) signatures? | KMS RSA signature over the release digest, stored beside the HMAC seal with algorithm and key id; verifiable online (KMS Verify) and offline (public key). | Implemented in code; live path unexecuted | `server/services/signature/payload-signer.ts` |
| E.6 | SIEM integration? | Admin-only, rate-limited SIEM export endpoint. | Implemented | `server/routes/admin/audit-siem.ts` |
| E.7 | Log retention? | Same as the records; never shorter. | Implemented (immutability); Planned (retention clock) | `POLICY-DR-007` |

## F. Secure development and change management
| # | Question | Answer | Status | Evidence |
|---|---|---|---|---|
| F.1 | SDLC with code review? | Single canonical branch, CI gates, control-tower review. The branch has no protection rule and CI does not block a push; there is no independent human reviewer (INF-01, `docs/security/SECURITY_AUDIT_2026-09-24.md`). | Partial | `CLAUDE.md`; `.husky/pre-push`; `.github/workflows/ci.yml` |
| F.2 | SAST? | CodeQL in CI (blocking per commit); Semgrep runs but is advisory (`continue-on-error`); ESLint warning ratchet (INF-10, `docs/security/SECURITY_AUDIT_2026-09-24.md`). | Partial | `.github/workflows/codeql.yml`, `semgrep.yml` |
| F.3 | Dependency scanning? | `npm audit` gate sealed to the lockfile with a reviewed exception ledger that expires. | Implemented | `scripts/ci/check-dependency-risk.mjs`; `docs/security/dependency-risk-ledger.json` |
| F.4 | Secrets in source? | None in the working tree (checked on every push by `ci:committed-secrets`); `.env.example` only. A database credential remains in git history pending rotation (INF-22); the boot check refuses absent or short secrets but does not screen placeholder values (INF-16, `docs/security/SECURITY_AUDIT_2026-09-24.md`). | Partial | `.env.example`; `environment.ts` |
| F.5 | Separate environments? | staging and production terraform; preview databases (Neon) for CI. | Partial | `terraform/environments/` |
| F.6 | Change control for validated state? | Planned with the validation package (row D4). | Planned | — |

## G. Availability, backup, incident response
| # | Question | Answer | Status | Evidence |
|---|---|---|---|---|
| G.1 | Backups and restore testing? | RDS automated backups (terraform); restore drill script and CI proof workflow; not yet timed on production. | Partial | `scripts/ops/dr-restore-drill.sh`; `.github/workflows/database-dr-restore-proof.yml` |
| G.2 | RTO/RPO? | Targets: RPO ≤5 min, RTO ≤4 h; not yet measured. | Planned | `POLICY-BR-005` |
| G.3 | Incident response plan? | Written (DRAFT); no tabletop; no incidents to date. | Partial | `POLICY-IR-004` |
| G.4 | Breach notification? | 72 hours to affected tenants is the intended commitment; the DPA draft still says 48 hours and neither document yet states the regulator timelines (HIPAA §164.410, GDPR Art. 33, APPI Art. 26). To be reconciled before contracting (INF-07, `docs/security/SECURITY_AUDIT_2026-09-24.md`). | Planned | `docs/commercial/` |
| G.5 | Monitoring? | Boot security self-test; readiness probe; CloudTrail in terraform; no GuardDuty/WAF. | Partial | `server/services/securityHealth.ts`; `server/startup/inline-endpoints.ts` |

## H. AI and model governance
| # | Question | Answer | Status | Evidence |
|---|---|---|---|---|
| H.1 | Which AI providers? | Anthropic (Claude) primary; OpenAI, Moonshot, Vertex, Azure, Bedrock as governed lanes; local lane low-risk only. | Implemented | `server/services/ai-governance/approved-models.ts` |
| H.2 | Can a tenant restrict providers/regions? | Yes: placement approvals per provider with region and ZDR; sensitive dispatch never crosses them. | Implemented | `sensitive-placement-policy.ts`; `gateway.ts` |
| H.3 | Human oversight of AI output? | Every governed action requires a human re-authenticated signature; deterministic engines produce all figures. | Implemented | `POLICY-AI-008` |
| H.4 | PII/PHI protection on AI traffic? | PII screen (default block) and groundedness gate; posture visible at boot. | Implemented | `server/startup/ai-governance-posture.ts` |
| H.5 | BAA with the model provider? | Not signed; required before the first PHI-bearing tenant. | Planned | `POLICY-DR-007` §3 |
| H.6 | Model validation (PQ) for regulated drafting? | Eval harness exists; PQ evidence for the launch model not yet filed. | Partial | `server/eval/` |

## Sign-off
| Role | Name | Date | Signature |
|---|---|---|---|
| Founder / acting Security Officer | | | |

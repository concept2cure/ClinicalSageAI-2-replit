# Security Controls Implementation Map — CSO / Auditor Verification Pack

**Platform:** Concept2Cure RIAI / ClinicalSageAI (regulatory-intelligence platform for life sciences)
**Date:** 2026-06-08
**Purpose:** A control-by-control map a pharma/biotech/MDx client CSO (or their pen-test/audit vendor) can use to *verify* the platform's security posture for a licensing decision. Each row gives the **control**, **how it's implemented**, the **evidence** to inspect, and the **CI gate** that keeps it from regressing.

This is the verification companion to `PHARMA_CSO_SECURITY_EVALUATION_2026-06-08.md` (the narrative assessment). It reflects the current state of `concept2cure-v2`, including the security work landed in PRs #698, #705, #706, #707.

> **Framework mapping:** rows are grouped by the domains used by SIG / CAIQ (CSA STAR) / HECVAT and pharma vendor questionnaires, and annotate 21 CFR Part 11 / GDPR / HIPAA / NIST CSF where relevant.

---

## How to verify (for the auditor)
- **Code evidence:** every claim cites a `path` (and often a symbol). Clone the repo and inspect.
- **Enforcement:** "CI gate" columns name an `npm run ci:*` check (or workflow job) that **fails the build** if the control regresses — so the control is not just present but *held*. Run `npm run <gate>` to reproduce.
- **Tests:** security-relevant behavior is pinned by contract tests under `server/__tests__/security/` (run `npm run test:security`).

---

## 1. Identity & Access Management

| Control | Implementation | Evidence | CI gate / test |
|---|---|---|---|
| Authentication | JWT, HS256 **algorithm-pinned**; bcrypt-12; NIST password policy; brute-force lockout; zero-downtime secret rotation | `server/utils/jwtVerify.ts`, `server/routes/auth.ts` | `ci:jwt-verify-pinned`, `ci:password-hygiene` |
| MFA | **Universally enforced** at login — every login issues a 2FA challenge (TOTP or email-OTP) | `server/routes/auth.ts` ("Always require 2FA"), `mfaService`, `emailOtpService` | `test:security` |
| Dev-auth backdoors | Removed; dev shortcuts double-gated (`NODE_ENV=development` **and** `ALLOW_DEV_AUTH=1`) | `server/auth/dev-auth-policy.ts` | `ci:no-dev-auth-in-prod` |
| Enterprise SSO (SAML 2.0) | **Fail-closed**, vetted library (`@node-saml/node-saml`): signed-assertion required, C14N signature, audience + InResponseTo, no open-redirect | `server/services/saml-provider.ts`, `server/routes/sso.ts` (PR #698) | `ci:saml-fail-closed`, `saml-provider.test.ts` |
| SSO provisioning (SCIM 2.0) | Users lifecycle (create/update/**deactivate**), Groups (RBAC-role-mapped), discovery; bearer auth (constant-time) | `server/routes/scim.ts` (PR #705) | `scim-provisioning.contract.test.ts` |
| Multi-tenant identity | Per-org SAML + SCIM via `SAML_TENANTS` / `SCIM_TENANTS`; one deployment serves many client orgs | `server/routes/scim.ts`, `server/routes/sso.ts` (PR #706) | `scim-provisioning.contract.test.ts` |
| Account deprovisioning evidence | SCIM lifecycle events → append-only `audit_events` (`scim.user.deactivated`) — offboarding audit (Part 11 §11.10(d)) | `server/routes/scim.ts` `auditScim()` (PR #705) | `scim-provisioning.contract.test.ts` |
| RBAC | Role + org-membership model; global `/api` auth gate | `server/bootstrap/register-platform-routes.ts`, `server/middleware/auth.ts` | `api-auth-gate.test.ts` |

## 2. Multi-Tenant Data Isolation

| Control | Implementation | Evidence | CI gate / test |
|---|---|---|---|
| Tenant boundary (primary) | Org id sourced **only** from the verified JWT; record handlers return 404 (not 403) on cross-tenant id | `server/utils/authedOrgId.ts`; 22 contract suites | `ci:tenant-isolation:no-regression` |
| Tenant boundary (defense-in-depth) | Postgres RLS; **boot-assertion** warns (or hard-fails via `RLS_REQUIRE_ENFORCE`) if RLS off in prod | `server/db/tenantRls.ts`, `server/db/rlsEnforcement.ts` (PR #698) | `ci:rls-allowlist-sync`, `rlsEnforcement.test.ts` |
| RLS request-scoping | New tenant routes must use `requestDb(req)` | `server/db/requestDb.ts` | `audit-requestdb-coverage` |
| IDOR | 8 findings closed (global-compliance, intelligent-reports, foresight, branding, pm-settings, tenants-simple, collab-WS) | `QC_SECURITY_REVIEW_2026-06-07.md` | `test:security` (133 tests) |

## 3. AI Data Governance (the differentiator for a regulated buyer)

| Control | Implementation | Evidence | CI gate / test |
|---|---|---|---|
| Single audited egress | All LLM calls go through one gateway `route()`; per-call audit (substrate/region/retention/prompt-hash, no plaintext) | `server/services/ai-gateway/gateway.ts`, `audit.ts` | `ci:gateway-bypass` (ratchet) |
| Data residency / ZDR | **Hard constraints** — a model fallback never relaxes residency or zero-retention | `ai-gateway/providers/placement.ts`, per-org `aiPlacementPolicies` | — |
| Air-gapped option | Fully on-prem inference + local embeddings | `AI_LOCAL_ENABLED`, `embedding-provider.ts` | — |
| Prompt-injection | High-precision detector on untrusted user messages | `ai-gateway/promptInjection.ts` | `promptInjection.test.ts` |

## 4. 21 CFR Part 11 / GxP

| Control | Implementation | Evidence | CI gate / test |
|---|---|---|---|
| Tamper-evident audit | SHA-256 hash-chain + HMAC; DB-trigger immutability; background integrity monitor | `server/services/audit/chain.ts`, `server/lib/tamper-proof-audit.ts` | `audit:verify:full` |
| Regulated-delete audit (§11.10(e)) | Delete + audit in one transaction (fail-closed); **empty allowlist** | `server/routes/{ind,coauthor,ectd-documents,authoring.router}.ts` | `ci:regulated-delete-audit` (allowlist = 0) |
| E-signatures (§11.50/11.70) | Password + TOTP re-auth, signature manifest, deterministic hash | `server/routes/esignature.ts` | `test:security` |
| Reason-for-change (§11.4(c)) | Mandatory (≥8 chars) on governed mutations | `server/routes/c2c/documents.ts`, `c2c/actions.ts` | — |

## 5. Application Security

| Control | Implementation | Evidence | CI gate / test |
|---|---|---|---|
| HTTP hardening | Helmet + per-request CSP nonce + `strict-dynamic`, HSTS preload, locked CORS allowlist | `server/middleware/enterprise-security.ts` | — |
| Injection | Drizzle parameterized; Zod at boundaries; singleton pool | repo-wide | `ci:ban-new-pool` |
| XSS | DOMPurify (client + isomorphic) on all rendered markdown/HTML; CSP nonce | `client/.../renderSafeMarkdown.ts` | — |
| Rate limiting | `/api/*` global + per-prefix; **SCIM** (`/scim/v2`) now per-IP limited | `enterprise-security.ts`; `server/routes/scim.ts` `scimRateLimiter` (PR #707) | — |
| File upload | Magic-byte validation, size caps, ClamAV, tenant-scoped storage | `server/utils/fileSignature.ts`, `virusScan.ts` | — |
| Telemetry PII leak | Fail-closed Sentry `beforeSend` scrubber (secrets + email/SSN, structure-preserving) | `server/utils/sentry.ts`, `services/observability/redaction.ts` (PR #698) | `telemetry-redaction.test.ts` |

## 6. Supply Chain / DevSecOps

| Control | Implementation | Evidence | CI gate / test |
|---|---|---|---|
| Secret scanning | GitGuardian on every PR | PR checks | GitGuardian (required) |
| Dependency audit | `npm audit` via documented allowlist; legacy-dep quarantine | `scripts/ci/audit-with-allowlist.mjs` | Security Scan job |
| SBOM | **CycloneDX SBOM** (prod tree) published as a 90-day CI artifact | `npm run sbom`; Security Scan job (PR #698) | Security Scan job |
| Vuln disclosure | `SECURITY.md` + **RFC 9116 `/.well-known/security.txt`** | `server/routes/well-known.ts` (PR #707) | `well-known-security-txt.test.ts` |
| Enforced CI gates | Tenant-isolation, JWT-pinning, no-dev-auth-in-prod, password-hygiene, regulated-delete, gateway-bypass, SAML-fail-closed, route-mount/ownership | `.github/workflows/ci.yml`, `scripts/ci/*` | (all merge-gating) |

## 7. Logging, Monitoring, Error Handling

| Control | Implementation | Evidence |
|---|---|---|
| No stack/PII leak in prod errors | Generic 5xx; curated 4xx | `server/middleware/errorHandler.ts` |
| Redaction | Secret/PII redaction service for telemetry | `server/services/observability/redaction.ts` |
| Request correlation | Hardened `X-Request-Id` | `server/middleware/enterprise-security.ts` |

---

## Honest gap register (what is NOT yet done — and why it's not code)

| Gap | Type | Path to close |
|---|---|---|
| **SOC 2 Type II report** | Organizational / audit | Independent auditor, ≥6-month window — compliance calendar, not code. |
| **Third-party penetration test** | Organizational | Commission a pen test; this map + the contract tests are the prep artifacts. |
| **RLS-enforce-on by default / Trivy merge-gating / gateway-bypass `--strict`** | Env-dependent flip | Confirm a clean baseline in staging CI, then flip (`RLS_ENFORCE=on`, remove `continue-on-error`, ratchet baseline to 0). Boot-assertion + ratchets are in place. |
| **KMS/HSM e-signature signer** | Env-dependent | Wire `CONCEPT2CURE_SIGNER_MODE=hsm_kms` against real KMS (SOP in `docs/SOP_KEY_MANAGEMENT.md`). DEV password+TOTP acceptable pre-submission. |
| **Live-IdP SSO/SCIM interop** | Env-dependent | Validate against Okta/Entra/Ping in staging (fail-closed unit tests prove the security property; interop needs a real IdP). |
| **DB-backed self-serve identity config + admin UI** | Larger feature | Add `enterprise_sso_config` table + admin endpoints so orgs configure SSO/SCIM without env vars (current: env JSON maps). |
| **Column-level PII encryption; mTLS between services** | Larger / infra | Roadmap. |

---

## Verdict for a licensing decision
The **code-actionable** security posture is strong and *enforced* (not just present): fail-closed enterprise SSO, full audited SCIM with multi-tenant support, hard-constraint AI data governance, real 21 CFR Part 11 controls, an unusually deep suite of merge-gating CI checks, and verification tests for the security-critical behaviors. The remaining licensing gates are now predominantly **organizational attestations (SOC 2, pen test)** and **environment-dependent flips** — not missing controls. A client CSO can defensibly approve licensing **conditional on** the SOC 2 report (or a Type I + bridge) and a pen-test summary, with the env-dependent flips scheduled for the deployment runbook.

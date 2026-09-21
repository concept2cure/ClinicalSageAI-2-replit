# POLICY-AC-002 — Access Control Policy (DRAFT)

**Owner:** Founder. **Review:** annually. **TSC:** CC6.1–CC6.3, CC6.6–CC6.8.

## 1. Identity and authentication
| Control | Status | Evidence |
|---|---|---|
| Unique user accounts; shared accounts prohibited | **Implemented** | `users` table, per-user `password_hash`; `server/services/part11/resolve-signer-identity.ts` refuses an unresolvable signer |
| Password policy: 12+ characters, complexity, bcrypt cost 12 | **Implemented** | `server/services/auth-security-service.ts:33-60` (`PASSWORD_MIN_LENGTH = 12`, `validatePasswordPolicy`); `server/routes/auth.ts:888` (`bcrypt.hash(password, 12)`) |
| Account lockout after failed attempts | **Implemented** | `auth-security-service.ts:31-32` (5 attempts, 30-minute lockout) |
| Multi-factor authentication (TOTP, RFC 6238) with encrypted seeds | **Implemented**; enrolment is per user, not yet mandatory for all roles (**Partial**) | `server/services/mfaService.ts` (AES-256-GCM under `MFA_ENCRYPTION_KEY`) |
| SSO (SAML) | **Partial** — provider module exists; not wired for a customer | `server/services/saml-provider.ts` |
| Session tokens: signed JWT + refresh token, distinct secrets, ≥32 chars | **Implemented** | `server/config/environment.ts` (refuses boot when `REFRESH_TOKEN_SECRET` equals `JWT_SECRET`); default access-token lifetime 1 day (`expiresIn: '1d'`, line 330) — **to be shortened for regulated tenants (Planned)** |
| Dev-login bypass never reachable in production | **Implemented** | `POST /api/auth/dev-login` guarded by `NODE_ENV !== 'production'` (`AGENTS.md`) |

## 2. Authorisation
| Control | Status | Evidence |
|---|---|---|
| Role-based access; signing authority is a policy, not an inline list | **Implemented** | `server/services/part11/signing-authority.ts` (`ESIGNATURE_SIGNING_ROLES`) |
| Tenant isolation enforced in the database (RLS), runtime role non-superuser | **Implemented** in code; **Partial** in deployment (staging/production not yet applied — row D3) | `server/db/rlsEnforcement.ts`, `scripts/db/provision-app-role.mjs`, `scripts/db/rls-coverage-check.sql`, `tests/*tenant*.contract.test.ts`, CI gates `ci:tenant-entry-points`, `ci:tenant-column-types`, `ci:tenant-blind-models` |
| Reads of signature records are tenant-scoped | **Implemented** (2026-09-20, upstream commit dddd92c5) | `server/services/auth-security-service.ts` `verifySignatureIntegrity(signatureId, organizationId)`; `server/routes/__tests__/authEnterprise-signature-verify-tenant.test.ts` |
| Separation of duties on governed approvals | **Partial** | `server/services/governance/separation-of-duties.ts` |
| Least privilege on the audit schema (SELECT+INSERT only for the runtime role) | **Implemented** | `db/migrations/20260813_audit_tamper_proof_log.sql` header; `scripts/db/provision-app-role.mjs` |

## 3. Electronic signatures (§11.100–§11.300)
| Control | Status | Evidence |
|---|---|---|
| Re-authentication (password, plus TOTP when enrolled) at the moment of signing | **Implemented** | `server/services/part11/reverify-signer.ts` |
| Client cannot assert its own authentication | **Implemented** | `reverify-signer.ts` derives `authenticationMethod`; the route that accepted it was deleted 2026-09-20 (`server/routes/c2c/artifacts.ts` removal note) |
| One signature substrate, one INSERT | **Implemented** for `electronic_signatures`; **Partial** platform-wide (see POLICY-IS-001 §3) | `server/services/part11/signature-persistence.ts` |
| Signature/record linking with an explicit binding basis | **Implemented** | `BINDING_BASIS` in `signature-persistence.ts` |
| Cryptographic signer (KMS) behind the signer seam | **Implemented in code, unexecuted live** | `server/services/signature/`, `docs/SOP_KEY_MANAGEMENT.md` §10 |

## 4. Access reviews and offboarding
| Control | Status | Evidence |
|---|---|---|
| Quarterly access review of tenant admins and platform operators | **Planned** — no review has been performed | — |
| Offboarding within one business day | **Planned** | — |
| Privileged access to production (AWS console, database) limited to the founder, MFA-protected | **Planned** — no production account exists yet (row D1) | — |

## Revision history
| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 DRAFT | 2026-09-20 | W3b session | First draft |

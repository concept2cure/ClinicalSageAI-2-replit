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
| Quarterly access review of tenant admins and platform operators | **Partial**. For each organisation, the review is a signed record in the product, and an overdue review is flagged in the user access review report (P1-43, 2026-10-01). No review has been recorded yet. The platform-operator review has a written procedure (§4a) but has not been performed | §4a; `public.compliance_review_records`, `server/services/audit/compliance-reviews.ts`; `docs/evidence/D6/2026-10-01-tranche-4/P1-25-P1-43-review-records/`; operator records under `docs/evidence/D6/access-reviews/` |
| Offboarding within one business day | **Planned** | — |
| Privileged access to production (AWS console, database) limited to the founder, MFA-protected | **Planned** — no production account exists yet (row D1) | — |

## 4a. Access-review procedure

Run quarterly (first week of January, April, July, October) and after any change of platform operator. The reviewer
is the founder until a second operator exists; then the two review each other's access.

**The record.** There are two kinds of record, depending on what is being reviewed:

- **An organisation's access.** This is the *access-review record* in the product (P1-43; ADR-0014 §8). The
  organisation's reviewer runs the user access review (Reporting & analytics → Audit & compliance reports). They then
  record the review in **Periodic reviews → Record review → User access review** on the same screen.
  - The record holds the period, what was covered (the user access review run it names by export id and data hash),
    the outcome, and one decision line per privileged account: user, role, keep / reduce (to what) / remove, and the
    change that carried a reduce or remove out.
  - The product checks the record when it is recorded, and again when it is signed:
    - The period ended no more than three months ago, and starts no later than the day after the last signed access
      review ended, so no days go unreviewed.
    - The run it names is a user access review this organisation ran, with that export id and data hash.
    - Each line matches the organisation's current roles and memberships. A keep names a member with the role the
      member holds now. A reduce names the role now in effect. A remove names an account whose removal from the
      organisation was recorded (by an administrator in the product, or by SCIM provisioning) or a member whose
      account is deactivated. A reduce or remove is therefore recorded once it has been carried out.
    - Every account that holds an owner, admin, manager or platform role now, by current roles and memberships, has
      a line. A role on a past date is not reconstructed, so a past role is not checked.
  - The reviewer signs it through the platform's signing ceremony: meaning *review*, a reason, the password, and the
    second factor where one is enrolled. Once signed, no role can change or delete it, and a correction is a new review.
  - The user access review report names the latest signed record, the one covering the most recent period. The next
    review is due three months after the end of that period. The report shows **Overdue** once the report date is past
    that due date, and says "No access review recorded" when there is none.
  - When an organisation is offboarded, its review records are returned in the tenant export and are kept with the
    audit trail (DPA §3.5): the tenant purge does not erase them.
- **Platform operators.** These are identities outside any organisation: AWS, GitHub, and the platform's secrets. The
  record is one Markdown file per review at `docs/evidence/D6/access-reviews/<yyyy-mm-dd>.md`. It holds the lists as
  reviewed (copied in, not linked), the reviewer, the date, each decision and the change that carried it out.

**Platform operators** — every identity that can reach production or the repository as an operator:

1. AWS: IAM users, roles and their attached policies in the production account (`aws iam list-users`,
   `list-roles`, `list-attached-*-policies`); the root account's MFA state. Expected: no IAM users with console
   access other than the founder's, MFA on every human identity, the deploy roles of `terraform/modules/github-deploy-roles`
   trusting only the repository's environments.
2. GitHub: organisation members and outside collaborators with write to `concept2cure/ClinicalSageAI-2-replit`, and
   the installed GitHub Apps' permissions. Expected: the founder and the agents the founder has authorised, nothing else.
3. Platform roles in the product: `platform_role_grants` rows and `PLATFORM_ADMIN_EMAILS` in the task definition,
   read through Master Administration (`/api/admin/master/*`). Expected: the founder alone until a second operator
   is appointed in writing.
4. Secrets: the age of every secret in Secrets Manager against `docs/SOP_KEY_MANAGEMENT.md`'s rotation periods.

**Tenant administrators** — for each organisation, the memberships with role owner, admin or manager
(`organization_users`), read through the admin console (`AdminAccess.tsx`, `GET /api/tenants/:id/users`) or Master
Administration. The tenant's own owner confirms each; a membership nobody confirms is set to member, and an account
whose person has left is suspended (POLICY-AC-002 §4 offboarding; `PATCH /api/admin/master/users/:id/status`).

**Decisions and evidence.** Each line of the lists gets one of: keep, reduce (to what), or remove (how, and the ledger
entry that shows it). A review is complete when:

- every line has a decision;
- every remove or reduce has landed; and
- the record names the audit-ledger entries of those changes (`GET /api/audit-trail/ledger`).

A review that finds nothing to change is still recorded and signed, because the record is the control.

## Revision history
| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 DRAFT | 2026-09-20 | W3b session | First draft |
| 0.2 DRAFT | 2026-09-26 | D6 session | §4a access-review procedure (operators: AWS, GitHub, platform roles, secrets; tenant administrators through the tenant's owner), quarterly, with the record format; the first review is the founder's (security audit 2026-09-24, INF-07 / plan P1-13). |
| 0.3 DRAFT | 2026-10-01 | D6 session | §4 and §4a: an organisation's access review is now a signed access-review record in the product, refused while a privileged account has no decision, fixed once signed. The user access review report names the latest one and flags it overdue after three months (P1-43; ADR-0014 §8). Platform operators stay on the Markdown record. Fix round (DP-69, DP-70): the record is checked against current roles and memberships, the run it names and the period; the due date runs from the end of the period reviewed; the records are kept at offboarding. |

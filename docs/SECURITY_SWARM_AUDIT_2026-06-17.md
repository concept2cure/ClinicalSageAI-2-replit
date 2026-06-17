# Platform Security Audit — Multi-Agent Swarm Review

**Date:** 2026-06-17
**Authority:** Chief Security Officer (platform security review)
**Scope:** Full server-side application, multi-tenant data access, authentication,
audit-trail integrity, injection surface, secrets/config, API hardening, and
supply-chain / CI-CD / IaC.
**Method:** Seven specialized security agents audited non-overlapping domains in
parallel; the CSO consolidated findings, prioritized by *exploitability ×
regulated-data impact*, and remediated the highest-risk issues on branch
`claude/security-multi-agent-swarm-2bkn4k`.

> Regulatory context: this is a multi-tenant SaaS handling regulated clinical /
> regulatory content (HIPAA, 21 CFR Part 11, GxP, EU MDR/IVDR, GDPR). For this
> class of system, **cross-tenant data leakage and audit-trail forgery are the
> two highest-consequence failure modes** and were prioritized accordingly.

---

## 1. Executive summary

The platform is, overall, **maturely hardened**: strong JWT secret handling
(fail-closed, ≥32 chars, rotation), bcrypt cost 12, AES-256-GCM MFA secrets,
HMAC-sealed + hash-chained `audit_logs`, a compliant e-signature flow
(`esignature.ts`), strict production CSP with per-request nonces, fail-closed
rate limiting on auth, prototype-pollution scrubbing, and a large suite of
tenant-isolation contract tests. **No committed secrets and zero Critical/High
npm advisories.**

However, the swarm surfaced a cluster of **genuinely exploitable** issues that
have now been remediated in this branch, plus a backlog of important
defense-in-depth and Part 11 hardening items.

### Remediated in this change set

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | **CRITICAL** | Cross-tenant IDOR: `client-intelligence` document / checklist / memory endpoints scoped by client-supplied `profileId` only — any authed user could read another tenant's ingested clinical documents and learned memory. | Pushed mandatory `organizationId` scoping **into the service layer** (`getIngestedDocuments`, `getDocumentChecklist`, `getMemoryEntries`) — fail-closed; routes pass the authenticated org. |
| 2 | **CRITICAL** | Cross-tenant IDOR: 510(k) document list, document-by-id, and three FDA-form PDF renderers (`documentOrchestrationRoutes.ts`) returned regulated document content with no org filter. | All five read paths now scope by `organizationId` from the authenticated context; cross-tenant ids return 404 (non-enumerable). |
| 3 | **HIGH** | SQL injection: `sql.raw` array interpolation of request-body values in GRDHE data-residency config (`allowedProcessingRegions`, `fieldLevelEncryptionFields`). | Parameterized array binding via `sql.join` + strict allow-list / identifier validation. |
| 4 | **HIGH** | SQL injection: `sql.raw` array interpolation of request-body `agencies` in the regulatory digital-twin simulation insert. | Parameterized array binding + agency allow-list. |
| 5 | **HIGH** | MFA bypass via JWT token-type confusion: refresh / MFA-challenge / MFA-partial tokens are signed with the same secret as access tokens and were accepted by the access-token middleware, letting a password-only (pre-MFA) session reach protected routes. | Access paths (`authenticateToken`, `optionalAuth`, canonical `authMiddleware`) now reject any non-access token class. |
| 6 | **MEDIUM** | `.gitignore` only ignored `.env` / `.env.local` — `.env.production`, `*.pem`, `*.key`, `id_rsa`, `secrets.json` were one `cp` away from being committed. | Broadened ignore rules to all `.env.*` (with `*.example` negation), private keys, certs, and credential bundles. |

---

## 2. Findings by domain

Severity key: **CRITICAL** (exploitable, regulated-data loss) · **HIGH**
(exploitable or regulated-control failure) · **MEDIUM** (conditional / hardening
with real risk) · **LOW** (defense-in-depth).

### 2.1 Multi-tenant isolation — *the #1 risk, partially remediated*

Authentication is enforced centrally and correctly (global `/api` gate +
JWT-derived org context, header-spoofing blocked). **Isolation, however, is
enforced per-route, not centrally** — Postgres RLS is **off by default**
(`RLS_ENFORCE=off`), so the app-layer org filter is effectively the sole
boundary, and any route that forgets it is directly exploitable.

- ✅ **Remediated:** `documentOrchestrationRoutes.ts` (5 routes) and
  `client-intelligence.ts` (3 routes) + their service functions — see table above.
- ⏳ **Backlog (HIGH):** `server/storage.ts` `getDocuments` / `getDocumentByName`
  / `updateDocument` / `deleteDocument` are org-blind; the `GET /api/documents/`
  list route calls `getDocuments` with no org id (cross-tenant enumeration).
  Mutations are currently safe *only* via a prior tenant-scoped existence check
  in callers — fragile. Push org scoping into these storage methods (fail-closed).
- ⏳ **Backlog (HIGH):** `project-sections.ts` `extractOrgId()` falls back to
  `|| 1` on missing context — replace with a 403, mirroring `requireAuthedOrgId`.
- ⏳ **Backlog (HIGH):** `document-data-center.ts` `GET/DELETE /file/:id` extract
  `organizationId` but never apply it (currently stubbed — fix before implementing).
- ⏳ **Backlog (strategic):** Turn on RLS as a backstop (`RLS_ENFORCE=on`,
  `RLS_REQUIRE_ENFORCE=true` in prod) so the next missed route fails to *zero
  rows* instead of leaking. This converts isolation from "every route must be
  perfect" to fail-closed.

### 2.2 Authentication / authorization / JWT

- ✅ **Remediated (HIGH):** token-type confusion / MFA bypass (see table).
- ⏳ **Backlog (MEDIUM):** Require a distinct `REFRESH_TOKEN_SECRET` in all
  non-dev environments (staging/beta currently fall back to the access secret).
- ⏳ **Backlog (MEDIUM):** API-key scopes are captured at creation but never
  enforced — add a `requireScope(scope)` guard reading `req.apiScopes`.
- ⏳ **Backlog (MEDIUM):** Two divergent auth middlewares exist; the weaker `.ts`
  variant derives `admin` purely from JWT claims with no DB re-check. Consolidate
  on the DB-backed role resolution used in `server/auth.ts`.
- ⏳ **Backlog (MEDIUM):** MFA secret encryption can fall back to a JWT-derived
  key in prod unless `MFA_REQUIRE_DEDICATED_KEY=true` — make the dedicated key
  mandatory in production.

### 2.3 Audit-trail integrity / 21 CFR Part 11 — *regulated control gaps*

The `audit_logs` chain (HMAC-sealed + content-verified) and `esignature.ts`
(server-side re-auth + record binding) are strong. The gaps are on the
*inspection-facing* `audit_events` table and the generic audit endpoints:

- ⏳ **Backlog (HIGH):** `POST /api/audit/events`, `/events/batch`, and especially
  `POST /api/audit/signatures` trust client-supplied `user_id` / `signed_by` —
  any authed user can write **permanent, spoofed attribution** and forge a
  "21CFR11 signed" event with no re-auth or record binding. Source identity from
  the authenticated principal; route signatures through `esignature.ts`. *(Part
  11 §11.10(b)/(e), §11.50, §11.100, §11.200.)*
- ⏳ **Backlog (HIGH):** `audit_events` hash chain is **unkeyed SHA-256** (no HMAC
  seal) — forgeable by anyone with DB write. Add an HMAC seal mirroring
  `audit_logs`.
- ⏳ **Backlog (HIGH):** Integrity-critical immutability/chain triggers live only
  in the non-Drizzle `db/migrations/` pipeline; a deploy running only Drizzle
  migrations yields a fully mutable, unchained audit table (warning, not failure).
  Unify the pipelines + add a fail-closed startup self-check.
- ⏳ **Backlog (MEDIUM):** Approval/reject/delegate transitions audit
  non-transactionally and post-commit; export self-audit and chained-mirror
  writes are best-effort (swallowed). Wrap state-change + audit in one
  transaction; fail closed on governed mutations.
- ⏳ **Backlog (MEDIUM):** `audit_logs` has no DB-level immutability trigger
  (tamper is detectable but not prevented). Add `no_update`/`no_delete` triggers.

### 2.4 Injection / SSRF

- ✅ **Remediated (HIGH ×2):** the two `sql.raw` SQLi sinks (see table).
- ⏳ **Backlog (MEDIUM):** AnA agent tool-calling loop (`command-executor.ts`)
  dispatches LLM-emitted command blocks to a 100+ tool registry. Governance binds
  tenant/actor server-side (so no privilege escalation), but prompt injection in
  retrieved/document content could trigger unwanted in-scope writes/drafts. Treat
  retrieved content as data, require user confirmation for state-changing tools
  triggered from untrusted context.
- ⏳ **Backlog (LOW):** Tighten `startsWith` path checks to use `path.sep`
  (`document-understanding.ts`, `concept2cure.ts`).
- ✅ **Cleared:** command-injection (`spawn` with arg arrays, no shell), SSRF
  (all fetch targets from fixed config/env), XXE, deserialization/eval.

### 2.5 API hardening / uploads

- ⏳ **Backlog (MEDIUM):** Magic-byte verification + AV scanning run on only **1
  of ~6** upload endpoints, and AV **fails open** / is disabled by default. Route
  all uploaders through shared `verifyFileSignature` + `scanForViruses`; make AV
  mandatory (fail-closed) in production. (Bounded today: `uploads/` is not
  web-served and filenames are randomized.)
- ⏳ **Backlog (MEDIUM):** Error-message leakage — 4xx responses echo raw
  `err.message`, and dozens of routes (`mission-control.ts` et al.) return
  `err.message` via inline catches. Generalize 4xx in `observability.ts` and
  convert inline catches to `next(err)`.
- ⏳ **Backlog (MEDIUM):** Decide CSRF posture — the real double-submit `csrf.ts`
  is dead code; the active origin-check exempts `Bearer`-bearing requests. Fine
  for a pure-bearer SPA, but mount real CSRF before introducing any cookie auth.
- ✅ **Cleared:** prod security headers (HSTS/nosniff/frameguard/strict CSP),
  CORS (strict allow-list, no wildcard-with-credentials), auth rate limiting.

### 2.6 Secrets / configuration

- ✅ **Remediated (MEDIUM):** `.gitignore` secret-file coverage.
- ✅ **Confirmed clean:** no committed secrets; prod code fails closed on missing
  `JWT_SECRET` / `AUDIT_HMAC_SECRET`; console bridge redacts PII/PHI in prod.
- ⏳ **Backlog (LOW):** Replace `rejectUnauthorized: false` for Neon with a pinned
  Neon CA bundle. Rotate the literal `SMOKE_PASSWORD` out of
  `scripts/e2e_smoke_assembly.mjs`. Confirm `scripts/**` and `tests/**` (which
  carry dev fallback secrets) are excluded from the production bundle.

### 2.7 Supply-chain / CI-CD / IaC

- **0 Critical / 0 High** npm advisories (50 total: 1 low, 49 moderate, dominated
  by one transitive OpenTelemetry/Sentry cluster + nodemailer, qs, uuid, anthropic-sdk).
- ⏳ **Backlog (MEDIUM):** Run `npm audit fix` (clears nodemailer + qs cleanly);
  schedule the semver-major bumps (`@sentry/node`, `@anthropic-ai/sdk`) on a
  tested branch.
- ⏳ **Backlog (MEDIUM):** Add least-privilege `permissions: contents: read` to
  all GitHub workflows (13 lack it) and pin every third-party `uses:` to a full
  commit SHA (already a known GA-blocker TODO).
- ⏳ **Backlog (MEDIUM):** Make Terraform `ecs-fargate` `secret_arns` a required
  variable — its `["*"]` default grants cluster-wide Secrets Manager read to any
  non-prod environment that forgets to override it.
- ✅ **Cleared:** no `pull_request_target`, no install lifecycle scripts, OIDC for
  AWS (no long-lived keys), non-root multi-stage Docker, encrypted RDS/S3 with
  public-access blocks + CloudTrail object-lock.

---

## 3. Prioritized remediation backlog (post-merge)

**P0 — close remaining exploitable gaps**
1. Org-scope `storage.getDocuments/getDocumentByName/updateDocument/deleteDocument`
   (fail-closed) and the `GET /api/documents/` list route. *(2.1)*
2. Fix the forgeable audit attribution + e-signature endpoints
   (`audit-trail-routes.ts`); source identity from session, route signatures
   through `esignature.ts`. *(2.3)*
3. Remove the `|| 1` org fallback in `project-sections.ts`. *(2.1)*

**P1 — regulated-control & defense-in-depth**
4. HMAC-seal `audit_events`; unify the migration pipelines + startup self-check;
   add immutability triggers to `audit_logs`. *(2.3)*
5. Unify upload safety (magic-byte + mandatory AV, fail-closed). *(2.5)*
6. Enforce API-key scopes; require dedicated `REFRESH_TOKEN_SECRET` and
   `MFA_REQUIRE_DEDICATED_KEY` in non-dev/prod. *(2.2)*
7. Enable Postgres RLS as a fail-closed backstop. *(2.1)*

**P2 — hardening & hygiene**
8. Generalize 4xx error messages; convert inline catches to `next(err)`. *(2.5)*
9. `npm audit fix` + planned major bumps. *(2.7)*
10. Workflow `permissions:` blocks + SHA-pin actions; Terraform `secret_arns`. *(2.7)*
11. Prompt-injection hardening on the AnA tool loop. *(2.4)*

---

## 4. What changed in this commit

- `server/services/grdhe/grdheService.ts` — parameterized + allow-listed region
  and encryption-field arrays (SQLi fix).
- `server/routes/regulatory-digital-twin.ts` — parameterized + allow-listed
  agency array (SQLi fix).
- `server/routes/documentOrchestrationRoutes.ts` — org-scoped all 510(k) read /
  PDF routes (IDOR fix).
- `server/services/client-intelligence-memory.ts` — mandatory org scoping in
  `getIngestedDocuments` / `getDocumentChecklist` / `getMemoryEntries` (IDOR fix,
  fail-closed at the service layer).
- `server/routes/client-intelligence.ts` — pass authenticated org to the above.
- `server/middleware/auth.ts` + `server/auth.ts` — reject non-access tokens on
  the access path (MFA-bypass fix).
- `.gitignore` — broadened secret-file coverage.

All changes typecheck cleanly (no new errors vs. the repo's typecheck baseline).
</content>

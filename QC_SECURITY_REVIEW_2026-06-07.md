# QC monolithic security review — 2026-06-07

Read-only swarm review of the Concept2Cure monolith (~1,800 server files, ~636k
LOC) with security as the primary lens, followed by remediation of the confirmed
findings. Every agent finding was re-verified against source before it was
accepted or fixed — several headline claims did not survive verification and are
recorded below as false positives so the record stays honest.

Branch: all remediation committed directly to `concept2cure-v2`.
Environment caveat: no Neon DB and (initially) no `node_modules` in this
container. Verification is therefore static — `tsc --noEmit` (full project, 0
errors), the repo's `check-security-patterns` gate (0 violations), and code-path
reasoning. **Live tenant-isolation testing against a database is still
outstanding** and is the top post-merge action.

---

## Method

Four parallel read-only agents swept distinct domains (auth/tenancy;
injection/data-layer; secrets/AI/HTTP/supply-chain; a dedicated auth-gap sweep;
an IDOR triage). Their findings were treated as leads, not conclusions. Each
lead was confirmed by reading the actual handler, its mount, and any middleware
in the request path before being rated or fixed.

## Architecture (verified)

The platform is more hardened than a first pass suggests:

- **Global `/api` auth gate** — `server/bootstrap/register-platform-routes.ts:178`
  installs an inline closure on `/api` that routes everything not on a small
  `openPrefixes` allowlist (auth, health, webhooks-with-signatures, public
  API-key routes, CSP reports) through `authMiddleware`. It is registered
  (`server/startup/routes.ts:88`) before the feature routers
  (`:105`+), so it covers them. There is a regression test for it at
  `server/bootstrap/__tests__/api-auth-gate.test.ts`.
- **Security middleware** — `server/middleware/enterprise-security.ts`: helmet
  with per-request CSP nonce + `strict-dynamic`, HSTS, frameguard, a CORS
  allowlist, layered rate limits (global + Redis `/api` + per-op), input
  sanitization, prototype-pollution scrub. Plus a 21 CFR Part 11 immutability
  policy (`server/startup/middleware.ts:118`).
- **Tenancy primitives** — `server/utils/authedOrgId.ts` (`authedOrgId` /
  `requireAuthedOrgId`) resolve the org **only** from the verified JWT. Several
  routers already use them with explicit IDOR-history comments.
- **CI gates** — CodeQL, Semgrep, Danger, plus `scripts/ci/check-tenant-isolation.mjs`,
  `check-password-hygiene.mjs`, `check-no-dev-auth-in-prod.mjs`,
  `check-security-patterns.ts`.

**Correction to the initial read.** Two agents (and my own first grep) reported
`/api/intelligent-reports` as *unauthenticated*. That was wrong: the global gate
is an inline closure, so `grep authenticateToken` misses it. The real exposure
class across the codebase is **not missing authentication** — coverage is ~99%
via the gate — it is **IDOR within authenticated scope**: handlers that source
the org/tenant id from `req.params` / `req.query` / `req.body` instead of the
JWT, letting any *valid* tenant act on another tenant's data.

---

## Findings (severity-ranked)

| # | Sev | Area | Finding | Status |
|---|-----|------|---------|--------|
| 1 | CRITICAL | Tenancy / GDPR+PV | `global-compliance.ts` — `enforceOrgScope` existed but only 2 of ~18 handlers called it; the rest read GDPR (ROPA, breach, DSR) and pharmacovigilance (AE, signal, RMP) data by `req.params.orgId` with no tenant check (read+write). | ✅ fixed |
| 2 | CRITICAL | Tenancy | `intelligent-reports.ts` — `/generate` took org from body; `/list/:organizationId` and every `/:reportId` read/seal/verify/supersede/revoke/export had no per-record tenant check. Cross-tenant read + mutation of immutable regulated reports. | ✅ fixed |
| 3 | HIGH | Tenancy / clinical | `foresight-ai-advanced.ts` — 9 POSTs persisted/scoped on body `organizationId`; DLT write and study-intelligence read were unscoped (cross-tenant writes to dose-escalation trials and adverse-event records). | ✅ fixed |
| 4 | HIGH | Auth / Part 11 | `hocuspocus-server.ts:52` — collab WebSocket auth base64-decoded the JWT **without verifying the signature**, trusting forged identity. Attribution-integrity break. | ✅ fixed |
| 5 | MEDIUM | SSRF | `webhook-notifications.ts:205` — `fetch(channel.url)` with no destination validation (cloud-metadata / internal SSRF if a channel URL is attacker-influenced). | ✅ fixed |
| 6 | MEDIUM | Tenancy | `client-branding.ts` — `/upload-logo`, `/upload-letterhead` (body org) and `/logo/:orgId` (path org) bypassed the JWT-org guard the rest of the file uses. | ✅ fixed |
| 7 | MEDIUM | Crypto hygiene | `mfaService.ts:106` — in production with `MFA_ENCRYPTION_KEY` unset, the MFA-secret encryption key is derived from `JWT_SECRET` (key reuse across trust domains); only logs, does not fail closed. | ✅ fixed (rotation-safe + opt-in enforcement) |
| 8 | LOW | Correctness | `statistics-service.ts` (14 sites) — `sql\`… IN (${arr.join(',')})\``. **Not SQL injection** (Drizzle binds it as one parameter); a correctness bug — the `IN` matched a single comma-joined string, not the list. | ✅ fixed (`inArray`) |
| 9 | LOW | Hardening | CORS allowlist + `PredicateFinderService` openFDA query encoding + shallow prompt-injection regex in `ai-gateway/policy.ts`. | ◑ CORS + openFDA fixed; prompt-injection still open |

### Discarded false positives (QC integrity)

- **"3 CRITICAL SQL injections"** in `statistics-service.ts` /
  `regulatory-programs.service.ts` (`IN (${arr.join(',')})`, `~* ${codes.join('|')}`)
  — **not exploitable**. These are Drizzle `sql\`\`` tagged templates, so the
  interpolated value is a **bound parameter**, not raw SQL. Real impact is at
  most the correctness bug in #8 (and a theoretical bounded-input ReDoS on the
  regex). Re-rated LOW.
- **"intelligent-reports is unauthenticated"** — false; covered by the global
  gate (see correction above). The real issue is IDOR (#2).
- **"global-compliance is SAFE via enforceOrgScope"** (IDOR-triage agent) —
  false; the helper was wired into only 2 of ~18 handlers (#1).

---

## Remediation landed on `concept2cure-v2`

| Commit | Scope |
|--------|-------|
| `fix(security): close cross-tenant IDOR in report/foresight/branding routes` | #2, #3, #6 |
| `fix(security): verify JWT signature for collab WebSocket auth` | #4 |
| `fix(security): block SSRF in webhook delivery` | #5 |
| `fix(security): enforce org scope on all global-compliance routes` | #1 |
| `test(security): tenant-isolation regression guards for the four IDOR fixes` | #1–3, #6 (23 tests) |
| `fix(security): rotation-safe MFA key with opt-in dedicated-key enforcement` | #7 |
| `fix(correctness): parameterize IN-lists and encode openFDA query values` | #8, #9 |
| `harden(security): validate and de-duplicate CORS allowlist` | #9 |

Fix pattern, applied uniformly: org id comes from the verified JWT
(`authedOrgId` / `requireAuthedOrgId` / the file-local `enforceOrgScope` /
`forceJwtOrg` / `orgScope`+`loadOwnedReport` helpers); record-level handlers
confirm the target row belongs to the caller's org before read or mutation and
return **404 (not 403)** on a cross-tenant id to avoid existence disclosure;
Part 11 identity (`userId`/`userName`) is taken from `req.user`, not request body.

All commits: `tsc --noEmit` = 0 errors; `check-security-patterns` = 0 violations.

---

## Follow-ups — done in this pass

- **Live tenant-isolation tests.** Added four runnable contract suites (vitest +
  supertest, mocked data layer — no DB needed), 23 tests, all passing:
  `server/__tests__/security/tenant-isolation-{global-compliance,intelligent-reports,client-branding,foresight}.contract.test.ts`.
  Each asserts foreign-org read/write → 403/404, same-org → allowed, no auth →
  401/403. global-compliance exercises the real signed-JWT auth path.
- **MFA key (#7).** Shipped rotation-safe decryption (legacy JWT-derived key is
  still a decrypt candidate → no lockout) + new `MFA_REQUIRE_DEDICATED_KEY` flag.
  Operator cutover: set `MFA_ENCRYPTION_KEY` → re-encrypt → set
  `MFA_REQUIRE_DEDICATED_KEY=true` to fail closed. Safe to deploy as-is.
- **Correctness (#8).** All 14 `IN (${arr.join(',')})` sites → `inArray`.
- **Hardening (#9).** CORS allowlist trims/validates/de-dupes origins; openFDA
  query values are `encodeURIComponent`-ed.

## IDOR audit — second pass (complete)

Classified all ~65 `req.(params|query|body).(org…|tenant…)` sites. Two more
broken-access-control findings surfaced and were fixed:

- **CRITICAL — `pm-settings.router.ts`** (`/api/pm-settings/:organizationId`).
  GET/PUT/POST-reset/GET-history validated only that the org *existed*, not that
  the caller owned it — cross-tenant read/write of PM settings. Fixed: path org
  must equal the JWT org on all four handlers.
- **CRITICAL — `tenants-simple.ts`** (`/api/tenants`). Authenticated but **not
  authorized** — any user could list every organization, read any tenant's user
  directory, and create/delete tenants or rotate API keys (the beta route fence
  that would have blocked `/tenants` is off unless `ENABLE_BETA_ROUTE_FENCE=true`).
  Fixed: mutations gated to `super_admin`/`platform_admin`; `GET /` is now
  membership-scoped (admins see all, members see only their orgs via
  `organization_users`); `GET /:tenantId/users` requires the caller's own tenant
  or admin. Contract test: `tenant-isolation-tenants-simple.contract.test.ts`
  (8 tests).

**Confirmed safe** (verified, no change): `client-intelligence`
(org from JWT; query `clientWorkspaceId` is a within-org sub-filter),
`regulatorySubmissions` (org from JWT; workspace is a sub-scope), plus the
previously-cleared `decision-lineage`, `audit-trail-routes`, `tenant-users`,
`tenant-config`, `tenant-ctq-factors`, `grdhe`, `ind-sections`.

## Prompt-injection hardening (done)

The gateway's content filter had two regex patterns applied to **every** message
(including the trusted system prompt) — shallow, and a false-positive risk for a
regulated-document app. Replaced with `ai-gateway/promptInjection.ts`: a
high-precision detector covering instruction-override, system-prompt
exfiltration, jailbreak-persona and guardrail-bypass families, each requiring
**both** an override/exfil verb **and** a meta-reference to the model's
instructions/persona (so "ignore the previous draft" / "summarize the previous
instructions section" are not blocked). Scoped to untrusted **user** messages
only. 20 unit tests (`__tests__/promptInjection.test.ts`) cover detections and —
importantly — regulated-domain false-positive guards. Bounded quantifiers, no
ReDoS.

## Still open

1. **Run the new tests against a database** in CI as part of the broader suite,
   and add equivalent DB-backed integration coverage — including the
   membership-scoped `tenants-simple` reads (verified here only by tsc + the
   mocked-SQL contract test).
2. **Model-based guardrail** for prompt injection remains a future option beyond
   the heuristic layer above — an infrastructure decision, not a code tweak.

## Systemic recommendations

- **Make tenant scoping hard to get wrong.** Either a mount-level tenant
  middleware that binds `req.orgId` and forbids handlers from reading org from
  untrusted input, or a lint rule that flags `req.(params|query|body).org*`
  feeding a query — mirroring the existing `check-tenant-isolation` gate but at
  the route layer.
- **Ratchet the tenant-isolation lint** from the stale baseline toward
  `--strict-no-regression` so new IDORs cannot land.

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
| 7 | MEDIUM | Crypto hygiene | `mfaService.ts:106` — in production with `MFA_ENCRYPTION_KEY` unset, the MFA-secret encryption key is derived from `JWT_SECRET` (key reuse across trust domains); only logs, does not fail closed. | ⏭ documented — needs key migration (below) |
| 8 | LOW | Correctness | `statistics-service.ts` (~11 sites) — `sql\`… IN (${arr.join(',')})\``. **Not SQL injection** (Drizzle binds it as one parameter); a correctness bug — the `IN` matches a single comma-joined string, not the list. | ⏭ documented |
| 9 | LOW | Hardening | CORS allowlist hard-codes prod origins (`enterprise-security.ts:38`); `PredicateFinderService.ts:39` builds an openFDA query URL without `encodeURIComponent`; prompt-injection regex in `ai-gateway/policy.ts` is shallow. | ⏭ documented |

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

Fix pattern, applied uniformly: org id comes from the verified JWT
(`authedOrgId` / `requireAuthedOrgId` / the file-local `enforceOrgScope` /
`forceJwtOrg` / `orgScope`+`loadOwnedReport` helpers); record-level handlers
confirm the target row belongs to the caller's org before read or mutation and
return **404 (not 403)** on a cross-tenant id to avoid existence disclosure;
Part 11 identity (`userId`/`userName`) is taken from `req.user`, not request body.

All commits: `tsc --noEmit` = 0 errors; `check-security-patterns` = 0 violations.

---

## Open follow-ups

1. **Live tenant-isolation tests (highest priority).** No DB in this env.
   Add per-route tests that authenticate as org A and assert 404/403 reading or
   writing org B's reports, compliance records, foresight studies and branding —
   template: `test/routes/*.tenant-isolation.test.ts`. Run them against a DB.
2. **MFA key (#7).** Do **not** just flip to fail-closed: secrets already
   enrolled were encrypted with the JWT-derived key, so changing derivation
   without a decrypt-old / re-encrypt-new migration would lock out every MFA
   user. Sequence: provision `MFA_ENCRYPTION_KEY`, migrate existing ciphertext,
   *then* make production refuse the JWT fallback.
3. **Finish the IDOR audit.** ~65 `req.(params|query|body).(org…|tenant…)` sites
   exist. The confirmed-vulnerable clusters (#1, #2, #3, #6) are fixed; the
   confirmed-safe set (`decision-lineage`, `audit-trail-routes`, `tenant-users`,
   `tenant-config`, `tenant-ctq-factors`, `grdhe`) uses JWT-org guards. The
   remaining sites should each be classified read/write × safe/vulnerable.
4. **Correctness (#8).** Replace `IN (${arr.join(',')})` with Drizzle
   `inArray(col, arr)` or `sql.join(arr, sql\`, \`)` in `statistics-service.ts`.
   Behavior-changing on real data — fix with a DB to verify.
5. **Hardening (#9).** Move CORS prod origins to env; `encodeURIComponent` the
   openFDA query; deepen prompt-injection detection.

## Systemic recommendations

- **Make tenant scoping hard to get wrong.** Either a mount-level tenant
  middleware that binds `req.orgId` and forbids handlers from reading org from
  untrusted input, or a lint rule that flags `req.(params|query|body).org*`
  feeding a query — mirroring the existing `check-tenant-isolation` gate but at
  the route layer.
- **Ratchet the tenant-isolation lint** from the stale baseline toward
  `--strict-no-regression` so new IDORs cannot land.

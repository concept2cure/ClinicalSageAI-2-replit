# Global Product Readiness Assessment — Pre-Human-Testing

**Platform:** Concept2Cure.RI / TrialSage
**Date:** 2026-07-18
**Assessed at:** `concept2cure-v2` HEAD `0c19ef4` (+ fixes on `claude/product-readiness-assessment-7wpj49`)
**Goal evaluated:** provision the production database and run the platform with real human testers for the first time.
**Method:** 8 parallel evaluation agents (one per readiness dimension), each with adversarial per-blocker verifiers and a completeness critic (21 agents, 0 errors), plus independent live testing — clean install, production build, from-scratch DB provisioning, full server boot, and an end-to-end auth golden path against a real Postgres 16.

---

## Verdict: 🔴 NOT READY for human testing as-is — but the path to a scoped pilot is short

Seven of eight dimensions came back **NOT_READY**; one (Test/CI) is **READY_WITH_RISKS**. The blockers are concentrated and mostly small-effort — this is a well-engineered codebase with a thin, fixable set of launch-blocking gaps, not a structurally broken one.

Two blockers were **total showstoppers and are already fixed in the accompanying PR** (the platform could not boot at all, and its production root URL rendered a blank page). The rest divide into a short **must-fix-before-pilot** list (mostly configuration and a provisioning runbook) and one **expectation-setting** issue that determines whether the pilot is meaningful at all: **the core regulatory workflows past login are demo shells that don't write to the backend.**

**Bottom line:** fix the must-fix list below (roughly 1–2 days of mostly-config work), decide how to handle the demo-shell surface (scope the pilot to the genuinely-wired slice, or tell testers plainly what is real vs. sample), rehearse a database backup/restore, and you can run a credible, scoped pilot. Do **not** open it to testers before the login-email path is proven end-to-end — that is the single most likely week-one failure.

---

## Scorecard

| Dimension | Score | Verdict | Confirmed P0s |
|---|---:|---|---|
| Frontend readiness | 38 | 🔴 NOT_READY | Auth-token desync; core workflow is a demo shell |
| Database install & schema | 40 | 🔴 NOT_READY | No from-scratch provisioning path; fail-open admin seed |
| Compliance & auditability | 55 | 🔴 NOT_READY | "Part 11 Compliant" claim on live signup |
| Config / deployment / ops | 55 | 🔴 NOT_READY | No reproducible DB provisioning |
| AI gateway, safety & grounding | 58 | 🔴 NOT_READY | PHI/PII detection enforced nowhere |
| Security & authentication | 64 | 🔴 NOT_READY | Fail-open admin seed (known password) |
| Test & CI gate health | 64 | 🟡 READY_WITH_RISKS | — |
| Backend / API runtime | 66 | 🔴 NOT_READY | Green health with missing-schema DB |

Plus three cross-cutting P0s surfaced by live testing: **the boot crash**, **the blank-page CSP bug**, and **no login without SMTP** (also the completeness critic's single sharpest risk).

---

## Already fixed in this PR (verified)

These were reproduced live, fixed, and re-verified. Four commits on `claude/product-readiness-assessment-7wpj49`.

1. **P0 — Platform could not boot at all.** Module-scope `__dirname` under ESM crashed the server on import (Node 20: `ReferenceError: __dirname is not defined`; Node 22: `ERR_AMBIGUOUS_MODULE_SYNTAX`) in both the production bundle and `tsx` dev. Broken since ~July 3 (PR #993); invisible because `npm run build` and the unit suites shim `__dirname`, so no gate exercised a real boot. Fixed the 5 boot-blocking sites via `import.meta.url` (`6e7cbd7`). **Verified:** dev server now serves `/api/health` 200; the production bundle clears module evaluation.
2. **P0 — Blank page at the production root URL.** `express.static(distPath)` served the raw, un-nonced `index.html` for `/` before the nonce-injecting SPA fallback ran; under the enforcing `nonce + strict-dynamic` CSP the browser blocks the un-nonced bundle → blank page. Fixed with `index:false` plus an explicit `/index.html` handler (`c6029cc`, `25d8af9`). **Verified** with an isolated harness: `/`, `/index.html`, and deep routes all serve a correctly nonced page; hashed assets still 200. ⚠️ **This fix lives only on this branch — `origin/concept2cure-v2` still has the bug, so it is a live P0 in production until this PR merges.**
3. **5 more `__dirname`-in-ESM runtime bombs** in feature paths (FCoI review, CSR extraction, regulatory-pathway data). Fixed the 3 tester-facing ones (`c5b25fd`); flagged 2 DB-internal ones for owner review (migration-path-sensitive). Added **`tests/ci/esm-dirname-guard.test.ts`**, a CI guard that fails on any module-scope `__dirname` in server ESM — the gate that was missing (proven to catch the original pattern and pass the fix).

---

## Must-fix before the pilot (confirmed blockers)

### 1. No verified way to provision the production database from scratch — CONFIRMED P0
There is no single mechanism that produces a complete schema on a fresh Postgres. The Drizzle journal covers **1 of 162** migrations; `runMigrations()` is dead code (zero call sites); the production container `CMD` runs no migration step; and three documented install commands are each broken, nonexistent, or only *validate* tables. The repo's own preview-DB CI even states replaying the migration tree "fails because most aren't idempotent" — and the "✅ Migrations applied" comment you see on PRs is a no-op on a Neon branch that *inherits* an already-provisioned parent (independently confirmed). The only CI-proven fresh path, `drizzle-kit push`, creates tables but **zero RLS policies** and none of the SQL-only objects. **A working sequence exists and is verified below — it just has to become the canonical, documented install path.** *Effort: M.*

### 2. First production boot seeds a known-password admin — CONFIRMED P0
`seedGaDemoUser()` runs on **every** boot including production (`server/startup/services.ts:110`) and inserts `jm.smith@concept2cure.pro` as an org **admin** with the bcrypt hash of the literal string `pass-word` (the plaintext is in the source comment). The default is **seed-ON** — only `SEED_DEMO_USER=false` disables it. `.env.example` and the docker-compose files set it off, so *documented* deploys are safe, but a Neon deploy configured by hand (the stated plan) gets a publicly-known admin over real tester data. Verified live: the account is seeded on boot. **Fix:** flip the default to opt-in (or hard-block in production), or mandate `SEED_DEMO_USER=false` in the runbook and verify the row is absent before testers arrive. *Effort: S.*

### 3. No tester can log in without SMTP — CONFIRMED P0 (critic's sharpest risk)
MFA via emailed OTP is **mandatory on every login**, but SMTP is optional, unvalidated at boot, and **fail-silent**: with `SMTP_HOST` unset, `emailService.ts` logs `login OTP email not sent`, logs the code to the server console, and returns a normal MFA challenge. On a freshly provisioned environment with SMTP unset/misconfigured/greylisted, **zero testers — and the team's own admin — can complete a single login**, while `/api/health` reads 200 and nothing pages anyone. Verified live: `Dev OTP code` logged, no email sent. **Fix:** configure and *validate* SMTP at boot; prove one full login where the OTP reaches an external Gmail **and** Outlook inbox before onboarding anyone. *Effort: S (config) + validation.*

### 4. Health stays green with a missing-schema database — CONFIRMED P0
An unreachable DB correctly hard-exits in production, but a *reachable DB with missing tables* — the likely outcome of first-time provisioning — only logs `❌ CRITICAL: Missing tables` and keeps booting; `/readyz` and `/api/health` still return 200. Ops cannot distinguish a broken deploy from a healthy one. **Fix:** gate readiness on the schema-verification result; point the container healthcheck at `/readyz`. *Effort: S.*

### 5. Core regulatory workflows are demo shells — CONFIRMED P0 (the "is the pilot meaningful?" blocker)
The v2 shell *is* the product, and its golden path is stubbed: the New-project wizard fakes a 1.2s "Creating project…" delay with **no API call**; create / AI / e-sign / export perform no backend writes; an empty production DB renders **fixtures everywhere**, behind a small "sample data" pill. Auth is real (signup→org→login→MFA all write real rows — verified live), but the surface past login largely is not. **Human testing of a demo shell tests nothing real.** *Effort: L.* **Decision required:** scope the pilot to the genuinely-wired slice (feature-flag the rest off), or explicitly tell testers which flows are real vs. sample. This choice is yours — flag it before onboarding.

### 6. Dual auth-token stores desync — CONFIRMED P0
The query client reads tokens from one store (`authToken.ts` → `sessionStorage['token']`) while login/refresh/logout write another (`trialsage_*` keys); nothing bridges them. Result: stale bearer token after logout/account-switch, refresh never propagates, "remember me" self-destructs. During a multi-tester pilot this produces intermittent, confusing auth failures. *Effort: M.*

### 7. "FDA 21 CFR Part 11 Compliant" on the live signup page — CONFIRMED P0
`ZenSignup.tsx` displays a "FDA 21 CFR Part 11 Compliant" badge, directly contradicted by the platform's own submission-grade register ("21 CFR Part 11 not fully activated — Critical"; RLS off by default, audit interceptor off, validation unexecuted). Presenting an unvalidated pilot as Part 11 compliant to every prospective user is a regulatory-misrepresentation and trust risk. Verified: the string is present. **Fix:** remove or soften the claim (e.g., "built to support 21 CFR Part 11 workflows") before testers see it. *Effort: S.*

### 8. PHI/PII detection is claimed but enforced nowhere — CONFIRMED P0
The gateway config declares `piiDetection: true`, but the policy engine implements only token budget, blocked-pattern/injection, and rate limits — the flag is dead config. A purpose-built classifier exists but is wired into no request path. On a clinical product where testers may paste patient data into AI features, nothing detects or gates it before it reaches shared frontier APIs. **Fix:** wire the classifier into the gateway request path (or explicitly forbid real PHI in the pilot data agreement). *Effort: M.*

---

## Adversarial verification caught two over-alarms and one false alarm

The verifier layer is part of why this assessment is trustworthy — it downgraded findings that didn't survive scrutiny:

- **"Unauthenticated direct-OpenAI endpoint" → downgraded to P2.** A global `/api` fail-closed auth gate (`register-platform-routes.ts:230-265`, pinned by a contract test) protects `/api/ai` — there is **no** anonymous access or cost-burn vector. The real residual is that a few *authenticated* legacy handlers bypass the gateway's specialized AI audit/metering/placement — governance hygiene, not a launch blocker.
- **"Forgeable e-signature route" → REFUTED.** The insecure file is **dead code**; the mounted `/api/gcc/signing` route is a 4-line stub that 404s on the sign endpoint, and even a hypothetical re-mount would 500 on a SQL signature mismatch. No forgery is reachable.
- **"Blank page at /" → downgraded to P2 for the assessed tree only because the fix (this PR) was already committed** — it remains a genuine P0 on the unmerged `concept2cure-v2` deploy branch.

---

## Operational gaps for running humans (completeness critic)

The eight dimensions are thorough on in-repo correctness but nearly silent on the operational envelope of putting people on the system. Address before or during week one:

1. **Email deliverability** (see blocker #3) — the single sharpest risk.
2. **Backup/restore & rollback rehearsal** — you're about to replay a migration tree CI says won't replay cleanly, with no rehearsed way back. Confirm Neon PITR/branching is on; do one real `pg_dump` + restore into a scratch branch first.
3. **Pilot data handling** — first *human* testing on a clinical/regulatory product with no privacy page and no synthetic-data-only rule. Write a one-page pilot data agreement (synthetic data only, what's logged, which AI vendors see input, deletion date) and have testers acknowledge it.
4. **Monitoring / alerting / on-call** — `SENTRY_DSN` appears nowhere in `.env.example`; nothing pages a human. Set it, throw a test exception, confirm it reaches someone; point an external uptime check at `/readyz`.
5. **PDF/document export runtime deps** — the flagship deliverable. Three export paths need Puppeteer/Chromium (and doc runtimes) that are absent from the production image. Verify one IND PDF export end-to-end **in the built image**.
6. **Performance/capacity** — no load test exists; nobody has run even two concurrent users. Run a 30-minute smoke load (20 parallel authenticated sessions) against staging.
7. **Tester support/feedback** — no in-app feedback widget, onboarding guide, or known-issues list. Pick one channel and a one-page "what's real vs. sample" guide.
8. **Feature-flag scoping** — with the core workflow confirmed demo-shell and 72% of endpoints callerless, add a pilot allowlist that hides everything not wired.

---

## Database provisioning runbook (the verified sequence)

Independently tested on Postgres 16 + pgvector — this produces a correct schema *with* RLS, which no documented path currently does.

```bash
# Step 0 — shell hygiene: set ONLY these; unset the competing vars (tools disagree on precedence)
export DATABASE_URL="postgresql://…@ep-<id>.<region>.aws.neon.tech/<db>?sslmode=require"   # DIRECT host, not -pooler
export DATABASE_URL_ADMIN="$DATABASE_URL"
unset DATABASE_NEON_NEW_SECRET NEON_DATABASE_URL DATABASE_URL_DIRECT

# Step 1 — prerequisites (the ONLY CI-proven recipe; today only in db-schema-validation.yml)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c '
  CREATE SCHEMA IF NOT EXISTS vault;
  CREATE SCHEMA IF NOT EXISTS precedent;
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;'   # add if applying the db/migrations tree

# Step 2 — tables (creates ~460 tables; RLS NOT included)
echo "" | npx drizzle-kit push

# Step 3 — RLS policies (NOT in the push path; apply explicitly — verified to add ~370 policies)
for f in migrations/0005_csr_knowledge_database.sql \
         migrations/0021_enable_rls_everywhere.sql \
         migrations/20260608_ai_placement_policies.sql \
         migrations/20260612_rls_research_admin.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

# Step 4 — VERIFY before exposing testers
psql "$DATABASE_URL" -tAc "SELECT count(*) FROM pg_policies;"   # expect ~370, NOT 0
npm run db:ensure                                              # must report no missing critical tables
```

Then set `RLS_ENFORCE=on` (policies ship in shadow mode) and restart. **Do not trust the boot log's "RLS enforcement on" without confirming `pg_policies` is non-zero** — enforcement checks the env var, not whether policies exist.

---

## Minimal environment contract (empirically derived by booting to green)

Boot **fail-closed** with clear messages (a genuine strength). The production server refuses to start without **seven** secrets — note this is *more* than the static config review found; `AUDIT_HMAC_SECRET` and `CONNECTOR_ENCRYPTION_KEY` were discovered only by actually booting:

| Var | Why | Boot-fatal? |
|---|---|---|
| `DATABASE_URL` | Postgres/Neon (pooler, `sslmode=require`) | Yes |
| `JWT_SECRET` | ≥32 random chars | Yes |
| `SESSION_SECRET` | session signing | Yes |
| `REFRESH_TOKEN_SECRET` | ≥32, **must differ** from `JWT_SECRET` | Yes |
| `MFA_ENCRYPTION_KEY` | ≥32, dedicated | Yes |
| `AUDIT_HMAC_SECRET` | tamper-proof audit chain | Yes |
| `CONNECTOR_ENCRYPTION_KEY` | connector credential encryption | Yes |
| `SMTP_HOST/PORT/USER/PASS/FROM` | **login OTP delivery — no logins without it** | No, but pilot-fatal |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | AI features 503 otherwise | No |
| `APP_URL` / `APP_BASE_URL` | invite/reset links & SAML identity (else fall back to marketing domains) | No |
| `SEED_DEMO_USER=false` | **disable the known-password admin seed** | No, but security-critical |
| `RLS_ENFORCE=on` | activate tenant RLS (after verifying policies exist) | No, but isolation-critical |
| `SENTRY_DSN` | error paging (absent from `.env.example`) | No, but ops-critical |

Run under a supervisor that restarts on exit (the process intentionally exits on fatal conditions). Do **not** run testers on `npm run dev` — it tolerates a dead DB.

---

## Go / No-Go checklist

- [ ] This PR merged to the deploy branch (carries the boot-crash and blank-page fixes)
- [ ] DB provisioned via the runbook; `pg_policies` count ≈ 370 (not 0); `npm run db:ensure` clean
- [ ] `RLS_ENFORCE=on` and one cross-tenant read manually confirmed to return zero rows
- [ ] `SEED_DEMO_USER=false` set; `jm.smith@concept2cure.pro` row confirmed **absent**
- [ ] All 7 boot secrets set; server reaches green `/readyz` (not just `/api/health`)
- [ ] **One full login completed with the OTP arriving in an external Gmail AND Outlook inbox**
- [ ] "Part 11 Compliant" badge removed/softened on the signup page
- [ ] Pilot surface scoped to wired flows (or testers told what's real vs. sample)
- [ ] One IND/CER PDF export exercised end-to-end **in the built image**
- [ ] Neon PITR/branch confirmed; one `pg_dump` + restore rehearsed
- [ ] `SENTRY_DSN` set and a test exception confirmed to page someone
- [ ] One-page pilot data agreement (synthetic data only) acknowledged by each tester

---

## What's genuinely strong

This is not a weak codebase — the blockers are a thin launch-readiness layer over solid engineering:

- **Fail-closed everywhere it matters:** boot refuses to start without its secrets (with precise messages); the AI gateway refuses to serve with no provider configured in production; SAML fails closed.
- **Auth core is strong:** HS256-pinned JWT verification with zero-downtime rotation (CI-enforced), bcrypt at 12 rounds with legacy/empty-hash rejection, mandatory timing-safe attempt-limited email OTP.
- **RLS design is Neon-aware and well-built:** dynamic, idempotent, `FORCE ROW LEVEL SECURITY` (correct for Neon's owner-role), allowlist synced by a CI gate — it just isn't in the install path yet.
- **Audit chain is real:** transactional SHA-256 hash-chaining with anti-forgery locking.
- **TypeScript debt genuinely ratcheted 2,598 → 0**; a real fresh-DB schema CI gate; the 2026-05 fabrication findings have complete, CI-locked remediations.
- **Clean install and build**, CI green at HEAD with a serious guardrail battery (17 governance checks in the Lint job alone).

---

## Methodology

8 evaluation dimensions ran as parallel agents; each blocker-level finding was then re-checked by an independent adversarial verifier instructed to refute or downgrade it, and a completeness critic swept for missed operational risks (21 agents total, 0 errors, ~2.77M tokens). In parallel, the highest-consequence findings were **independently reproduced by live testing** — installing from scratch, building, booting the production bundle, and driving the auth golden path against a real Postgres 16. Where the two methods converged (the SMTP/OTP login risk, the DB provisioning gap, the demo-admin seed, the blank-page CSP bug), confidence is high. Where the verifier downgraded an evaluator's alarm (the "unauthenticated" AI endpoint, the "forgeable" signing route), that is reflected honestly above.

_A CI/governance note surfaced along the way: `dangerfile.js` requires PR sections (`## Summary` / `## Type of Change` / `## Testing`) that don't match the committed PR template's headings, so every compliant PR trips a Danger warning; and CodeQL/Semgrep never run on `concept2cure-v2` due to a branch-name case mismatch (`concept2cure-V2` vs `concept2cure-v2`) — worth fixing so security scans actually gate the canonical branch._

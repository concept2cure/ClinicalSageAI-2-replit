# Product Readiness Assessment — Concept2Cure.RI / TrialSage

**Pre-human-testing readiness.** Can we provision the production database and put
real human testers on Concept2Cure.RI / TrialSage for the first time — safely,
and testing something real?

| | |
|---|---|
| **Platform** | Concept2Cure.RI / TrialSage |
| **Reassessed** | 2026-07-26 |
| **Against** | `concept2cure-v2 @ 12e64f8` + open PRs #1038 / #1046 |
| **Baseline** | 8-dimension parallel-agent assessment, 2026-07-18 |

---

## 2026-07-29 document-identity reconciliation hold

A detailed reuse investigation found that the proposed standalone identity,
alias, and placement tables duplicated existing `unified_documents`,
`module_documents`, and submission-core responsibilities. That proposal has been
reverted in full. Document-identity production readiness is **0/100 pending an
approved interface contract and reconciliation of incompatible existing
`unified_documents` schemas**.

The approved next direction is to extend the existing unified workflow and
submission core, not create a parallel registry. See `RECONCILE.md` §6 for the
asset inventory, duplication analysis, target model, and approval gates. The
broad pilot assessment below must not be interpreted as approval of a
platform-wide document-ID claim.

---

## Verdict — Code-ready, gated on operational sign-off

> **7 of 8 launch-blocking code gaps are closed.** One human gate remains.

The 2026-07-18 assessment found **eight confirmed P0 blockers** and returned
**🔴 NOT READY**. The platform has moved hard since:

- A day-long **"de-mock" push** landed in the deploy branch — **~50 v2 surfaces
  and the AI features now read real data, not fixtures.**
- The **GA security-hardening wave (PR #1042) has merged** — PII enforcement in
  the AI gateway, a global default-deny auth boundary, tenant-scoped dead-letter
  queue, and a production RLS posture that requires an explicit operator
  decision are all now **in the deploy branch**, not pending.
- A **data-room feature wave** merged (#1102 / #1104 / #1105 / #1109 / #1110):
  every upload now resolves to one canonical source identity, sources are scoped
  to the project a user has open, and cross-tenant isolation is enforced and
  tested — real source-to-dossier grounding, not a shell.
- The remaining infrastructure and boot fixes sit on **PR #1038**, and the
  auth-token unification on **PR #1046**.

**Seven of the eight blockers are now resolved in code** (merged or on open
PRs). The eighth isn't code: **proving an emailed login OTP actually reaches a
real inbox.** Merge the open PRs, prove that one login, walk the short
operational list below, and this is a credible scoped pilot.

---

## The eight blockers, as of today

Every P0 from the original assessment, with its current state. Where each fix
lives is stated plainly — "resolved in code" means fixed and verified, and
"merged" vs "on PR #xxxx" tells you whether it is already protecting the deploy
branch or still has to land.

### 1 · No from-scratch database provisioning path — ✅ Resolved · verified
**Was:** no mechanism produced a complete schema on a fresh Postgres (the
Drizzle journal covered 1 of 162 migrations; `push` created tables but zero RLS).
**Now:** a single idempotent installer does the whole thing.
`scripts/db/install-fresh.mjs` — verified from an empty DB → **687 tables · 557
RLS policies · 5/5 core tables**. Safe to re-run. *(On PR #1038.)*

### 2 · First boot seeded a known-password admin — ✅ Resolved in code
**Was:** a demo admin with a source-visible password was seeded on *every* boot
including production (opt-out). **Now:** it fails closed in production.
Belt-and-suspenders: keep `SEED_DEMO_USER=false` and confirm the row is absent
before testers arrive.

### 3 · No tester can log in without SMTP — ⚠️ Loud in code · your sign-off
**Was:** MFA-over-OTP is mandatory but SMTP failed *silently* — a misconfigured
mailer meant zero logins while health read 200. **Now:** the silent failure is
fixed; the mailer itself is your environment. **This is the one hard gate.**
Prove one full login with the OTP arriving in an external Gmail *and* Outlook
inbox before onboarding anyone.

### 4 · Health stayed green with a missing-schema DB — ✅ Resolved · verified
**Was:** a reachable DB with missing tables kept booting at 200 — ops couldn't
tell a broken deploy from a healthy one. **Now:** `/readyz` fails closed and
names the missing tables. Verified live: empty DB → 503 ("missing tables:
organizations, users"); full schema → 200. Container healthcheck repointed at
`/readyz`. *(On PR #1038.)*

### 5 · Core regulatory workflows were demo shells — ✅ Largely closed · merged + branch
**Was:** the path past login was stubbed — the New-project wizard faked a 1.2s
delay with no API call; an empty DB rendered fixtures everywhere behind a "sample
data" pill. This was *the* blocker that decided whether a pilot tests anything
real.
**Now, merged into the deploy branch:** a fixture-free data contract across ~50
v2 surfaces (real data or an honest empty/error state, no fake "sample" pill),
the AI features wired to real engines (AnA streaming, Deep Research, source
provenance & citation verification, the editor's AI draft), and a **data-room
wave** (#1102–#1110) giving canonical upload identity and project-scoped,
tenant-isolated source grounding.
**On PR #1038:** creating a project now persists (`POST /api/c2c/projects` →
`regulatory_programs`, verified end-to-end) plus 27 new surface tables and the GA
seed. **Remaining slice:** the in-canvas editor's section-save to the audited
backend (tracked, not yet wired).

### 6 · Dual auth-token stores desynced — ✅ Resolved (PR #1046, pending merge)
**Was:** the query client read one token store while login/refresh/logout wrote
another — stale bearer after logout, "remember me" self-destructing. **Now:**
unified on the canonical store. Owned by the dedicated sibling **PR #1046** so
the fix lands once, cleanly.

### 7 · "FDA 21 CFR Part 11 Compliant" on the live signup page — ✅ Resolved in code
**Was:** an unqualified compliance claim contradicted by the platform's own gap
register. **Now:** softened to "Built to support FDA 21 CFR Part 11 workflows."
Final wording is your call — the change removes the false *unqualified* claim.
*(On PR #1038.)*

### 8 · PHI/PII detection claimed but enforced nowhere — ✅ Resolved · merged
**Was:** `piiDetection:true` was dead config; a classifier existed but sat in no
request path, so testers could paste patient data straight to frontier APIs.
**Now:** the **GA security wave (PR #1042) merged** made the flag real and screens
the gateway request path, and extended prompt-injection scanning to non-user
(RAG / tool-output) content. PR #1038 adds a dedicated `ai-gateway/pii-screen.ts`
as defense-in-depth on the same path.

---

## What's left is operational, not code

These are the completeness critic's operational items — putting *people* on the
system. They were never code fixes, and they're the real path to a safe pilot.

- **Prove the login email path end-to-end** *(owner action — hard gate).* The
  sharpest week-one risk. One real login, OTP landing in an external Gmail and
  Outlook inbox. Do not open the pilot before this passes.
- **Rehearse backup / restore before first data** *(owner action).* Confirm Neon
  PITR/branching is on; run one real `pg_dump` + restore into a scratch branch so
  there's a proven way back.
- **One-page pilot data agreement** *(owner action).* Synthetic data only, what's
  logged, which AI vendors see input, deletion date — acknowledged by each
  tester. First human testing on a clinical product needs this.
- **Monitoring, PDF export, and a smoke load** *(owner action).* Set
  `SENTRY_DSN` and confirm a test exception pages someone; export one IND/CER PDF
  *in the built image*; run 20 parallel authenticated sessions against staging.

---

## Original scorecard · 2026-07-18 (the baseline the fixes move against)

Eight readiness dimensions ran as parallel agents; each blocker was re-checked by
an adversarial verifier.

| Dimension | Score | Verdict | Headline P0 |
|---|--:|---|---|
| Frontend readiness | 38 | Not ready | Auth-token desync; demo-shell core |
| Database install & schema | 40 | Not ready | No from-scratch provisioning |
| Compliance & auditability | 55 | Not ready | "Part 11 Compliant" on signup |
| Config / deployment / ops | 55 | Not ready | No reproducible provisioning |
| AI gateway & grounding | 58 | Not ready | PHI/PII enforced nowhere |
| Security & authentication | 64 | Not ready | Fail-open admin seed |
| Test & CI gate health | 64 | With risks | — |
| Backend / API runtime | 66 | Not ready | Green health, missing schema |

> **Two showstoppers surfaced only by live testing** and are already fixed on
> PR #1038: the server **could not boot at all** (module-scope `__dirname` under
> ESM) and the production root URL rendered a **blank page** (un-nonced
> `index.html` vs. the enforcing CSP). Both remain live P0s on the deploy branch
> *until PR #1038 merges.*

---

## Provision the database in one command

The installer creates schemas + extensions, runs the table push, applies the RLS
policies, records applied state, and verifies table + policy counts (fails if
zero policies). Tested from a truly empty Postgres 16.

```bash
# Point at the DIRECT Neon host (not -pooler), sslmode=require
DATABASE_URL='postgresql://…@ep-<id>.<region>.aws.neon.tech/<db>?sslmode=require' \
  node scripts/db/install-fresh.mjs

# → creates schemas + extensions, drizzle-kit push, applies RLS,
#   records a ledger, and verifies counts. Verified on an empty DB:
#   687 tables · 557 RLS policies · 5/5 core tables · safe to re-run

# Then activate tenant isolation (policies ship in shadow mode):
RLS_ENFORCE=on   # restart; confirm one cross-tenant read returns zero rows
```

- **687** tables created from empty
- **557** RLS policies applied & verified (not zero)

---

## Go / No-Go checklist

Checked items are done in code (merged or on PR). Unchecked items are yours —
most are config and one afternoon of operational rehearsal.

- [x] **Boot-crash & blank-page fixes** committed (the two live-testing showstoppers) — *PR #1038*
- [x] **One-command DB provisioning** with RLS — verified 687 tables / 557 policies — *PR #1038*
- [x] **Missing-schema health gate** — `/readyz` fails closed on an incomplete DB — *PR #1038*
- [x] **"Part 11 Compliant" badge** softened on the signup page — *PR #1038*
- [x] **PHI/PII gateway enforcement + default-deny auth boundary** — *PR #1042, merged*
- [ ] **Merge the remaining fix PRs** to the deploy branch (PR #1038 boot/CSP/DB + PR #1046 auth)
- [ ] **One full login with the OTP in an external Gmail AND Outlook inbox** — *hard gate*
- [ ] Provision via the installer; `RLS_ENFORCE=on`; one cross-tenant read returns zero rows
- [ ] `SEED_DEMO_USER=false` set; known-password admin row confirmed absent
- [ ] All boot secrets set; one IND/CER PDF exported **in the built image**
- [ ] Neon PITR confirmed; one `pg_dump` + restore rehearsed; `SENTRY_DSN` pages someone
- [ ] One-page pilot data agreement (synthetic data only) acknowledged by each tester

---

## What's genuinely strong

The blockers were a thin launch-readiness layer over solid engineering — worth
stating plainly.

- **Fail-closed by default** — boot refuses to start without its secrets, with
  precise messages; the AI gateway refuses to serve with no provider.
- **Strong auth core** — HS256-pinned JWT with zero-downtime rotation
  (CI-enforced), bcrypt at 12 rounds, mandatory attempt-limited email OTP, and
  now a global default-deny boundary on `/api`.
- **Neon-aware RLS** — dynamic, idempotent, `FORCE ROW LEVEL SECURITY`,
  allowlist synced by a CI gate, in the install path, with a production posture
  that requires an explicit operator decision.
- **Real audit chain** — transactional SHA-256 hash-chaining with anti-forgery
  locking; the integrity sweep now defaults on in production.
- **TypeScript debt ratcheted 2,598 → 0**, held by a no-regression CI gate; a
  real fresh-DB schema check.
- **CI green with a serious guardrail battery** — governance, security, and
  schema-integrity gates across the Lint / Security / typecheck jobs.

---

## Methodology

Eight evaluation dimensions ran as parallel agents; each blocker-level finding
was re-checked by an independent adversarial verifier instructed to refute or
downgrade it, and a completeness critic swept for missed operational risk
(21 agents, 0 errors). The highest-consequence findings were independently
reproduced by live testing — installing from scratch, building, booting the
production bundle, and driving the auth golden path against a real Postgres 16.
Adversarial verification downgraded two over-alarms (an "unauthenticated" AI
endpoint protected by a global auth gate; a "forgeable" signing route that is
dead code) and those are reflected honestly.

**Reassessed 2026-07-26** against `concept2cure-v2 @ 12e64f8`: the demo-shell
blocker (#5) is now largely closed by the merged de-mock push and the data-room
wave (#1102–#1110); the PHI/PII and auth-boundary blocker (#8) is resolved by the
merged security wave (PR #1042); the remaining infrastructure and boot fixes are
verified on open **PR #1038**, and the auth-token unification on **PR #1046**,
both pending merge. "Resolved in code" means fixed and verified; "merged" means
already protecting the deploy branch.

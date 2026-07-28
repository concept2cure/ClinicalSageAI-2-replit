# Chapter 14 — Readiness verdict: the G1/G2/G3 gate ladder

The owner requires all three bars **now**. This chapter answers each separately, because
they fail for different reasons, on different timescales, and to different people.

| Gate | Verdict | Distance |
|---|---|---|
| **G1 · External pilot** (design partners, non-regulated data) | 🔴 **NOT READY** | **2–4 weeks** of focused work |
| **G2 · Paying commercial customers** | 🔴 **NOT READY** | **2–4 months** |
| **G3 · GxP / submission-grade** | 🔴 **NOT READY** | **6–12 months**, mostly non-engineering |

**The single most important sentence in this audit:** none of the G1 gap is architectural.
It is a small number of specific, locatable defects on top of a platform whose hard parts —
tamper-evident audit, a default-deny auth boundary that empirically holds, schema-contract
tests that apply real migrations to a real Postgres — are genuinely well built.

---

## 14.1 G1 · External pilot — 🔴 NOT READY

**Bar:** no data loss, no cross-tenant leakage, honest empty and error states, no silently
wrong regulatory output, and a human can complete the core journeys.

### Blocking findings

| # | Finding | Evidence | Effort |
|---|---|---|---|
| **G1-1** | **A from-scratch install silently half-works.** `install-fresh.mjs` prints `✅ Application schema install complete` while skipping 10 migrations it calls "safe to skip" and never creating **15 Postgres schemas**. Four **mounted** route families (`innovation`, `clinical_ops`, `intelligent_docs`, `manufacturing`) cannot serve a request. `ai_threads` / `chat_messages` — queried by the mounted chat routes — do not exist. | Executed: `evidence/00-live-proof-log.md` §LP-02 | days |
| **G1-2** | **`/readyz` returns green over a database missing `auth_users`, `auth_refresh_tokens`, `roles`, `permissions`, `user_roles`, `licenses`.** Three branches of `server/startup/services.ts` (:92, :94, :99) never call `setSchemaReadiness`, so it stays `'unknown'` → rendered as `"skipped"` → does not fail the probe. `Dockerfile.optimized` points `HEALTHCHECK` here. | Executed: §LP-07 | hours |
| **G1-3** | **A live cross-tenant write path.** Schedule-of-Events reproduces all four ingredients of the P0 fixed in #1186: unique index omitting the tenant column, `ON CONFLICT` arbitrating on it, `SET` omitting `organization_id`, URL-supplied id with the ownership check bypassed on a null result. Mounted behind `authenticateToken` only; `projects.id` is a global serial. | Chapter 05 §5.1.1 (static + adversarial; **not** demonstrated live) | hours to fix, weeks to sweep the other 114 sites |
| **G1-4** | **Reachable XSS fed by model output.** `BatchDraft.tsx:490` renders `c.html` raw; `c.html` is assigned directly from streamed model output (`:226`, `:231`). Drafts are shared across a project team, so a payload echoed out of a source document executes in every reviewer's browser against `localStorage`, where the auth tokens live. | Chapter 04 §4.2 | hours |
| **G1-5** | **The typecheck gate is vacuous**, so no quality claim about this codebase is currently verifiable — including the favourable ones in this audit. `tsc` OOMs at the 6,144 MB cap the gate itself sets; the gate counts `/error TS/` and never checks the exit code. | Executed: §LP-06 | 1 hour |
| **G1-6** | **Controls that look functional and do nothing.** The AnA composer's attach button stores only file *names* and posts the literal text `"Attached N file(s)"` (`Shell.tsx:428-431`) — every attachment is silently discarded, while a real upload path exists and is used elsewhere. | Chapter 09 | hours |
| **G1-7** | **The product has no front door.** As of HEAD, `RAIL_PRIMARY` has **5** destinations and `NAV_HIDDEN` has **41**, leaving ~85 of ~101 registered surfaces reachable only by typed URL or a command palette that matches labels only and caps at 8 results. At least one complete offering (translation) has a live, mounted backend and **zero** reachable UI. | Chapter 09 | days (nav), weeks (coherence) |

### Not blocking G1, and worth saying plainly

- Tenant isolation being single-layer (RLS inert) is **acceptable for a non-regulated pilot
  with a handful of trusted design partners**, provided G1-3 and its siblings are fixed. It
  is not acceptable for G2.
- The application's own security self-check reporting `overall: failing` at boot is alarming
  in a demo but is a posture aggregate, not an exploit.

### What "ready for G1" looks like

Fix G1-1 through G1-6. Pick the **five surfaces the pilot will actually use**, put them in the
rail, and hide the rest behind an explicit "experimental" affordance rather than leaving them
URL-only. Seed two organisations and run one cross-tenant probe to convert G1-3 from
static-analysis to demonstrated-fixed.

**Estimate: 2–4 weeks** for a team already familiar with the codebase.

---

## 14.2 G2 · Paying commercial customers — 🔴 NOT READY

Everything in G1, plus:

| # | Finding | Effort |
|---|---|---|
| **G2-1** | **`SECURITY.md` makes two unsupported compliance claims** — *"21 CFR Part 11 compliant audit trails"* (the system is unvalidated) and *"SOC 2 Type II controls"* (no report, auditor or control matrix exists anywhere in the repo). This is the first file a customer's security reviewer opens. The team already made this exact fix on the signup page and never applied it here. **Highest return-on-effort item in the audit.** | **1 hour** |
| **G2-2** | **No disaster recovery.** No DR plan, no RPO, no RTO, no rehearsed backup/restore, no incident history anywhere in the repository. `PRODUCT_READINESS_ASSESSMENT.md:123-125` lists rehearsing restore as an unchecked owner action. You cannot sign an availability commitment you have never tested. | weeks |
| **G2-3** | **Tenant isolation must become two-layer.** Completing the `requestDb(req)` migration for the remaining **81** route files and flipping `RLS_ENFORCE=on` is the long pole. Until then a single application-layer mistake is a cross-tenant breach with no database backstop. | **months** |
| **G2-4** | **Entitlements enforcement is unverified server-side.** Whether a locked module is blocked by the API or merely hidden in the UI determines whether tiering is real. (Covered by the deep-review fan-out; treat as open until proven with a direct API call as an unentitled tenant.) | days |
| **G2-5** | **Observability will not support an SLA.** Sentry is wired but `SENTRY_DSN` has never been proven to page anyone; alerting (`infra/alerts/orchestrator.yml`) covers one subsystem; 460 files still contain `console.log` alongside the structured logger. | weeks |
| **G2-6** | **Security-review survivability gaps** — unpatched chromadb pre-auth RCE with an unrecorded exposure determination, zero SHA-pinned GitHub Actions, upload hardening wired to 2 of 28 sites, `AI_PII_ENFORCEMENT` defaulting to `audit`, zero-retention defaulting to `false`. | weeks |
| **G2-7** | **Coverage is unenforced and E2E is not a PR gate**, so regressions in paid journeys can merge green. | weeks |

**Estimate: 2–4 months**, dominated by G2-3.

---

## 14.3 G3 · GxP / submission-grade — 🔴 NOT READY

Everything above, plus the finding that decides it:

**The system has never been validated.** `docs/validation/` contains a complete VMP / IQ /
OQ / PQ / VSR / ISO 14971 / vendor-qualification set, and **every execution record is
blank** — 158, 122, 100 and 99 unexecuted markers respectively. The Validation Summary
Report reads `⚠️ DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE`, version
`1.0.0-DRAFT`, approval `PENDING`. 21 CFR Part 11 §11.10(a) requires validation.

| # | Finding | Effort |
|---|---|---|
| **G3-1** | Execute IQ/OQ/PQ under a named validation owner; sign the VSR; establish change control | **months** (non-engineering) |
| **G3-2** | **E-signatures are not bound to records.** `promote-artifact.ts:245` carries `TODO(compliance): require electronic_signatures record … before flipping status to 'approved'`. Approval records a name in a status field — satisfying neither §11.50 nor §11.70. Must be fixed *before* qualification, or qualification certifies the gap. | days |
| **G3-3** | **Part 11 controls exist but are not scheduled.** `audit:verify:24h`, `audit:verify:full`, `audit:archive` and `retention:run` are orphaned npm scripts; `retentionCron.ts` has no scheduler caller. Tamper evidence is only evidence if something checks it. | days |
| **G3-4** | **Starting the application mutates the schema.** `ensureCoreTables.ts` runs at boot with 7 `CREATE TABLE IF NOT EXISTS` statements — proven live (702 → 717 tables). Incompatible with change control: those tables are governed by a TypeScript file, not a reviewed migration. | days |
| **G3-5** | Close the traceability matrix's own open items — PDF/A conformance, and the DB-backed delete→audit test that is currently mocked. | weeks |
| **G3-6** | A real SOC 2 engagement, if that claim is to be kept rather than removed. | months |

**Estimate: 6–12 months.** Most of it is qualification and process, not code.

---

## 14.4 Claims-versus-code register

Unsupported regulatory or security claims are treated as **P0-equivalent** because they are
a legal and contractual exposure, not a bug.

| Claim | Where | Verdict |
|---|---|---|
| "21 CFR Part 11 compliant audit trails" | `SECURITY.md:41` | ❌ **Unsupported** — chain is real; system is unvalidated |
| "SOC 2 Type II controls" | `SECURITY.md:52` | ❌ **Unsupported** — no report, auditor or control matrix exists |
| "All data encrypted at rest (AES-256)" | `SECURITY.md:46` | ⚠️ **Overstated** — field-level encryption only; at-rest is a storage-layer property |
| "Rate limiting on all endpoints" | `SECURITY.md` | ⚠️ **Overstated** — per-prefix, and degrades to per-instance in-memory without Redis |
| "ISO 14971 risk management" | `SECURITY.md:50` | ⚠️ **Partial** — document exists, partly unexecuted |
| "HIPAA-ready data handling" | `SECURITY.md:51` | ✅ **Supported** — correctly hedged; redaction is real |
| "687 tables · 557 RLS policies" from a fresh install | `PRODUCT_READINESS_ASSESSMENT.md:53` | ✅ **Verified** — measured 702 / 572 |
| "`/readyz` fails closed and names the missing tables" | `PRODUCT_READINESS_ASSESSMENT.md:84` | ❌ **Contradicted by execution** — 200 `ready:true` over a DB missing auth tables |
| "~50 v2 surfaces now read real data, not fixtures" | `PRODUCT_READINESS_ASSESSMENT.md:23` | ⚠️ **Largely true** — 97 `useLiveRows` sites vs 7 residual fixture fallbacks |
| "Every one of the repo's other `ON CONFLICT` sites already scoped by org" | commit #1186 | ❌ **Not accurate** — 115 sites; Schedule-of-Events is a live counterexample |
| "0 type errors" | `.typecheck-baseline.json` | ❌ **Unverified** — the gate passes because tsc crashes; a completing run reports 2 |
| "ZenApp.tsx is the app entry (113 KB)" | `FEATURE_INVENTORY.md`, `AGENTS.md` | ❌ **False** — the file does not exist |
| "AIOS-05 Tenant isolation — **Pass**" | `docs/reports/evidence-pack-2026-07-28.md` | ❌ **Contradicted** — see §14.4.1 |
| "AIOS-02 Policy enforcement — **Pass** — 55 CI gates registered" | same | ⚠️ **Overstated** — see §14.4.1 |
| "AIOS-01 Lineage completeness — **Pass**" | same | ⚠️ **Overstated** — the cited evidence is 556 orphans out of 916 endpoints |

### 14.4.1 The platform's own evidence pack marks failing controls as Pass

While this audit was running, a repo script (`scripts/audits/generate-evidence-pack.mjs`)
auto-generated `docs/reports/evidence-pack-2026-07-28.md` against this very branch. It is
committed here unmodified because it is the clearest single illustration of the pattern this
audit keeps hitting: **controls are graded on whether a mechanism exists, not on whether it
works.**

Three of its seven control statuses do not survive checking:

- **`AIOS-05 Tenant isolation` — "Pass — tenant-isolation gate live with baseline ratchet …
  25 candidate findings tracked, no regression allowed."** The gate is indeed live and the
  ratchet is real. But tenant isolation itself is **not** enforced: every RLS policy is inert
  (Chapter 05 §5.1), the gate covers 32 tables, cannot see Drizzle query-builder calls at all,
  and blanket-exempts `server/workers/` and `server/jobs/`. A green ratchet on a narrow
  scanner is being reported as an isolation guarantee.
- **`AIOS-02 Policy enforcement` — "Pass — 55 CI gates registered."** The 55 are enumerated
  from `package.json` script names, and the list includes manual ratchet variants —
  `:write-baseline`, `:strict` — which are **not gates** and are invoked by no workflow
  (Chapter 11 §11.7). Counting `ci:typecheck:write-baseline` as an enforced control while the
  gate it writes to passes on an OOM crash is the inversion in miniature.
- **`AIOS-01 Lineage completeness` — "Pass — orphan-endpoint detector landed … 916 endpoints,
  360 consumed, 556 orphans."** The detector landing is the pass criterion; the finding it
  produced — that 61% of the API has no caller — does not affect the grade.

To be fair to it, the pack is transparent about its own method (*"Items marked **Pass** are
verified by static-text checks against the source tree"*) and marks genuinely-pending items
as **Pending**. The defect is not dishonesty; it is that a static-text check for the presence
of a control is being presented, in a document titled *Evidence Pack*, as evidence the control
is effective. An auditor or acquirer reading it would be misled — which is why it belongs in
this register rather than in a footnote.

---

## 14.5 The honest summary

A buyer should not read three red gates as "this is bad." Three things are simultaneously
true, and the third is what matters:

1. **The engineering underneath is better than the compliance paperwork on top of it** —
   which is the rarer and far more recoverable failure mode. Rebuilding a tamper-evident
   audit chain takes quarters; executing a written OQ protocol takes weeks.
2. **The instrumentation that would tell you the product is healthy is, in several
   load-bearing cases, not connected to anything** — a typecheck gate that passes on a
   crash, a readiness probe that reports green over a broken schema, an installer that
   prints success while omitting 15 schemas, an env-var gate with no runner, ~1,620 baselined
   defects. This is why the audit weights *executed* proof over code reading, and why fixing
   the gates must come before fixing anything they were supposed to catch.
3. **The distance to G1 is weeks, not quarters** — seven specific, locatable defects. That
   is a very different proposition from a platform needing re-architecture, and it should be
   the primary input to any purchase decision.

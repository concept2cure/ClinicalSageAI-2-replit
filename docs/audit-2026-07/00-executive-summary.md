# Executive summary

**Concept2Cure.RI / TrialSage · purchase-grade forensic audit · 2026-07-28 · `concept2cure-v2` @ `576ec5d`**

---

## The verdict in one paragraph

This is a substantial, genuinely-engineered platform whose hardest problems are largely
solved and whose connective tissue is missing. The tamper-evident audit chain is real
cryptography. The default-deny authorization boundary holds under live probing. The
proof-tier test suites apply real migrations to a real database and pass, 171 tests with
zero skips. Against that: a from-scratch install silently omits fifteen Postgres schemas, the
health probe reports green over a database with no authentication tables, the flagship
typecheck gate passes because the compiler runs out of memory, every row-level-security
policy is compiled and inert, and the system has never been validated. **None of the gap to a
credible external pilot is architectural** — it is roughly seven specific, locatable defects,
two to four weeks of work. That number, more than any other in this report, is what should
drive a decision about this asset.

## Readiness

| Gate | Verdict | Distance |
|---|---|---|
| **G1 · External pilot** (design partners, non-regulated data) | 🔴 **Not ready** | **2–4 weeks** |
| **G2 · Paying commercial customers** | 🔴 **Not ready** | 2–4 months |
| **G3 · GxP / submission-grade** | 🔴 **Not ready** | 6–12 months, mostly non-engineering |

Detail: [Chapter 14](14-readiness-gate-ladder.md).

## The ten findings that matter

Each was proven by executing the system, not by reading it. Full detail in
[`evidence/00-live-proof-log.md`](evidence/00-live-proof-log.md).

| # | Finding | Sev |
|---:|---|---|
| 1 | **The typecheck gate is vacuous.** It counts `error TS` strings and never checks tsc's exit code. `tsc` runs out of memory at the 6,144 MB cap *the gate itself sets*; a crash log contains no matches, so it reports zero and passes. Given 24 GB it completes with **2 real errors**, from a PR merged the day before this audit. Observed passing in CI on this audit's own PR. | P0 |
| 2 | **A from-scratch install reports success while being materially incomplete.** It prints `✅ Application schema install complete`, delivers 702 tables / 572 policies (beating its own claim), and never creates **15 Postgres schemas** that server code queries. At least four **mounted** route families cannot serve a request. | P0 |
| 3 | **`/readyz` returns 200 `ready:true` over a database missing** `auth_users`, `auth_refresh_tokens`, `roles`, `permissions`, `user_roles`, `licenses`. Three branches of `startup/services.ts` never set schema readiness. The container `HEALTHCHECK` points here. | P0 |
| 4 | **Every RLS policy is compiled and inert** — gated on a session variable nothing sets — and cannot be switched on until 81 route files move off the shared pool. Tenant isolation is single-layer. | P0 |
| 5 | **A live cross-tenant write path** reproducing all four ingredients of the P0 fixed in #1186, in the Schedule-of-Events subsystem. | P1 |
| 6 | **Reachable XSS fed by model output** — `BatchDraft.tsx` renders streamed AI content as raw HTML; drafts are shared across a project team. | P1 |
| 7 | **The attach button silently discards every file.** Files are kept as names only; the message posts the literal text `Attached N file(s)`. A user asks about an uploaded document and gets a fluent answer grounded in nothing. | P0 |
| 8 | **`SECURITY.md` makes two unsupported claims** — "21 CFR Part 11 compliant" and "SOC 2 Type II controls". No SOC 2 report, auditor or control matrix exists anywhere in the repository. **One-hour fix; highest return in the audit.** | P1 |
| 9 | **The system is not validated.** A full IQ/OQ/PQ/VSR protocol set exists and every execution record is blank. The VSR reads `DRAFT — REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE`. | P2 |
| 10 | **No disaster recovery.** No plan, no RPO/RTO, no rehearsed restore, no incident history — aggravated because booting the app mutates the schema and a from-scratch rebuild is known-incomplete. | P1 |

## What is genuinely good

Reported with the same specificity as the defects, because a buyer needs an accurate picture
rather than a hit piece.

- **The audit chain is real cryptography** — SHA-256 chaining with `SELECT … FOR UPDATE`
  anti-fork locking *inside the caller's transaction*, a secret-keyed HMAC seal, and a boot
  matrix that refuses to start rather than run unsealed. Rebuilding this takes quarters.
- **Proof-tier tests apply real migration files** to a real in-process Postgres — 171 tests,
  0 skipped, all passing. They exist because the team caught `vi.mock` hiding schema conflicts.
- **The authorization boundary holds** — nine data endpoints probed unauthenticated all
  returned 401, including in development, where static reading predicted otherwise.
- **The AI gateway fails closed in production** rather than serving demo content, with the
  reasoning written inline.
- **The platform refuses rather than fabricates** — anti-fabrication reject-lists in code,
  `501`s where stubs once returned `{released:true}` unconditionally, honest cold-start
  confidence. This is the most valuable property in the product.
- **`TM-CORTEX-001` is a populated** clause→code→test Part 11 traceability matrix.
- **The npm-audit allowlist went 27 → 1** with `npm ls` proof required per entry.

## Competitive position

Twelve offering categories, five closest competitors each — **66 cited profiles across 56
vendors**, researched live. Detail: [Chapter 13](13-competitive-scorecard.md).

**Us 1.8 / 5 against a best-in-category average of 4.6 / 5. Ten of twelve categories score
"not competitive."**

That severity comes from the lens, chosen deliberately: everything is scored on **what ships
and is reachable**. Three properties get punished hard — only 5 of ~101 surfaces are
navigable; every IQ/OQ/PQ record is blank, which several category analyses independently
called *disqualifying rather than a deduction*; and the comparators are Veeva, LORENZ,
Certara, Oracle, MasterControl and Cytel. **These scores measure procurement-readiness, not
engineering quality.**

**The one number that matters:** the **agentic AI layer scores 3.2 and is the sole credible
challenger**, −0.7 from the leader. Every other category is 2.1 or below. That conclusion was
reached independently of [Chapter 16](16-enhancement-roadmap.md), which had already argued
from code evidence that the AI/grounding layer is the real moat. **Two methods converging is
the strongest signal in this audit** — and it says the platform is positioned as a
twelve-category suite while being competitive in one.

Where breadth was the thesis, breadth lost: RIM −3.2, pharmacovigilance −3.9, QMS −3.2. Those
gaps are built on install base and validation packages, which engineering does not close soon.

## The finding underneath all the others

**The instrumentation that would tell you this product is healthy is, in several load-bearing
cases, not connected to anything.** A typecheck gate that passes on a crash. A readiness probe
that reports green over a broken schema. An installer that prints success while omitting
fifteen schemas. An env-var gate with a 244-entry baseline and no runner. A repo-health
baseline that auto-commits itself upward on every merge. ~1,620 baselined defects. Part 11
audit-chain verification that exists as an unscheduled npm script.

The repository's own *Evidence Pack*, auto-generated during this audit, grades
`AIOS-05 Tenant isolation` as **Pass** — on the basis that the gate exists, not that isolation
works. That is the pattern in one line.

This is why the audit weighted executed proof over code reading, and why
[remediation Stage 0](15-remediation-plan.md) is *fix the instruments* — days of work, before
anything else, because until they work a real fix is indistinguishable from another silent pass.

## Remediation, staged

| Stage | Theme | Calendar | Unlocks |
|---|---|---|---|
| **0** | Make the instruments honest | **2–3 days** | Everything else becomes verifiable |
| **1** | Stop the bleeding | **1–2 weeks** | **G1** |
| **2** | Make it sellable | 2–4 months | **G2** |
| **3** | Make it qualifiable | 6–12 months | **G3** |

Every item carries an owner type, an effort estimate and an acceptance test:
[Chapter 15](15-remediation-plan.md). Where to invest beyond safety:
[Chapter 16](16-enhancement-roadmap.md).

## How to read this report

The audit achieves **100% mechanical coverage** of every file, **deep review of every
production surface**, and **executed proof** of the claims that decide the verdict — and says
plainly which findings came from which. It does **not** claim a line-by-line read of 1.49M
lines.

**Not verified, and therefore not claimed:** no authenticated two-org runtime probe, so
cross-tenant findings are static analysis plus adversarial review, *not demonstrated
exploits*. No browser-driven journey walk, so usability findings are code-derived. No
penetration test. No hands-on competitor trials. Whether the AI's output is *correct
regulatory writing* is a domain-expert question this audit does not answer; it assesses
whether the system can tell you when it is wrong. Full statement:
[Chapter 01 §1.4](01-method-and-coverage.md).

Where this audit's own framing was wrong, it is corrected in place rather than quietly
dropped — see the zero-retention correction in [Chapter 04 §4.6](04-security.md), where a
finding first written as negligence turned out to be deliberate honesty.

Every number traces to a re-runnable command under [`evidence/`](evidence/).

## The bottom line

Three red gates should not be read as "this is bad." **The engineering underneath is stronger
than the compliance paperwork on top of it** — the rarer and far more recoverable failure
mode. The commercial finding and the technical finding are the same finding: the hard,
slow, hard-to-copy work is largely done, and the connective tissue is missing in both
directions. A governed AI layer with no UI to render it. A grounding engine nobody can see.
Breadth nobody can navigate. Part 11 machinery that cannot be claimed because the system is
unvalidated.

**Both are convergence problems, not invention problems** — and the competitive scoring says
where to converge.

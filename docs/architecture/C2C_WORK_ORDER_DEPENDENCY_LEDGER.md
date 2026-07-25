# C2C Work Order Dependency Ledger

**Work order:** WO-00 (execution ledger)
**Base SHA:** `2a5b46d1f7977a0b5cc3352c8982ea1c2a42aa22`
**Purpose:** the master completion ledger. Records, per work order, the blockers
WO-00 found, the scope corrections it produced, and the gate that must clear
before work starts.

Status vocabulary: **BLOCKED** (a WO-00 finding must be resolved first) ·
**RESCOPED** (the plan's premise was wrong) · **READY** (no WO-00 blocker) ·
**DEFERRED** (plan-ordered later).

---

## 1. Ledger

| WO | Plan dependency | WO-00 status | Blocking findings | Gate to clear |
|---|---|---|---|---|
| **WO-00** | none | **IN PROGRESS → complete this pass** | — | 5 documents + 5 ADRs |
| **WO-01** Golden journeys | WO-00 | **Journeys A + C PASSING** — C: correction spine (service level, 14 steps); A: authoring loop (route level, real JWTs, 15 steps, C-11 fixed). B + eCTD/dossier phases + Playwright remain | — | in progress |
| **WO-02** Enforcement | WO-00 | **COMPLETE** — guard + contract tier shipped | — | done |
| **WO-03** Proof Packet | WO-01, WO-02 | **UNBLOCKED** — ADR-0009 receipts + revised ADR-0007 both executed | — | after WO-01 |
| **WO-04** Yjs closure | WO-01, WO-02 | **RESCOPED — much smaller** | path mismatch | none new |
| **WO-05** eCTD v4 | WO-01, WO-02 | **BLOCKED on discovery** | ≥6 packagers, 3 zip libs | canonical-publisher ADR |
| **WO-06** Gateway E2E | WO-05 | READY after WO-05 | — | — |
| **WO-07** Doctrine service | WO-00, WO-02 | **BLOCKED** | C-3 | ADR-0008 |
| **WO-08** Reviewer Room | WO-03, WO-07 | **BLOCKED** | C-3 | ADR-0008 (ADR-0009 shipped) |
| **WO-09** M11 compiler | WO-01, WO-02 | READY | — | StudyDesign confirmed canonical |
| **WO-10** Claim Compiler | WO-03, WO-09 | DEFERRED | inherits WO-03 | — |
| **WO-11** RI Graph | WO-00, WO-07 | **BLOCKED** | `data-importer.ts` writes `csr_reports` | corpus-writer ADR |
| **WO-12** AI context-of-use | WO-02, WO-03 | READY after deps | — | — |
| **WO-13** Global branching | WO-05/07/08 | DEFERRED | — | — |
| **WO-14** Device spine | WO-01…WO-08 | DEFERRED (intentional) | — | — |
| **WO-15** Outcome learning | WO-02, WO-11, WO-12 | DEFERRED | — | — |
| **WO-16** Pilot evidence | across phases | READY to design | 8 duplicate health routes | fix `/readyz` |

---

## 2. Scope corrections

Changes to the plan that WO-00 evidence requires. Each is a correction to a
*premise*, not a preference.

### 2.1 WO-04 shrinks substantially
The plan treats CRDT co-editing as an unbuilt terminal gap. `hocuspocus-server.ts`
is a real Y.js server, JWT-verified, mounted at `startup/services.ts:284`, serving
`/collab`. All client CRDT dependencies are installed. Missing: a
`HocuspocusProvider` in the client, and reconciliation of the advertised
`/ws/collab/:roomKey` (`realtime-collab.ts:372`) against the served `/collab`.

**Revised scope:** client binding, path reconciliation, CRDT↔governed-revision
semantics, freeze enforcement for stale clients. Retain the REST lock layer as the
*authority* control — locks and CRDT awareness are complementary, not redundant.

### 2.2 WO-02 becomes verify-and-ratchet
34 of 37 CI guards are already covered and blocking, including gateway-bypass,
tenant-isolation, RLS-allowlist-sync, and no-dev-auth-in-prod.
`environment.ts:284` calls `assertRlsEnforcementForProduction()` at module load,
with a test asserting production refuses to boot without `RLS_ENFORCE`.

**Revised scope:** ratchet existing baselines down; wire the new duplicate-table-DDL guard; **add the missing schema-contract test tier (ADR-0010)**,
which is the genuine gap. Do not rebuild enforcement infrastructure that exists.

### 2.3 WO-03 gains a prerequisite
The Proof Packet aggregates "correction bundle receipts." **No receipt is
persisted and no receipt table exists** (C-4). Historical receipts are
unrecoverable — they were never written.

**Revised scope:** ADR-0009 and a receipt-persistence migration land *before*
WO-03 begins. WO-03's acceptance gate ("tampering with a receipt is detected")
is unmeetable otherwise.

### 2.4 WO-01 should expect to surface further defects
`/api/operating-system`, `/api/resolution`, and `/api/study-design` have no client
consumer, and their unit tests mock the database. The golden journeys will be the
first thing to exercise this stack against a real schema. Schedule accordingly:
WO-01 is partly a discovery exercise, not purely a harness build.

### 2.6 A promotion gate failed open (C-8) — found in WO-02, **FIXED 2026-07-25**

Worse than first reported: the governance tables existed only in dead DDL, so the
**entire boundary layer had never executed** — no rules, no gates, no transition
audit trail. Callers swallowed the throws with bare `catch {}`.

Fixed in the C-9 direction: canonical DDL
(`db/migrations/20260725_governance_boundary_tables.sql`), deployed vocabulary as
a single shared source (`shared/constants/operating-system-vocab.ts`), fail-closed
error handling including denial on unpersistable audit records. Proven by 7
real-service tests against the canonical lineage
(`tests/schema-contract/governance-boundary-gates.contract.test.ts`). Residual:
the caller-side bare `catch {}` blocks in `authoring-actions.ts` — for WO-01.

### 2.9 WO-01 phase 1 — Journey C passing (2026-07-25)

The correction spine ran end-to-end for the first time: conflicting assumptions
→ deterministic finding (llmRole='none') → proposed decision → promotion DENIED
(audited) → plan → bundle → real supersession + hashed receipt → verification →
human reapproval → promotion ALLOWED (audited) → tenant-isolation and
honest-failure checks. 14 steps, 0 failed; manifest + rendered report emitted
per run. Building it caught and fixed a false negative in receipt verification
(supersededObjects type-prefix mismatch) and recorded the dual supersession
representation for ADR-0008-adjacent cleanup.

### 2.8 ADR-0009 executed; C-10 found and fixed (2026-07-25)

Executing receipt persistence exposed that the resolution layer's own storage
(4 tables) existed only in dead DDL — the correction layer had never been
executable in production (C-10). Both fixed: canonical DDL ported, append-only
hashed receipt store + verifier shipped, executor persists receipts and fails
loudly when it cannot. 7 real-executor acceptance tests. Historical bundles
remain unprovable and must be rendered as such in WO-03. Phase 2 (single
transaction for effects + receipt) is recorded in ADR-0009.

### 2.7 The blocking question is substantially answered (C-9)

WO-00 said only a live database could determine which schema shape deploys. That
was too pessimistic — the execution paths are determinable from code, and all
three converge: `migrations/0010_operating_system_foundation.sql` has **no
execution path**, so the raw-SQL shape is what deploys. ADR-0007 must be revised
before execution; a one-query confirmation against a live database is still
recommended but the burden of proof has flipped.

### 2.5 WO-05 needs discovery before implementation
At least six services can produce packages, and three ZIP libraries are installed
(`archiver`, `adm-zip`, `jszip`). WO-05 item 1 (select the canonical publisher) is
a prerequisite sub-phase with its own ADR, not a first step inside implementation.

---

## 3. Required ADRs

| ADR | Decision | Blocks | Status |
|---|---|---|---|
| ADR-0006 | Canonical migration lineage | all schema work | drafted |
| ADR-0007 | Canonical operating-system schema | WO-01, WO-03 | drafted |
| ADR-0008 | Canonical contradiction/overlay stores | WO-07, WO-08 | drafted |
| ADR-0009 | Resolution receipt persistence | WO-03, WO-08 | drafted |
| ADR-0010 | Schema-contract test tier | WO-02 acceptance | drafted |

ADR-0006 must be decided first; the others depend on knowing which lineage is real.

---

## 4. Recommended revised merge order

Deviating from master §7 only where evidence requires:

1. **WO-00** (this pass)
2. **ADR-0006** + environment survey — *new, blocking*
3. **ADR-0007 / ADR-0008** + reconciliation migrations — *new, blocking*
4. **ADR-0009** + receipt persistence — *new; pulled ahead of WO-03*
5. **WO-02** (verify/ratchet + ADR-0010 test tier)
6. **WO-01** (golden journeys — expect discovery)
7. **WO-03** (Proof Packet)
8. **WO-04** (rescoped), **WO-05 discovery** → WO-05 → WO-06
9. **WO-07** → **WO-08**, **WO-09**
10. WO-10 … WO-15 per master §7
11. **WO-16** continuously for approved behavior only

Steps 2–4 are net-new and were not in the original plan. They exist because the
schema conflicts and the missing receipt table make WO-01 and WO-03 unbuildable as
specified.

---

## 5. Baseline record (master WO-00 acceptance gate)

| Item | Value |
|---|---|
| Head SHA | `2a5b46d1f7977a0b5cc3352c8982ea1c2a42aa22` |
| Drift vs report snapshot | none |
| Remote branches | 2 (`concept2cure-v2`, `claude/chatgpt-assessment-review-hfuwlh`) — no stale branch debt |
| Open PRs | 10 — see §5.1 |
| Test baseline | 4 files / **98 tests, all passing**, 963ms (targeted at conflict areas) |
| Full suite | **not run** — `singleFork` mode, 10+ min per `AGENTS.md`; no pass-rate claim made |
| Guards | 37 in `scripts/ci/`; **34 CI-covered** (aggregates resolved) |
| Route auditor | 323 mounts, 8 errors, 7 warnings |
| Governing instructions | one product `AGENTS.md` (root); no nested product files |

### 5.1 Open PRs

| # | Title | Head | Draft | Last updated |
|---|---|---|---|---|
| 1091 | bump pandas 3.0.3→3.0.5 | `dependabot/pip/pandas-3.0.5` | no | 2026-07-23 |
| 1090 | bump fastapi 0.136.3→0.139.2 | `dependabot/pip/fastapi-0.139.2` | no | 2026-07-23 |
| 1089 | bump openai 2.37.0→2.47.0 | `dependabot/pip/openai-2.47.0` | no | 2026-07-23 |
| 1087 | accept brace-expansion GHSA | `deps/brace-expansion` | yes | 2026-07-21 |
| 1081 | re-anchor ui-v2 — HumanFactors | `claude/reanchor-surfaces` | yes | 2026-07-21 |
| 1057 | wire administration/onboarding | `claude/backend-client-onboarding-integration-rul4d5` | yes | 2026-07-21 |
| 1052 | wire wave-2/3 ui-v2 surfaces | `claude/wire-wave2-client-surfaces` | yes | 2026-07-20 |
| 1046 | unify client auth headers | `claude/elegant-lovelace-low2l9` | yes | 2026-07-18 |
| 1045 | persist Module 2.6 summary | `claude/persist-m26-document` | yes | 2026-07-18 |
| 1044 | verify §11.70 content binding | `claude/esign-verify-binding` | yes | 2026-07-18 |

**7 stale draft `claude/*` PRs**, oldest 2026-07-18. Several overlap this
program's scope — #1044 (Part 11 §11.70 tamper detection) is directly relevant to
WO-03 verification, and #1046 (auth header unification) touches every surface.

**Recommendation:** triage all 7 before WO-01. Merging or closing them prevents
this program from re-solving problems already in flight, and #1044 may partially
satisfy a WO-03 requirement.

---

## 6. Explicitly not established

Carried forward as open questions, not findings:

1. Which physical table shape exists in each deployed environment (C-1/C-2/C-3).
   **Only a live database answers this. It gates every migration.**
2. Whether either colliding definition holds production rows.
3. How the root `migrations/` directory executes. `apply-c2c-migrations.mjs`
   applies exactly 3 named files; the path for the rest is unaccounted for.
4. The 6 `COMMAND_REGISTRY` entries (76) without a `COMMAND_HANDLERS` key (70).
5. Full-suite pass rate.
6. Per-surface honest-state behavior (design stream UX-00).
7. Member-by-member diff of the 97 renderable surfaces vs 99 registry entries.

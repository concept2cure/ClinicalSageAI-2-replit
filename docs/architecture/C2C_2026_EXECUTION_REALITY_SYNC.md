# C2C 2026 Execution Reality Sync

**Work order:** WO-00 (reality sync, architecture conflict audit, execution ledger)
**Branch:** `claude/chatgpt-assessment-review-hfuwlh`
**Base SHA:** `2a5b46d1f7977a0b5cc3352c8982ea1c2a42aa22`
**Status:** WO-00 **COMPLETE** — 5 of 5 documents + 5 ADRs delivered. See §7.

---

## 1. Evidence standard

Every claim in this document is derived by reading code at the SHA above. No
prior audit, brief, gap analysis, report, PR description, or code comment was
treated as evidence of system behavior.

This standard is not stylistic. It was adopted because a prior design brief
(`HANDOFF_TO_DESIGN_document_authoring.md` §2, 12 June 2026) asserted that
`server/routes/realtime-collab.ts` was a "production Yjs CRDT + WebSocket
server." That file contains no `yjs` import, no `Y.Doc`, and no WebSocket upgrade
handler. The claim was wrong, it was load-bearing, and it propagated into
downstream planning. All seven `HANDOFF_TO_DESIGN_*.md` files now carry a
retraction banner.

Where something could not be verified from code, it is listed as an open question
rather than stated as a finding.

---

## 2. Current head vs. report snapshot

| | Value |
|---|---|
| `origin/concept2cure-v2` head | `2a5b46d1f7977a0b5cc3352c8982ea1c2a42aa22` |
| Report snapshot | `2a5b46d1f7977a0b5cc3352c8982ea1c2a42aa22` |
| Drift | **none** — `git log 2a5b46d..origin/concept2cure-v2` is empty |

The strategy material's snapshot is current. No re-baselining needed.

### Governing instructions
Only one `AGENTS.md` governs product code (repository root). The single other
match, `.claude/skills/gstack/AGENTS.md`, governs a tooling skill, not product
paths. There are **no nested product `AGENTS.md` files** — the root scope is the
whole rulebook.

---

## 3. Measured scale

All figures parsed from code at `2a5b46d` and re-runnable.

| Measure | Value | Source |
|---|---:|---|
| Tracked files | 7,898 | `git ls-files` |
| Server TypeScript files | 3,249 | `server/**/*.ts` |
| Client TSX files | 506 | `client/**/*.tsx` |
| Route files | 562 | `server/routes/*.ts` |
| Test files | 1,340 | `*.{test,spec}.{ts,tsx}` (922 server, 83 client) |
| Mount **events** | **323** | `scripts/ci/audit-route-mounts.mjs` (the repo's own CI guard) |
| Distinct mounted `/api` prefixes | **365** | all three mount idioms, canonical entry points |
| — no exact literal in `client/src` | 166 (45%) | literal match |
| — **no reference at all** (strict floor) | **134 (36%)** | neither exact path nor last path segment |
| Registry-declared prefixes with no mount | **3** | containment-tested both directions |
| CI guard scripts | 38 | `scripts/ci/` |
| — wired into a workflow (blocking) | **30** | `npm run ci:*` invoked from `.github/workflows/ci.yml` |
| Registry entries | 99 | `ui-surface-registry.ts` (49) + `.ui-v2.ts` (50) |
| — `routes-ready` (no typed contract) | 79 | parsed `readiness` field |
| — `contract-ready` | 5 | " |
| — `kit-only` / `planned` | 9 / 1 | " |
| — Part 11-gated | 68 | parsed `compliance` field |
| Renderable surfaces | 97 | `client/src/concept2cure/v2/surfaceViews.ts` |
| Advisory AnA tools | 410 unique names | `server/services/ana/AnaToolDefinitions.ts` |
| `COMMAND_REGISTRY` entries | 76 | `server/services/ana-ri/command-executor.ts:3938` |
| `COMMAND_HANDLERS` keys | 70 | `…:4534` |
| Distinct tables in `.sql` (schema-qualified) | 1,208 | all `*.sql` |
| — defined in >1 non-archived file | **72** | excluding `_legacy/`, `_deprecated_migrations/`, `docs/archive/` |

### Caveats on method

**This measurement was wrong twice before it was right, and the reason is worth
recording.** This codebase mounts routes through **three** distinct idioms:

```ts
app.use('/api/x', router)                          // 1. literal
{ path: '/api/x', mod: '../routes/x', name: 'X' }  // 2. declarative table
['/api/x', '../routes/x', 'X']                     // 3. tuple array
```

Scanning only idiom 1 gave 244 mounted / 92 dark — an understatement of roughly a
third, and it also produced a spurious "37 registry-declared prefixes are
unmounted" which collapsed to 3 once all idioms and a two-directional containment
test were applied. **Prefer `scripts/ci/audit-route-mounts.mjs` over ad-hoc
greps.** Any figure in any document derived from a single mount idiom is wrong,
including the first version of this one.

- The 134 dark prefixes are a **floor**: literal + last-segment matching still
  undercounts dynamically-constructed URLs. It is a reproducible signal, not a census.
- The 1,340 test files are files, not assertions. A **targeted** baseline was run
  (§3.1); the full suite was not. No full-suite pass-rate claim is made.
- 76 registry entries vs. 70 handler keys implies up to six commands may be
  declared without an executor. Not yet diagnosed — see §6.

### 3.1 Test baseline (run in this pass)

`npx vitest run` against the four suites covering the conflict areas:

| Suite | Result |
|---|---|
| `server/services/__tests__/operating-system.test.ts` | pass |
| `server/config/__tests__/environment.test.ts` | pass |
| `server/services/__tests__/embedding-corpus-policy.test.ts` | pass |
| `server/services/ai-gateway/__tests__/promptInjection.test.ts` | pass |
| **Total** | **4 files / 98 tests passing, 963ms** |

**These passing tests do not clear C-1 or C-2.**
`operating-system.test.ts:31` calls `vi.mock('../../db')`, replacing the entire
Drizzle surface with stubs. The suite asserts nothing about the schema — mocks
accept any column name and any enum value. The collision is invisible to the test
suite by construction, which is why it survived. See ADR-0010.

---

## 4. Blocking conflicts found

Full detail in `C2C_SCHEMA_AND_ENUM_CONFLICT_LEDGER.md`. Summary:

| # | Conflict | Blocks |
|---|---|---|
| C-6 | Two competing migration lineages (`migrations/` and `db/migrations/`); the conflict-resolving manifest covers only the latter | all schema work |
| C-1 | `assumption_records` defined twice, incompatible DDL, two live consumers | WO-01, WO-03, WO-08 |
| C-2 | `decision_records` defined twice, incompatible DDL | WO-03, WO-08 |
| C-3 | Contradiction/overlay tables defined twice | WO-07, WO-08 |
| C-4 | **`BundleExecutionReceipt` is never persisted; no receipt table exists** | WO-03, WO-08 |
| C-5 | `BundleExecutionReceipt` type defined twice, different shapes | WO-03 |
| C-7 | Decision-record service vocabulary diverges from Drizzle enums; collapses three orthogonal state machines | WO-03 |

Five ADRs are required before WO-01/WO-03 can safely begin. C-4 in particular is
a **sequencing change**, not just a defect: receipt persistence is a prerequisite
for the Submission Proof Packet, not a component of it.

---

## 5. Corrections to the inherited plan

The master work order and the competitive report are planning documents, not
evidence. Where this audit checked their premises, three were materially wrong
and two held up — with consequences for scope in both directions.

### 5.1 Collaborative editing is not an unbuilt terminal gap *(affects WO-04)*

WO-04 is scoped as closing a "documented terminal collaboration gap." The server
half already exists and runs:

- `server/services/hocuspocus-server.ts` — a real Hocuspocus/Y.js CRDT server
  with JWT signature verification in `onAuthenticate` (the file's own comments
  record a fixed attribution-forgery vulnerability, so it has been security-reviewed).
- Mounted at `server/startup/services.ts:284` via `attachHocuspocusToServer`.
- Handles upgrades at **`/collab`** (`hocuspocus-server.ts:116`).
- Client dependencies already installed: `@hocuspocus/provider` 4.1.0,
  `@tiptap/extension-collaboration` 3.23.4, `-collaboration-cursor` 2.26.2,
  `@tiptap/y-tiptap` 3.0.2, `y-prosemirror` 1.3.7, `yjs` 13.6.30.

What is actually missing:

1. **No client connects.** No `HocuspocusProvider` is instantiated anywhere in
   `client/src`. `AuthoringCollab.tsx` polls REST; its only reference to
   y-websocket is a comment.
2. **Path mismatch.** `server/routes/realtime-collab.ts:372` advertises
   `/ws/collab/:roomKey` to clients. The server listens on `/collab`. A client
   that trusted the advertised URL would fail the upgrade.

**WO-04 should be rescoped** from infrastructure build to client binding, path
reconciliation, and CRDT-to-governed-revision semantics. Materially smaller.

### 5.2 Resolution receipts are not persisted *(affects WO-03, WO-08)*

See C-4. The strategy material's claim that the bundle executor "persists a
BundleExecutionReceipt" is not supported by the code. Effects are durable; the
proof object is not. This should not be claimed externally until a receipt table
ships.

### 5.3 Two capability counts were overstated or unverified

| Claim in prior material | Measured at `2a5b46d` |
|---|---|
| "~410 advisory tools" | **410 unique tool names** — accurate |
| "~150 platform-mutation commands" | `COMMAND_REGISTRY` **76** / `COMMAND_HANDLERS` **70** — overstated ~2× |
| "108 route groups with no client consumer" | Independent measure: **134 of 365** distinct prefixes (36%). Different method, same structural conclusion — the problem is real and larger. |

### 5.4 Premises that held up — WO-02 shrinks

Two things the plan treats as gaps are already built:

**RLS fails closed.** `server/config/environment.ts:284` calls
`assertRlsEnforcementForProduction()` at module load, and
`server/config/__tests__/environment.test.ts:321` asserts the app *"refuses to
load in production when `RLS_ENFORCE` is unset."* Verified passing in this pass.

**CI enforcement is broadly wired.** 30 of 38 guard scripts run as blocking gates
in `.github/workflows/ci.yml`, including gateway-bypass (with a frozen baseline),
tenant-isolation, RLS-allowlist-sync, tenant-column-types, no-dev-auth-in-prod,
no-mock-in-prod-routes, regulated-delete-audit, route-mount-audit, and the
docx/pdf/embedding runtime canonicality checks.

*An earlier pass in this audit reported only ~7 guards were wired. That was a
measurement error — workflows invoke guards through `npm run ci:*` aliases, not by
script filename.*

**WO-02 is therefore verify-and-ratchet, not rebuild.** The genuine gaps are:
(a) the missing schema-contract test tier (ADR-0010), and (b) two unwired
governed-export guards (`ci:governed-export-routes`,
`ci:governed-export-consequence-shape`) — the cheapest available wins.

### 5.5 The moat capabilities have no client consumer

`/api/operating-system` (assumptions + decisions), `/api/resolution` (correction
bundles), `/api/study-design`, `/api/c2c/study-twin`, `/api/evidence-fabric`,
`/api/data-lineage` and `/api/regulatory-graph` are all **dark** — mounted, with no
reference anywhere in `client/src`.

Combined with §3.1 (their tests mock the database), this means **nothing — not a
user, not a test — has ever driven the assumption/decision/resolution stack
against a real schema.** That is the mechanism by which C-1 through C-4 survived.

**Consequence for WO-01:** the golden journeys will be the first thing to exercise
this stack end to end. They should be expected to surface further defects of the
C-1 class, and scheduled as partly a discovery exercise rather than purely a
harness build.

---

## 6. Open questions — not findings

Deliberately unresolved by this pass; each requires evidence this repository
cannot supply on its own.

1. **Which physical table shape exists in each deployed environment** for the
   colliding tables. Only a live database answers this. It must be answered before
   any migration, since a wrong guess reinterprets regulated history.
2. **Whether either colliding definition holds production rows.**
3. **How the root `migrations/` directory is executed.**
   `scripts/db/apply-c2c-migrations.mjs` applies exactly three named files from it
   and nothing else. The execution path for the remainder — including
   `0010_operating_system_foundation.sql` — is unaccounted for.
4. **The six `COMMAND_REGISTRY` entries with no `COMMAND_HANDLERS` key**: dead,
   aliased, or dispatched elsewhere?
5. **Per-surface honest-state behavior.** No UI component was audited in this
   pass. This is the design stream's UX-00.
6. **Test suite pass rate.** Not run. No claim made.

---

## 7. WO-00 completion status

**WO-00 is COMPLETE.** All five required documents and five ADRs are delivered.

| Required output | Status |
|---|---|
| `C2C_2026_EXECUTION_REALITY_SYNC.md` | **complete** (this document) |
| `C2C_SCHEMA_AND_ENUM_CONFLICT_LEDGER.md` | **complete** |
| `C2C_CANONICAL_SERVICE_AND_STORE_MAP.md` | **complete** |
| `C2C_ROUTE_SURFACE_CALLER_MATRIX.md` | **complete** |
| `C2C_WORK_ORDER_DEPENDENCY_LEDGER.md` | **complete** |
| ADR-0006 canonical migration lineage | **drafted, Proposed** |
| ADR-0007 canonical operating-system schema | **drafted, Proposed** |
| ADR-0008 canonical contradiction/overlay stores | **drafted, Proposed** |
| ADR-0009 resolution receipt persistence | **drafted, Proposed** |
| ADR-0010 schema-contract test tier | **drafted, Proposed** |

### Required investigation — item by item

| # | Item | Status |
|---|---|---|
| 1 | Head SHA vs `2a5b46d1` | done — identical, no drift |
| 2 | Root and nested `AGENTS.md` | done — one product file (root); no nested product files |
| 3 | Inventory callers/routes/schemas/tables/migrations/tests/flags/surfaces | done — service map + route matrix |
| 4 | Classify each path | done for schema, services, AI/embedding/corpus, collaboration. **eCTD packaging deferred** to WO-05 item 1 with an owner assigned |
| 5 | Assumption-model drift | **resolved — a real contract defect (C-1), not a mapping** |
| 6 | Decision-record states vs Drizzle enums | **resolved — C-2 and C-7; three state machines collapsed into one column** |
| 7 | Receipt/supersession/correction durability | **resolved — C-4: effects durable, receipt never persisted** |
| 8 | Canonical retrieval/embedding/corpus paths | done — canonical three-layer embedding path confirmed; gateway bypasses and `data-importer.ts` corpus write identified |
| 9 | Re-classify already-built / terminal-gap / net-new | done — §5 |

### Acceptance gate

| Gate | Status |
|---|---|
| No product code changed | **met** — documentation and ADRs only |
| Every work order has verified file owners and interfaces | **met** — dependency ledger §1 |
| Every duplicate/semantic conflict has an owner and proposed resolution | **met** — service map §9 |
| Current head, open PRs, stale branches, test baseline recorded | **met** — dependency ledger §5 |

---

## 8. Recommendation

Three items are **master §9 stop conditions** and must clear before WO-01 or WO-03:

1. **C-6 / C-1 / C-2 / C-3** — *"the actual schema conflicts with the service
   contract"* and *"two active canonical stores claim the same responsibility."*
   → ADR-0006, ADR-0007, ADR-0008.
2. **C-4** — receipt persistence is a **prerequisite** for WO-03, not a component
   of it. WO-03's acceptance gate is otherwise unmeetable. → ADR-0009.
3. **No schema-contract test tier** — the defect class is currently undetectable
   by CI. → ADR-0010.

### The one thing this repository cannot answer

**Which physical table shape exists in each deployed environment.** Every
migration decision depends on it, the answer may differ per environment, and a
wrong guess reinterprets regulated history. A read-only schema survey against each
environment is the required next action — it is an external dependency, and it
gates ADR-0006 through ADR-0009.

### Also recommended before WO-01

Triage the **7 stale draft `claude/*` PRs** (dependency ledger §5.1). Two overlap
this program directly: **#1044** (Part 11 §11.70 content-binding tamper detection)
may partially satisfy a WO-03 verification requirement, and **#1046** (auth header
unification) touches every surface. Merging or closing them prevents this program
from re-solving work already in flight.

**Stopped after Work Order 00; no later work started.**

# C2C 2026 Execution Reality Sync

**Work order:** WO-00 (reality sync, architecture conflict audit, execution ledger)
**Branch:** `claude/chatgpt-assessment-review-hfuwlh`
**Base SHA:** `2a5b46d1f7977a0b5cc3352c8982ea1c2a42aa22`
**Status:** WO-00 **in progress** — 2 of 5 required documents complete. See §7.

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
| Mounted `/api` prefixes | 244 | `app.use('/api/…')` in `server/bootstrap/register-*.ts` |
| — with **zero** reference in `client/src` | **92 (38%)** | literal-prefix match against `client/src/**/*.{ts,tsx}` |
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
- The 92 dark prefixes are a **floor with a known bias**: literal matching
  undercounts dynamically-constructed URLs and overcounts prefixes referenced
  only from dead client code. It is not a census; it is a reproducible signal.
- The 1,340 test files are files, not assertions, and this pass did **not** run
  the suite. No claim is made here about pass rate. Any figure of that kind
  circulating in prior documents is unverified by this audit.
- 76 registry entries vs. 70 handler keys implies up to six commands may be
  declared without an executor. Not yet diagnosed — see §6.

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
| C-7 | Decision-record service vocabulary diverges from Drizzle enums; collapses two orthogonal state machines | WO-03 |

Five ADRs are required before WO-01/WO-03 can safely begin. C-4 in particular is
a **sequencing change**, not just a defect: receipt persistence is a prerequisite
for the Submission Proof Packet, not a component of it.

---

## 5. Corrections to the inherited plan

The master work order and the competitive report are planning documents, not
evidence. Where this audit checked their premises, three were materially wrong.

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
| "108 route groups with no client consumer" | Independent measure: **92 of 244** mounted prefixes. Different method, same structural conclusion. |

### 5.4 One premise that held up

RLS enforcement is stronger than "warn-only." `server/config/environment.ts:284`
calls `assertRlsEnforcementForProduction()` at module load, and
`server/config/__tests__/environment.test.ts:321` asserts the app *"refuses to
load in production when `RLS_ENFORCE` is unset."* A meaningful portion of WO-02 §1
may already be satisfied. WO-02 should **verify before rebuilding.**

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

**WO-00 is not complete.** Delivered in this pass:

| Required output | Status |
|---|---|
| `C2C_2026_EXECUTION_REALITY_SYNC.md` | **this document** |
| `C2C_SCHEMA_AND_ENUM_CONFLICT_LEDGER.md` | **complete** |
| `C2C_CANONICAL_SERVICE_AND_STORE_MAP.md` | not started |
| `C2C_ROUTE_SURFACE_CALLER_MATRIX.md` | not started |
| `C2C_WORK_ORDER_DEPENDENCY_LEDGER.md` | not started |
| ADRs 001–005 | not started |

Remaining investigation required by WO-00 §"Required investigation":

- item 4 — classify each path as canonical / transitional / legacy / duplicate /
  experimental / unmounted / dead (partially done for schema; not for services);
- item 8 — canonical retrieval / embedding / corpus paths and active alternates
  (**not started**);
- item 9 — re-classify already-built / terminal-gap / net-new (started: §5).

No product code has been changed. No migration authored. No test modified.

---

## 8. Recommendation

Two items should be treated as **stop conditions under master work order §9**
and resolved before WO-01 or WO-03 begin:

1. **C-6 / C-1 / C-2 / C-3** — *"the actual schema conflicts with the service
   contract"* and *"two active canonical stores claim the same responsibility."*
2. **C-4** — receipt persistence is a prerequisite for WO-03, not a component of
   it. WO-03's acceptance gate cannot be met without it.

The remaining three WO-00 documents should be completed before any ADR is
finalized, since the canonical service map may reveal further competing stores
that belong in the same decisions.

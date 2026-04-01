# Stage 8 — Protected Organs Lock

**Generated:** 2026-04-01
**Branch:** `concept2cure-v2` (HEAD `0e8674c3`)
**Purpose:** Declare which files may NOT be deeply rewritten until specific stage prerequisites are met

---

## 1. What "Protected" Means

A protected organ is a file that:

1. Has **critical blast radius** — breaking it breaks the product
2. **Cannot be safely changed** without a regression net covering its critical paths
3. Must have **stage-gated prerequisites** before deep surgery is allowed

**Protected does NOT mean frozen.** Small, targeted, behavior-preserving changes are allowed.
What is forbidden is deep restructuring, domain rewriting, or speculative refactoring.

### Allowed on protected organs

- Bug fixes with test evidence
- Additive feature wiring (new lazy imports, new sidebar items) if contract tests exist
- Comment and documentation improvements
- Import cleanup that does not change runtime behavior

### Forbidden on protected organs

- Moving responsibilities between files without extraction tests
- Rewriting render logic or state management patterns
- Changing URL contracts, redirect behavior, or auth flow
- Deleting code without explicit ownership proof
- Aesthetic refactoring (renaming, reformatting) that creates merge noise

---

## 2. Protected Organ Registry

### Tier 1 — Cannot touch without Stage 9 pulse baseline

These files define the product's visible behavior. No deep changes until authenticated
browser pulse tests prove the critical path works.

| File | Lines | Why protected | Unlock condition |
|------|------:|--------------|-----------------|
| `client/src/concept2cure/ZenApp.tsx` | 4,265 | The real shell: project identity, route policy, module hosting, handoff state, AnA context shaping | Stage 9 pulse pack covers: shell load, project select, workspace entry, return-to-workspace |
| `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | 3,499 | Governed document workspace: trees, editor panes, inspectors, lifecycle controls | Stage 9 pulse pack covers: workspace load, document open, document return |
| `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | 5,405 | The single AI chat surface: message handling, queue, rich rendering | Stage 9 pulse pack covers: chat load, message send, response render |
| `client/src/App.jsx` | 967 | Root router: all login redirects, lazy route loading, provider tree | Stage 9 pulse pack covers: root entry, login redirect, concept2cure entry |

### Tier 2 — Cannot touch without Stage 11 route ownership proof

These backend files control API behavior through mount order and route registration.
No deep changes until route ownership is declared and integration tests prove the
canonical families work.

| File | Lines | Why protected | Unlock condition |
|------|------:|--------------|-----------------|
| `server/index.ts` | 7,911 | All middleware and route mounts; mount-order sensitivity | Stage 11 route ownership matrix + integration tests for canonical families |
| `server/routes/concept2cure.ts` | 16,383 | Entire product API in one file | Stage 11 route carving plan + green-family integration tests |
| `server/routes/auth.ts` | ~50KB | Auth routes: login, register, password, MFA | Stage 11 auth boundary audit |
| `server/routes/authoring.router.ts` | ~174KB | Authoring workflow: Wave 2 hardened, governed actions | Stage 11 + existing governed action tests remain green |

### Tier 3 — Cannot touch without explicit justification

These are infrastructure files where changes propagate widely.

| File | Lines | Why protected | Unlock condition |
|------|------:|--------------|-----------------|
| `server/db.ts` | 434 | Canonical DB layer: Pool, Drizzle, migrations | Must never be touched without migration test proof |
| `server/db.js` | 252 | Compatibility shim over db.ts | Only removable after all callers are verified to use db.ts directly |
| `server/middleware/auth.ts` | 248 | JWT auth middleware | Stage 11 auth consolidation plan |
| `server/middleware/auth.js` | 244 | ESM variant of auth middleware | Stage 11 auth consolidation plan |
| `shared/schema/*.ts` | ~356KB | Drizzle ORM schemas: source of truth for DB | Standard schema change process (migration + db:push) |

---

## 3. Protected Directories

These directories contain multiple protected files or subsystems that should not be
broadly restructured without stage prerequisites.

| Directory | Contents | Unlock condition |
|-----------|----------|-----------------|
| `client/src/concept2cure/` | All shell organs (ZenApp, workspace, chat, sidebar, router) | Stage 9 + Stage 10 |
| `server/routes/` | 307 route files, 6.3 MB total | Stage 11 route convergence |
| `server/services/intelligence/` | RIM: judgment framework, pattern registry, signal capture | Stage 12 contract enforcement |
| `server/services/cortex/` | CORTEX Prime: knowledge atoms, threads | Stage 12 contract enforcement |
| `shared/schema/` | All Drizzle schemas | Standard migration process only |

---

## 4. Explicitly NOT Protected (Safe to Change)

These files and areas can be changed freely with normal code review discipline.

| Area | Why safe |
|------|---------|
| `docs/` (all subdirectories) | Documentation only; no runtime impact |
| `tests/` (all test files) | Extending tests is always safe; modifying test expectations requires evidence |
| `scripts/` | Dev/deploy/seed scripts; non-production |
| `client/src/concept2cure/hooks/` | Custom hooks; additive changes are safe |
| `client/src/concept2cure/models/` | Type definitions and data models |
| `client/src/components/ui/` | Shared UI primitives (governed by component registry) |
| `server/services/` (non-intelligence, non-cortex) | Business logic services; changes scoped to their domain |
| New route files under `server/routes/` | Adding new routes is safe; modifying mount order in server/index.ts is not |
| `client/src/main.jsx` | Legacy entry; **drop candidate** — can be deleted |

---

## 5. Stage Prerequisites Summary

| Stage | Unlocks | By proving |
|-------|---------|-----------|
| **Stage 9** (Pulse) | Tier 1 organs (shell UI) | Authenticated browser tests cover the critical beta path |
| **Stage 10** (ZenApp Seams) | ZenApp.tsx for controlled extraction | Seam tests pass before and after extraction |
| **Stage 11** (Route Convergence) | Tier 2 organs (backend) | Route ownership declared, integration tests green |
| **Stage 12** (Contract Enforcement) | Intelligence + AI entry points | No-bypass tests prove governed pipeline |

---

## 6. Violation Protocol

If a change must touch a protected organ before its unlock condition is met:

1. **Document why** the change cannot wait for the prerequisite stage
2. **Prove blast radius** — which other files/behaviors are affected
3. **Add a targeted test** covering the specific path being changed
4. **Get founder approval** before merging
5. **Tag the commit** with `[protected-organ-override]` for traceability

---

## 7. Review Cadence

This lock list should be reviewed:

- **After each stage completion** — to update unlock status
- **Before any broad refactoring** — to verify prerequisites are met
- **When adding new protected files** — as the product grows
- **Monthly** — to catch drift between lock list and actual code reality

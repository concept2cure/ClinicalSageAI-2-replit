# U21 — two AnA write actions on one document ran at once, one on each task

Launch row: **D1** (production as configured). Follows decision B6 (no Redis,
`u20-sessions-across-tasks.md`). Date: 2026-10-01. Branch: `concept2cure-v2`.

## The defect

AnA Command's governed actions go through `POST /api/ai-actions/execute`,
which applies two guards (`action-registry.ts`):

- a write action locks its target (`distributed-lock.ts`);
- each organisation may run five actions at once (`concurrency-limiter.ts`).

Both were Redis with an in-memory fallback. Production runs no Redis, so both
held per process. With two API tasks behind a non-sticky load balancer:

- two write actions on one document both ran, one on each task;
- the per-organisation cap was multiplied by the number of tasks.

The lock key also named no organisation (`document:42`). On any shared store,
one tenant's lock would therefore have blocked another tenant's document that
had the same id.

## The fix

**The table.** `coordination_leases` (`migrations/20261001f_coordination_leases.sql`)
is in `public`, with `organization_id INTEGER NOT NULL` set to the acting
organisation. It is IF NOT EXISTS only, has no DROP, and sits before the
final pair, so the sweep gives it its tenant policy.

**The lease store.** `server/services/ai-actions/coordination-leases.ts` does
all its work in the organisation's own job scope:

- **Locks:** taken with one upsert that wins only when no live lease is held;
  a lapsed lease is taken over.
- **Release:** only by the lease's owner.
- **Slots:** counted and taken in one transaction under a per-organisation
  advisory lock.

**Wiring.**

- `distributed-lock.ts` and `concurrency-limiter.ts` use the lease store. Each
  falls back to memory only when the store cannot be reached, or, for a lock,
  when no organisation is given.
- The Redis paths are removed.
- `action-registry.ts` passes the acting organisation to the lock.
- The global cap stays per process, because it protects that process's own
  resources.

## Verified by making it fail

**`tests/db/ai-action-leases-across-tasks.dbtest.ts`**

- **Setup.** Each "task" is a fresh module graph. They share one real
  PostgreSQL and run as the non-superuser runtime role with RLS_ENFORCE=on,
  using the migration's own DDL plus the tenant policy.
- **Old code:** 2 of 4 failed.
  - With the lock held on task A, task B took the same document's lock:
    `expected { key: 'csai:lock:document:42', … } to be null`.
  - The organisation's third action was admitted with the cap at 2:
    `expected { orgKey: 'org:33', … } to be null`.
- **New code:** 4/4. This includes the guards: another organisation with the
  same document id is not blocked, and a lapsed lock is taken over.

**Unit suites.** Every test touching AI actions, the registry, the lock or the
limiter passes: 184/184 across 20 files.

**Static checks.**

- Migration gates: OK.
- `tsc`: 0 errors.
- ESLint: the same warning counts before and after (0, 0 and 5).

**A note on the first run.** The first green attempt failed with "pool.query
requires an active tenant scope". The scope helper and the pool were imported
through different paths, and under `vi.resetModules` the test loaded them as
two module instances. They are now imported together, as the session store
does. The production bundle has one module per file, so this was a test-graph
artefact, not a production defect.

# WO-10 — Proof-gated deletion program

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN · **Blocks:** nothing. Hygiene. **Never urgent.**
**Read the warning before scheduling this.**

---

## The warning

Two numbers circulate about this repository that look like deletion mandates and
are not:

**"505 orphan endpoints of 884."** A 57% orphan rate in a system in daily use is
a detector-precision artefact. `audit:orphaned-endpoints` matches consumers
statically; it does not see dynamic dispatch, string-built paths, or clients
outside this repo. The number is a starting list for investigation, and the
gate's own threshold is set at 590 — deliberately, with slack — precisely
because it is heuristic.

**"98 unreferenced modules."** This sits *at* its baseline of 98. The ratchet is
holding steady. It is not a fire, and `ci:unreferenced-modules:strict` failing
is the strict variant reporting the baseline, not a regression.

**Bulk-deleting from either list will take down production.** That is the single
most likely way this evaluation could cause harm, so this work order requires the
proof procedure to exist *before* any file is removed.

## Scope

### Phase 1 — the deletion-proof procedure (do this first, alone)

Before anything is deleted, a documented procedure that establishes, per
candidate:

1. Not an operational entry point — not in `package.json` scripts, not in a
   workflow, not in a Dockerfile, not in a cron or deploy path.
2. Not dynamically loaded — no string-built import, no registry lookup by name,
   no route mounted by iteration over a directory.
3. Not audit evidence — nothing under a governed path, no fixture a proof test
   reads. `ci:proof-tier` holds a floor of 77 proof files for this reason.
4. Not referenced from outside this repository.
5. Removal validated against a from-scratch install and a production build, not
   just a typecheck.

### Phase 2 — apply it, in small batches

Candidates, in ascending order of risk:
- 12 JS/TS shadow pairs (`ci:js-ts-shadows`), especially the content-diverged
  `server/db.js` and `server/utils/logger.js`. **These are the highest-value
  items here** — a divergent twin is a correctness risk, not just clutter.
- 15 CommonJS `require` sites (`ci:commonjs-require`).
- The 98 unreferenced modules, in batches of ≤10, each batch its own commit.
- Orphan endpoints, only after per-endpoint consumer investigation.

## Exit criteria

```bash
npm run ci:js-ts-shadows           # 12 pairs -> 0
npm run ci:commonjs-require        # 15 -> 0 or each justified as a lazy loader
npm run ci:unreferenced-modules:strict   # baseline shrinks; deleted, not rewritten
npm run ci:check-bundle-reachability     # production entry still builds
node scripts/db/install-fresh.mjs        # fresh install still completes
```

## Blast radius

**Potentially total, if Phase 1 is skipped.** Low if it is not.

## Estimate

Phase 1: 3 days. Phase 2: ongoing, indefinitely, at whatever rate is safe. This
work order has no deadline and should never be scheduled ahead of WO-1 through
WO-6.

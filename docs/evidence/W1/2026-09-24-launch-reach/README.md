# D2 — which missing relations production reaches through the launch catalog

**Date:** 2026-09-24 · **Row:** D2 (Launch catalog) · **Workstream:** W1 ·
**Session:** `…01E2moDuSNSNTBqAHV5GtWoz`
**Status of this folder:** interim. The reference database and the baseline
ratchet below are complete. The reachability classification is running; this
README is extended with its verdicts, and with red → green proof for any
in-scope defect, when they land.

## The question

`scripts/ci/tables-live-schema-baseline.json` lists relations that server SQL
names and that do not exist on a database the real provisioning path builds.
Every statement naming one raises 42P01 or 42883. Rule 2 makes one question
decisive: **does production reach that statement through the launch catalog?**
— a launch-app or shell action, an AnA tool, or a path that runs with no user at
all (boot, cron, worker, event, webhook). Anything else sits behind a flag that
is off in production and gets no session.

This is not what the two neighbouring sessions measure. `…01PwLFr8`'s fresh-org
sweep (`../2026-09-23-surface-truth/`) opens every surface once and records what
it calls **on first render** — no in-scope surface there failed on a missing
relation, every in-scope failure being a 403, 404 or 503. `…01KiDof7`'s guards
(`../../W2/2026-09-22/`) cover all server SQL regardless of scope. Neither sees a
missing relation behind a launch **action**, an AI tool or a scheduled job.

## Reference database

| | |
|---|---|
| Database | `c2c_ref_0924`, PostgreSQL 16, local |
| Built | from empty by `scripts/db/provision.mjs` at `872c47182`, then re-migrated by `scripts/db/deploy-migrate.mjs` at the ratchet commit (307 migrations) — the same replay every production deploy performs |
| Verified | `provision.mjs` exit 0: 27/27 contract tables readable by `app_service`; 1281/1281 relations hold the recipe privileges |
| Runtime role | `app_service`, non-superuser — the gate result is identical as the owner (`live-schema-at-HEAD-as-owner.txt`) and as `app_service` |

At that commit: **1281 relations, 745 referenced by server SQL, 9 resolved as
functions, 41 absent.**

## Ratchet: 42 → 41

`document_approvals` is no longer referenced by any server SQL. The Tasks
module's Vault sync used to read it; `server/services/unifiedTaskService.ts`
now raises `ModuleSyncUnavailableError` instead — *"Refused, never read"* —
because the legacy table has no organization column and a sync would have
imported every tenant's pending approvals into the caller's organization. The
only remaining mentions are that comment and a PGlite test asserting the read
never happens (`unifiedTasks-governed.pglite.integration.test.ts:356`).

Removed by hand, not by `--baseline`, which would also absorb anything else red.
Shown biting after the removal (`ratchet-document-approvals.txt`): with a
genuinely absent entry (`site_intel.site_scorecard`) also removed, the gate exits
1 and names exactly that relation; restored, exit 0.

The baseline's `count` field is kept equal to its entries. It had drifted once
before — this session left it at 47 over 42 entries on 2026-09-19
(`3d7f3b486`); nothing reads the field, and `…01KiDof7` corrected it.

# CMC / Module 3 — commercial enforcement flip runbook (2026-08-24)

The packaging is DONE; the flip is an operations sequence, not a code change.
This corrects two stale claims in earlier docs (`CMC_MODULE3_DATAROOM_VALIDATION_2026-08-23.md` §5,
`CMC_MODULE3_DATAROOM_UNIFICATION_AUDIT_2026-08-23.md`): the `cmc` catalog row is no longer
unrestricted, and `ENTITLEMENTS_ENFORCE` is not the flag that governs module access.

## The two flags — do not confuse them

| Flag | Governs | Default | Reach |
|---|---|---|---|
| `MODULE_ENFORCEMENT` (`off\|report\|enforce`) | `moduleEntitlementGate` — the module catalog gate | `off` | global; ~156 API prefixes **including `/api/cmc/*`** |
| `ENTITLEMENTS_ENFORCE` (`off\|warn\|on`) | `requireEntitlement` — the MDX capability matrix | `off` | two 510(k) routes only; orthogonal to CMC |

The stored `platform_settings.module_enforcement_mode` row (set from the master-admin
console) outranks the env var and takes effect within ~30 s, no redeploy.

## Current shipped state

- `cmc` catalog row: `tiers: ['standard']` (db/migrations/20260823_module_catalog_commercial_packaging.sql:179,
  on the durable path at scripts/db/migration-set.mjs:1458). Tier vocabulary:
  `free | standard | professional | enterprise` (license-manager.ts:151).
- The nav rail ALREADY reflects packaging (verdicts never consult enforcement mode):
  a `free` org with no grant sees a lock on CMC today; `standard`+ orgs and orgs with
  an `enabled` `module_subscriptions` grant see no change (grants outrank tier).
- The API gate is OFF: `moduleEntitlementGate` returns at line 1 when mode is `off` —
  every `/api/cmc/*` call succeeds regardless of tier. This is the deliberate
  rail-shows-locks / API-still-open posture.

## Flip sequence (in order)

1. **Verify the deployed row** — `SELECT module_id, metadata->'tiers' FROM available_modules
   WHERE module_id='cmc';` (expect `["standard"]`; if `[]`, the packaging migration has
   not applied — run the migration set, ordering is load-bearing: reconcile → packaging →
   mdx-registers).
2. **Reconcile every live org BEFORE any lock can bite** — per tenant either
   `PATCH /api/admin/master/licensing/tenants/:id/tier` to a qualifying tier, or
   `POST .../tenants/:id/provision` to write explicit grants. This is the step that
   keeps a paying customer's rail from going dark.
3. **Resolve the flagged packaging defect** — `electronic_signatures` sits at
   `enterprise` in FEATURE_TIER_MAP while every governed action e-signs; decide its
   band before enforcement makes that real.
4. **Flip to `report`** — `PATCH /api/admin/master/licensing/enforcement/mode
   {mode:'report', reason}`. Denials are OBSERVED and recorded, nothing is blocked.
5. **Measure** — `GET /api/admin/master/licensing/enforcement`. `observingSince: null`
   means "nothing measured", never "nothing would be denied"; the buffer is
   per-process, so check every replica. Fix what report mode surfaces.
6. **Flip to `enforce`** — same PATCH. `/api/cmc/*` starts answering
   403 `MODULE_NOT_LICENSED` for below-tier orgs without grants.
7. **Rollback** at any point: mode back to `off`/`report` from the console (≤30 s);
   catalog rollback one-liner in the packaging migration header destroys no grants.

## Product decision still open (pricing, not engineering)

`standard` is the current band for `cmc`. If Module 3 / CMC should sit at
`professional`, it is one governed console call:
`PATCH /api/admin/master/licensing/modules/cmc {tiers:['professional'], reason}` —
audited, no migration, rail updates immediately, API follows the enforcement mode.

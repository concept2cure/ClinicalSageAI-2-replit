# WO-0 — Restore a green canonical branch

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN · **Blocks:** everything. **Do this before any other work order.**
**Estimate:** 2–4 days

---

## The finding

`concept2cure-v2` @ `d31a9db6` currently **fails six gates that are wired into
CI**. Not strict variants that run nowhere — these are the gates
`.github/workflows/ci.yml` and `.github/workflows/pr-checks.yml` actually
execute. Measured by running all 142 runnable gates
(`docs/evaluation-2026-09/evidence/01-gate-sweep.json`):

| Gate | Wired into | Baseline | Measured | Delta |
|---|---|---:|---:|---|
| `ci:eslint-ratchet` | `ci.yml` | 6,596 | **6,712** | **+116 warnings**, and 1 error also present |
| `ci:check-phantom-tokens` | `ci.yml` | 14 tokens | **17 tokens / 66 sites** | **+3 phantom tokens** |
| `ci:duplicate-table-ddl` | `ci.yml` | 63 | **64** | **+1 table with a second definition** |
| `ci:model-migration-agreement` | `pr-checks.yml` | 29 | 30 | **+1 table newly diverging** from its migration |
| `ci:tenant-blind-models` | `ci.yml` | 5 | — | **stale baseline** — `shared/cmc-schema.ts::complianceTracking` is no longer blind |
| `ci:tenant-entry-points` | `ci.yml` | 10 | — | `server/jobs/retentionCron.ts` changed after its tenant-entitlement justification was recorded |

## Why this is WO-0

Every other work order in this set is measured by a gate. If the branch is red
before the work starts, there is no signal to work against — a fix cannot be
distinguished from the noise it lands in. More directly: **four of these six are
regressions that a working CI should have refused at the PR that introduced
them.** That they are on the canonical branch means either CI is not gating
merges to it, or red results are being merged past. Both are worth knowing
before anyone plans a customer pilot around this pipeline.

## The two easy ones, and the distinction that matters

`ci:tenant-blind-models` and `ci:tenant-entry-points` are **not new defects.**

- `tenant-blind-models` fails because a baselined entry got *fixed* —
  `complianceTracking` gained tenant awareness and nobody removed it from the
  baseline. The gate is enforcing bidirectional parity, which is the correct and
  slightly unusual design: a stale baseline is as much a failure as a new defect,
  because a baseline that over-states debt hides the next real one.
- `tenant-entry-points` fails because `retentionCron.ts` was edited after its
  justification digest was recorded. The gate is asking a human to re-read the
  justification against the new code — which is exactly what it is for.

Neither is fixed by regenerating the baseline without reading the diff. The
second one in particular is a **tenant-entitlement decision on a retention
sweep** — re-read it properly.

## Scope

1. **`eslint-ratchet` (+116, 1 error).** Fix the 116, do not raise the baseline.
   The gate's own output says so: *"Every count here was frozen so the backlog
   could be paid down, not added to."* Start with the 1 error — the Run ESLint
   step owns it separately and it is a hard failure.
2. **`check-phantom-tokens` (+3).** Point each at a real token in
   `design-system/colors_and_type.css`, or add the token there first.
3. **`duplicate-table-ddl` (+1).** Identify which table gained a second
   definition and remove it. This one is a preview of WO-1 — treat it as the
   first of the 64, not as a separate task.
4. **`model-migration-agreement` (+1).** Add the reconciling migration. The gate
   names the file: `migrations/20260821_vault_documents_canonical_shape.sql`.
   *Fix by adding a migration that reconciles the table, not by widening the
   baseline.*
5. **`tenant-blind-models`.** Remove the stale entry after confirming the fix.
6. **`tenant-entry-points`.** Re-read the retention-sweep justification against
   current `retentionCron.ts`. If it still holds, refresh the digest. If it does
   not, that is a finding, not a refresh.

## Exit criteria

```bash
node docs/evaluation-2026-09/evidence/sweep.mjs
# every gate wired into ci.yml or pr-checks.yml exits 0,
# with the documented ENV-BLOCKED set as the only exceptions:
#   ci:tables-live-schema, ci:purge-coverage  (need DATABASE_URL)
#   ci:dependency-risk                        (needs the npm advisory API)
#   ci:component-class-coverage               (needs a completed build; exit 2 = stale build, not a finding)
#   ci:coverage-ratchet                       (needs coverage/coverage-summary.json)
```

## Blast radius

Low. Six small, independent fixes. None touches a data path except the
`duplicate-table-ddl` entry, which should be done with WO-1's care.

## A note on how this happened

Four regressions accumulated on the branch that `CLAUDE.md` RULE 0 designates as
the only branch that ships. Whatever the cause — CI not gating pushes to it,
red merges, or `--no-verify` — the fix is procedural, not technical, and it
belongs in the same conversation as WO-4. `.husky/pre-push` runs only 7 gates;
the other ~135 run in GitHub Actions, and only if Actions is actually blocking.

# STAGE8_CONVERGENCE_DECISION_PACK — Founder Decision Pack (2026-04-01)

## Executive call

- **Safe to merge now:** Stage-8 control docs + beta-core pulse test harness.
- **Must not merge now:** any whole-PR intake for 332/333/334/335 without direct branch diff + targeted proof.

## What can safely be merged now?

1. Stage 8 integration control documents (queue, risk map, disposition, canonical lock, execution plan).
2. New/expanded beta pulse e2e test harness (`tests/e2e/beta-core-pulse.e2e.ts`) with gated checks for PR-dependent assertions.

## What must not be merged yet?

1. PR 332 whole branch (explicitly blocked).
2. Any PR 333/334/335 intake done as whole PR without slicing.
3. Any change requiring deep surgery in protected organs:
   - `client/src/App.jsx`
   - `client/src/concept2cure/ZenApp.tsx`
   - `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
   - `server/index.ts`

## Which PRs help beta?

- **PR 335** likely helps beta safety (fail-closed mock/fallback + tenant/org strictness), contingent on proof.
- **PR 333** likely helps governed path reliability (upload/export consequence fail-close), contingent on proof.
- **PR 334** helps if split: server project-scope safety first; user-surface changes only after shell-truth verification.

## Which PRs increase risk?

- **PR 332** is a major merge-bomb risk by size and deletion breadth.
- **PR 334** increases user-surface risk if merged whole.
- **PR 333/335** increase risk if they alter route behavior without preserving canonical shell/workspace truth.

## Exact recommended merge order

1. Land Stage 8 docs/tests slice (control artifacts + beta pulse).
2. Intake PR 335 as targeted fail-closed + tenant context slice.
3. Intake PR 333 as governed fail-closed consequence slice.
4. Intake PR 334 split:
   - 334-A server conversation scope safety
   - 334-B command/panel safety UI subset (only if shell-safe)
5. Defer PR 332 whole; evaluate tiny post-RC rescue buckets only.

## Is human beta unlockable after this?

- **Not yet from this environment alone.**
- Unlock requires remote branch/PR diff verification and green targeted runs for 335/333/334 slices.

## What still blocks RC?

1. Missing local access to `concept2cure-v2`, cleanup branch, and PR head refs for exact diff validation.
2. No direct PR file-level proof for #332/#333/#334/#335 in this checkout.
3. PR-specific pulse checks (steps 9/10) remain intentionally gated until those slices are actually present.

## Final recommendation

Proceed with controlled slice intake only after restoring remote git visibility. Preserve shell truth and governed path integrity as higher priority than deletion or UX churn.

## ONE LINE TRUTH

**Cleanup progress is real but PR and branch intake is still unsafe**


# WO-9 — Lock the pilot surface set

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN · **Blocks:** G1 (pilot on any data)

---

## What the code actually says

Measured at `d31a9db6` in `client/src/concept2cure/v2/registryModel.ts`:

| | Count |
|---|---:|
| `RAIL_CORE` | 12 |
| `RAIL_SPECIALIST` | 6 |
| `RAIL_EXPLORE` | 14 |
| `RAIL_QUICK` | 9 |
| **Rail-reachable total** | **41** |
| `NAV_HIDDEN` | 29 |
| Registered surfaces (`SEGMENTS`) | 83 |

**This is much better than July.** At `576ec5d` a single `RAIL_PRIMARY` held 5
destinations against 96 registered surfaces with `NAV_HIDDEN` at 40. Four
categorised rails now expose 41 of 83. The July G1-7 finding — "the product has
no front door" — is substantially addressed.

## What remains

41 of 83 reachable still leaves ~42 surfaces available only by typed URL or
command palette. For a pilot that is not primarily a navigation problem, it is
an expectation-setting problem: a design partner who reaches a half-built
surface by URL forms a view of the product that the demo did not intend.

`ci:surface-discoverability` passes, so nothing is *unreachable by accident*.
The question is which surfaces the pilot is meant to include.

## Scope

1. Decide the pilot surface set — the surfaces a design partner is meant to use.
   This is a product decision, not an engineering one, and it is the actual work
   here.
2. Every pilot surface is in a rail.
3. Everything else goes behind an explicit **experimental** affordance that
   states its status when reached, rather than rendering as though it were
   finished. `ci:empty-state-honesty` (baseline 1) and `ci:action-overclaim`
   (baseline 0) are the existing gates for this class of honesty; extend rather
   than invent.
4. Record the decision so it is testable — a list in code, not in a document.

## Exit criteria

```bash
npm run ci:surface-discoverability      # still passes
npm run ci:empty-state-honesty          # baseline 1 -> 0
npm run ci:action-overclaim             # stays 0
# plus: every SEGMENTS entry is either in a rail or flagged experimental — assert it in a test
```

## Blast radius

Low-medium. Navigation and labelling. No data paths.

## Estimate

1 week of engineering after the product decision is made. The product decision
is the long pole.

# UI Authority Audit — 2026-09-06

Output of `npm run audit:ui-authority` (`scripts/audit-ui-authority.ts`) against `config/ui-surface-registry.json`, on the tree after the changes in `docs/plans/ANA_UI_CONVERGENCE_WORK_ORDER_2026-09-06.md` §2.

## What the script checks

1. Every registry entry with a path: `active` files exist, `deleted` files are absent, `demoted` files are imported by nothing under `client/src`.
2. One shell owner: the only route switches are `App.jsx` and `router/ZenRouter.tsx`.
3. Layout-flag budget: surfaces that own the conversation column (`ownsConversation: true` in `surfaceViews.ts`) ≤ 7. This replaced the old `LayoutMode ≤ 30` check, whose target file no longer exists.
4. Rail: the four rail arrays exist and declare ≤ 24 destination buttons; each registry destination is either on the rail, in the account menu, or (Communication Center, by the 2026-07-28 decision) reachable through AnA `navigate_to` **and** a deep link.
5. No Poppins references in `client/` (comments recording its removal are not references).

## Shown failing first

On the tree before this pass the script reported three failures:

```
[FAIL] 10 surfaces own the conversation column — exceeds limit of 7      ← the flag's own documentation was being counted; the count is now of registry entries (6)
[FAIL] destination communication-center: neither a rail item nor reachable by navigate_to   ← real gap: AnA could not navigate to it; fixed in shared/navigation/index.ts
[FAIL] Poppins font references found in 1 file(s): client/index.html    ← a comment saying "Poppins removed from chrome"; the scan now ignores comments
```

## Result

```
── Summary ──
  Passed: 46
  Failed: 0
AUDIT PASSED — all checks green.
```

The prior script (2026-07 and earlier) could not pass on any tree since Phase 7: it exited on the absence of `client/src/concept2cure/zen-app-constants.ts`. It was not wired into `package.json`, so its permanent failure was invisible. It is wired now (`audit:ui-authority`).

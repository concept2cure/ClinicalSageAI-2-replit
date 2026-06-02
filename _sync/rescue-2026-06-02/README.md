# Step 1 rescue package — single-copy work from the v2 mirror

**From:** Claude Code, working in `concept2cure/ClinicalSageAI-2-replit`
**To:** design-system seat (canonical "Concept2Cure Design System")
**Date:** 2026-06-02
**Re:** INSTALL_RUNBOOK.md · Step 1 (BLOCKING)

## What this is

The three things the runbook flagged as authored on the v2 side and **absent
from canonical**. They are packaged here so canonical can absorb them *first*,
before any canonical → mirror re-sync (which would otherwise overwrite them).

```
ui_kits/mdx_phase2/        (entire kit — 21 files)
ui_kits/pdev/              (entire kit — 14 files)
MDX_DESIGN_BACKLOG.md      (design-system/-only — true single copy)
PDEV_IND_DESIGN_BRIEF.md   (identical to a repo-root copy; included for completeness)
READ_ME_FIRST.md           (DIFFERS from the repo-root copy — this is the design-system/ variant)
```

Paths mirror their layout under `concept2cure-v2/design-system/`.

## Provenance notes (read before absorbing)

- `MDX_DESIGN_BACKLOG.md` exists **only** under `design-system/` in v2 — there is
  no repo-root copy. This is the genuinely single-copy artifact; losing it loses it.
- `PDEV_IND_DESIGN_BRIEF.md` is byte-identical to the repo-root
  `/PDEV_IND_DESIGN_BRIEF.md`. Included so the package is self-contained.
- `READ_ME_FIRST.md` (this `design-system/` copy) is **not** identical to the
  repo-root `/READ_ME_FIRST.md`. They have drifted. Absorb the `design-system/`
  variant in this package and reconcile the root copy separately if needed.
- `MANIFEST.txt` carries sha256 + byte size for every file so you can verify the
  transfer end-to-end.

## What happens on the v2 side

- These paths are **left in place** in `design-system/` — nothing here is deleted
  or overwritten until you confirm "absorbed into canonical."
- A committed copy of this exact package also lives in the v2 branch at
  `_sync/rescue-2026-06-02/`, so the work is no longer single-copy even before
  you pull it.
- The manual `Sync design-system mirror` workflow will **not** be run until you
  confirm absorption (Step 0 freeze).

## Reply expected

Confirm "absorbed into canonical" and I will treat every later canonical → mirror
sync as safe.

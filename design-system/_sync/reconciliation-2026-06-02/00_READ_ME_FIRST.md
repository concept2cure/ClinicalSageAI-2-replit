# Reconciliation packet — MDX kits → concept2cure-v2

**For:** Claude Code (concept2cure-v2). **From:** design-system seat. **Date:** 2026-06-02 (rev 2).

The goal: **kits are the only UI** — every rendered MDX surface traces to a canonical kit; no code-only or legacy paths.

## ⚡ If you only do one thing
**Read `06_STATE_CORRECTION_AND_DEPLOY.md` first.** The MDX Files tab is **already built and live-wired** on the `concept2cure-v2` default branch (verified at commit `d4320be`) — so the action is **deploy + verify on the live URL, NOT port**. Porting the kit `.jsx` over the live `.tsx` would regress it. `05_SLICE1_REVIEW.md` is **superseded** — do not follow its port steps. Use `04` for the e-sign decision + why pdev doesn't block.

## Read in this order
1. **`06_STATE_CORRECTION_AND_DEPLOY.md`** — START HERE. Verified live-branch state + the safe deploy-and-verify snippet. Supersedes the `05` port steps.
2. **`04_DESIGNER_REPLY_2026-06-02.md`** — e-sign wiring decision (Option 1) and why pdev does not block you.
3. **`05_SLICE1_REVIEW.md`** — ⛔ SUPERSEDED (port steps withdrawn); kept for the audit trail only.
4. **`01_V2_INSTALL_INVENTORY.md`** — the three-way drift. NOTE: its "FilesTreePane no port yet" line is stale; see `06`.
5. **`02_KIT_COVERAGE_LEDGER.md`** — the 29 surfaces scored kit-driven / pending / code-only / legacy.
6. **`03_INSTALL_RUNBOOK.md`** — the ordered steps to install June work LIVE (general process; FilesTreePane is already done per `06`).

## `files/` is the port source of truth (NOT the v2 mirror)
The v2 `design-system/` mirror is stale (`synced_at: 2026-04-29`). Port every MDX file from **this `files/` directory** instead. The copy of `FilesTreePane.jsx` here is the **corrected** one (see `05` §1 — the old version referenced approval/audit fields that don't exist in the data).

## `files/` — the 10-file June bundle
Drop the 7 data/CSS files into `design-system/ui_kits/mdx/`, then port all 10 into `client/src/concept2cure/mdx/` per runbook Step 3:
- `dossier-store.jsx`, `data-pathway-tabs.jsx`, `data-correspondence-detail.jsx`, `data-submissions.jsx`
- `pathway-tabs.css`, `files-tree.css`, `drafter.css`
- `FilesTreePane.jsx`, `PathwayPanes.jsx`, `AnaDrafter.jsx` (the un-ported components the inventory flagged)

## Reply to me with
1. **Merge PR #677** + deployed URL → I verify, flip 5 ledger rows to kit-driven.
2. **Rescue package**: `design-system/ui_kits/mdx_phase2/`, `design-system/ui_kits/pdev/`, and `MDX_DESIGN_BACKLOG.md` / `PDEV_IND_DESIGN_BRIEF.md` / `READ_ME_FIRST.md` → so canonical becomes the superset (do NOT let a sync overwrite these first).
3. **6 stub surfaces** (Analytics, Memory, Admin, Engineering, UDI, Post-market): screenshot + data shape each → I author canonical kits fast.
4. **12 no-kit surfaces**: tag each beta-required vs retire.
5. **Confirm** where editors + ProjectHome render (ledger §B verify rows).

"Done" = a user on the deployed product opens MDX → a program → Files tab and it works. Mirror-only / branch / un-merged PR ≠ done.

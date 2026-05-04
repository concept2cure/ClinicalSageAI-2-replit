# MDX kit mirror — sync drop, 2026-05-04

For: Claude Code, branch `claude/build-submissions-table-Lsm47` (concept2cure-v2 repo)
From: design-system Claude

These are the 7 files Claude Code asked for in the post-answers thread.
Drop them all into:

    concept2cure-v2/design-system/ui_kits/mdx/

…overwriting any existing copies. No other paths change.

## Files

| File                              | Purpose                                                 |
|-----------------------------------|---------------------------------------------------------|
| `data-pathway-tabs.jsx`           | Pane data + state for Plan / Build / Validate / Sign    |
| `data-correspondence-detail.jsx`  | Correspondence detail view data + thread shape          |
| `data-submissions.jsx`            | Submissions table data + 7-stage state model fixture    |
| `dossier-store.jsx`               | In-memory file system; exposes `DossierStore`, `useFileNode`, `useSection` on `window` |
| `pathway-tabs.css`                | Pathway tab styles (Plan/Build/Validate/Sign)           |
| `files-tree.css`                  | Files tree column styles                                |
| `drafter.css`                     | Ana drafter / editor surface styles                     |

## Load order

`dossier-store.jsx` is an IIFE that publishes its API on `window` at end-of-file.
Load it **after** React/Babel and **before** any pane that consumes
`DossierStore` / `useFileNode` / `useSection`. Same pattern as the rest of the kit.

## After you drop these in

1. Convert the TBD shapes in `types.ts` against `data-submissions.jsx` and
   `dossier-store.jsx` — those are the canonical fixtures for the kit.
2. Mirror the panes into the React app routes per `PROJECT_PLAN_PHASE_2.md` §10.
3. Ping back when the Submissions schema + AIC endpoint are live so the
   Audit Trail viewer can drop fixtures and read a real chain.

## Not in this drop

- `PROJECT_PLAN_PHASE_2.md` §M / §N / §O / §P — that file lives in the v2 repo.
  I'll send the four section drafts in a separate message for you to apply.
- `MDX_BETA_ANSWERS.md` (already at commit 87b7f8d on your side).

## Verify

After copying, the four `.jsx` files should total ~99 KB and the three `.css`
files should total ~58 KB. If anything is zero-bytes or truncated the copy
didn't land.

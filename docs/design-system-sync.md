# design-system mirror — sync runbook

`design-system/` in this repo is a **read-only mirror** of the canonical
Anthropic Design project (`design-system-project-id` recorded in the sync
workflow). The mirror is the only path Claude Code reads — there is no
cross-project filesystem path. This doc explains how the mirror gets
refreshed.

## Mental model

```
canonical (Anthropic Design project, externally edited)
    │
    │  scripts/sync-design-system.sh   (transport)
    ▼
design-system/   ← Claude Code + v2 code reads here
    │
    │  imports + 1:1 mirrors in React
    ▼
client/src/concept2cure/components/{concept2cure-home, ana,
  claude-ectd-coauthor, bundle-surface-frame}/
client/src/main.tsx (imports design-system/colors_and_type.css)
```

The five shipping surfaces are exactly the four bundle ui_kits + auth.
See `CLAUDE.md` "Five shipping surfaces" for the canonical list.

## When to sync

The designer ships a revision in the canonical project (look at
`design-system/HANDOFF.md`'s changelog after the next sync to confirm).
The operator triggers `Sync design-system mirror` from the GitHub Actions
tab. The workflow opens a PR with the diff. The PR is reviewed and merged
into `concept2cure-v2` (the only branch).

Trigger model is `workflow_dispatch` only for now. Webhook / scheduled
poll can come later if cadence picks up.

## How to trigger

### Option A — GitHub Actions (the default)

1. Go to **Actions → Sync design-system mirror → Run workflow**.
2. Inputs:
   - `ref` — git ref / branch / tag inside the canonical source (default
     reads `vars.DESIGN_SYSTEM_REF`, which itself defaults to `main`).
   - `mode`:
     - `sync` (default) — fetch, write to `design-system/`, open a PR if
       there's drift.
     - `dry-run` — fetch and report drift without writing.
     - `check` — fetch and exit non-zero if drift exists. Useful for an
       on-demand "is the mirror current?" probe.
3. The workflow runs `verify-design-tokens` after `sync` regardless of
   whether a PR was opened. That job builds the client, boots the server,
   loads `/concept2cure` in headless Chromium, and asserts:
   ```
   var(--accent-100) → #d97757
   var(--bg-000)     → #faf9f5
   ```
   If either resolves blank or to the wrong color, the build fails. This
   is the regression gate from the 2026-04-26 grey-UI ship.

### Option B — Local

Useful for previewing a designer revision before opening a PR. Set
`DESIGN_SYSTEM_SOURCE` to the canonical project path (or a checkout
thereof):

```bash
DESIGN_SYSTEM_SOURCE=git@github.com:concept2cure/design-system.git \
DESIGN_SYSTEM_REF=main \
  scripts/sync-design-system.sh --dry-run
```

Modes:

| Flag | Effect |
| --- | --- |
| _(none)_ | Sync into `design-system/`, replacing existing contents atomically. Stamps `.sync-meta`. |
| `--check` | Exit non-zero if local mirror drifts from canonical. No writes. |
| `--dry-run` | Print the diff that would be written. No writes. |

The script fails if the canonical source is missing any of `CLAUDE.md`,
`HANDOFF.md`, `colors_and_type.css`, or at least one `ui_kits/<surface>/`
subdirectory. That keeps a half-published revision from making it into the
mirror.

## How to configure the source

Required repo variable / secret on `concept2cure-v2`:

- `DESIGN_SYSTEM_SOURCE` — git URL of the canonical project (e.g.
  `git@github.com:concept2cure/design-system.git`). Set this in
  **Settings → Secrets and variables → Actions** as a variable (preferred)
  or a secret if the URL is private.

Optional:

- `DESIGN_SYSTEM_REF` (variable) — default branch / tag to sync from.
  Defaults to `main`.
- `DESIGN_SYSTEM_SUBDIR` (variable) — if the canonical project has the
  design system in a subdirectory rather than at the root. Defaults to
  `.`.

If the canonical project is not git-backed today, the workflow fails
fast with a clear message until `DESIGN_SYSTEM_SOURCE` is wired. The
cleaner long-term path is a git submodule pointing at canonical; we
defer that until the canonical is git-backed.

## Reading the mirror

Sessions touching UI follow `CLAUDE.md`'s read order:

1. `design-system/CLAUDE.md`
2. `design-system/HANDOFF.md`
3. `design-system/colors_and_type.css`
4. `design-system/ui_kits/<surface>/`
5. `design-system/preview/` (when present)

`design-system/.sync-meta` is written by every sync and records:

```
synced_at: ISO timestamp (UTC)
source: <git URL or local path>
ref: <branch / tag>
subdir: <subdir or .>
```

Use it to tell at a glance whether a session is reading a stale mirror.

## Verification commands

Run these in any session against `concept2cure-v2` to confirm the wiring:

```bash
ls design-system/ui_kits/                     # should list home, mdx, ana_ri, ectd_coauthor
grep -E "^\| [0-9]" design-system/HANDOFF.md  # the phase status table
cat design-system/.sync-meta                  # last sync timestamp + source
```

Local token check (no Playwright install needed — uses browser DevTools):

1. `npm run dev`
2. Open `/concept2cure` and DevTools.
3. `getComputedStyle(document.documentElement).getPropertyValue('--accent-100')`
   → should be `#d97757` (or the equivalent rgb/oklch the browser
   computed).
4. Same for `--bg-000` → `#faf9f5`.

Either resolves blank → `client/src/main.tsx` is not importing
`../../design-system/colors_and_type.css` before `./index.css`. Fix
before continuing.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Workflow fails: `DESIGN_SYSTEM_SOURCE is not configured` | The canonical source URL is not set. | Set repo variable `DESIGN_SYSTEM_SOURCE` to the canonical project's git URL. |
| Workflow fails: `required file missing in source: HANDOFF.md` | The canonical was synced mid-publish, or the canonical path no longer matches v2's expected layout. | Wait for the designer to finish publishing, or update `DESIGN_SYSTEM_SUBDIR`. |
| `verify-design-tokens` fails after sync with `--accent-100 should resolve to #d97757` | Token import broke at the v2 root. | Check that `client/src/main.tsx` still imports `../../design-system/colors_and_type.css` before any component CSS, and that the file exists in the synced mirror. |
| Mirror PR keeps getting reopened with no diff | A previous sync wrote `.sync-meta` with a value that always changes (e.g. the timestamp), and the workflow treats that as drift. | The script is fine — `.sync-meta` is excluded from drift detection only because the synced files outside it are byte-stable. If this happens, stop the workflow and investigate. |
| Cross-project path `/projects/<id>/...` doesn't work | Correct — there is no cross-project read path on this seat. The only read path is `design-system/`. Earlier guidance suggesting cross-project paths was wrong and has been removed. | Use `design-system/`. |

## Why this shape

- **Mirror, not import.** Claude Code reads files, not Claude project
  artifacts. A files-on-disk mirror is the lowest-friction transport.
- **Workflow trigger is dispatch-only.** Until the designer's cadence is
  predictable, scheduling a daily poll just creates noisy PRs that
  reviewers ignore. Manual trigger keeps a human in the loop.
- **PR not direct push.** The mirror lands via PR so a reviewer sees the
  diff before it reaches `concept2cure-v2` — same flow as any other
  change. CLAUDE.md's branch rules forbid direct workflow pushes to the
  primary branch.
- **Token check after every sync.** The 2026-04-26 grey-UI bug shipped
  silently because nothing in CI checked computed styles. The
  `verify-design-tokens` job closes that hole.

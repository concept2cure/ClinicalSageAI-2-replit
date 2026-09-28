## Design-system lens — weekly periodic review, 2026-09-28

**Auditor scope:** launch catalog only (Projects, Vault, Authoring, Submission Center, Submission Readiness, QMS), client surfaces under `client/src/concept2cure/v2/` and the server routes/services they call. Read-only: no file edited, no gate run with `write-baseline`, no non-ROLLBACK database write (none of this lens's checks touched the reference Postgres).

**Head reviewed:** `aff7eae16` (`concept2cure-v2`), 2026-09-28. **Prior report read:** `docs/evidence/reviews/2026-09-24/design-system.md` (head `42eb291d`) — this is the only prior design-system report; the design-system lens did not run in the 2026-09-26 folder (that folder holds `security.md` only, and its own README says "the design-system lens did not run anywhere" the week before, closed by the 2026-09-24 addendum run). So this review's baseline is 2026-09-24's, over the diff `42eb291d..aff7eae16` (45 files changed in `v2/`, mostly new `ProjectRecords.tsx`, `VaultEditDetails.tsx`, `filingTarget.tsx`, plus a new `IdleSessionGuard.module.css`).

### Gates run (all seven named in the charge; none skipped)

| Gate | Result (quoted) | Verdict |
|---|---|---|
| `npm run ci:design-system` | `[design-system] OK — no icon-library, spring/bounce or inline <style> violations on live concept2cure surfaces.` | pass |
| `npm run ci:token-contrast` | `✅ token-contrast: 67 pairs checked — text ≥ 4.5:1, non-text ≥ 3:1. 15 documented exceptions (brand, muted-text ramp, structural borders) held at or above their recorded ratios.` | pass, unchanged from last week (67/15) |
| `npm run ci:check-phantom-tokens` | `[ci:phantom-tokens] 9 phantom token(s) across 53 site(s) (baseline 9). [ci:phantom-tokens] OK — no new phantom tokens.` | pass, **delta 0** against last week's ratcheted baseline of 9 |
| `npm run ci:check-chip-tones` | `[chip-tones] OK — 139 literal tone use(s), all 28 resolve to a CSS rule.` | pass (139 vs last week's 138 literal sites; this gate has no baseline count, it only asserts every literal `tone-*` class resolves to a rule — it does, so no violation) |
| `npm run ci:token-cascade` | `[token-cascade] PASS — all 39 stylesheets resolve cleanly.` | pass (39 vs last week's 38 — see note below) |
| `npm run ci:check-css-selector-shadowing` | `[css-shadowing] OK — 42 stylesheets, 21 known shadowed selector(s), 0 new.` | pass, **delta 0** new shadowed selectors (42 vs last week's 41 stylesheets — same new file) |
| `npm run ci:check-orphaned-stylesheets` | `[ci:orphaned-stylesheets] 46 imported / 0 orphaned (0 lines, baseline 0). [ci:orphaned-stylesheets] OK — no new orphaned stylesheets.` | pass, **delta 0** against baseline 0 (46 vs last week's 45 imported — same new file) |

**The +1 stylesheet across three gates is accounted for, not a mystery delta:** `client/src/concept2cure/components/session/IdleSessionGuard.module.css` is new this week (`git diff --name-status 42eb291d..aff7eae16` shows it `A`dded, 62 lines). It resolves cleanly under `ci:token-cascade` (listed `6/6`), imports no orphaned rule, and every token it references (`--text-100`, `--bg-100`, `--border-strong`, `--radius-lg`, `--radius-md`, all with safe literal fallbacks) is a real token, not a phantom. Read manually (see below): clean.

`git status --short` was empty before and after every gate run. No baseline report under `docs/reports/` was rewritten, so there was nothing to restore with `git checkout --`.

**Gates named in last week's table but NOT in this week's charge, and therefore not run this week:** `check-design-system-compliance` (same script as `ci:design-system`, already run), `check-shell-css-collisions`, `ci:surface-text-ramp`. These are not part of the seven gates the charge listed; I did not run them and make no claim about their state at head.

### Re-verification of `../2026-09-24/design-system.md`'s open finding

Only one finding was left open last week: **G2** (`TaskBoard.tsx`'s raw-hex module palette). Re-verified at `aff7eae16`:

**G2 — still open, unchanged shape.** `client/src/concept2cure/v2/fixtures/task-board-data.ts:92-109` (`TB_MOD`), consumed at `TaskBoard.tsx:875,931,958,981,1156,1744,1493` (the 1493 select-options site resolves via `Object.keys(TB_MOD)`, not a color use, but is still evidence the map is treated as the source of truth for the module vocabulary). None of this changed in the week's diff (`git diff 42eb291d..aff7eae16 -- .../task-board-data.ts` and the `TB_MOD` lines of `TaskBoard.tsx` show only unrelated microcopy edits, "programme"→"project"). Ten raw hex values, no `--module-*` token, no dark-mode pair, exactly as filed. Still a token-decision item for the control tower, not a code defect an engineer can just fix.

**New context on G2's reach, found this run (not a new defect, not renumbered — the code did not change this week):** `client/src/concept2cure/v2/fixtures/collab-data.ts:109-117` defines `CL_MOD = { ...TB_MOD, Submission: '#3c7a8a', Quality: '#8a7a3c', Labeling: '#7a5a9c', 'Market Access': '#5a8a7a', Evidence: '#6b7a9c', Meetings: '#9c6f5a', Intelligence: '#5a7a6b' }` — the same unresolved decision, seven colors wider. It's consumed by `CollabLauncher.tsx:209-212`, and `CollabLayer` (exported from that file) is mounted unconditionally at the shell root, `V2App.tsx:1144: <CollabLayer onNav={nav} />` — not scoped to Tasks. That means this untokenized palette is live on every launch-catalog surface (Vault, Authoring, Submission Center, Submission Readiness, QMS), not just the board. Neither file was touched in this week's diff (`git log -p 42eb291d..aff7eae16 -- .../collab-data.ts` is empty, and `V2App.tsx` is not in the changed-file list at all), so this predates last week's audit and simply wasn't scoped into G2's file:line list. The control tower should fold this into the same token-minting decision rather than treat it as separately closeable.

### New findings this run

**None.** `G-0928-*` is not used — I looked for one and found nothing to number.

Specifically checked and clean:
- `git diff 42eb291d..aff7eae16 -- client/src/concept2cure/v2 client/src/concept2cure/components` grepped for `#[0-9a-fA-F]{3,8}` on added lines: zero hits. No new hardcoded hex anywhere in this week's changeset.
- Same diff grepped for Tailwind arbitrary-value utilities (`w-[`, `h-[`, `text-[`, `bg-[`, `p-[`, `m-[`): zero hits.
- The three new files (`ProjectRecords.tsx` 105 lines, `VaultEditDetails.tsx` 193 lines, `filingTarget.tsx` 377 lines) carry zero inline `style={{...}}` objects and zero literal colors; they read through the shared `EmptyState`/`useLiveData` (`v2/dataConnect.tsx`) and the shared icon map (`v2/icons.tsx`), not a reinvented equivalent.
- `filingTarget.tsx` is a shared helper consumed by three surfaces (`VaultPlaceIntoSubmission.tsx`, `SubmissionSeqWorkspaces.tsx`, `AuthoringPlaceIntoFiling.tsx`) — consolidation, not duplication.
- `ProjectRecords` is rendered inside `ProjectHome.tsx:1044` and `VaultEditDetails` inside `Vault.tsx:1575` — both are sub-panels of existing launch surfaces, not new shell-level routes; no Replace-or-Delete question arises because nothing legacy was left standing.
- `icons.tsx:126-131` gained `users`/`flag`/`archive` from `lucide-react`, closing the last gap from last week's G1 fix (QMS's twenty hand-copied icons); `iconKeys.test.ts` (not re-run by me, but its existence was verified last week) is the gate that would catch a regression here.
- Diffs to `DispatchReadiness.tsx` and `IndLifecycle.tsx` this week (adding `programId`-anchored program/submission matching, `LX-22`) are business-logic changes with no new inline styling; the one new UI string (`DispatchReadiness.tsx:552`, `' · submission matched by name: it has no project recorded'`) renders as plain text inside an existing token-styled container, not a new literal.
- `IdleSessionGuard.module.css` (full file read, 63 lines): every color and radius reference is `var(--token, fallback-token-or-literal)`; both `.primary` (dark ink background) and `.secondary` (transparent, ink text) have a defined foreground and background pairing; no theme-scoped-only token declaration found in the file (it declares none — it only consumes root tokens).

### What this review did NOT get to (no silent caps)

- Did not re-run `check-shell-css-collisions` or `ci:surface-text-ramp` (in last week's table, not in this week's charge) — their state at head is unverified by this run.
- Did not do a from-scratch full-surface hex/px/palette sweep of the entire launch catalog the way the 2026-09-24 report did (that report's "Not flagged… every other launch file for hex/rgba/boxShadow literals" line was a full-scope pass). This run is scoped to (a) reverifying G2 and (b) auditing the diff since `42eb291d`, on the reasoning that a full re-sweep of ~40 unchanged files a week after a clean full sweep would not find anything the diff review didn't already cover faster; if the control tower wants a fresh full-scope sweep regardless of diff, that is a distinct, larger task not attempted here.
- Did not open or review `IdleSessionGuard`'s TSX consumer for a11y/contrast beyond confirming its CSS module tokenizes cleanly — full component behavior is outside this lens.
- Did not verify the `--module-*` token-minting decision for G2/CL_MOD against any design-system roadmap document; I don't know if one exists to check.

---

## Independent verification (2026-09-28)

Each high, medium or blocker finding above went to a separate agent told to refute it (read the code at head, trace the real call path, reproduce where possible; default to refuted). Low findings were not independently verified.

No new finding was reported by this lens.

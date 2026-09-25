# Design-system lens: launch catalog, 2026-09-24 (run 2026-09-25 02:40 UTC)

Auditor: `design-system-auditor` (`.claude/agents/design-system-auditor.md`), read-only apart from
running gates. Head reviewed: `42eb291d` (`concept2cure-v2`). Its report is condensed here with
every finding kept. `git status` was clean before and after every gate run except one (see the
process note).

## Scope

Resolved from `shared/constants/launch-scope.ts` → `client/src/concept2cure/v2/surfaceViews.ts`:
Projects (`Projects`, `ProjectHome`, `BiopharmaJourney`, `FilingsCatalog`, `TaskBoard`), Vault
(`Vault`, `ArtifactsCenter` in `AdminSurfaces.tsx`), Authoring (`DocumentAuthoring` →
`v2/editor/DocumentWorkbench.tsx`, `TemplateLibrary`, `Review`, `BiopharmaProject`,
`ProtocolDev`), Submission Center (`SubmissionCenter`, `DossierMap`, `EctdCompile`,
`EctdCoauthor`, `PublishingCenter`, `GatewayTransmittals`), Submission Readiness
(`DispatchReadiness` only — `Orchestration` / `Inconsistency` are outside `LAUNCH_APPS` since
`launch-scope.ts:104-113`), QMS (`quality/QualityRoute.tsx`, `SopRegister`, `ChangeControl`,
`QmpWorkspace`).

Excluded by instruction (swept earlier this week at the CSS level, `8c26c642`…`dbb9d726`,
`02beeb59`): weights, width transitions, motion literals, 4/6/8px radii, accent-100 fills with
white labels, focus rings, disabled opacity, sub-10px type, decorative gradients, the phantom
status palettes, the pathway stylesheet fork, phantom `--danger` / `--ok-600` in TSX.

## Gates — all pass

| Gate | Result (quoted) |
|---|---|
| `ci:token-contrast` | `67 pairs checked — text ≥ 4.5:1, non-text ≥ 3:1. 15 documented exceptions held` |
| `check-design-system-compliance` | `OK — no icon-library, spring/bounce or inline <style> violations` |
| `check-shell-css-collisions` | `22 (baseline 22) — pdev+v2:22 … OK`, delta 0 |
| `ci:surface-text-ramp` | `OK — 3 generated ramp sheet(s) match the stylesheets` |
| `ci:check-phantom-tokens` | `9 phantom token(s) across 53 site(s) (baseline 14)`; five baseline tokens now resolve (`--danger-50/-500/-600`, `--ok-600`, `--surface-100`, closed by `02beeb59`). **Baseline ratcheted to 9 in this run's remediation commit.** |
| `ci:check-css-selector-shadowing` | `OK — 41 stylesheets, 21 known, 0 new`. **Last week's FAIL is gone**: `authoring-v2.css` has one `.c2c-v2 {` wrapper (line 6); the two were merged, not baselined. |
| `ci:token-cascade` | `PASS — all 38 stylesheets resolve cleanly` |
| `ci:check-chip-tones` (extra) | `138 literal tone use(s), all 28 resolve` |
| `ci:check-orphaned-stylesheets` (extra) | `45 imported / 0 orphaned, baseline 0` |

### Process note: a gate the auditor reported as writing files does not

The auditor reported that `scripts/ci/check-toast-canonicality.mjs` rewrote
`v2/styles/misc-surfaces-v2.css` and `v2/surfaces/Vault.tsx` when run, and restored them. **Re-checked
by the control tower on 2026-09-25 03:20 UTC:** the script has no `writeFileSync`, `exec` or `spawn`
call, and running it on a clean tree leaves `git status` empty. The two files the auditor saw modified
were being edited by this session's Q5 remediation at that moment; the auditor's `git checkout --`
reverted that in-progress work before it was committed, so `95fcbffc` landed with only its report
line. The edits were re-applied and committed as the follow-up commit named in `part11-ux.md`. The
gate is read-only. Lesson for the next fan-out: auditors are read-only by definition and must never
run `git checkout`; the control tower should not edit while an auditor runs.

## Re-verification of `../2026-09-22/design-system.md`

| # | Where | State at head |
|---|---|---|
| D1 | `Review.tsx:849` phantom `var(--danger, #b42318)` | **fixed** `02beeb59` |
| D2 | `TaskBoard.tsx:1691` same phantom | **fixed** `02beeb59` |
| D3 | `Vault.tsx:188,988` dead `I.chevronRight` / `I.upload` keys | **fixed** (`icons.tsx` defines `upload`; `chevRight` is the key); `d3962462` added `iconKeys.test.ts`, which fails on the next missing key |
| D4 | `ProjectHome.tsx` literal fallbacks on defined tokens | **fixed** in this run's remediation (see G5) |

## Findings, most severe first

| # | Sev | Where | Finding | Status |
|---|---|---|---|---|
| G1 | violation | `quality/icons.tsx:25-46`, consumed by all four QMS files | The QMS shell hand-copied twenty Lucide icons as inline path data instead of importing the canonical wrapper `v2/icons.tsx`; fifteen keys were verbatim duplicates by name. | **fixed** (this run): `quality/icons.tsx` deleted; the four files import `I` from `../v2/icons`; `users`, `flag`, `archive` join the shared map from `lucide-react`; `sparkle` → `sparkles`, `x` → `close`. `iconKeys.test.ts` passes. |
| G2 | violation | `v2/fixtures/task-board-data.ts:92-109` (`TB_MOD`), consumed inline at `TaskBoard.tsx:875,931,958,981,1156,1744` | A ten-entry raw-hex module palette with no tokens and no dark-mode counterparts. | **open — token decision.** Ten categorical colours with measured light/dark pairs are a design-system extension, not a substitution; same class as the QMS stage ramp deferred on 2026-09-24. Needs the control tower to mint `--module-*` tokens (or reduce the palette). |
| G3 | violation | `AdminSurfaces.tsx:776` | `color: 'rgba(255,255,255,.7)'` for the sub-label on a selected chip whose ground is `--accent-strong` and whose label is `--accent-on-strong`; in dark the label turns to ink and this sub-label stays translucent white on `#e8916f`. | **fixed** (this run): `color-mix(in srgb, var(--accent-on-strong) 70%, transparent)`. |
| G4 | violation | `AdminSurfaces.tsx:1409,3445`, `EctdCoauthor.tsx:934`, `ProjectHome.tsx:434`, `DocumentWorkbench.tsx:3771` (`borderRadius: 10`); `ProjectHome.tsx:469` (`borderRadius: 999`) | Off-scale radius literals (scale: 4 / 6 / 8 / 12, pill 9999). | **fixed** (this run): `var(--radius-lg)` for the five cards, `var(--radius-full)` for the pill. |
| G5 | advisory (D4 carried) | `ProjectHome.tsx:434,469,783` | `var(--border,#d0d5dd)` / `var(--border-subtle,#eaecf0)`: both tokens are defined, so the literal fallbacks are dead and do not match the real values. | **fixed** (this run): fallbacks dropped. |

Not flagged, per instruction or by design: `TemplateLibrary.tsx:102-164` (`SpecPreview`, a
theme-invariant mock of user content; last week's advisory #3). Clean, confirmed by reading: every
other launch file for hex / rgba / boxShadow literals; no Tailwind arbitrary values in scope; no
`window.confirm(` or hand-rolled dialogs (`GovernedConfirmDialog` is used correctly by
`AdminSurfaces.tsx` and `quality/SopRegister.tsx`).

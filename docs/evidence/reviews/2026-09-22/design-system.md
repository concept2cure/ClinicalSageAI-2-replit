# Design-system lens: launch catalog, 2026-09-22

Auditor: `design-system-auditor`, read-only apart from running gates. `git status`
stayed clean after every gate run. Its report is condensed here with every finding
kept. The first pass read the device-kit Vault and Tasks components by mistake; the
real launch files were covered by a second pass (section at the end). See the
scope correction in `README.md`.

## Gates (whole-repo; they take no path scope)

| Gate | Result |
|---|---|
| `ci:design-system` | PASS |
| `ci:token-contrast` | PASS: 61 pairs, 15 documented exceptions held |
| `ci:check-phantom-tokens` | PASS: 14 tokens, baseline 14 |
| `ci:check-chip-tones` | PASS: 136 uses, 28 tones, all resolve |
| `ci:token-cascade` | PASS: 40 stylesheets |
| `ci:check-orphaned-stylesheets` | PASS: 0 orphaned |
| `ci:check-css-selector-shadowing` | **FAIL**: `.c2c-v2` at `authoring-v2.css:6` and `:1492` |
| `ci:surface-text-ramp` (run by the control tower) | **FAIL**, then fixed in this change; see `README.md` |

### The shadowing failure is a gate false positive

The control tower's check: both `.c2c-v2 { … }` blocks in
`client/src/concept2cure/v2/styles/authoring-v2.css` are CSS-nesting wrappers with
**zero declarations of their own**, counted at nesting depth 1:

- block at `:6` ends at `:1473`
- block at `:1492` ends at `:2306`

Nothing on `.c2c-v2` itself is overridden. The gate flattens nested children
(its baseline holds `.c2c-v2 .ana-composer` and similar entries) and reports no
child-level collision here. So this is the gate counting an empty wrapper as a
definition. It is not a pixel defect.

The second wrapper came from `c402dbb6b` (2026-09-21, "WN: the canvas…").
Either the gate should skip rules with no declarations, which needs its selftest
extended to show it still fails on a real shadow, or the two wrappers should be
merged. **Not fixed here**: both touch the AnA canvas path pinned by
`docs/design/ANA_DOCUMENT_CANVAS.md`, which another session was editing
(`c69dcc92d`, 2026-09-22). Owner: canvas workstream.

## Code findings (by reading)

| # | Severity | App | Where | Finding | Fix |
|---|---|---|---|---|---|
| 1 | medium | Authoring | `client/src/concept2cure/v2/surfaces/Review.tsx:849` | `var(--danger, #b42318)`: `--danger` is one of the 14 baselined phantom tokens, so the light-mode literal renders in dark mode too | `var(--error)` |
| 2 | low | Projects | `client/src/concept2cure/v2/surfaces/ProjectHome.tsx:422,457,771` | `var(--border, #d0d5dd)` ×2 and `var(--border-subtle, #eaecf0)`: tokens are declared, so the fallbacks are dead, and they don't match the token values | drop the fallbacks |
| 3 | advisory | Authoring | `TemplateLibrary.tsx:102-164` | `SpecPreview` hex values are the user's own template branding on a paper mock; theme-invariant by design | none |
| 4 | advisory | CI | `.github/workflows/ci.yml:679` | step still named "(ADVISORY)" though `ci:token-cascade` has been blocking since 2026-09-10 | rename step |

## Clean

- **Vault**: `ArtifactsCenter` (`AdminSurfaces.tsx:2279-2711`) is clean. Every
  `var()` resolves.
- **Projects**: `Projects.tsx`, `BiopharmaJourney.tsx`, `FilingsCatalog.tsx`.
- **Authoring**: `DocumentAuthoring.tsx`, `BiopharmaProject.tsx`, `ProtocolDev.tsx`.
- **Submission Center**: all six files.
- **Submission Readiness**: all three files.
- **QMS**: `QualityRoute.tsx`, `QmpWorkspace.tsx`.
- **Across all launch files**:
  - zero imports from `client/src/components/ui/`
  - no reinvented primitives
  - no Tailwind
  - no named colour keywords in inline styles

## Second pass: `v2/surfaces/Vault.tsx` and `TaskBoard.tsx`

See `README.md` § "Scope correction" for why this pass exists; its result is
recorded there.

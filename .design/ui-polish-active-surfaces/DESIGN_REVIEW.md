# Design review — active UI-v2 surfaces

Reviewed against: `design-system/CLAUDE.md`, `design-system/READ_ME_FIRST.md`
(no `DESIGN_BRIEF.md` exists for this scope; those two files carry the
non-negotiables and were used as the brief).
Date: 2026-09-05

## Lenses run

Six ran: design-reviewer, a11y-auditor, part11-ux-auditor, microcopy-reviewer,
motion-auditor, design-system-auditor. Plus honest-state-auditor.

**Screenshots were NOT captured, and that is a real gap in this review.** The
app needs Postgres and the Docker daemon is unavailable in this environment, so
the running application could not be reached. What replaced them is stronger for
the contrast question and weaker for everything else: the repo's own
`visual-qa` pipeline renders all 126 captured surfaces in headless Chromium
under the real shipped stylesheets and measures computed colour per text node.
Layout, overflow, focus rings and responsive behaviour were NOT visually
verified. Treat the layout half of this review as code-read only.

## The finding that matters

`visual-qa:contrast` measured 4056 text elements and reported **zero** failures.
It only ever rendered the light theme. Adding a dark pass, with the shell marked
up exactly as `V2App.tsx` renders it, changed the picture:

| Theme | Elements measured | Below WCAG 2.2 AA |
|---|---|---|
| light | 4056 | 0 |
| dark (before fixes) | 4056 | 326 (8.0%) |
| dark (after fixes) | 4056 | 45 (1.1%) |

Two root causes accounted for 281 of the 326.

**1. The generated text ramp's dark correction never applied.**
`scripts/design/generate-surface-text-ramp.mjs` emits its dark re-base as
`[data-theme="dark"] :is(…)`. Nothing in `client/` ever set that attribute —
`V2App.tsx` marks the shell with a `dark` CLASS. `colors_and_type.css` accepts
either (`.dark, [data-theme="dark"]`), so tokens looked right and the ramp
silently did not. The light re-base stayed applied over dark surfaces:
measured 1.90:1 and 1.66:1 where the dark values give 4.57 and 5.24.
Fixed by setting `data-theme` on the shell alongside the class, rather than
teaching every generated sheet a second selector — which was tried first and
rejected because it made `.dark` a cross-shell class collision that
`ci:check-shell-css-collisions` correctly refused.

**2. The accent aliases froze at their light values for the whole dark theme.**
`app-v2.css` aliased `--accent-000/100/200` to `--accent-main-*` at `:root`.
A custom property is substituted where it is DECLARED, and the canonical dark
block matches the shell div, never `<html>`. So `--accent-200` stayed `#ad5132`
instead of `#e8916f`, and `--accent-000` stayed the near-white `#faf0ec`.
Measured: 223 elements at `#ad5132` on `#262624`, plus 49 sitting on a white
accent ground in dark mode. Fixed by re-declaring the aliases under
`.c2c-v2.dark` so substitution re-runs where the dark values are in scope.

## Must fix — NOT done here, needs an owner

1. **RBM approve endpoints have no authorization gate.**
   `server/routes/mdx-rbm.ts` `POST /rbm-assessments/:id/approve` and
   `/rbm-monitoring-plans/:id/approve` require only an authenticated org user
   plus password/TOTP. No role check anywhere in the file. Sibling routes in
   `server/routes/submissions.ts` gate every governed endpoint with a role, and
   `AdminSurfaces` enforces a two-person rule for translation approvals. Here an
   author can sign their own risk assessment. This is missing enforcement, not a
   hidden button, and choosing the role model is a product decision.

2. **45 remaining dark-mode contrast failures.** Largest cluster is 33 elements
   inheriting `--accent-on-strong` (`#141413`, correct ON an accent fill) onto
   the page background, where it is not. Needs per-element work.

3. **~50 surfaces render loading as a bare `<div className="scaf-note">`**
   with no `role="status"`, while their own error and empty branches use the
   shared `EmptyState`. The licensing family does it correctly with
   `role="status"`. Mechanical, but touches ~50 files.

4. **Dialogs without dialog semantics.** `AnaCommand.tsx`, `CollabLauncher.tsx`,
   `Review.tsx` (the e-signature dialog), `FilingsCatalog.tsx`, and three of
   `TaskBoard.tsx`'s four modals have no `role="dialog"`, no `aria-modal`, no
   Escape handler and no focus management. The `useDialog` helper already used
   elsewhere is the fix.

5. **~18 unlabelled form controls** in the CollabLauncher and TaskBoard modal
   forms, including "Meaning of signature" and "Reason for sign-off" inside the
   e-signature dialog. Labels are siblings, not wrappers, with no `htmlFor`.

6. **Keyboard-unreachable controls**: `ProtocolDev.tsx` heat-map cell and risk
   row, `Orchestration.tsx` nav chip, `QmpWorkspace.tsx` table cell.

## Fixed in this pass

- Dark-mode text ramp and accent aliases (above).
- `visual-qa:contrast` now measures both themes and reads the page background
  rather than assuming white.
- Seven Title Case page headings moved to sentence case, with the four Title
  Case registry labels moved with them so nav and page agree.

## What works well

Genuinely strong, and worth saying because it shaped what counted as a finding:
the honest-state discipline is real, not decorative. `assessmentState.ts` is
load-bearing across 17 surfaces, the fixture-fallback API has been deleted
rather than deprecated, and no `catch { setRows([]) }` exists anywhere in the
tree. The Part 11 signature ceremony (`GovernedApprovalDialog`, `SignoffList`,
`AuthoringSignatures`) meets §11.50 including the printed-name fallback. And
the CI gates here are unusually good — two of them caught my own mistakes
mid-pass, which is the point of a gate.

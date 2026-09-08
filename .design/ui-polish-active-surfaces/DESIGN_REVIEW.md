# Design review — active UI-v2 surfaces

Reviewed against: `design-system/CLAUDE.md`, `design-system/READ_ME_FIRST.md`
(no `DESIGN_BRIEF.md` exists for this scope; those two files carry the
non-negotiables and were used as the brief).
Date: 2026-09-05

## Lenses run

Six ran: design-reviewer, a11y-auditor, part11-ux-auditor, microcopy-reviewer,
motion-auditor, design-system-auditor. Plus honest-state-auditor.

~~**Screenshots were NOT captured, and that is a real gap in this review.**~~
**Closed 2026-09-08 — see "Screenshots (added 2026-09-08)" below.** The original
text is kept because it explains what the rest of this document was written
without.

> _Original note (2026-09-05):_ The app needs Postgres and the Docker daemon is
> unavailable in this environment, so the running application could not be
> reached. What replaced them is stronger for the contrast question and weaker
> for everything else: the repo's own `visual-qa` pipeline renders all 126
> captured surfaces in headless Chromium under the real shipped stylesheets and
> measures computed colour per text node. Layout, overflow, focus rings and
> responsive behaviour were NOT visually verified. Treat the layout half of this
> review as code-read only.

The blocker was environmental, not architectural: Postgres is provisionable
locally with `scripts/db/install-fresh.mjs` (the Docker daemon is not needed —
the container was already running), and Chromium ships at `/opt/pw-browsers`.
36 screenshots now exist under `screenshots/`, and the layout half of this
review is no longer code-read only.

## The finding that matters

`visual-qa:contrast` measured 4056 text elements and reported **zero** failures.
It only ever rendered the light theme. Adding a dark pass, with the shell marked
up exactly as `V2App.tsx` renders it, changed the picture:

| Theme | Elements measured | Below WCAG 2.2 AA |
|---|---|---|
| light | 4056 | 0 |
| dark (before fixes) | 4056 | 326 (8.0%) |
| dark (after fixes) | 4093 | 8 (0.2%) |

Four root causes accounted for 318 of the 326. All four are the same shape —
something that resolves once, in a scope where the dark values are not in
view — which is why measuring one theme could never have found them.

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

## Fixed since this review was written

- **No fake or mock fixtures.** 82 unreferenced exports across 21 files, 1,442
  lines of fabricated life-sciences data, deleted: three invented programmes
  (incl. a fabricated "NDA 212345"), seven invented colleagues, fabricated
  serious adverse event cases, contradiction findings, precedent results,
  protocol documents, risk register rows and eTMF filing signals. `Etmf.tsx`
  said twice that the fabricated filings "is removed" while they were still in
  the bundle; that is now true. Proven by ci:typecheck:no-regression at 0
  against a 0 baseline — anything still referenced would fail to compile.
- **The Part 11 signature fields now have names.** "Meaning of signature" and
  "Reason for sign-off" had sibling `<label>`s with no association, so neither
  field recording regulatory intent was announced. Fixed there and across 18
  controls in two intake forms, using htmlFor/id so the visible label is also
  clickable. Revert-proven test added.
- **Five modals gained a keyboard exit.** TaskDetail, TaskCreate,
  WorkflowStart, ESignTaskModal and Review's e-signature dialog now route
  through the existing `useDialog` helper: role, aria-modal, Escape, focus.
- **101 loading states announced.** role="status" added across 58 surfaces,
  matching the 56 that already had it.

**3. The whole semantic alias layer was frozen to its light values.**
`--ink`, `--ink-body/muted/subtle/disabled/inverse`, `--canvas`,
`--canvas-muted/sunken/inverse`, `--border-focus`, `--accent-hover`, `--info`
and `--info-muted` are declared at `:root` as `var()` indirections and were
never re-declared in the dark block. Same mechanism as the accent aliases, but
in the canonical token file and covering the layer its own comment calls "what
C2C product code uses". The global heading rule paints h1/h2 with `var(--ink)`,
so every bare heading rendered #141413 on the #262624 page: 30 of the 45
failures that remained at that point. Fixed by re-declaring all 14 inside the
dark block, with identical right-hand sides — the same indirection evaluated in
the right scope, not a second palette to keep in step.

**4. 73 phantom `--c2c-*` tokens rendered a hardcoded light-mode literal.**
None of `--c2c-dim`, `--c2c-line`, `--c2c-err`, `--c2c-ok`, `--c2c-surface` and
the rest is declared anywhere in the repo, so all 73 `var(--c2c-x, #fallback)`
sites always rendered the fallback — an invented Tailwind-ish palette, not the
brand's, wrong in light and unreadable in dark. Repointed at the canonical
token carrying the same meaning. The phantom-token baseline drops from 26
tokens across 136 sites to 14 across 63.

## A gate that could be broken by prose

Adding the alias block broke `ci:token-contrast`: it splits the token file on
braces and does not skip comments, and the comment explaining the fix quoted a
CSS rule. That cut the dark block in half and the gate could no longer find
`--bg-000` in either half. It refused to report success rather than passing over
half a palette, which is the right failure — but the parse should not have been
breakable by prose, so it now strips comments first. Verified by re-introducing
the same braced comment and watching it parse cleanly.

## Must fix — NOT done here, needs an owner

1. **RBM approve endpoints have no authorization gate.**
   `server/routes/mdx-rbm.ts` `POST /rbm-assessments/:id/approve` and
   `/rbm-monitoring-plans/:id/approve` require only an authenticated org user
   plus password/TOTP. No role check anywhere in the file. Sibling routes in
   `server/routes/submissions.ts` gate every governed endpoint with a role, and
   `AdminSurfaces` enforces a two-person rule for translation approvals. Here an
   author can sign their own risk assessment. This is missing enforcement, not a
   hidden button, and choosing the role model is a product decision.

2. **8 remaining dark-mode contrast failures**, down from 326. What is left is
   genuinely per-element rather than one more frozen token: 3 headings still
   reaching `--ink` through a path the alias fix does not cover, 3 at
   `--text-400` on `--canvas-elevated` (3.6:1, a token pair a designer should
   settle), and 2 white labels on the success and accent fills.

3. **Loading still renders as a bare note, not the shared `EmptyState`.** The
   announcement is fixed (above) but the three states of one surface still look
   like three different components. A visual consolidation, worth doing alone.

4. **Dialogs still without semantics:** `AnaCommand.tsx` (two, plus close
   buttons with no accessible name), `CollabLauncher.tsx` and
   `FilingsCatalog.tsx`. `useDialog` is also a partial trap by design — Tab can
   still leave an open panel.

6. **Keyboard-unreachable controls**: `ProtocolDev.tsx` heat-map cell and risk
   row, `Orchestration.tsx` nav chip, `QmpWorkspace.tsx` table cell.

7. **`document.body` stays light-themed in dark mode** (found 2026-09-08 by the
   screenshot pass). `getComputedStyle(document.body).backgroundColor` is
   `rgb(250, 249, 245)` under both themes. Not visible today because `.c2c-v2`
   covers the viewport, so this is latent — but it is the fourth instance of the
   exact shape root causes #1–#3 describe: a value resolving where the dark
   tokens are not in scope. It would surface on overscroll, behind a shell
   shorter than the viewport, or in a print/export path. Small fix, but it wants
   the same care as the alias re-declaration rather than a hardcoded body rule.

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

---

## Screenshots (added 2026-09-08)

Captured by `capture-2026-09-08.mjs` in this folder, against the real dev server
on a locally provisioned Postgres, in Chromium 1194. 36 shots: five active
surfaces (home, projects, vault, tasks, apps) × light and dark × 1280 / 768 /
375, plus the three read-states of one surface in both themes. Zero page errors
across all of it.

Dark is set through the **real preference** (`c2c-v2-prefs.dark`), not by forcing
a class or an attribute. That matters here specifically: root cause #1 above was
a shell whose class said dark while the generated ramp stayed light, so a capture
that forced only one of the two would photograph a state no user can reach and
would hide the very bug this review is about.

Rows in the populated Projects shots are synthetic, served through request
interception, as are the loading and failed states — a failed read cannot be
photographed on demand otherwise. None of it is evidence about real data; it is
evidence about layout and colour.

### Both dark-theme root-cause fixes verified live

Measured from `getComputedStyle` on the shell, not read off the pixels:

| | light | dark |
|---|---|---|
| `.c2c-v2` has `dark` class | no | **yes** |
| `data-theme` attribute | absent | **`"dark"`** |
| `--bg-000` | `#faf9f5` | **`#262624`** |
| `--accent-200` | `#ad5132` | **`#e8916f`** |

Root cause #1 (the ramp's `[data-theme="dark"]` selector never matching) and
root cause #2 (accent aliases frozen at light values — the review measured 223
elements stuck at `#ad5132`) are both confirmed fixed in a running browser.
`--accent-200` resolving to `#e8916f` is the direct disproof of the frozen-alias
bug.

### New: `document.body` keeps the light background in dark mode

`getComputedStyle(document.body).backgroundColor` is `rgb(250, 249, 245)` —
`--bg-000`'s LIGHT value — in both themes. The dark shots look correct because
`.c2c-v2` paints over the full viewport, so **this is latent, not visible
today**. It is the same shape as the two root causes above (a value resolving in
a scope where the dark tokens are not in view), and it would surface as a light
band on overscroll, behind a shell shorter than the viewport, or in any print or
screenshot path that captures the body. Filed below rather than fixed here.

### Must-fix #3 confirmed, with pictures

The claim was that loading, empty and failed "still look like three different
components." They do, and the shots settle it:

| State | What it renders |
|---|---|
| loading | thin left-accent rule, left-aligned text, no icon, full width |
| empty | large dashed-border panel, centred, folder icon + bold title + hint |
| failed | solid warning-bordered panel, icon + title + reason + "Try again" |

Three different containers, three different alignments, three different border
treatments, in one slot. `review-projects-state-{loading,empty,failed}-*.png`.

### Honest-state discipline verified visually

Worth recording because it is the thing this codebase most insists on, and the
distinction is only legible side by side:

- **empty** portfolio → `0 active programs · 0% average readiness · 0 blocked`
- **failed** read → `— active programs · — average readiness · — blocked`

Zero when the count is genuinely zero; an em dash when it is unknown. The
`kv()` guard is doing exactly what it exists to do, and the two states cannot be
mistaken for each other.

### Not covered by these shots

Focus rings, keyboard traversal and motion were not captured — they need
interaction, not a screenshot, and must-fix #4 and #6 remain open on code-read
evidence. The 8 remaining dark contrast failures are also not adjudicated here;
they were measured per-element by `visual-qa:contrast`, which remains the right
instrument for them. The `--text-400` on `--canvas-elevated` pair (3.6:1) a
designer still needs to settle is visible in the dark Projects shots.

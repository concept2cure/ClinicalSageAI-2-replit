# Visual QA

Checks that need a **real browser** — real layout, a real cascade, real computed
styles. jsdom parses CSS but does not lay it out, so every `getComputedStyle`
answer there is a default: a surface whose stylesheet stopped matching renders
identically in jsdom whether it is styled or not. These steps exist for the
questions jsdom structurally cannot answer.

Everything that needs **only the DOM** deliberately lives elsewhere, as an
ordinary CI test with no browser and no build:

| question | where it lives | runs in CI |
|---|---|---|
| does every control have an accessible name? | `client/src/concept2cure/v2/__tests__/a11ySemantics.test.tsx` | yes |
| does every surface survive a bad API response? | `client/src/concept2cure/v2/__tests__/hostilePayloadProbe.test.tsx` | yes |
| **does text meet WCAG contrast?** | here — needs real rendering | no |
| **is every surface actually styled?** | here — needs the real cascade | no |
| **does anything spill sideways out of its box?** | here — needs real layout | no |

The a11y **rules** are shared, not duplicated: `a11y-rules.mjs` is imported by the
CI test and injected into the page by `check-a11y-semantics.mjs`. One definition,
two runtimes. Two copies of a judgement call is two places for it to drift.

## Running it

```bash
npm run visual-qa            # capture, then all four checks, in order
```

or step by step:

```bash
npm run visual-qa:capture    # serialize every surface's markup to .visual-qa/markup
npm run visual-qa:styling    # is each surface actually receiving CSS?
npm run visual-qa:a11y       # statically-detectable WCAG failures
npm run visual-qa:contrast   # WCAG 2.2 AA contrast, measured
npm run visual-qa:overflow   # does anything spill sideways out of its box?
```

## Every check renders what the shell renders

Two things are true of a captured fragment and are easy to get wrong, and each
one silently voids a whole run rather than failing it:

**The wrapper.** The captures write `container.innerHTML` — the surface without
the `<div class="c2c-v2 shell">` the shell mounts it in. Every `.c2c-v2 …` rule
needs that class on an ancestor, so a fragment rendered bare is unstyled markup
the product never serves. `check-overflow.mjs` shipped without the wrapper and
its first two findings were artifacts of exactly that.

**The stylesheets.** The build emits twenty CSS chunks, not four. Each check
named `index-*`, `V2App-*` and one of `MdxSurfaceHost-*` / `PdevRoute-*` and
loaded nothing else; fourteen of the remaining sixteen style 239 classes that
appear in the captured markup. `built-css.mjs` is now the single place that
answers "which stylesheets" — every check imports it, and it loads all of them.
The trade-off is stated there: all-chunks is a superset of what one route
serves, which is the opposite error from a missing sheet and a visible one.

That two of the three checks had grown their own `sheetsFor()` is the other
half of the story. Two copies of a judgement call is two places for it to
drift; three is how the third one gets written without anyone noticing the
first two were incomplete.

`check-surface-styling.mjs` is the check that caught this, by refusing to run:
its self-check asserts `.rc-ana` computes to `display:flex`, `.rc-ana` moved
into the `Insights-*` chunk, and the script exited 2 rather than report on a
cascade it did not have.

### Playwright is not a dependency, on purpose

These are on-demand audits, not CI. Making every `npm install` download a browser
to serve four manual scripts is a bad trade. Install it when you want to run
them:

```bash
npm i --no-save playwright-core
```

Or point at a copy you already have:

```bash
PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs npm run visual-qa:a11y
PLAYWRIGHT_CHROMIUM=/path/to/chromium npm run visual-qa:a11y   # non-standard browser location
```

`playwright.mjs` resolves both and explains itself if it can't, rather than
throwing a module-resolution stack trace. It also has to read the launcher off
`default`: `playwright-core`'s package main is CommonJS, so `await import()` on
it hands back a namespace whose `chromium` is undefined. Reading only
`mod.chromium` meant the command printed directly above installed the package
and the loader still said "Playwright is not installed".

## The capture is two specs, not one

`visual-qa:capture` runs **both**:

- `dump-surface-markup.spec.tsx` — the 24 surfaces the shell convergence moved
  (`mdx__*`, `pdev__*`)
- `dump-v2-surfaces.spec.tsx` — the other 94 (`v2__*`), skipping what the first
  covers via its `ALREADY_COVERED` set

Running only one leaves a partial capture that every downstream check will
happily report on. That is why the npm script exists.

## Why a capture can be refused

Each check calls `assertCaptureIsFresh` and exits **2** if any source file is
newer than the oldest captured surface.

This is not paranoia. Immediately after 21 accessibility violations were fixed
and the CI ratchet went to zero, the Chromium script still reported 5 — every one
of them in markup captured seven minutes before the fix. Two instruments, two
answers, and the wrong one looked *more* authoritative because it ran in a real
browser. An audit of a stale capture is not a weaker measurement; it is a
measurement of something else.

## Exit codes

| code | meaning |
|---|---|
| 0 | clean |
| 1 | the product has findings |
| 2 | **do not trust this run** — the harness failed its own self-check, or the capture is stale |

Every script proves itself before reporting: the contrast measurement checks
known-black on known-white is 21:1, the a11y audit checks it detects all six
seeded failures *and* flags none of the four correct forms, and the overflow
check proves both that the cascade reaches its measured box and that it can tell
a seeded spill from a seeded decoration. The false-positive
half matters more — a tool that flags correct markup teaches people to ignore it,
and then it protects nothing.

## The fragment gate is blind to containers — so there is a second one

`npm run visual-qa:live` drives the **running app** and runs the same rule over
the real shell. It needs a server (`npm run dev`) with `ALLOW_DEV_AUTH=1`,
because it authenticates through `/api/auth/dev-login`.

It exists because the register fix in ledger L97 measured exactly right in a
fragment — table 738 wide, content 1036, `overflow-x:auto` — and was wrong in
the app. A flex item's automatic minimum size is its min-content width, so the
row's explicit `min-width` propagated up: `.qms-shell` refused to shrink below
1,094 inside the 796px pane, `.page` grew a horizontal scrollbar, and the whole
quality page scrolled sideways instead of the table. The fragment gate reported
clean throughout and was not wrong — it was answering a different question. A
fragment has no ancestors, which is what makes it cheap and what makes it blind.

**The rule is shared, not copied.** `overflow-rule.mjs` holds the judgement
calls — what clips cannot spill, out-of-flow decoration is not a defect — and
both checks inject it into the page. Same argument as `a11y-rules.mjs`: two
copies of a judgement call is two places for it to drift.

**The trap it self-checks for.** The stored shell defaults are
`railCollapsed:true, anaOpen:false`, which hand a surface **1,352px** instead of
796. The first live run was done that way, reported every surface clean, and was
worthless. So the check sets `c2c-v2-prefs` before navigating and then *asserts
the pane width* before reporting anything — wrong width, exit 2, no findings
printed. A check that can quietly measure the roomy case will eventually be run
that way.

It also refuses to write a baseline from a partial sweep, and names any surface
it could not drive. Chromium dies on long sweeps, and a dead browser must not
read as a clean product.

## Known blind spot

React event handlers do not survive serialization, so a `<div onClick>` — a
control that cannot be reached by keyboard at all — is **invisible** to every
check here. Keyboard operability and focus order are not covered by anything in
this directory. A green run means "every control has a name", not "the product is
accessible".

## Does anything spill sideways out of its box?

`npm run visual-qa:overflow` measures every captured fragment at the width its
component is actually given and fails on an element wider than its own box.

It exists because a fix to AnA's work record set `flex-basis:100%` plus an 18px
`margin-left` — 100% PLUS 18px — and shipped. 2,153 tests passed, every CSS gate
passed, CI went green. jsdom parses the cascade but does not lay it out, so
`getByText` answers the same whether an element fits or overflows, and the
design gates read stylesheets as text and cannot know what `100%` resolves to.

The width is the whole point. That defect *was* looked at before it shipped —
at 460px, where it fits. It only appears at the 356px the rail really gets
(`--ana: 380px` less 12px of `.ana-body` padding a side). So each capture
declares its own width in `_viewports.json`, and fragments without one are
measured at the desktop viewport the surface captures assume.

The width is also why the default is **796px, not 1440**. A surface never gets
the viewport: the shell is `grid-template-columns: var(--rail) 1fr var(--ana)`,
so 264px goes to nav and 380px to the AnA rail. Measuring at 1440 grants 644px
of room that does not exist.

Findings are ratcheted in `overflow-baseline.json`: pre-existing overflows are
recorded so the count can fall and never silently rise, and anything new is
printed by name. What is in it now is real and open — see ledger L99, and note
that a baseline entry means "known", not "acceptable". A baseline that only
ever holds steady is a baseline nobody reads; this one went 30 → 2.

Three exclusions, each by rule:

- **Screen-reader-only regions.** The standard clip technique gives them a 1px
  box on purpose.
- **Elements that clip or scroll.** Only `overflow-x: visible` escapes a box.
  `hidden`/`clip` cut content off at the edge — which is what
  `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` is *for*, and
  that idiom always measures wider than its box. Reporting it means reporting
  every truncated label in the product as a layout defect.
- **Out-of-flow decoration.** Every candidate is measured a second time with
  absolutely positioned boxes and positioned `::before`/`::after` taken away,
  and only what still overflows is a finding. `.ae-pstage` is the case in hand:
  a `::after` arrow at `right:-17px` in the card's own 22px right margin made
  all six pipeline cards measure 156 against a 139px box while nothing moved a
  pixel.

The second and third are suppressions, which is the dangerous direction, so the
script seeds one of each shape before it reports: an in-flow spill it must find
and a margin-placed `::after` it must leave alone. It exits 2 if it gets either
wrong. The false-positive half is the one that matters — a check that flags
correct markup gets its baseline raised until it reports nothing at all.

# Visual QA

Checks that need a **real browser** — real layout, a real cascade, real computed
styles. jsdom parses CSS but does not lay it out, so every `getComputedStyle`
answer there is a default: a surface whose stylesheet stopped matching renders
identically in jsdom whether it is styled or not. These four steps exist for the
questions jsdom structurally cannot answer.

Everything that needs **only the DOM** deliberately lives elsewhere, as an
ordinary CI test with no browser and no build:

| question | where it lives | runs in CI |
|---|---|---|
| does every control have an accessible name? | `client/src/concept2cure/v2/__tests__/a11ySemantics.test.tsx` | yes |
| does every surface survive a bad API response? | `client/src/concept2cure/v2/__tests__/hostilePayloadProbe.test.tsx` | yes |
| **does text meet WCAG contrast?** | here — needs real rendering | no |
| **is every surface actually styled?** | here — needs the real cascade | no |

The a11y **rules** are shared, not duplicated: `a11y-rules.mjs` is imported by the
CI test and injected into the page by `check-a11y-semantics.mjs`. One definition,
two runtimes. Two copies of a judgement call is two places for it to drift.

## Running it

```bash
npm run visual-qa            # capture, then all three checks, in order
```

or step by step:

```bash
npm run visual-qa:capture    # serialize every surface's markup to .visual-qa/markup
npm run visual-qa:styling    # is each surface actually receiving CSS?
npm run visual-qa:a11y       # statically-detectable WCAG failures
npm run visual-qa:contrast   # WCAG 2.2 AA contrast, measured
```

### Playwright is not a dependency, on purpose

These are on-demand audits, not CI. Making every `npm install` download a browser
to serve three manual scripts is a bad trade. Install it when you want to run
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
throwing a module-resolution stack trace.

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
known-black on known-white is 21:1, and the a11y audit checks it detects all six
seeded failures *and* flags none of the four correct forms. The false-positive
half matters more — a tool that flags correct markup teaches people to ignore it,
and then it protects nothing.

## Known blind spot

React event handlers do not survive serialization, so a `<div onClick>` — a
control that cannot be reached by keyboard at all — is **invisible** to every
check here. Keyboard operability and focus order are not covered by anything in
this directory. A green run means "every control has a name", not "the product is
accessible".

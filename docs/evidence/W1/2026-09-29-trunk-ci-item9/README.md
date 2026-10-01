# W1 / D2 — trunk CI hand-on item 9: one crumb-separator rule; a derived field looks read-only (2026-09-29)

**Row:** D2 (launch surfaces), via the trunk CI hand-on addressed to `…01PwLFr8`.
It is item 9 in two places in `docs/work-orders/README.md`: the validation-package
section and the D5 lane's CI-check section.

## What was open

| Part | State at `a44df9da6` | Who |
|---|---|---|
| `ci:tenant-entry-points`: `mdx-admin.ts` digest changed | already **done** (`8686a3210`: the justification was re-read and the digest refreshed) | `…01TTTQ1h` |
| `ci:check-css-selector-shadowing`: `.c2c-v2 .crumbs .sep` at `app-v2.css` lines 1480 and 1484 | **red**. Lint fails, so every job that `needs: lint` is skipped | this change |
| `.c2c-v2 .de-input` has no `[readonly]` rule, so a derived reviewer name looks editable | open | this change |

## 1. One separator rule

`7b00c78de` added `.c2c-v2 .crumbs .sep{flex-shrink:0;}` (line 1480) beside the
existing `{color:var(--text-400);}` (line 1484). The two declarations set
different properties, so nothing was lost on screen, but the gate cannot tell
that. It is now one rule, `{color:var(--text-400);flex-shrink:0;}`.

Order does not matter to the result. `.c2c-v2 .crumbs .sep` (0,3,0) outranks
`.c2c-v2 .crumbs>span` (0,2,1), so the separator keeps `flex-shrink:0` wherever
the rule sits.

- [`gate-before.txt`](gate-before.txt): exit 1, *"1 NEW shadowed selector …
  `.c2c-v2 .crumbs .sep` defined at lines 1480 and 1484"*.
- [`gate-after.txt`](gate-after.txt): exit 0, *"21 known shadowed selector(s), 0 new"*.

## 2. A derived value looks like what it is

`C2CForm` shows a value it derives, and does not let it be edited, as
`<input readOnly aria-readonly="true">` (`C2CForm.tsx:168`, SEC-C-7 follow-on
`e6822dac`). In *Request a review* the derived value is the reviewer's name for
the chosen account. On the editable white, with the editable text colour and a
text cursor, it looked like a field to type in.

`journey-v2.css` gains `.c2c-v2 .de-input[readonly]{background:var(--bg-100);color:var(--text-300);cursor:default;}`.
These are stone tokens only. The focus ring is kept, because the field is still
reachable by keyboard. The surface text ramp was regenerated
(`generate-surface-text-ramp.mjs`) so that `--text-300` is re-based on the
tinted fill.

**Live:** Protocol development › Reviews › *Request a review*, signed in as the
second signer, with the reviewer account set to Rae Okafor
([`computed-style.json`](computed-style.json)):

| | background | text | cursor |
|---|---|---|---|
| before ([png](before-reviewer-name.png)) | `rgb(250,249,245)`, the same as the editable *Review role* | `rgb(20,20,19)`, the same as editable | `text` |
| after ([png](after-reviewer-name.png)) | `rgb(240,238,230)` | `rgb(100,98,92)` | `default` |

The text on the fill is **5.25:1** (WCAG AA 4.5:1 for text). jsdom loads no
stylesheets, so this half is shown by the live capture, as the repo does for
`.sp-primary:disabled`. The DOM half is covered by
`protocolReviewerNameReadOnly.test.tsx`.

## Found on the way, handed to the next change

The same drawer's *Reviewer account* list shows **"JM Smith · admin" twice**
(accounts 1 and 2 share a display name). This is the same defect as the Task
form's two identical "JM Smith" assignee chips. It is the next change on this
lane.

## Gates

`ci:check-css-selector-shadowing`, `ci:surface-text-ramp`,
`ci:check-shell-css-collisions` and `ci:design-system` all pass.

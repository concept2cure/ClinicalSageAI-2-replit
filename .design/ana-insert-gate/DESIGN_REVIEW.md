# Design Review: the AnA insert gate (refused "Insert as tracked suggestion")

Reviewed: AnA reasoning round 13 (commit `8c75defca`, with trunk merged on top).
Date: 2026-10-11.
Brief: none exists for this UI. The only `.design/` brief is
`surface-layer-assessment`, which does not cover it. Measured instead against
the repo's own design system (`design-system/colors_and_type.css`, the v2 token
set and the generated text ramp), the GE-P-3 refusal pattern already used
across the product, CLAUDE.md RULE 2, and 21 CFR Part 11 / WCAG 2.2 AA.

## What this UI is

AnA's answer can be put into a governed document section as a **tracked
suggestion** — a pending in-text insertion a person accepts or rejects. RULE 2
says only an approved, performance-qualified model may write regulatory text.
Round 11 made the offer refuse an answer that rule does not admit: **disabled,
not hidden, with the reason as visible text the control is described by.**
Round 13 rewrote what those refusals say, fixed their element ids and contrast,
made the paste door keep the turn AnA's words came from, and put the AnA turn
behind each decided change on the document's audit rail.

Two hosts draw the control: the editor's AnA pane
(`editor/DocumentWorkbench.tsx`, `AnaInsertOffer`) and the conversation beside
an open document (`surfaces/ConversationThread.tsx`, `InsertIntoOpenSection`).

## Lenses run

All six, in parallel, each finding then put to an adversarial verifier
(23 agents in all; `wf_ed3c9faf-d8d`):

| Lens | Outcome |
|---|---|
| `design-reviewer` | 7 findings — 4 should-fix, 3 could-improve |
| `a11y-auditor` | 4 findings — 1 should-fix (pre-existing), 3 could-improve. Ran `ci:token-contrast`, `ci:check-chip-tones`, `ci:design-system`, `check:microcopy`, `ci:empty-state-honesty`: all pass |
| `part11-ux-auditor` | 11 findings — 6 should-fix, 5 could-improve |
| `microcopy-reviewer` | 6 findings — 5 should-fix, 1 could-improve |
| `motion-auditor` | 0 findings. **Nothing to judge:** the round adds no animation, and no `transition` or `animation` rule reaches either control. I confirmed this in Chromium: `transition-duration` computes to `0s` on both |
| `design-system-auditor` | 3 findings — **1 must-fix (a failing gate)**, 2 could-improve. Ran `ci:design-system`, `ci:token-contrast`, `ci:check-phantom-tokens`, `ci:check-chip-tones`, `ci:token-cascade`, `ci:surface-text-ramp` |

## Screenshots captured

| Screenshot | Breakpoint | What it shows |
|---|---|---|
| `screenshots/review-conversation-closed-light-desktop-1280.png` | Desktop 1280×900 | A mixed list: one admitted offer above four refused ones, each with its own reason |
| `screenshots/review-conversation-closed-dark-desktop-1280.png` | Desktop, dark | The same, dark |
| `screenshots/review-insert-refusals-light-desktop-1280.png` | Desktop | The same conversation with the editor open beside it |
| `screenshots/review-insert-refusals-dark-desktop-1280.png` | Desktop, dark | The same, dark |
| `screenshots/review-pane-refused-light-desktop-1280.png` | Desktop | The editor's AnA pane with a refused offer |
| `screenshots/review-pane-refused-dark-desktop-1280.png` | Desktop, dark | The same, dark |
| `screenshots/review-offer-strip-light-desktop-1280.png` | Crop | One offer chip, for the disabled look |
| `screenshots/review-offer-strip-dark-desktop-1280.png` | Crop, dark | The same, dark |

**How they were taken, and what they cannot settle.** The repo's own capture
script for this folder family drives a real dev server through
`/api/auth/dev-login`, which this session may not start. So these are the real
components, serialized from jsdom and then rendered in real Chromium under the
**shipped** stylesheets — the same division of labour `visual-qa` uses, through
the same `built-css.mjs` and `playwright.mjs`. That gives a true cascade,
including the generated text ramp, in both themes.

It does **not** give the shell's responsive behaviour, which lives in React and
does not run in a static wrapper. At 768px my wrapper squeezed the column to
31px — an artifact of the wrapper, not the product. **No responsive claim in
this review rests on those captures, and no tablet or mobile screenshot is
filed, because filing one would imply a finding I did not make.** Responsive
behaviour at 768 and 375 is **not covered** by this review.

## Measured, not asserted

Computed in that cascade with `scripts/lib/wcag.mjs`:

| Element | Light | Dark | Needs |
|---|---|---|---|
| Refusal reason, conversation (12px, `--text-300`) | **5.21:1** | **6.82:1** | 4.5:1 |
| Refusal reason, pane (12px, `--text-300`) | **5.45:1** | **6.82:1** | 4.5:1 |
| Disabled offer label, conversation | 2.61:1 | 4.02:1 | exempt (inactive control) |
| Disabled offer label, pane | 2.08:1 | 2.63:1 | exempt (inactive control) |

Round 13's contrast change is therefore confirmed by measurement, not by the
test that pinned it — which asserted `style.color === 'var(--text-300)'` and
could not have failed on a real regression.

## Must fix

1. **A gate was failing.** `npm run ci:surface-text-ramp` exited 1: round 13's
   new `.ct-ref:disabled:hover{background:var(--bg-050)}` rule makes the
   generated text-ramp sheets stale, and the generator had not been re-run.
   *Fixed:* regenerated (`node scripts/design/generate-surface-text-ramp.mjs`);
   the gate now exits 0. Found only by the design-system lens actually running
   the gate.

## Should fix

2. **The pane offered an insert on a frozen document, and in document view.**
   It was drawn live and failed on the click with a toast naming a cause that,
   in document view, was not true. The conversation host withdraws the offer in
   the same state, and the sibling "Draft from sources" control disables with a
   reason — three treatments of one state. The verifier corrected the finding
   upward: not latent, because an approved PQ-pending model is admitted outside
   production, which is where QA walks happen. *Fixed:* the host's own refusals
   come first, in the product's words.
3. **The audit rail packed everything into one run-on sentence.** Decision,
   proposer qualifier, turn, model list, RULE 2 verdict and the quoted words —
   up to ~400 characters in a ~320px rail, with the one fact the round exists
   to surface sitting mid-sentence. *Fixed:* `describeAuditSource` is its own
   line under the decision.
4. **The rail said "written by" where the gate says "worked on".** `servedBy`
   is every model that served a call in the turn; it does not say which model
   wrote the decided words — which is why the gate refuses "written in part
   by", and why "written by" is plainly wrong on a deletion. Three lenses
   found this independently. *Fixed:* "served by", one phrase true of every
   case.
5. **A bulk decision silently dropped the changes whose turn does not verify.**
   The single-decision line says "not verified: …"; the bulk line kept only
   verified sources, so the rows an inspector most needs were invisible.
   *Fixed:* counted and named, with the unit ("2 changes from AnA turns"), and
   the gate's own verdict words.
6. **A row from before the words were checked read as verified.** Under DP-43
   "verified" was a bare existence lookup; round 10 made it "this turn holds
   these words" and began recording `servedBy`. The trail is append-only, so
   the old rows remain — including the very case round 10 was written for.
   Round 13 was the first code to put a verification claim on them. *Fixed:*
   the claim now also requires the model list that round 10 records.
7. **The rail dropped the turn's outcome.** The server records `stopped` /
   `failed`; the round's premise is that an unfinished answer must not go in,
   and the gate can only read that from live client state a reopened page does
   not have. *Fixed:* "That turn ended: stopped."
8. **The audit row had no absolute time.** Only `relTime`, which caps at
   "412 d ago" — on a rail that now prints as-of claims. The signatures and
   exports rails already use `GovernedTimestamp`; this was the Part 11 rail
   that did not. *Fixed.*
9. **`.cmt-when` was 2.11:1 in light mode** — an AA failure on every audit
   row's timestamp, pre-existing but on the row round 13 extended. The token
   gate's exception admits `--text-500` only for text that is "genuinely
   disabled or ornamental"; an event timestamp is neither. *Fixed:*
   `--text-400`, as the sibling `.cmt-role` already uses (4.71:1 / 4.86:1).
   The content-hash span's `opacity: 0.7` composited to 4.36:1, just under;
   *fixed* with a token instead of opacity.
10. **The refusal copy promised what it could not deliver.** Round 13 removed
    "Ask again with Thorough effort" for naming a control neither host draws —
    and replaced it with "Ask again to get a new answer", which in production
    also ends in a refusal. *Fixed:* "Ask again to get an answer with its own
    record", offered only where the record is what is missing, and "Ask again
    to get a complete answer" for an unfinished one.
11. **"The model … can't be checked" reported this page's limit as a fact about
    the record.** The server holds the record; this view was not told. *Fixed:*
    "This page has no record of which model wrote this answer."
12. **The toasts used words the product does not use** — "source view", "the
    document is locked" for "source mode" and "frozen" — and the failure toast
    did not name the section although the success toast now does. *Fixed* in
    both hosts.
13. **The gate's own disclosure overclaimed.** Its header said the decision
    record meant "what such a save let in is on the record". It does not: the
    row is written by this client after the edit, typed or plain-pasted text
    carries no mark and produces no row, and a failed POST leaves only a toast.
    *Fixed:* the header now names the doors that do not enforce the rule and
    states exactly what the record does give.
14. **`.ct-ref:disabled` also dimmed the "Ask again in a new conversation"
    offer**, whose only explanation was a `title` — invisible to keyboard and
    touch. Survivable while it looked live; not once the dimming became the
    only cue. *Fixed:* a visible reason in the same pattern.

## Could improve — not done, and why

- **The two hosts are different kinds of control.** The conversation's is a
  bordered chip that dims as a unit; the pane's is a borderless accent-coloured
  link (`.nda-open`, which the CSS itself calls "a link-shaped control") that
  dims to a faint 2.08:1 line. The screenshots show the difference plainly. The
  reason text beside it is more prominent than the control it explains. This
  predates round 13 and changing it means changing a shared class across the
  editor; it belongs in one pass over the whole GE-P-3 family.
- **One shared refusal-note component.** Six sibling notes are still
  11.5px/`--text-400`; round 13's two are 12px/`--text-300`. The design-system
  lens was explicit that round 13's values are the right ones and the siblings
  are what should move — in a follow-up, as one `RefusalNote`, which also ends
  the duplicated inline style.
- **In production every answer is refused**, so the same 3–4 line paragraph
  repeats under every turn in a reopened thread. Shortening it is a real
  improvement, but the shortest honest version is still a paragraph; the fix
  worth making is the routing decision, not the wording.
- **A disabled button leaves the tab order**, so its reason is not reachable by
  Tab. `aria-disabled` with the click guard both hosts already have would fix
  it — for the whole GE-P-3 family at once, not this one control.
- **No "already inserted" state**, and the full turn id, record hash and text
  hash are not reachable from the rail (truncated to 8 characters, no copy).
- **Admission does not survive a reload**: needs a server read of `servedBy`
  by turn id, which the current endpoint does not serve to a reviewer.

## What works well

- **The disabled state reads correctly.** In the mixed-list screenshot the one
  admitted offer is plainly live and the four refused ones are plainly not,
  with each reason directly under its own control at full strength. That is the
  GE-P-3 pattern working as intended.
- **Every refused offer has its own id and its own reason.** Verified in a real
  render: five offers, four distinct `ct-insert-refusal-*` ids, each
  `aria-describedby` resolving to its own sentence. The bug round 13 set out to
  fix is fixed.
- **Absent is told apart from empty** — "this page was not told" versus "the
  record names no model" — in the gate, and now in the rail too. That
  distinction is the honest-state rule applied exactly.
- **The refusals name the model and the rule, never a remedy the screen cannot
  carry out.** After this pass that is true of the rail as well.
- **The capture earned its place immediately.** Putting this state under the
  contrast gate for the first time found a real dark-mode AA failure at 3.02:1
  on a `role="alert"` sentence, where `lineage/palette.ts` claimed "AA" from a
  light-mode-only measurement. Fixed, and the gate now reports 0 of 266
  measured elements below AA in both themes.

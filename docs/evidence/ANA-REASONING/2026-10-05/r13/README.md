# A refused insert says only what is true, a pasted AnA suggestion keeps the turn it came from, and the rail shows the turn behind a decided change

Round 13 of the founder-directed AnA reasoning lane (founder, 2026-10-04:
*"Enhance the reasoning layer of ANA"*). Board row: "AnA's reasoning is checked
by an engine, and the check is what the reviewer sees and the record keeps"
(`docs/work-orders/README.md`).

It supports two launch rows:

- **D5, the Part 11 record.** AnA's words stay attributable through the paste
  door, and the audit rail shows what the decision row has recorded since
  round 10.
- **D2, the launch catalog.** Authoring's refused offers are accessible,
  legible and truthful.

It answers round 11's four-lens UI review of the insert gate (`../r11/`), and
then its own six-lens design review, which is filed separately under
`.design/ana-insert-gate/DESIGN_REVIEW.md` with the screenshots.

## What was wrong

**The refusal sent the person to a control that does not exist.** "Ask again
with Thorough effort" names an effort control neither host draws, and in
production no approved model has passed performance qualification, so asking
again ended in a second refusal.

**Refusals stated things the record does not say.** "Written in part by X"
asserts which words X wrote; the record says only that X served a call.
"This answer's record does not say which model wrote it" was shown for a
reopened conversation, whose record exists on the server — this view was only
not told.

**An answer that did not finish could be inserted.** A turn the person
stopped, whose stream failed, or whose answer was cut off was offered as a
finished one — including the "AnA is unreachable…" sentence of a failed turn.

**Refusals were hard to read, see or tell apart.** Every conversation turn
without a record id shared one element id, so in a reopened conversation every
refused button was described by the FIRST turn's reason. The refused button
kept the live look and hover. Its reason sat at 4.50:1, the bare minimum.

**A pasted AnA suggestion lost the turn it came from.** The paste door made it
the pasting person's and dropped its turn, so the decision filed AnA's words as
the person's own with no source — the defect the editor's own lineage comment
names. A pasted AnA *deletion* kept her name.

**The audit rail showed none of what the decision row keeps.** Since round 10
the row records the AnA turn a decided change came from, verified against the
words, and every model that served it with RULE 2's verdict.

## What changed

| Where | What |
|---|---|
| `editor/anaInsertGate.ts` | **Every refusal says only what this view knows.** No remedy the screen cannot carry out. "More than one model worked on this answer, including X", never "written in part by". "This page has no record of which model wrote this answer" (this view's limit) told apart from "This answer's record names no model" (a fact about the record). New **`answerUnfinished`** — a stop, a failed stream, a cut-short phase, a cancelled run, an answer cut off — refused first; an answer the round limit forced to an end is whole text. The `unfinished` flag is **required**, because a default of "it finished" is the one shape that silently admits a stopped answer. The header names the doors that do **not** enforce the rule, and states exactly what the decision record does and does not give. |
| `surfaces/ConversationThread.tsx` | One id per refused offer (`React.useId`, above the early returns). Carries whether the answer finished. Reason at `var(--text-300)`, 12px. The "Ask again in a new conversation" offer, which `.ct-ref:disabled` now dims, gets its reason as visible text instead of a `title`. |
| `editor/DocumentWorkbench.tsx` | The pane's offer gets the same id and contrast, and **the host's own refusals come first**: a frozen document and document view are refused with a reason instead of failing on the click. `EditorBridge.insert` takes the flag and re-checks it. The toasts name the section and use the product's words ("source mode", "frozen"). **The audit rail** gains `describeAuditSource` — the AnA turn each decided change came from, on its own line: verified or not and why, the models that **served** the turn with RULE 2's verdict, the turn's outcome when it did not answer, and, for a bulk row, how many changes came from AnA turns, how many were served by a model that may not write regulatory text, and how many name a turn that does not verify. A proposer is called verified only when the turn vouched for those words *and* the row carries the model list round 10 records. Every row now carries the instant it happened (`GovernedTimestamp`), not only "3 h ago". |
| `editor/suggestions.ts` | **The paste door keeps the turn.** A pasted AnA suggestion the host does not admit becomes the pasting person's but still names its turn, so the decision names it and the server verifies the words against it. A pasted AnA deletion is swapped as an insertion is. With track changes on, a paste or a drop keeps each pasted insertion's turn; typed text carries none. |
| `styles/app-v2.css`, `styles/surface-text-ramp.css` | A refused offer looks and hovers like the off control it is. The generated ramp sheets are regenerated for the new tinted-surface rule — without that, `ci:surface-text-ramp` fails. |
| `styles/surfaces-v2.css` | An audit row's timestamp moves from `--text-500` (2.11:1 light) to `--text-400` (4.71:1 / 4.86:1), the token its sibling `.cmt-role` already uses. |
| `lineage/palette.ts` | The Data Origins status colours become the canonical `--success` / `--warning` tokens. The hexes were measured for light mode only and read 2.5:1 and 3.02:1 in dark. |
| `scripts/visual-qa/dump-insert-gate.spec.tsx` (new) | **The refused state is now measured by a gate.** Round 13's own contrast test asserted `style.color === 'var(--text-300)'`, which restates the implementation and cannot fail on a real regression. This capture puts the state under the shipped stylesheets in real Chromium, where `visual-qa:contrast` and `visual-qa:a11y` measure it. |

## Decisions made here, as this lane's PM

- **A pasted AnA suggestion stays insertable as the person's, with its turn.**
  Refusing it would push the person to copy the rendered answer instead, which
  carries no mark and no turn, and the record would lose the origin entirely.
- **With track changes on, a moved AnA suggestion is the person's insertion
  naming AnA's turn**, as a move is in any tracked editor: the words keep their
  origin, the proposer is who placed them.
- **The rail says "served by", where the gate says "written by".** The gate
  speaks to an author about their own answer; the rail speaks to an inspector
  about a record, where the only supportable claim is that these models served
  that turn — and where "written by" would be plainly wrong on a deletion.
- **No effort control was added** to make the old "Thorough" remedy real. In
  production it would end in the PQ refusal. Whether drafting-surface turns
  should run on an approved model is a routing decision with a cost, and round
  7 narrowed it deliberately.

## Not done here

- **The server does not enforce the rule** at `PATCH /sections/:sectionId`, at
  `POST /docs/from-draft`, on a section revert, or in `EditorBridge.propose`
  (SEC-A-7, its own round). The gate's header now says so precisely.
- **One shared refusal-note component.** Six sibling notes are still
  11.5px/`--text-400`; round 13's two are the right values and the siblings are
  what should move, in one pass.
- **The two hosts remain different kinds of control** — a bordered chip and a
  link-shaped one. Changing that means changing a shared class across the
  editor.
- **A disabled button leaves the tab order**, so its reason is not reachable by
  Tab. `aria-disabled` would fix it for the whole GE-P-3 family at once.
- **Admission does not survive a reload**, and the full turn id and hashes are
  not reachable from the rail.
- **Responsive behaviour at 768 and 375 is not covered** by the review: the
  static capture harness does not run the shell's responsive logic, and the
  dev-server capture path is not available in this session.

## Proof

Filed beside this README:

- `red.txt` — round 13's tests against trunk's code, before any source change:
  27 of 71 fail, each on the defect it was written for.
- `green.txt` — every suite, green.
- `related.txt` — the full client suite on the merged tree, and what became of
  every red in it: the 4 wizard failures root-caused to a cross-lane merge and
  fixed here (test-only, with two product mutants proving the repair restores
  coverage rather than hiding a defect), and the 2 biostat failures shown to be
  a tree caught mid-merge, green at HEAD. It also corrects this round's own
  claim that the wizard "imports nothing round 13 touches", which is false as
  written: six of this round's files are in its graph, none rendered and none
  issuing a request.
- `mutants/` — every mutant and its verdict.
- `lint.txt` — no file gains a warning.
- `tsc.txt` — exit 0.
- `gates.txt` — the repo's own gates, including the one that was failing.
- `review.md` — the six-lens design review's findings and what was done with
  each; the review itself, with screenshots, is at
  `.design/ana-insert-gate/DESIGN_REVIEW.md`.

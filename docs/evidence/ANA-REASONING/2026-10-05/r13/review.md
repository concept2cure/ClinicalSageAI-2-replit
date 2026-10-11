# Round 13's own six-lens design review, and what was done with every finding

Round 13 began as the answer to round 11's four-lens UI review. Once it was
built and committed (`8c75defca`), it was put through a review of its own:
six specialist lenses in parallel, each finding then handed to an adversarial
verifier that tried to refute it from source. 23 agents in all
(`wf_ed3c9faf-d8d`).

The review itself, with the screenshots and the measured contrast table, is at
`.design/ana-insert-gate/DESIGN_REVIEW.md`. This file is the disposition: every
finding, its verdict, and what happened to it.

## The lenses

`design-reviewer` · `a11y-auditor` · `part11-ux-auditor` · `microcopy-reviewer`
· `motion-auditor` · `design-system-auditor`.

**`motion-auditor` found nothing, and that is a real result, not a skipped
lens.** The round adds no animation, and no `transition` or `animation` rule
reaches either control; I confirmed `transition-duration: 0s` on both in
Chromium.

Four lenses had no shell in their sandbox and said so plainly rather than
implying coverage they did not have. Two did run the gates, and that is what
caught the failing one.

## What the review found that the round had got wrong

| # | Finding | Verdict | Done |
|---|---|---|---|
| 1 | **`ci:surface-text-ramp` was failing.** The new `.ct-ref:disabled:hover{background:var(--bg-050)}` rule makes the generated ramp sheets stale, and the commit did not regenerate them. | must-fix, confirmed by running it (exit 1) | Regenerated; the gate exits 0. The dead `.ct-ref:disabled:hover .ct-ref-go` rule it also flagged (that element is never disabled) is deleted. |
| 2 | **The pane offered an insert on a frozen document and in document view**, failing on the click with a toast whose named cause was untrue in document view. | should-fix, confirmed — and the verifier corrected it *upward*: not latent, because an approved PQ-pending model is admitted outside production, which is where QA walks happen | The host's own refusals come first, in the product's words. Two tests; two mutants. |
| 3 | **The rail packed everything into one run-on sentence**, with the fact the round exists to surface sitting mid-clause. | should-fix, confirmed | `describeAuditSource` is its own line under the decision. |
| 4 | **The rail said "written by"** where the gate had just been rewritten to say "worked on", because `servedBy` names the models that *served the turn*, not who wrote the words — and is plainly wrong on a deletion. | should-fix, confirmed by three lenses independently | "Served by", one phrase true of every case, with the reason written down. |
| 5 | **A bulk decision silently dropped the changes whose turn does not verify** — the rows an inspector most needs. | should-fix, confirmed | Counted and named, with the unit and the gate's own verdict words. |
| 6 | **A row from before the words were checked read as "verified".** Under DP-43 `verified` was a bare existence lookup; round 10 made it "this turn holds these words" and began recording `servedBy`. The trail is append-only, so those rows remain — including the case round 10 was written for. | should-fix, confirmed (one half of the finding refuted: absent-vs-empty `servedBy` was already right) | The claim now also requires the model list round 10 records. |
| 7 | **The rail dropped the turn's outcome** (`stopped` / `failed`), which the server records and the gate cannot know on a reopened page. | should-fix, confirmed | "That turn ended: stopped." |
| 8 | **The audit row had no absolute time** — only `relTime`, capping at "412 d ago", on a rail that now prints as-of claims. | should-fix, confirmed; the verifier corrected the proposed fix (a `title` is not keyboard-reachable) and named the canonical component | `GovernedTimestamp`, which the signatures and exports rails already use. |
| 9 | **`.cmt-when` is 2.11:1 in light mode** — an AA failure on every audit row's timestamp, pre-existing, on the row this round extended. | should-fix, confirmed; the token gate's own exception admits `--text-500` only for "genuinely disabled or ornamental" text | `--text-400`, the sibling's token: 4.71:1 / 4.86:1. The hash span's `opacity: .7` (4.36:1) becomes a token too. |
| 10 | **The refusal copy still promised what it could not deliver.** The round removed "Ask again with Thorough effort" and replaced it with "Ask again to get a new answer" — which in production also ends in a refusal. | should-fix | "Ask again to get an answer with its own record", offered only where the record is what is missing; "Ask again to get a complete answer" for an unfinished one. |
| 11 | **"The model … can't be checked"** reported this page's limit as a fact about the record. | should-fix | "This page has no record of which model wrote this answer." |
| 12 | **The toasts used words the product does not use** ("source view", "the document is locked") and the failure toast did not name the section. | should-fix | Fixed in both hosts, matching the sibling citation toast. |
| 13 | **The gate's own disclosure overclaimed**: it said the decision record meant "what such a save let in is on the record". | could-improve, and the overclaim is the kind this lane exists to stop | The header now names the doors that do not enforce the rule and states exactly what the record does give. |
| 14 | **`.ct-ref:disabled` also dims the "Ask again in a new conversation" offer**, whose only explanation was a `title`. | could-improve | A visible reason in the same pattern. |
| 15 | **No gate measured the refused state.** The round's own contrast test asserts `style.color === 'var(--text-300)'` — it restates the implementation and cannot fail on a real regression. | could-improve, and correct | A capture spec puts the state under `visual-qa:contrast` and `visual-qa:a11y`. It immediately found a real dark-mode AA failure (below). |

## What the capture found the moment it existed

`visual-qa:contrast` over the new capture reported **3.02:1** on the
`role="alert"` sentence "Attribution could not be read, so none is shown."
`lineage/palette.ts` set that colour as a hex and its own header called it
"AA against --bg-000" — a measurement taken in light mode only, stated without
that qualifier. In dark mode the two status hexes land at 3.02:1 and ~2.5:1.
They are now the canonical `--success` / `--warning` tokens, which have
measured values for both themes. The gate goes from 1 below AA to 0 of 266
measured elements, in both themes.

No capture had ever included this surface, so no gate could have seen it.

## Findings the verifiers refuted

Seven. All but one for the same reason, and it is worth recording honestly:
**the verification phase ran while these fixes were being made**, so several
verifiers read a working tree in which the reported defect was already gone,
and refuted the finding as "not in the code under review". That is weaker
evidence than a refutation on the merits — but it is independent confirmation
that the fix landed, since each verifier quoted the new code back.

The one refutation on the merits: the reviewer that reported absent-vs-empty
`servedBy` as a single defect was half wrong — the gate and the rail already
told them apart; only the "verified" claim needed tightening (finding 6).

## What the review did not refute

- **The direction.** Every lens agreed the GE-P-3 pattern — disabled, not
  hidden, with the reason as visible text the control is described by — is the
  right one, and that round 13's token and size choices are the correct ones,
  with the *siblings* being what should move.
- **The id fix.** Verified in a real render: five offers, four distinct ids,
  each `aria-describedby` resolving to its own sentence.
- **The paste door.** The Part 11 lens traced it from `reattributePasted`
  through the decision request to `resolveTurnRecordSources` and found the row
  that gets written truthful about who proposed the words and where they came
  from.

## Still open, and recorded as open

The server does not enforce the governed-write rule at `PATCH /sections/:id`,
at `from-draft`, on a revert, or in `EditorBridge.propose` (SEC-A-7, its own
round). One shared refusal-note component, the two hosts' different control
shapes, `aria-disabled` for the whole GE-P-3 family, admission surviving a
reload, and the full turn id and hashes on the rail are all recorded in the
README and the design review as not done.

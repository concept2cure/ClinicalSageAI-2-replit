# A turn about a Module 2 summary is high-stakes because of what is open

Round 7 of the founder-directed AnA reasoning lane (founder, 2026-10-04:
*"Enhance the reasoning layer of ANA"*). Board row: "AnA's reasoning is checked
by an engine…" (`docs/work-orders/README.md`). This round closes MC-RL-3 (high)
from round 1's map (`../../2026-10-04/map-findings.md`), narrowed as an
adversarial review asked (`review.md`).

## What was wrong

The live turn's risk tier came from the message's words alone. Two things
raised it:

- the intent lens, a keyword vote in which "check" counts as audit;
- the governed-draft phrasing.

The open section played no part, though the route holds it. So:

- **"can you check my calendar" was high-stakes.** It got the flagship model,
  extended thinking and 'high' effort.
- **"What SAE rate does this section report for the 10 mg arm?" was not**,
  even with the Summary of Clinical Safety (2.7.4) open in the editor. It was
  served on the standard tier, by a model the registry does not approve for
  high-risk work (`approved-models.ts`). There was no extended thinking on a
  short question, and effort was 'medium'.

The tier also decides three other things, and every one followed the wording:

- which models the gateway may serve the turn with (`model-governance.ts`);
- the thinking floor (`reasoning.ts`);
- the effort floor (round 4's `resolveTurnApiEffort`).

The gateway ledger's `risk_tier` column records it, so QA reading the ledger
saw safety-section work recorded as 'medium'.

## What changed

| Where | What |
|---|---|
| `server/services/kernel-router.ts` | **`HIGH_STAKES_SECTION_ROOTS`** names the sections that raise the tier:<br>• the ICH M4 Module 2 overviews and summaries (2.3 quality, 2.4 and 2.6 nonclinical, 2.5 and 2.7 clinical);<br>• the integrated analyses of safety and efficacy (5.3.5.3).<br>These are harmonised codes, the same in every region.<br>**`highStakesSectionOf`** reads the open section only when it is a string of at most 64 characters that normalises to a CTD code (`normalizeCtdCode`). A code counts when it is at or under a listed root, at a segment boundary: "2.30" is not under "2.3".<br>**`openSectionCode`** is a new optional input. The rule only ever raises the tier, and the plan's rationale says why. The task type, strategy, temperature and token budget are unchanged. The rule sits in a helper, so `planKernelExecution`'s complexity stays at trunk's. |
| `server/routes/ana-ri/stream.ts` | The route hands the kernel the open section, `sectionCode` from the authoring context. One line is added inside the call. |

## The product decision, and what it costs

As product manager for drafting, I list the sections whose text a reviewer
reads as the application's own account of its data. A wrong figure there costs
more than the model does. The decision is reversible: it is one list.

- **What a listed section costs.** Every turn with one open runs as a
  high-risk turn: on a model approved for high-risk work, with extended
  thinking, at 'high' effort on Balanced and Thorough. That includes a short
  "thanks".
- **Fast.** It stays fast, with no extended thinking and 'low' effort, but it
  is served on an approved model.
- **Fails closed.** A deployment with no model approved for high-risk work
  refuses these turns instead of serving them on a lesser model. A person's
  pinned model that is not approved is refused there too, as it already is on
  any high-risk turn (`MODEL_OVERRIDE_REFUSED`).
- **A risk to watch.** The flagship's classifiers include a biology category,
  and a decline after text has streamed is final (`gateway.ts`). A
  nonclinical toxicology summary (2.4, 2.6) could end in a decline where the
  standard model would have answered. After landing, the decline rate for
  listed sections should be read from the ledger.

**Deliberately not listed:**

- **Module 1.** It is regional: a US 1.14 is labeling, but a US 1.3.1 is
  contact details where an EU 1.3.1 is the SmPC. Labeling needs a mapping by
  region, which is a decision for the founder or an RA lead.
- **A sealed record (APPROVED or FROZEN).** It cannot take AnA's text: the
  editor and the server write gate refuse it (`document-lock.ts`). Raising its
  tier would buy cost, not control. Founder decision.
- **Titles, such as a CSR's ICH E3 §12 "Safety Evaluation".** Detecting them
  is a keyword vote, the class of signal this finding is about.

## Proof

- **Red first.** `red.txt` runs the round's tests against trunk `89238d8d1`.
  9 of 24 fail: the six listed sections stay 'medium', the overlay check
  fails, and the route serves 2.7.4 at 'medium'. Each test that passes there
  is a negative control, and its red is its mutant:
  - an unlisted section, a regional code or a boundary code;
  - a list, a number, an object or an overlong string;
  - never lowering a tier;
  - changing nothing but the tier;
  - the tool-cap pin;
  - Module 3 on the route.
- **Green.** `green.txt`: 740 tests in 64 files. That is round 7's two
  suites, the kernel router's suite, every gateway suite and every
  stream-route suite.
- **Related suites.** `related.txt`: 6,362 tests passing. The three failing
  files are round 6's three, none of them this round's (board items 24
  and 25, and the environmental ESG suite).
- **Mutants.** `mutants/summary.txt`: 11 of 11 killed on the first run.
- **Lint.** `lint.txt`: no touched file gains a warning. `kernel-router.ts`
  keeps trunk's one warning, at the same complexity (29).
- **Types.** `tsc.txt`: the whole-tree typecheck.

## Edits inside another lane's window

`stream.ts` is inside the window of ANA-AGENTS F1 (`ab2693c56`, 01:39 today).
The edit is one added line, inside a call whose lines are blamed 2026-09-22
and 2026-09-23. `kernel-router.ts` is cold: its last commit is 2026-09-23.

## Not done here

- **Coverage.** Only turns that carry the authoring context are raised: the
  document editor's, and the conversation's while an editor is open. The eCTD
  co-author pane sends `module_context`, which the route does not read; the
  RBM pane and the shell rail send no section.
- **The PQ clause still does not apply.** The task type stays
  `regulatory_review`, and every registry entry's PQ is pending.
- **The control for model text entering a section.** "Insert into … as tracked
  suggestion" carries no check of which model wrote the text (GRD-missed in
  round 1's map). That is the control this routing pairs with, and it is next.
- **Handed on.** Board item 26: the FDA NDA Module 1 template seed misplaces
  patent information and the environmental assessment.

# The 510(k) asks what the device is compared to, before asking its name

Sixth slice of the founder's directive of 2026-10-12, and the one two earlier
evidence files named as next: the fact the marking rules were missing.

## What was there

`predicate_info` opened with three **required** text boxes — the predicate's
name, its 510(k) number and its manufacturer — and the interview never asked
the question they presuppose: whether there is a predicate at all.

A programme with none had to invent one to get past the question. The record
would then carry a predicate that does not exist, in a submission that is not a
510(k), and the interview would have been the thing that made it up.

The gap reached past this flow. The marking rules could say *"you have named a
predicate, so a De Novo needs a basis"*, but not the stronger and more useful
thing — *"you have said there is no predicate, so a 510(k) is not the route"* —
because **no interview could state it**. An empty text box is an unanswered
question, and the catalogue said so in its own words: *a rule nothing can reach
is worse than no rule, because it reads as a check that passes.*

## What this adds

`shared/regulatory/predicate-positions.ts` — six positions, each with what it
commits the submission to and the regulation or guidance that recognises it.
Unlike the route positions these are not registry filings: they are the
strategies FDA's own 510(k) programme recognises.

| Position | What it commits the submission to |
|---|---|
| One predicate | equivalence to a single device with the same intended use; every technological difference bridged to that one device |
| A primary predicate and additional predicates | each further predicate must itself have the same intended use; it widens what you may rely on *and* what FDA will compare |
| **A split predicate** | **FDA does not accept this.** The 2014 guidance states it is not a permissible basis, so naming one invites a Refuse to Accept or an NSE |
| A reference device only | supports a method or a standard; it is not a basis for equivalence, so a predicate is still to be named |
| There is no legally marketed device to compare to | the first of the two conditions for a De Novo request |
| FDA has already found the device NSE | the second condition; the 510(k) is closed and the letter is part of the De Novo's record |

The split predicate is **offered**, not hidden, because sponsors consider it: a
position that says plainly what taking it costs is worth more than its absence,
which teaches nobody anything. Choosing it records a critical issue citing the
guidance. Choosing *no predicate* or *NSE received* records a critical issue
that says plainly this is not a 510(k) and names the route that is.

**The question is asked first**, between the device materials and the predicate
details, and the three required boxes are no longer asked of a programme that
has just said there is nothing to name — so it can get through the interview
without inventing a predicate, which is the defect this fixes.

**The fact, and the rule it unlocks.** `ProgrammeFacts.predicate` is
`'named' | 'none' | 'nse'` — a statement a sponsor has made, never the absence
of an answer. A reference device resolves to **nothing**: it says a predicate
was not claimed, not that none exists. A stated *no predicate* beats a name
left in an earlier box, because the newer statement is the answer.

The rule it unlocks closes the three 510(k) positions outright
(`inapplicable`), with the two reasons kept apart — nothing to compare to, or
an NSE already received — and the authority for each
(FD&C Act 513(i), 513(f)(2)(A); 21 CFR 807.100(b), 860.220(a)).

## Two gates caught the order of work

Adding the fact before the question existed failed **two** gates, both written
in earlier slices today, and both for the right reason:

- *every fact field is still a field some flow asks* — `predicate_strategy` was
  read by nothing;
- *every rule fires on some fact a flow can state* — the new rule could not
  fire.

They are the reason this slice contains a question and not only a rule.

## Verification

- `predicate-positions.test.ts` (10): every position's consequence and
  authority; one predicate kept apart from several; the split predicate saying
  FDA does not accept it; a reference device kept apart from a predicate; the
  two De Novo conditions cited to their own subsections; and what the answers
  state — including that silence is not "there is none" and that a reference
  device states nothing.
- `predicate-strategy.test.ts` (7), driving the **real 510(k) flow**: the
  question is asked before the name, number and manufacturer; it offers the
  governed positions with an escape hatch; a split predicate and a missing
  predicate are each recorded at critical with their citation; the predicate
  fields are not asked of a programme that has none and still are of one that
  claims one; and such a programme can get past `predicate_info` without
  inventing anything.
- `pathway-availability.test.ts` (+4): the 510(k) positions closed with the two
  reasons kept apart, the De Novo left alone, and nothing said where no
  predicate has been named and none ruled out.
- `mutations.txt`: **10 mutations, all red** — the split predicate offered as
  if FDA accepted it, a reference device read as a predicate, silence read as
  "there is none", a name overriding the sponsor's statement, the 510(k) not
  marked, the state not read from the strategy answer, the question asked after
  the details again, the predicate's name demanded of a programme that has
  none, and each of the two critical issues passing unrecorded.
  One mutation first survived as written — a duplicate `condition` key, where
  the later one wins in JavaScript — and is red once the check's own condition
  is the one that cannot match. (The same trap as the previous slice's
  survivor; both are recorded rather than quietly re-run.)
- `green.txt`: **36 files, 642 tests** across the question engine, both
  catalogues and `tests/ana-intelligence`; `ci:typecheck:no-regression` 0
  errors; the per-change lint ratchet reports no file gained a warning.

## What is still open

- **The predicate strategy is asked in the 510(k) interview only.**
  `project-setup`'s `predicate_device` is still a bare text box, gated on the
  US 510(k) route; it names a predicate but cannot say there is none. The
  governed positions are there for it when that question is next touched.
- Device and IVD **classification** — the US class is a field, the IVDR class
  exists nowhere, so the EU IVD routes cannot be narrowed or marked by it.
- **Designation** is the next biotech question, and it needs a consolidation
  first: `shared/regulatory/special-designations.ts` holds the governed
  taxonomy, while `server/services/global-ri/special-designations.ts` and
  `server/services/ana/special-designations.ts` hold an eligibility engine and
  an AnA advisory with their own vocabularies. A question drawn from any one of
  them without the others would be a fourth list. The taxonomy also tags the
  FDA expedited programmes `segment: 'drug'`, which excludes a biologic from
  orphan, fast track, breakthrough and priority review — that needs deciding
  before a question draws on it.
- Paediatric plan and comparability, where `MODALITY_FRAME` already holds a
  per-modality comparability statement to draw on.

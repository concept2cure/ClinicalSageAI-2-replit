# The agency question is positions, and the region it names marks the routes

Third slice of the founder's directive of 2026-10-12. The first gave a question
its shape (positions, and one the person writes themselves), the second gave the
pathway question its content and marked the positions a programme's own answers
contradict. This one fixes the question that decides what any of that means.

## The defect

`primary_regulatory_agency` is the answer the rest of the platform keys on. The
region it names decides the Module 1 backbone, the validation profile, the
submission gateway, the dossier standard, and which filings exist at all.

The engine declared it as an `agency_select`. **Nothing ever implemented that
field type.** `AnaQuestionCard` draws a field as positions only for
`select | radio | multi_select | checkbox | yes_no`, so `agency_select` — and
`country_select` with it — fell through to `<input type="text">`. The one answer
everything downstream depends on reached the person as typed prose, and the
validator could not check it either: with no options there is no option check.

Beside it, `additional_agencies` carried a hand-written list of nine agencies in
a fourth region vocabulary (`ema`, `health_canada`, `who`), missing Swissmedic,
HSA and MFDS, and saying nothing about what filing with any of them commits the
programme to.

## What this adds

`shared/regulatory/agency-positions.ts` is **not a new list of agencies**. The
platform already holds twelve regions in two governed modules, and this is the
first thing that makes them agree:

| Module | What it holds |
|---|---|
| `region-profiles.ts` | the agency, its full name, the country, the dossier standard — what a person reads |
| `region-identity.ts` | the canonical code, the four vocabularies the subsystems speak, and whether this platform holds that region's Module 1 checklist (**7 of 12**) and its own validation rules (**6 of 12**) |

- **The value is the canonical region code**, because that is what the platform
  keys on. The label is the profile's (`FDA — United States`,
  `Health Canada — Canada`).
- **What filing there commits the programme to is derived from those two rows,
  and includes what AnA does *not* hold.** A sponsor choosing Singapore is told,
  before they choose: *"Health Sciences Authority. Submissions are ACTD. AnA
  holds no Module 1 checklist for this agency and has no region-specific
  validation rules for it, so anything drafted for it is unvalidated here."*
  That is true of five of the twelve and was nowhere said. Because it is read
  off the governed row rather than written per agency, a region the platform
  gains capability for cannot keep saying the old thing.
- **WHO prequalification is kept and labelled**, not dropped: it is a real
  target for some sponsors, it is not a national filing, and the option says so
  rather than sitting among the twelve as though it were one.
- Both agency questions gained the escape hatch, so an agency AnA does not hold
  can still be named in the person's own words.

### The region becomes a fact, and one rule covers every route

`ProgrammeFacts` gains `regions` — every region the project named, primary and
additional together, resolved through `canonicalRegionOf` so all four of the
platform's vocabularies (and the nine values the old list used) still read.

One caution rule then covers **every position the catalogue annotates**, because
it is derived from the registry entry's own region rather than written per
filing: a position whose region is not among the agencies named is
`inapplicable`, with the authority behind the position itself as the citation —
what makes a 510(k) FDA's and an MDR route the EU's is the statute behind it,
and there is no separate citation to give.

It is **first** among the rules, because a filing is made to a regulator or it
is not made at all: a Class III device offered a 510(k) in a project that named
only EMA is told about the regulator, not about the class. And the reason is
actionable, which is the directive's word: *"If you are filing there as well,
name FDA among the agencies and this route is open."*

## What this deliberately does not do

- **`country_select` stays a text input.** The platform holds a governed agency
  vocabulary and no governed country one, and inventing a 249-entry list in this
  slice would be a second source of truth for something the platform may already
  hold elsewhere. Three fields are affected (`headquarters_country` and two
  others). A test pins the gap: if a governed country list lands, those fields
  must draw it.
- **The pathway question is still asked for the US only.** `project-setup` calls
  `pathwayOptions({ region: 'US' })` whatever agency was named, so a European
  device programme is offered FDA routes and now sees every one of them marked
  inapplicable — correct, but the wrong question. Keying the list to the region
  the project named is the next slice; the fact it needs landed here.

## Verification

- `shared/regulatory/__tests__/agency-positions.test.ts` (8): the two governed
  modules agree in both directions on the twelve; the answer is the keyable
  code; an underscored registry name is read aloud; the dossier standard is the
  agency's own (eCTD, CTD and ACTD all appear); the Module 1 and validation
  claims match the governed row **for all twelve**, with both branches shown
  non-vacuous (7 hold a checklist, 5 do not); and a value that names no region
  resolves to nothing rather than a guess.
- `pathway-availability.test.ts` (+5, 20 total): the region rule closes a route
  to a regulator nobody named and says how to open it; leaves every route to one
  they did name; names every agency given, not just the first; comes before the
  class marks; and says nothing when no agency has been named.
- `cautioned-positions.test.ts` (+6, 18 total): the region fact reads both
  agency fields and both vocabularies; **every `agency_select` field in every
  registered flow offers the governed positions and an escape hatch** — the
  invariant that stops a new flow reintroducing a text box; `additional_agencies`
  offers the governed twelve plus the labelled WHO entry, including the three
  the old list omitted; the country fields are pinned as still bare; and, at the
  engine, a route to an unnamed regulator is marked while one named among the
  additional agencies is not.
- `anaQuestionCard.test.tsx` (+2, 11 total): an agency draws as positions
  carrying the capability statement and answers with the code; a field of that
  family with no positions still draws the input, which is what country does
  today.
- `mutations.txt`: **10 mutations, all red** — the agency question as a text box
  again, a route to an unnamed regulator unmarked, the region read from the
  primary agency alone, a value that names no region guessed at, the flow
  writing its own agency list again, every agency claimed to hold a Module 1
  checklist, the answer carrying the label instead of the code, the wrong
  regulator reported after the class instead of before, the escape hatch
  removed, and every agency assumed to take eCTD.
  One mutation was first written as a comment-only edit — a no-op, which
  survived because it changed nothing. Rewritten to actually move the rule block
  to the end of `CAUTION_RULES`, it is red on the ordering case.
- `green.txt`: the question engine, both governed catalogues and the wider
  `tests/ana-intelligence` tier — **30 files, 574 tests**, which includes the
  structural probe over every flow's node graph (the check that the earlier
  node split did not break it) — plus the 11 client suites that mount the card,
  89 tests.
- `ci:typecheck:no-regression` (0 errors), `ci:undefined-css-classes`,
  `ci:surface-text-ramp`, `ci:design-system` all pass.

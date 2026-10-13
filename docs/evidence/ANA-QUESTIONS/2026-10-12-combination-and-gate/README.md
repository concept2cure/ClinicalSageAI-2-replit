# A combination product is not offered four routes in silence, and the gate can see a catalogue

Fifth repair from the review in `../2026-10-12-review/`. Two findings, both of
them mine, both from the slices that landed earlier today.

## A combination product was offered the EU medicines routes, unmarked

The US side of the medicines question offers a drug-device combination
**nothing**, and says why in the modality frame's own words: the lead centre is
assigned by primary mode of action under 21 CFR Part 3. That was built with the
resolver's empty-list branch.

The EU side offers all four medicines routes, because the frame holds no
European equivalent to narrow them — which is the asymmetry the medicines slice
declared and accepted. What it did not do was mark them. So a combination
product was offered an Article 8(3) marketing authorisation, a conditional MA,
a biosimilar application and a generic DCP with nothing said, while the same
product was honestly refused in the US.

Each of the four is now `needs_basis`, with the frame's sentence as the reason
and 21 CFR Part 3 plus the EU's own division of a combination product (MDR Art
1(8)–(9), Directive 2001/83/EC Art 1(2)) as the authority. The device and IVD
routes are left alone — which is the other half of the question a combination
product has to answer.

## The gate could not see a question whose positions come from a catalogue

`every-offered-value-is-read.test.ts` walks every option of every fact field
and refuses a value the engine does not read. It walked the **flow
definitions** — and a field whose positions come from a catalogue carries no
static options, so every such field was skipped.

Including `ivdr_class`, which the same batch had just added to the fact fields.
The gate was extended to cover a field it had been made unable to see.

It now resolves each catalogue-sourced field through the resolver, once per
region the catalogue holds, and scans the values a person is actually offered —
the four IVDR classes, the US device routes, the EU MDR class routes. A case
holds that it sees them, so the skip cannot come back silently.

## Verification

- `pathway-availability.test.ts` (+2): the four EU medicines routes marked for
  a combination product with the frame's own reason, and the device and IVD
  routes left alone.
- `every-offered-value-is-read.test.ts` (+1): the catalogue-sourced fields are
  scanned, with the IVDR classes and both regions' route values named.
- `mutations.txt`: **3 mutations, all red** — the combination product offered
  the routes unmarked, the reason written here instead of read from the frame,
  and the gate skipping catalogue-sourced fields. A fourth was written against
  the wrong anchor and reported as missing rather than passing, which is the
  behaviour the driver is built for; it was re-run with the right one.
- Green: **721 tests** across the question engine, both catalogues and
  `tests/ana-intelligence`; `ci:typecheck:no-regression` 0 errors; the
  per-change lint ratchet clean.

## Deferred, with its reason

The review also found that **hiding the MDR class from a diagnostics programme
made the `na` answer unreachable** — and the notified-body question is gated on
`eu_mdr_class neq 'na'`, so a diagnostics programme is now always asked for a
notified body, including a Class A assay that self-declares and needs none.

The honest fix needs two conditions in one gate: *an EU filing is planned* and
*the class requires a notified body* (which `IVDR_CONFORMITY_ROUTES` already
states per class). `FieldPredicate` holds one condition, so this needs either an
`or`/`and` in the predicate language or a derived answer the engine computes —
both design decisions rather than repairs, and both wider than this finding.
Recorded rather than bodged: a question asked where it does not apply is a
smaller wrong than a predicate language grown in the dark.

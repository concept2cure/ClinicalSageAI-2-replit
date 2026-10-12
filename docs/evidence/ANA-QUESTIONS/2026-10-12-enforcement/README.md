# A question that offers positions enforces them, and one that offers none does not take a position

Fourth repair from the review in `../2026-10-12-review/`. Its engine lens found
that the catalogue work had built the offer side carefully and left the
enforcement side with two holes — so the record could carry an ungoverned value
as though AnA had offered it.

## The two holes

**1. The option check ran for two field types.**

```ts
if (field.type === 'select' || field.type === 'radio') {
  if (field.options && typeof value === 'string') { … }
}
```

`agency_select` is neither. So the question that offers the twelve governed
agencies — the one answer the platform keys the Module 1 backbone, the
validation profile, the gateway and, since this morning, the routes it offers
on — **accepted anything**. A caller could store *"the Belgian competent
authority"* where the question asked for a region, and `canonicalRegionOf`
would then read nothing from it.

The check now runs wherever a field **has options**, whatever its type, with
the multi-value branch doing the same for each item.

**2. A question with no positions had nothing to check against.**

Where the governed catalogue holds nothing for a programme — AnA has no routes
to market for PMDA — the resolver draws no positions and says why, and the
person answers in their own words. The card sends those under
`OTHER_POSITION`, which the engine keeps apart from the positions AnA offered.
But the validator saw a field with no options and let **every string** pass, so
a tool or an API caller could send prose that the record would carry as a
governed position.

Such a field now takes `OTHER_POSITION` and nothing else, and says so: *"AnA
holds no positions for this programme, so she cannot record an answer as one of
hers. Describe it in your own words and she will record it as yours."*

## And one thing she was saying that was not true

An agency named in the person's own words leaves `primaryRegion` unset — AnA
cannot place it. The route question then said *"No primary agency has been named
yet"*, to a person who had just named one.

It now says what is so: *"AnA does not hold the agency you named, so she cannot
offer its routes — these are FDA's. If you are filing elsewhere, describe the
route you are taking and she will record it in your words."* The fallback is
unchanged and still disclosed; only the false sentence is gone.

## Verification

- `a-question-that-offers-positions-enforces-them.test.ts` (7): the agency
  question refuses an agency it does not offer, takes one it does, and takes an
  agency AnA does not hold in the person's own words — with the words landing
  in `ownWords`, not among the positions; the route question no longer claims
  no agency was named; a question with no positions refuses a position and
  takes the person's words; and a question that does hold positions still takes
  one.
- `mutations.txt`: **4 mutations, all red** — the option check narrowed to
  select and radio again, the no-positions field taking any string, the
  question claiming no agency was named, and the own-words agency going
  unnoticed.
- Green: **718 tests** across the question engine, both catalogues and
  `tests/ana-intelligence`; **1107** across `server/services/cmc` and the
  interview-tool suite, which drive whole flows to completion and would have
  caught a validator that newly refuses a legitimate answer;
  `ci:typecheck:no-regression` 0 errors; the per-change lint ratchet clean.

## Declared behaviour change

A stored free-text answer in a field that now enforces its options — an agency
typed as prose before today — is refused the next time that question is
submitted, with the escape hatch as the way through. That is the point: a value
nothing can key is not an answer to a governed question.

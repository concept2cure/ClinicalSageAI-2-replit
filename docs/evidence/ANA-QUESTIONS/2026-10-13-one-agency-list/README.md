# One agency list, and six agencies a stability programme could not name

**Row:** D4 / *zero duplication*
**Finding acted on:** `2026-10-12-review/README.md` — *"three uncanonical region
lists remain inside other flows."*

## What the sweep actually found

Two of the three were **prose** — a placeholder reading `e.g., FDA, EMA, PMDA`
and a guidance sentence naming the agencies that accept the CTD. Neither is a
list anything reads, and rewriting them would be churn.

The third was real: `stability_study.zone_regulatory_authorities` offered its
own eight options, six of which were agencies:

```
fda · ema · pmda · health_canada · tga · anvisa · asean · who_pq
```

AnA configures **twelve** agencies (`shared/regulatory/agency-positions.ts`,
derived from `REGION_PROFILES` and `REGION_IDENTITY` so that a region the
platform gains or loses capability for cannot keep saying the old thing). So a
stability programme filing with the **MHRA, the NMPA, Swissmedic, the CDSCO,
the MFDS or the HSA** could not say so — though the platform holds every one of
their Module 1 requirements — and the escape hatch would have taken the answer
as prose.

**And nothing read the field at all.** `AGENCY_FIELDS` named
`primary_regulatory_agency` and `additional_agencies`; a stability programme
named its authorities and the platform learned no region from them.

One thing was NOT wrong, and it matters for how the fix was written: the
lowercase ids resolved. `canonicalRegionOf` is tolerant of an agency name, so
`'fda' → 'US'` and `'health_canada' → 'CA'`. Nothing was silently misread —
what was missing was the other six.

## What now happens

- The field draws `agencyOptions()`: the twelve, with what filing with each
  commits the programme to, in the governed order.
- Plus the two targets that are **not national filings**, kept because they are
  real targets for a stability package, and each saying so in its own label:
  *"ASEAN — the ACTD dossier format, not one authority"* and *"WHO
  Prequalification — a UN procurement assessment, not a national filing"*. Both
  are declared non-facts with their reasons, so the value gate accepts them and
  no rule fires on them.
- `zone_regulatory_authorities` joins `AGENCY_FIELDS`, so the answer is read as
  regions like every other agency answer.
- **Answers already stored keep working.** The option values are canonical
  region codes now; a session answered before this holds `'fda'`, and the
  tolerant reader is exactly why no migration of stored answers is needed. A
  test pins that, because "it happens to work" is not a property until
  something checks it.

## The gate

`__tests__/one-agency-list.test.ts` — and it is a sweep, not three assertions
about this field:

| Gate | Holds |
|---|---|
| `are asked by more than one flow, so this is worth checking` | refuses to be vacuous |
| `offer the twelve the platform configures, and never a shorter list of its own` | **every** agency question in **every** flow, against the governed twelve |
| `offer nothing beyond them that is not declared a non-region, with its reason` | the other direction |
| `says in the option itself where a target is not a national filing` | a person must not have to infer that picking ASEAN names no regulator |
| `reads the stability interview’s authorities as regions, which it did not before` | the fact reader |
| `still reads the answers already stored under the old ids` | `'fda'`, `'health_canada'` |
| `learns no region from a target that is not one` | `asean`, `who_pq` → nothing |

## Verified by making each check fail

| Mutation | Refused by |
|---|---|
| W1 the hand-written list of six restored (**the defect**) | `offer the twelve…`, and two more |
| W2 the field dropped from the fact reader again | four tests, including both stored-answer readings |
| W3 the two non-region targets undeclared | `offer nothing beyond them…`, **and** `every-offered-value-is-read`'s own gate, independently |

```
$ npx vitest run server/services/ana/intelligence-questions/__tests__ shared/regulatory/__tests__
Test Files  40 passed (40)
     Tests  475 passed (475)

$ TYPECHECK_HEAP_MB=20480 npm run ci:typecheck:no-regression
errors found: 0 — OK, matches baseline
$ node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD
3 lintable file(s) changed -- no file changed its warning count
```

With this the review's duplication finding is closed: the class vocabularies in
`2026-10-12-one-vocabulary/`, the agency list here.

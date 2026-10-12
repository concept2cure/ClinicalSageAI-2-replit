# A device project does not assert a risk class nobody determined

**Row:** D4 (governed content is deterministic) / the working agreement's
*fail closed, never fabricate*
**Finding acted on:** `docs/evidence/ANA-QUESTIONS/2026-10-12-review/README.md`
— "`device-projects.ts` defaulting a missing class to `'II'`."

## What was wrong

`POST /api/device-projects` destructured:

```ts
deviceClass = 'II',
```

A create that did not state a class produced a device project whose record
**asserted Class II**. The class decides the premarket route, the evidence a
submission owes, and in Europe whether a notified body is involved at all —
and nothing downstream could tell that assertion from a sponsor's own. The
surfaces render `Class II` either way; the post-market readiness service and
the standards-applicability service key their output off it.

A risk class is a **verdict**. RULE 2 of this repository says numbers, verdicts
and governed content come from deterministic engines and the model narrates,
and that a tool asking a model for a figure is a defect. A verdict invented in
a request default is the same defect one layer down — worse, because no
narration surrounds it to be doubted.

Next to it, a second fault in the same four lines:

```ts
const VALID_DEVICE_CLASSES = ['I', 'II', 'IIa', 'IIb', 'III'];
```

Three US classes and two of the four MDR rule classes, mixed, with nothing
saying which regulator each belonged to — and so `Is`, `Im` and `Ir` refused,
though those are exactly what a sterile, measuring or reusable-surgical Class I
device declares under the MDR (Art 52(7)). A European sponsor could not state
its own device's class through this route at all.

## What now happens

- **No default.** An unstated class is stored as `null` — explicitly null and
  not merely absent, so "nobody has determined a class" and "the writer forgot
  the field" do not read the same. The surfaces that read it already render
  that honestly ("device class not set", "—"); nothing needed changing there,
  which is what made the invention invisible.
- **An unstated class is not a validation failure.** A device project is
  created before the classification is determined more often than not, and a
  400 here would move the invention from this file to its caller. A class that
  IS given must be one of the two vocabularies.
- **The vocabulary is the governed one.** `VALID_DEVICE_CLASSES` is now
  `DEVICE_CLASSES ∪ MDR_DECLARED_CLASSES` from
  `shared/regulatory/device-class`, which holds both and says why each has the
  shape it has. The route and the rest of the platform can no longer disagree
  about what a class is, and `Is`, `Im` and `Ir` are accepted.
- **A class stated in error can be withdrawn**, by patching `deviceClass` to
  `null`. Without that, a wrong class could be exchanged for another wrong
  class but never taken back, and the record would keep carrying a
  determination nobody stands behind.

## The gates

`server/routes/__tests__/device-projects-class-not-invented.test.ts`, 9 tests:

| Gate | Holds |
|---|---|
| `stores no class, rather than Class II` | the defect itself |
| `is not refused, because a device project precedes its classification` | 201 for an absent and for an empty class |
| `stores exactly what was stated` | a stated class is not transformed |
| `accepts the MDR classes a Class I device actually declares` | `Is`, `Im`, `Ir` |
| `accepts every class the governed vocabulary holds` | the whole of `MDR_DECLARED_CLASSES` plus I/II/III, so the route cannot drift from the module |
| `refuses a class neither regulator has` | `IV` → 400 |
| `is possible, by patching it to null` | withdrawal, with the rest of the metadata untouched |
| `leaves the class alone where the patch does not mention it` | the patch semantics are unchanged |
| `still refuses a class that is not one` | `'Class 2'` → 400, naming the withdrawal |

## Verified by making each check fail

| Mutation | Refused by |
|---|---|
| P1 the `'II'` default restored (**the defect itself**) | `stores no class, rather than Class II` |
| P2 an unstated class stored as `''` rather than null | that gate, and `is not refused…` |
| P3 the hand-written class list back | `accepts the MDR classes a Class I device actually declares`, and the vocabulary-agreement gate |
| P4 an unstated class refused with a 400 | `is not refused, because a device project precedes its classification` |
| P5 a class can no longer be withdrawn | `is possible, by patching it to null` |

```
$ npx vitest run server/routes/__tests__/device-projects-class-not-invented.test.ts \
      server/routes/__tests__/device-projects-delete-ownership.test.ts
Test Files  2 passed (2)
     Tests  13 passed (13)

$ TYPECHECK_HEAP_MB=20480 npm run ci:typecheck:no-regression
errors found: 0 (tsc exit 0) — OK, matches baseline

$ node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD
no file changed its warning count
```

## What this does not do

It does not look for the same default elsewhere. `middleware/apiValidation.ts`
still declares `z.enum(['I','II','III'])` for a device class, and the US class
is enumerated in about fifteen places in all — that is the open duplication
finding, and this change migrates one of them rather than claiming the set.

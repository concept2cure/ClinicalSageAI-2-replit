# Release posted to `/api/cmc/batch-records/NaN/release`

**Package:** F1 (repairs: defects in shipped behaviour; no new screen, mount or table).
**Date:** 2026-11-09. **Completes:** `client/src/concept2cure/v2/surfaces/cmcBatch.ts`.
**Found:** walking the CMC work area in the running app before a client demo, and reading the console.

## The defect

`cmc_batch_records.id` is a **uuid**. `CmcBatch.dbId` was typed `number` and documented as *"the address for
PUT/release"*, and the mapper coerced it:

```ts
dbId: typeof row.id === 'number' ? row.id : Number(row.id)
```

`Number('a977568a-e924-48c9-95e9-4d5f7006503d')` is `NaN`. Every batch on the tab carried `dbId: NaN`, and three
things followed:

1. `key={r.dbId ?? r.id}` gave every row the **same** key. React logged *"Encountered two children with the same
   key, NaN"* and may duplicate or omit rows.
2. The optimistic update `rows.map(x => x.dbId === target.dbId ? … : x)` matched nothing, because `NaN === NaN` is
   false.
3. **Release — the governed §11.50 act — posted to `/api/cmc/batch-records/NaN/release`.** Measured against the
   running server: **HTTP 500, `invalid input syntax for type uuid: "NaN"`**.

And the guard written to prevent exactly this did not fire:

```ts
if (target.dbId == null) { fireToast('This batch isn’t in the governed file yet — reload before releasing it.'); return; }
```

`NaN == null` is **false**. The one check meant to catch a row with no server identity passes for the row that has
lost it.

## This is the specification defect, unfixed on batches

`CmcSpecRow.id` had the same shape and was fixed on 2026-11-08
(`client/src/concept2cure/v2/__tests__/cmcSpecRowIdentity.test.ts`): *"`Number()` of a uuid type-checks perfectly,
and the row's declared type agreed with it."* The batch register was not swept at the same time. Both were found
the same way — by pressing a button in the running app, not by reading code.

## The change

`batchIdentity(id)` returns the server's id **as given**: a uuid stays a uuid, a legacy integer stays an integer,
and anything the server did not send — `undefined`, `null`, `''` — stays **absent**, so the caller's `== null`
guard means what it says again. `dbId` is typed `string | number`.

A blank string counts as none: it addresses no row, and letting it through would rebuild the defect one layer up.

## What the fix turns the button into

| Path | Answer |
|---|---|
| `/api/cmc/batch-records/NaN/release` | **500** `invalid input syntax for type uuid: "NaN"` |
| `/api/cmc/batch-records/<uuid>/release` | **409** *"2 recorded results are not yet reviewed (DS-2502-R1, DS-2502-R2). A full release needs every result reviewed…"* |

The fix does not make the release succeed — it makes the platform's own governed refusal reach the person, which is
what the screen should have been showing. `03-live-the-defect-and-the-fix.txt` has both responses verbatim.

## Verified by making each check fail

`01-red.txt`: 4 of 6 red before the change — *"the uuid was coerced to a number: expected NaN to be
'a977568a-…'"*, *"two batches shared a React key: expected 1 to be 3"*, and *"expected NaN to be undefined"* for
the absent case that the guard depends on.

Tests: `client/.../__tests__/cmcBatchRowIdentity.test.ts` (new, 6 cases) — the uuid kept whole, no NaN, the release
path built correctly, a legacy numeric id still carried, distinct React keys across three rows, the absent case
absent, and the batch NUMBER still the row's label.

## One existing expectation changed, with its reason

`cmcBatchMapping.test.ts` asserted `dbId` is `9` when the API sent the string `'9'` — an expectation that encoded
the coercion being removed. It now asserts `'9'`. For what `dbId` is for, a URL segment and a React key, `'9'` and
`9` address and distinguish the same row, and nothing does arithmetic on it.

## Gates

`tsc --noEmit` 0 errors (the widened type reaches no other caller). The five CMC client suites pass: 45 cases.

/**
 * A batch's identity is the id the server gave it — the same defect the
 * Specifications tab had, still live on Batch records.
 *
 * ## The defect, found in the running app
 *
 * `cmc_batch_records.id` is a **uuid**. `CmcBatch.dbId` was typed `number` and
 * documented as *"the address for PUT/release"*, and `batchRowFromApi` coerced
 * it:
 *
 *     dbId: typeof row.id === 'number' ? row.id : Number(row.id)
 *
 * `Number('a977568a-e924-48c9-95e9-4d5f7006503d')` is `NaN`, so every batch on
 * the tab carried `dbId: NaN`. Three things followed, and the third is the one
 * that matters:
 *
 *   1. `key={r.dbId ?? r.id}` gave every row the same key. React logged
 *      *"Encountered two children with the same key, NaN"* and may duplicate
 *      or omit rows.
 *   2. The optimistic update `rows.map(x => x.dbId === target.dbId ? … : x)`
 *      matched nothing, because `NaN === NaN` is false.
 *   3. **Release — the governed §11.50 act — posted to
 *      `/api/cmc/batch-records/NaN/release`.** The guard above it,
 *      `if (target.dbId == null)`, did not fire, because `NaN == null` is
 *      false: the one check written to catch a row with no server identity
 *      passes for the row that has lost it.
 *
 * Found by walking the tab in the running app before a demo and reading the
 * console, not by reading the code — `Number()` of a uuid type-checks
 * perfectly and the declared type agreed with it. Exactly how the
 * specification case was found (`cmcSpecRowIdentity.test.ts`).
 *
 * ## What these cases hold
 *
 * The id is carried as the server sent it, whatever its shape, and nothing
 * derives a number from it.
 */
import { describe, expect, it } from 'vitest';

import { batchRowFromApi, batchRowsFromApi } from '../surfaces/cmcBatch';

const UUID = 'a977568a-e924-48c9-95e9-4d5f7006503d';

describe('a batch row carries the id the server gave it', () => {
  it('keeps a uuid whole — the shape cmc_batch_records actually uses', () => {
    const row = batchRowFromApi({ id: UUID, batch_number: 'C2C201-DP-2601' } as never);
    expect(row.dbId, 'the uuid was coerced to a number').toBe(UUID);
  });

  it('never produces NaN, which is what broke Release', () => {
    const row = batchRowFromApi({ id: UUID } as never);
    expect(Number.isNaN(row.dbId as unknown as number)).toBe(false);
    /* The path the Release button builds. A demo pressed this button and the
       server was asked about a batch called "NaN". */
    expect(`/api/cmc/batch-records/${row.dbId}/release`).toBe(`/api/cmc/batch-records/${UUID}/release`);
  });

  it('keeps a legacy numeric id too, so an older row still addresses itself', () => {
    expect(batchRowFromApi({ id: 41, batch_number: 'B-41' } as never).dbId).toBe(41);
  });

  it('gives each row a DISTINCT key, so React neither duplicates nor omits one', () => {
    const rows = batchRowsFromApi([
      { id: UUID, batch_number: 'C2C201-DP-2601' },
      { id: '28d4b123-19da-4115-9678-3076b2b55553', batch_number: 'C2C201-DP-2503' },
      { id: '1aae9573-feac-4059-9796-5211b783615f', batch_number: 'C2C201-DS-2502' },
    ] as never);
    const keys = rows.map((r) => r.dbId ?? r.id);
    expect(new Set(keys).size, 'two batches shared a React key').toBe(3);
  });

  it('leaves dbId absent on a row the server has not given one, so the guard still fires', () => {
    /* `if (target.dbId == null)` is the check that refuses to release a row
       with no server identity. It only works if the absent case is absent —
       NaN passed it. */
    expect(batchRowFromApi({ batch_number: 'draft-only' } as never).dbId).toBeUndefined();
    expect(batchRowFromApi({ id: null, batch_number: 'draft-only' } as never).dbId).toBeUndefined();
    expect(batchRowFromApi({ id: '', batch_number: 'draft-only' } as never).dbId).toBeUndefined();
  });

  it('still shows the batch NUMBER as the row label, which is what a person reads', () => {
    expect(batchRowFromApi({ id: UUID, batch_number: 'C2C201-DP-2601' } as never).id).toBe('C2C201-DP-2601');
  });
});

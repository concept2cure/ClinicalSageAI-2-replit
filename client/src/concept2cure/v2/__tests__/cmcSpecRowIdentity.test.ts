/**
 * A specification's identity is the id the server gave it.
 *
 * ## The defect
 *
 * `quality_specifications.id` is a **uuid**. `CmcSpecRow.id` was typed `number`
 * and `specRowFromApi` coerced it:
 *
 *     id: typeof row.id === 'number' ? row.id : Number(row.id)
 *
 * `Number('b4e61bbf-5ebb-4c13-8da1-43dae4e6ba3d')` is `NaN`, so every display
 * row on the Specifications tab carried `NaN`, and every path built from it was
 * broken in the product:
 *
 *     PUT  /api/cmc/specifications/NaN            edit a limit
 *     POST /api/cmc/specifications/NaN/approve    approve under signature
 *     GET  /api/cmc/specifications/NaN/history    read what changed
 *
 * and the optimistic update `rows.map(x => x.id === id ? … : x)` matched
 * nothing, because `NaN === NaN` is false. The list and the create were fine,
 * which is why the screen looked like it worked: only editing, approving and
 * reading one row's history failed, each with a 500 that reached the user as
 * "Operation failed".
 *
 * Found by pressing History in the running app — `invalid input syntax for type
 * uuid: "NaN"` in the server log — not by reading the code. `Number()` of a
 * uuid type-checks perfectly, and the row's declared type agreed with it.
 *
 * ## What these cases hold
 *
 * The id is carried, never parsed. Asserted against the real shapes a uuid
 * column arrives in, and against the equality the optimistic update depends on.
 */
import { describe, it, expect } from 'vitest';
import { specRowFromApi, specRowsFromApi, type QualitySpecApiRow } from '../surfaces/cmcSpec';

const UUID = 'b4e61bbf-5ebb-4c13-8da1-43dae4e6ba3d';

const row = (over: Partial<QualitySpecApiRow> = {}): QualitySpecApiRow => ({
  id: UUID,
  material_type: 'drug_substance',
  material_name: 'CS-401 drug substance',
  acceptance_criteria: { release: '95.0 - 105.0 %' },
  approval_status: 'draft',
  ...over,
});

describe('a specification row carries the id the server gave it', () => {
  it('keeps a uuid whole', () => {
    expect(specRowFromApi(row()).id).toBe(UUID);
  });

  it('never produces NaN, whatever the id looks like', () => {
    /* The one assertion that would have caught this. Every value below is a
       plausible primary key and none of them may become NaN. */
    for (const id of [UUID, UUID.toUpperCase(), '7', 7, '00000000-0000-4000-8000-000000000000']) {
      const mapped = specRowFromApi(row({ id: id as QualitySpecApiRow['id'] }));
      expect(String(mapped.id), String(id)).not.toBe('NaN');
      expect(mapped.id, String(id)).toBe(String(id));
    }
  });

  it('builds the route paths the tab uses, with no NaN in them', () => {
    /* The three paths that were broken, built the way the surface builds them. */
    const { id } = specRowFromApi(row());
    expect('/api/cmc/specifications/' + id).toBe(`/api/cmc/specifications/${UUID}`);
    expect('/api/cmc/specifications/' + id + '/approve').not.toContain('NaN');
    expect(`/api/cmc/specifications/${encodeURIComponent(String(id))}/history`).toContain(UUID);
  });

  it('compares equal to itself, so an optimistic update finds its own row', () => {
    /* NaN === NaN is false, so the row the user had just saved was never
       replaced and the screen kept showing the old values until a reload. */
    const a = specRowFromApi(row());
    const b = specRowFromApi(row());
    expect(a.id === b.id).toBe(true);
    const rows = specRowsFromApi([row({ id: UUID }), row({ id: '00000000-0000-4000-8000-000000000001' })]);
    expect(rows.filter((r) => r.id === UUID)).toHaveLength(1);
  });

  it('keeps two different specifications distinct', () => {
    /* Every row coerced to NaN was also equal to every other row for any
       comparison that used ===, so "the row I edited" was unidentifiable. */
    const rows = specRowsFromApi([
      row({ id: UUID }),
      row({ id: '00000000-0000-4000-8000-000000000001' }),
      row({ id: '00000000-0000-4000-8000-000000000002' }),
    ]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
  });
});

/**
 * A register write that names a field the register does not record is refused,
 * not applied in part.
 *
 * ## The defect, as measured
 *
 * Every CMC register body is parsed with `schema.parse` or
 * `schema.partial().parse`, and a zod object strips the keys it does not know.
 * On 2026-11-09 this repository's own demo seeder sent `shelfLifeClaim` to
 * `PUT /api/cmc/stability-studies/:id`, where the column is `shelf_life`
 * (`shelfLife`). Three writes, three 200 OKs, nothing stored — and the seeder
 * reported the shelf life as recorded, because a 200 from a write route is
 * the only answer a caller has. A read-back found it; no ordinary caller
 * performs one.
 *
 * The same silence covers partial application: a body of three fields of which
 * one is misspelled stored two and answered as though it had stored three.
 *
 * ## What these cases hold
 *
 * The refusal names the fields it could not record AND the ones the register
 * accepts, because the caller's next move is to correct the call. It is 400,
 * not 409: a misspelled field is a wrong request, not a conflict with the
 * record's state. And it never names a field the register does record, because
 * a false accusation sends the caller to fix something that was right.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  HANDLER_BODY_KEYS,
  RegisterWriteRefusal,
  drugSubstanceBody,
  refuseUnrecordedFields,
  unrecordedBodyFields,
} from '../register-writes';

/* The stability register's body is module-private to server/api/cmc/routes.ts,
   so the measured case is reproduced on a schema of the same shape: one
   optional `shelfLife`, which is what the seeder meant and missed. */
const stabilityShelfLife = z.object({ shelfLife: z.string().optional() });

describe('a field the register has no column for', () => {
  it('names the misspelled field — the seeder’s measured case', () => {
    expect(
      unrecordedBodyFields(stabilityShelfLife, { shelfLifeClaim: '24 months at 25C/60%RH' }),
    ).toEqual(['shelfLifeClaim']);
  });

  it('names nothing when every key is one the register records', () => {
    expect(
      unrecordedBodyFields(drugSubstanceBody, {
        substanceName: 'C2C-201 API',
        projectId: '18cb4cd2-2f8a-419f-898b-c07cc4b6715e',
      }),
    ).toEqual([]);
  });

  it('accepts the governed reason, which the handler reads and the schema does not', () => {
    expect(HANDLER_BODY_KEYS).toContain('reason');
    expect(unrecordedBodyFields(drugSubstanceBody, { substanceName: 'x', reason: 'typo' })).toEqual([]);
  });

  it('leaves a body that is not an object to the schema’s own refusal', () => {
    expect(unrecordedBodyFields(drugSubstanceBody, null)).toEqual([]);
    expect(unrecordedBodyFields(drugSubstanceBody, ['substanceName'])).toEqual([]);
    expect(unrecordedBodyFields(drugSubstanceBody, 'substanceName')).toEqual([]);
  });

  it('lists every unrecorded field, sorted, not just the first', () => {
    expect(
      unrecordedBodyFields(drugSubstanceBody, {
        substanceName: 'x',
        shelfLifeClaim: 'a',
        molecularWieght: 'b',
      }),
    ).toEqual(['molecularWieght', 'shelfLifeClaim']);
  });
});

describe('the refusal the route answers', () => {
  it('refuses with 400 — a wrong field is a wrong request, not a state conflict', () => {
    let thrown: unknown;
    try {
      refuseUnrecordedFields(stabilityShelfLife, { shelfLifeClaim: '24 months' }, 'stability-studies');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(RegisterWriteRefusal);
    expect((thrown as RegisterWriteRefusal).status).toBe(400);
  });

  it('names the route, the field it could not record, and what it does record', () => {
    expect(() =>
      refuseUnrecordedFields(stabilityShelfLife, { shelfLifeClaim: '24 months' }, 'stability-studies'),
    ).toThrow(/\/api\/cmc\/stability-studies does not record "shelfLifeClaim"/);
    expect(() =>
      refuseUnrecordedFields(stabilityShelfLife, { shelfLifeClaim: '24 months' }, 'stability-studies'),
    ).toThrow(/This register records: shelfLife\./);
  });

  it('says nothing was written, because an edit is never applied in part', () => {
    expect(() =>
      refuseUnrecordedFields(
        drugSubstanceBody,
        { substanceName: 'C2C-201 API', molecularWieght: '318.4' },
        'drug-substances',
      ),
    ).toThrow(/nothing was written — an edit is never applied in part/);
  });

  it('never names a field the register does record', () => {
    let message = '';
    try {
      refuseUnrecordedFields(
        drugSubstanceBody,
        { substanceName: 'C2C-201 API', molecularWieght: '318.4' },
        'drug-substances',
      );
    } catch (err) {
      message = (err as Error).message;
    }
    const accused = message.slice(0, message.indexOf('This register records:'));
    expect(accused).toContain('"molecularWieght"');
    expect(accused).not.toContain('"substanceName"');
  });

  it('lets a body of only recorded fields through', () => {
    expect(() =>
      refuseUnrecordedFields(drugSubstanceBody, { substanceName: 'x', status: 'development' }, 'drug-substances'),
    ).not.toThrow();
  });
});

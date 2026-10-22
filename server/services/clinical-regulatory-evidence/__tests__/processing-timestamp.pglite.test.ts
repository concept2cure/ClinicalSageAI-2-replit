/** Calendar validation for the actual sweep SQL expression, without table or function shims. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('../../../db.js', () => ({pool: {query:vi.fn()}}));
import { processingTimestampSql } from '../data-room-processing-sweep';
let pg:PGlite;
beforeAll(async()=>{pg=new PGlite();});
afterAll(async()=>{await pg?.close();});
async function admitted(value:unknown):Promise<boolean> {
  const result=await pg.query<{accepted:boolean}>(`SELECT (${processingTimestampSql('$1::text')}) IS NOT NULL AS accepted`,[value]);
  return result.rows[0].accepted;
}
describe('portable sweep timestamps use exact calendar validation before casts',()=>{
  it.each([null,'', 'not-a-date', '0000-01-01T00:00:00.000Z', '1900-02-29T00:00:00.000Z',
    '2025-02-29T00:00:00.000Z','2026-04-31T00:00:00.000Z','2026-00-01T00:00:00.000Z',
    '2026-13-01T00:00:00.000Z','2026-01-00T00:00:00.000Z','2026-01-32T00:00:00.000Z',
    '2026-01-01T24:00:00.000Z','2026-01-01T00:60:00.000Z','2026-01-01T23:59:60.000Z',
    '2026-01-01T00:00:00.000+00:00','2026-01-01T00:00:00Z','2026-01-01T00:00:00.000Z trailing',
    '999999999-01-01T00:00:00.000Z'])('rejects malformed or non-calendar timestamp %j without throwing',async value=>{
    expect(await admitted(value)).toBe(false);
  });
  it.each(['0001-01-01T00:00:00.000Z','2000-02-29T00:00:00.000Z','2024-02-29T23:59:59.999Z',
    '9999-12-31T23:59:59.999Z'])('admits exact bounded canonical timestamp %s',async value=>{
    expect(await admitted(value)).toBe(true);
  });
});

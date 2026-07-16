/**
 * deepSearch array-filter binding regression.
 *
 * The category/test-standard/component filters use Postgres array overlap
 * (`&&`). They previously interpolated `filters.join(',')` into ARRAY[...],
 * which bound the whole list as ONE element ('a,b') — multi-value filters could
 * never match. This locks the arrayOverlaps form: one bind parameter carrying a
 * real multi-element Postgres array.
 */
import { describe, it, expect } from 'vitest';
import { arrayOverlaps } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { deviceDataCenter } from '../../../shared/schema';

describe('device data center array filters', () => {
  it('binds multi-value overlap filters as a real array parameter', () => {
    const db = drizzle({} as never);
    const { sql, params } = db
      .select({ id: deviceDataCenter.id })
      .from(deviceDataCenter)
      .where(arrayOverlaps(deviceDataCenter.categories, ['bench', 'biocompat']))
      .toSQL();

    // Overlap operator with a single bound parameter…
    expect(sql).toContain('&& $1');
    expect(params).toHaveLength(1);
    // …whose value is a two-element Postgres array, not 'bench,biocompat'.
    expect(String(params[0])).toContain('"bench"');
    expect(String(params[0])).toContain('"biocompat"');
    expect(String(params[0])).not.toContain('bench,biocompat');
  });
});

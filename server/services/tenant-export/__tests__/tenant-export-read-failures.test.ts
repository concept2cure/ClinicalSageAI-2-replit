/**
 * A tenant data export must not report an unread table as an empty one.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * Five resource queries carried `.catch(() => ({ rows: [] }))` and the
 * audit-log count carried `.catch(() => ({ rows: [{ count: '0' }] }))`. A
 * failure fed BOTH halves of the manifest — `counts.<resource>` AND
 * `resources.<resource>` — so the export did not merely misreport a number, it
 * presented an empty collection as the tenant's data.
 *
 * The audit-log case is the one that matters most: this manifest is what a
 * customer receives when they ask for their data, and `auditLogs: 0` in it is a
 * statement about their compliance record. A permissions change, a renamed
 * column or a dropped table would have produced exactly that number.
 *
 * The fix is copied from the sibling that already solved this —
 * tenant-full-export.service.ts records `coverage.tablesFailed` — rather than a
 * second invented shape.
 */
import { describe, it, expect, vi } from 'vitest';

import { exportTenantData } from '../tenant-export.service';

const ORG = { id: 7, slug: 'acme', name: 'Acme Bio', status: 'active' };

/**
 * A pg client stand-in. `failOn` names substrings; a query containing one
 * rejects the way a real permissions error or a missing relation would.
 */
function clientWith(failOn: string[] = []) {
  return {
    query: vi.fn(async (sql: string) => {
      if (failOn.some(f => sql.includes(f))) {
        throw new Error(`permission denied for relation ${failOn[0]}`);
      }
      if (sql.includes('FROM organizations')) return { rows: [ORG] };
      if (sql.includes('count(*)')) return { rows: [{ count: '4211' }] };
      return { rows: [] };
    }),
  } as never;
}

describe('exportTenantData distinguishes empty from unread', () => {
  it('records a failed resource read instead of returning it as empty', async () => {
    const manifest = await exportTenantData(clientWith(['gspr_program_mappings']), 7);

    expect(manifest.readFailures).toEqual([
      { resource: 'gsprMappings', error: expect.stringContaining('permission denied') },
    ]);
    // The resource IS still empty — the export stays resilient, one unreadable
    // table must not abort a customer's whole data export. What changed is that
    // the emptiness is now attributable.
    expect(manifest.resources.gsprMappings).toEqual([]);
    expect(manifest.counts.gsprMappings).toBe(0);
  });

  it('reports a failed audit-log count as null, never as zero', async () => {
    const manifest = await exportTenantData(clientWith(['audit_logs']), 7);

    // The old value here was the number 0.
    expect(manifest.counts.auditLogs).toBeNull();
    expect(manifest.readFailures).toContainEqual({
      resource: 'auditLogs',
      error: expect.stringContaining('permission denied'),
    });
  });

  it('a clean export carries an empty failure list and a real count', async () => {
    const manifest = await exportTenantData(clientWith(), 7);

    expect(manifest.readFailures).toEqual([]);
    expect(manifest.counts.auditLogs).toBe(4211);
    // Genuinely empty resources stay empty and unflagged — the point is that
    // this is now distinguishable from the case above.
    expect(manifest.resources.gsprMappings).toEqual([]);
  });

  it('bumps schemaVersion, because a 1.0 consumer cannot read a null count', async () => {
    const manifest = await exportTenantData(clientWith(), 7);
    expect(manifest.schemaVersion).toBe('1.1');
  });

  it('collects every failure, not the first', async () => {
    const manifest = await exportTenantData(
      clientWith(['post_market_documents', 'cerv2_510k_sections']),
      7,
    );

    expect(manifest.readFailures.map(f => f.resource).sort()).toEqual([
      'postMarketDocuments',
      'sections',
    ]);
  });
});

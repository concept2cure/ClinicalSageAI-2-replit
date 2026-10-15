/**
 * The signed audit export states WHERE the audit_logs chain broke — as this
 * organisation may read it.
 *
 * signedAuditExport.ts auditLogsChainVerdict wrote `String(v.brokenAt)`. The
 * verifier's `brokenAt` is a ChainBreak object, so every broken-chain manifest
 * an inspector received said `"brokenAt": "[object Object]"` — the location of
 * the break was lost — and the redaction every other export applies
 * (audited-export.ts breakForTenant, DP-44) was skipped: had the string been
 * the object, it would have named another organisation's row and hashes.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { ChainBreak, ChainVerificationResult } from '../../chain';
import { generateSignedAuditExport } from '../../signedAuditExport';

const ORG = 7;

/** Enough of a pool for the export: empty stores, and the export record's id. */
const pool = {
  query: async (sql: string) =>
    /INSERT INTO audit_events/.test(sql) ? { rows: [{ id: 501 }] } : { rows: [] },
};

function verdict(brokenAt: ChainBreak): () => Promise<ChainVerificationResult> {
  return async () => ({ ok: false, rowsChecked: 9, tenants: 1, legacyRows: 2, sequencedRows: 7, brokenAt });
}

const base = { organizationId: ORG, format: 'json' as const, exportedBy: 'inspector', exportedByRole: 'admin' };

beforeEach(() => {
  process.env.AUDIT_EXPORT_SIGNING_KEY = 'b'.repeat(40);
});

describe('the audit_logs break in a signed export manifest', () => {
  it("names this organisation's broken row and its hashes, not [object Object]", async () => {
    const own: ChainBreak = {
      id: 'row-own',
      expected: 'e'.repeat(64),
      stored: 's'.repeat(64),
      tenantId: ORG,
      segment: 'sequenced',
      commitsTo: { id: 'row-prev', tenantId: ORG },
    };
    const out = await generateSignedAuditExport(pool as never, base, { verifyAuditLogsChain: verdict(own) });
    const chain = out.manifest.auditLogsChain!;
    expect(chain.status).toBe('broken');
    expect(chain.brokenAt).not.toBe('[object Object]');
    expect(JSON.parse(chain.brokenAt!)).toEqual({
      segment: 'sequenced',
      id: 'row-own',
      expected: 'e'.repeat(64),
      stored: 's'.repeat(64),
      commitsTo: { id: 'row-prev' },
    });
  });

  it("does not name another organisation's row, its hashes or its organisation", async () => {
    const theirs: ChainBreak = {
      id: 'their-row',
      expected: 'x'.repeat(64),
      stored: 'y'.repeat(64),
      tenantId: 9,
      segment: 'legacy',
      commitsTo: { id: 'their-prev', tenantId: 9 },
    };
    const out = await generateSignedAuditExport(pool as never, base, { verifyAuditLogsChain: verdict(theirs) });
    const brokenAt = out.manifest.auditLogsChain!.brokenAt!;
    expect(JSON.parse(brokenAt)).toEqual({ segment: 'legacy', row: 'another organization', commitsTo: 'another organization' });
    for (const secret of ['their-row', 'their-prev', 'x'.repeat(64), 'y'.repeat(64), '"tenantId"']) {
      expect(brokenAt).not.toContain(secret);
    }
  });
});

/**
 * §11.50(b) — the release signature must carry its manifestation to the screen
 * that shows it: the printed name of the signer, the date and time of signing,
 * and the meaning of the signature.
 *
 * Periodic review 2026-09-22, Part 11 finding 4 (P11-4). The Submission Center's
 * "Release signature · §11.70" panel showed a signature id, a digest and a seal
 * verdict, and nothing a person could attribute. The cause was one level down:
 * `findActiveReleaseSignature` ran `SELECT id FROM electronic_signatures`, so the
 * signer, time and meaning — all in that row — never left the database, and
 * neither the export descriptor nor `GET /api/ectd/export/by-run/:runId/signed`
 * could carry them.
 *
 * The pool fake below returns ONLY the columns the query's SELECT list names.
 * A fake that handed back the whole row would pass against `SELECT id` for the
 * wrong reason, so this one is faithful to what Postgres would return.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const FULL_ROW: Record<string, unknown> = {
  id: 7,
  signer_id: 12,
  signer_name: 'A. Reviewer',
  signer_title: 'Head of Regulatory Affairs',
  signer_email: 'a.reviewer@example.test',
  signature_type: 'package-release',
  signature_purpose: 'Release sequence 0001 for transmission',
  signature_meaning: 'approval',
  signed_at: new Date('2026-09-20T14:03:05.000Z'),
};

const H = vi.hoisted(() => ({ row: null as Record<string, unknown> | null, sql: '' }));

/** The column names a `SELECT a, b AS c FROM …` returns, in the order given. */
function selectedColumns(sql: string): string[] {
  const m = /select\s+([\s\S]+?)\s+from\s/i.exec(sql);
  if (!m) return [];
  return m[1].split(',').map((c) => {
    const t = c.trim();
    const as = /\s+as\s+(\w+)$/i.exec(t);
    return as ? as[1] : t.replace(/^\w+\./, '');
  });
}

vi.mock('../../db', () => ({
  pool: {
    query: vi.fn(async (sql: string) => {
      const s = String(sql);
      if (/FROM electronic_signatures/i.test(s) && H.row) {
        H.sql = s;
        const out: Record<string, unknown> = {};
        for (const col of selectedColumns(s)) if (col in H.row) out[col] = H.row[col];
        return { rows: [out] };
      }
      return { rows: [] };
    }),
  },
  db: { execute: vi.fn(async () => ({ rows: [] })) },
}));

vi.mock('../../lib/unified-ai-client.js', () => ({ ai: { complete: vi.fn(async () => '') } }));

import { findActiveReleaseSignature } from '../submission-package-orchestrator';

const lookup = () =>
  findActiveReleaseSignature({ organizationId: 42, boundPayloadDigest: 'a'.repeat(64) });

beforeEach(() => {
  H.row = { ...FULL_ROW };
  H.sql = '';
});

describe('findActiveReleaseSignature carries the §11.50 manifestation', () => {
  it('returns the printed name, title, meaning and time of the active signature', async () => {
    await expect(lookup()).resolves.toEqual({
      id: 7,
      signerId: 12,
      signerName: 'A. Reviewer',
      signerTitle: 'Head of Regulatory Affairs',
      meaning: 'approval',
      signedAt: '2026-09-20T14:03:05.000Z',
    });
  });

  it('states the signing time as an ISO instant, whatever form the driver returns it in', async () => {
    // node-pg returns `timestamp` as a Date; a driver or a cast can return text.
    H.row = { ...FULL_ROW, signed_at: '2026-09-20T14:03:05.000Z' };
    expect((await lookup())?.signedAt).toBe('2026-09-20T14:03:05.000Z');
  });

  it('says a missing field is missing rather than inventing one', async () => {
    // signer_title and signature_meaning are nullable in the base table.
    H.row = { ...FULL_ROW, signer_title: null, signature_meaning: null, signer_name: null, signed_at: null };
    const got = await lookup();
    expect(got?.id).toBe(7);
    expect(got?.signerName).toBeNull();
    expect(got?.signerTitle).toBeNull();
    expect(got?.meaning).toBeNull();
    expect(got?.signedAt).toBeNull();
  });

  it('keeps the lookup that decides the §11.70 gate unchanged', async () => {
    await lookup();
    expect(H.sql).toMatch(/organization_id\s*=\s*\$1/);
    expect(H.sql).toMatch(/bound_payload_digest\s*=\s*\$2/);
    expect(H.sql).toMatch(/superseded_by IS NULL/);
    expect(H.sql).toMatch(/ORDER BY id DESC/);
  });
});

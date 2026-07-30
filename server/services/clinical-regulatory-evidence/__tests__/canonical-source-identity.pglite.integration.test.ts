/**
 * Canonical source identity — END-TO-END against in-process PGlite.
 *
 * An uploaded client document must resolve to exactly ONE `cre_evidence_sources`
 * row. Without a stable identity an upload exists only as a `file_uploads` row,
 * a governed artifact and an embedding atom — none of which can answer "which
 * dossier sections use this file, and what changed when it was replaced".
 *
 * These tests apply the REAL migration DDL and prove against real Postgres:
 *   - checksum lookup resolves a re-upload to the existing source, so one
 *     document never gets two identities;
 *   - that lookup is tenant-scoped, so an identical file uploaded by two
 *     tenants yields two separate identities and neither can see the other's;
 *   - ingestion/extraction status are recorded at creation, so a stored+read
 *     document is not left reported as 'pending'.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return {
      rows: r.rows as unknown[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) } }));

import * as svc from '../evidence-spine.service';

const ORG_A = 301;
const ORG_B = 402;

/** What the chat upload route records for a client document. */
function upload(checksum: string, over: Record<string, unknown> = {}) {
  return {
    sourceType: 'client_document' as const,
    visibilityClass: 'project_private' as const,
    clientWorkspaceId: 7,
    title: 'protocol-v2.pdf',
    storedArtifactRef: 'uploads/org-301/file_abc',
    checksum,
    ingestionStatus: 'ingested' as const,
    extractionStatus: 'extracted' as const,
    provenance: { origin: 'chat_upload', fileUploadId: 'file_abc' },
    metadata: { originalName: 'protocol-v2.pdf', mimeType: 'application/pdf' },
    ...over,
  };
}

const PROGRAM_A = '11111111-1111-4111-8111-111111111111';
const PROGRAM_B = '22222222-2222-4222-8222-222222222222';

// Standing up a WASM Postgres and applying real migration DDL costs seconds, and
// the cost scales with how many other pglite suites are running concurrently.
// vitest's 10s default hook timeout is a load measurement, not a correctness one:
// these hooks went red purely because another pglite suite joined the directory.
beforeAll(async () => {
  pglite = new PGlite();
  const here = path.dirname(fileURLToPath(import.meta.url));
  const spine = path.resolve(
    here,
    '../../../../db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
  );
  await pglite.exec(fs.readFileSync(spine, 'utf8'));
  // The additive program-scope migration must apply on top of the spine.
  const programScope = path.resolve(
    here,
    '../../../../migrations/20260726_cre_source_program_scope.sql',
  );
  await pglite.exec(fs.readFileSync(programScope, 'utf8'));
}, 90_000);
afterAll(async () => {
  await pglite.close();
}, 30_000);

describe('canonical source identity (real Postgres)', () => {
  it('creates a client_document source carrying its upload provenance', async () => {
    const src = await svc.createSource(ORG_A, upload('sha-aaa'));

    expect(src.id).toBeGreaterThan(0);
    expect(src.sourceType).toBe('client_document');
    expect(src.organizationId).toBe(ORG_A);
    expect(src.visibilityClass).toBe('project_private');
    expect(src.clientWorkspaceId).toBe(7);
    expect(src.storedArtifactRef).toBe('uploads/org-301/file_abc');
    expect((src.provenance as any).fileUploadId).toBe('file_abc');
  });

  it('records ingestion and extraction status instead of leaving them pending', async () => {
    // The bytes are stored and were read at ingest. Defaulting to 'pending'
    // would misreport the corpus as unprocessed.
    const src = await svc.createSource(ORG_A, upload('sha-status'));
    expect(src.ingestionStatus).toBe('ingested');
    expect(src.extractionStatus).toBe('extracted');
  });

  it('records a failed extraction honestly rather than as extracted', async () => {
    const src = await svc.createSource(
      ORG_A,
      upload('sha-noextract', { extractionStatus: 'failed' as const }),
    );
    expect(src.extractionStatus).toBe('failed');
  });

  it('still defaults to pending when a caller says nothing', async () => {
    const src = await svc.createSource(ORG_A, {
      sourceType: 'client_document',
      checksum: 'sha-default',
      title: 'unspecified.pdf',
    });
    expect(src.ingestionStatus).toBe('pending');
    expect(src.extractionStatus).toBe('pending');
  });

  it('resolves a re-upload of the same bytes to the existing identity', async () => {
    const first = await svc.createSource(ORG_A, upload('sha-repeat'));

    // The upload route looks up by checksum before creating.
    const found = await svc.findSourceByChecksum(ORG_A, 'sha-repeat', {
      sourceType: 'client_document',
    });
    expect(found).not.toBeNull();
    expect(found!.id).toBe(first.id);

    // And there is exactly one row for that document.
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM cre_evidence_sources WHERE checksum = 'sha-repeat'`,
    );
    expect((rows[0] as { n: number }).n).toBe(1);
  });

  it('returns the earliest identity when duplicates already exist', async () => {
    // Rows predating checksum resolution can already be duplicated; the oldest
    // is the one downstream links were hung off, so it must win.
    const first = await svc.createSource(ORG_A, upload('sha-dupe'));
    await svc.createSource(ORG_A, upload('sha-dupe'));

    const found = await svc.findSourceByChecksum(ORG_A, 'sha-dupe');
    expect(found!.id).toBe(first.id);
  });

  it('does not resolve one tenant\'s file to another tenant\'s identity', async () => {
    // The same document uploaded by two tenants is two identities, and neither
    // tenant may reach the other's.
    const a = await svc.createSource(ORG_A, upload('sha-shared'));
    const b = await svc.createSource(ORG_B, upload('sha-shared', { clientWorkspaceId: 99 }));
    expect(b.id).not.toBe(a.id);

    expect((await svc.findSourceByChecksum(ORG_A, 'sha-shared'))!.id).toBe(a.id);
    expect((await svc.findSourceByChecksum(ORG_B, 'sha-shared'))!.id).toBe(b.id);
  });

  it('finds nothing for an unknown or empty checksum', async () => {
    expect(await svc.findSourceByChecksum(ORG_A, 'sha-never-seen')).toBeNull();
    expect(await svc.findSourceByChecksum(ORG_A, '')).toBeNull();
  });

  it('does not match a different source type when one is requested', async () => {
    await svc.createSource(ORG_A, upload('sha-typed', { sourceType: 'protocol' as const }));

    expect(
      await svc.findSourceByChecksum(ORG_A, 'sha-typed', { sourceType: 'client_document' }),
    ).toBeNull();
    expect(await svc.findSourceByChecksum(ORG_A, 'sha-typed')).not.toBeNull();
  });

  it('scopes a source to a UUID-keyed program', async () => {
    const src = await svc.createSource(
      ORG_A,
      upload('sha-prog', { clientProgramId: PROGRAM_A, clientWorkspaceId: null }),
    );
    expect(src.clientProgramId).toBe(PROGRAM_A);
    expect(src.clientWorkspaceId).toBeNull();
  });

  it('rejects an invalid status rather than writing it', async () => {
    await expect(
      svc.createSource(ORG_A, upload('sha-bad', { ingestionStatus: 'done' as any })),
    ).rejects.toThrow(/ingestionStatus/);
    await expect(
      svc.createSource(ORG_A, upload('sha-bad2', { extractionStatus: 'ok' as any })),
    ).rejects.toThrow(/extractionStatus/);
  });
});

describe('data room listing (real Postgres)', () => {
  it('returns only the requested program\'s documents', async () => {
    const mine = await svc.createSource(
      ORG_A,
      upload('dr-mine', { clientProgramId: PROGRAM_A, clientWorkspaceId: null, title: 'mine.pdf' }),
    );
    await svc.createSource(
      ORG_A,
      upload('dr-other', { clientProgramId: PROGRAM_B, clientWorkspaceId: null, title: 'other.pdf' }),
    );

    const rows = await svc.listClientDocuments(ORG_A, { programId: PROGRAM_A });
    const ids = rows.map(r => r.id);
    expect(ids).toContain(mine.id);
    expect(rows.every(r => r.clientProgramId === PROGRAM_A)).toBe(true);
    expect(rows.map(r => r.title)).not.toContain('other.pdf');
  });

  it('never returns another tenant\'s documents for the same program id', async () => {
    await svc.createSource(
      ORG_B,
      upload('dr-tenantb', { clientProgramId: PROGRAM_A, clientWorkspaceId: null, title: 'theirs.pdf' }),
    );
    const rows = await svc.listClientDocuments(ORG_A, { programId: PROGRAM_A });
    expect(rows.map(r => r.title)).not.toContain('theirs.pdf');
  });

  it('does not widen to the whole tenant when a scope matches nothing', async () => {
    // A project showing another project's documents because a filter silently
    // widened is the failure a data room cannot have.
    const rows = await svc.listClientDocuments(ORG_A, {
      programId: '33333333-3333-4333-8333-333333333333',
    });
    expect(rows).toEqual([]);
  });

  it('returns ownerless documents only when asked, and never mixes them in', async () => {
    await svc.createSource(
      ORG_A,
      upload('dr-unscoped', {
        clientProgramId: null,
        clientWorkspaceId: null,
        visibilityClass: 'tenant_private' as const,
        title: 'unassigned.pdf',
      }),
    );

    const scoped = await svc.listClientDocuments(ORG_A, { programId: PROGRAM_A });
    expect(scoped.map(r => r.title)).not.toContain('unassigned.pdf');

    const unscoped = await svc.listClientDocuments(ORG_A, { includeUnscoped: true });
    expect(unscoped.map(r => r.title)).toContain('unassigned.pdf');
    expect(unscoped.every(r => !r.clientProgramId && !r.clientWorkspaceId)).toBe(true);
  });

  it('still supports the numeric workspace id-space', async () => {
    await svc.createSource(
      ORG_A,
      upload('dr-ws', { clientProgramId: null, clientWorkspaceId: 4242, title: 'legacy.pdf' }),
    );
    const rows = await svc.listClientDocuments(ORG_A, { workspaceId: 4242 });
    expect(rows.map(r => r.title)).toContain('legacy.pdf');
  });

  it('lists only client documents, not CSRs or letters', async () => {
    await svc.createSource(ORG_A, {
      sourceType: 'fda_crl',
      visibilityClass: 'tenant_private',
      clientProgramId: PROGRAM_A,
      title: 'a-letter',
      checksum: 'dr-crl',
    });
    const rows = await svc.listClientDocuments(ORG_A, { programId: PROGRAM_A });
    expect(rows.every(r => r.sourceType === 'client_document')).toBe(true);
  });
});

describe('context builder — resolving selected sources to readable uploads (real Postgres)', () => {
  it('resolves a selected source back to the upload its bytes live in', async () => {
    const src = await svc.createSource(
      ORG_A,
      upload('cb-one', { provenance: { origin: 'chat_upload', fileUploadId: 'file_one' } }),
    );
    expect(await svc.resolveSourceUploadIds(ORG_A, [src.id])).toEqual(['file_one']);
  });

  it('preserves the requested order and de-duplicates', async () => {
    const a = await svc.createSource(
      ORG_A,
      upload('cb-a', { provenance: { fileUploadId: 'file_a' } }),
    );
    const b = await svc.createSource(
      ORG_A,
      upload('cb-b', { provenance: { fileUploadId: 'file_b' } }),
    );
    expect(await svc.resolveSourceUploadIds(ORG_A, [b.id, a.id, b.id])).toEqual([
      'file_b',
      'file_a',
    ]);
  });

  it('does not resolve another tenant\'s source', async () => {
    // A guessed id must yield nothing, never another tenant's bytes.
    const theirs = await svc.createSource(
      ORG_B,
      upload('cb-theirs', { provenance: { fileUploadId: 'file_theirs' } }),
    );
    expect(await svc.resolveSourceUploadIds(ORG_A, [theirs.id])).toEqual([]);
    expect(await svc.resolveSourceUploadIds(ORG_B, [theirs.id])).toEqual(['file_theirs']);
  });

  it('skips a source that has no readable upload', async () => {
    // A CSR projection or ingested CRL has no file behind it. Inventing one
    // would ground a draft in a document that does not exist.
    const projected = await svc.createSource(ORG_A, {
      sourceType: 'csr',
      visibilityClass: 'tenant_private',
      title: 'projected CSR',
      checksum: 'cb-projected',
    });
    expect(await svc.resolveSourceUploadIds(ORG_A, [projected.id])).toEqual([]);
  });

  it('returns the readable subset of a mixed selection', async () => {
    const readable = await svc.createSource(
      ORG_A,
      upload('cb-mixed', { provenance: { fileUploadId: 'file_mixed' } }),
    );
    const out = await svc.resolveSourceUploadIds(ORG_A, [readable.id, 999999]);
    expect(out).toEqual(['file_mixed']);
  });

  it('ignores malformed ids without querying', async () => {
    expect(await svc.resolveSourceUploadIds(ORG_A, [])).toEqual([]);
    expect(await svc.resolveSourceUploadIds(ORG_A, ['abc' as any, -1, 0])).toEqual([]);
  });
});

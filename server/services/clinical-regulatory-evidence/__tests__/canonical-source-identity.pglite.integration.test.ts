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

beforeAll(async () => {
  pglite = new PGlite();
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migration = path.resolve(
    here,
    '../../../../db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
  );
  await pglite.exec(fs.readFileSync(migration, 'utf8'));
});
afterAll(async () => {
  await pglite.close();
});

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

  it('rejects an invalid status rather than writing it', async () => {
    await expect(
      svc.createSource(ORG_A, upload('sha-bad', { ingestionStatus: 'done' as any })),
    ).rejects.toThrow(/ingestionStatus/);
    await expect(
      svc.createSource(ORG_A, upload('sha-bad2', { extractionStatus: 'ok' as any })),
    ).rejects.toThrow(/extractionStatus/);
  });
});

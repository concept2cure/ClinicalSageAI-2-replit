import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const h = vi.hoisted(() => ({ captures: [] as unknown[], failAudit: false }));
let pg: PGlite;
vi.mock('../../../db', () => ({ pool: {} }));
vi.mock('../data-room-capture-audit', () => ({
  captureActor: () => null,
  recordCapture: async (...args: unknown[]) => { if (h.failAudit) throw new Error('audit unavailable'); h.captures.push(args); },
  recordSupersession: async () => { if (h.failAudit) throw new Error('audit unavailable'); },
}));
import { reconcileRecordSources, type NativeRecordSnapshot } from '../record-source';
const ORG = 71;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const q = { query: async (sql: string, params?: unknown[]) => {
  const result = await pg.query(sql, params);
  return { rows: result.rows as Record<string, any>[], rowCount: result.affectedRows ?? result.rows.length };
} };
const snapshot = (text = 'Quality record: open CAPA; closure has not been approved.'): NativeRecordSnapshot => ({
  key: 'capa:12', title: 'CAPA-12', text, version: null, sourceScope: 'project', native: { kind: 'capa_record', id: '12' }, lifecycle: 'open',
});
async function capture(rows: NativeRecordSnapshot[]) {
  await q.query('BEGIN');
  try {
    const result = await reconcileRecordSources(q, { organizationId: ORG, programId: PROGRAM, workArea: 'quality' }, rows);
    await q.query('COMMIT'); return result;
  } catch (error) { await q.query('ROLLBACK'); throw error; }
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(fs.readFileSync('db/migrations/20260724_clinical_regulatory_evidence_spine.sql', 'utf8'));
  await pg.exec(`ALTER TABLE cre_evidence_sources ADD COLUMN client_program_id uuid, ADD COLUMN previous_version_id integer,
    ADD COLUMN is_current boolean NOT NULL DEFAULT true, ADD COLUMN created_by integer,
    ADD COLUMN extracted_text text, ADD COLUMN char_count integer`);
}, 90000);
afterAll(async () => { await pg.close(); });
beforeEach(async () => { h.captures = []; h.failAudit = false; await pg.exec('DELETE FROM cre_evidence_sources'); });
describe('native records on the existing immutable source spine', () => {
  it('captures truthful native identity/text with no invented upload or original file', async () => {
    const result = await capture([snapshot()]);
    expect(result).toMatchObject({ created: 1, unchanged: 0, superseded: 0 });
    const row = (await q.query('SELECT * FROM cre_evidence_sources')).rows[0];
    expect(row).toMatchObject({ organization_id: ORG, client_program_id: PROGRAM, source_type: 'client_document', stored_artifact_ref: null,
      extracted_text: snapshot().text, checksum: createHash('sha256').update(snapshot().text).digest('hex'), extraction_status: 'extracted' });
    expect(row.provenance).toMatchObject({ origin: 'native_record_snapshot', extractionMethod: 'native-record-projection',
      recordSnapshot: { workArea: 'quality', key: 'capa:12', sourceScope: 'project', native: { kind: 'capa_record', id: '12' }, lifecycle: 'open' } });
    expect(row.provenance.fileUploadId).toBeUndefined();
    expect(row.metadata.dossier.evidenceKind).toBe('qms');
    expect(h.captures).toHaveLength(1);
  });
  it('refreshes idempotently and retains exact predecessors when native facts change', async () => {
    await capture([snapshot()]);
    expect(await capture([snapshot()])).toMatchObject({ created: 0, unchanged: 1, superseded: 0 });
    expect(await capture([snapshot('CAPA-12 is now closed effective; see signed native record.')])).toMatchObject({ created: 1, superseded: 1 });
    const rows = (await q.query('SELECT * FROM cre_evidence_sources ORDER BY id')).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0].extracted_text).toBe(snapshot().text);
    expect(rows[0].is_current).toBe(false);
    expect(rows[1].previous_version_id).toBe(rows[0].id);
  });
  it('captures a renamed record again, so the room shows the name the register now gives it', async () => {
    await capture([snapshot()]);
    expect(await capture([{ ...snapshot(), title: 'CAPA action: 2. Retrain the packaging line' }])).toMatchObject({ created: 1, superseded: 1 });
    const rows = (await q.query('SELECT title,is_current,previous_version_id,id FROM cre_evidence_sources ORDER BY id')).rows;
    expect(rows.map(row => row.is_current)).toEqual([false, true]);
    expect(rows[1]).toMatchObject({ title: 'CAPA action: 2. Retrain the packaging line', previous_version_id: rows[0].id });
  });
  it('does not retire records omitted from another actor’s admitted view', async () => {
    await capture([snapshot()]);
    expect(await capture([])).toMatchObject({ created: 0, superseded: 0 });
    expect((await q.query('SELECT is_current,extracted_text FROM cre_evidence_sources')).rows).toEqual([{ is_current: true, extracted_text: snapshot().text }]);
  });
  it('rolls capture and retirement back together when its audit cannot be written', async () => {
    await capture([snapshot()]); h.failAudit = true;
    await expect(capture([snapshot('changed record')])).rejects.toThrow('audit unavailable');
    expect((await q.query('SELECT is_current,extracted_text FROM cre_evidence_sources')).rows).toEqual([{ is_current: true, extracted_text: snapshot().text }]);
  });
  it('refuses duplicate/empty identities before changing the catalogue', async () => {
    await expect(capture([snapshot(), snapshot()])).rejects.toThrow();
    await expect(capture([{ ...snapshot(), text: '   ' }])).rejects.toThrow();
    expect((await q.query('SELECT id FROM cre_evidence_sources')).rows).toHaveLength(0);
  });
});

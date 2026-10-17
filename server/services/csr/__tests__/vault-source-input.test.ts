import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { listCsrVaultSources, previewCsrVaultSource, withCsrVaultSource } from '../vault-source-input.js';
import { sourceFixture } from './source-input-fixture.js';

const PROGRAM = '11111111-2222-4333-8444-000000000011';
const SOURCE = '11111111-2222-4333-8444-000000000022';
const scope = { organizationId: 7, userId: 5, programId: PROGRAM };
function fixture() {
  const bytes = Buffer.from(JSON.stringify(sourceFixture()));
  const hash = createHash('sha256').update(bytes).digest('hex');
  const control = { role: 'manager' as string | null, program: true, private: false, current: true, source: true,
    stage: 'approved', approvedHash: hash, bytes, storeError: false, failCommit: false };
  const events: string[] = [];
  const record = { id: SOURCE, document_title: 'Synthetic supporting extract', version: '1.0', content_hash: hash,
    file_name: 'supporting.json', mime_type: 'application/json', storage_version_id: 'version', storage_provider: 'local', s3_key: null, file_size: bytes.length };
  const readVaultSource = (sql: string, values?: unknown[]) => {
    expect(values).toEqual(sql.includes('LIMIT 101') ? [7, PROGRAM] : [SOURCE, 7, PROGRAM]);
    expect(sql).toContain('document_data_dispositions');
    return { rows: control.source ? [{ ...record, document_id: SOURCE, stage: control.stage, approved_hash: control.approvedHash }] : [] };
  };
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    events.push(sql);
    if (control.storeError) throw new Error('Synthetic inaccessible database');
    if (sql === 'COMMIT' && control.failCommit) throw new Error('Synthetic failed source-lock commit');
    if (/FROM regulatory_programs\s+WHERE/.test(sql)) return { rows: control.program ? [{ id: PROGRAM }] : [] };
    if (/FROM organization_users ou/.test(sql)) return { rows: control.role === null ? [] : [{ role: control.role }] };
    if (/FROM projects\s+WHERE/.test(sql)) return { rows: [{ id: 11, clientWorkspaceId: null }] };
    if (/FROM projects p/.test(sql)) return { rows: [{ id: 11, owner_id: 99, created_by_id: 99, settings: {},
      visibility: control.private ? 'private' : 'org_public', members: [], review_assigned: false }] };
    if (/AS current FROM vault.documents/.test(sql)) return { rows: [{ current: control.current }] };
    if (/FROM vault.documents d/.test(sql)) return readVaultSource(sql, values);
    if (/FROM canonical_documents/.test(sql)) return { rows: [{ canonical_id: 'canonical', stage: control.stage, content_hash: control.approvedHash }] };
    return { rows: [] };
  });
  const release = vi.fn();
  const connectable = { query, connect: async () => ({ query, release }) };
  const readBytes = vi.fn(async () => control.bytes);
  return { control, record, events, query, connectable, readBytes, release, selection: { documentId: SOURCE, expectedSha256: hash } };
}

describe('exact canonical Vault supporting source', () => {
  it('previews actual deterministic aggregate tables with exact receipt and no participant rows', async () => {
    const f = fixture();
    const result = await previewCsrVaultSource(f.connectable, scope, f.selection, { readBytes: f.readBytes });
    expect(result.source).toMatchObject({ documentId: SOURCE, sha256: f.selection.expectedSha256, sourceApproval: 'canonical-lifecycle',
      clinicalVerification: 'not-established', studyInfo: { sponsor: 'Synthetic sponsor' } });
    expect(result.tables.aeOverallSummary.rows[0][1]).toBe('1 (50.0%)');
    expect(JSON.stringify(result)).not.toContain('synthetic-a');
    expect(f.events[0]).toBe('BEGIN'); expect(f.events.at(-1)).toBe('COMMIT'); expect(f.release).toHaveBeenCalledOnce();
    expect(f.events.findIndex(sql => sql.includes('document_data_dispositions') && sql.includes('pg_advisory')))
      .toBeLessThan(f.events.findIndex(sql => sql.includes('FOR SHARE OF d')));
  });
  it('holds exact source locks until durable inputs are captured, then releases before unrelated composers', async () => {
    const f = fixture();
    await withCsrVaultSource(f.connectable, scope, f.selection, { requireApproval: true, consume: async (loaded, captured) => {
      expect(loaded.envelope.studyData.studyId).toBe('SYN-001'); expect(f.events).not.toContain('COMMIT');
      f.events.push('durable-input-capture'); await captured(); f.events.push('compose'); return 'built';
    }, deps: { readBytes: f.readBytes } });
    expect(f.events.indexOf('COMMIT')).toBeGreaterThan(f.events.indexOf('durable-input-capture'));
    expect(f.events.indexOf('COMMIT')).toBeLessThan(f.events.indexOf('compose'));
    expect(f.events.filter(e => e === 'COMMIT')).toHaveLength(1);
  });
  it('rolls back and performs no downstream work when input capture fails', async () => {
    const f = fixture(); const compose = vi.fn();
    await expect(withCsrVaultSource(f.connectable, scope, f.selection, { requireApproval: true, consume: async () => {
      throw new Error('Synthetic input capture failed');
    }, deps: { readBytes: f.readBytes } }).then(compose)).rejects.toThrow('capture failed');
    expect(compose).not.toHaveBeenCalled(); expect(f.events.at(-1)).toBe('ROLLBACK');
  });
  it('previews unapproved source honestly but refuses to include it in a new run', async () => {
    const f = fixture(); f.control.stage = 'draft';
    expect(await previewCsrVaultSource(f.connectable, scope, f.selection, { readBytes: f.readBytes })).toMatchObject({ approved: false, source: { sourceApproval: 'not-approved' } });
    const save = vi.fn();
    await expect(withCsrVaultSource(f.connectable, scope, f.selection, { requireApproval: true, consume: save, deps: { readBytes: f.readBytes } })).rejects.toMatchObject({ code: 'CSR_SOURCE_APPROVAL_REQUIRED', status: 409 });
    expect(save).not.toHaveBeenCalled();
  });
  it.each(['review', 'superseded', 'withdrawn'])('refuses a %s lifecycle for new runs', async stage => {
    const f = fixture(); f.control.stage = stage;
    await expect(withCsrVaultSource(f.connectable, scope, f.selection, { requireApproval: true, consume: vi.fn(), deps: { readBytes: f.readBytes } })).rejects.toMatchObject({ code: 'CSR_SOURCE_APPROVAL_REQUIRED' });
    expect(f.readBytes).not.toHaveBeenCalled();
  });
  it('refuses an approval for different bytes', async () => {
    const f = fixture(); f.control.approvedHash = 'b'.repeat(64);
    await expect(withCsrVaultSource(f.connectable, scope, f.selection, { requireApproval: true, consume: vi.fn(), deps: { readBytes: f.readBytes } })).rejects.toMatchObject({ code: 'CSR_SOURCE_APPROVAL_REQUIRED' });
  });
  it.each(['private', 'revoked', 'foreign', 'withdrawn', 'superseded', 'stale-digest', 'corrupt-bytes', 'invalid-json', 'invalid-observations', 'oversized'] as const)('refuses %s before publishing tables', async mode => {
    const f = fixture();
    if (mode === 'private') { f.control.private = true; f.control.role = 'member'; }
    if (mode === 'revoked') f.control.role = null;
    if (mode === 'foreign') f.control.program = false;
    if (mode === 'withdrawn') f.control.source = false;
    if (mode === 'superseded') f.control.current = false;
    if (mode === 'stale-digest') f.selection.expectedSha256 = 'c'.repeat(64);
    if (mode === 'corrupt-bytes') f.control.bytes = Buffer.from('changed');
    if (mode === 'invalid-json' || mode === 'invalid-observations') {
      f.control.bytes = Buffer.from(mode === 'invalid-json' ? '{broken' : '{}');
      f.record.content_hash = createHash('sha256').update(f.control.bytes).digest('hex'); f.selection.expectedSha256 = f.record.content_hash;
    }
    if (mode === 'oversized') f.record.file_size = 6 * 1024 * 1024;
    await expect(previewCsrVaultSource(f.connectable, scope, f.selection, { readBytes: f.readBytes })).rejects.toHaveProperty('status');
    expect(f.events).not.toContain('COMMIT'); expect(f.events.at(-1)).toBe('ROLLBACK');
    if (['private', 'revoked', 'foreign', 'withdrawn', 'superseded', 'stale-digest', 'oversized'].includes(mode)) expect(f.readBytes).not.toHaveBeenCalled();
  });
  it('allows a read-only member to preview an accessible source but not start a source-bound run', async () => {
    const f = fixture(); f.control.role = 'viewer';
    expect((await previewCsrVaultSource(f.connectable, scope, f.selection, { readBytes: f.readBytes })).approved).toBe(true);
    await expect(withCsrVaultSource(f.connectable, scope, f.selection, { requireApproval: true, consume: vi.fn(), deps: { readBytes: f.readBytes } })).rejects.toMatchObject({ status: 403 });
  });
  it('does not turn store errors into an empty candidate list', async () => {
    const f = fixture(); f.control.storeError = true;
    await expect(listCsrVaultSources(f.connectable, scope)).rejects.toMatchObject({ status: 503 });
  });
  it('lists metadata only and requires the exact approval hash', async () => {
    const f = fixture();
    expect(await listCsrVaultSources(f.connectable, scope)).toMatchObject({ limitReached: false, sources: [{ documentId: SOURCE, approved: true }] });
    f.control.approvedHash = 'd'.repeat(64);
    expect(await listCsrVaultSources(f.connectable, scope)).toMatchObject({ sources: [{ approved: false }] });
    expect(f.readBytes).not.toHaveBeenCalled();
  });
  it('does not echo participant cell values or unknown uploaded keys in schema validation issues', async () => {
    const f = fixture(); const raw = sourceFixture();
    const sentinel = 'private-participant-cell-sentinel';
    (raw.studyData.demographics[0] as unknown as Record<string, unknown>).sex = sentinel;
    (raw as unknown as Record<string, unknown>)[sentinel] = 'unrecognized uploaded key';
    f.control.bytes = Buffer.from(JSON.stringify(raw));
    f.record.content_hash = createHash('sha256').update(f.control.bytes).digest('hex'); f.selection.expectedSha256 = f.record.content_hash;
    try { await previewCsrVaultSource(f.connectable, scope, f.selection, { readBytes: f.readBytes }); throw new Error('Invalid source must refuse'); }
    catch (error) {
      expect(error).toMatchObject({ status: 422, code: 'CSR_SOURCE_INPUTS_INVALID' });
      const issues = (error as { issues: unknown }).issues;
      expect(JSON.stringify(issues)).not.toContain(sentinel);
      expect(JSON.stringify(issues)).toContain('studyData.demographics.0.sex');
    }
  });
});

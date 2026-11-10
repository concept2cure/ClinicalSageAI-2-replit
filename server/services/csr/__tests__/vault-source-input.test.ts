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
  it('lists the source and requires the exact approval hash', async () => {
    const f = fixture(); const deps = { readBytes: f.readBytes };
    expect(await listCsrVaultSources(f.connectable, scope, deps)).toMatchObject({ limitReached: false, sources: [{ documentId: SOURCE, approved: true }] });
    f.control.approvedHash = 'd'.repeat(64);
    expect(await listCsrVaultSources(f.connectable, scope, deps)).toMatchObject({ sources: [{ approved: false }] });
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

/**
 * D2-CSR F5 (2026-11-05, the CDISC pilot demo walk): the "Clinical source" picker offered every JSON file in the
 * project's Vault, the bundle's efficacy results file among them, which preview then refuses. The list now
 * offers what preview and freeze accept, by the same rule (`load`): a file whose JSON declares the ADaM bundle
 * manifest format or the supporting-source format. A file it cannot read is named, never dropped.
 */
describe('the clinical source list offers clinical sources only', () => {
  const id = (n: number) => `11111111-2222-4333-8444-0000000001${String(n).padStart(2, '0')}`;
  const json = (value: unknown) => Buffer.from(JSON.stringify(value));
  const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  function vault() {
    const f = fixture();
    const stored = new Map<string, Buffer>();
    const rows: Array<Record<string, unknown>> = [];
    const add = (n: number, title: string, bytes: Buffer, extra: Record<string, unknown> = {}) => {
      stored.set(id(n), bytes);
      rows.push({ ...f.record, id: id(n), document_id: id(n), document_title: title, content_hash: digest(bytes), file_size: bytes.length,
        stage: 'approved', approved_hash: digest(bytes), ...extra });
    };
    const normal = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql: string, values?: unknown[]) => sql.includes('LIMIT 101')
      ? { rows } as unknown as Awaited<ReturnType<typeof normal>> : normal(sql, values));
    const readBytes = vi.fn(async (row: { id: string }) => {
      const bytes = stored.get(row.id);
      if (!bytes) throw new Error('Synthetic store outage');
      return bytes;
    });
    return { f, add, stored, readBytes, list: () => listCsrVaultSources(f.connectable, scope, { readBytes }) };
  }

  it('offers the bundle manifest and a supporting source, and not the efficacy results, a dataset or other JSON', async () => {
    const v = vault();
    v.add(1, 'cdiscpilot01-adam-bundle', json({ format: 'concept2cure.csr-adam-bundle.v1', dataCutDate: '2015-03-05' }));
    v.add(2, 'cdiscpilot01-efficacy-results', json({ format: 'concept2cure.csr-efficacy-results.v1', protocolNumber: 'CDISCPILOT01', results: [] }));
    v.add(3, 'Synthetic supporting extract', json(sourceFixture()));
    v.add(4, 'adsl (Dataset-JSON)', json({ datasetJSONVersion: '1.1.0', itemGroupOID: 'IG.ADSL', rows: [] }));
    v.add(5, 'notes', Buffer.from('{not json'));
    v.add(6, 'large export', json({ format: 'concept2cure.csr-source.v1' }), { file_size: 6 * 1024 * 1024 });
    const listed = await v.list();
    expect(listed.sources.map(source => source.documentTitle)).toEqual(['cdiscpilot01-adam-bundle', 'Synthetic supporting extract']);
    expect(listed).toMatchObject({ limitReached: false, unreadable: [], notClinicalSources: 4 });
    // A file larger than a clinical source may be (preview refuses it by size) is not read at all.
    expect(v.readBytes.mock.calls.map(([row]) => row.id)).not.toContain(id(6));
  });

  it('offers a manifest that declares its format but breaks its contract, so its preview names the issues', async () => {
    const v = vault();
    v.add(1, 'manifest with a missing dataset', json({ format: 'concept2cure.csr-adam-bundle.v1' }));
    expect((await v.list()).sources.map(source => source.documentId)).toEqual([id(1)]);
  });

  it('names a file it could not read, or whose bytes fail their digest, instead of leaving it out', async () => {
    const v = vault();
    v.add(1, 'cdiscpilot01-adam-bundle', json({ format: 'concept2cure.csr-adam-bundle.v1' }));
    v.add(2, 'unreadable manifest', json({ format: 'concept2cure.csr-adam-bundle.v1' }));
    v.add(3, 'changed manifest', json({ format: 'concept2cure.csr-adam-bundle.v1' }));
    v.stored.delete(id(2));
    v.stored.set(id(3), json({ format: 'concept2cure.csr-adam-bundle.v1', changed: true }));
    const listed = await v.list();
    expect(listed.sources.map(source => source.documentId)).toEqual([id(1)]);
    expect(listed.unreadable).toEqual([
      { documentId: id(2), documentTitle: 'unreadable manifest', version: '1.0' },
      { documentId: id(3), documentTitle: 'changed manifest', version: '1.0' }]);
    expect(listed.notClinicalSources).toBe(0);
  });

  it('reads at most a bounded number of bytes, and says the list reached its limit beyond them', async () => {
    const v = vault();
    for (let n = 1; n <= 7; n++) v.add(n, `source ${n}`, json(sourceFixture()), { file_size: 5 * 1024 * 1024 });
    const listed = await v.list();
    expect(listed.sources).toHaveLength(5);
    expect(listed.limitReached).toBe(true);
    expect(v.readBytes).toHaveBeenCalledTimes(5);
  });
});

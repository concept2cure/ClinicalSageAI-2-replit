/**
 * CSR slice 7 through the governed Vault path: the narrative job reads the
 * subject-level ADaM rows (ADMH included) of the bundle a run pins, only when
 * the manifest and every dataset are the exact current approved versions; a
 * hand-built csr-source.v1 file, which holds no subject-level dates, is refused
 * by name. SYNTHETIC data.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { readCsrAdamDatasets } from '../vault-source-input.js';
import { datasetJson, efficacyResults } from './support/adam-lmn201-synthetic.js';
import { narrativeBundle, SYN_STUDY } from './support/adam-narrative-synthetic.js';

const PROGRAM = '11111111-2222-4333-8444-000000000011';
const scope = { organizationId: 7, userId: 5, programId: PROGRAM };
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const MANIFEST = '11111111-2222-4333-8444-000000000099';

function fixture(manifestDoc?: unknown) {
  const files: Record<string, unknown> = {
    ADSL: datasetJson('ADSL', [['STUDYID', 'string'], ['USUBJID', 'string'], ['TRT01P', 'string']], [[SYN_STUDY, `${SYN_STUDY}-0001`, 'LMN-201']]),
    ADAE: datasetJson('ADAE', [['STUDYID', 'string'], ['USUBJID', 'string'], ['AEDECOD', 'string']], [[SYN_STUDY, `${SYN_STUDY}-0001`, 'Headache']]),
    ADMH: datasetJson('ADMH', [['STUDYID', 'string'], ['USUBJID', 'string'], ['MHDECOD', 'string']], [[SYN_STUDY, `${SYN_STUDY}-0001`, 'Asthma']]),
    efficacy: efficacyResults(),
  };
  const docs = new Map<string, { bytes: Buffer; stage: string; name: string }>();
  const refs: Record<string, { documentId: string; expectedSha256: string }> = {};
  Object.entries(files).forEach(([key, doc], i) => {
    const documentId = `11111111-2222-4333-8444-0000000002${String(i).padStart(2, '0')}`;
    const bytes = Buffer.from(JSON.stringify(doc));
    docs.set(documentId, { bytes, stage: 'approved', name: `${key.toLowerCase()}.json` });
    refs[key] = { documentId, expectedSha256: sha(bytes) };
  });
  const base = narrativeBundle();
  const manifest = Buffer.from(JSON.stringify(manifestDoc ?? { ...base, datasets: { ADSL: refs.ADSL, ADAE: refs.ADAE, ADMH: refs.ADMH }, efficacyResults: refs.efficacy }));
  docs.set(MANIFEST, { bytes: manifest, stage: 'approved', name: 'bundle.json' });
  const rowOf = (id: string) => {
    const d = docs.get(id)!;
    return { id, document_title: d.name, version: '1', content_hash: sha(d.bytes), file_name: d.name, mime_type: 'application/json',
      storage_version_id: 'v', storage_provider: 'local', s3_key: null, file_size: d.bytes.length };
  };
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (/FROM regulatory_programs\s+WHERE/.test(sql)) return { rows: [{ id: PROGRAM }] };
    if (/FROM organization_users ou/.test(sql)) return { rows: [{ role: 'manager' }] };
    if (/FROM projects\s+WHERE/.test(sql)) return { rows: [{ id: 11, clientWorkspaceId: null }] };
    if (/FROM projects p/.test(sql)) return { rows: [{ id: 11, owner_id: 99, created_by_id: 99, settings: {}, visibility: 'org_public', members: [], review_assigned: false }] };
    if (/AS current FROM vault.documents/.test(sql)) return { rows: [{ current: true }] };
    if (/FROM vault.documents d/.test(sql)) return { rows: docs.has(String(values?.[0])) ? [rowOf(String(values?.[0]))] : [] };
    if (/FROM canonical_documents/.test(sql)) { const d = docs.get(String(values?.[1]))!; return { rows: [{ canonical_id: 'c', stage: d.stage, content_hash: sha(d.bytes) }] }; }
    return { rows: [] };
  });
  const connectable = { query, connect: async () => ({ query, release: vi.fn() }) };
  const deps = { readBytes: vi.fn(async (row: { id: string }) => docs.get(row.id)!.bytes) };
  return { docs, refs, connectable, deps, selection: { documentId: MANIFEST, expectedSha256: sha(manifest) }, query };
}

describe('readCsrAdamDatasets (SYNTHETIC data)', () => {
  it('returns the bundle and its subject-level datasets, ADMH included, and commits', async () => {
    const f = fixture();
    const out = await readCsrAdamDatasets(f.connectable, scope, f.selection, f.deps);
    expect(out.bundle.adverseEventsOfSpecialInterest).toEqual({ flagVariable: 'AESIFL' });
    expect(Object.keys(out.datasets).sort()).toEqual(['ADAE', 'ADMH', 'ADSL']);
    expect(out.datasets.ADMH!.rows[0].MHDECOD).toBe('Asthma');
    expect(f.query.mock.calls.map(c => c[0])).toContain('COMMIT');
  });

  it('refuses while any dataset is not approved at its pinned version, and rolls back', async () => {
    const f = fixture();
    f.docs.get(f.refs.ADMH.documentId)!.stage = 'review';
    await expect(readCsrAdamDatasets(f.connectable, scope, f.selection, f.deps)).rejects.toMatchObject({ code: 'CSR_SOURCE_APPROVAL_REQUIRED' });
    expect(f.query.mock.calls.map(c => c[0])).toContain('ROLLBACK');
  });

  it('refuses a hand-built csr-source.v1 file by name', async () => {
    const f = fixture({ format: 'concept2cure.csr-source.v1' });
    await expect(readCsrAdamDatasets(f.connectable, scope, f.selection, f.deps)).rejects.toMatchObject({ code: 'CSR_NARRATIVE_ADAM_REQUIRED', status: 422 });
  });
});

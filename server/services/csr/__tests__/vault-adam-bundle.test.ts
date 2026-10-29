/**
 * CSR slice 6 through the governed Vault path: a csr-adam-bundle.v1 manifest
 * names ADaM datasets and the SAP efficacy output by document and exact digest;
 * each is held to the manifest's own checks (current version, digest, lifecycle
 * approval) before the engine derives and tabulates. SYNTHETIC data throughout.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { previewCsrVaultSource, withCsrVaultSource } from '../vault-source-input.js';
import { adae, adcm, adex, adlb, adsl, advs, bundle, efficacyResults } from './support/adam-lmn201-synthetic.js';

const PROGRAM = '11111111-2222-4333-8444-000000000011';
const scope = { organizationId: 7, userId: 5, programId: PROGRAM };
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function fixture(overrides: { adsl?: unknown } = {}) {
  const files: Record<string, { name: string; doc: unknown }> = {
    ADSL: { name: 'adsl.json', doc: overrides.adsl ?? adsl() }, ADAE: { name: 'adae.json', doc: adae() },
    ADEX: { name: 'adex.json', doc: adex() }, ADLB: { name: 'adlb.ndjson', doc: adlb() },
    ADVS: { name: 'advs.json', doc: advs() }, ADCM: { name: 'adcm.json', doc: adcm() },
    efficacy: { name: 'sap-efficacy.json', doc: efficacyResults() },
  };
  const docs = new Map<string, { file_name: string; bytes: Buffer; stage: string }>();
  const refs: Record<string, { documentId: string; expectedSha256: string }> = {};
  Object.entries(files).forEach(([key, f], i) => {
    const documentId = `11111111-2222-4333-8444-0000000001${String(i).padStart(2, '0')}`;
    let bytes = Buffer.from(JSON.stringify(f.doc));
    if (f.name.endsWith('.ndjson')) {
      const { rows, ...meta } = f.doc as { rows: unknown[] };
      bytes = Buffer.from([JSON.stringify(meta), ...rows.map(r => JSON.stringify(r))].join('\n'));
    }
    docs.set(documentId, { file_name: f.name, bytes, stage: 'approved' });
    refs[key] = { documentId, expectedSha256: sha(bytes) };
  });
  const manifest = Buffer.from(JSON.stringify(bundle(refs)));
  const MANIFEST = '11111111-2222-4333-8444-000000000099';
  docs.set(MANIFEST, { file_name: 'lmn201-adam-bundle.json', bytes: manifest, stage: 'approved' });
  const rowOf = (id: string) => {
    const d = docs.get(id)!;
    return { id, document_title: d.file_name, version: '1.0', content_hash: sha(d.bytes), file_name: d.file_name,
      mime_type: 'application/json', storage_version_id: 'v', storage_provider: 'local', s3_key: null, file_size: d.bytes.length };
  };
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (/FROM regulatory_programs\s+WHERE/.test(sql)) return { rows: [{ id: PROGRAM }] };
    if (/FROM organization_users ou/.test(sql)) return { rows: [{ role: 'manager' }] };
    if (/FROM projects\s+WHERE/.test(sql)) return { rows: [{ id: 11, clientWorkspaceId: null }] };
    if (/FROM projects p/.test(sql)) return { rows: [{ id: 11, owner_id: 99, created_by_id: 99, settings: {}, visibility: 'org_public', members: [], review_assigned: false }] };
    if (/AS current FROM vault.documents/.test(sql)) return { rows: [{ current: true }] };
    if (/FROM vault.documents d/.test(sql)) return { rows: docs.has(String(values?.[0])) ? [rowOf(String(values?.[0]))] : [] };
    if (/FROM canonical_documents/.test(sql)) {
      const id = String(values?.[1]); const d = docs.get(id)!;
      return { rows: [{ canonical_id: 'c', stage: d.stage, content_hash: sha(d.bytes) }] };
    }
    return { rows: [] };
  });
  const connectable = { query, connect: async () => ({ query, release: vi.fn() }) };
  const readBytes = vi.fn(async (row: { id: string }) => docs.get(row.id)!.bytes);
  return { docs, refs, connectable, deps: { readBytes }, selection: { documentId: MANIFEST, expectedSha256: sha(manifest) } };
}

describe('an approved ADaM bundle in Vault tabulates through the governed source path', () => {
  it('previews engine tables derived from the datasets, bound to the manifest digest, with no subject identifier', async () => {
    const f = fixture();
    const out = await previewCsrVaultSource(f.connectable, scope, f.selection, f.deps);
    expect(out.approved).toBe(true);
    expect(out.source).toMatchObject({ documentId: f.selection.documentId, sha256: f.selection.expectedSha256, studyId: 'SYN-LMN201-B', sourceApproval: 'canonical-lifecycle' });
    expect(out.tables.disposition.rows.find(r => r[0] === 'Death')).toEqual(['Death', '0', '1', '1']);
    expect(out.tables.vitalSigns?.rows).toHaveLength(2);
    expect(out.tables.labShifts?.rows).toHaveLength(2); // ADLB arrived as NDJSON
    expect(JSON.stringify(out)).not.toMatch(/SYN-LMN201-B-S\d\d/);
    expect(f.deps.readBytes).toHaveBeenCalledTimes(8); // the manifest, six datasets and the efficacy file
  });

  it('refuses a run while any named file is unapproved, and previews it as not approved', async () => {
    const f = fixture();
    f.docs.get(f.refs.ADAE.documentId)!.stage = 'review';
    expect((await previewCsrVaultSource(f.connectable, scope, f.selection, f.deps)).approved).toBe(false);
    await expect(withCsrVaultSource(f.connectable, scope, f.selection, { requireApproval: true, consume: vi.fn(), deps: f.deps }))
      .rejects.toMatchObject({ code: 'CSR_SOURCE_APPROVAL_REQUIRED', status: 409 });
  });

  it('refuses a dataset whose current bytes are not the version the manifest pins', async () => {
    const f = fixture();
    const changed = f.docs.get(f.refs.ADEX.documentId)!;
    changed.bytes = Buffer.concat([changed.bytes, Buffer.from(' ')]);
    await expect(previewCsrVaultSource(f.connectable, scope, f.selection, f.deps)).rejects.toMatchObject({ code: 'CSR_SOURCE_CHANGED' });
  });

  it('carries the derivation’s typed refusal out of the Vault path', async () => {
    const f = fixture({ adsl: adsl((row, i) => (i === 1 ? row.map((v, c) => (c === 5 ? 'N' : v)) : row)) });
    await expect(previewCsrVaultSource(f.connectable, scope, f.selection, f.deps))
      .rejects.toMatchObject({ code: 'CSR_ADAM_SUBJECT_NOT_IN_SAFETY_POPULATION', status: 422 });
  });
});

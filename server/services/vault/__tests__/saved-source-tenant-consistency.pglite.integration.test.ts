/** Actual saved-source getter/verifier SQL over canonical catalog/disposition
 * migrations. Legacy tenant conflicts are deliberate TEST-ONLY seeds.
 * This does not qualify runtime-role RLS or independent connection scheduling. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { PREREQ, VAULT_DDL, AUTHORING_ACCESS_DDL, AUTHOR, PROGRAM, PROGRAM_B, ORG } from '../../../routes/__tests__/_authoring-canvas-fixture';
import type { GatewayRequest } from '../../ai-gateway/types';
import { runWithTenantScope } from '../../../db/tenantStore';

const h = vi.hoisted(() => ({ query: vi.fn(), requests: [] as GatewayRequest[], mutate: null as null | (() => Promise<void>) }));
vi.mock('../../../db.js', () => {
  const pool = { query: h.query, connect: async () => ({ query: h.query, release: () => {} }) };
  return { pool, getPool: () => pool, db: {} };
});
vi.mock('../../ai-gateway/gateway', () => ({ getGateway: () => ({ route: async (request: GatewayRequest) => {
  h.requests.push(request); await request.beforeDispatch?.(); await h.mutate?.();
  throw Object.assign(new Error('No qualified advisory model is available.'), { name: 'GatewayPolicyError', code: 'MODEL_NOT_PQ_QUALIFIED' });
} }) }));
import { loadDocumentForOrg, type Queryable } from '../document-catalog.service';
import { verifyDraftSourceReferences } from '../../authoring/draft-source-references';
import { draftSourceIdentityForText } from '../../ana/draft-source-identity';
import { runSubAgent, type SubAgentHost } from '../../ana/sub-agent';
import { newAgentTurnCounters, liveAgentCounts } from '../../ana/sub-agent-limits';
import { registerDocumentCatalogHandlers } from '../../ana/document-catalog-tools';
import type { RegisterFn } from '../../ana/document-tools-shared';
import { captureCurrentRunSourceGate, createRunSourceAuthority, runWithSourceAuthority } from '../../ai-gateway/model-call-scope';
vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 });

let db: JourneyDb;
// The journey pool hides rowCount in its declared interface. These source
// readers only issue SELECTs: preserve actual SQL rows and report their count.
const sourceExecutor: Queryable = {
  query: async (text, values) => {
    const { rows } = await db.pool.query(text, values);
    return { rows, rowCount: rows.length };
  },
};
beforeAll(async () => {
  db = await createJourneyDb({
    prereqSql: PREREQ + AUTHORING_ACCESS_DDL + VAULT_DDL,
    migrations: ['migrations/20260905_document_catalog.sql', 'migrations/20261008e_document_catalog_attribution.sql', 'migrations/20261006_document_data_dispositions.sql'],
  });
  h.query.mockImplementation(async (text: string, values?: unknown[]) => {
    const { rows } = await db.pool.query(text, values); return { rows, rowCount: rows.length };
  });
});
afterAll(async () => { try { assertNoSchemaGaps(db); } finally { await db?.close(); } });

async function source(organizationId: number | null): Promise<{ id: string; hash: string }> {
  const id = randomUUID();
  const hash = createHash('sha256').update(id).digest('hex');
  await db.pool.query(`INSERT INTO vault.documents
    (id,program_id,organization_id,document_code,document_title,document_type,file_name,content_hash,extracted_text,processing_status)
    VALUES ($1,$2,$3,$5,'Recorded study evidence','csr','study.pdf',$4,'Evidence','INDEXED')`,
  [id, PROGRAM, organizationId, hash, `TLF-${id}`]);
  await db.pool.query(`INSERT INTO vault.document_catalog (document_id,content_hash,catalog_status,char_count)
    VALUES ($1,$2,'extracted',8)`, [id, hash]);
  return { id, hash };
}
const references = (documentId: string, hash: string) => {
  const span = { start: 0, end: 8, totalChars: 8 };
  return [{ documentId, contentHash: hash, span, ...draftSourceIdentityForText('Evidence', span) }];
};

describe('actual project-document read routing authority', () => {
  it('carries the persisted classification and rechecks classification and extraction bytes independently of the stored file hash', async () => {
    const { id } = await source(ORG);
    await db.pool.query("UPDATE vault.documents SET classification='CONFIDENTIAL' WHERE id=$1", [id]);
    const handlers = new Map<string, Parameters<RegisterFn>[1]>();
    registerDocumentCatalogHandlers((name, handler) => { handlers.set(name, handler); });
    const actor = { organizationId: ORG, userId: Number(AUTHOR.id), projectId: PROGRAM };
    await runWithTenantScope({ tenantId: String(ORG), source: 'test' }, () => runWithSourceAuthority(createRunSourceAuthority(actor), async () => {
      const result = JSON.parse(await handlers.get('read_project_document')!({ document_id: id },
        { organizationId: ORG, userId: Number(AUTHOR.id), projectRef: PROGRAM, sqlClient: sourceExecutor }));
      expect(result, JSON.stringify(result)).toMatchObject({ documentId: id, window: { text: 'Evidence' } });
      const gate = captureCurrentRunSourceGate(actor)!; expect(gate.tiers).toEqual([3, 2]); await gate.recheck();
      await db.pool.query("UPDATE vault.documents SET classification='PUBLIC' WHERE id=$1", [id]);
      await expect(gate.recheck()).rejects.toThrow('SOURCE_ROUTING_CHANGED');
      await db.pool.query("UPDATE vault.documents SET classification='CONFIDENTIAL',extracted_text='Replaced' WHERE id=$1", [id]);
      await expect(gate.recheck()).rejects.toThrow('SOURCE_ROUTING_CHANGED');
    }));
  });
});

describe('new current-only saved-source admission requires a consistent recorded tenant', () => {
  it.each([
    { label: 'foreign', organizationId: ORG + 1 },
    { label: 'unassigned', organizationId: null },
  ])('refuses a legacy $label recorded tenant despite a matching program and valid catalog', async ({ organizationId }) => {
    const { id, hash } = await source(organizationId);
    const read = loadDocumentForOrg(id, ORG, { executor: sourceExecutor, userId: Number(AUTHOR.id), programId: PROGRAM, currentOnly: true, includeText: true });
    const verified = () => verifyDraftSourceReferences(references(id, hash), sourceExecutor, ORG, PROGRAM, { actor: AUTHOR });
    if (organizationId === null) {
      await expect.soft(read).rejects.toMatchObject({ status: 409, code: 'VAULT_TENANT_RECONCILIATION_REQUIRED' });
      await expect.soft(verified()).rejects.toMatchObject({ status: 409, code: 'VAULT_TENANT_RECONCILIATION_REQUIRED' });
    } else {
      expect.soft(await read).toBeNull();
      await expect.soft(verified()).rejects.toThrow(/could not be verified/);
    }
    expect((await db.pool.query('SELECT organization_id,program_id,content_hash FROM vault.documents WHERE id=$1', [id])).rows)
      .toEqual([{ organization_id: organizationId, program_id: PROGRAM, content_hash: hash }]);
  });

  it('retains exact source verification when the document and program agree on the tenant', async () => {
    const { id, hash } = await source(ORG);
    expect(await loadDocumentForOrg(id, ORG, { executor: sourceExecutor, userId: Number(AUTHOR.id), programId: PROGRAM, currentOnly: true, includeText: true }))
      .toMatchObject({ id, programId: PROGRAM, contentHash: hash, catalog: { status: 'extracted', contentHash: hash } });
    expect(await verifyDraftSourceReferences(references(id, hash), sourceExecutor, ORG, PROGRAM, { actor: AUTHOR }))
      .toEqual([expect.objectContaining({ documentId: id, programId: PROGRAM, contentHash: hash })]);
  });
});

const trialEvidence = 'In Study DPL-301, a total of 300 patients were randomized. The protocol defined the analysis.';
async function clinicalSource(options: { text?: string; organizationId?: number; programId?: string } = {}) {
  const saved = await source(options.organizationId ?? ORG), text = options.text ?? trialEvidence;
  await db.pool.query('UPDATE vault.documents SET extracted_text=$1,classification=$2,program_id=$3 WHERE id=$4', [text, 'CONFIDENTIAL', options.programId ?? PROGRAM, saved.id]);
  await db.pool.query('UPDATE vault.document_catalog SET char_count=$1,extraction_method=$2 WHERE document_id=$3', [text.length, 'pdf-text', saved.id]);
  return saved;
}
function verificationHost(offered = true): SubAgentHost {
  return { organizationId: ORG, parentRunId: 'parent-real-source', round: 1, agents: newAgentTurnCounters(),
    governedTools: offered ? [{ name: 'read_project_document', description: 'Existing bounded read', input_schema: { type: 'object', properties: {} } }] : [],
    hold: async () => 'running', expiredSignal: new AbortController().signal, heldMs: () => 0, emit: () => {} };
}
async function verifyStored(documentId: string, text = 'In Study DPL-301, a total of 999 patients were randomized [1]. The source states "The protocol defined the analysis."', offered = true) {
  h.requests = [];
  const raw = await runWithTenantScope({ tenantId: String(ORG), source: 'test' }, () => runSubAgent({ role: 'verify', objective: 'Verify the saved study evidence',
    instructions: 'Compare actual saved source figures independently. Caller flags are not evidence.', text_to_check: text, source_document_ids: [documentId],
    inputSensitivityTiers: [0], scientificQualification: 'verified' },
  { organizationId: ORG, userId: Number(AUTHOR.id), projectRef: PROGRAM, sqlClient: sourceExecutor }, verificationHost(offered)));
  expect(liveAgentCounts().total).toBe(0);
  return JSON.parse(raw);
}
describe('child verification independently reads the current actor-scoped Vault version', () => {
  it.each([
    { label: 'correct quotation with wrong randomized count', text: trialEvidence, draft: 'In Study DPL-301, a total of 999 patients were randomized [1]. The source states "The protocol defined the analysis."' },
    { label: 'arm-swapped comparison', text: 'In the safety population of Study DX-301, serious adverse events were reported in 4.6% of Drug X patients and 3.3% of placebo patients.', draft: 'In the safety population of Study DX-301, serious adverse events were reported in 3.3% of Drug X patients and 4.6% of placebo patients.' },
    { label: 'explicit-zero denial', text: 'In the safety population of Study DX-301, serious adverse events were reported in 14 (4.6%) Drug X-treated patients and 10 (3.3%) placebo-treated patients.', draft: 'In the safety population of Study DX-301, serious adverse events were reported in 14 (4.6%) Drug X-treated patients and in no placebo-treated patients.' },
  ])('retains a rejected $label, actual source identities and T2+unknown floor when advisory qualification is unavailable', async ({ text, draft }) => {
    const saved = await clinicalSource({ text });
    const result = await verifyStored(saved.id, draft), output = JSON.parse(result.trace.checkOutputs.find((c: { check: string }) => c.check === 'source_claims').output);
    expect(result).toMatchObject({ status: 'incomplete', verdict: 'issues_found', advisoryUnavailable: { code: 'MODEL_NOT_APPROVED', started: false }, models: [], usage: { modelCalls: 0 } });
    expect(output).toMatchObject({ method: 'sub-agent-clinical-claims:v1', organizationId: ORG, userId: Number(AUTHOR.id), projectRef: PROGRAM,
      sources: [{ documentId: saved.id, contentHash: saved.hash, referenceSchemaVersion: 2, completeText: true, sensitivityTier: 2,
        extractedTextSha256: createHash('sha256').update(text).digest('hex') }] });
    expect(output.findings).toContainEqual(expect.objectContaining({ disposition: 'rejected', reason: 'NUMERIC_SOURCE_CONTRADICTION' }));
    expect(h.requests[0].inputSensitivityTiers).toEqual([3, 2]);
    expect(h.query.mock.calls.some(([sql]) => String(sql).includes('FROM vault.documents'))).toBe(true);
    expect(result.notChecked.join(' ')).toContain('General prose');
  });
  it.each([{ organizationId: ORG + 1 }, { programId: PROGRAM_B }])('refuses a foreign tenant/project source without releasing its text: %j', async options => {
    const saved = await clinicalSource({ ...options, text: 'FOREIGN_VERIFIER_SOURCE_CANARY' });
    const result = await verifyStored(saved.id);
    expect(result.checks.find((c: { check: string }) => c.check === 'source_claims').outcome).toBe('error');
    expect(JSON.stringify(result)).not.toContain('FOREIGN_VERIFIER_SOURCE_CANARY');
    expect(h.requests[0].inputSensitivityTiers).toEqual([3, 3]);
  });
  it('does not read selected Vault sources through a capability the parent was not offered', async () => {
    const saved = await clinicalSource(); h.query.mockClear();
    const result = await verifyStored(saved.id, trialEvidence, false);
    expect(result.error).toBe('NO_DETERMINISTIC_CHECKER');
    expect(h.query.mock.calls.some(([sql]) => String(sql).includes('FROM vault.documents'))).toBe(false);
  });
  it('invalidates current support when the saved extraction changes after the advisory checkpoint', async () => {
    const saved = await clinicalSource();
    h.mutate = async () => { await db.pool.query('UPDATE vault.documents SET extracted_text=$1 WHERE id=$2', [trialEvidence.replace('300', '301'), saved.id]); };
    try {
      const result = await verifyStored(saved.id, trialEvidence);
      expect(result.checks.find((c: { check: string }) => c.check === 'source_claims').outcome).toBe('error');
      const output = JSON.parse(result.trace.checkOutputs.find((c: { check: string }) => c.check === 'source_claims').output);
      expect(output).toMatchObject({ sourceCurrentAtRelease: false, qualification: 'unverified' });
    } finally { h.mutate = null; }
  });
});

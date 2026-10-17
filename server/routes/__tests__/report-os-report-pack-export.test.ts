/**
 * Retained complete report packets reuse canonical seal and exact-byte audit boundaries.
 * Report OS runs, finalizations and PDF exports are events on the record
 * (21 CFR Part 11 §11.10(e)). Until 2026-09-30 none of them wrote an audit row:
 * a run, a seal and a PDF that left the system all left the audit trail as it
 * was.
 *
 * What is pinned here, per route:
 *   - POST /runs              → one chained row, `report_os.run_created`, after
 *     the run is written; when it cannot be written the answer is 503 saying
 *     nothing was saved — never a 201 that implies it was recorded.
 *   - POST /runs/:id/finalize, the run's electronic signature: pinned in
 *     report-os-finalize-signature.test.ts, over the same doubles.
 *   - GET /runs/:id/export.pdf and GET /bundles/:bundleId/export.pdf (DP-50) →
 *     the entitlement gate, then a chained row carrying the hash of the exact
 *     bytes, written BEFORE anything is sent; 503 and no PDF when it cannot be.
 *   - POST /taxonomy/seed is gone: the registry has one writer, the generated
 *     migration (scripts/db/generate-report-type-registry-seed.ts).
 * Every chained row is written on a tenant-stamped transaction (BEGIN, the
 * organisation stamped, …, COMMIT; ROLLBACK on failure; connection released).
 *
 * The router's own imports are real; the database facade, the auth
 * middleware, the entitlement gate, the run computation and the audit writer
 * are replaced, because the contract under test is what the handlers do around
 * the audit row.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = await vi.hoisted(async () => (await import('./_report-os-route-harness')).createReportOsHarness());


// These suites isolate audit/compute contracts; sharing itself is exercised
// against SQL in run-history and scheduling project-access integration tests.
vi.mock('../../services/report-os/project-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/project-access')>()),
  getAccessibleReportProjectIds: async () => [1, 2, 3, 7, 11, 12, 14, 17, 21, 41, 52, 99, 100, 101],
  canAccessReportScope: async () => true,
}));
vi.mock('../../db', () => ({ db: h.db, pool: h.pool, getPool: () => h.pool, getDb: () => h.db, query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/authedOrgId')>()),
  authedOrgId: () => 7,
}));
vi.mock('../../services/report-os/entitlement-map', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/entitlement-map')>()),
  requireReportEntitlement: h.gate,
}));
vi.mock('../../services/report-os/orchestrator', () => ({ computeInitialRun: h.compute }));
vi.mock('../../services/report-os/research-compliance-report-providers', () => ({ computeDomainReport: async () => null }));
/* The attempt limiter's budget is its own test's subject
   (middleware/__tests__/signing-attempt-limiter.test.ts); here it would refuse
   this suite's eleventh finalize. It passes through and records its scope. */
vi.mock('../../middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: (scope: string) => {
    h.limiterScopes.push(scope);
    return (_req: unknown, _res: unknown, next: () => void) => next();
  },
}));
vi.mock('../c2c/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../c2c/actions')>()),
  verifyReauth: h.reauth,
  recordGovernedAction: h.ledger,
}));
vi.mock('../../services/part11/signature-persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/part11/signature-persistence')>()),
  persistGovernedSignSignature: h.signature,
}));
/* The membership lookup reads organization_users; the policy it feeds
   (services/part11/signing-authority.ts) is real. */
vi.mock('../../services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole: h.memberRole }));
vi.mock('../../services/auditService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/auditService')>()),
  writeChainedAuditRow: h.audit,
}));

import reportOsRouter from '../report-os';
import { tenantStampSql, driverRow, resetReportOsHarness } from './_report-os-route-harness';
import { buildSealedRecord } from '../../services/report-os/sealing/seal';
import type { RenderedReport } from '../../services/report-os/render/types';
import { deriveChainHash } from '../../services/audit/chain';
import { reportRuns, reportTypeRegistry } from '@shared/schema/report-os';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  /* organizationId is what the real auth middleware sets; the router's write
     gate (requireEditorAccessForWrites) reads it. */
  (req as unknown as { user: { id: number; role: string; organizationId: number } }).user = {
    id: 5, role: req.get('x-test-role') ?? 'manager', organizationId: 7,
  };
  next();
});
app.use('/api/report-os', reportOsRouter);

const TYPE = { typeId: 'readiness.executive_digest', label: 'Executive Readiness Digest', family: 'readiness', allowedScopes: ['program', 'project', 'submission'] };
const RUN = {
  id: 41, runUuid: '00000000-0000-4000-8000-000000000041', organizationId: 7, scopeType: 'submission', scopeId: 'sub-1',
  reportTypeId: TYPE.typeId, status: 'completed', confidence: 90, blockers: [] as string[],
  dependencySummary: { providers: [], summary: {}, criticalBlockers: [] },
  createdAt: new Date('2026-09-30T12:00:00Z'), completedAt: new Date('2026-09-30T12:00:00Z'),
};

const auditEntry = () => h.audit.mock.calls[0]?.[1] as Record<string, any> | undefined;
const auditFails = () =>
  h.audit.mockImplementation(async () => {
    h.statements.push('<audit row>');
    throw new Error('audit_logs refused the row');
  });
const pdfBody = (r: request.Test) =>
  r.buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  });

beforeEach(() => resetReportOsHarness(h));

const sealedDocument: RenderedReport = { reportTypeId: TYPE.typeId, scopeType: 'submission', scopeId: 'sub-1', generatedAt: '2026-09-30T12:00:00.000Z', status: 'final', sections: [] };

/** Complete report packets use retained source documents, not the manifest's
 * status list. These route tests keep the canonical seal/PDF writer real;
 * restricted-runtime sharing and row-lock behavior need separate native proof. */
const id = '33333333-3333-4333-8333-333333333333';
const at = new Date('2026-10-13T12:00:00Z');
const finalBody: RenderedReport = { ...sealedDocument, scopeType: 'project', scopeId: '11',
  sections: [{ id: 'sealed', title: 'Verified sealed body', blocks: [{ kind: 'summary', text: 'SEALED-BODY-41 Résumé 中文报告' },
    { kind: 'table', columns: ['Marker', 'Value'], rows: [['SEALED-TABLE-41', 17]], provenance: [{ sourceTable: 'qa_retained_inputs', recordId: 71 }] }] }],
  provenance: { source: 'qa_retained_inputs', marker: 'SEALED-CALCULATION-41' } };
const partialBody: RenderedReport = { ...finalBody, status: 'partial', scopeId: '12',
  sections: [{ id: 'partial', title: 'Retained partial body', blocks: [{ kind: 'summary', text: 'PARTIAL-BODY-42 END-OF-RETAINED-BODY' }] }] };
type PacketRun = Omit<typeof RUN, 'dependencySummary'> & { requestedBy: number; updatedAt: Date; dependencySummary: unknown };
const finalRun: PacketRun = { ...RUN, scopeType: 'project', scopeId: '11', status: 'final', requestedBy: 5,
  dependencySummary: { lineageRendered: { ...finalBody, sections: [{ id: 'changed-provider', title: 'Current values differ', blocks: [{ kind: 'summary', text: 'CURRENT-PROVIDER-VALUES-MUST-NOT-REPLACE-SEALED-BODY' }] }] } }, updatedAt: at };
const partialRun = { ...finalRun, id: 42, runUuid: '00000000-0000-4000-8000-000000000042', scopeId: '12', status: 'partial',
  dependencySummary: { lineageRendered: partialBody } };
const runItem = (run: typeof finalRun) => ({ runId: run.id, runUuid: run.runUuid, reportTypeId: run.reportTypeId,
  reportTypeLabel: TYPE.label, scopeType: run.scopeType, scopeId: run.scopeId, status: 'completed', confidence: 90,
  blockers: [], createdAt: at.toISOString() });
const pack = () => ({ bundleId: id, organizationId: 7, name: 'Complete retained QA pack', createdAt: at.toISOString(), createdBy: 5,
  projectIds: [11, 12], runIds: [42, 41], items: [runItem(finalRun), runItem(partialRun)] });
const type = { ...TYPE, id: 1, truthfulnessRules: {}, createdAt: at, updatedAt: at };
const exportReports = (suffix = '?content=reports') => pdfBody(request(app).get(`/api/report-os/bundles/${id}/export.pdf${suffix}`));
const json = (result: { body: unknown }) => Buffer.isBuffer(result.body) ? JSON.parse(result.body.toString()) : result.body;
const parsedPdf = async (bytes: Buffer) => {
  const { PDFParse } = await import('pdf-parse') as unknown as { PDFParse: new (opts: { data: Buffer }) => {
    getText(): Promise<{ text: string; pages: Array<{ num: number; text: string }> }>; destroy(): Promise<void> } };
  const parser = new PDFParse({ data: bytes });
  try { return await parser.getText(); } finally { await parser.destroy(); }
};
type PacketOptions = { bundle?: ReturnType<typeof pack>; runs?: Array<typeof finalRun>; body?: RenderedReport;
  legacy?: boolean; failSeal?: boolean; lateBodyChange?: boolean; missingReservation?: boolean };
function prepare(options: PacketOptions = {}) {
  const bundle = options.bundle ?? pack();
  const runs = options.runs ?? [finalRun, partialRun];
  const storedSeal = buildSealedRecord(finalBody, '2026-09-30T13:00:00.000Z');
  const nv = JSON.stringify({ sealHash: storedSeal.contentHash, sealedAt: storedSeal.sealedAt, atomCount: storedSeal.atomCount,
    algorithm: storedSeal.algorithm, canonVersion: storedSeal.canonVersion, documentStored: !options.legacy });
  const linked = { action: 'report_os.run_finalized', actor_id: 5, target: 'report_run:41',
    payload_hash: createHash('sha256').update(nv).digest('hex'), occurred_at: new Date('2026-09-30T13:00:01Z') };
  const chainRow = { ...linked, nv, tenant_id: 7, chain_seq: 1, sha256_chain: deriveChainHash(linked, '0'.repeat(64)), hmac_seal: null };
  h.queued.select.push([{ title: `bundle:${id}`, content: JSON.stringify({ bundleRecord: bundle }), createdAt: at }],
    [{ typeId: type.typeId, family: type.family }]); // Also make the pre-increment manifest path observable in red.
  let fullReads = 0;
  const sealRows = (sql: string, values: unknown[]) => {
    if (/action = 'report_os.run_finalized'/.test(sql)) {
      if (options.failSeal) throw new Error('verification database unavailable');
      return values[1] === '41' ? [chainRow] : [];
    }
    if (/FROM report_snapshots/.test(sql)) return values[0] === 41
      ? [{ snapshot_metadata: { seal: storedSeal, ...(options.legacy ? {} : { sealedDocument: options.body ?? finalBody }) } }] : [];
    if (/FROM electronic_signatures/.test(sql)) return values[1] === 'report-run:41'
      ? [{ signer_name: 'Dana Reyes', signed_at: new Date('2026-09-30T13:00:01Z'), signature_meaning: 'approval',
        manifest: JSON.stringify({ act: { sealHash: storedSeal.contentHash } }) }] : [];
    if (/public.actor_name/.test(sql)) return [{ name: 'Dana Reyes' }];
    return [];
  };
  h.respond.fn = (sql, arrayMode) => {
    const values = h.params.at(-1) ?? [];
    if (/select .* from "project_memory_entries"/.test(sql)) return [[`bundle:${id}`, JSON.stringify({ bundleRecord: bundle }), at.toISOString()]];
    if (/select "type_id", "family" from "report_type_registry"/.test(sql)) return [[type.typeId, type.family]];
    if (/select .* from "report_type_registry"/.test(sql)) return [driverRow(reportTypeRegistry, type)];
    if (/SELECT ou.role/.test(sql)) return [{ role: 'manager' }];
    if (/SELECT id, run_uuid, organization_id/.test(sql)) return runs.map(run => ({ id: run.id, run_uuid: run.runUuid, organization_id: run.organizationId, report_type_id: run.reportTypeId, scope_type: run.scopeType, scope_id: run.scopeId, access_project_ids: null }));
    if (/SELECT id FROM report_runs/.test(sql)) return (options.missingReservation ? runs.slice(0, 1) : runs).map(run => ({ id: run.id }));
    if (arrayMode && /select .* from "report_runs"/.test(sql)) {
      fullReads += 1;
      return runs.map(run => driverRow(reportRuns, options.lateBodyChange && fullReads > 1 && run.id === 42
        ? { ...run, dependencySummary: { lineageRendered: { ...partialBody, sections: [] } } } : run));
    }
    if (/SELECT id, status FROM report_runs/.test(sql)) return runs.map(run => ({ id: run.id, status: run.status }));
    if (/SELECT status FROM report_runs/.test(sql)) return runs.filter(run => run.id === values[0]).map(run => ({ status: run.status }));
    return sealRows(sql, values);
  };
  h.gate.mockResolvedValue({ entitled: true, tier: 'enterprise', tierResolved: true, feature: 'report_families', requiredTier: 'standard' });
}


describe('GET /bundles/:bundleId/export.pdf?content=reports', () => {
  it('brands all retained packet pages with the tenant profile and audits the exact presentation snapshot', async () => {
    prepare();
    h.company.settings = { companyDocuments: { revision: 8, companyName: 'Packet Sponsor', applyToReports: true } };
    const result = await exportReports();
    expect(result.status).toBe(200);
    const parsed = await parsedPdf(result.body as Buffer);
    for (const page of parsed.pages) expect(page.text).toContain('Packet Sponsor');
    expect(parsed.text.replace(/\s+/g, ' ')).toContain('Signed by Dana Reyes as approval');
    expect(parsed.text).toContain('NOT FINAL (PARTIAL)');
    expect(auditEntry()?.details.companyBranding).toMatchObject({ applied: true, revision: 8, profileHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(auditEntry()?.details.constituents[1].sealHash).toBe(buildSealedRecord(finalBody, '2026-09-30T13:00:00.000Z').contentHash);
  });

  it.each(['?content=', '?content=unknown', '?content=Reports', '?content=reports&content=manifest', '?content[]=reports', '?content[kind]=reports'])('refuses the closed selector before any read, PDF or event (%s)', async suffix => {
    prepare();
    const result = await exportReports(suffix);
    expect(result.status).toBe(400);
    expect(json(result)).toMatchObject({ error: { code: 'INVALID_REPORT_EXPORT_CONTENT' } });
    expect(h.reads.select).toBe(0);
    expect(h.statements).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.gate).not.toHaveBeenCalled();
    expect(result.headers['content-disposition']).toBeUndefined();
  });

  it('exports both complete bodies in saved runIds order, with sealed content, actual page ranges and the exact-byte event', async () => {
    prepare();
    const result = await exportReports();
    expect(result.status).toBe(200);
    expect(result.headers['content-disposition']).toContain('report-pack-33333333.pdf');
    const body = result.body as Buffer;
    const parsed = await parsedPdf(body);
    const text = parsed.text.replace(/\s+/g, ' ');
    for (const marker of ['SEALED-BODY-41 Résumé 中文报告', 'SEALED-TABLE-41', 'SEALED-CALCULATION-41', 'PARTIAL-BODY-42 END-OF-RETAINED-BODY']) expect(text).toContain(marker);
    expect(text).not.toContain('CURRENT-PROVIDER-VALUES-MUST-NOT-REPLACE-SEALED-BODY');
    const entry = auditEntry();
    expect(entry).toMatchObject({ tenantId: 7, userId: 5, action: 'report_os.bundle_exported', resourceId: id,
      details: { content: 'reports', runIds: [42, 41], pages: parsed.pages.length, byteLength: body.length,
        sha256: createHash('sha256').update(body).digest('hex'), finalAtExport: 1 } });
    const constituents = entry?.details.constituents;
    expect(constituents).toEqual([
      expect.objectContaining({ runId: 42, runUuid: partialRun.runUuid, reportTypeId: TYPE.typeId, scopeType: 'project', scopeId: '12',
        bundledStatus: 'completed', statusAtRead: 'partial', sourceDocument: 'retained-run-render', sealVerdict: null, sealHash: null }),
      expect.objectContaining({ runId: 41, runUuid: finalRun.runUuid, statusAtRead: 'final', sourceDocument: 'verified-sealed', sealVerdict: 'intact',
        sealHash: buildSealedRecord(finalBody, '2026-09-30T13:00:00.000Z').contentHash }),
    ]);
    expect(constituents[0].firstPage).toBeGreaterThan(1);
    expect(constituents[0].lastPage).toBeLessThan(constituents[1].firstPage);
    expect(constituents[1].lastPage).toBe(parsed.pages.length);
    for (const page of parsed.pages.filter(page => page.num >= constituents[0].firstPage && page.num <= constituents[0].lastPage)) expect(page.text).toContain('NOT FINAL (PARTIAL)');
    for (const page of parsed.pages.filter(page => page.num >= constituents[1].firstPage && page.num <= constituents[1].lastPage)) expect(page.text).not.toContain('NOT FINAL');
    expect(h.statements.slice(0, 2)).toEqual(['BEGIN', tenantStampSql()]);
    const lock = h.statements.findIndex(sql => /ORDER BY id FOR SHARE$/.test(sql));
    expect(lock).toBeGreaterThan(1);
    expect(lock).toBeLessThan(h.statements.findIndex(sql => /SELECT status FROM report_runs/.test(sql)));
    expect(h.statements.slice(-5)).toEqual(['BEGIN', tenantStampSql(), '<audit row>', 'COMMIT', '<released>']);
    expect(h.compute).not.toHaveBeenCalled();
    expect(h.signature).not.toHaveBeenCalled();
    expect(h.ledger).not.toHaveBeenCalled();
  });

  it('keeps explicit manifest mode reachable without embedding bodies', async () => {
    prepare();
    const result = await exportReports('?content=manifest');
    expect(result.status).toBe(200);
    expect(result.headers['content-disposition']).toContain('report-bundle-33333333.pdf');
    const text = (await parsedPdf(result.body as Buffer)).text;
    expect(text).not.toContain('SEALED-BODY-41');
    expect(auditEntry()).toMatchObject({ details: { content: 'manifest' } });
  });

});

describe('retained packet export entitlement and recording', () => {
  it('applies the current export plan before any constituent body or seal read', async () => {
    prepare(); h.gate.mockResolvedValue({ entitled: false, tier: 'free', tierResolved: true, requiredTier: 'standard', feature: 'report_families' });
    const result = await exportReports();
    expect(result.status).toBe(403);
    expect(json(result)).toMatchObject({ requiredTier: 'standard', feature: 'report_families', tier: 'free' });
    expect(h.statements.some(sql => /SELECT status FROM report_runs|FROM report_snapshots/.test(sql))).toBe(false);
    expect(h.audit).not.toHaveBeenCalled();
    expect(result.headers['content-disposition']).toBeUndefined();
  });

  it.each(['?content=reports', '?content=manifest'])('refuses an unavailable plan instead of assuming standard (%s)', async suffix => {
    prepare(); h.gate.mockResolvedValue({ entitled: true, tier: 'standard', tierResolved: false });
    const result = await exportReports(suffix);
    expect(result.status).toBe(503);
    expect(json(result)).toMatchObject({ error: { code: 'REPORT_EXPORT_ENTITLEMENT_UNAVAILABLE' } });
    expect(h.audit).not.toHaveBeenCalled();
    expect(result.headers['content-disposition']).toBeUndefined();
  });

  it('refuses an observed plan withdrawal during rendering', async () => {
    prepare(); h.gate.mockResolvedValueOnce({ entitled: true, tier: 'enterprise', tierResolved: true })
      .mockResolvedValue({ entitled: false, tier: 'free', tierResolved: true, requiredTier: 'standard', feature: 'report_families' });
    const result = await exportReports();
    expect(result.status).toBe(403);
    expect(json(result)).toMatchObject({ requiredTier: 'standard', tier: 'free' });
    expect(h.gate).toHaveBeenCalledTimes(2);
    expect(h.audit).not.toHaveBeenCalled();
    expect(result.headers['content-disposition']).toBeUndefined();
  });

  it('refuses exact-route audit failure without attachment headers or PDF bytes', async () => {
    prepare(); auditFails();
    const result = await exportReports();
    expect(result.status).toBe(503);
    expect(json(result)).toMatchObject({ error: { code: 'REPORT_EXPORT_NOT_RECORDED' } });
    expect(result.headers['content-disposition']).toBeUndefined();
    expect((result.body as Buffer).subarray(0, 4).toString()).not.toBe('%PDF');
    expect(h.statements.slice(-3)).toEqual(['<audit row>', 'ROLLBACK', '<released>']);
  });

  it('refuses a missing retained row instead of exporting a subset', async () => {
    prepare({ runs: [finalRun] });
    const result = await exportReports();
    expect(result.status).toBe(404);
    expect(json(result)).toMatchObject({ error: { code: 'REPORT_BUNDLE_NOT_FOUND', message: 'Bundle not found.' } });
    expect(h.audit).not.toHaveBeenCalled();
    expect(result.headers['content-disposition']).toBeUndefined();
    expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
  });

});

describe('retained packet identity and seal integrity', () => {
  it.each([
    { runIds: [42, 42] }, { runIds: [42] }, { items: [runItem(finalRun), runItem(finalRun)] }, { runIds: [], items: [] },
    { runIds: [42, Number.MAX_SAFE_INTEGER + 1], items: [runItem(partialRun), { ...runItem(finalRun), runId: Number.MAX_SAFE_INTEGER + 1 }] },
    { items: [runItem(finalRun), { ...runItem(partialRun), runUuid: 'invalid-retained-uuid' }] },
  ])('refuses inconsistent retained bundle identities without repair (%j)', async over => {
    prepare({ bundle: { ...pack(), ...over } });
    const result = await exportReports();
    expect(result.status).toBe(503);
    expect(json(result)).toMatchObject({ error: { code: 'REPORT_BUNDLE_CORRUPT' } });
    expect(h.statements.some(sql => /ANY\(\$2::int\[\]\)/.test(sql))).toBe(false);
    expect(h.audit).not.toHaveBeenCalled();
    expect(result.headers['content-disposition']).toBeUndefined();
  });

  it.each([{ organizationId: 99 }, { runUuid: 'other-run' }, { reportTypeId: 'other.type' }, { scopeId: 'PRIVATE-SCOPE-MARKER' }])('refuses a foreign or rebound current identity generically (%j)', async over => {
    prepare({ runs: [finalRun, { ...partialRun, ...over }] });
    const result = await exportReports();
    expect(result.status).toBe(404);
    expect(json(result)).toMatchObject({ error: { code: 'REPORT_BUNDLE_NOT_FOUND', message: 'Bundle not found.' } });
    expect(JSON.stringify(json(result))).not.toContain('PRIVATE-SCOPE-MARKER');
    expect(h.statements.some(sql => /select .* from "report_runs"/.test(sql))).toBe(false);
    expect(h.audit).not.toHaveBeenCalled();
    expect(result.headers['content-disposition']).toBeUndefined();
  });

  it('refuses a mismatched sealed constituent without exporting the other report', async () => {
    prepare({ body: { ...finalBody, sections: [] } });
    const result = await exportReports();
    expect(result.status).toBe(409);
    expect(json(result)).toMatchObject({ error: { code: 'SEALED_DOCUMENT_MISMATCH' } });
    expect(h.audit).not.toHaveBeenCalled();
    expect(result.headers['content-disposition']).toBeUndefined();
  });

  it('refuses an observed retained-body change after rendering', async () => {
    prepare({ lateBodyChange: true });
    const result = await exportReports();
    expect(result.status).toBe(409);
    expect(json(result)).toMatchObject({ error: { code: 'REPORT_PACK_CONTENT_CHANGED' } });
    expect(h.audit).not.toHaveBeenCalled();
    expect(result.headers['content-disposition']).toBeUndefined();
  });

  it('keeps verification read failure as an error without omission or a successful event', async () => {
    prepare({ failSeal: true });
    const result = await exportReports();
    expect(result.status).toBeGreaterThanOrEqual(500);
    expect(h.audit).not.toHaveBeenCalled();
    expect(result.headers['content-disposition']).toBeUndefined();
    expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
  });

  it('qualifies the reconstructed legacy final and retains its actual signature facts', async () => {
    prepare({ legacy: true });
    const result = await exportReports();
    expect(result.status).toBe(200);
    const text = (await parsedPdf(result.body as Buffer)).text.replace(/\s+/g, ' ');
    expect(text).toContain('not-verifiable');
    expect(text).toContain('Dana Reyes');
    expect(text).not.toContain('Seal verification at export: intact.');
    expect(auditEntry()?.details.constituents[1]).toMatchObject({ runId: 41, sourceDocument: 'retained-run-render', sealVerdict: 'not-verifiable' });
  });
});

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
import JSZip from 'jszip';
import { stableStringify } from '../../../shared/canonical-json';
import { signedPdfFixture } from '../../services/ectd/__tests__/support/signed-pdf-fixture';
import type { ReportLegalOriginal } from '../../services/report-os/report-package';
import { ReportPackageError } from '../../services/report-os/report-package';
import { DEFAULT_TEMPLATE_SPEC, normalizeTemplateSpec } from '../../../shared/templates/template-spec';
import { CompanyDocumentsError } from '../../services/company-documents/profile';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const variants = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../services/company-documents/designs', () => ({ readPublishedCompanyVariant: variants.read }));
const legal = vi.hoisted(() => ({ read: vi.fn(), recheck: vi.fn() }));
vi.mock('../../services/report-os/report-package-legal', () => ({ readReportPackageLegalOriginals: legal.read, requireReportPackageLegalStillCurrent: legal.recheck }));

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

beforeEach(() => { resetReportOsHarness(h); legal.read.mockReset(); legal.recheck.mockReset().mockResolvedValue(undefined); variants.read.mockReset(); });

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


const packagePath = `/api/report-os/bundles/${id}/export.zip`;
async function packageOriginal(): Promise<ReportLegalOriginal> {
  const bytes = await signedPdfFixture(true);
  const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
  const document = { id: 'legal-sponsor', title: 'Signed sponsor authorization', kind: 'authorization' as const,
    programId: '11111111-1111-4111-8111-111111111111', vaultDocumentId: '22222222-2222-4222-8222-222222222222',
    version: '3', contentHash: sourceSha256, agencies: ['FDA'], countries: ['US'], submissionTypes: ['ind'], language: 'en',
    effectiveOn: null, expiresOn: null, active: true, registeredAt: '2026-10-01T00:00:00Z', registeredBy: '9' };
  return { document, bytes, fingerprint: 'checked-current-registration', inventory: { registryId: document.id,
    title: document.title, kind: document.kind, programId: document.programId, vaultDocumentId: document.vaultDocumentId,
    version: document.version, sourceSha256, shippedSha256: sourceSha256,
    path: `legal/1-${document.vaultDocumentId}.pdf`, byteLength: bytes.length,
    agencies: document.agencies, countries: document.countries, submissionTypes: document.submissionTypes, language: document.language,
    effectiveOn: null, expiresOn: null, approval: { verdict: 'current-approved-exact-version', checkedAt: at.toISOString(),
      canonicalId: 'canonical-authorization', stage: 'approved', signatureRef: null, signedAt: null, manifestation: null },
    cryptographicSignatureValidation: 'not-performed-by-this-export', embeddedSignature: 'present', registration: document,
    registrationSha256: createHash('sha256').update(stableStringify(document)).digest('hex') } };
}
const exportPackage = (body: Record<string, unknown> = { legalDocumentIds: ['legal-sponsor'] }) =>
  pdfBody(request(app).post(packagePath).set('x-test-role', 'viewer').send(body));

describe('POST /bundles/:bundleId/export.zip — explicit governed report/legal copies', () => {
  it('exports actual retained report bodies and byte-identical signed original members with immutable proof snapshots', async () => {
    prepare(); const original = await packageOriginal(); legal.read.mockResolvedValue([original]);
    h.company.settings = { companyDocuments: { revision: 9, companyName: 'Package Sponsor', applyToReports: true } };
    const result = await exportPackage();
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toContain('application/zip');
    const zip = await JSZip.loadAsync(result.body as Buffer);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    const reportBytes = await zip.file('reports/report-pack.pdf')!.async('nodebuffer');
    const originalBytes = await zip.file(original.inventory.path)!.async('nodebuffer');
    expect(originalBytes).toEqual(original.bytes);
    const text = (await parsedPdf(reportBytes)).text.replace(/\s+/g, ' ');
    expect(text).toContain('SEALED-BODY-41'); expect(text).toContain('PARTIAL-BODY-42');
    expect(text).toContain('Signed by Dana Reyes as approval'); expect(text).toContain('NOT FINAL (PARTIAL)');
    expect(text).toContain('Package Sponsor');
    expect(manifest.branding).toMatchObject({ applied: true, revision: 9, presentation: { companyName: 'Package Sponsor', legalDocuments: [] } });
    expect(manifest.legalDocuments).toEqual([original.inventory]);
    expect(manifest.reports.sha256).toBe(createHash('sha256').update(reportBytes).digest('hex'));
    const hash = createHash('sha256').update(result.body as Buffer).digest('hex');
    expect(result.headers['x-export-sha256']).toBe(hash);
    expect(auditEntry()).toMatchObject({ action: 'report_os.bundle_exported', details: { format: 'zip', content: 'report-package',
      sha256: hash, manifestSha256: createHash('sha256').update(await zip.file('manifest.json')!.async('nodebuffer')).digest('hex'),
      legalDocuments: [{ registryId: original.document.id, sourceSha256: original.document.contentHash, shippedSha256: original.document.contentHash }] } });
    expect(legal.recheck).toHaveBeenCalledTimes(1); expect(h.compute).not.toHaveBeenCalled(); expect(h.signature).not.toHaveBeenCalled();
  });
  it.each([{}, { legalDocumentIds: [] }, { legalDocumentIds: ['one', 'one'] }, { legalDocumentIds: ['one'], organizationId: 99 },
    { legalDocumentIds: ['one'], variantId: '' }])('rejects malformed/implicit selection before reading private sources: %j', async body => {
    prepare(); const result = await exportPackage(body);
    expect(result.status).toBe(400); expect(h.statements).toEqual([]); expect(legal.read).not.toHaveBeenCalled(); expect(h.audit).not.toHaveBeenCalled();
  });
  it('refuses a missing, foreign or no-longer-approved original without returning a partial archive', async () => {
    prepare(); legal.read.mockRejectedValue(new ReportPackageError(404, 'REPORT_LEGAL_DOCUMENT_NOT_FOUND', 'Selected original unavailable.'));
    const result = await exportPackage(); expect(result.status).toBe(404); expect(result.headers['content-disposition']).toBeUndefined(); expect(h.audit).not.toHaveBeenCalled();
  });
  it('refuses source bytes that differ from their registered exact-version digest', async () => {
    prepare(); const original = await packageOriginal(); legal.read.mockResolvedValue([{ ...original, bytes: Buffer.concat([original.bytes, Buffer.from('changed')]) }]);
    const result = await exportPackage(); expect(result.status).toBe(409); expect(json(result).error.code).toBe('REPORT_LEGAL_ORIGINAL_CHANGED'); expect(h.audit).not.toHaveBeenCalled();
  });
  it('rechecks legal approval/current access after archive rendering and refuses an observed withdrawal', async () => {
    prepare(); legal.read.mockResolvedValue([await packageOriginal()]); legal.recheck.mockRejectedValue(new ReportPackageError(409, 'REPORT_LEGAL_CONTEXT_CHANGED', 'Approval was withdrawn.'));
    const result = await exportPackage(); expect(result.status).toBe(409); expect(h.audit).not.toHaveBeenCalled(); expect(result.headers['content-disposition']).toBeUndefined();
  });
  it('refuses audit failure before ZIP headers and bytes leave', async () => {
    prepare(); legal.read.mockResolvedValue([await packageOriginal()]); auditFails();
    const result = await exportPackage(); expect(result.status).toBe(503); expect(json(result).error.code).toBe('REPORT_EXPORT_NOT_RECORDED'); expect(result.headers['content-disposition']).toBeUndefined();
  });
});


describe('report ZIP explicit immutable stationery variants', () => {
  const variantId = '77777777-7777-4777-8777-777777777777';
  const profile = { version: 1 as const, revision: 17, variantId, companyName: 'Explicit Published Subsidiary',
    address: 'Regulatory address', contact: 'Authorized contact', registrationDetails: 'Company registration',
    letterhead: normalizeTemplateSpec(DEFAULT_TEMPLATE_SPEC), importedFrom: null, applyToReports: false,
    applyToSubmissionCorrespondence: false, brandingAdopted: true, legalDocuments: [] };
  it('applies an explicitly selected published variant to this export while retaining its unchanged default preferences', async () => {
    prepare(); legal.read.mockResolvedValue([await packageOriginal()]); variants.read.mockResolvedValue(profile);
    const result = await exportPackage({ legalDocumentIds: ['legal-sponsor'], variantId });
    expect(result.status).toBe(200);
    const zip = await JSZip.loadAsync(result.body as Buffer);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.branding).toMatchObject({ applied: true, variantId, revision: 17, selection: 'explicit-variant',
      presentation: { companyName: profile.companyName, applyToReports: false, legalDocuments: [] } });
    expect((await parsedPdf(await zip.file('reports/report-pack.pdf')!.async('nodebuffer'))).text).toContain(profile.companyName);
    expect(profile.applyToReports).toBe(false);
    expect(auditEntry()?.details.companyBranding).toMatchObject({ variantId, explicitSelection: true, revision: 17 });
    // A multi-project packet cannot invent one program/market target for a scoped design.
    expect(variants.read.mock.calls[0][3]).toEqual({ userId: 5, programId: null });
    expect(variants.read).toHaveBeenCalledTimes(2);
  });
  it('refuses unknown, unpublished or inapplicable explicit variants without default fallback', async () => {
    prepare(); variants.read.mockRejectedValue(new CompanyDocumentsError(409, 'COMPANY_VARIANT_NOT_PUBLISHED', 'This variant is not published.'));
    const result = await exportPackage({ legalDocumentIds: ['legal-sponsor'], variantId });
    expect(result.status).toBe(409); expect(legal.read).not.toHaveBeenCalled(); expect(h.audit).not.toHaveBeenCalled();
  });
  it('refuses retirement observed after archive rendering', async () => {
    prepare(); legal.read.mockResolvedValue([await packageOriginal()]); variants.read.mockResolvedValueOnce(profile)
      .mockRejectedValueOnce(new CompanyDocumentsError(409, 'COMPANY_VARIANT_NOT_PUBLISHED', 'This variant was retired.'));
    const result = await exportPackage({ legalDocumentIds: ['legal-sponsor'], variantId });
    expect(result.status).toBe(409); expect(h.audit).not.toHaveBeenCalled(); expect(result.headers['content-disposition']).toBeUndefined();
  });
});

/**
 * POST /api/report-os/runs runs what it names, over the program it names
 * (QA 2026-10-08, journey j8).
 *
 *   - "Every typed report returns the same readiness digest": a type no engine
 *     computes is refused (422 REPORT_TYPE_NOT_COMPUTED), and nothing is
 *     computed or written; a register runs from its own provider, not the
 *     readiness orchestrator.
 *   - "510(k) equivalence matrix runs for this biopharma organisation": a type
 *     that does not apply to the program's recorded product type is refused
 *     (422 REPORT_TYPE_NOT_APPLICABLE).
 *   - "Reporting scope is fixed to project 1": a run may name the open program
 *     by its UUID; the server resolves its project with the strict anchor
 *     resolver, and refuses a program with no project record (409).
 *   - "the digest names the scope by internal id": the run stores the
 *     project's name for the renderer.
 *
 * The router's own imports are real; the database facade, the auth middleware,
 * the entitlement gate, the readiness computation, the domain provider, the
 * segment derivation, the anchor resolver and the audit writer are replaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = await vi.hoisted(async () => (await import('./_report-os-route-harness')).createReportOsHarness());
const x = vi.hoisted(() => ({ domain: vi.fn(), segments: vi.fn(), orgSegments: vi.fn(), anchor: vi.fn(), dossier: vi.fn(), scopeAccess: vi.fn(), accessIds: vi.fn() }));


// These suites isolate audit/compute contracts; sharing itself is exercised
// against SQL in run-history and scheduling project-access integration tests.
vi.mock('../../services/report-os/project-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/project-access')>()),
  getAccessibleReportProjectIds: x.accessIds,
  canAccessReportScope: x.scopeAccess,
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
vi.mock('../../services/report-os/research-compliance-report-providers', () => ({ computeDomainReport: x.domain }));
vi.mock('../../services/report-os/segment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/segment')>()),
  deriveScopeSegments: x.segments,
  deriveOrgSegments: x.orgSegments,
}));
vi.mock('../../services/c2c/program-project-anchor', () => ({ resolveProgramProjectAnchor: x.anchor }));
vi.mock('../../services/ana/lineage-dossier.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/ana/lineage-dossier')>()),
  buildDocumentLineageDossier: x.dossier,
}));
vi.mock('../../services/auditService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/auditService')>()),
  writeChainedAuditRow: h.audit,
}));

import reportOsRouter from '../report-os';
import { driverRow, resetReportOsHarness } from './_report-os-route-harness';
import { reportRuns, reportSnapshots } from '@shared/schema/report-os';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as unknown as { dbClient: unknown }).dbClient = { query: async (sql: string) => ({ rows: h.respond.fn(sql, false) }) };
  (req as unknown as { user: { id: number; role: string; organizationId: number } }).user = { id: 5, role: req.get('x-test-role') ?? 'manager', organizationId: 7 };
  next();
});
app.use('/api/report-os', reportOsRouter);

const PROGRAM = 'd979e567-4622-46f1-8cb7-8bf434227f25';
const HLV = { id: 11, code: 'H', name: 'HLV-333 — Investigational New Drug Application' };
const type = (typeId: string, label: string, family: string, allowedClientSegments: string[]) => ({
  typeId, label, family, allowedScopes: ['program', 'project', 'submission', 'document'], allowedClientSegments,
});
const DIGEST = type('readiness.executive_digest', 'Executive Readiness Digest', 'readiness', ['pharma', 'device', 'biotech']);
const RMP = type('ema.rmp_psur_signal_alignment', 'EMA RMP / PSUR Signal Alignment Report', 'ema_post_market', ['pharma', 'biotech']);
const SEND = type('nonclinical.study_send_register', 'Nonclinical Study & SEND Readiness Register', 'nonclinical_module4', ['pharma', 'biotech']);
const RUN = {
  id: 52, runUuid: '00000000-0000-4000-8000-000000000052', organizationId: 7, scopeType: 'project', scopeId: '11',
  reportTypeId: DIGEST.typeId, status: 'partial', confidence: null, blockers: [] as string[],
  dependencySummary: { providers: [], summary: {}, criticalBlockers: [] },
  createdAt: new Date('2026-10-08T06:00:00Z'), completedAt: new Date('2026-10-08T06:00:00Z'),
};

/** Everything the route wrote on its transaction, as one string. */
const written = () => JSON.stringify(h.params);
const post = (body: Record<string, unknown>) => request(app).post('/api/report-os/runs').send(body);

beforeEach(() => {
  resetReportOsHarness(h);
  x.scopeAccess.mockReset().mockResolvedValue(true);
  x.accessIds.mockReset().mockResolvedValue([11,12]);
  h.respond.fn = (sql, arrayMode) =>
    !arrayMode ? (/FROM concept2cure_artifacts s/.test(sql) ? [{ project_id: 11 }] : []) : /"report_runs"/.test(sql) ? [driverRow(reportRuns, RUN)] : /"report_snapshots"/.test(sql) ? [driverRow(reportSnapshots, { id: 3, runId: 52, organizationId: 7, scopeType: 'project', scopeId: '11', snapshotVersion: 1, isLatest: true })] : [];
  x.domain.mockReset().mockResolvedValue({
    summary: { studies: 2, byStatus: { completed: 2 }, sendValidated: 1 },
    provider: { provider: 'nonclinical_studies', observedAt: '2026-10-08T06:00:00Z', status: 'ready' },
  });
  x.segments.mockReset().mockResolvedValue(['biotech']);
  x.orgSegments.mockReset().mockResolvedValue(['academic']);
  x.anchor.mockReset().mockResolvedValue(11);
});

describe('organization registers', () => {
  const ADMIN = { ...type('research_admin.scorecard', 'Research Administration Scorecard', 'research_compliance', ['academic']), allowedScopes: ['account'] };
  it('runs without a project and stores its actual organization scope', async () => {
    h.queued.select.push([ADMIN]);
    const res = await post({ scopeType: 'account', scopeId: '7', reportTypeId: ADMIN.typeId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(x.domain).toHaveBeenCalledWith(ADMIN.typeId, 7, expect.objectContaining({ scopeType: 'account', scopeId: '7' }));
    expect(written()).toMatch(/organization/);
  });
  it('refuses an account identity other than the authenticated organization', async () => {
    h.queued.select.push([ADMIN]);
    const res = await post({ scopeType: 'account', scopeId: '8', reportTypeId: ADMIN.typeId });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('REPORT_ACCOUNT_SCOPE_MISMATCH');
    expect(x.domain).not.toHaveBeenCalled();
    expect(h.statements).toEqual([]);
  });
  it('refuses an organization segment outside the register applicability', async () => {
    x.orgSegments.mockResolvedValue(['device']);
    h.queued.select.push([ADMIN]);
    const res = await post({ scopeType: 'account', scopeId: '7', reportTypeId: ADMIN.typeId });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('REPORT_TYPE_NOT_APPLICABLE');
    expect(x.domain).not.toHaveBeenCalled();
  });
  it('refuses a report disabled by the registry operator', async () => {
    h.queued.select.push([{ ...ADMIN, enabled: false }]);
    const res = await post({ scopeType: 'account', scopeId: '7', reportTypeId: ADMIN.typeId });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('REPORT_TYPE_DISABLED');
    expect(x.domain).not.toHaveBeenCalled();
  });
  it.each(['program', 'submission', 'document', 'study'])('does not store an organization register against an unverified %s identity', async (scopeType) => {
    h.respond.fn = () => [];
    h.queued.select.push([{ ...ADMIN, allowedScopes: [scopeType] }]);
    const res = await post({ scopeType, scopeId: 'foreign', reportTypeId: ADMIN.typeId });
    expect(res.status).toBe(scopeType === 'study' ? 422 : 404);
    expect(x.domain).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe('a type no engine computes', () => {
  it('is refused 422 and nothing is computed or written', async () => {
    h.queued.select.push([RMP], [HLV]);
    const res = await post({ scopeType: 'project', scopeId: '11', reportTypeId: RMP.typeId });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe('REPORT_TYPE_NOT_COMPUTED');
    expect(res.body.error).toMatch(/No engine computes the EMA RMP \/ PSUR Signal Alignment Report/);
    expect(h.compute).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.statements).toEqual([]);
  });
});

describe('private project access remains required for reporting', () => {
  it('refuses a project run before reading its evidence or writing a snapshot', async () => {
    x.scopeAccess.mockResolvedValue(false);
    h.queued.select.push([DIGEST], [HLV]);
    const res = await request(app).post('/api/report-os/runs').set('x-test-role', 'member').send({ scopeType: 'project', scopeId: '11', reportTypeId: DIGEST.typeId });
    expect(res.status).toBe(404);
    expect(x.scopeAccess).toHaveBeenCalledWith(7, { userId: 5, role: 'member' }, expect.objectContaining({ scopeType: 'project', scopeId: '11' }), undefined, [11,12]);
    expect(h.compute).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });
  it.each(['rendered', 'seal', 'dependencies', 'export.pdf'])('refuses private run %s before metadata or output leaves', async endpoint => {
    x.scopeAccess.mockResolvedValue(false);
    h.queued.select.push([RUN]);
    const res = await request(app).get(`/api/report-os/runs/52/${endpoint}`).set('x-test-role', 'member');
    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty('data');
    expect(res.headers['content-type']).not.toContain('application/pdf');
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe('a register', () => {
  it('refuses a registry choice it cannot compute and rejects invalid regional context', async () => {
    h.queued.select.push([SEND], [HLV]);
    const res = await post({ scopeType: 'project', scopeId: '11', reportTypeId: SEND.typeId, registryId: 'EU_MAA' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('REPORT_REGISTRY_CONTEXT_UNSUPPORTED');
    expect(x.domain).not.toHaveBeenCalled();
    h.queued.select.push([DIGEST], [HLV]);
    const invalid = await post({ scopeType: 'project', scopeId: '11', reportTypeId: DIGEST.typeId, registryId: 'INVALID' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('INVALID_REPORT_REGISTRY');
    expect(h.compute).not.toHaveBeenCalled();
  });
  it('runs from its own provider, not the readiness orchestrator', async () => {
    h.queued.select.push([SEND], [HLV]);
    const res = await post({ scopeType: 'project', scopeId: '11', reportTypeId: SEND.typeId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(h.compute).not.toHaveBeenCalled();
    expect(x.domain).toHaveBeenCalledWith(SEND.typeId, 7, { scopeType: 'project', scopeId: '11', clientWorkspaceId: undefined });
    expect(written()).toMatch(/nonclinical_studies/);
    expect(written()).not.toMatch(/submission_readiness/);
  });

  it('is refused for a program whose product type it does not apply to', async () => {
    x.segments.mockResolvedValue(['device']);
    h.queued.select.push([SEND], [HLV]);
    const res = await post({ scopeType: 'project', scopeId: '11', reportTypeId: SEND.typeId });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe('REPORT_TYPE_NOT_APPLICABLE');
    expect(res.body.error).toMatch(/applies to pharma \/ biotech programs; this program is recorded as device/);
    expect(x.segments).toHaveBeenCalledWith(7, 11);
    expect(x.domain).not.toHaveBeenCalled();
    expect(h.statements).toEqual([]);
  });
});

describe('the open program names the scope', () => {
  it('resolves the program through the strict anchor resolver and runs over its project', async () => {
    h.queued.select.push([DIGEST], [HLV]);
    const res = await post({ scopeType: 'project', programId: PROGRAM, reportTypeId: DIGEST.typeId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(x.anchor).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ programId: PROGRAM, orgId: 7, strict: true }));
    expect(h.compute).toHaveBeenCalledWith(7, 'project', '11', expect.anything());
  });

  it('refuses a program with no project record: 409, nothing computed', async () => {
    x.anchor.mockResolvedValue(null);
    h.queued.select.push([DIGEST], [HLV]);
    const res = await post({ scopeType: 'project', programId: PROGRAM, reportTypeId: DIGEST.typeId });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.code).toBe('PROGRAM_NOT_ANCHORED');
    expect(h.compute).not.toHaveBeenCalled();
    expect(h.statements).toEqual([]);
  });

  it('refuses a scope id that is not the program’s project', async () => {
    h.queued.select.push([DIGEST], [HLV]);
    const res = await post({ scopeType: 'project', programId: PROGRAM, scopeId: '1', reportTypeId: DIGEST.typeId });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.code).toBe('SCOPE_PROGRAM_MISMATCH');
    expect(h.compute).not.toHaveBeenCalled();
  });
});

describe('the run names its scope', () => {
  it('stores the project’s name for the renderer, not only its row id', async () => {
    h.queued.select.push([DIGEST], [HLV]);
    const res = await post({ scopeType: 'project', scopeId: '11', reportTypeId: DIGEST.typeId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(written()).toMatch(/"scopeLabel\\?":\\?"HLV-333 — Investigational New Drug Application/);
  });
});

describe('saved report detail and history', () => {
  it('reads enriched run metadata from the authenticated tenant transaction for a deep link', async () => {
    h.respond.fn = sql => /WITH matching_runs/.test(sql) ? [{ ...RUN, reportTypeLabel: DIGEST.label, scopeLabel: HLV.name, computedScope: 'project', __total: '1' }] : [];
    const res = await request(app).get('/api/report-os/runs/52');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 52, reportTypeLabel: DIGEST.label, computedScope: 'project', scopeLabel: HLV.name });
    const index = h.statements.findIndex(sql => /WITH matching_runs/.test(sql));
    expect(h.params[index]).toEqual([7, [11,12], true, 52, 1, 0]);
    expect(h.statements[0]).toBe('BEGIN');
    expect(h.statements[1]).toMatch(/current_tenant_id/);
    expect(h.params[1]).toEqual(['7']);
    expect(h.statements.slice(-2)).toEqual(['COMMIT', '<released>']);
  });
  it('returns not found when the tenant-scoped query has no record and refuses malformed IDs', async () => {
    expect((await request(app).get('/api/report-os/runs/999')).status).toBe(404);
    expect((await request(app).get('/api/report-os/runs/not-a-run')).status).toBe(400);
  });
  it('passes search/sort/pagination through the tenant-scoped history reader', async () => {
    h.respond.fn = sql => /WITH matching_runs/.test(sql) ? [{ id: null, __total: '0' }] : [];
    const res = await request(app).get('/api/report-os/runs?search=EU&limit=5&offset=10&sortBy=reportType&sortOrder=asc');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], meta: { limit: 5, offset: 10, total: 0, hasMore: false } });
    const index = h.statements.findIndex(sql => /WITH matching_runs/.test(sql));
    expect(h.params[index]).toEqual([7, [11,12], true, '%EU%', 5, 10]);
    expect(h.statements[index]).toContain('ORDER BY "reportTypeLabel" ASC');
  });
});

/*
 * A register with data computes with no blocker, so its run is stored
 * 'completed'. The renderer read 'completed' as a request for final, so the run
 * read "Status: final" — unsigned and unsealed — and Finalize was not offered
 * (found in the 2026-10-08 after-check of the register fix above). A run is
 * final only once finalized; until then it renders below final.
 */
describe('a run computed with no blocker', () => {
  it('renders below final until it is finalized', async () => {
    const completed = { ...RUN, reportTypeId: SEND.typeId, status: 'completed', blockers: [] as string[] };
    h.queued.select.push([completed], [{ label: SEND.label, truthfulnessRules: { allowPartial: true, requireBlockers: true } }]);
    h.respond.fn = (sql) => (/FROM report_runs/.test(sql) ? [{ status: 'completed' }] : []);
    const res = await request(app).get(`/api/report-os/runs/${RUN.id}/rendered`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.status).toBe('partial');
    expect(JSON.stringify(res.body.data.sections)).not.toMatch(/Status: final/);
  });
});

/*
 * P-26 (docs/LAUNCH_DEFINITION_OF_DONE.md): "Confidence is a measured figure or
 * nothing." The evidence & provenance trace requires one, and it is the lineage
 * engine's measured provenance completeness — the share of the document's text
 * whose origin the span lineage records — not computeLineageConfidence's count
 * of which records exist (30 + 25 + 15 + 10 + 10 + 5, clamped to 30–95).
 */
describe('the evidence & provenance trace', () => {
  const TRACE = type('provenance.evidence_trace_report', 'Evidence & Provenance Trace Report', 'evidence_provenance', ['pharma', 'device', 'biotech']);
  const dossier = (provenanceCompleteness: unknown) => ({
    schemaVersion: '1.0', generatedAt: '2026-10-08T06:00:00Z', threadId: null,
    ledger: {
      artifact: { artifactPk: 41, artifactId: 'artifact_abc', title: 'Clinical Overview', type: 'ectd_section', category: 'clinical', version: 3, status: 'draft', ctdSection: '2.5' },
      organization: { organizationId: 7, uuid: null, name: 'Org' }, project: { projectId: 11, name: 'HLV-333' },
      citations: null, authoringPlan: null, auditLog: [], auditLogUnavailable: null,
      signatures: [{ id: 's1' }], signaturesUnavailable: null, proposals: [],
      runs: { totalRuns: 0, latestRunId: null, latestRunAt: null, modelsUsed: [] },
    },
    // Every record the old count rewarded: a version, a decision a person executed, a provenance event, a lineage row.
    versionHistory: [{ version: 3, contentHash: 'h3', changeDescription: 'Human edit', contentLength: 1000, createdById: 3, createdAt: '2026-10-01T00:00:00Z', isCurrent: true }],
    decisions: [{ id: 'd1', authoredBy: 'ana', decidedBy: 'human', contextType: 'authoring', recommendationSummary: 'x', confidence: 'firm', actionState: 'executed', rejectedById: null, approvedById: 3 }],
    decisionSummary: { unavailable: null, total: 1, anaAuthored: 1, humanAuthored: 0, humanDecided: 1, approved: 1, rejected: 0, pending: 0 },
    provenanceEvents: [{ eventId: 'e1', eventType: 'generation', eventAction: 'ai_generate', actorName: 'AnA', createdAt: '2026-10-01T00:00:00Z' }],
    reasoning: [], humanControls: [],
    dataLineage: [{ sourceObjectType: 'external_evidence', sourceObjectId: 'PMID:1', sourceTitle: 'S', linkageType: 'cited_by', transformationType: null, confidenceScore: null, confidenceBasis: null, aiModelUsed: null }],
    provenanceCompleteness,
  });
  const runConfidence = () => (h.audit.mock.calls.find((c) => (c[1] as { action?: string })?.action === 'report_os.run_created')?.[1] as { details: { confidence: unknown } }).details.confidence;

  beforeEach(() => x.dossier.mockReset());

  it('its confidence is the document\'s measured provenance completeness, not a count of the records present', async () => {
    h.respond.fn = (sql, arrayMode) => !arrayMode ? (/FROM concept2cure_artifacts s/.test(sql) ? [{ project_id: 11 }] : []) : /"report_runs"/.test(sql) ? [driverRow(reportRuns, { ...RUN, scopeType: 'document', scopeId: 'artifact_abc', reportTypeId: TRACE.typeId, confidence: 64 })] : /"report_snapshots"/.test(sql) ? [driverRow(reportSnapshots, { id: 3, runId: 52, organizationId: 7, scopeType: 'document', scopeId: 'artifact_abc', snapshotVersion: 1, isLatest: true })] : [];
    x.dossier.mockResolvedValue(dossier({
      percent: 64, contentLength: 1000, attributedChars: 640, unattributedChars: 360, staleChars: 0,
      byKind: { fromSources: 140, authorAsserted: 500, machineDrafted: 0, machineDraftedUnaccepted: 0 },
    }));
    h.queued.select.push([TRACE]);
    const res = await post({ scopeType: 'document', scopeId: 'artifact_abc', reportTypeId: TRACE.typeId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(x.dossier).toHaveBeenCalledWith('artifact_abc', 7);
    // A document is not a project ID, and its trace cannot carry a second
    // project's readiness observations as its evidence.
    expect(h.compute).not.toHaveBeenCalled();
    expect(runConfidence()).toBe(64);
  });

  it('a completeness that was not measured is no confidence at all, so the run stays below final', async () => {
    x.dossier.mockResolvedValue(dossier(null));
    h.queued.select.push([TRACE]);
    const res = await post({ scopeType: 'document', scopeId: 'artifact_abc', reportTypeId: TRACE.typeId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(runConfidence()).toBeNull();
  });
});


it('injects the actual request actor and pinned executor for a recorded lifecycle calendar', async () => {
  const calendar = { ...type('lifecycle.obligation_calendar', 'Lifecycle Obligation Calendar', 'lifecycle', ['academic']), allowedScopes: ['account'] };
  h.queued.select.push([calendar]);
  const response = h.respond.fn;
  h.respond.fn = (sql, arrayMode) => sql.includes('SELECT ou.role') ? [{ role: 'manager' }] : response(sql, arrayMode);
  const res = await post({ scopeType: 'account', scopeId: '7', reportTypeId: calendar.typeId, recordContext: { userId: 999, executor: 'caller' } });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const options = x.domain.mock.calls[0][2];
  expect(options.recordContext.userId).toBe(5);
  expect(typeof options.recordContext.executor.query).toBe('function');
  expect(options.recordContext.executor).not.toBe(h.pool);
});


it('rolls back a calendar whose current creator was revoked before persistence, including an empty-source computation', async () => {
  const calendar = { ...type('lifecycle.obligation_calendar', 'Lifecycle Obligation Calendar', 'lifecycle', ['academic']), allowedScopes: ['account'] };
  h.queued.select.push([calendar]);
  const res = await post({ scopeType: 'account', scopeId: '7', reportTypeId: calendar.typeId });
  expect(res.status, JSON.stringify(res.body)).toBe(403);
  expect(res.body.code).toBe('PROJECT_ACTOR_ACCESS_DENIED');
  expect(h.statements).toContain('ROLLBACK'); expect(h.statements).not.toContain('COMMIT');
});

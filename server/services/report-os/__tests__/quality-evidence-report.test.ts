import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ fallback: vi.fn(), collect: vi.fn(), scope: vi.fn(), anchors: vi.fn(), current: vi.fn() }));
vi.mock('../../../db', () => ({ db: {}, pool: { query: h.fallback }, getPool: () => ({}) }));
vi.mock('../../qms/project-evidence', () => ({
  readQualityProjectEvidence: h.collect,
  QualityEvidenceUnavailable: class extends Error { constructor(message = 'Current Quality evidence is unavailable.') { super(message); this.name = 'QualityEvidenceUnavailable'; } },
}));
vi.mock('../../c2c/current-program-access', async original => ({ ...await original<typeof import('../../c2c/current-program-access')>(),
  getCurrentAccessibleProgramScope: h.scope, verifiedProgramAnchors: h.anchors, requireProgramScopeStillCurrent: h.current,
}));

import { reportAvailability } from '../report-engine';
import { computeDomainReport } from '../research-compliance-report-providers';
import { computeDomainRun } from '../report-engine';
import { gapsWereEvaluated, renderReport } from '../render/render';
import { evaluateTruthfulness } from '../truthfulness';
import { REPORT_TYPE_SEED } from '../taxonomy';

const TYPE = 'compliance.audit_assurance_pack';
const LIMIT = 'Quality evidence completeness is not assessed. Audit-chain integrity and compliance controls are not assessed.';
const A = '00000000-0000-4000-8000-000000000011', B = '00000000-0000-4000-8000-000000000012';
const q = { query: vi.fn() };
const recordContext = { userId: 5, executor: q };
const records = [
  { key: 'quality:qms_documents:1:working', title: 'Project procedure', text: '{"status":"draft"}', version: '2', sourceScope: 'project', native: { kind: 'qms_documents', id: '1' }, lifecycle: 'draft' },
  { key: 'quality:qms_internal_audits:2', title: 'Organization audit', text: '{"status":"planned"}', version: null, sourceScope: 'organization', native: { kind: 'qms_internal_audits', id: '2' }, lifecycle: 'planned' },
];
const scope = { actor: { userId: 5, role: 'member' }, programIds: [A, B], reconciliationRequired: false };
beforeEach(() => {
  vi.clearAllMocks();
  h.scope.mockResolvedValue(scope);
  h.anchors.mockReturnValue([{ projectId: 11, programId: A, clientWorkspaceId: 71 }, { projectId: 12, programId: B, clientWorkspaceId: 72 }]);
  h.current.mockResolvedValue(undefined);
  h.collect.mockImplementation(async (_q, input) => input.programId === A ? records : [records[1]]);
});

describe('the existing assurance pack computes native Quality facts', () => {
  it('routes the existing type only to supported Quality scopes', () => {
    expect(reportAvailability(TYPE, 'project', ['project'])).toMatchObject({ engine: 'domain', runnable: true, computedScope: 'project' });
    expect(reportAvailability(TYPE, 'account', ['account'])).toMatchObject({ engine: 'domain', runnable: true, computedScope: 'organization' });
    expect(reportAvailability(TYPE, 'document', ['document']).runnable).toBe(false);
    expect(reportAvailability(TYPE, 'submission', ['submission']).runnable).toBe(false);
  });

  it('requires a current verified actor and executor instead of producing an empty or organization report', async () => {
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'project', scopeId: '11' })).rejects.toThrow(/current actor|current.*context/i);
  });

  it('passes the exact admitted project, actor and executor to the canonical reader and retains its facts', async () => {
    const report = await computeDomainReport(TYPE, 7, { scopeType: 'project', scopeId: '11', clientWorkspaceId: 71, recordContext });
    expect(h.scope).toHaveBeenCalledWith(q, { organizationId: 7, userId: 5 });
    expect(h.anchors).toHaveBeenCalledWith(q, { organizationId: 7, userId: 5 }, scope);
    expect(h.collect).toHaveBeenCalledExactlyOnceWith(q, { organizationId: 7, userId: 5, programId: A });
    expect(h.current).toHaveBeenCalledWith(q, { organizationId: 7, userId: 5 }, scope);
    expect(report).toMatchObject({ computedScope: 'project', accessProjectIds: [11], criticalBlockers: [LIMIT],
      summary: { projectEvidenceSnapshots: 1, organizationEvidenceSnapshots: 1, qualityEvidence: { records, limits: expect.arrayContaining([LIMIT]) } },
      provider: { status: 'partial', atoms: [{ sourceTable: 'qms_documents', recordId: '1', transformation: 'direct_copy' }, { sourceTable: 'qms_internal_audits', recordId: '2', transformation: 'direct_copy' }] } });
    expect(JSON.stringify(report)).not.toContain(B);
    expect(h.fallback).not.toHaveBeenCalled();
  });

  it('deduplicates organization context and retains only projects contributing evidence in an organization run', async () => {
    const report = await computeDomainReport(TYPE, 7, { scopeType: 'account', scopeId: '7', recordContext });
    expect(h.collect.mock.calls.map(([, input]) => input.programId)).toEqual([A, B]);
    expect(report).toMatchObject({ computedScope: 'organization', accessProjectIds: [11],
      summary: { projectEvidenceSnapshots: 1, organizationEvidenceSnapshots: 1, qualityEvidence: { records } } });
    expect(JSON.stringify(report)).not.toContain(B);
  });

  it('reads explicit organization context when there are no accessible projects, without inventing an empty completeness result', async () => {
    h.scope.mockResolvedValue({ ...scope, programIds: [] }); h.anchors.mockReturnValue([]);
    const report = await computeDomainReport(TYPE, 7, { scopeType: 'account', scopeId: '7', recordContext });
    expect(h.collect).toHaveBeenCalledExactlyOnceWith(q, { organizationId: 7, userId: 5, programId: null });
    expect(report).toMatchObject({ accessProjectIds: [], summary: { projectEvidenceSnapshots: 0, organizationEvidenceSnapshots: 1 }, provider: { status: 'partial' } });
    h.collect.mockResolvedValue([]);
    const empty = await computeDomainRun(TYPE, 7, 'account', '7', { recordContext });
    expect(empty).toMatchObject({ confidence: null, criticalBlockers: [LIMIT], providers: [{ status: 'missing' }] });
    expect(empty.blockers.join(' ')).toContain('No admitted Quality evidence');
  });

  it.each(['99', '0', A, '11.0'])('refuses a private, missing or malformed tracking project %s without an organization fallback', async scopeId => {
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'project', scopeId, recordContext })).rejects.toThrow(/project.*verified/);
    expect(h.collect).not.toHaveBeenCalled();
  });

  it('refuses an unverified client claim, unsupported scope, and another organization account', async () => {
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'project', scopeId: '11', clientWorkspaceId: 72, recordContext })).rejects.toThrow(/client workspace/);
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'account', scopeId: '7', clientWorkspaceId: 71, recordContext })).rejects.toMatchObject({ code: 'REPORT_CLIENT_SCOPE_UNSUPPORTED' });
    for (const options of [{ scopeType: 'submission', scopeId: '11' }, { scopeType: 'document', scopeId: A }, { scopeType: 'account', scopeId: '8' }]) {
      await expect(computeDomainReport(TYPE, 7, { ...options, recordContext })).rejects.toThrow(/verified project|organization/);
    }
    expect(h.collect).not.toHaveBeenCalled();
  });

  it('propagates collector failure, observed access revocation and conflicting snapshots instead of reporting partial counts', async () => {
    h.collect.mockRejectedValueOnce(new Error('Native evidence unreadable'));
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'project', scopeId: '11', recordContext })).rejects.toThrow('Native evidence unreadable');
    h.current.mockRejectedValueOnce(Object.assign(new Error('Access changed'), { code: 'PROJECT_ACCESS_CHANGED' }));
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'project', scopeId: '11', recordContext })).rejects.toMatchObject({ code: 'PROJECT_ACCESS_CHANGED' });
    h.collect.mockImplementation(async (_q, input) => input.programId === A ? records : [{ ...records[1], lifecycle: 'changed' }]);
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'account', scopeId: '7', recordContext })).rejects.toThrow(/changed during collection/);
  });

  it('cannot finalize native facts as audit assurance under the existing type rules', async () => {
    const report = await computeDomainRun(TYPE, 7, 'project', '11', { recordContext });
    expect(gapsWereEvaluated(report.summary)).toBe(false);
    expect(evaluateTruthfulness({ requestedStatus: 'final', confidence: report.confidence, blockers: report.blockers,
      criticalBlockers: report.criticalBlockers, gapsSection: gapsWereEvaluated(report.summary), disclosure: false },
    REPORT_TYPE_SEED.find(type => type.typeId === TYPE)!.truthfulnessRules)).toMatchObject({ allowedStatus: 'partial', downgradedFrom: 'final' });
  });

  it('renders project evidence and organization context separately with its unassessed checks', () => {
    const report = renderReport({ reportTypeId: TYPE, reportTypeLabel: 'Compliance & Audit Assurance Pack',
      scopeType: 'project', scopeId: '11', generatedAt: '2026-11-06T00:00:00.000Z', status: 'partial',
      providers: [{ provider: 'quality_project_evidence', observedAt: '2026-11-06T00:00:00.000Z', status: 'partial' }],
      blockers: [LIMIT], summary: { computedScope: 'project', domain: { qualityEvidence: { schemaVersion: 1, records, limits: [LIMIT] } } } });
    expect(report.sections.find(section => section.id === 'quality-project-evidence')?.title).toBe('Project Quality evidence');
    expect(report.sections.find(section => section.id === 'quality-organization-context')?.title).toBe('Organization Quality-system context');
    const body = JSON.stringify(report);
    expect(body).toContain('Project procedure');
    expect(body).toContain('Organization audit');
    expect(body).toContain('Organization context is not assigned to this project.');
    expect(body).toContain(LIMIT);
    expect(body).not.toMatch(/awards, proposals|Submission readiness/);
  });

  it('refuses an unsupported saved Quality snapshot instead of displaying malformed facts as an empty register', () => {
    const report = renderReport({ reportTypeId: TYPE, reportTypeLabel: 'Compliance & Audit Assurance Pack', scopeType: 'project', scopeId: '11',
      status: 'partial', providers: [], blockers: [LIMIT], summary: { domain: { qualityEvidence: { schemaVersion: 2, records, limits: [LIMIT] } } } });
    expect(report.sections.find(section => section.id === 'quality-evidence-unavailable')).toBeDefined();
    expect(JSON.stringify(report)).not.toContain('Project procedure');
  });
});

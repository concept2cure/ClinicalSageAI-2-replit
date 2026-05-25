/**
 * Tests for the PDEV provenance trace assembler.
 *
 * Read-only across 6 tables. A table-routed thenable mock returns the
 * seeded rows per table; the service does the stitching + mapping that
 * these tests assert.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => {
  const tables: Record<string, any[]> = {
    regulatory_programs: [],
    pdev_program_activities: [],
    evidence_links: [],
    evidence_objects: [],
    concept2cure_artifacts: [],
    data_lineage_records: [],
    audit_logs: [],
  };
  function nameOf(t: any): string {
    const n = t?.[Symbol.for('drizzle:Name')];
    return typeof n === 'string' ? n : 'unknown';
  }
  return {
    tables,
    nameOf,
    reset: () => { for (const k of Object.keys(tables)) tables[k] = []; },
  };
});

vi.mock('../../../db', () => {
  function readChain(tableName: string) {
    const rows = () => H.tables[tableName] ?? [];
    const node: any = {
      where: () => node,
      innerJoin: () => node,
      leftJoin: () => node,
      orderBy: () => node,
      limit: () => rows(),
      then: (res: any, rej: any) => Promise.resolve(rows()).then(res, rej),
    };
    return node;
  }
  return {
    db: { select: () => ({ from: (t: unknown) => readChain(H.nameOf(t)) }) },
    pool: undefined,
    getPool: () => { throw new Error('not in test scope'); },
  };
});

import { pdevProvenanceTraceService } from '../pdev-provenance-trace';

const PROGRAM_ID = '33333333-3333-3333-3333-333333333333';
const ACTIVITY_KEY = 'nonclinical.ind_enabling_summary';
const STATE_ID = 'state-abc';
const EVIDENCE_ID = '44444444-4444-4444-4444-444444444444';

beforeEach(() => {
  H.reset();
});

function seedFull() {
  H.tables.regulatory_programs.push({ id: PROGRAM_ID, organizationId: 1 });
  H.tables.pdev_program_activities.push({
    id: STATE_ID,
    programId: PROGRAM_ID,
    activityKey: ACTIVITY_KEY,
    state: 'approved',
    notes: 'reviewed and signed',
    ownerUserId: 7,
    reviewerUserId: 9,
    stateChangedAt: new Date('2026-02-01T00:00:00Z'),
    stateChangedBy: 7,
  });
  H.tables.evidence_links.push({
    evidenceId: EVIDENCE_ID,
    linkType: 'supports',
    createdAt: new Date('2026-02-02T00:00:00Z'),
  });
  H.tables.evidence_objects.push({
    id: EVIDENCE_ID,
    title: 'GLP tox study report',
    evidenceType: 'test_report',
    evidenceCategory: 'nonclinical',
    sourceType: 'internal',
    sourceCitation: 'Study OR801-TOX-001',
  });
  H.tables.concept2cure_artifacts.push({
    id: 101,
    artifactId: 'artifact_xyz',
    title: 'Module 2.4 nonclinical overview',
    type: 'markdown',
    status: 'approved',
    version: 2,
    ctdSection: '2.4',
    contentHash: 'sha256:deadbeef',
    createdAt: new Date('2026-02-03T00:00:00Z'),
    citations: [{ n: 1 }, { n: 2 }],
  });
  H.tables.data_lineage_records.push({
    id: 5,
    sourceObjectType: 'external_evidence',
    sourceObjectId: 'pmid:12345678',
    sourceTitle: 'Smith et al.',
    targetObjectType: 'artifact',
    targetObjectId: 'artifact_xyz',
    linkageType: 'generated_from',
    transformationType: 'ai_generation',
    confidenceScore: 88,
    aiModelUsed: 'claude',
    createdAt: new Date('2026-02-03T01:00:00Z'),
  });
  H.tables.audit_logs.push({
    id: 900,
    action: 'pdev_activity_state_change',
    userId: 7,
    createdAt: new Date('2026-02-03T02:00:00Z'),
    newValues: { newState: 'approved' },
  });
}

describe('pdevProvenanceTraceService.trace', () => {
  test('returns null for an unknown activity key', async () => {
    seedFull();
    const r = await pdevProvenanceTraceService.trace(PROGRAM_ID, 1, 'not.a.real.key');
    expect(r).toBeNull();
  });

  test('returns null when the program is not in the tenant', async () => {
    // No program seeded.
    const r = await pdevProvenanceTraceService.trace(PROGRAM_ID, 1, ACTIVITY_KEY);
    expect(r).toBeNull();
  });

  test('assembles the full trace tree with correct counts', async () => {
    seedFull();
    const r = await pdevProvenanceTraceService.trace(PROGRAM_ID, 1, ACTIVITY_KEY);
    expect(r).toBeTruthy();
    expect(r!.activityKey).toBe(ACTIVITY_KEY);
    expect(r!.workstream).toBe('nonclinical');
    expect(r!.currentState).toBe('approved');

    expect(r!.counts.artifacts).toBe(1);
    expect(r!.counts.evidence).toBe(1);
    expect(r!.counts.lineageEdges).toBe(1);
    expect(r!.counts.auditEvents).toBe(1);

    // Artifact mapping.
    expect(r!.artifacts[0].artifactId).toBe('artifact_xyz');
    expect(r!.artifacts[0].citationCount).toBe(2);

    // Evidence mapping joins links → objects.
    expect(r!.evidence[0].id).toBe(EVIDENCE_ID);
    expect(r!.evidence[0].linkType).toBe('supports');

    // Lineage + audit mapped.
    expect(r!.lineage[0].transformationType).toBe('ai_generation');
    expect(r!.lineage[0].confidenceScore).toBe(88);
    expect(r!.audit[0].action).toBe('pdev_activity_state_change');

    // Activity state row surfaced.
    expect(r!.activityStateRow?.ownerUserId).toBe(7);
    expect(r!.activityStateRow?.reviewerUserId).toBe(9);
  });

  test('handles an activity with no state row (never touched)', async () => {
    H.tables.regulatory_programs.push({ id: PROGRAM_ID, organizationId: 1 });
    // no pdev_program_activities row
    const r = await pdevProvenanceTraceService.trace(PROGRAM_ID, 1, ACTIVITY_KEY);
    expect(r).toBeTruthy();
    expect(r!.currentState).toBe('not_started');
    expect(r!.activityStateRow).toBeNull();
    expect(r!.counts.evidence).toBe(0);
    expect(r!.counts.auditEvents).toBe(0);
  });
});

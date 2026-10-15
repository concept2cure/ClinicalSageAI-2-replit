/**
 * Manual holds are explained in the dossier, not hidden (row 74, slice S4).
 *
 * Under Manual, AnA holds the run herself before a step and the person's
 * "Run this step" resumes it. The resume is a real control event with the
 * person's id; the pause before it is not — the policy made it, and no person
 * pressed Pause (run-control.ts holdForPerson writes no control event, as the
 * abandoned-pause resume does not). Read from the human controls alone, the
 * dossier shows a resume with no pause, which is a gap an auditor would have
 * to ask about. So the assistant message stores AnA's own holds beside the
 * controls (`policyHolds`, `runPolicy`), and the dossier, its XML and its
 * trace report carry them as a SEPARATE section: a policy hold is not a human
 * control, and must never be counted as one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ assistantRows: [] as Array<Record<string, unknown>> }));

vi.mock('../../../db/runtime.js', () => ({
  getPool: () => ({
    query: async (sql: string) => {
      if (/FROM concept2cure_artifacts/.test(sql)) return { rows: [{ ana_thread_id: 'thread_1' }], rowCount: 1 };
      if (/FROM chat_messages/.test(sql)) return { rows: db.assistantRows, rowCount: db.assistantRows.length };
      return { rows: [], rowCount: 0 };
    },
  }),
}));
vi.mock('../turn-record-verify.js', () => ({ listTurnRecords: async () => [] }));
vi.mock('../../export/docx-ledger-collector.js', () => ({
  collectArtifactLedger: async () => ({
    schemaVersion: '1.0',
    generatedAt: '2026-09-28T00:00:00.000Z',
    artifact: {
      artifactId: 'artifact_abc',
      artifactPk: 1,
      organizationId: 7,
      projectId: 5,
      title: 'Clinical Overview',
      ctdSection: '2.5',
      type: 'ectd_section',
      category: 'clinical',
      status: 'draft',
      version: 1,
      contentHash: 'h1',
      createdAt: '2026-09-28T00:00:00.000Z',
      updatedAt: '2026-09-28T00:00:00.000Z',
      publishedAt: null,
      lockedAt: null,
    },
    organization: { organizationId: 7, name: 'Acme Bio', uuid: 'u-1' },
    project: { projectId: 5, name: 'IND-123' },
    citations: null,
    authoringPlan: null,
    auditLog: [],
    auditLogUnavailable: null,
    signatures: [],
    signaturesUnavailable: null,
    proposals: [],
    runs: { totalRuns: 0, latestRunId: null, latestRunAt: null, modelsUsed: [] },
  }),
}));

import { buildDocumentLineageDossier } from '../lineage-dossier.js';
import { serializeDocumentLineageDossierXml } from '../lineage-dossier-xml.js';
import { dossierToRenderedReport } from '../../report-os/lineage-trace-report.js';

const AT = '2026-09-28T10:00:00.000Z';
const manualTurn = {
  metadata: {
    runPolicy: 'manual',
    policyHolds: [{ round: 2, reason: 'manual', next: ['Searching PubMed for "endpoint"'], outcome: 'continued', at: AT }],
    humanControls: [{ action: 'resume', round: 2, at: '2026-09-28T10:01:00.000Z', byUserId: 3 }],
  },
  model: 'claude',
  created_at: AT,
};

async function dossier() {
  const d = await buildDocumentLineageDossier('artifact_abc', 7);
  expect(d).not.toBeNull();
  return d!;
}

beforeEach(() => {
  db.assistantRows = [];
});

describe('the dossier reads AnA’s own holds beside the human controls', () => {
  it('a Manual hold and the resume that answered it are two records, in two sections', async () => {
    db.assistantRows = [manualTurn];
    const d = await dossier();
    expect(d.policyHolds).toEqual([
      {
        turn: 1,
        round: 2,
        reason: 'manual',
        next: ['Searching PubMed for "endpoint"'],
        outcome: 'continued',
        at: AT,
        runPolicy: 'manual',
      },
    ]);
    // The resume is the person's; it is counted once, as a human control.
    expect(d.humanControls).toEqual([
      { turn: 1, action: 'resume', message: null, round: 2, at: '2026-09-28T10:01:00.000Z' },
    ]);
  });

  it('numbers turns across the thread and skips a malformed hold', async () => {
    db.assistantRows = [
      { metadata: { rounds: 2 }, model: 'claude', created_at: AT },
      {
        ...manualTurn,
        metadata: {
          ...manualTurn.metadata,
          policyHolds: [{ round: 'two' }, { ...manualTurn.metadata.policyHolds[0], outcome: 'redirected' }],
        },
      },
    ];
    const d = await dossier();
    expect(d.policyHolds).toEqual([expect.objectContaining({ turn: 2, outcome: 'redirected' })]);
  });

  it('a thread with no policy turns has an empty section, not a missing one', async () => {
    db.assistantRows = [{ metadata: { rounds: 1 }, model: 'claude', created_at: AT }];
    expect((await dossier()).policyHolds).toEqual([]);
  });
});

describe('the XML and the trace report carry them, after the human controls', () => {
  it('<PolicyHolds> follows <HumanControls>, one <Hold> each with its next step', async () => {
    db.assistantRows = [manualTurn];
    const xml = serializeDocumentLineageDossierXml(await dossier());
    const controls = xml.indexOf('</HumanControls>');
    const holds = xml.indexOf('<PolicyHolds count="1">');
    expect(controls).toBeGreaterThan(-1);
    expect(holds).toBeGreaterThan(controls);
    const section = xml.slice(holds, xml.indexOf('</PolicyHolds>'));
    expect(section).toMatch(/<Hold reason="manual" round="2" turn="1" outcome="continued" at="2026-09-28T10:00:00.000Z" runPolicy="manual">/);
    expect(section).toContain('<Next>Searching PubMed for &quot;endpoint&quot;</Next>');
  });

  it('a dossier assembled before the field existed renders no section', async () => {
    db.assistantRows = [manualTurn];
    const d = await dossier();
    delete (d as { policyHolds?: unknown }).policyHolds;
    expect(serializeDocumentLineageDossierXml(d)).not.toContain('PolicyHolds');
  });

  it("the trace report has 'AnA's own holds (Manual)' after the human control actions", async () => {
    db.assistantRows = [manualTurn];
    const report = dossierToRenderedReport(await dossier(), {
      reportTypeId: 'lineage',
      reportTypeLabel: 'Lineage',
      status: 'draft' as never,
    });
    const ids = report.sections.map(s => s.id);
    expect(ids.indexOf('policy-holds')).toBe(ids.indexOf('human-controls') + 1);
    const section = report.sections.find(s => s.id === 'policy-holds')!;
    expect(section.title).toBe("AnA's own holds (Manual) (1)");
    expect(JSON.stringify(section.blocks)).toContain('Searching PubMed for \\"endpoint\\"');
    // In words, not the stored code (review follow-through, objection 12).
    expect(JSON.stringify(section.blocks)).toContain('The person said to run it');
  });

  it('no section when there were no holds', async () => {
    db.assistantRows = [{ metadata: { rounds: 1 }, model: 'claude', created_at: AT }];
    const report = dossierToRenderedReport(await dossier(), {
      reportTypeId: 'lineage',
      reportTypeLabel: 'Lineage',
      status: 'draft' as never,
    });
    expect(report.sections.map(s => s.id)).not.toContain('policy-holds');
  });
});

describe('review follow-through: a corrupt hold is counted, and the report reads plainly', () => {
  it('a malformed hold is counted as unreadable, in the dossier and its XML — never read as none', async () => {
    db.assistantRows = [
      {
        ...manualTurn,
        metadata: { ...manualTurn.metadata, policyHolds: [{ round: 'two' }, manualTurn.metadata.policyHolds[0]] },
      },
    ];
    const d = await dossier();
    expect(d.policyHolds).toHaveLength(1);
    expect(d.policyHoldsUnreadable).toBe(1);
    expect(serializeDocumentLineageDossierXml(d)).toContain('<PolicyHolds count="1" unreadable="1">');
  });

  it('a step replaced before it was shown is not filed as a hold', async () => {
    db.assistantRows = [
      { ...manualTurn, metadata: { ...manualTurn.metadata, policyHolds: [{ ...manualTurn.metadata.policyHolds[0], outcome: 'superseded' }] } },
    ];
    const xml = serializeDocumentLineageDossierXml(await dossier());
    expect(xml).toMatch(/<Hold reason="manual" round="2" turn="1" outcome="superseded" held="false"/);
  });

  it('the trace report names the turn, and says each outcome in words', async () => {
    db.assistantRows = [
      { metadata: { rounds: 2 }, model: 'claude', created_at: AT },
      manualTurn,
    ];
    const report = dossierToRenderedReport(await dossier(), {
      reportTypeId: 'lineage',
      reportTypeLabel: 'Lineage',
      status: 'draft' as never,
    });
    const blocks = JSON.stringify(report.sections.find(s => s.id === 'policy-holds')!.blocks);
    expect(blocks).toContain('"Turn"');
    expect(blocks).toContain('The person said to run it');
    expect(blocks).not.toContain('"continued"');
  });
});

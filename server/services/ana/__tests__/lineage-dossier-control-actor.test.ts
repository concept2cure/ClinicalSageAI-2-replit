/**
 * Who took each human control, in the lineage dossier, its XML and its trace
 * report (AnA detach DT3 review, the blocker's dossier half). The regulatory
 * table was Action/Message/Turn/When, so an administrator's cancel of a
 * colleague's turn read as the document author's own stop. The dossier now
 * resolves each control's actor (services/tenant/actor-names.ts, the one
 * resolver; "user <id>" when the name cannot be read, never "System"), marks
 * an administrator's, and carries the reason they gave.
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
vi.mock('../../tenant/actor-names.js', () => ({
  resolveActorNames: async (ids: Iterable<number | null | undefined>) =>
    new Map([...ids].filter((id): id is number => id === 11 || id === 3).map(id => [id, { name: id === 11 ? 'Dana Okafor' : 'Sam Rivera', email: null }])),
  actorLabel: (names: Map<number, { name: string | null }>, id: number | null | undefined) =>
    id == null ? null : names.get(id)?.name ?? `user ${id}`,
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

const AT = '2026-10-22T10:00:00.000Z';
const turn = {
  metadata: {
    humanControls: [
      { action: 'interject', round: 1, at: AT, byUserId: 3, message: 'Look at 2024 too' },
      { action: 'cancel', round: 2, at: AT, byUserId: 11, byRole: 'admin', reason: 'Wrong agency.' },
      { action: 'pause', round: 2, at: AT, byUserId: 44 },
    ],
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
  db.assistantRows = [turn];
});

describe('the dossier says who took each control', () => {
  it("the asker's steer by name, the administrator's cancel by name and role with the reason, an unnamed actor by id", async () => {
    const d = await dossier();
    expect(d.humanControls.map(c => [c.action, c.by, c.byRole, c.reason])).toEqual([
      ['interject', 'Sam Rivera', null, null],
      ['cancel', 'Dana Okafor', 'administrator', 'Wrong agency.'],
      ['pause', 'user 44', null, null],
    ]);
  });

  it('the XML carries by, byRole and the reason', async () => {
    const xml = serializeDocumentLineageDossierXml(await dossier());
    expect(xml).toMatch(/<Control action="cancel"[^>]* by="Dana Okafor" byRole="administrator"/);
    expect(xml).toContain('<Reason>Wrong agency.</Reason>');
  });

  it("the trace report's table has a By column: the cancel is the administrator's, never the author's", async () => {
    const report = dossierToRenderedReport(await dossier(), {
      reportTypeId: 'lineage',
      reportTypeLabel: 'Lineage',
      status: 'draft' as never,
    });
    const section = report.sections.find(s => s.id === 'human-controls')!;
    const table = section.blocks[0] as { kind: string; columns: string[]; rows: unknown[][] };
    expect(table.columns).toEqual(['Action', 'By', 'Message', 'Turn', 'When']);
    expect(table.rows[1]).toEqual(['cancel', 'Dana Okafor (administrator)', 'Reason: Wrong agency.', 1, AT]);
    expect(table.rows[0][1]).toBe('Sam Rivera');
  });
});

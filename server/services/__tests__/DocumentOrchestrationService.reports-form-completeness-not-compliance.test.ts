/**
 * The 510(k) form run reports each form's completeness under that name.
 *
 * What it used to do (until 2026-10-15): every form record the run returned —
 * and POST /api/fda-forms/project/:projectId/generate-all and POST
 * /api/510k/:projectId/generate-documents answered with — carried the form's
 * field completeness twice, once as `completeness` and once as
 * `complianceScore`. Nothing assesses compliance; the figure is the share of
 * the form's fields filled. (The fda510k_documents column keeps its name.)
 *
 * The database and the Part 11 signer lookup are replaced; the service and the
 * form generator are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableName } from 'drizzle-orm';

const S = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  failInsertOf: null as string | null,
  inserted: [] as Array<{ table: string; values: Record<string, unknown> }>,
}));

function chain(table: unknown) {
  const name = getTableName(table as Parameters<typeof getTableName>[0]);
  const read = (): Promise<Array<Record<string, unknown>>> => Promise.resolve(S.rows[name] ?? []);
  return { where: () => Object.assign(read(), { limit: () => read() }) };
}

vi.mock('../../db', () => ({
  db: {
    select: () => ({ from: (table: unknown) => chain(table) }),
    execute: async () => ({ rows: [] }),
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        if (S.failInsertOf && values.documentType === S.failInsertOf) {
          throw new Error('SENTINEL-DB-DETAIL: insert into fda_510k_documents failed');
        }
        S.inserted.push({ table: getTableName(table as Parameters<typeof getTableName>[0]), values });
      },
    }),
  },
}));
vi.mock('../part11/resolve-signer-identity.js', () => ({
  resolveSignerIdentity: async () => ({ name: 'Dana Doe', email: 'dana@example.com', title: null }),
}));
vi.mock('../part11/signature-persistence.js', () => ({ drizzleSignatureClient: () => ({}) }));

import DocumentOrchestrationService from '../DocumentOrchestrationService';


beforeEach(() => {
  S.failInsertOf = null;
  S.inserted.length = 0;
  S.rows = {
    fda_510k_projects: [{ id: 1, projectId: 12, organizationId: 7, deviceName: 'Widget', deviceClassification: 'Class II', productCode: 'ABC', metadata: {} }],
    projects: [{ id: 12 }],
    organizations: [{ id: 7, name: 'Acme Devices' }],
    project_charters: [{ k510Config: { submissionSubtype: 'special' } }],
    fda_510k_stage_progress: [],
    fda_510k_data_mappings: [],
  };
});

describe('DocumentOrchestrationService.orchestrateDocumentGeneration — completeness', () => {
  it('returns completeness, and no complianceScore, on each form', async () => {
    const result = await new DocumentOrchestrationService().orchestrateDocumentGeneration('1', '5', '7');
    expect(result.forms).toHaveLength(4);
    for (const f of result.forms) {
      expect(typeof f.completeness).toBe('number');
      expect(f).not.toHaveProperty('complianceScore');
    }
  });
});

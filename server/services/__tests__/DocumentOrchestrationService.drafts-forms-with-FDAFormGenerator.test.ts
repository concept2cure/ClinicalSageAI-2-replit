/**
 * The 510(k) form run behind POST /api/510k/:projectId/generate-documents and
 * POST /api/fda-forms/project/:projectId/generate-all drafts the four forms with
 * the canonical builders in FDAFormGenerator, and says which forms it did not
 * produce.
 *
 * Until 2026-10-15 DocumentOrchestrationService.generateFDAForms drafted them
 * with CrossReferenceMapper (server/services/CrossReferenceMapping.ts) — a
 * second implementation of the same four forms, separate from the one
 * POST /api/fda-forms/.../generate/:formType uses — so a fix to one builder
 * (the 3514 submission type, the 3654 attestations and signature slot) did not
 * reach the other. A form it could not draft or save was logged and dropped,
 * and the run still answered success: true, "FDA forms generated successfully".
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

const FORM_TYPES = ['FDA_3514', 'FDA_3601', 'FDA_3881', 'FDA_3654'];

function savedForms() {
  return S.inserted.filter((r) => r.table === 'fda_510k_documents').map((r) => r.values);
}

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

describe('DocumentOrchestrationService.orchestrateDocumentGeneration', () => {
  it('drafts each of the four forms with FDAFormGenerator', async () => {
    const result = await new DocumentOrchestrationService().orchestrateDocumentGeneration('1', '5', '7');

    const forms = savedForms();
    expect(forms.map((f) => f.documentType)).toEqual(FORM_TYPES);
    for (const f of forms) {
      // The canonical builders render HTML; the deleted mapper wrote plain text.
      expect(String(f.content)).toContain('<!DOCTYPE html>');
    }
    const f3514 = forms.find((f) => f.documentType === 'FDA_3514')!;
    // Read from the project charter by FDAFormGenerator only.
    expect(f3514.formData).toMatchObject({ submissionType: 'Special 510(k)', deviceName: 'Widget' });
    expect(forms.find((f) => f.documentType === 'FDA_3881')!.documentName).toBe('FDA Form 3881 - Indications for Use Statement');
    expect(result).toMatchObject({ success: true, failed: [] });
    expect(result.forms).toHaveLength(4);
  });

  it('names a form it could not save, with a fixed reason, and does not call the run a success', async () => {
    S.failInsertOf = 'FDA_3601';
    const result = await new DocumentOrchestrationService().orchestrateDocumentGeneration('1', '5', '7');

    expect(result.success).toBe(false);
    expect(result.failed).toEqual([{ formType: 'FDA_3601', reason: expect.any(String) }]);
    expect(result.forms.map((f: { documentType: string }) => f.documentType)).toEqual(['FDA_3514', 'FDA_3881', 'FDA_3654']);
    expect(result.message).toMatch(/FDA_3601/);
    expect(result.message).not.toMatch(/successfully/);
    expect(JSON.stringify(result)).not.toContain('SENTINEL-DB-DETAIL');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../routes/c2c/actions', () => ({
  recordGovernedAction: vi.fn(async () => ({ actionId: 'action', auditId: 'audit', sha256Chain: 'chain' })),
}));
vi.mock('../../part11/signature-persistence', async (original) => ({
  ...await original<typeof import('../../part11/signature-persistence')>(),
  persistGovernedActionSignature: vi.fn(async () => ({ id: 51, signedAt: new Date('2026-10-14T12:00:00Z') })),
}));

import { approveQmsDocumentSigned } from '../document-approval-signature';

const params = { orgId: 9, userId: 7, documentId: 11, reason: 'Independent content review', meaning: 'APPROVED',
  effectiveDate: null, authenticationMethod: 'password' as const, secondFactorVerified: false, ipAddress: null };
const base = { id: 11, organization_id: 9, doc_number: 'SOP-001', title: 'Document control', doc_type: 'sop',
  category: null, version: '1.0', status: 'in_review', author_id: 3, artifact_id: null, metadata: {} };

describe('controlled QMS approval requires the actual canonical document', () => {
  const query = vi.fn();
  beforeEach(() => { query.mockReset(); });

  it('refuses a registry-only record before any approval or signature write', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM organization_users ou')) return { rows: [{ role: 'reviewer' }] };
      if (sql.includes('SELECT * FROM qms_documents')) return { rows: [base] };
      if (sql.includes('UPDATE qms_documents')) return { rows: [{ ...base, status: 'effective' }] };
      return { rows: [] };
    });
    await expect(approveQmsDocumentSigned({ query }, params)).rejects.toMatchObject({ code: 'QMS_CONTENT_REQUIRED' });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("SET status = 'effective'"))).toBe(false);
  });

  it.each([
    { sections: undefined },
    { sections: [] },
    { sections: [{ key: 'procedure', label: 'Procedure' }] },
    { sections: [{ key: 'procedure', label: 'Procedure', body: '   ' }] },
  ])('refuses incomplete legacy controlled text %# before any signed writes', async ({ sections }) => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM organization_users ou')) return { rows: [{ role: 'reviewer' }] };
      if (sql.includes('SELECT * FROM qms_documents')) return { rows: [{ ...base, metadata: { sections } }] };
      return { rows: [] };
    });
    await expect(approveQmsDocumentSigned({ query }, params)).rejects.toMatchObject({ code: 'QMS_CONTENT_REQUIRED' });
    expect(query.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT)/.test(String(sql)))).toBe(false);
  });

  it('refuses a bound document whose sections contain only empty editor markup', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM organization_users ou')) return { rows: [{ role: 'reviewer' }] };
      if (sql.includes('SELECT * FROM qms_documents')) return { rows: [{ ...base, authoring_document_id: '00000000-0000-4000-8000-000000000011' }] };
      if (sql.includes('FROM authoring_documents')) return { rows: [{ id: '00000000-0000-4000-8000-000000000011', tenant_id: 9, title: base.title, client_program_id: '00000000-0000-4000-8000-000000000012' }] };
      if (sql.includes('FROM authoring_sections')) return { rows: [{ id: 'section', code: 'qms-purpose', title: 'Purpose', content: '<p><br></p>', order_index: 1 }] };
      if (sql.includes('UPDATE qms_documents')) return { rows: [{ ...base, status: 'effective' }] };
      return { rows: [] };
    });
    await expect(approveQmsDocumentSigned({ query }, params)).rejects.toMatchObject({ code: 'QMS_CONTENT_REQUIRED' });
  });
});

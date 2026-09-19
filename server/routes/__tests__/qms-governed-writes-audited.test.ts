/**
 * Every governed write in /api/mdx/qms records a 21 CFR Part 11 §11.10(e) row.
 *
 * Found by the adversarial review of the WO-16C #133 conversion of this router,
 * and it is a DIFFERENT defect from #133. #133 is "a row is written and its
 * outcome discarded". This is "no row is written at all": six of the nineteen
 * governed writes in server/routes/mdx-qms.ts recorded nothing, so there was no
 * outcome to discard and the conversion had nothing to convert.
 *
 * The six, and why each one is an audit-trail subject rather than a preference:
 *
 *   POST   /qms/documents                 creates a CONTROLLED document — the
 *                                         object the whole QMS exists to govern
 *   PATCH  /qms/documents/:id             edits one, including its status,
 *                                         effective date and review date
 *   PATCH  /qms/suppliers/:id             changes an approved supplier's standing
 *   POST   /qms/internal-audits           logs an internal audit (ISO 13485 §8.2.4)
 *   PATCH  /qms/internal-audits/:id       changes its findings or closure
 *   POST   /qms/nonconforming             records a nonconforming product
 *                                         (§8.3 / 21 CFR 820.90)
 *
 * Their siblings in the same file — document approve / revise / retire, training
 * acknowledgment, supplier create, management review, nonconforming disposition,
 * and the whole change-control register — all record one. The gap reads as an
 * oversight rather than a decision, and nothing in the file says otherwise.
 *
 * This suite asserts the row exists and carries the right action and resource,
 * and that its outcome reaches the envelope like every other audited route here.
 * It is written to fail if any of the six loses its audit row again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

const AUDIT = vi.hoisted(() => ({
  entries: [] as Array<Record<string, unknown>>,
  result: { persisted: true, chained: true } as Record<string, unknown>,
}));
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: async (entry: Record<string, unknown>) => {
    AUDIT.entries.push(entry);
    return AUDIT.result;
  },
}));

import mdxQmsRouter from '../mdx-qms';

function app(org: number | null = 9, userId = 7) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: userId };
    next();
  });
  a.use('/api/mdx', mdxQmsRouter);
  return a;
}

beforeEach(() => {
  query.mockReset();
  AUDIT.entries.length = 0;
  AUDIT.result = { persisted: true, chained: true };
});

/** Every pool.query resolves to one row — enough for a tenant gate then a write. */
function rowsAlways(row: Record<string, unknown>) {
  query.mockResolvedValue({ rows: [row], rowCount: 1 });
}

const CASES: Array<{
  name: string;
  method: 'post' | 'patch';
  path: string;
  body: Record<string, unknown>;
  action: string;
  resourceType: string;
  row: Record<string, unknown>;
  status: number;
}> = [
  {
    name: 'creating a controlled document',
    method: 'post',
    path: '/api/mdx/qms/documents',
    body: { docNumber: 'SOP-001', title: 'Design control', docType: 'sop' },
    action: 'mdx.qms.document.create',
    resourceType: 'qms_document',
    row: { id: 11, organization_id: 9, doc_number: 'SOP-001', version: '1.0', status: 'draft' },
    status: 201,
  },
  {
    name: 'editing a controlled document',
    method: 'patch',
    path: '/api/mdx/qms/documents/11',
    body: { title: 'Design control, rev B' },
    action: 'mdx.qms.document.update',
    resourceType: 'qms_document',
    row: { id: 11, organization_id: 9, title: 'Design control, rev B', version: '1.0' },
    status: 200,
  },
  {
    name: 'changing an approved supplier',
    method: 'patch',
    path: '/api/mdx/qms/suppliers/5',
    body: { approvalStatus: 'conditional' },
    action: 'mdx.qms.supplier.update',
    resourceType: 'qms_supplier',
    row: { id: 5, organization_id: 9, approval_status: 'conditional' },
    status: 200,
  },
  {
    name: 'logging an internal audit',
    method: 'post',
    path: '/api/mdx/qms/internal-audits',
    body: { auditNumber: 'IA-2026-01', scope: 'Design controls' },
    action: 'mdx.qms.internal_audit.create',
    resourceType: 'qms_internal_audit',
    row: { id: 3, organization_id: 9, audit_number: 'IA-2026-01' },
    status: 201,
  },
  {
    name: 'changing an internal audit',
    method: 'patch',
    path: '/api/mdx/qms/internal-audits/3',
    body: { status: 'closed' },
    action: 'mdx.qms.internal_audit.update',
    resourceType: 'qms_internal_audit',
    row: { id: 3, organization_id: 9, status: 'closed' },
    status: 200,
  },
  {
    name: 'recording a nonconforming product',
    method: 'post',
    path: '/api/mdx/qms/nonconforming',
    body: { ncNumber: 'NCR-2026-01', description: 'Seal failure on lot 42' },
    action: 'mdx.qms.nonconforming.create',
    resourceType: 'qms_nonconforming_product',
    row: { id: 8, organization_id: 9, ncr_number: 'NCR-2026-01' },
    status: 201,
  },
];

describe('every governed QMS write records a §11.10(e) row', () => {
  for (const c of CASES) {
    it(`${c.name} writes an audit row`, async () => {
      rowsAlways(c.row);

      const res = await request(app())[c.method](c.path).send(c.body);

      expect(res.status, JSON.stringify(res.body)).toBe(c.status);
      expect(
        AUDIT.entries.map(e => e.action),
        `${c.path} recorded no audit row`,
      ).toContain(c.action);
      const entry = AUDIT.entries.find(e => e.action === c.action)!;
      expect(entry.tenantId).toBe(9);
      expect(entry.userId).toBe(7);
      expect(entry.resourceType).toBe(c.resourceType);
      expect(String(entry.resourceId)).toBeTruthy();
    });

    it(`${c.name} carries the row's outcome in the envelope`, async () => {
      // The #133 contract: a lost row must not be indistinguishable from a
      // written one, on these six exactly as on the thirteen already converted.
      AUDIT.result = {
        persisted: false,
        code: 'AUDIT_ROW_NOT_PERSISTED',
        message: 'The 21 CFR Part 11 audit entry for this action could not be written.',
      };
      rowsAlways(c.row);

      const res = await request(app())[c.method](c.path).send(c.body);

      expect(res.status).toBe(c.status);
      expect(res.body.meta?.auditTrail?.persisted).toBe(false);
      expect(res.body.meta?.auditTrail?.code).toBe('AUDIT_ROW_NOT_PERSISTED');
      // The governed row is still returned — the write stands.
      expect(res.body.data).toBeTruthy();
    });
  }
});

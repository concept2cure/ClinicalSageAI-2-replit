/**
 * The section approval as a §11 signature: who may sign (§11.10(g)), what
 * meaning was declared (§11.50(a)(3)), and that what is signed is current —
 * neither stale nor drifted from the sources it was compiled from — and the
 * export gate's refusal of an approved section that drifted afterwards.
 * Evidence: docs/evidence/CMC-M3-GA/2026-10-04/02-module3-approval-is-a-signature/
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockVerifyReauth = vi.fn();
// The project guard's own refusals are in module3ProjectScope.test.ts.
vi.mock('../../../services/cmc/project-membership', () => ({
  projectBelongsToTenant: async () => true,
}));
const mockRecordGoverned = vi.fn();
// The §11.10(g) authority gate (cmc-signer.ts); its own role read is proven in
// cmc-sign-signature-row.test.ts. Here: that the approve route asks it first.
const mockRefusedAuthority = vi.fn();
vi.mock('../cmc-signer', () => ({
  refusedWithoutSigningAuthority: (...a: unknown[]) => mockRefusedAuthority(...a),
}));

vi.mock('../../../db', () => ({
  getPool: () => ({
    query: mockQuery,
    connect: async () => ({ query: mockQuery, release: vi.fn() }),
  }),
}));

// The section-approve endpoint re-authenticates the signer (§11) before any
// write, then records a hash-chained governed action; mock both so the gate +
// audit are exercised without bcrypt/MFA or a real ledger.
vi.mock('../../../routes/c2c/actions', () => ({
  verifyReauth: (...a: unknown[]) => mockVerifyReauth(...a),
  recordGovernedAction: (...a: unknown[]) => mockRecordGoverned(...a),
}));

// Canonical governed-state evaluation is a heavyweight service call the approve
// handler makes before the write transaction; stub it so the test drives only
// the SQL/audit sequence (the handler already degrades gracefully if it fails).
const fabricThrows = false;
vi.mock('../../../services/governed-ana-execution.js', () => ({
  buildCanonicalGovernedState: async () => {
    if (fabricThrows) throw new Error('fabric unavailable');
    return { ok: true };
  },
}));

import router from '../module3OperatingSystemRoutes';

// The compiler's record of a fully established section. Approved fixtures carry
// it so each test below fails on the ONE defect it names, not on completeness.
/* A compiled section as the compiler now stores it: its completeness, its
   missing inputs and its TABLES. The `tables` key is what placement reads back
   (an absent key means "compiled before tables were carried", which placement
   and now the export gate both refuse), so a fixture standing for a complete,
   filable section must carry it. */
const COMPLETE = { completeness: 100, missingInputs: [] as string[], tables: [] as unknown[] };

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  // Route reads `req.tenantId || req.tenantContext?.organizationId` — the
  // x-organization-id header isn't converted to either field without the
  // tenant-context middleware. Set both directly so the route hands off
  // org id 101 to the SQL layer.
  req.tenantId = 101;
  req.tenantContext = { organizationId: 101 };
  req.user = { id: 1, organizationId: 101 };
  next();
});
app.use('/api/cmc/module3-os', router);

beforeEach(() => {
  mockQuery.mockReset();
  // Statements a test does not script (the lineage drift reads, for one)
  // answer with no rows: no drift, nothing found.
  mockQuery.mockResolvedValue({ rows: [] });
  mockRefusedAuthority.mockReset();
  mockRefusedAuthority.mockResolvedValue(false);
  mockVerifyReauth.mockReset();
  mockVerifyReauth.mockResolvedValue({ ok: true });
  mockRecordGoverned.mockReset();
  mockRecordGoverned.mockResolvedValue({ actionId: 'act-1', sha256Chain: 'deadbeef' });
});

/** The SQL verbs the mock actually executed, in order. */
const executedVerbs = () =>
  mockQuery.mock.calls.map(c => String(c[0]).trim().split(/\s+/)[0].toUpperCase());

describe('Module 3 section approval: who may sign, and with what meaning', () => {
  it('refuses a signer without signing authority before the password and before any SQL (§11.10(g))', async () => {
    mockRefusedAuthority.mockImplementationOnce(async (res: any) => {
      res.status(403).json({ success: false, error: 'ESIGNATURE_NO_AUTHORITY' });
      return true;
    });
    const res = await request(app)
      .post('/api/cmc/module3-os/sections/proj-1/3.2.P.5/approve')
      .send({ reason: 'approve', meaning: 'approval', reauth: { password: 'ok' } });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ESIGNATURE_NO_AUTHORITY');
    expect(mockRefusedAuthority).toHaveBeenCalledWith(expect.anything(), { userId: 1, orgId: 101 });
    expect(mockVerifyReauth).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockRecordGoverned).not.toHaveBeenCalled();
  });

  it('refuses an undeclared signature meaning before the password and before any write', async () => {
    const res = await request(app)
      .post('/api/cmc/module3-os/sections/proj-1/3.2.P.5/approve')
      .send({ reason: 'approve', meaning: 'TECHNICAL_APPROVAL', reauth: { password: 'ok' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_SIGNATURE_MEANING');
    expect(mockVerifyReauth).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('Module 3 section approval: what is signed is current, and is what is filed', () => {
  it('freezes the narrative that is filed into the approved version, so the signature covers it', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // contradiction check
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'sec-1',
            deterministic_json: COMPLETE,
            narrative_text: 'The drug product is a tablet.',
            approval_state: 'draft',
            stale: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // drift: lineage
      .mockResolvedValueOnce({ rows: [] }) // drift: sources
      .mockResolvedValueOnce({ rows: [{ max_version: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ver-1' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ name: 'Q. Approver', email: 'q@example.test', title: 'Head of CMC' }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 9001, signed_at: new Date() }] });
    const res = await request(app)
      .post('/api/cmc/module3-os/sections/proj-1/3.2.P.1/approve')
      .send({ reason: 'approve', meaning: 'approval', reauth: { password: 'ok' } });
    expect(res.status).toBe(200);
    const versionInsert = mockQuery.mock.calls.find(c =>
      String(c[0]).includes('INSERT INTO cmc_module3_section_versions')
    );
    expect(JSON.parse(String(versionInsert![1][4]))).toEqual({
      ...COMPLETE,
      narrativeText: 'The drug product is a tablet.',
    });
  });

  it('refuses to approve a stale section — 409, rolled back, the stale flag left standing', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // contradiction check
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'sec-4',
            deterministic_json: COMPLETE,
            narrative_text: 'x',
            approval_state: 'draft',
            stale: true,
            stale_reason: 'Source data updated: specification (SPEC-1)',
          },
        ],
      });
    const res = await request(app)
      .post('/api/cmc/module3-os/sections/proj-1/3.2.S.4/approve')
      .send({ reason: 'approve', meaning: 'approval', reauth: { password: 'ok' } });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('SECTION_STALE');
    expect(res.body.detail).toContain('SPEC-1');
    expect(executedVerbs()).toContain('ROLLBACK');
    expect(executedVerbs()).not.toContain('INSERT');
    expect(executedVerbs()).not.toContain('UPDATE');
    expect(mockRecordGoverned).not.toHaveBeenCalled();
  });
});

describe('drift from the sources: refused at approval and at export', () => {
  it('refuses to approve a section whose lineage has drifted from its sources, whoever changed them', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // contradiction check
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'sec-4',
            deterministic_json: COMPLETE,
            narrative_text: 'x',
            approval_state: 'draft',
            stale: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            sectionKey: '3.2.S.4',
            sourceObjectId: 'so-1',
            hashAtCompile: 'h-at-compile',
            compiledAt: '2026-10-01T00:00:00Z',
            liveId: 'so-1',
            liveHash: 'h-now',
            sourceType: 'specification',
            sourceKey: 'SPEC-1',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/cmc/module3-os/sections/proj-1/3.2.S.4/approve')
      .send({ reason: 'approve', meaning: 'approval', reauth: { password: 'ok' } });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('SECTION_DRIFTED');
    expect(res.body.detail).toContain('specification "SPEC-1" changed after compile');
    expect(executedVerbs()).toContain('ROLLBACK');
    expect(executedVerbs()).not.toContain('INSERT');
    expect(mockRecordGoverned).not.toHaveBeenCalled();
  });
  it('blocks final export when an approved section drifted from its sources without anyone setting stale', async () => {
    // Two of the three writers of cmc_source_objects never set the stale flag,
    // so the flag reads clean here. The lineage does not: the specification
    // §3.2.S.4 was compiled from has changed since.
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            section_key: '3.2.S.4',
            approval_state: 'approved',
            stale: false,
            deterministic_json: COMPLETE,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            sectionKey: '3.2.S.4',
            sourceObjectId: 'so-1',
            hashAtCompile: 'h-at-compile',
            compiledAt: '2026-10-01T00:00:00Z',
            liveId: 'so-1',
            liveHash: 'h-now',
            sourceType: 'specification',
            sourceKey: 'SPEC-1',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/cmc/module3-os/guard/final-export/proj-1').send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('no longer match their source data');
    expect(res.body.error).toContain('§3.2.S.4: specification "SPEC-1" changed after compile');
    expect(res.body.data.staleSections).toBe(0);
    expect(res.body.data.driftedApprovedSections).toEqual([
      { sectionKey: '3.2.S.4', reasons: ['specification "SPEC-1" changed after compile'] },
    ]);
  });
});

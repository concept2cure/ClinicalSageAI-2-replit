import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockVerifyReauth = vi.fn();
const mockRecordGoverned = vi.fn();

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
let fabricThrows = false;
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

describe('module3OperatingSystemRoutes', () => {
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
    mockVerifyReauth.mockReset();
    mockVerifyReauth.mockResolvedValue({ ok: true });
    mockRecordGoverned.mockReset();
    mockRecordGoverned.mockResolvedValue({ actionId: 'act-1', sha256Chain: 'deadbeef' });
  });

  it('returns readiness snapshot from canonical section/contradiction data', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ approval_state: 'approved', stale: false, deterministic_json: COMPLETE }, { approval_state: 'draft', stale: true }] })
      .mockResolvedValueOnce({ rows: [{ severity: 'critical', status: 'open' }, { severity: 'high', status: 'resolved' }] })
      // Provenance coverage: sections with no cmc_section_lineage row.
      .mockResolvedValueOnce({ rows: [{ n: 0 }] });

    const res = await request(app).get('/api/cmc/module3-os/readiness/proj-1');

    expect(res.status).toBe(200);
    expect(res.body.data.totalSections).toBe(2);
    expect(res.body.data.approvedSections).toBe(1);
    expect(res.body.data.staleSections).toBe(1);
    expect(res.body.data.openCriticalContradictions).toBe(1);
    expect(res.body.data.exportReady).toBe(false);
  });

  it('returns section provenance feed', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'sec-1' }] })
      .mockResolvedValueOnce({ rows: [{ eventType: 'compiled' }, { eventType: 'approved' }] });

    const res = await request(app).get('/api/cmc/module3-os/provenance/proj-1/3.2.P.5');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('resolves contradiction and returns resolved status', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'c-1', projectId: 'proj-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch('/api/cmc/module3-os/contradictions/c-1/resolve')
      .send({ resolutionNote: 'closed after CAPA' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('resolved');
  });

  it('section approve fails closed with 401 when re-authentication fails — before any DB write', async () => {
    mockVerifyReauth.mockResolvedValueOnce({ ok: false, error: 'REAUTH_REQUIRED' });

    const res = await request(app)
      .post('/api/cmc/module3-os/sections/proj-1/3.2.P.5/approve')
      .send({ reason: 'approve for filing', reauth: { password: 'wrong' } });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('REAUTH_REQUIRED');
    // The gate runs before the contradiction check and any write — no SQL ran.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('section approve proceeds past the re-auth gate on success (then honors the contradiction block)', async () => {
    mockVerifyReauth.mockResolvedValueOnce({ ok: true });
    // First query after the gate is the critical-contradiction check.
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'c-1' }] });

    const res = await request(app)
      .post('/api/cmc/module3-os/sections/proj-1/3.2.P.5/approve')
      .send({ reason: 'approve for filing', reauth: { password: 'right', totp: '123456' } });

    expect(mockVerifyReauth).toHaveBeenCalledWith(1, { password: 'right', totp: '123456' });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Critical contradictions');
  });

  it('approves a section atomically and records a hash-chained governed action (§11)', async () => {
    mockVerifyReauth.mockResolvedValueOnce({ ok: true });
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // contradiction check: none critical
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'sec-1', deterministic_json: COMPLETE, approval_state: 'draft' }] }) // section
      .mockResolvedValueOnce({ rows: [{ max_version: 2 }] }) // version max
      .mockResolvedValueOnce({ rows: [{ id: 'ver-3' }] }) // insert version
      .mockResolvedValueOnce({}) // update section
      .mockResolvedValueOnce({}) // provenance event
      /* persistGovernedActionSignature runs on the same client, inside the same
         transaction: it looks the signer up for the §11.50 printed name (failing
         closed when the user cannot be resolved) and inserts the
         electronic_signatures row. Those two queries were missing from this
         sequence, so the mock ran dry at the signer lookup and the handler 500'd
         on `signer.rows` — the assertions below were measuring an
         under-specified mock rather than the endpoint. (The §11.70 binding needs
         no query here: this caller passes an explicit content digest over the
         version snapshot it just wrote.) */
      .mockResolvedValueOnce({ rows: [{ name: 'Q. Approver', email: 'q@example.test', title: 'Head of CMC' }] }) // signer snapshot
      .mockResolvedValueOnce({ rows: [{ id: 9001, signed_at: new Date() }] }) // electronic_signatures insert
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .post('/api/cmc/module3-os/sections/proj-1/3.2.P.5/approve')
      .send({
        reason: 'Approved after review of the executed batch and CoA.',
        meaning: 'review',
        reauth: { password: 'ok' },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.versionNumber).toBe(3);
    expect(res.body.approvedVersionId).toBe('ver-3');
    // The governed-action ledger was written inside the transaction, and its
    // chain is returned to the caller.
    expect(mockRecordGoverned).toHaveBeenCalledTimes(1);
    const governedArg = mockRecordGoverned.mock.calls[0][1];
    expect(governedArg).toMatchObject({ orgId: 101, userId: 1, command: 'sign', domain: 'cmc' });
    expect(governedArg.target).toBe('cmc_module3_section:proj-1/3.2.P.5');
    /* §11.50(a)(3): the signed record carries the meaning the SIGNER declared.
       This endpoint used to write the constant 'approval' regardless, so a
       signature applied as a review was recorded as an approval. */
    expect(governedArg.payload).toMatchObject({ meaning: 'review' });
    expect(res.body.governance).toEqual({ actionId: 'act-1', sha256Chain: 'deadbeef' });
    // The write ran as a transaction: BEGIN … COMMIT bracket the section writes.
    const executed = mockQuery.mock.calls.map((c) => String(c[0]).trim().split(/\s+/)[0].toUpperCase());
    expect(executed).toContain('BEGIN');
    expect(executed).toContain('COMMIT');
  });

  /** The SQL verbs the mock actually executed, in order. */
  const executedVerbs = () =>
    mockQuery.mock.calls.map((c) => String(c[0]).trim().split(/\s+/)[0].toUpperCase());

  it('refuses to approve a section whose own compiled record is incomplete — 409, rolled back, nothing written', async () => {
    // Re-auth passes and no critical contradiction is open: the ONLY defect is
    // that §3.2.P.6 compiled at 0% with two required inputs missing. Found
    // live: 21/21 sections approved, three of them at 0%, and the signer was
    // never told. The gate refuses such a project at export; the approval
    // must refuse it first, with the same rule.
    mockVerifyReauth.mockResolvedValueOnce({ ok: true });
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // contradiction check: none critical
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 'sec-6',
          deterministic_json: { completeness: 0, missingInputs: ['containerClosureDescription', 'suitabilityJustification'] },
          approval_state: 'draft',
        }],
      }) // section
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await request(app)
      .post('/api/cmc/module3-os/sections/proj-1/3.2.P.6/approve')
      .send({ reason: 'approve for filing', meaning: 'approval', reauth: { password: 'ok' } });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    // The refusal names the section, its completeness and every missing input.
    expect(res.body.error).toContain('3.2.P.6');
    expect(res.body.error).toMatch(/0% complete/);
    expect(res.body.error).toContain('containerClosureDescription');
    expect(res.body.error).toContain('suitabilityJustification');
    expect(res.body.data).toEqual({
      completeness: 0,
      missingInputs: ['containerClosureDescription', 'suitabilityJustification'],
    });
    // The transaction was opened, the section read, and then ROLLED BACK: no
    // version row, no section flip, no provenance event, no COMMIT.
    const verbs = executedVerbs();
    expect(verbs).toContain('BEGIN');
    expect(verbs).toContain('ROLLBACK');
    expect(verbs).not.toContain('INSERT');
    expect(verbs).not.toContain('UPDATE');
    expect(verbs).not.toContain('COMMIT');
    // And no governed action / signature was recorded.
    expect(mockRecordGoverned).not.toHaveBeenCalled();
  });

  it('refuses to approve a section that was never scored by the compiler (no completeness at all)', async () => {
    // `deterministic_json: {}` is what a row looks like when it never went
    // through the composer. That is "nothing established", not "complete" —
    // the same reading the export gate applies.
    mockVerifyReauth.mockResolvedValueOnce({ ok: true });
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'sec-1', deterministic_json: '{}', approval_state: 'draft' }] })
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/cmc/module3-os/sections/proj-1/3.2.S.1/approve')
      .send({ reason: 'approve', reauth: { password: 'ok' } });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('3.2.S.1');
    expect(res.body.error).toMatch(/completeness/i);
    expect(res.body.data).toEqual({ completeness: null, missingInputs: [] });
    expect(executedVerbs()).toContain('ROLLBACK');
    expect(executedVerbs()).not.toContain('INSERT');
    expect(mockRecordGoverned).not.toHaveBeenCalled();
  });

  it('GET /sections reports each section\'s compiled completeness and missing inputs', async () => {
    // deterministic_json arrives as a string from raw driver rows and as an
    // object from pooled/mocked clients; both read the same, and an
    // unreadable record reports null / [] — never a number it did not have.
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          sectionKey: '3.2.P.6', sectionPath: '3.2.P.6', stale: false, staleReason: null,
          approvalState: 'approved', updatedAt: '2026-09-01T00:00:00.000Z',
          deterministicJson: JSON.stringify({ completeness: 0, missingInputs: ['containerClosureDescription'] }),
        },
        {
          sectionKey: '3.2.S.1', sectionPath: '3.2.S.1', stale: false, staleReason: null,
          approvalState: 'draft', updatedAt: '2026-09-01T00:00:00.000Z',
          deterministicJson: { completeness: 100, missingInputs: [], name: 'API-1' },
        },
        {
          sectionKey: '3.2.P.1', sectionPath: '3.2.P.1', stale: true, staleReason: 'source changed',
          approvalState: 'draft', updatedAt: '2026-09-01T00:00:00.000Z',
          deterministicJson: 'not json',
        },
      ],
    });

    const res = await request(app).get('/api/cmc/module3-os/sections/proj-1');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0]).toMatchObject({
      sectionKey: '3.2.P.6', approvalState: 'approved', completeness: 0, missingInputs: ['containerClosureDescription'],
    });
    expect(res.body.data[1]).toMatchObject({ sectionKey: '3.2.S.1', completeness: 100, missingInputs: [] });
    expect(res.body.data[2]).toMatchObject({ sectionKey: '3.2.P.1', stale: true, completeness: null, missingInputs: [] });
    // The listing carries the two figures, not the whole compiled blob.
    for (const row of res.body.data) expect(row).not.toHaveProperty('deterministicJson');
  });

  it('source-object upsert accepts every canonical CmcSourceType, not a hand-copied subset', async () => {
    // These five compose real sections (§3.2.S.2 needs process_validation and
    // raw_material_spec; §3.2.S.3/S.4 impurity_profile; §3.2.P.2
    // dissolution_profile; §3.2.P.1 / 3.2.A.3 formulation_record) and the
    // route's own enum used to reject all of them with a 400.
    const previouslyRefused = [
      'process_validation', 'raw_material_spec', 'impurity_profile', 'dissolution_profile', 'formulation_record',
    ];
    for (const sourceType of previouslyRefused) {
      mockQuery.mockReset();
      mockQuery.mockResolvedValue({ rows: [{ id: 'so-1', sourceType, sourceKey: 'k', sourceHash: 'h', version: 1 }] });
      const res = await request(app)
        .post('/api/cmc/module3-os/source-objects/proj-1')
        .send({ sourceType, sourceKey: 'k', sourcePayload: { any: 'thing' } });
      expect(res.status, `sourceType ${sourceType}`).toBe(201);
      expect(res.body.data.sourceType).toBe(sourceType);
    }
  });

  it('blocks final export when not all sections approved and critical contradictions open', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ approval_state: 'approved', deterministic_json: COMPLETE }, { approval_state: 'draft' }] })
      .mockResolvedValueOnce({ rows: [{ severity: 'critical', status: 'open' }] })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] });

    const res = await request(app).post('/api/cmc/module3-os/guard/final-export/proj-1').send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Critical contradictions');
  });

  it('blocks final export when an approved section went stale afterwards (isStale gate)', async () => {
    // Every section approved and NO open contradictions — the ONLY blocker is that
    // one approved section was invalidated after sign-off (stale). Before the fix the
    // guard SELECTed no `stale` column and hardcoded isStale:false, so this exported
    // silently, shipping an approval that no longer matched its source.
    mockQuery
      .mockResolvedValueOnce({ rows: [{ approval_state: 'approved', stale: false, deterministic_json: COMPLETE }, { approval_state: 'approved', stale: true, deterministic_json: COMPLETE }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] });

    const res = await request(app).post('/api/cmc/module3-os/guard/final-export/proj-1').send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('stale');
    expect(res.body.data.staleSections).toBe(1);
  });

  it('blocks final export when a section has no recorded source lineage', async () => {
    // Everything approved, nothing stale, no contradictions — the only defect is
    // that one section has no cmc_section_lineage row, so its content cannot be
    // traced to a source. `hasProvenance`/`provenanceComplete` used to be passed
    // to the governed fabric as the literal `true`, which disabled a REQUIRED
    // export check ("audit trail required for export").
    mockQuery
      .mockResolvedValueOnce({ rows: [{ approval_state: 'approved', stale: false, deterministic_json: COMPLETE }, { approval_state: 'approved', stale: false, deterministic_json: COMPLETE }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ n: 1 }] });

    const res = await request(app).post('/api/cmc/module3-os/guard/final-export/proj-1').send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/source lineage|audit trail/i);
    expect(res.body.data.sectionsWithoutProvenance).toBe(1);
  });

  it('readiness is not export-ready when a section has no recorded source lineage', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ approval_state: 'approved', stale: false, deterministic_json: COMPLETE }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ n: 1 }] });

    const res = await request(app).get('/api/cmc/module3-os/readiness/proj-1');
    expect(res.status).toBe(200);
    expect(res.body.data.sectionsWithoutProvenance).toBe(1);
    expect(res.body.data.exportReady).toBe(false);
  });

  it('readiness does not report export-ready when the governed state could not be evaluated', async () => {
    // A fully approved, fully traced project — the ONLY thing missing is a
    // verdict from the governed-decision fabric. The read used to compute
    // exportReady from approvals alone and stamp the degraded state beside it,
    // so the surface showed "export ready" in exactly the state where the gate
    // fails closed and refuses.
    fabricThrows = true;
    try {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ approval_state: 'approved', stale: false, deterministic_json: COMPLETE }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ n: 0 }] });

      const res = await request(app).get('/api/cmc/module3-os/readiness/proj-1');
      expect(res.status).toBe(200);
      expect(res.body.data.governedStateEvaluated).toBe(false);
      expect(res.body.data.exportReady).toBe(false);
    } finally {
      fabricThrows = false;
    }
  });

  it('blocks final export when an approved section compiled incomplete, and names it', async () => {
    // Every section approved, none stale, lineage intact, no contradictions.
    // The only defect: §3.2.P.6 was approved while its own compiled record
    // says 0% complete with required inputs missing. Verified live before
    // this pin: such a project passed the gate and placed a leaf reading
    // "No container closure system is recorded".
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { section_key: '3.2.S.1', approval_state: 'approved', stale: false, deterministic_json: COMPLETE },
          {
            section_key: '3.2.P.6',
            approval_state: 'approved',
            stale: false,
            deterministic_json: { completeness: 0, missingInputs: ['containerClosureDescription'] },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] });

    const res = await request(app).post('/api/cmc/module3-os/guard/final-export/proj-1').send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not complete/i);
    expect(res.body.error).toContain('3.2.P.6');
    expect(res.body.data.incompleteApprovedSections).toEqual(['3.2.P.6']);
  });

  it('readiness is not export-ready when an approved section compiled incomplete', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            section_key: '3.2.P.8',
            approval_state: 'approved',
            stale: false,
            deterministic_json: JSON.stringify({ completeness: 60, missingInputs: ['shelfLifeJustification'] }),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] });

    const res = await request(app).get('/api/cmc/module3-os/readiness/proj-1');
    expect(res.status).toBe(200);
    expect(res.body.data.incompleteApprovedSections).toEqual(['3.2.P.8']);
    expect(res.body.data.exportReady).toBe(false);
  });

  describe('GET /sections/:projectId/:sectionKey — what a signature is actually over', () => {
    /* A §11.50 signature is over CONTENT. The listing route strips the compiled
       blob by design and nothing else served it, so the only thing the product
       could show a signer at the moment of approving §3.2.S.4 was its key, its
       percentage and its missing inputs — a signature over a section NUMBER. */
    it('serves the narrative, the tables and the markdown that will be filed', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM cmc_module3_sections')) {
          return {
            rows: [{
              id: 'sec-1',
              sectionKey: '3.2.S.4',
              sectionPath: '3.2.S.4',
              narrativeText: 'The drug substance specification defines acceptance criteria.  ',
              deterministicJson: {
                completeness: 100,
                missingInputs: [],
                tables: [{ title: 'Acceptance Criteria', headers: ['Test', 'Limit'], rows: [['Assay', '98.0-102.0%']] }],
              },
              stale: false,
              staleReason: null,
              approvalState: 'compiled',
              approvedVersionId: null,
              compiledHash: 'abc123def456789',
              updatedAt: '2026-09-08T00:00:00.000Z',
            }],
          };
        }
        if (sql.includes('cmc_section_lineage')) {
          return { rows: [{ sourceType: 'specification', sourceKey: 'specification:7', sourceHashAtCompile: 'h1', changedSinceCompile: false }] };
        }
        return { rows: [] };
      });

      const res = await request(app).get('/api/cmc/module3-os/sections/p1/3.2.S.4');
      expect(res.status).toBe(200);
      expect(res.body.data.narrative).toContain('acceptance criteria');
      expect(res.body.data.tables).toHaveLength(1);
      expect(res.body.data.tablesUnknown).toBe(false);
      expect(res.body.data.markdown).toContain('## ');
      expect(res.body.data.markdown).toContain('Acceptance Criteria');
      expect(res.body.data.markdown).toContain('98.0-102.0%');
      // Rendered through the one renderer, so the narrative's trailing spaces
      // are trimmed exactly as they are for the leaf and the governed artifact.
      expect(res.body.data.markdown).toContain('criteria.\n\n');
      expect(res.body.data.markdown).not.toContain('criteria.  \n');
      expect(res.body.data.completeness).toBe(100);
      expect(res.body.data.lineage).toHaveLength(1);
    });

    it('says the tables are UNKNOWN for a row compiled before they were stored', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM cmc_module3_sections')) {
          return {
            rows: [{
              id: 'sec-1', sectionKey: '3.2.S.4', sectionPath: '3.2.S.4', narrativeText: 'Body.',
              deterministicJson: { completeness: 100, missingInputs: [] },
              stale: false, staleReason: null, approvalState: 'approved',
              approvedVersionId: 'v1', compiledHash: 'h', updatedAt: null,
            }],
          };
        }
        return { rows: [] };
      });
      const res = await request(app).get('/api/cmc/module3-os/sections/p1/3.2.S.4');
      expect(res.status).toBe(200);
      // Not "no tables" — unknown. The reader is told, rather than shown none.
      expect(res.body.data.tablesUnknown).toBe(true);
      expect(res.body.data.tables).toBeNull();
    });

    it('flags a source that changed since the section was compiled', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM cmc_module3_sections')) {
          return {
            rows: [{
              id: 'sec-1', sectionKey: '3.2.S.4', sectionPath: '3.2.S.4', narrativeText: 'Body.',
              deterministicJson: { completeness: 100, missingInputs: [], tables: [] },
              stale: false, staleReason: null, approvalState: 'compiled',
              approvedVersionId: null, compiledHash: 'h', updatedAt: null,
            }],
          };
        }
        if (sql.includes('cmc_section_lineage')) {
          return {
            rows: [
              { sourceType: 'specification', sourceKey: 'specification:7', sourceHashAtCompile: 'old', changedSinceCompile: true },
              { sourceType: 'method', sourceKey: 'method:2', sourceHashAtCompile: 'same', changedSinceCompile: false },
            ],
          };
        }
        return { rows: [] };
      });
      const res = await request(app).get('/api/cmc/module3-os/sections/p1/3.2.S.4');
      expect(res.body.data.lineage.filter((l: { changedSinceCompile: boolean }) => l.changedSinceCompile)).toHaveLength(1);
    });

    it('404s a section that was never compiled instead of serving an empty document', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const res = await request(app).get('/api/cmc/module3-os/sections/p1/3.2.S.4');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/has not been compiled/);
    });
  });

  describe('POST /sections/:projectId/:sectionKey/refresh — the record is the composer\'s, never the body\'s', () => {
    /* One drug_substance source with only a name: §3.2.S.1 composes at well
       under 100% with missing inputs. The request body claims 100% / none. */
    const SOURCE = { id: 'so-1', sourceType: 'drug_substance', sourcePayload: { name: 'BX-701' }, sourceHash: 'h1' };
    function scriptRefresh(statements: Array<{ text: string; params: unknown[] }>) {
      mockQuery.mockImplementation(async (text: string, params: unknown[] = []) => {
        statements.push({ text, params });
        if (/SELECT id, deterministic_json, approval_state FROM cmc_module3_sections/.test(text)) {
          return { rows: [{ id: 'sec-1', deterministic_json: { completeness: 40, missingInputs: ['manufacturer'] }, approval_state: 'approved' }] };
        }
        if (/FROM cmc_source_objects/.test(text)) return { rows: [SOURCE] };
        if (/FROM regulatory_programs/.test(text)) return { rows: [] };
        if (/INSERT INTO cmc_module3_sections/.test(text)) return { rows: [{ id: 'sec-1' }] };
        return { rows: [], rowCount: 0 };
      });
    }

    it('ignores a body that claims completeness, writes the composed record, rewrites lineage, records the refresh', async () => {
      const statements: Array<{ text: string; params: unknown[] }> = [];
      scriptRefresh(statements);

      const res = await request(app)
        .post('/api/cmc/module3-os/sections/proj-1/3.2.S.1/refresh')
        .send({ deterministicJson: { completeness: 100, missingInputs: [] } });

      expect(res.status).toBe(200);
      expect(res.body.state).toBe('draft');
      // The composer's verdict over one thin source, not the body's claim.
      expect(res.body.completeness).toBeLessThan(100);
      expect(res.body.missingInputs.length).toBeGreaterThan(0);

      const upsert = statements.find(s => /INSERT INTO cmc_module3_sections/.test(s.text))!;
      expect(upsert).toBeTruthy();
      const written = JSON.parse(String(upsert.params[4]));
      expect(written.completeness).toBe(res.body.completeness);
      expect(written.missingInputs).toEqual(res.body.missingInputs);
      expect(written.completeness).not.toBe(100);
      // A refresh returns the section to draft under any approval it carried.
      expect(upsert.text).toMatch(/approval_state = 'draft'/);
      // Lineage is rewritten to the source actually read.
      expect(statements.some(s => /DELETE FROM cmc_section_lineage/.test(s.text) && s.params[1] === 101)).toBe(true);
      const lineage = statements.find(s => /INSERT INTO cmc_section_lineage/.test(s.text))!;
      expect(lineage.params[2]).toBe('so-1');
      // And the event says refreshed, with the prior approval state.
      const event = statements.find(s => /INSERT INTO cmc_provenance_events/.test(s.text))!;
      expect(event.params[3]).toBe('refreshed');
      expect(JSON.parse(String(event.params[4])).priorApprovalState).toBe('approved');
      expect(statements.some(s => s.text === 'COMMIT')).toBe(true);
    });

    it('refuses to refresh a project with no canonical sources rather than writing an empty section', async () => {
      const statements: Array<{ text: string; params: unknown[] }> = [];
      scriptRefresh(statements);
      mockQuery.mockImplementation(async (text: string, params: unknown[] = []) => {
        statements.push({ text, params });
        if (/SELECT id, deterministic_json, approval_state FROM cmc_module3_sections/.test(text)) {
          return { rows: [{ id: 'sec-1', deterministic_json: {}, approval_state: 'draft' }] };
        }
        return { rows: [], rowCount: 0 };
      });

      const res = await request(app).post('/api/cmc/module3-os/sections/proj-1/3.2.S.1/refresh').send({});

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/No canonical source objects/);
      expect(statements.some(s => /INSERT INTO cmc_module3_sections/.test(s.text))).toBe(false);
      expect(statements.some(s => s.text === 'ROLLBACK')).toBe(true);
    });
  });
});

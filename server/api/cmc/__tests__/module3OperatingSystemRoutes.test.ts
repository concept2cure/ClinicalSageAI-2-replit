import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockVerifyReauth = vi.fn();
const mockRecordGoverned = vi.fn();
/* Statements issued on the CHECKED-OUT CLIENT (i.e. inside the route's
   transaction), as opposed to on the pool. Both surfaces share one
   implementation so existing sequences are unaffected; the list only records
   which surface a statement came through. */
const clientStatements: string[] = [];

vi.mock('../../../db', () => ({
  getPool: () => ({
    query: mockQuery,
    connect: async () => ({
      query: (sql: string, params?: unknown[]) => {
        clientStatements.push(String(sql));
        return mockQuery(sql, params);
      },
      release: vi.fn(),
    }),
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
vi.mock('../../../services/governed-ana-execution.js', () => ({
  buildCanonicalGovernedState: async () => ({ ok: true }),
}));

/* The recomposing refresh runs the SAME composition the compile route runs.
   Stub the core composer so the recomposed result is deterministic and can be
   asserted byte-for-byte against what lands in deterministic_json. */
vi.mock('../../../services/module3Composer', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  composeModule3FromCanonicalSources: () => [
    {
      sectionKey: '3.2.P.5',
      sectionPath: '3.2.P.5',
      structuredPayload: { recomposed: true, methods: ['HPLC'] },
      completeness: 40,
      missingInputs: ['method validation'],
      narrativeDraft: 'RECOMPOSED NARRATIVE',
      tables: [],
      lineage: [{ sourceObjectId: 'src-1', sourceHashAtCompile: 'h1' }],
    },
  ],
}));

/* The governed-artifact bridge is a heavyweight downstream write; stub it so the
   test drives only the recompose + persist sequence. Spread the original module:
   place-module3-into-submission — reachable from this router — imports
   `getSectionLabels` from here, and replacing the whole module would leave that
   undefined, turning the next test that reaches placement into an opaque
   TypeError instead of a mock miss. */
vi.mock('../../../services/module3-convergence-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  bridgeCompileToArtifact: async () => ({ bridged: false, reason: 'stubbed', detail: 'test harness' }),
}));

/* The CMC → IND placement seam is exercised end-to-end by its own suite; here
   the route's job is the HTTP translation of its verdict, so stub the service
   and drive each verdict shape through the router. Spread the original so the
   exported skip-reason constant stays real. */
const mockPlaceModule3IntoSubmission = vi.fn();
vi.mock('../../../services/cmc/place-module3-into-submission', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  placeModule3IntoSubmission: (...a: unknown[]) => mockPlaceModule3IntoSubmission(...a),
}));

import router from '../module3OperatingSystemRoutes';

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
    clientStatements.length = 0;
    mockQuery.mockReset();
    mockVerifyReauth.mockReset();
    mockVerifyReauth.mockResolvedValue({ ok: true });
    mockRecordGoverned.mockReset();
    mockRecordGoverned.mockResolvedValue({ actionId: 'act-1', sha256Chain: 'deadbeef' });
    mockPlaceModule3IntoSubmission.mockReset();
  });

  it('returns readiness snapshot from canonical section/contradiction data', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ approval_state: 'approved', stale: false }, { approval_state: 'draft', stale: true }] })
      .mockResolvedValueOnce({ rows: [{ severity: 'critical', status: 'open' }, { severity: 'high', status: 'resolved' }] });

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
      .mockResolvedValueOnce({ rows: [{ id: 'sec-1', deterministic_json: {}, approval_state: 'draft' }] }) // section
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

  it('blocks final export when not all sections approved and critical contradictions open', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ approval_state: 'approved' }, { approval_state: 'draft' }] })
      .mockResolvedValueOnce({ rows: [{ severity: 'critical', status: 'open' }] });

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
      .mockResolvedValueOnce({ rows: [{ approval_state: 'approved', stale: false }, { approval_state: 'approved', stale: true }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/cmc/module3-os/guard/final-export/proj-1').send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('stale');
    expect(res.body.data.staleSections).toBe(1);
  });
  /* ── POST /sections/:projectId/:sectionKey/refresh ────────────────────────
     "Refresh" must RECOMPOSE the section from cmc_source_objects. It must not
     accept composed content from the caller, and it must not clear the stale
     signal without recomposing — the section it writes becomes the frozen
     §11.70-signed approval snapshot and the reviewer-facing completeness. */

  /** Dispatch by SQL shape rather than by call order, so the assertions measure
      which statements ran, not how many. */
  function stubSql(opts: { section?: any; sources?: any[]; programsFail?: boolean }) {
    const section = opts.section ?? { id: 'sec-1', deterministic_json: { composed: true, completeness: 40 }, approval_state: 'approved' };
    mockQuery.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/FROM cmc_source_objects/i.test(text)) return { rows: opts.sources ?? [] };
      if (/FROM cmc_module3_sections/i.test(text)) return { rows: [section] };
      if (/FROM regulatory_programs/i.test(text)) {
        if (opts.programsFail) throw new Error('relation "regulatory_programs" is unavailable');
        return { rows: [] };
      }
      return { rows: [{ id: 'sec-1' }] };
    });
  }

  const updateCalls = () =>
    mockQuery.mock.calls.filter((c) => /UPDATE cmc_module3_sections|INSERT INTO cmc_module3_sections/i.test(String(c[0])));

  it('refresh refuses a caller-supplied deterministicJson body and writes nothing', async () => {
    stubSql({ sources: [{ id: 'src-1', sourceType: 'method', sourcePayload: {}, sourceHash: 'h1' }] });

    const res = await request(app)
      .post('/api/cmc/module3-os/sections/proj-1/3.2.P.5/refresh')
      .send({ deterministicJson: { completeness: 100, missingInputs: [], batchRelease: 'OVERRIDDEN' } });

    expect(res.status).toBe(400);
    // Nothing written: the override never reaches cmc_module3_sections.
    expect(updateCalls()).toHaveLength(0);
    const wrote = JSON.stringify(mockQuery.mock.calls);
    expect(wrote).not.toContain('OVERRIDDEN');
  });

  it('refresh recomposes from canonical sources rather than rewriting the stored payload', async () => {
    stubSql({ sources: [{ id: 'src-1', sourceType: 'method', sourcePayload: {}, sourceHash: 'h1' }] });

    const res = await request(app).post('/api/cmc/module3-os/sections/proj-1/3.2.P.5/refresh').send();

    expect(res.status).toBe(200);
    // (i) The canonical sources were actually read.
    expect(mockQuery.mock.calls.some((c) => /FROM cmc_source_objects/i.test(String(c[0])))).toBe(true);
    // (ii) The write carries the recomposed narrative and hash, not just the JSON.
    const write = updateCalls()[0];
    expect(write).toBeDefined();
    expect(String(write[0])).toMatch(/narrative_text/);
    expect(String(write[0])).toMatch(/compiled_hash/);
    // (iii) The persisted payload IS the recomposition.
    const persisted = (write[1] as any[]).find((p) => typeof p === 'string' && p.trim().startsWith('{'));
    expect(JSON.parse(persisted)).toEqual({
      recomposed: true,
      methods: ['HPLC'],
      completeness: 40,
      missingInputs: ['method validation'],
      // The composed tables are part of the persisted shape now: the narrative
      // cites them, so the row that IND placement reads has to carry them.
      tables: [],
    });
    expect((write[1] as any[]).some((p) => p === 'RECOMPOSED NARRATIVE')).toBe(true);
  });

  it('refresh reports the diff against the bytes it actually writes, not a shorter payload', async () => {
    /* Second refresh of an already-refreshed section: the stored row is the
       PREVIOUS recomposition — including `tables`, which persistComposedSection
       writes — and the new recomposition is byte-identical. The diff must
       therefore be empty. It is not decoration: it is returned to the caller AND
       written into the cmc_provenance_events row for this refresh, so a diff
       computed against a payload missing `tables` makes the audit trail assert
       that a refresh removed a section's tables when it re-wrote them unchanged. */
    stubSql({
      sources: [{ id: 'src-1', sourceType: 'method', sourcePayload: {}, sourceHash: 'h1' }],
      section: {
        id: 'sec-1',
        deterministic_json: {
          recomposed: true,
          methods: ['HPLC'],
          completeness: 40,
          missingInputs: ['method validation'],
          tables: [],
        },
        approval_state: 'approved',
      },
    });

    const res = await request(app).post('/api/cmc/module3-os/sections/proj-1/3.2.P.5/refresh').send();

    expect(res.status).toBe(200);
    expect(res.body.diffSummary).toEqual({
      addedTopLevelKeys: [],
      removedTopLevelKeys: [],
      changedTopLevelKeys: [],
    });
    // And the provenance row records the same honest answer.
    const provenance = mockQuery.mock.calls.find((c) => /INSERT INTO cmc_provenance_events/i.test(String(c[0])));
    expect(provenance).toBeDefined();
    const payload = JSON.parse((provenance![1] as any[]).find((p) => typeof p === 'string' && p.trim().startsWith('{')));
    expect(payload.diffSummary.removedTopLevelKeys).toEqual([]);
  });

  it('refresh runs the best-effort composition reads OUTSIDE its write transaction', async () => {
    /* The regional pass reads regulatory_programs and is allowed to fail. In
       PostgreSQL a failed statement aborts the surrounding transaction, so
       issuing it on the route's checked-out client would make the very next
       write fail with "current transaction is aborted" — the operator would get
       a generic 500 instead of the real cause. It must run on the pool. */
    stubSql({ sources: [{ id: 'src-1', sourceType: 'method', sourcePayload: {}, sourceHash: 'h1' }] });

    const res = await request(app).post('/api/cmc/module3-os/sections/proj-1/3.2.P.5/refresh').send();

    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls.some((c) => /FROM regulatory_programs/i.test(String(c[0])))).toBe(true);
    expect(clientStatements.some((t) => /FROM regulatory_programs/i.test(t))).toBe(false);
    // The writes are still transactional on the client.
    expect(clientStatements.some((t) => /^\s*BEGIN/i.test(t))).toBe(true);
    expect(clientStatements.some((t) => /INSERT INTO cmc_module3_sections/i.test(t))).toBe(true);
  });

  it('refresh does not report a failed composition pass as "section not in the composition rules"', async () => {
    /* The regional pass cannot run. 3.2.R.1.US therefore does not come back
       from composition — but that is our error, not a verdict that the section
       does not apply to this dossier. Answering 409 "not in the Module 3
       composition rules" renders a transient failure as a definitive
       not-applicable finding about the user's filing. */
    stubSql({
      sources: [{ id: 'src-1', sourceType: 'method', sourcePayload: {}, sourceHash: 'h1' }],
      programsFail: true,
    });

    const res = await request(app).post('/api/cmc/module3-os/sections/proj-1/3.2.R.1.US/refresh').send();

    expect(res.status).toBe(503);
    expect(String(res.body.error)).toMatch(/composition pass did not run/i);
    expect(String(res.body.error)).toMatch(/regulatory_programs/);
    expect(String(res.body.error)).not.toMatch(/not in the Module 3 composition rules/i);
    // Nothing was written and the stale signal was left alone.
    expect(updateCalls()).toHaveLength(0);
  });

  it('refresh fails closed when the project has no canonical source objects', async () => {
    stubSql({ sources: [] });

    const res = await request(app).post('/api/cmc/module3-os/sections/proj-1/3.2.P.5/refresh').send();

    expect(res.status).toBe(409);
    expect(String(res.body.error)).toMatch(/no canonical source objects/i);
    // stale / stale_reason are NOT cleared.
    expect(updateCalls()).toHaveLength(0);
  });
  /* POST /place-into-submission — the HTTP face of the placement verdict.
     A placement that filed nothing must not answer 200 {success:true}: an API
     client that reads only `success` would record "Module 3 filed" over a
     sequence with no Module 3 leaves in it. */
  it('answers 409 with the skip reasons when the placement filed nothing', async () => {
    mockPlaceModule3IntoSubmission.mockResolvedValue({
      placed: false,
      refusedBy: 'nothing-placeable',
      error:
        'Nothing was placed — all 2 approved section(s) were skipped. ' +
        '§3.2.S.4: Compiled before section tables were carried; recompile the section before placing.',
      skipped: [
        {
          sectionKey: '3.2.S.4',
          reason: 'Compiled before section tables were carried; recompile the section before placing.',
        },
        { sectionKey: '3.2.P.8', reason: 'No compiled narrative to place.' },
      ],
    });

    const res = await request(app)
      .post('/api/cmc/module3-os/place-into-submission/proj-1')
      .send({ submissionId: 10, sequenceId: 20 });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(String(res.body.error)).toMatch(/Nothing was placed/);
    expect(res.body.skipped).toHaveLength(2);
    expect(res.body.skipped[0].sectionKey).toBe('3.2.S.4');
  });

  it('answers 409 with the gate verdict when the final-export gate refuses placement', async () => {
    mockPlaceModule3IntoSubmission.mockResolvedValue({
      placed: false,
      refusedBy: 'final-export-gate',
      error: '3 section(s) went stale after approval and must be re-approved before final export',
      data: { totalSections: 17, approvedSections: 14, staleSections: 3, openCriticalContradictions: 0, canonicalGovernedState: null },
    });

    const res = await request(app)
      .post('/api/cmc/module3-os/place-into-submission/proj-1')
      .send({ submissionId: 10, sequenceId: 20 });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.data.staleSections).toBe(3);
  });

  it('answers 200 when at least one section was actually filed', async () => {
    mockPlaceModule3IntoSubmission.mockResolvedValue({
      placed: true,
      submissionId: 10,
      sequenceId: 20,
      placements: [
        {
          sectionKey: '3.2.S.1',
          leafSectionCode: 'm3.2.S.1',
          title: 'Module 3 — General Information (§3.2.S.1)',
          coauthorDocumentId: 501,
          leafId: 900,
          tableCount: 0,
        },
      ],
      skipped: [{ sectionKey: '3.2.P.8', reason: 'No compiled narrative to place.' }],
    });

    const res = await request(app)
      .post('/api/cmc/module3-os/place-into-submission/proj-1')
      .send({ submissionId: 10, sequenceId: 20 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.placements).toHaveLength(1);
    expect(res.body.data.skipped).toHaveLength(1);
  });
});

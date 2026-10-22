/**
 * Every /api/grdhe write records the authenticated user, and an executed export
 * records what really happened to its output (audit 2026-10-15, findings 6 and
 * 5's intake).
 *
 * What the code used to do:
 *  - grdheService took the actor from process.env.CURRENT_USER_ID, which
 *    nothing sets, falling back to 'system'. So created_by, updated_by,
 *    completed_by and every audit user_id named no one, and a request whose
 *    token carried no identity wrote anyway.
 *  - POST /exports/:jobId/execute handed completeExportJob the path
 *    `/exports/<tenant>/<file>` for a file nothing writes, and the job row
 *    recorded it, with completed_by 'system' and a completion_signature_hash
 *    over path|'system'|clock: signature-shaped and nobody's. A job listing
 *    several cases was completed with the first case's output only.
 *  - POST /adverse-events stored a case with no stated seriousness as
 *    non-serious (`isSerious ?? false`), and defaulted its case type and report
 *    type, so the exports filed coded facts nobody recorded.
 *
 * The router, the service and the generators are real; only the database
 * handle is mocked. Statements are captured with their bind parameters.
 */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const TENANT = '3f2a8c1e-7b4d-4e9a-9c2f-1a2b3c4d5e6f';
const JOB = '11111111-2222-4333-8444-555555555555';
const AE = '22222222-3333-4444-8555-666666666666';
const ACTOR = 'qa.lead@sponsor.example';

const state = vi.hoisted(() => ({
  statements: [] as Array<{ sql: string; params: unknown[]; inTx: boolean }>,
  sourceEntityIds: [] as string[],
}));

vi.mock('../../db', async () => {
  const { PgDialect } = await import('drizzle-orm/pg-core');
  const dialect = new PgDialect();
  const stamp = { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z' };
  const rowsFor = (text: string): unknown[] => {
    if (/INSERT INTO regulatory_harmonization\.tenant_data_residency/.test(text)) return [{ id: 'res-1' }];
    if (/FROM regulatory_harmonization\.tenant_data_residency/.test(text)) return [{ id: 'res-1', tenant_id: TENANT, ...stamp }];
    if (/validate_data_region/.test(text)) return [{ is_valid: true }];
    if (/FROM regulatory_harmonization\.mapping_rules/.test(text)) {
      return [{ id: 'rule-1', rule_version: '1', target_format: 'FDA_AE_3500A', required_terminologies: [], ...stamp }];
    }
    if (/create_export_job/.test(text)) return [{ job_id: JOB }];
    if (/UPDATE regulatory_harmonization\.export_jobs/.test(text)) return [{ id: JOB }];
    if (/FROM regulatory_harmonization\.export_jobs/.test(text)) {
      return [{
        id: JOB, tenant_id: TENANT, source_entity_type: 'adverse_event', source_entity_ids: state.sourceEntityIds,
        target_format: 'STAND_IN_RECORDED_FORMAT', target_jurisdiction: 'FDA', status: 'pending', ...stamp,
        terminology_versions: { MEDDRA: { version_id: 'tv-1', version_code: '26.1', display_name: 'MedDRA 26.1', locked_at: stamp.created_at } },
      }];
    }
    if (/INSERT INTO regulatory_harmonization\.terminology_mappings/.test(text)) return [{ id: 'map-1' }];
    if (/INSERT INTO regulatory_harmonization\.canonical_adverse_events/.test(text)) return [{ id: AE }];
    if (/FROM regulatory_harmonization\.canonical_adverse_events/.test(text)) {
      return [{
        id: AE, tenant_id: TENANT, case_number: 'CASE-001', case_version: 1, case_type: 'spontaneous',
        report_type: 'initial', event_date: '2026-03-10', receive_date: '2026-03-15', is_serious: false,
        seriousness_death: false, seriousness_life_threatening: false, seriousness_hospitalization: false,
        seriousness_disability: false, seriousness_congenital_anomaly: false, seriousness_other_medically_important: false,
        // Canonical field names (types.ts); 2026-10-15 this row used product_name,
        // meddra_pt_code and others that no type defines.
        patient: { initials: 'AB', sex: 'F' },
        reactions: [{ term: 'Headache', term_code: '10019211', outcome: 'recovered' }],
        suspect_products: [{ name: 'Examplamab', dose: '5', dose_unit: 'g' }],
        reporter: { qualification_code: '1' }, sender: { sender_organization: 'Example Pharma' }, ...stamp,
      }];
    }
    return [];
  };
  const run = (inTx: boolean) => async (query: Parameters<typeof dialect.sqlToQuery>[0]) => {
    const q = dialect.sqlToQuery(query);
    state.statements.push({ sql: q.sql, params: q.params, inTx });
    return { rows: rowsFor(q.sql) };
  };
  return {
    db: {
      execute: vi.fn(run(false)),
      transaction: vi.fn(async (fn: (tx: { execute: ReturnType<typeof run> }) => Promise<unknown>) =>
        fn({ execute: run(true) })),
    },
  };
});

// 2026-10-15: a format no regulatory_format value records is refused before the
// service (grdhe-export-jobs-refuse-a-format-no-regulatory-format-records.pglite.test.ts).
// This suite tests the writes after that check, so FDA_AE_3500A stands in for a
// format one records, and the job above records that stand-in, which execute
// reads back to the FDA generator. The database is a double; nothing is cast.
vi.mock('../../services/grdhe/exportGenerators', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/grdhe/exportGenerators')>();
  return { ...actual, RECORDED_AS: { ...actual.RECORDED_AS, FDA_AE_3500A: 'STAND_IN_RECORDED_FORMAT' } };
});

import router from '../grdheRoutes';

function app(user: Record<string, unknown> | null) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (user) (req as unknown as { user: unknown }).user = user;
    next();
  });
  a.use('/api/grdhe', router);
  return a;
}

/** A tenant-scoped token that identifies no one: no subject, no email. */
const NOBODY = { organizationUuid: TENANT, organizationId: 7 };
const SIGNED_IN = { id: 42, email: 'QA.Lead@Sponsor.example', organizationUuid: TENANT, organizationId: 7 };

const adverseEvent = {
  tenantId: TENANT, caseNumber: 'CASE-001', caseType: 'spontaneous', reportType: 'initial',
  eventDate: '2026-03-10', receiveDate: '2026-03-15', isSerious: false,
  patient: { sex: 'F' }, reactions: [{ term: 'Headache' }], suspectProducts: [{ name: 'Examplamab' }], reporter: {},
};

const WRITES: Array<[string, string, Record<string, unknown>]> = [
  ['data residency', '/api/grdhe/data-residency', { tenantId: TENANT, primaryRegion: 'US_EAST', allowedProcessingRegions: ['US_EAST'] }],
  ['terminology mapping', '/api/grdhe/terminology/mappings', {
    sourceSystem: 'MEDDRA', sourceVersionId: 'tv-1', sourceCode: '1', sourceDisplay: 'a',
    targetSystem: 'MEDDRA', targetVersionId: 'tv-1', targetCode: '2', targetDisplay: 'b', mappingType: 'equivalent',
  }],
  ['export job', '/api/grdhe/exports', {
    tenantId: TENANT, sourceEntityType: 'adverse_event', sourceEntityIds: [AE], targetFormat: 'FDA_AE_3500A', targetJurisdiction: 'FDA',
  }],
  ['export execution', `/api/grdhe/exports/${JOB}/execute`, {}],
  ['export cancellation', `/api/grdhe/exports/${JOB}/cancel`, { reason: 'duplicate' }],
  ['adverse event', '/api/grdhe/adverse-events', adverseEvent],
];

const writes = () =>
  state.statements.filter(s => /\b(INSERT|UPDATE)\b|create_export_job|log_audit|set_config/.test(s.sql));
const completion = () =>
  state.statements.find(s => /UPDATE regulatory_harmonization\.export_jobs\s+SET\s+status = 'completed'/.test(s.sql));

beforeEach(() => {
  state.statements = [];
  state.sourceEntityIds = [AE];
});

describe('a GRDHE write without an identified actor is refused, and nothing is written', () => {
  it.each(WRITES)('%s', async (_name, path, body) => {
    const r = await request(app(NOBODY)).post(path).send(body);
    expect(r.status, `${path} answered ${r.status}`).toBe(401);
    expect(r.body.error?.code).toBe('ACTOR_REQUIRED');
    expect(writes(), 'no row may be written for a request that identifies no one').toEqual([]);
  });
});

describe('a GRDHE write records the signed-in user, never "system"', () => {
  it.each(WRITES)('%s', async (_name, path, body) => {
    const r = await request(app(SIGNED_IN)).post(path).send(body);
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    const params = writes().flatMap(s => s.params);
    expect(params, 'the actor is a bind parameter of the write').toContain(ACTOR);
    expect(params, "the actor was recorded as 'system'").not.toContain('system');
  });

  it('the generic audit row is attributed in the same transaction that writes it', async () => {
    await request(app(SIGNED_IN)).post('/api/grdhe/adverse-events').send(adverseEvent);
    const actorSet = state.statements.findIndex(s => /set_config\('app\.current_user_id'/.test(s.sql) && s.params.includes(ACTOR));
    const audit = state.statements.findIndex(s => /regulatory_harmonization\.log_audit/.test(s.sql));
    expect(actorSet, 'log_audit reads its actor from app.current_user_id').toBeGreaterThanOrEqual(0);
    expect(state.statements[actorSet].inTx && state.statements[audit].inTx).toBe(true);
    expect(actorSet).toBeLessThan(audit);
  });
});

describe('an executed export records its output as returned inline, not retained', () => {
  it('no output path for a file nothing wrote, no signature-shaped hash, completed by the signed-in user', async () => {
    const r = await request(app(SIGNED_IN)).post(`/api/grdhe/exports/${JOB}/execute`).send({});
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const update = completion();
    expect(update, 'the completion UPDATE').toBeDefined();
    expect(update!.sql, 'a hash over path|actor|clock is not a signature').not.toContain('completion_signature_hash');
    expect(update!.sql).toContain('output_file_path = NULL');
    expect(update!.params.some(p => typeof p === 'string' && p.startsWith('/exports/')), 'a path nothing wrote').toBe(false);
    expect(update!.params).toContain(ACTOR);
    expect(update!.params.some(p => typeof p === 'string' && /returned inline, not retained/i.test(p))).toBe(true);
    const content: string = r.body.data.export.content;
    expect(update!.params).toContain(createHash('sha256').update(content, 'utf8').digest('hex'));
  });

  it('a job listing several cases is refused rather than completed with the first case alone', async () => {
    state.sourceEntityIds = [AE, '33333333-4444-4555-8666-777777777777'];
    const r = await request(app(SIGNED_IN)).post(`/api/grdhe/exports/${JOB}/execute`).send({});
    expect(r.status).toBe(422);
    expect(completion(), 'no completion for output that was never returned').toBeUndefined();
  });
});

describe('an adverse event states its seriousness, case type and report type at intake', () => {
  it.each([
    ['isSerious', { isSerious: undefined }],
    ['isSerious', { isSerious: 'no' }],
    ['caseType', { caseType: undefined }],
    ['reportType', { reportType: undefined }],
  ])('a case without a valid %s is refused, not defaulted', async (field, change) => {
    const r = await request(app(SIGNED_IN)).post('/api/grdhe/adverse-events').send({ ...adverseEvent, ...change });
    expect(r.status).toBe(400);
    expect(r.body.error?.message).toContain(field);
    expect(state.statements.filter(s => /INSERT INTO regulatory_harmonization\.canonical_adverse_events/.test(s.sql))).toEqual([]);
  });
});

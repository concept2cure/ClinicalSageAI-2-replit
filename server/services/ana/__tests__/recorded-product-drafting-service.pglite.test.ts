/** Captured real service/loader/requirements behavior; only the outbound gateway is replaced. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ route: vi.fn(), provider: vi.fn() }));
vi.mock('../../ai-gateway/gateway', async importOriginal => {
  const actual = await importOriginal<typeof import('../../ai-gateway/gateway')>();
  return { ...actual, getGateway: () => ({ route: h.route }) };
});
import { AnaDocumentDraftingService, type DocumentDraftRequest } from '../AnaDocumentDraftingService';
import type { GatewayRequest } from '../../ai-gateway/types';
import type { RequestSqlClient } from '../../../db/requestDb';

const PROGRAM = '11111111-2222-4333-8444-000000000011';
const FOREIGN = '11111111-2222-4333-8444-000000000021';
const service = new AnaDocumentDraftingService();
const reply = () => ({ content: 'Captured section draft.', model: 'test-gateway-model',
  usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 }, latencyMs: 1, finishReason: 'end_turn' });
let pg: PGlite;
const sql: RequestSqlClient = { query: async (text, params) => {
  const { rows } = await pg.query<Record<string, unknown>>(text, params);
  return { rows };
} };
const request = (overrides: Partial<DocumentDraftRequest> = {}): DocumentDraftRequest => ({
  framework: 'ich_clinical', sectionType: '2.5', instructions: 'Use only the supplied evidence and identify gaps.',
  organizationId: 7, userId: 7, projectId: PROGRAM, contextSqlClient: sql, ...overrides,
});
const captured = () => h.route.mock.calls.at(-1)![0] as GatewayRequest;
const prompt = () => captured().messages[1].content as string;

beforeAll(async () => {
  pg = new PGlite();
  // Minimal real relations reached by current ownership, anchor, membership,
  // sharing, charter and filing resolution. No implementation helper is mocked.
  await pg.exec(`
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, deleted_at timestamp,
      product_type text, indication text, program_type text, primary_agency text, metadata jsonb);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, client_workspace_id integer,
      regulatory_program_id uuid, owner_id integer, created_by_id integer, settings jsonb);
    CREATE TABLE organization_users (id serial PRIMARY KEY, organization_id integer, user_id integer, role text);
    CREATE TABLE users (id integer PRIMARY KEY, status text);
    CREATE TABLE organizations (id integer PRIMARY KEY, status text);
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (reviewer_id integer, organization_id integer, artifact_id uuid, status text);
    CREATE TABLE concept2cure_artifacts (id uuid PRIMARY KEY, project_id integer, organization_id integer);
    CREATE TABLE project_charters (id serial PRIMARY KEY, organization_id integer, project_id integer, version integer,
      updated_at timestamptz, approval_status text, therapeutic_area text, development_stage text, target_population text);
  `);
});
beforeEach(async () => {
  await pg.exec(`TRUNCATE regulatory_programs,projects,organization_users,users,organizations,
      project_members,project_charters,project_visibility_settings RESTART IDENTITY;
    INSERT INTO organizations VALUES(7,'active'),(8,'active');
    INSERT INTO users VALUES(5,'active'),(7,'active'),(8,'active');
    INSERT INTO organization_users(organization_id,user_id,role) VALUES(7,5,'member'),(7,7,'member'),(7,8,'member');
    INSERT INTO regulatory_programs VALUES
      ('${PROGRAM}',7,NULL,'monoclonal_antibody','Recorded indication','cta','Health Canada','{}'),
      ('${FOREIGN}',8,NULL,'vaccine','Private indication','ind','FDA','{}');
    INSERT INTO projects VALUES(11,7,71,'${PROGRAM}',5,5,'{}'),(21,8,81,'${FOREIGN}',5,5,'{}');
    INSERT INTO project_visibility_settings VALUES(11,7,'private'),(21,8,'private');
    INSERT INTO project_members VALUES(11,7,7,'use','active');
    INSERT INTO project_charters(organization_id,project_id,version,updated_at,approval_status,
        therapeutic_area,development_stage,target_population)
      VALUES(7,11,3,'2026-10-30T12:00:00Z','draft','oncology','phase_2','Adults'),
        (8,21,1,'2026-10-30T12:00:00Z','approved','neurology','phase_3','Private population');`);
  h.provider.mockReset();
  h.route.mockReset().mockImplementation(async (gateway: GatewayRequest) => {
    await gateway.beforeDispatch?.();
    h.provider();
    return reply();
  });
});
afterAll(async () => { await pg.close(); });

describe('real service drafts from the admitted recorded product and application', () => {
  it('uses the recorded Canadian CTA when the request omits filing type', async () => {
    const result = await service.draftDocument(request({ sectionType: '1.2.1' }));
    expect(result.content).toBe('Captured section draft.');
    expect(captured().metadata).toMatchObject({ submissionType: 'CA_CTA', recordedSubmissionType: 'CA_CTA',
      productContextSource: 'recorded-unqualified', therapeuticProfile: 'oncology', productModality: 'mab' });
    expect(prompt()).toContain('HC/SC 3011');
    expect(prompt()).not.toContain('US IND regional requirements');
    expect(h.provider).toHaveBeenCalledTimes(1);
  });

  it('keeps recorded TA/modality/stage/population above conflicting declarations without calling them scientific evidence', async () => {
    await service.draftDocument(request({ projectContext: { therapeuticArea: 'neurology', modality: 'gene_therapy',
      phase: 'phase_3', population: 'Children', indication: 'Declared indication' } }));
    expect(captured().metadata).toMatchObject({ therapeuticProfile: 'oncology', productModality: 'mab',
      productContextOrigins: { therapeuticArea: 'recorded', modality: 'recorded', phase: 'recorded', population: 'recorded', indication: 'recorded' },
      productContextConflicts: ['therapeuticArea', 'modality', 'phase', 'population', 'indication'] });
    expect(prompt()).toContain('Therapeutic Area Context — Oncology');
    expect(prompt()).not.toContain('Therapeutic Area Context — Neurology');
    expect(prompt()).toContain('"clinicalDevelopmentStage":"phase_2"');
    expect(prompt()).toContain('not scientific evidence');
    expect(prompt()).toContain('PROJECT SOURCE STATUS: UNASSESSED');
  });

  it('preserves an explicit filing choice and states its disagreement with the recorded application', async () => {
    await service.draftDocument(request({ submissionType: 'US_IND' }));
    expect(captured().metadata).toMatchObject({ submissionType: 'US_IND', recordedSubmissionType: 'CA_CTA' });
    expect(prompt()).toContain('Recorded application CA_CTA differs from the requested application US_IND');
  });

  it('keeps ambiguous charters and declared fallback distinct instead of choosing a charter', async () => {
    await pg.query(`INSERT INTO project_charters(organization_id,project_id,version,therapeutic_area)
      VALUES(7,11,4,'cardiology')`);
    await service.draftDocument(request({ projectContext: { therapeuticArea: 'neurology', phase: 'phase_3', population: 'Children' } }));
    expect(prompt()).toContain('Multiple project charters are ambiguous');
    expect(prompt()).toContain('CALLER-DECLARED FALLBACK');
    expect(prompt()).toContain('Product context (recorded advisory, not evidence): {"phase":null,"modality":"mab","population":null}');
    expect(captured().metadata).toMatchObject({ productContextSource: 'mixed-recorded-declared-unqualified',
      productContextCharter: null, productContextOrigins: { therapeuticArea: 'declared', phase: 'declared', modality: 'recorded' } });
  });

  it('keeps a recorded broad biologic unassessed even when a caller supplies a specific modality', async () => {
    await pg.query('UPDATE regulatory_programs SET product_type=$1 WHERE id=$2', ['biologic', PROGRAM]);
    await service.draftDocument(request({ sectionType: '3.2.P.2', projectContext: { modality: 'mab' } }));
    expect(captured().metadata).toMatchObject({ productModality: null, productContextOrigins: { modality: 'unassessed' } });
    expect(prompt()).toContain('PRODUCT MODALITY: UNASSESSED');
    expect(prompt()).not.toContain('Existing modality CMC reference set');
  });

  it.each([
    ['ICH_PROTOCOL', '3', 'record:outline:protocol-m11:'],
    ['ICH_CSR', '12.2', 'record:outline:csr-e3:'],
  ])('carries exact %s identity into the shared clinical profile selection', async (submissionType, sectionType, source) => {
    await service.draftDocument(request({ submissionType, sectionType }));
    expect(captured().metadata?.requirementsSource).toContain(source);
    expect(prompt()).toContain('### Endpoint Considerations');
    expect(prompt()).toContain('### Statistical Considerations');
  });

  it.each([{ projectId: FOREIGN, userId: 7 }, { projectId: PROGRAM, userId: 8 }])('refuses unauthorized project access before dispatch: %j', async scope => {
    await expect(service.draftDocument(request(scope))).rejects.toMatchObject({ status: scope.projectId === FOREIGN ? 404 : 403 });
    expect(h.route).not.toHaveBeenCalled();
    expect(h.provider).not.toHaveBeenCalled();
  });
});

describe('recorded-context streaming is exposed only after currentness is confirmed', () => {
  it('emits successful recorded-project chunks in order after the post-provider check', async () => {
    const events: string[] = [];
    const onStream = vi.fn((chunk: string) => { events.push(`emitted:${chunk}`); });
    let callsBeforeResponse = -1;
    h.route.mockImplementation(async (gateway: GatewayRequest) => {
      await gateway.beforeDispatch?.();
      h.provider();
      gateway.onStream?.('First', { type: 'text' });
      gateway.onStream?.(' second', { type: 'text' });
      callsBeforeResponse = onStream.mock.calls.length;
      events.push('provider-return');
      return reply();
    });
    await service.draftDocument(request({ onStream }));
    expect(callsBeforeResponse).toBe(0);
    expect(events).toEqual(['provider-return', 'emitted:First', 'emitted: second']);
    expect(onStream).toHaveBeenNthCalledWith(1, 'First', { type: 'text' });
    expect(onStream).toHaveBeenNthCalledWith(2, ' second', { type: 'text' });
  });

  it.each([
    ['charter', 'UPDATE project_charters SET version=4 WHERE organization_id=7 AND project_id=11', 409],
    ['access', 'UPDATE project_members SET status=\'revoked\' WHERE organization_id=7 AND project_id=11', 403],
  ] as const)('emits no chunks when %s changes after provider streaming begins', async (_kind, change, status) => {
    const onStream = vi.fn();
    h.route.mockImplementation(async (gateway: GatewayRequest) => {
      await gateway.beforeDispatch?.();
      h.provider();
      gateway.onStream?.('A preliminary chunk', { type: 'text' });
      await pg.query(change);
      gateway.onStream?.(' and a later chunk', { type: 'text' });
      return reply();
    });
    await expect(service.draftDocument(request({ onStream }))).rejects.toMatchObject({ status });
    expect(h.provider).toHaveBeenCalledTimes(1);
    expect(onStream).not.toHaveBeenCalled();
  });

  it('preserves live streaming for an ordinary request without a project', async () => {
    const onStream = vi.fn();
    let callsBeforeResponse = -1;
    h.route.mockImplementation(async (gateway: GatewayRequest) => {
      await gateway.beforeDispatch?.();
      gateway.onStream?.('Live chunk', { type: 'text' });
      callsBeforeResponse = onStream.mock.calls.length;
      return reply();
    });
    await service.draftDocument(request({ projectId: undefined, onStream }));
    expect(callsBeforeResponse).toBe(1);
    expect(onStream).toHaveBeenCalledWith('Live chunk', { type: 'text' });
  });
});

describe('service dispatch and post-provider boundaries re-read actual records', () => {
  it('refuses a charter changed while the outbound call waits, before model effect', async () => {
    h.route.mockImplementation(async (gateway: GatewayRequest) => {
      await pg.query('UPDATE project_charters SET version=4 WHERE organization_id=7 AND project_id=11');
      await gateway.beforeDispatch?.();
      h.provider();
      return reply();
    });
    await expect(service.draftDocument(request())).rejects.toMatchObject({ code: 'DRAFT_PRODUCT_CONTEXT_CHANGED' });
    expect(h.provider).not.toHaveBeenCalled();
  });

  it.each([
    ['charter', 'UPDATE project_charters SET development_stage=\'phase_3\' WHERE organization_id=7 AND project_id=11', 409],
    ['access', 'UPDATE project_members SET status=\'revoked\' WHERE organization_id=7 AND project_id=11', 403],
    ['filing', 'UPDATE regulatory_programs SET primary_agency=\'FDA\' WHERE organization_id=7', 409],
  ] as const)('refuses changed %s after provider response instead of returning draft text', async (_kind, change, status) => {
    h.route.mockImplementation(async (gateway: GatewayRequest) => {
      await gateway.beforeDispatch?.();
      h.provider();
      await pg.query(change);
      return reply();
    });
    await expect(service.draftDocument(request())).rejects.toMatchObject({ status });
    expect(h.provider).toHaveBeenCalledTimes(1);
  });
});

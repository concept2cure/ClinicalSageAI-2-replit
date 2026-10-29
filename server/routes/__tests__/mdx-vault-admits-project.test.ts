/**
 * GET /api/mdx/vault?program_id= refuses a project the caller's organization
 * does not own (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/device-vault-admits-project/).
 *
 * The device vault lists a project's authored artifacts (concept2cure_artifacts,
 * through projects.regulatory_program_id) and its uploaded files
 * (vault.documents, joined to regulatory_programs). Both reads filter by the
 * caller's organization, but neither asked whether the organization owns the
 * live project it was given:
 *
 *   - another organization's project, or one that does not exist, came back
 *     200 with no rows, which the Vault draws as "this project has none";
 *   - the organization's own deleted project came back 200 with its files,
 *     since neither read looks at regulatory_programs.deleted_at;
 *   - an ownership lookup that could not run was never made, so it could not
 *     be reported.
 *
 * The list now asks admitProject (server/lib/admit-project.ts, over
 * programInOrganization) first, as the other device reads do: not owned is
 * 404 and nothing is read; could not check is 503 and nothing is read. The
 * organization-wide list without program_id is unchanged.
 *
 * Nothing here mocks the ownership answer. The real programInOrganization runs
 * against a recording database double, so "nothing read" is what the route
 * actually sent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const ORG = 7;
const OTHER_ORG = 8;
const OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MISSING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
/** The caller organization's own project, soft-deleted. */
const DELETED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

type Sent = { kind: 'ownership' } | { kind: 'read'; table: string; args: unknown[] };

const h = vi.hoisted(() => {
  const state = { owner: new Map<string, number>(), deleted: new Set<string>(), ownershipDown: false };
  /** Every ownership lookup and every vault read, in the order they were sent. */
  const sent: Sent[] = [];
  const query = vi.fn(async (sql: string, args: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> => {
    if (/FROM regulatory_programs WHERE id = \$1 AND organization_id = \$2/.test(sql)) {
      sent.push({ kind: 'ownership' });
      if (state.ownershipDown) throw Object.assign(new Error('connection terminated'), { code: '57P01' });
      const [id, org] = args as [string, number];
      // A deleted project is not admitted when the lookup asks for a live one.
      const live = !(state.deleted.has(id) && /deleted_at IS NULL/.test(sql));
      return { rows: state.owner.get(id) === org && live ? [{ id }] : [] };
    }
    if (/FROM concept2cure_artifacts/.test(sql)) {
      sent.push({ kind: 'read', table: 'concept2cure_artifacts', args });
      return {
        rows: [{
          id: 1, artifact_id: 'artifact_aaa', title: 'Device description', type: 'markdown', category: 'document',
          ctd_section: null, status: 'draft', version: 1, content_hash: null, created_by_id: 5,
          created_at: new Date('2026-10-01T09:00:00Z'), updated_at: new Date('2026-10-02T09:00:00Z'),
          locked_at: null, metadata: null,
        }],
      };
    }
    if (/FROM vault\.documents/.test(sql)) {
      sent.push({ kind: 'read', table: 'vault.documents', args });
      return {
        rows: [{
          id: 'e0e0e0e0-0000-4000-8000-000000000001', document_code: 'DOC-1', document_title: 'Bench report',
          document_type: 'report', version: '1', content_hash: 'f'.repeat(64), file_name: 'bench.pdf',
          file_size: 2048, mime_type: 'application/pdf', classification: 'internal', processing_status: 'PENDING',
          created_by: 5, created_at: new Date('2026-10-01T08:00:00Z'), updated_at: new Date('2026-10-01T08:00:00Z'),
        }],
      };
    }
    return { rows: [] };
  });
  return { state, sent, query };
});

vi.mock('../../db', () => ({
  pool: { query: (sql: string, args?: unknown[]) => h.query(sql, args) },
  getPool: () => ({ query: (sql: string, args?: unknown[]) => h.query(sql, args) }),
  db: {},
}));

import mdxVaultRouter from '../mdx-vault';

function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: ORG };
    next();
  });
  a.use('/api/mdx', mdxVaultRouter);
  return a;
}

const reads = () => h.sent.filter((s): s is Extract<Sent, { kind: 'read' }> => s.kind === 'read');
const ownershipLookups = () => h.sent.filter((s) => s.kind === 'ownership').length;

beforeEach(() => {
  h.query.mockClear();
  h.sent.length = 0;
  h.state.ownershipDown = false;
  h.state.owner.clear();
  h.state.deleted.clear();
  h.state.owner.set(OWN, ORG);
  h.state.owner.set(FOREIGN, OTHER_ORG);
  h.state.owner.set(DELETED, ORG);
  h.state.deleted.add(DELETED);
});

describe('GET /api/mdx/vault?program_id=: the project must be the caller organization\'s', () => {
  it.each([
    ['another organization\'s project', FOREIGN],
    ['a project that does not exist', MISSING],
    ['the organization\'s own deleted project', DELETED],
  ])('refuses %s with 404, and reads no artifact and no upload', async (_what, programId) => {
    const res = await request(app()).get(`/api/mdx/vault?program_id=${programId}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Project not found' });
    expect(ownershipLookups()).toBe(1);
    expect(reads()).toEqual([]);
  });

  it('answers 503 when ownership cannot be checked, and reads nothing', async () => {
    h.state.ownershipDown = true;
    const res = await request(app()).get(`/api/mdx/vault?program_id=${OWN}`);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('VERIFICATION_UNAVAILABLE');
    expect(reads()).toEqual([]);
  });

  it('reads the caller\'s own project after the check, both halves by organization and project', async () => {
    const res = await request(app()).get(`/api/mdx/vault?program_id=${OWN}`);
    expect(res.status).toBe(200);
    expect(h.sent[0]).toEqual({ kind: 'ownership' });
    const [authored, uploaded] = reads();
    expect(authored.table).toBe('concept2cure_artifacts');
    expect(authored.args[0]).toBe(ORG);
    expect(authored.args).toContain(OWN);
    expect(uploaded.table).toBe('vault.documents');
    expect(uploaded.args[0]).toBe(ORG);
    expect(uploaded.args).toContain(OWN);
    expect(res.body.meta).toMatchObject({ count: 2, authored: 1, uploaded: 1 });
  });

  it('leaves the organization-wide list, with no project, as it was', async () => {
    const res = await request(app()).get('/api/mdx/vault');
    expect(res.status).toBe(200);
    expect(ownershipLookups()).toBe(0);
    expect(reads().map((r) => [r.table, r.args])).toEqual([
      ['concept2cure_artifacts', [ORG, 200]],
      ['vault.documents', [ORG, 200]],
    ]);
  });

  it('still refuses a program_id that is not a uuid with 422, before any lookup', async () => {
    const res = await request(app()).get('/api/mdx/vault?program_id=not-a-uuid');
    expect(res.status).toBe(422);
    expect(h.sent).toEqual([]);
  });
});

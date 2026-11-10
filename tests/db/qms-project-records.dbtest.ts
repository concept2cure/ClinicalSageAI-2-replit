/**
 * A project's quality records, read by project (QP2 of
 * docs/design/QMS_IN_PROJECTS_2026-10-30.md). Change controls, nonconforming
 * product and controlled documents already carry the project they were filed
 * under or authored in; their lists now take `program_id`, as the CAPA list
 * already did. Through the real routes, as the runtime role with RLS on:
 *   - each list returns that project's records and nobody else's: not another
 *     project's, not the organization-wide ones;
 *   - a project of another organization is "Project not found" (404), never an
 *     empty list that would read as "this project has no quality records";
 *   - a malformed id is refused (422); without `program_id` each list is as before.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type request from 'supertest';
import {
  A, TAG, call, orgA, orgB, owner, programId,
  provisionTrainingAssignmentFixture, teardownTrainingAssignmentFixture,
} from './qms-training-assignments-fixture';

let otherProject: string;
let foreignProject: string;
const ids = { change: {} as Record<string, number>, nc: {} as Record<string, number>, doc: {} as Record<string, number> };

const program = async (orgId: number, suffix: string) => String((await owner.query(
  `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', 'Invented product') RETURNING id`,
  [`${TAG} ${suffix}`, `${TAG}-${suffix}`.toUpperCase(), orgId])).rows[0].id);
const listed = async (path: string) => {
  const res = await call(A.admin, 'get', path);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.body.data as Array<{ id: number }>).map(row => Number(row.id)).sort((a, b) => a - b);
};

beforeAll(async () => {
  await provisionTrainingAssignmentFixture();
  otherProject = await program(orgA.id, 'other');
  foreignProject = await program(orgB.id, 'foreign');
  for (const [key, project] of [['here', programId], ['other', otherProject], ['orgWide', null]] as const) {
    const change = await call(A.admin, 'post', '/changes', { changeNumber: `${TAG}-CC-${key}`, title: `Invented change ${key}`, ...(project ? { programId: project } : {}) });
    expect(change.status, JSON.stringify(change.body)).toBe(201);
    ids.change[key] = Number(change.body.data.id);
    const nc = await call(A.admin, 'post', '/nonconforming', { ncNumber: `${TAG}-NC-${key}`, description: `Invented nonconformance ${key}`, ...(project ? { programId: project } : {}) });
    expect(nc.status, JSON.stringify(nc.body)).toBe(201);
    ids.nc[key] = Number(nc.body.data.id);
  }
  const authored = await call(A.admin, 'post', '/documents', { title: `${TAG} authored procedure`, docType: 'sop', programId, templateKey: 'sop', reason: 'Author the invented procedure in this project.' });
  expect(authored.status, JSON.stringify(authored.body)).toBe(201);
  ids.doc.here = Number(authored.body.data.id);
  ids.doc.inline = Number((await owner.query(`INSERT INTO qms_documents (organization_id, doc_number, title, doc_type, version, status, metadata)
    VALUES ($1, $2, 'Inline register entry', 'sop', '1.0', 'draft', '{}'::jsonb) RETURNING id`, [orgA.id, `${TAG}-INLINE`])).rows[0].id);
}, 180_000);
afterAll(teardownTrainingAssignmentFixture);

describe('a project’s quality records, by project', () => {
  it('lists the change controls filed under the project, and only those', async () => {
    expect(await listed(`/changes?program_id=${programId}`)).toEqual([ids.change.here]);
    expect(await listed(`/changes?program_id=${otherProject}`)).toEqual([ids.change.other]);
    expect(await listed('/changes')).toEqual(expect.arrayContaining(Object.values(ids.change)));
  });

  it('lists the nonconforming product filed under the project, and only that', async () => {
    expect(await listed(`/nonconforming?program_id=${programId}`)).toEqual([ids.nc.here]);
    expect(await listed(`/nonconforming?program_id=${otherProject}`)).toEqual([ids.nc.other]);
    expect(await listed('/nonconforming')).toEqual(expect.arrayContaining(Object.values(ids.nc)));
  });

  it('lists the controlled documents authored in the project, and no inline register entry', async () => {
    expect(await listed(`/documents?program_id=${programId}`)).toEqual([ids.doc.here]);
    expect(await listed(`/documents?program_id=${otherProject}`)).toEqual([]);
    expect(await listed('/documents')).toEqual(expect.arrayContaining([ids.doc.here, ids.doc.inline]));
  });

  it('answers another organization’s project as not found, and a malformed id as refused, on every list', async () => {
    for (const path of ['/changes', '/nonconforming', '/documents']) {
      const foreign = await call(A.admin, 'get', `${path}?program_id=${foreignProject}`);
      expect(foreign.status, `${path}: ${JSON.stringify(foreign.body)}`).toBe(404);
      expect(foreign.body.data, 'never an empty list').toBeUndefined();
      expect((await call(A.admin, 'get', `${path}?program_id=not-a-project`)).status, path).toBe(422);
    }
  });
});

/** Two actual connections, with the real HTTP writer waiting in PostgreSQL.
 * The fixture starts at verification to isolate closure concurrency; it does
 * not claim to have executed a signed change approval in these cases. */
describe('native change closure and concurrent work', () => {
  let sequence = 0;
  async function verification() {
    const response = await call(A.admin, 'post', '/changes', {
      changeNumber: `${TAG}-CLOSE-${++sequence}`, title: 'Invented native closure concurrency record', programId,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const id = Number(response.body.data.id);
    await owner.query("UPDATE qms_change_controls SET status='verification', implemented_at=now() WHERE id=$1 AND organization_id=$2", [id, orgA.id]);
    return id;
  }
  const closure = (id: number) => call(A.admin, 'post', `/changes/${id}/transition`, {
    to: 'closed', effectivenessReview: 'The retained synthetic acceptance criteria were met.', reason: 'Record the synthetic verification outcome.',
  }).then(response => response);

  async function waitForBlockedMutation(blockerPid: number, minimum = 1) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const result = await owner.query(`WITH RECURSIVE blocked(pid) AS (
          SELECT pid FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))
          UNION SELECT a.pid FROM pg_stat_activity a JOIN blocked b ON b.pid=ANY(pg_blocking_pids(a.pid))
        ) SELECT a.pid FROM pg_stat_activity a JOIN blocked b ON b.pid=a.pid
          WHERE a.state='active' AND a.wait_event_type='Lock' AND a.query LIKE '%UPDATE qms_change_controls%'`, [blockerPid]);
      if (result.rows.length >= minimum) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('The actual QMS writer did not wait on the locked parent record.');
  }

  /* A content edit can no longer race a closure: in verification the content is what the approval signed, and
     updateChange refuses it (CHANGE_EDITABLE_STATES, 2026-11-10). A required record linked meanwhile still can. */
  it('a waiting closure cannot overwrite a concurrent requirement change', async () => {
    const id = await verification();
    const blocker = await owner.connect();
    let pending: Promise<request.Response> | undefined;
    try {
      await blocker.query('BEGIN');
      const pid = Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      await blocker.query('SELECT id FROM qms_change_controls WHERE id=$1 AND organization_id=$2 FOR UPDATE', [id, orgA.id]);
      pending = closure(id);
      await waitForBlockedMutation(pid);
      const service = await import('../../server/services/qms/changeControl.service');
      await service.addLink(orgA.id, id, { linkType: 'validation', linkedRef: `${TAG}-VP-LATE`, relationship: 'requires' }, blocker);
      await blocker.query('COMMIT');
      const response = await pending;
      expect(response.status, JSON.stringify(response.body)).toBe(409);
      const row = (await owner.query('SELECT status,closed_at,verified_at FROM qms_change_controls WHERE id=$1 AND organization_id=$2', [id, orgA.id])).rows[0];
      expect(row).toEqual({ status: 'verification', closed_at: null, verified_at: null });
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await pending?.catch(() => undefined);
    }
  }, 60_000);

  it('a queued link cannot append a requirement after the authenticated closure wins the parent lock', async () => {
    const id = await verification();
    const blocker = await owner.connect();
    let closing: Promise<request.Response> | undefined;
    let linking: Promise<request.Response> | undefined;
    try {
      await blocker.query('BEGIN');
      const pid = Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      await blocker.query('SELECT id FROM qms_change_controls WHERE id=$1 AND organization_id=$2 FOR UPDATE', [id, orgA.id]);
      closing = closure(id);
      await waitForBlockedMutation(pid);
      linking = call(A.admin, 'post', `/changes/${id}/links`, {
        linkType: 'validation', linkedRef: `${TAG}-VP-TOO-LATE`, relationship: 'requires',
      }).then(response => response);
      await waitForBlockedMutation(pid, 2);
      await blocker.query('COMMIT');
      const closed = await closing;
      expect(closed.status, JSON.stringify(closed.body)).toBe(200);
      const refused = await linking;
      expect(refused.status, JSON.stringify(refused.body)).toBe(422);
      expect((await owner.query('SELECT status FROM qms_change_controls WHERE id=$1 AND organization_id=$2', [id, orgA.id])).rows[0].status).toBe('closed');
      expect((await owner.query('SELECT id FROM qms_change_links WHERE change_id=$1 AND organization_id=$2', [id, orgA.id])).rows).toEqual([]);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await Promise.all([closing?.catch(() => undefined), linking?.catch(() => undefined)]);
    }
  }, 60_000);
});

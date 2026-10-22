/**
 * An agency letter names the submission it concerns (gap 6.5 of
 * docs/design/VEEVA_GAP_2026-10-22.md, 2026-10-22).
 *
 * linked_submission_id was stored as the client sent it, unchecked text, and
 * no screen sent it. Now the link must name a live submission of this
 * organisation in the project's own program, and the inbox reads it back with
 * the submission's title. A stored value that names nothing readable (an older
 * row, or a submission since removed) is returned as itself, beside a null
 * submission, never dressed up as a link.
 *
 * The routes are the real ones; the runtime role is APP_DATABASE_URL with RLS
 * on. The fixture is tests/db/commitment-fulfilment-fixture.ts: project X is
 * anchored to program P (submission sub.P), Y to program Q (sub.Q), and B is
 * another organisation's. A project with no program (Z) is refused by project
 * admission before any of this is read, so it has no case here.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  app, as, foreignOrgId, owner, orgId, program, project, projectBase, setupFixture, sub, submission, teardownFixture, users,
} from './commitment-fulfilment-fixture';

const letter = (linkedSubmissionId?: string) => ({
  sourceType: 'uploaded_official_correspondence', communicationType: 'Information request', sourceChannel: 'esg',
  urgency: 'high', responseRequired: true, visibilityTier: 'client_internal',
  ...(linkedSubmissionId === undefined ? {} : { linkedSubmissionId }),
});
const written = async (pid: number) =>
  (await owner.query(`SELECT event_id, linked_submission_id FROM concept2cure_agency_communications WHERE organization_id = $1 AND project_id = $2`, [orgId, pid])).rows;

let foreignSub = 0;
let removedSub = 0;
beforeAll(async () => {
  await setupFixture('letterlink');
  foreignSub = await submission(foreignOrgId, 'their other IND', program.B, users.foreign.id);
  removedSub = await submission(orgId, 'IND withdrawn', program.P, users.signer.id);
  await owner.query(`UPDATE submissions SET deleted_at = now() WHERE id = $1`, [removedSub]);
}, 120_000);
afterAll(teardownFixture);

describe('logging an agency letter against a submission', () => {
  it('links a submission of the project and reads it back with its title', async () => {
    const res = await request(app).post(`${projectBase(project.X)}/agency-communications`).set(as('signer')).send(letter(String(sub.P)));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.linkedSubmissionId).toBe(String(sub.P));
    expect(res.body.data.linkedSubmission).toMatchObject({ id: sub.P, title: expect.stringContaining('IND 123456'), applicationType: 'ind', primaryRegion: 'fda' });
    const list = await request(app).get(`${projectBase(project.X)}/agency-communications`).set(as('signer'));
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    const row = list.body.data.find((c: { id: string }) => c.id === res.body.data.id);
    expect(row).toMatchObject({ linkedSubmissionId: String(sub.P), linkedSubmission: { id: sub.P, applicationType: 'ind' } });
  });

  it.each([
    ['a submission of another program of the organisation', () => String(sub.Q)],
    ["another organisation's submission", () => String(foreignSub)],
    ['a removed submission', () => String(removedSub)],
    ['a submission that does not exist', () => '2147483000'],
  ])('refuses %s, and writes nothing', async (_label, id) => {
    const before = (await written(project.X)).length;
    const res = await request(app).post(`${projectBase(project.X)}/agency-communications`).set(as('signer')).send(letter(id()));
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error.message).toMatch(/not one of this project's submissions/);
    expect((await written(project.X)).length).toBe(before);
  });

  it('refuses a reference that is not a submission id', async () => {
    const res = await request(app).post(`${projectBase(project.X)}/agency-communications`).set(as('signer')).send(letter('IND 123456'));
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error.message).toMatch(/not a submission id/);
  });

  it('logs a letter with no submission as before', async () => {
    const res = await request(app).post(`${projectBase(project.X)}/agency-communications`).set(as('signer')).send(letter());
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.linkedSubmission).toBeNull();
  });

  it('returns an older unchecked value, or another program\'s id, as itself with no submission named', async () => {
    const eventId = `ace_legacy_${Date.now()}`;
    const otherProgram = `ace_legacy_q_${Date.now()}`;
    await owner.query(
      `INSERT INTO concept2cure_agency_communications (event_id, organization_id, project_id, source_type, communication_type, source_channel,
         linked_submission_id, linked_section_codes, linked_artifact_ids, received_date, urgency, response_required, extracted_issues,
         human_review_status, closure_status, audit_metadata, created_at)
       VALUES ($1, $2, $3, 'manual_logged_event', 'Older letter, other program', 'Manually logged', $4, '[]', '[]', now(), 'low', false, '[]',
         'pending_review', 'open', '{"visibilityTier":"client_internal"}', now())`,
      [otherProgram, orgId, project.X, String(sub.Q)],
    );
    await owner.query(
      `INSERT INTO concept2cure_agency_communications (event_id, organization_id, project_id, source_type, communication_type, source_channel,
         linked_submission_id, linked_section_codes, linked_artifact_ids, received_date, urgency, response_required, extracted_issues,
         human_review_status, closure_status, audit_metadata, created_at)
       VALUES ($1, $2, $3, 'manual_logged_event', 'Older letter', 'Manually logged', $4, '[]', '[]', now(), 'low', false, '[]',
         'pending_review', 'open', '{"visibilityTier":"client_internal"}', now())`,
      [eventId, orgId, project.X, `IND 123456 ${removedSub}`],
    );
    const list = await request(app).get(`${projectBase(project.X)}/agency-communications`).set(as('signer'));
    expect(list.body.data.find((c: { id: string }) => c.id === eventId)).toMatchObject({ linkedSubmissionId: `IND 123456 ${removedSub}`, linkedSubmission: null });
    // An id of the organisation's other program, stored before the check, is not read as this project's.
    expect(list.body.data.find((c: { id: string }) => c.id === otherProgram)).toMatchObject({ linkedSubmissionId: String(sub.Q), linkedSubmission: null });
  });
});

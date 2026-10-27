/** Minimal source-only agency tables for isolated Authoring bridge tests.
 * Each test retains its own explicit migration list; no migration is hidden here. */
import { agencyResponseDigest } from '../../services/agency-responses/response-logic';
import { recordGovernedAction } from '../c2c/actions';
import type { JourneyDb } from '../../../tests/golden-journeys/harness';

/** The real typed PGlite executor for services whose SQL contract is generic. */
export function agencyFixtureExecutor(db: Pick<JourneyDb, 'pglite'>) {
  return { query: <R = unknown>(sql: string, params?: unknown[]) => db.pglite.query<R>(sql, params) };
}

/** Seed a historical fixture revision with the actual canonical governed receipt writer. */
export async function seedAgencyResponseReceipt(q: Pick<JourneyDb['pool'], 'query'>, input: {
  organizationId: number; questionId: number; eventId: string; questionRef: string; questionText: string;
  responseText: string; revision: number; userId: number;
}) {
  const digest = agencyResponseDigest({ communicationEventId: input.eventId, questionRef: input.questionRef,
    questionText: input.questionText, responseText: input.responseText });
  const inserted = await q.query(`INSERT INTO agency_question_response_revisions
    (organization_id,question_id,revision,response_text,response_digest,written_by,reason)
    VALUES($1,$2,$3,$4,$5,$6,'Retained historical fixture response') RETURNING id`,
  [input.organizationId, input.questionId, input.revision, input.responseText, digest, input.userId]);
  const row = inserted.rows[0];
  if (!row || typeof row !== 'object' || !('id' in row) || typeof row.id !== 'number') {
    throw new Error('The historical fixture response did not return its recorded revision id.');
  }
  const receipt = await recordGovernedAction(q, { orgId: input.organizationId, userId: input.userId, command: 'update',
    target: `agency-question:${input.questionId}`, domain: 'correspondence', surface: 'communication-center', reason: 'Retained historical fixture response',
    payload: { communicationEventId: input.eventId, questionRef: input.questionRef, responseRevision: input.revision, responseDigest: digest } });
  return { ...receipt, revisionId: row.id };
}

export const AGENCY_EVENT = 'agency-source-event';
export const AGENCY_QUESTION = 701;
export const AGENCY_ANSWER = 'Recorded answer based on the retained source evidence.';
export const AGENCY_RESPONSE_SOURCE_DDL = `CREATE TABLE concept2cure_agency_communications (
  event_id text PRIMARY KEY, organization_id integer, project_id integer, communication_type text,
  source_type text, received_date timestamptz, due_date timestamptz, closure_status text,
  human_review_status text, response_required boolean, audit_metadata jsonb);
CREATE TABLE agency_communication_questions (
  id integer PRIMARY KEY, organization_id integer, project_id integer, communication_event_id text,
  question_ref text, question_text text, discipline text, ctd_section text, response_text text,
  response_revision integer, response_updated_by integer, response_updated_at timestamptz,
  withdrawn_at timestamptz, withdrawal_reason text);
CREATE TABLE agency_question_response_revisions (
  id serial PRIMARY KEY, organization_id integer, question_id integer, revision integer,
  response_text text, response_digest text, written_by integer, written_at timestamptz DEFAULT NOW(), reason text,
  UNIQUE(question_id,revision));`;

/** Additional columns read by the existing answer writer/readback and approval rules. */
export const AGENCY_RESPONSE_WRITEBACK_DDL = `
CREATE TABLE client_workspaces (id integer PRIMARY KEY, organization_id integer);
INSERT INTO client_workspaces VALUES (81,1);
UPDATE projects SET client_workspace_id=81 WHERE organization_id=1;
ALTER TABLE projects ADD COLUMN description text;
ALTER TABLE projects ADD COLUMN metadata jsonb DEFAULT '{}';
ALTER TABLE projects ADD COLUMN created_at timestamptz DEFAULT NOW();
ALTER TABLE projects ADD COLUMN updated_at timestamptz DEFAULT NOW();
ALTER TABLE project_members ADD COLUMN invited_by_id integer;
ALTER TABLE project_members ADD COLUMN accepted_at timestamptz;
ALTER TABLE agency_communication_questions ADD COLUMN severity text DEFAULT 'major';
ALTER TABLE agency_communication_questions ADD COLUMN owner_user_id integer;
ALTER TABLE agency_communication_questions ADD COLUMN created_at timestamptz DEFAULT NOW();
ALTER TABLE agency_communication_questions ADD COLUMN updated_at timestamptz DEFAULT NOW();
ALTER TABLE agency_communication_questions ADD COLUMN withdrawn_by integer;
CREATE TABLE electronic_signatures (
  id serial PRIMARY KEY, organization_id integer, signed_target text, bound_payload_digest text,
  signer_id integer, signer_name text, signed_at timestamptz DEFAULT NOW(), signature_meaning text,
  superseded_by integer, is_valid boolean DEFAULT true);
CREATE TABLE regulatory_commitments (
  id serial PRIMARY KEY, organization_id integer, source_question_id integer, commitment_type text,
  description text, due_date date, fulfilled_date date, regulatory_basis text, status text, deleted_at timestamptz);
`;

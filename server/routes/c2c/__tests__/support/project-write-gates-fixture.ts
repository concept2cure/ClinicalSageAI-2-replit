/**
 * The organization, the route table and the verdict vocabulary of
 * project-write-gates.pglite.test.ts (D6, docs/evidence/D6-PROJECT-WRITE-GATES/
 * 2026-10-29/). Kept beside the suite so the suite reads as its cases.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { is } from 'drizzle-orm';
import { getTableConfig, isPgEnum, PgTable } from 'drizzle-orm/pg-core';
import { C2C_MIGRATION_FILES } from '../../../../../scripts/db/migration-set.mjs';

export type Written = { table: string; rows: number };
export type Outcome = { status: number; code: string | null; message: string; wrote: Written[]; attempted: Written[] };

// ── The organization ─────────────────────────────────────────────────────────

export const ORG_A = 1;
export const ORG_B = 2;
export const A_PROJECT = 401;
export const A_PRIVATE = 402;
export const A_ARCHIVED = 403;
export const B_PROJECT = 501;

export type Actor = { userId: number; orgId: number; role: string };
/** Owner of 401, 402 and 403; an organization member. */
export const A_OWNER: Actor = { userId: 10, orgId: ORG_A, role: 'member' };
export const A_VIEWER: Actor = { userId: 11, orgId: ORG_A, role: 'viewer' };
/** On 401 with use (not edit) permission; on nothing else. */
export const A_COLLEAGUE: Actor = { userId: 12, orgId: ORG_A, role: 'member' };
/** An organization reviewer on no project, with a live assignment on 401's and 402's artifacts. */
export const A_REVIEWER: Actor = { userId: 13, orgId: ORG_A, role: 'reviewer' };
/** An organization approver: everything a manager may (edit every project), and sign. */
export const A_APPROVER: Actor = { userId: 14, orgId: ORG_A, role: 'approver' };

/** The reviewer's and the approver's password: the signed acts re-authenticate against the real bcrypt check. */
export const REVIEWER_PASSWORD = 'correct-horse-battery';
const REVIEWER_HASH = bcrypt.hashSync(REVIEWER_PASSWORD, 4);

const PROJECTS = [A_PROJECT, A_PRIVATE, A_ARCHIVED, B_PROJECT];
const orgOf = (p: number) => (p === B_PROJECT ? ORG_B : ORG_A);
const authorOf = (p: number) => (p === B_PROJECT ? 20 : 10);
const reviewerOf = (p: number) => ({ [A_PROJECT]: 13, [A_PRIVATE]: 13, [A_ARCHIVED]: 14 } as Record<number, number>)[p] ?? 20;

/** The fixture's rows, as one script. */
export function seedSql(): string {
  return `
    INSERT INTO organizations (id, name, slug) VALUES (${ORG_A}, 'Org A', 'org-a'), (${ORG_B}, 'Org B', 'org-b');
    INSERT INTO users (id, name, email, password_hash) VALUES
      (10, 'A owner', 'a-owner@example.test', 'x'), (11, 'A viewer', 'a-viewer@example.test', 'x'),
      (12, 'A colleague', 'a-colleague@example.test', 'x'), (13, 'A reviewer', 'a-reviewer@example.test', '${REVIEWER_HASH}'),
      (14, 'A approver', 'a-approver@example.test', '${REVIEWER_HASH}'), (20, 'B admin', 'b-admin@example.test', 'x');
    INSERT INTO organization_users (organization_id, user_id, role) VALUES
      (${ORG_A}, 10, 'member'), (${ORG_A}, 11, 'viewer'), (${ORG_A}, 12, 'member'), (${ORG_A}, 13, 'reviewer'),
      (${ORG_A}, 14, 'approver'), (${ORG_B}, 20, 'admin');
    INSERT INTO client_workspaces (id, organization_id, name, slug) VALUES
      (100, ${ORG_A}, 'A workspace', 'a-ws'), (200, ${ORG_B}, 'B workspace', 'b-ws');
    INSERT INTO projects (id, organization_id, client_workspace_id, name, type, status, owner_id, created_by_id, metadata) VALUES
      (${B_PROJECT}, ${ORG_B}, 200, 'Org B confidential program', 'IND', 'active', 20, 20, '{}'),
      (${A_PROJECT}, ${ORG_A}, 100, 'A program', 'IND', 'active', 10, 10, '{}'),
      (${A_PRIVATE}, ${ORG_A}, 100, 'A private program', 'IND', 'active', 10, 10, '{}'),
      (${A_ARCHIVED}, ${ORG_A}, 100, 'A archived program', 'IND', 'archived', 10, 10, '{}');
    INSERT INTO project_visibility_settings (organization_id, project_id, visibility) VALUES (${ORG_A}, ${A_PRIVATE}, 'private');
    INSERT INTO project_members (organization_id, project_id, user_id, role, status) VALUES (${ORG_A}, ${A_PROJECT}, 12, 'use', 'active');
    ${PROJECTS.map(p => `
    INSERT INTO concept2cure_artifacts (id, organization_id, project_id, artifact_id, title, content, category, type, status, created_by_id) VALUES
      (${p}, ${orgOf(p)}, ${p}, 'art_${p}', 'Artifact ${p}', '<h1>Scope</h1>', 'document', 'document',
       '${p === A_PRIVATE || p === A_ARCHIVED ? 'review' : 'draft'}', ${authorOf(p)});
    INSERT INTO concept2cure_artifact_versions (organization_id, artifact_id, version, content, content_hash, created_by_id) VALUES
      (${orgOf(p)}, ${p}, 1, '<h1>Scope</h1>', 'sha256-seed-${p}', ${authorOf(p)});
    INSERT INTO concept2cure_review_assignments (assignment_id, artifact_id, organization_id, reviewer_id, assigned_by_id, status) VALUES
      ('asg_${p}', ${p}, ${orgOf(p)}, ${reviewerOf(p)}, ${authorOf(p)}, 'pending');
    INSERT INTO concept2cure_review_comments (comment_id, artifact_id, organization_id, version, comment, user_id, user_name) VALUES
      ('cmt_${p}', ${p}, ${orgOf(p)}, 1, 'Seeded comment', ${authorOf(p)}, 'Seeder');
    INSERT INTO project_tasks (id, organization_id, project_id, name, status) VALUES
      (${p}1, ${orgOf(p)}, ${p}, 'Task ${p}', 'todo'), (${p}2, ${orgOf(p)}, ${p}, 'Second task ${p}', 'todo');`).join('')}
  `;
}

// ── The writes, each with its verdict ────────────────────────────────────────

/**
 * write: the canonical check in write mode (current role, edit permission, not archived).
 * review: the same check in review mode (current role, not archived; the read
 *   policy, so an assignment admits). read: read mode; the request changes no
 *   project record.
 */
export type Mode = 'write' | 'review' | 'read';
export type WriteRoute = { method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; mode: Mode; body?: Record<string, unknown> };

export const P = '/api/concept2cure/projects/:projectId';
export const ID = '/api/concept2cure/projects/:id';
export const LETTER = `${P}/agency-communications/:eventId`;
export const ART = `${P}/artifacts/:artifactId`;
/** The governed contract the artifact writers resolve: an IND section. */
export const IND = { metadata: { submissionProgram: 'ind', clientTrack: 'biotech' } };

export const WRITES: readonly WriteRoute[] = [
  // reviews.ts
  { method: 'POST', path: `${ART}/review-threads`, mode: 'review', body: { title: 'Gate probe thread' } },
  { method: 'POST', path: `${ART}/review-tasks`, mode: 'review', body: { title: 'Gate probe task' } },
  // communication-center.ts (and agency-responses.ts, registered on its router)
  { method: 'POST', path: `${P}/submission-center/items`, mode: 'write', body: { title: 'Gate probe item' } },
  { method: 'PATCH', path: `${P}/submission-center/items/:itemId/status`, mode: 'write', body: { status: 'ready' } },
  { method: 'POST', path: `${P}/authority-profiles`, mode: 'write' },
  { method: 'POST', path: `${P}/agency-communications`, mode: 'write' },
  { method: 'PATCH', path: `${LETTER}/advance`, mode: 'write' },
  { method: 'POST', path: `${P}/agency-communications/:recordId/legal-documents`, mode: 'write' },
  { method: 'POST', path: `${P}/submission-center/items/:recordId/legal-documents`, mode: 'write' },
  { method: 'POST', path: `${LETTER}/questions`, mode: 'write' },
  { method: 'PATCH', path: `${LETTER}/questions/:questionId`, mode: 'write' },
  { method: 'PUT', path: `${LETTER}/questions/:questionId/response`, mode: 'write' },
  { method: 'POST', path: `${LETTER}/questions/:questionId/withdraw`, mode: 'write' },
  { method: 'POST', path: `${LETTER}/no-response-required`, mode: 'write' },
  { method: 'POST', path: `${LETTER}/questions/:questionId/approve`, mode: 'write' },
  { method: 'POST', path: `${LETTER}/questions/:questionId/commitments`, mode: 'write' },
  { method: 'POST', path: `${P}/commitments/:commitmentId/fulfill`, mode: 'write' },
  { method: 'PATCH', path: `${LETTER}/questions/:questionId/owner`, mode: 'write' },
  { method: 'POST', path: `${LETTER}/response-package`, mode: 'write' },
  { method: 'POST', path: `${P}/publishops/services`, mode: 'write' },
  { method: 'PATCH', path: `${P}/publishops/services/:serviceId/status`, mode: 'write' },
  // tasks.ts
  { method: 'POST', path: `${P}/tasks`, mode: 'write', body: { name: 'Gate probe task' } },
  { method: 'PUT', path: `${P}/tasks/:taskId`, mode: 'write', body: { name: 'Renamed by the gate probe' } },
  { method: 'DELETE', path: `${P}/tasks/:taskId`, mode: 'write' },
  { method: 'POST', path: `${P}/tasks/bulk`, mode: 'write', body: { submissionType: 'IND' } },
  { method: 'POST', path: `${P}/tasks/assess`, mode: 'read' },
  // conversations.ts
  { method: 'POST', path: `${P}/conversations`, mode: 'write', body: { title: 'Gate probe' } },
  { method: 'POST', path: `${P}/conversations/:conversationId/messages`, mode: 'write', body: { content: 'Gate probe' } },
  { method: 'PATCH', path: `${P}/conversations/:conversationId`, mode: 'write', body: { title: 'Gate probe' } },
  { method: 'DELETE', path: `${P}/conversations/:conversationId`, mode: 'write' },
  // exports.ts
  { method: 'POST', path: `${P}/submission-package`, mode: 'read' },
  // artifacts.ts
  { method: 'POST', path: `${P}/artifacts`, mode: 'write', body: { type: 'document', category: 'document', title: 'Gate probe', content: '<p>Gate probe content</p>' } },
  { method: 'PUT', path: ART, mode: 'write', body: { content: '<p>Changed by the gate probe</p>' } },
  { method: 'PUT', path: `${ART}/placement`, mode: 'write', body: { operation: 'place', toSection: '2.5', reason: 'Gate probe placement', ...IND } },
  { method: 'POST', path: `${ART}/audit-report/export`, mode: 'write' },
  { method: 'PUT', path: `${ART}/status`, mode: 'review', body: { status: 'review' } },
  { method: 'PUT', path: `${ART}/ctd-section`, mode: 'write', body: { ctdSection: '2.5', ...IND } },
  { method: 'POST', path: `${ART}/rollback`, mode: 'write', body: { targetVersion: 1 } },
  { method: 'POST', path: `${ART}/comments`, mode: 'review', body: { comment: 'Gate probe comment' } },
  { method: 'PUT', path: `${ART}/comments/:commentId/resolve`, mode: 'review' },
  { method: 'POST', path: `${ART}/reviewers`, mode: 'write', body: { reviewerIds: [12] } },
  { method: 'DELETE', path: `${ART}/reviewers/:assignmentId`, mode: 'write' },
  { method: 'POST', path: `${ART}/reviewers/:assignmentId/remind`, mode: 'write' },
  { method: 'POST', path: `${ART}/reviews/submit`, mode: 'review', body: { decision: 'approve' } },
  // haq-sessions.ts
  { method: 'PUT', path: `${P}/haq-session`, mode: 'write', body: { questions: [{ id: 'q1', text: 'Gate probe question' }] } },
  // program-twin.ts
  { method: 'PUT', path: `${P}/cmc`, mode: 'write', body: { drugSubstance: { substanceName: 'Gate probe API' } } },
  // project-knowledge.ts
  { method: 'POST', path: `${P}/linked`, mode: 'write' },
  { method: 'PATCH', path: `${P}/knowledge`, mode: 'write' },
  // governance-ops.ts
  { method: 'POST', path: `${P}/governance/decisions/:decisionId/transition`, mode: 'write', body: { action: 'review' } },
  // knowledge-sources.ts
  { method: 'POST', path: `${P}/apps`, mode: 'write' },
  { method: 'DELETE', path: `${P}/apps/:appId`, mode: 'write' },
  // concept2cure.ts (and project-sharing.ts, installed on its router)
  { method: 'PUT', path: ID, mode: 'write', body: { name: 'Renamed by the gate probe' } },
  { method: 'PATCH', path: `${ID}/ownership-preferences`, mode: 'write' },
  { method: 'PUT', path: `${ID}/sharing/members/:userId`, mode: 'write', body: { role: 'edit' } },
  { method: 'DELETE', path: `${ID}/sharing/members/:userId`, mode: 'write' },
  { method: 'PATCH', path: `${ID}/sharing/visibility`, mode: 'write', body: { visibility: 'private' } },
  { method: 'PUT', path: `${P}/collaborators`, mode: 'write', body: { collaborators: [] } },
  { method: 'DELETE', path: ID, mode: 'write' },
  { method: 'POST', path: `${ID}/export`, mode: 'read' },
  { method: 'POST', path: `${ID}/transfer`, mode: 'write', body: { newOwnerId: 12 } },
  // project-schedule-of-events.ts
  { method: 'POST', path: `${ID}/schedule-of-events/generate`, mode: 'write' },
  { method: 'POST', path: `${ID}/schedule-of-events/amend`, mode: 'write', body: { milestone_key: 'ind-submission' } },
  { method: 'POST', path: `${ID}/schedule-of-events/review`, mode: 'write', body: { apply: true } },
  { method: 'POST', path: `${ID}/schedule-of-events/goals/reset`, mode: 'write', body: { goals: [{ title: 'File the IND' }], rationale: 'Gate probe' } },
];

export const key = (route: Pick<WriteRoute, 'method' | 'path'>) => `${route.method} ${route.path}`;
export const routeOf = (method: WriteRoute['method'], path: string) => WRITES.find(r => key(r) === `${method} ${path}`)!;

/** The URL a route is called at for one project: each id names that project's own row. */
export function urlFor(path: string, projectId: number, overrides: Record<string, string> = {}): string {
  const ids: Record<string, string> = {
    projectId: String(projectId), id: String(projectId), artifactId: `art_${projectId}`,
    assignmentId: `asg_${projectId}`, commentId: `cmt_${projectId}`, taskId: `${projectId}1`,
    userId: '12', eventId: `evt_${projectId}`, recordId: `rec_${projectId}`, itemId: `item_${projectId}`,
    questionId: '1', commitmentId: '1', serviceId: `svc_${projectId}`, conversationId: `conv_${projectId}`,
    decisionId: `dec_${projectId}`, appId: '1', ...overrides,
  };
  return path.replace(/:([A-Za-z]+)/g, (_m, name: string) => ids[name] ?? 'x');
}

// ── Who asks, and what the answer must be ────────────────────────────────────

export type Case = 'viewer' | 'use-member' | 'reviewer-no-edit' | 'not-on-private' | 'archived' | 'other-org' | 'owner';
export const CASES: Record<Case, { label: string; actor: Actor; project: number }> = {
  viewer: { label: 'an organization viewer', actor: A_VIEWER, project: A_PROJECT },
  'use-member': { label: 'a project member with use, not edit, permission', actor: A_COLLEAGUE, project: A_PROJECT },
  'reviewer-no-edit': { label: 'an organization reviewer who is not an edit member', actor: A_REVIEWER, project: A_PROJECT },
  'not-on-private': { label: 'a member who is not on the private project', actor: A_COLLEAGUE, project: A_PRIVATE },
  archived: { label: 'an approver, on an archived project', actor: A_APPROVER, project: A_ARCHIVED },
  'other-org': { label: 'the owner, on another organization’s project', actor: A_OWNER, project: B_PROJECT },
  owner: { label: 'the project’s owner (positive control)', actor: A_OWNER, project: A_PROJECT },
};
export const REFUSED: Record<Mode, readonly Case[]> = {
  write: ['viewer', 'use-member', 'reviewer-no-edit', 'not-on-private', 'archived', 'other-org'],
  review: ['viewer', 'not-on-private', 'archived', 'other-org'],
  read: ['not-on-private', 'other-org'],
};

/**
 * Every refusal a project-access check answers with: the canonical one
 * (server/routes/c2c/project-access.ts) and the schedule service's, which
 * admits its writes on the request's own connection.
 */
export const ADMISSION_CODES = new Set([
  'PROJECT_NOT_FOUND', 'PROJECT_WRITE_PERMISSION_DENIED', 'PROJECT_MEMBERSHIP_REQUIRED', 'PROJECT_ARCHIVED',
  'PROJECT_PERMISSION_DENIED', 'PROJECT_WORKSPACE_PERMISSION_DENIED', 'PROJECT_MANAGE_PERMISSION_DENIED',
  'PROJECT_WRITE_ACCESS_DENIED', 'PROJECT_NOT_ACTIVE',
]);
export const ARCHIVED_ANSWERS = ['409 PROJECT_ARCHIVED', '409 PROJECT_NOT_ACTIVE'];

/** Refused by project access: a refusal status, in a project-access check's vocabulary, or a handler's own "Project not found". */
export function refusedByProjectAccess(outcome: Pick<Outcome, 'status' | 'code' | 'message'>): boolean {
  return [403, 404, 409].includes(outcome.status) &&
    ((outcome.code !== null && ADMISSION_CODES.has(outcome.code)) || /^project not found/i.test(outcome.message));
}

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
/** The migrations that give audit_logs its chain and c2c_ana_actions its vocabulary, in the set's own order. */
export const AUDIT_CHAIN_MIGRATIONS = (C2C_MIGRATION_FILES as readonly string[]).filter(file => [
  'migrations/20260527_mutation_primitives.sql',
  'migrations/20260609_audit_hmac_seal.sql',
  'migrations/20260921_audit_logs_chain_seq.sql',
  'db/migrations/20260730_c2c_ana_actions_command_vocab.sql',
].includes(file));

/**
 * Every public table and enum `schema` declares, as `drizzle-kit push` creates
 * them. Left out: tables in another schema, a second declaration of a table
 * name, and a table whose index name another table already holds (drizzle-kit
 * refuses the whole schema over one); a table on a type PGlite lacks (pgvector)
 * fails to create and is absent.
 */
export function publicSchemaDeclarations(schema: Record<string, unknown>): Record<string, unknown> {
  const declared: Record<string, unknown> = {};
  const tableNames = new Set<string>();
  const indexOwner = new Map<string, string>();
  for (const [name, value] of Object.entries(schema)) {
    if (isPgEnum(value)) { declared[name] = value; continue; }
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    if ((config.schema && config.schema !== 'public') || tableNames.has(config.name)) continue;
    const indexes = config.indexes.map(i => i.config.name).filter((n): n is string => Boolean(n));
    if (indexes.some(n => indexOwner.has(n) && indexOwner.get(n) !== config.name)) continue;
    for (const n of indexes) indexOwner.set(n, config.name);
    tableNames.add(config.name);
    declared[name] = value;
  }
  return declared;
}

